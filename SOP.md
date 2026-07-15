# Tarkeez — Standard Operating Procedure (SOP)

> **Purpose:** This document is the single source of truth for how Tarkeez is built, run, maintained, and evolved. It is written for future reference (myself and any collaborators) and assumes you already have the project checked out.
>
> **Status:** Reflects the codebase as of the latest scan. Sections marked **(Experimental)** describe planned or stubbed features that are not yet committed product guarantees.
>
> **Last updated:** 2026-07-10

---

## 1. Product Identity & Vision

**Tarkeez** is an offline-first study-time tracker and productivity app for students.

- **Current core:** Track focused study time across PDFs, rich notes, YouTube videos, and general web browsing.
- **Differentiator:** A built-in content classifier distinguishes genuine study time from distraction, so the timer only runs for educational content.
- **Long-term vision:** A **social + educational productivity platform** — individual focus tracking today, with mates, shared study posts, advanced analytics, AI-powered study aids, and optional Pro subscription tiers in the future.
- **Platforms:** iOS, Android, and PWA (Expo web).

### Product principles

1. **Trustworthy data first** — students rely on Tarkeez for real progress; sessions are immutable and timers never depend on network.
2. **Offline by default** — every feature must work without internet. Cloud sync is automatic, not required.
3. **Calm, not gamified** — warm, focused UI; subtle feedback; no cheap engagement loops.
4. **Privacy-first classification** — URL/YouTube classification uses domain/video metadata only; never page content.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK ~54, React 19, React Native 0.81.5, TypeScript strict |
| Navigation | `expo-router` v6 (file-system based) |
| Local DB | `expo-sqlite` + `drizzle-orm` (WAL on native) |
| Remote backend | Supabase (Auth, Postgres, Storage, Edge Functions, Realtime client) |
| Drawing | `@shopify/react-native-skia` + `react-native-gesture-handler` |
| Web content | `react-native-webview` (pdf.js-based PDF viewer, in-app browser) |
| Rich text | `react-native-pell-rich-editor` |
| Styling | `StyleSheet` + token system (`constants/themes.ts`) |
| Utilities | `expo-haptics`, `expo-file-system`, `expo-sharing`, `expo-print`, `expo-image-picker`, `expo-media-library`, `react-native-reanimated` |
| Package manager | `pnpm` |
| Testing | `jest` / `jest-expo` |

### Important constraint

The app uses `@shopify/react-native-skia`, which is **not available in Expo Go**. You must use a **custom development build** (`expo run:ios|android` or EAS) for all development and testing.

---

## 3. Repository Layout

```
app/                    # expo-router screens & layouts
  (auth)/               # login, signup
  (tabs)/               # library, browser, insights, profile
  study/[id].tsx        # PDF reader
  note/[id].tsx         # rich note + drawing canvas
  browser/view.tsx      # in-app browser + focus timer
  calendar.tsx          # study calendar
  collection/[id].tsx   # collection detail
components/             # reusable UI
constants/              # themes, colors
db/                     # local SQLite layer
  schema.ts             # Drizzle schema
  client.ts             # DB opening + WAL
  migrate.ts            # migration runner
  sync.ts               # outbox push worker
  pull.ts               # periodic pull worker
  strokesStore.ts       # native/OPFS/IndexedDB stroke persistence
  repositories/         # per-entity queries
  handlers/             # outbox push handlers
features/               # feature modules
  classifier/           # URL & YouTube classification
contexts/               # AuthContext, LibraryContext, ThemeContext
hooks/                  # useColors, usePullToRefresh, useReducedMotion
lib/                    # network seam, helpers, PDF viewer HTML, export
server/                 # static production server
scripts/                # build scripts, whitelist normalizer
supabase/functions/     # Edge Functions (classify-url, classify-youtube)
```

---

## 4. Architecture

### 4.1 Golden data path

```
Screen / Component
       ↓
   Context (Auth / Library / Theme)
       ↓
  db/repositories/*     (local SQLite + useLiveQuery)
       ↓
    sync_outbox         (pending_create / pending_update / pending_delete)
       ↓
    db/handlers/*       (push to Supabase)
       ↓
      lib/api.ts        (Supabase client / storage / functions)
       ↓
      Supabase
```

**Rule:** SQLite is the source of truth for the UI. Supabase is treated as a remote replica.

### 4.2 Boot sequence (`app/_layout.tsx`)

