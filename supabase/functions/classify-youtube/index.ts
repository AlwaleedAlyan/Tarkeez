// Deno Edge Function — runs on Supabase Functions runtime.
// Deploy with: `pnpm exec supabase functions deploy classify-youtube`
// Secrets required: YOUTUBE_API_KEY, GEMINI_API_KEY
//
// Contract:
//   POST { videoId: string }   (Authorization: Bearer <user JWT> required)
//   → 200 { isEducational: boolean, reason: string }
//   → 400 { error: string }   malformed request
//   → 401 { error: string }   missing/invalid auth token
//   → 429 { error, retryAfterSeconds }   per-user rate limit exceeded
//   → 502 { error: string }   upstream (YouTube/Gemini) failure
//   → 503 { error: string }   rate-limit backend unavailable (fail-closed)

// @ts-expect-error — Deno std lives on a URL at runtime; TS sees no module.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// @ts-expect-error — Deno-style relative import with explicit .ts extension.
import { HttpError, rateLimit, requireUserId } from "../_shared/guard.ts";

// @ts-expect-error — Deno is a runtime global on Supabase Functions.
const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY") ?? "";
// @ts-expect-error — see above.
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

// Per-user throttle for the paid YouTube Data + Gemini calls. Verdicts are
// cached client-side, so genuine usage is far below this.
// @ts-expect-error — Deno is a runtime global on Supabase Functions.
const RATE_LIMIT_MAX = Number(Deno.env.get("RATE_LIMIT_MAX") ?? "30");
const RATE_LIMIT_WINDOW_SECONDS = Number(
  // @ts-expect-error — Deno is a runtime global on Supabase Functions.
  Deno.env.get("RATE_LIMIT_WINDOW_SECONDS") ?? "3600",
);

const EDUCATION_CATEGORY = "27";
// Categories that are clearly not study material. Howto&Style (26) is
// intentionally NOT here — many tutorials live there and should fall to the LLM.
const NEGATIVE_CATEGORIES = new Set(["10", "20", "23", "24"]); // Music, Gaming, Comedy, Entertainment

// Strong educational signals in titles. If any match, instant pass — this
// catches STEM tutorials that get mis-categorized as People & Blogs or
// Howto & Style. Conservative wordlist: only terms whose presence is hard
// to interpret as non-educational.
const EDU_TITLE_RE =
  /\b(algebra|calculus|geometry|trigonometry|physics|chemistry|biology|statistics|tutorial|lesson|lecture|crash course|how to solve|introduction to|fundamentals of|MIT|Stanford|Khan Academy|data structures|algorithm|theorem|derivative|integral)\b/i;

type Verdict = { isEducational: boolean; reason: string };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function classify(videoId: string): Promise<Verdict> {
  const ytRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${YOUTUBE_API_KEY}`,
  );
  if (!ytRes.ok) {
    throw new Error(`YouTube Data API ${ytRes.status}`);
  }
  const yt = await ytRes.json();
  const snippet = yt.items?.[0]?.snippet;
  if (!snippet) return { isEducational: false, reason: "video_not_found" };

  const categoryId: string = String(snippet.categoryId ?? "");
  if (categoryId === EDUCATION_CATEGORY) {
    return { isEducational: true, reason: "category_education" };
  }
  if (NEGATIVE_CATEGORIES.has(categoryId)) {
    return { isEducational: false, reason: `category_negative:${categoryId}` };
  }

  const title = String(snippet.title ?? "");
  if (EDU_TITLE_RE.test(title)) {
    return { isEducational: true, reason: "title_keyword_education" };
  }
  const description = String(snippet.description ?? "").slice(0, 1500);
  const prompt =
    `You are classifying a YouTube video for a study app. Reply with exactly one word: YES or NO.\n` +
    `Question: Is this video educational content suitable for studying?\n\n` +
    `Title: ${title}\nDescription: ${description}`;

  const gemRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 4 },
      }),
    },
  );
  if (!gemRes.ok) {
    throw new Error(`Gemini API ${gemRes.status}`);
  }
  const gem = await gemRes.json();
  const verdict = String(
    gem.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
  )
    .trim()
    .toUpperCase();
  const isEducational = verdict.startsWith("YES");
  return { isEducational, reason: isEducational ? "llm_yes" : "llm_no" };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let videoId: string;
  try {
    // AuthN + per-user rate limit guard the paid API calls (FIX-01).
    const userId = await requireUserId(req);

    const body = await req.json().catch(() => null);
    videoId = typeof body?.videoId === "string" ? body.videoId : "";
    // YouTube IDs are exactly 11 chars of [A-Za-z0-9_-].
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      return json({ error: "valid videoId required" }, 400);
    }

    const quota = await rateLimit(
      userId,
      "classify-youtube",
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (!quota.allowed) {
      throw new HttpError(429, "rate_limited", quota.retryAfterSeconds);
    }
  } catch (e) {
    if (e instanceof HttpError) {
      return json(
        { error: e.message, retryAfterSeconds: e.retryAfterSeconds },
        e.status,
      );
    }
    return json({ error: "guard_failed" }, 500);
  }

  if (!YOUTUBE_API_KEY || !GEMINI_API_KEY) {
    return json({ error: "missing_api_keys" }, 500);
  }

  try {
    const verdict = await classify(videoId);
    return json(verdict);
  } catch (e) {
    const message = e instanceof Error ? e.message : "classification_failed";
    return json({ error: message }, 502);
  }
});
