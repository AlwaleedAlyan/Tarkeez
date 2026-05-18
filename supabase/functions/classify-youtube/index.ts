// Deno Edge Function — runs on Supabase Functions runtime.
// Deploy with: `pnpm exec supabase functions deploy classify-youtube`
// Secrets required: YOUTUBE_API_KEY, GEMINI_API_KEY
//
// Contract:
//   POST { videoId: string }
//   → 200 { isEducational: boolean, reason: string }
//   → 400 { error: string }

// @ts-expect-error — Deno std lives on a URL at runtime; TS sees no module.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// @ts-expect-error — Deno is a runtime global on Supabase Functions.
const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY") ?? "";
// @ts-expect-error — see above.
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const EDUCATION_CATEGORY = "27";
// Categories that are clearly not study material. Howto&Style (26) is
// intentionally NOT here — many tutorials live there and should fall to the LLM.
const NEGATIVE_CATEGORIES = new Set(["20", "23", "24"]); // Gaming, Comedy, Entertainment

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
    const body = await req.json();
    videoId = typeof body?.videoId === "string" ? body.videoId : "";
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!videoId) return json({ error: "videoId required" }, 400);

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