1. Load Inter font family.
2. Run Drizzle migrations (`useDbMigrations`).
3. Run legacy `migrateStymerToTarkeez()` AsyncStorage → SQLite migration.
4. Repair `study_sessions` schema drift (`ensureSessionsSchema`).
5. Start the outbox sync engine (`startSync`).
6. Mount providers in order:
   - SafeAreaProvider
   - ErrorBoundary
   - QueryClientProvider
   - GestureHandlerRootView
   - KeyboardProvider
   - ThemeProvider
   - AuthProvider
   - LibraryProvider

### 4.3 Offline-first rules

1. **Every user mutation writes to SQLite first.** Mark row with `sync_status = 'pending_*'`.
2. **Enqueue a `sync_outbox` row** via `db/sync.ts`.
3. **The push worker drains the outbox** on:
   - App foreground
   - Network reconnect
   - 30-second heartbeat
4. **Backoff on failure:** 1s → 2s → 4s → 16s → 5min (capped).
5. **The pull worker** (`db/pull.ts`) fetches server changes every 60s + on foreground/reconnect, upserts locally using `server_updated_at` Last-Write-Wins, and tombstones rows deleted on the server.
6. **Strokes (drawing)** are never in SQLite. They live on the filesystem (native) or OPFS/IndexedDB (web). SQLite only stores the manifest columns.

### 4.4 Conflict policy

- If a local row is `synced` and the server has a newer `updated_at`, server wins.
- If a local row is `pending_*` (user edited offline), local wins over incoming server data; it will be pushed later.
- For strokes, server wins when local is not dirty (`strokes_dirty_at IS NULL`).

---

## 5. Data Model

### 5.1 Core entities

| Entity | Table | Purpose |
|---|---|---|
| Profile | `profiles` | Signed-in user mirror |
| Material | `materials` | PDF/document metadata |
| Collection | `collections` | User-defined folders |
| Collection membership | `collection_materials` | Many-to-many join (materials + notes) |
| Note | `notes` | Rich text notes; strokes manifest only |
| Study session | `study_sessions` | Focus timer output; XOR on material/note/external URL |
| Annotation | `annotations` | Per-page PDF strokes/highlights (local-only today) |
| Outbox | `sync_outbox` | Generic push queue |
| Meta | `meta` | Schema version, pull cursors |
| Classifier cache | `url_classifications`, `youtube_classifications` | Caches classification verdicts |

### 5.2 Storage buckets (Supabase)

- **`materials`** — private PDF storage, path `{user_id}/{file_name}`, max 15MB (`MAX_MATERIAL_BYTES`). Always use signed URLs, never public URLs.
- **`avatars`** — private profile photos, path `{user_id}/avatar.{ext}`, max 5MB.

### 5.3 Filesystem conventions

- PDF cache: `${cacheDirectory}Tarkeez/{user_id}/{material_id}.pdf`
- Strokes store: `${documentDirectory}Tarkeez/{user_id}/strokes/{note_id}.json`
- Web strokes: OPFS/IndexedDB fallback

---

## 6. Feature Modules

### 6.1 Authentication

- Email/password via Supabase Auth.
- Email confirmation is **disabled**; users sign in immediately.
- Profile row auto-created via database trigger on `auth.users` insert.
- **Never insert into `profiles` from app code** — causes duplicate-key error.
- Session persisted via AsyncStorage through `lib/supabase.ts`.

### 6.2 Library (`(tabs)/index.tsx`)

- Grid/list of collections, uncategorized materials, and notes.
- Import PDF, create note, create collection.
- Routes to study screen, note screen, collection detail.
- Uncategorized materials = `materials.filter(m => !cmRows.some(r => r.materialId === m.id))`.

### 6.3 PDF Study (`study/[id].tsx`)

- `react-native-webview` running `lib/pdfViewerHtml.ts` + pdf.js.
- Tracks current page via IntersectionObserver.
- Focus timer pauses on idle/flick scroll.
- Drawing/highlights injected via `window.__tarkeez*` bridge; stored locally in `annotations`.

### 6.4 Notes (`note/[id].tsx`)

- Rich text editor + Skia drawing canvas.
- HTML autosaved to SQLite.
- Strokes saved via `strokesStore.ts`.
- Focus session tracked while note is open.
- PDF export via `expo-print`.

### 6.5 In-App Browser (`browser/view.tsx`)

- WebView wrapper for arbitrary URLs.
- Focus timer + educational classifier.
- YouTube play detection via video bounding-area heuristic (`MIN_AREA = 80000`).
- Timer pauses when classifier returns non-educational.

### 6.6 Content Classifier (`features/classifier/`)

**URL classifier (general sites):**

1. Tier 1a — Whitelist (`features/classifier/whitelist.json`)
2. Tier 1b — Blacklist (`features/classifier/domainLists.ts`)
3. Tier 2 — Rule-based (`.edu`, `.ac`, `.gov`, study/academy keywords)
4. Tier 3 — Gemini Edge Function `classify-url` (domain only)
5. Fallback — fail-open: educational + reason

