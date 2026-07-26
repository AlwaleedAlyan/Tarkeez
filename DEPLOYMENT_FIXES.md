# 🚀 Deployment Fix Checklist — Tarkeez

> Generated from the pre-deployment audit. Update this file as each fix lands.
> Legend: ⬜ pending · 🔄 in progress · ✅ done · ⏭️ deferred

## 🔴 Critical (blocks launch)

- [x] ✅ **FIX-01 · Auth + rate-limit Edge Functions** — `supabase/functions/classify-url/index.ts`, `classify-youtube/index.ts`
  - Public endpoints can burn Gemini/YouTube API quota. Verify caller JWT + add per-user throttling.
  - Est: 2–3 h
  - **Done 2026-07-26.** Code complete; ⚠️ deployment steps below still required.
- [ ] ⬜ **FIX-02 · Crash reporting (Sentry)** — integrate `@sentry/react-native`, wire `ErrorBoundary.onError` (`app/_layout.tsx:160`), add `ErrorUtils` global handler
  - Est: 2–3 h
- [ ] ⬜ **FIX-03 · Health check endpoint** — add `/health` to `server/serve.js`
  - Est: 15 min

## 🟡 Warnings (first week post-launch)

- [ ] ⬜ **FIX-04 · Sanitize note HTML (web XSS)** — DOMPurify before `innerHTML` in `app/note/[id].web.tsx:152,239`
  - Est: 30 min
- [ ] ⬜ **FIX-05 · Validate host header** — allowlist regex in `server/serve.js:83-90` (landing-page reflection)
  - Est: 20 min
- [ ] ⬜ **FIX-06 · Harden `serve.js`** — try/catch around `fs.readFileSync:117`, security headers (HSTS/CSP/nosniff/frame-ancestors), per-request log line
  - Est: 1 h
- [ ] ⬜ **FIX-07 · Structured logger** — `lib/logger.ts` with levels + remote-sink hook; convert ~38 sync-failure `console.warn` in `contexts/LibraryContext.tsx`
  - Est: 2 h
- [ ] ⬜ **FIX-08 · Secure token storage** — `expo-secure-store` session adapter in `lib/supabase.ts:9`; set `android:allowBackup="false"` in `AndroidManifest.xml`
  - Est: 1.5 h
- [ ] ⬜ **FIX-09 · Config hygiene** — `.gitignore` (`.env.*`, `google-services.json`, `GoogleService-Info.plist`, `*.keystore`, `credentials.json`); password min 4→8 (`contexts/AuthContext.tsx:199`, `app/settings.tsx:656`); fix `app.json:30` replit origin
  - Est: 30 min
- [ ] ⬜ **FIX-10 · Trim native permissions** — iOS `Info.plist` (location-always/camera/mic generic strings), Android manifest (location, RECORD_AUDIO, SYSTEM_ALERT_WINDOW, legacy storage)
  - Est: 1–2 h

## 🟢 Quick wins

- [ ] ⬜ **FIX-11 · Polish batch** — SRI hashes on CDN scripts (`lib/pdfViewerHtml.ts:43,56`, `landing-page.html:397`); `\u003c` escape in `pdfViewerHtml.ts:46`; `__DEV__`-gate classifier logs (`app/browser/view.tsx:196,222`, `InAppBrowser.web.tsx:116`); `videoId` regex in classify-youtube; fix swallowed catches (`hooks/usePullToRefresh.ts:20`, `contexts/LibraryContext.tsx:613,1541`)
  - Est: 1 h

## ⚪ Manual gate (outside repo)

- [ ] ⬜ **FIX-12 · Verify Supabase RLS** — confirm Row Level Security policies on `profiles`, `materials`, `notes`, `collections` tables + storage buckets in the Supabase dashboard
  - Est: 30 min

---

## Progress log

| Date | Fix | Notes |
|------|-----|-------|
| 2026-07-26 | FIX-01 | ✅ Complete — see details + deployment steps below |

---

## FIX-01 details (done 2026-07-26)

**What changed**
- `supabase/functions/_shared/guard.ts` (new) — shared guard: `requireUserId()` verifies the caller's Supabase JWT via `auth.getUser()` (defense-in-depth even if gateway `verify_jwt` is off); `rateLimit()` calls the atomic Postgres RPC; `HttpError` carries status + retry-after.
- `supabase/migrations/20260726160000_edge_rate_limits.sql` (new) — `edge_rate_limits` table (RLS on, no policies, all direct grants revoked) + `check_rate_limit()` SECURITY DEFINER function, EXECUTE granted to `service_role` only. Atomic fixed-window check-and-increment via `INSERT … ON CONFLICT` row lock.
- `classify-url/index.ts` — now requires auth + enforces **60 req/hour per user** before the paid Gemini call.
- `classify-youtube/index.ts` — same guard, **30 req/hour per user**; also tightened `videoId` validation to the exact `/^[A-Za-z0-9_-]{11}$/` shape.

**Design choices**
- Fail-closed: guard errors reject the request (503/401/429). Safe because the client classifier already degrades to an optimistic local verdict on any remote error — UX never breaks.
- Invalid input (400) is rejected *before* consuming rate-limit quota.
- Limits tunable via Edge Function secrets `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_SECONDS` (no redeploy of code needed).

**Verified:** `tsc --noEmit` clean; all 74 existing jest tests pass.

**⚠️ Deployment steps remaining (requires your Supabase credentials):**
1. `pnpm exec supabase db push` (applies the new migration) — or run the SQL manually in the dashboard SQL editor.
2. `pnpm exec supabase functions deploy classify-url && pnpm exec supabase functions deploy classify-youtube`
3. Do NOT deploy with `--no-verify-jwt` (gateway JWT check should stay on; the in-function check is a second layer anyway).
4. Smoke test: invoke without a token → expect 401; with a valid user JWT → 200; hammer 61/31 times → expect 429 with `retryAfterSeconds`.
