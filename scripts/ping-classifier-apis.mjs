#!/usr/bin/env node
// Connectivity ping for the two upstream APIs the YouTube classifier
// Edge Function relies on. Run from project root:
//
//   YOUTUBE_API_KEY=... GEMINI_API_KEY=... node scripts/ping-classifier-apis.mjs
//
// Exits 0 on both checks passing, 1 otherwise. Not a Jest test — Jest
// here is unit-only/offline; this is a one-off post-deploy probe.

const YT_KEY = process.env.YOUTUBE_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

if (!YT_KEY) fail("YOUTUBE_API_KEY env var is missing");
if (!GEMINI_KEY) fail("GEMINI_API_KEY env var is missing");
if (!YT_KEY || !GEMINI_KEY) process.exit(1);

async function pingYouTube() {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=aircAruvnKk&key=${YT_KEY}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    fail(`YouTube Data API HTTP ${res.status} — ${JSON.stringify(body)}`);
    return;
  }
  const categoryId = body?.items?.[0]?.snippet?.categoryId;
  if (categoryId !== "27") {
    fail(`YouTube Data API responded but categoryId is "${categoryId}" (expected "27")`);
    return;
  }
  console.log(`✓ YouTube Data API   200  (category 27 confirmed)`);
}

async function pingGemini() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Reply YES." }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 4 },
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    fail(`Gemini 2.0 Flash HTTP ${res.status} — ${JSON.stringify(body)}`);
    return;
  }
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || text.length === 0) {
    fail(`Gemini 2.0 Flash responded 200 but no candidate text was present — ${JSON.stringify(body)}`);
    return;
  }
  console.log(`✓ Gemini 2.0 Flash   200  (candidate text returned)`);
}

await Promise.all([pingYouTube(), pingGemini()]);
process.exit(process.exitCode ?? 0);