**YouTube classifier:**

1. YouTube Data API category check (27 = Education)
2. Gemini fallback on title/description
3. Cache by videoId

**Privacy:** Only the bare hostname/videoId ever leaves the device. URL path, query, fragment, and page content are never sent.

### 6.7 Calendar & Insights

- `calendar.tsx` + `components/calendar/StudyCalendar.tsx`
- `lib/calendarUtils.ts` — heatmap, streaks, monthly stats
- `(tabs)/insights.tsx` — today/week/total stats, 7-day chart, recent sessions, share post

### 6.8 Share Post

- `components/SharePostModal.tsx` exports a stats card to PNG via `react-native-view-shot`.
- Shares via `expo-sharing`; saves to camera roll via `expo-media-library`.

---

## 7. Development Workflow

### 7.1 Environment variables

Required in `.env` at project root:

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Optional for web deployment:

```env
EXPO_PUBLIC_DOMAIN=
EXPO_PUBLIC_REPL_ID=
REPLIT_INTERNAL_APP_DOMAIN=
REPLIT_DEV_DOMAIN=
BASE_PATH=/
```

### 7.2 First-time setup

```bash
pnpm install
# create .env with the two required variables above
pnpm exec expo prebuild   # generates/updates ios/ and android/
```

### 7.3 Running locally

```bash
# iOS
pnpm exec expo run:ios

# Android
pnpm exec expo run:android

# After installing the dev build, start the bundler
pnpm exec expo start --dev-client
```

**Do not use Expo Go.** Use the dev client built above.

### 7.4 EAS build (alternative)

```bash
pnpm exec eas build --profile development --platform ios   # or android
pnpm exec expo start --dev-client
```

### 7.5 Typecheck & test

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm test:watch
pnpm test:coverage
```

Run these before every push. The TypeScript config is strict; no `any`, no implicit types.

### 7.6 Static web build (PWA / Replit)

```bash
node scripts/build.js     # outputs static-build/
node server/serve.js      # serves static-build on PORT (default 3000)
```

Both inject COOP/COEP headers required for SQLite WASM / SharedArrayBuffer on web.

---

## 8. Code Standards & Conventions

### 8.1 Non-negotiables

1. **TypeScript strict.** No `any`, no implicit types.
2. **No hardcoded colors.** Always use `useColors()`.
3. **No hardcoded Supabase credentials.** Env variables only.
4. **No public URLs for Storage.** Always signed URLs (`fileUrl()` is async — await it).
5. **No page-content classification.** Domain/video metadata only.
6. **Sessions are immutable** once ended.
7. **Do not modify navigation/layout files** unless explicitly asked.
8. **Do not change existing TypeScript types** exported from contexts.
9. **AsyncStorage key prefix is `@Tarkeez/`** (capital T), never `@tarkeez/`.

### 8.2 Adding a new entity/table

1. Add Drizzle table to `db/schema.ts`.
2. Generate migration: `pnpm exec drizzle-kit generate`.
3. Add repository in `db/repositories/`.
4. Add outbox handlers in `db/handlers/` and register them.
5. Update `db/pull.ts` if server rows should hydrate locally.
6. Add RLS policies in Supabase.
7. Add tests in `db/__tests__/`.
8. Update this SOP if the entity is core to the product.

### 8.3 UI conventions

- Spacing scale: multiples of 4 (`4, 8, 16, 24, 48`).
- Minimum touch target: 44×44.
- Every screen needs loading, empty, and error states.
- Every interactive element needs default, pressed, and disabled states.
- No inline styles — use `StyleSheet.create()`.
- Functional components only; typed props via interface.
- Support light and dark mode simultaneously.

### 8.4 Async / error handling

- Wrap every async call in `try/catch`.
- No silent failures — surface user-facing errors appropriately.
- Debounce user-input syncs (notes ~1.5s, sessions ~4s).
- Memoize expensive computations.

### 8.5 Before writing code, ask

1. Where does this data live? (local, remote, cache?)
2. What happens offline?
3. Does this need RLS? (answer is always yes)
4. Is there a simpler approach?
5. Does this create a privacy or security concern?

---

## 9. Release & Deployment SOP

### 9.1 Pre-release checklist

- [ ] `pnpm test` passes.
- [ ] `pnpm exec tsc --noEmit` passes.
- [ ] All new migrations are generated and committed.
- [ ] `app.json` version is bumped.
- [ ] No hardcoded secrets or debug logging left in source.
- [ ] No mock data left in production screens.
- [ ] Changelog / release notes drafted.

### 9.2 Native release

```bash
# iOS
pnpm exec eas build --profile production --platform ios
# Then submit via EAS or download and upload to App Store Connect manually.

