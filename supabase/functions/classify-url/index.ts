// Deno Edge Function — runs on Supabase Functions runtime.
// Deploy with: `pnpm exec supabase functions deploy classify-url`
// Secrets required: GEMINI_API_KEY (already set for classify-youtube).
//
// Contract:
//   POST { domain: string }   (Authorization: Bearer <user JWT> required)
//   → 200 { isEducational: boolean, reason: string }
//   → 400 { error: string }   malformed request
//   → 401 { error: string }   missing/invalid auth token
//   → 429 { error, retryAfterSeconds }   per-user rate limit exceeded
//   → 502 { error: string }   upstream (Gemini) failure
//   → 503 { error: string }   rate-limit backend unavailable (fail-closed)
//
// Privacy: the request body must contain only a bare hostname (no path,
// query, fragment). The client (features/classifier/urlClassifier.ts)
// strips everything else before invoking.

// @ts-expect-error — Deno std lives on a URL at runtime; TS sees no module.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// @ts-expect-error — Deno-style relative import with explicit .ts extension.
import { HttpError, rateLimit, requireUserId } from "../_shared/guard.ts";

// @ts-expect-error — Deno is a runtime global on Supabase Functions.
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

// Per-user throttle for the paid Gemini call. Domains are cached indefinitely
// client-side (url_classifications table), so genuine usage is far below this.
// @ts-expect-error — Deno is a runtime global on Supabase Functions.
const RATE_LIMIT_MAX = Number(Deno.env.get("RATE_LIMIT_MAX") ?? "60");
const RATE_LIMIT_WINDOW_SECONDS = Number(
  // @ts-expect-error — Deno is a runtime global on Supabase Functions.
  Deno.env.get("RATE_LIMIT_WINDOW_SECONDS") ?? "3600",
);

type Verdict = { isEducational: boolean; reason: string };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function classify(domain: string): Promise<Verdict> {
  const prompt =
    `Analyze the domain "${domain}". Is this primary domain used for ` +
    `educational or study purposes? Reply with a strict JSON object: ` +
    `{ "educational": true } or { "educational": false }`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 32,
          responseMimeType: "application/json",
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini API ${res.status}`);
  const data = await res.json();
  const text = String(
    data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}",
  );
  let parsed: { educational?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned non-JSON");
  }
  const isEducational = parsed?.educational === true;
  return { isEducational, reason: isEducational ? "llm_yes" : "llm_no" };
}

// Conservative domain shape check — letters/digits/dashes/dots, no spaces
// or paths. Guards against accidental URL strings sneaking past the client.
const DOMAIN_RE = /^[a-z0-9.-]{1,253}$/;

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let domain: string;
  try {
    // AuthN + per-user rate limit guard the paid Gemini call (FIX-01).
    const userId = await requireUserId(req);

    const body = await req.json().catch(() => null);
    domain = typeof body?.domain === "string" ? body.domain.toLowerCase() : "";
    if (!domain || !DOMAIN_RE.test(domain)) {
      return json({ error: "domain required" }, 400);
    }

    const quota = await rateLimit(
      userId,
      "classify-url",
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

  if (!GEMINI_API_KEY) {
    return json({ error: "missing_api_key" }, 500);
  }

  try {
    return json(await classify(domain));
  } catch (e) {
    const message = e instanceof Error ? e.message : "classification_failed";
    return json({ error: message }, 502);
  }
});