# Android
pnpm exec eas build --profile production --platform android
# Then submit via EAS or upload the AAB to Google Play Console.
```

### 9.3 Web / PWA release

```bash
node scripts/build.js
node server/serve.js   # verify locally
# Deploy the static-build/ folder to your hosting target.
```

### 9.4 Hotfix policy

1. Branch from the release tag/commit.
2. Make the minimal fix.
3. Run tests and typecheck.
4. Cherry-pick or merge back to `main`.
5. Rebuild and resubmit.

### 9.5 Monitoring after release

- Check Supabase logs for Edge Function errors (`classify-url`, `classify-youtube`).
- Check outbox growth — stuck rows indicate handler or network issues.
- Watch crash reports from app stores.
- Verify sync on a test device after 24h.

---

## 10. Issue / Task Management Workflow

### 10.1 Starting a new task

1. Confirm requirement and product boundary.
2. Identify affected entities — add DB tables/migrations/repositories if needed.
3. Check offline impact and sync path.
4. Implement UI → context → repository → outbox → handler.
5. Add/update tests.
6. Run `tsc --noEmit` and `test`.
7. Update this SOP if the change affects architecture, build, or release.

### 10.2 Bug fixes

1. Reproduce with a test if possible.
2. Make minimal change.
3. Verify no regression in sync/offline behavior.
4. Update relevant tests.

### 10.3 Refactoring

- Do not change interfaces consumed by screens/tests unless necessary.
- Prefer small, focused PRs.
- Update `CLAUDE.md` and this SOP if architectural rules change.

---

## 11. Troubleshooting

### 11.1 Dev build issues

| Symptom | Fix |
|---|---|
| `expo start` fails to load | Make sure you are using `--dev-client`, not Expo Go. |
| Skia crash on iOS/Android | Native project out of sync — run `pnpm exec expo prebuild --clean` (commits `ios/`/`android/` after review). |
| Metro bundler errors | `pnpm start -c` to clear cache. |

### 11.2 Sync / offline issues

| Symptom | Fix |
|---|---|
| Data not syncing | Check network, Supabase status, and `sync_outbox` rows. Inspect `last_error`. |
| Strokes not uploading | Verify `strokes_dirty_at` is set; check stroke file size (< 2MB soft limit). |
| Duplicate rows | Check idempotency of local inserts and outbox deduplication. |
| Old data reappears | Check pull tombstone logic and `server_updated_at` LWW guard. |

### 11.3 Web/PWA issues

| Symptom | Fix |
|---|---|
| SQLite fails on web | Confirm COOP/COEP headers are present; requires Chromium-based browser for full support. |
| SharedArrayBuffer missing | Safari/Firefox fall back to legacy AsyncStorage path; features are degraded. |

### 11.4 Classifier issues

| Symptom | Fix |
|---|---|
| Educational site marked off-topic | Add domain to `features/classifier/whitelist-source.txt`, run `node scripts/normalize-whitelist.mjs`, commit both files. |
| Distraction site marked educational | Add to blacklist in `features/classifier/domainLists.ts`. |
| Classifier slow | Check `url_classifications` cache; verify Gemini Edge Function logs. |

---

## 12. Roadmap — Experimental / Not Guaranteed

These features are documented in code or planning docs but are **not committed product guarantees**. They may change scope, ship partially, or be removed.

| Feature | Status | Notes |
|---|---|---|
| **Mate system** | Tables ready (`mates`) | Send request, accept/decline, view mate stats. |
| **Feed / Posts** | Planned | Share study session cards as transparent PNG. Must be tied to real session data. |
| **Tarkeez Pro** | Planned | Gate AI features: note summarization, flashcards, Quiz Me, advanced analytics, unlimited history. |
| **Advanced analytics** | Planned | Subject distribution, best study hours, streak milestones. |
| **Live collaborative sessions** | Planned | Supabase Realtime already set up; shared session timer. |

When implementing any experimental feature, follow the same offline-first, RLS, and test rules as core features.

---

## 13. Key Contacts & Resources

- **Code conventions & memory:** `CLAUDE.md`
- **Offline architecture:** `OFFLINE_ARCHITECTURE_PLAN.md`
- **Offline test report:** `OFFLINE_DB_TESTS_REPORT.md`
- **Supabase project:** configured via `.env`
- **Package scripts:** `package.json`

---

## 14. Change Log

| Date | Change |
|---|---|
| 2026-07-10 | Initial SOP created; launch video removed; mocked browser recents removed. |
