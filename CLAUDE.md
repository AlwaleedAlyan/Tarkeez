# Tarkeez — Project Memory

## What This App Does

Tarkeez is a study time tracker that monitors student activity while reading materials.
Users can upload PDFs, track study sessions, take notes, view insights, and study
together with mates. Available on iOS, Android, and Desktop (PWA).

---

## Tech Stack

- Frontend: Expo / React Native (expo-router)
- Language: TypeScript (strict — no `any`, no implicit types)
- Backend: Supabase (Auth, Database, Storage, Realtime)
- Local DB: `expo-sqlite` + `drizzle-orm` (offline-first; see OFFLINE_ARCHITECTURE_PLAN.md)
- State Management: React Context (AuthContext, LibraryContext, ThemeContext)
- Package manager: pnpm
- Validation: Zod
- Drawing: `@shopify/react-native-skia` (NOT compatible with Expo Go)

## Dev build (required)

The project uses `@shopify/react-native-skia` for note drawing, which is a
native module not bundled in Expo Go. Native projects (`ios/`, `android/`) are
generated via `npx expo prebuild` and committed. To run in dev:

- `pnpm exec expo run:ios` or `pnpm exec expo run:android` for a local build, or
`pnpm exec eas build --profile development --platform <ios|android>` for EAS.
- After installing the dev build on a device, run `pnpm exec expo start --dev-client` and scan the QR with the dev client (NOT with Expo Go).

## Project Structure

```
app/              → screens and navigation (expo-router)
components/       → reusable UI components
contexts/         → AuthContext, LibraryContext, ThemeContext
db/               → local SQLite layer (schema.ts, client.ts, migrate.ts,
                    migrations/, repositories/ as added per milestone)
lib/              → api.ts (Supabase calls), supabase.ts (client)
constants/        → colors, themes, design tokens
hooks/            → useColors
```

### Local DB (offline-first, Milestones 0–9 complete)

- File: `tarkeez.db` opened via `expo-sqlite` `openDatabaseSync` in `db/client.ts`
- Schema is the source of truth in `db/schema.ts`; migrations are generated
with `pnpm exec drizzle-kit generate` into `db/migrations/`
- Migrations run on app boot via `useDbMigrations()` in `db/migrate.ts`,
invoked from `app/_layout.tsx` before any provider mounts
- WAL mode + foreign keys enabled on native; web uses the WASM driver
- Strokes do NOT live in SQLite — see OFFLINE_ARCHITECTURE_PLAN.md §3
- Metro is configured to bundle `.sql` files (see `metro.config.js`)
- Write queue: `db/sync.ts` is the generic outbox engine (`enqueue`,
`drain`, `start`, `stop`, `registerHandler`). It backs all
offline-tolerant writes; per-entity handlers live in `db/handlers/*`.
`app/_layout.tsx` calls `startSync()` once after migrations succeed
(gated by `db != null` — runs on native and Chromium web), then on app foreground,
network reconnect (`@react-native-community/netinfo`), and a 30s
heartbeat. Backoff: 1s → 2s → 4s → 16s → 5min.
- Sessions: `recordSession` writes the row to SQLite with
`sync_status='pending_create'`, enqueues a `study_sessions:create`
outbox row, and lets the push worker POST it. There is no longer a
per-entity retry loop.
- Collections + collection_materials: all seven mutations
(`createCollection`, `updateCollection`, `deleteCollection`,
`add/removeMaterialToCollection`, `add/removeNoteToCollection`) write
SQLite (`pending_create`/`pending_update`/`pending_delete`), enqueue
to outbox, and return optimistically. `id` is client-generated
(uuidv4) for collections so the new row is usable before the server
acknowledges. Deletes are soft locally (`deleted_at`); the push
worker hard-deletes after the server confirms. Live queries already
filter `WHERE deleted_at IS NULL`.
- Notes: `createNote`, `updateNote`, `deleteNote` all go through the
outbox (same pattern as collections — client-generated uuid for
notes, soft delete locally + hard delete after server confirm).
Strokes are NEVER carried by `updateNote`; they live in the strokes
store (`db/strokesStore.ts`) — `${documentDirectory}Tarkeez/{userId}/ strokes/{noteId}.json` on native, OPFS via
`navigator.storage.getDirectory()` with an IndexedDB fallback on
Chromium web. `saveNoteStrokes` writes the bytes immediately,
updates the manifest columns (`strokes_file_path`,
`strokes_byte_size`, `strokes_dirty_at`), and after a 1.5s debounce
enqueues ONE `note_strokes:update` outbox row (deduped via
`enqueueOutboxIfNoPending`). The handler reads the bytes back at
send time and PATCHes the existing `drawing_strokes` jsonb on
Supabase; on success it stamps `strokes_server_synced_at` and
clears `strokes_dirty_at` via CAS so concurrent draws aren't lost.
Boot-time scan in `LibraryContext` re-enqueues any note with
`strokes_dirty_at IS NOT NULL` (runs on every SQLite platform).
- Materials: `addMaterial` generates a client uuid, copies the PDF
to `${cacheDirectory}Tarkeez/{userId}/{materialId}.pdf`, writes the
SQLite row with `sync_status='pending_create'` + `local_file_path`,
and enqueues `materials:create`. The handler does two-phase server
write: (1) `uploadMaterialStorage(userId, fileName, localUri, mt)`
goes straight to Supabase Storage; (2) POST `/materials` JSON body
(no FormData) inserts the metadata row. `updateMaterial` is
coalesced via `enqueueOutboxIfNoPending` — page-turn autosave never
queues more than one outbox row per material; the handler reads
current state from SQLite at drain time. `deleteMaterial` soft-
deletes locally (incl. local PDF), enqueues `materials:delete` with
`{userId, fileName}` payload, and the handler removes the Storage
object + DELETEs the row + hard-deletes the local SQLite row.
- Pull worker (`db/pull.ts`): mirrors the outbox engine — runs on
app foreground, network reconnect, and a **60s heartbeat**.
`startPull(userId)` is wired from `LibraryContext` when the user
becomes available. Each `pullAll` cycles through `pullMaterials / pullCollections / pullCMRows / pullNotes / pullSessions`; each
`pullX` calls the existing `api(...)` GET, reuses
`upsertXFromServer` (which already has the LWW guard
`WHERE sync_status = 'synced'`), and then runs a tombstone scan
(`tombstoneMissingX`) that **hard-deletes** any locally-synced
rows absent from the server response. `pullNotes` also hydrates
the strokes store via `applyServerStrokes` when the server copy is
newer and the local copy isn't dirty. Last-write-wins is
the documented semantic; "server wins" applies to strokes when
`strokes_dirty_at IS NULL`. `last_pulled_at` is recorded in
the `meta` table.
- Web (Chromium-first): `db/client.ts` initializes the WASM SQLite
build on web when `typeof SharedArrayBuffer !== "undefined"`,
otherwise leaves `db = null` and the legacy `webMaterials/...`
React-state path (still in `LibraryContext`) renders the library.
Both `metro.config.js` (dev) and `server/serve.js` (prod) inject
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` on every response so
the browser exposes SAB; `server/serve.js` also serves `.wasm` as
`application/wasm`. Persistence uses OPFS; data survives reload
on Chrome/Edge. Safari/Firefox keep using the legacy path. The
outbox + pull workers run unchanged on web because they were
already gated on `db != null`.
- Strokes store (`db/strokesStore.ts`): native uses
`expo-file-system` at `${documentDirectory}Tarkeez/{userId}/ strokes/{noteId}.json`; Chromium web uses OPFS via
`navigator.storage.getDirectory()` with an IndexedDB fallback
(object store `tarkeez_strokes`). The `notes.strokes_file_path`
manifest column holds the OS path on native and a logical
`web:Tarkeez/...` handle on web — readers always go through
`readStrokesFile(userId, noteId)`. The legacy AsyncStorage
`@Tarkeez/note_strokes/`* keys are only touched on the `db == null`
Safari/Firefox fallback; the backfill drains pre-M9 installs.

### Feature Structure (for new features)

```
/features
  /classifier     → URL & YouTube classification (in production)
  /notes          → built-in note taking (built)
  /feed           → post/social feature (upcoming)
  /analytics      → study insights (upcoming)
```

---

## Environment Variables

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

Never hardcode these — always use env variables only.

---

## 🏗️ Architecture Rules

### Golden Path for New Features

```
screen (app/) → context/hook → db/repositories/* (SQLite)
  → db/sync.ts outbox → lib/api.ts → Supabase
                                   ↑
                          db/pull.ts (inverse)
```

- SQLite is the canonical read source via `useLiveQuery`
(`drizzle-orm/expo-sqlite/query`)
- Writes go to SQLite first (`sync_status='pending_*'`), then enqueue
to `sync_outbox`; the push worker (`db/sync.ts`) drains it on app
foreground, network reconnect, and a 30s heartbeat
- The pull worker (`db/pull.ts`) hydrates SQLite from Supabase on
foreground, reconnect, and a 60s heartbeat (LWW by
`server_updated_at`)
- Per-entity push handlers live next to repositories in
`db/handlers/*` — `lib/api.ts` is the network seam, not where the
business logic lives
- UI state lives in contexts — never fetched directly from screens
- New tables always need: RLS enabled + policies mirroring existing
pattern, plus a `db/schema.ts` mirror and a repository
- Offline-first: any user-generated data must work without network
- Safari/Firefox-without-SAB fall back to the legacy
`webMaterials`/`webCollections`/… React-state path in
`LibraryContext`; that fallback is deliberately preserved until
SQLite WASM reaches every browser

### Before Writing Code, Always Ask:

1. Where does this data live? (local, remote, cache?)
2. What happens offline?
3. Does this need RLS? (answer is always yes)
4. Is there a simpler approach that achieves the same result?
5. Does this create a privacy or security concern?

### Key Patterns

- **Repository pattern** — every entity has a `db/repositories/*.ts`
with typed Drizzle queries; the network seam is `lib/api.ts`,
invoked only from `db/handlers/*.ts` by the push worker
- **SQLite as source of truth** — UI reads via `useLiveQuery`; the
Supabase fetch only feeds local state via the pull worker
- **Outbox push** — every mutation writes SQLite first
(`sync_status='pending_*'`), then enqueues a `sync_outbox` row
the push worker (`db/sync.ts`) drains on foreground, reconnect,
and a 30s heartbeat (backoff: 1s → 2s → 4s → 16s → 5min)
- **Timed pull** — `db/pull.ts` mirrors the outbox cadence (60s
heartbeat) and reconciles via LWW + tombstone scan
- **Immutable sessions** — once a study session ends, it cannot be edited
- **No screen reads** — classifier uses URL/domain only, never page content

---

## 🎨 Design Rules

### Tarkeez's Design Personality

Students use this app daily for focus — the UI must feel:

- **Calm and focused** — not gamified to distraction
- **Trustworthy** — students rely on it for real progress data
- **Motivating** — celebrate streaks, milestones, progress warmly
- **Clean but not cold** — warm, approachable, not sterile

### Theme & Colors

- Always use `useColors` hook — **never hardcode colors**
- Colors live in `constants/colors.ts`
- Dark mode is required — design every screen for both themes simultaneously
- ThemeContext drives the active theme — never read it directly in components

### Spacing & Layout

- Spacing scale: **4, 8, 16, 24, 48** — always multiples of 4
- Mobile-first — design for small screens, scale up
- Generous whitespace — studying is about focus, not density
- Minimum touch target: 44×44pt (Apple HIG standard)

### Typography

- Never use system default fonts without intention
- Hierarchy: clear distinction between headings, body, captions
- Never hardcode font sizes — use a defined scale

### Motion & Feedback

- Subtle micro-interactions only — nothing distracting during study sessions
- Every interactive element needs visual feedback (pressed state)
- Loading skeletons preferred over spinners
- Haptic feedback on key actions (session start/end, streak milestone)

### Component Standards

- Every screen needs all three states designed:
  - ✅ **Loading state** — skeleton or spinner
  - ✅ **Empty state** — helpful message, not blank (e.g. "No sessions yet — start studying!")
  - ✅ **Error state** — actionable message with retry option
- Interactive elements always have: default, pressed, disabled states
- No inline styles — always use `StyleSheet.create()`
- Functional components only — no class components
- Props always typed with explicit interface above the component

---

## 🔨 Builder Rules

### Code Quality

- TypeScript strictly — no `any`, no implicit types
- No magic numbers — name everything, put constants in `constants/`
- Error handling always — every async call wrapped in try/catch
- No silent failures — surface errors to the user appropriately
- DRY but readable — duplicate once, abstract twice

### AsyncStorage (legacy fallback only)

- Key prefix is `@Tarkeez/` (capital T) — never `@tarkeez/`
- Never change existing AsyncStorage keys — breaking change
- SQLite is canonical wherever it can run; the keys below are only
touched on the `db == null` (Safari/Firefox without SAB) path, and
the backfill (`db/backfill.ts`, sentinel `backfill_v2_done`) drains
them into SQLite on first boot after upgrade
- Known keys:
  - `@Tarkeez/prefs` — theme/accent/notifications (local-only,
  always — not migrated)
  - `@Tarkeez/sessions/{userId}` — legacy sessions cache; SQLite
  `study_sessions` + `useLiveSessions` is canonical
  - `@Tarkeez/annos/{userId}/{materialId}` — legacy annotations
  cache; SQLite `annotations` is canonical
  - `@Tarkeez/note_strokes/{userId}/{noteId}` — legacy strokes
  cache; the strokes store via `db/strokesStore.ts` is canonical
  (filesystem on native, OPFS/IndexedDB on Chromium web)

### Performance

- Classify URLs on first visit → **cache result** — never re-classify same domain
- Study session timer runs locally — never depends on network
- Feed/social features are lazy loaded — never block core study features
- Debounce all user-input syncs (notes: ~1.5s, sessions: ~4s)
- Memoize expensive computations

---

## Supabase Infrastructure

### Project

- Project name: Tarkeez
- URL: stored in EXPO_PUBLIC_SUPABASE_URL
- Anon key: stored in EXPO_PUBLIC_SUPABASE_ANON_KEY

### Authentication

- Provider: Email/Password enabled
- Email confirmation: DISABLED (users sign in immediately)
- Auto profile creation: ENABLED via database trigger
(when a user signs up, a row is automatically inserted
into public.profiles using raw_user_meta_data->>'name')
- Signup flow: lib/api.ts passes `name` through
`signUp({ options: { data: { name } } })` so the trigger
can read it from raw_user_meta_data.
- ⚠️ Do NOT also insert into profiles from app code — causes profiles_pkey duplicate key error

### How Auth Works

- lib/supabase.ts initializes Supabase client with AsyncStorage
- lib/api.ts routes all calls to Supabase (no custom REST backend)
- contexts/AuthContext.tsx restores session via getSession() on mount
- onAuthStateChange listener keeps user state in sync automatically
- No manual JWT handling — Supabase manages all tokens automatically

### How Library Persistence Works

- Local SQLite (`db/schema.ts`, opened in `db/client.ts`) is the
source of truth; `LibraryContext` reads via `useLiveQuery` hooks
exposed from `db/repositories/`*. The Supabase fetch on user change
feeds the local DB through the pull worker — it doesn't drive the
UI directly
- Materials metadata in `materials` Postgres table; PDF blobs in the
`materials` Storage bucket
- PDF binary cache: `${cacheDirectory}Tarkeez/{user_id}/{material_id}.pdf`
(download-on-demand, separate from SQLite)
- Library top-level renders only uncategorized materials
- `uncategorizedMaterials` = `materials.filter(m => !cmRows.some(r => r.materialId === m.id))`
- Safari/Firefox-without-SAB run the legacy in-memory React-state
path inside `LibraryContext`; SQLite is silently skipped there

---

## Database Tables

### profiles

- id (uuid, references auth.users, primary key)
- name (text, not null)
- email (text)
- photo_uri (text)
- photo_transform (jsonb)
- RLS: view ✅ insert ✅ update ✅

### materials

- id (uuid, auto generated, primary key)
- user_id (uuid, references profiles)
- title (text, not null)
- file_name (text)
- mime_type (text, default application/pdf)
- size_bytes (bigint)
- total_pages (integer)
- current_page (integer, default 1)
- created_at (timestamptz)
- updated_at (timestamptz)
- RLS policies:
  ```sql
  alter table public.materials enable row level security;
  create policy materials_select_own on public.materials
    for select using (auth.uid() = user_id);
  create policy materials_insert_own on public.materials
    for insert with check (auth.uid() = user_id);
  create policy materials_update_own on public.materials
    for update using (auth.uid() = user_id)
                with check (auth.uid() = user_id);
  create policy materials_delete_own on public.materials
    for delete using (auth.uid() = user_id);
  ```

### study_sessions

One row per study session — PDFs OR notes; exactly one of material_id/note_id
is non-null per the ss_one_target_chk constraint.

- id (uuid, primary key) — client-supplied (uuidV4) so the local SQLite row and the server row share the same id
- user_id (uuid, references profiles)
- material_id (uuid, NULLABLE, references materials on delete cascade)
- note_id (uuid, NULLABLE, references notes on delete cascade)
- started_at (bigint, epoch ms)
- ended_at (bigint, epoch ms)
- duration_sec (integer) — focus seconds
- paused_sec (integer, default 0) — idle seconds
- pages_read (integer, NULLABLE) — PDF only
- page_times (jsonb, NULLABLE) — PDF only
- selections (integer, NULLABLE) — PDF only
- words_added (integer, NULLABLE) — note text-mode delta
- keystrokes (integer, NULLABLE) — note keystroke proxy
- strokes_added (integer, NULLABLE) — note draw-mode delta
- created_at (timestamptz)
- CHECK ss_one_target_chk: exactly one of (material_id, note_id) is set
- RLS: view ✅ insert ✅ update ✅ delete ✅
- Storage: SQLite (`pending_create` row) + `sync_outbox` row; the
push worker in `db/sync.ts` drains the outbox on app foreground,
network reconnect, and a 30s heartbeat. Safari/Firefox-without-SAB
use the legacy AsyncStorage `@Tarkeez/sessions/{userId}` cache;
the backfill drains it once SQLite is available.

### notes

- id (uuid, primary key, default gen_random_uuid())
- user_id (uuid, references profiles on delete cascade, not null)
- title (text, not null, default 'Untitled')
- content_html (text, not null, default '') — HTML from react-native-pell-rich-editor
- drawing_strokes (jsonb, not null, default '[]') — Stroke objects
({ color, width, points: {x,y}[], kind?: 'pen'|'highlighter' }).
Local canonical store is the strokes store (`db/strokesStore.ts`):
filesystem on native, OPFS/IndexedDB on Chromium web. The push
worker reads the file at send time and ships the entire array as
the existing jsonb on PATCH `/notes/:id` (~1.5s debounce, coalesced
via `enqueueOutboxIfNoPending`). Safari/Firefox fallback still uses
`@Tarkeez/note_strokes/{userId}/{noteId}` + a direct PATCH.
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now()) — bumped explicitly by PATCH /notes/:id
- RLS: select/insert/update/delete all gated on auth.uid() = user_id

### mates

- id (uuid, auto generated, primary key)
- user_id (uuid, references profiles)
- mate_id (uuid, references profiles)
- status (text: 'pending', 'accepted', 'blocked')
- created_at (timestamptz)
- RLS: view ✅ insert ✅ update ✅ delete ✅

### collections

- id (uuid, primary key, default gen_random_uuid())
- user_id (uuid, references auth.users on delete cascade)
- name (text, not null)
- created_at (timestamptz, default now())
- RLS: select/insert/update/delete all gated on auth.uid() = user_id

### collection_materials

Many-to-many join — holds both materials and notes.

- collection_id (uuid, references collections on delete cascade)
- material_id (uuid, NULLABLE, references materials on delete cascade)
- note_id (uuid, NULLABLE, references notes on delete cascade)
- added_at (timestamptz, default now())
- CHECK cm_one_target_chk: exactly one of (material_id, note_id) is non-null
- Partial unique indexes:
  - cm_collection_material_uniq on (collection_id, material_id) WHERE material_id is not null
  - cm_collection_note_uniq on (collection_id, note_id) WHERE note_id is not null
- RLS insert: gated on owning parent collection only
(user does NOT need to own the material/note — forward-compatible with mate-shared content)

---

## Storage Buckets

### `materials` (PDFs)

- Visibility: PRIVATE
- File size limit: 15MB — `MAX_MATERIAL_BYTES` in lib/api.ts is the single source of truth
- File path: {user_id}/{file_name}
- Always use signed URLs (valid 3600s) — never public URLs
- Downloads time out after 30s

### `avatars` (profile photos)

- Visibility: PRIVATE
- File size limit: 5MB
- Allowed MIME: image/jpeg, image/png, image/webp
- File path: {user_id}/avatar. — one row per user, upsert on change
- Store the PATH in profiles.photo_uri — not the URL
- Re-sign every 50 minutes to avoid expired URLs in long sessions
- Legacy file:// and http(s):// values pass through resolveAvatarUri unchanged

---

## Key Technical Decisions

- ⚠️ `fileUrl()` in lib/api.ts is ASYNC — must always be awaited
- Sessions are SQLite-canonical when SQLite is available
(`sync_status='pending_create'` → outbox → server). Safari/Firefox
without SAB use the legacy in-memory React-state + AsyncStorage
path; on every other platform `useLiveSessions` is the source and
AsyncStorage is untouched.
- PDF and note sessions share the study_sessions table
- Annotations are local-only and SQLite-canonical (`annotations`
table). The Safari/Firefox fallback still writes to
`@Tarkeez/annos/{userId}/{materialId}`; the backfill drains it on
first boot once SQLite is available. There is no cloud-sync path.
- Drawing strokes are NOT stored in SQLite. The strokes store
(`db/strokesStore.ts`) holds them on the filesystem (native) or
in OPFS/IndexedDB (Chromium web). SQLite carries only the
manifest columns on `notes`.
- All tables have Row Level Security (RLS) enabled
- Storage bucket is private — always use signed URLs, never public URLs
- profiles table auto-populated via trigger on auth.users insert
- Do not modify navigation or layout files unless explicitly asked
- Do not change any existing TypeScript types

---

## Features Built ✅

- Email/password authentication (signup, login, logout)
- Profile management (name, email, photo, password update)
- PDF material upload and viewing
- Study session recording and tracking
- PDF annotations and highlights (stored locally in SQLite)
- Cross-device file access via Supabase Storage signed URLs
- Built-in rich text notes (Supabase-synced, addable to collections)
- Collections (group materials and notes)
- Drawing canvas in notes (filesystem + OPFS strokes store)
- Offline-first SQLite layer with outbox push (`db/sync.ts`) and
timed pull (`db/pull.ts`) — Milestones 0–9 complete

---

## Features Upcoming 🚧

### Mate System

- mates table is ready
- Build: send request, accept/decline, view mate's study stats

### Feed / Posts

- Students share study session cards publicly
- Posts must be tied to real session data — no manual stat entry
- Share card = transparent PNG export of session stats (like Strava's share card)
- Generated client-side as transparent PNG — no server rendering needed
- Multiple card style options (swipeable like Strava)

### URL Classifier (Browser Window) ✅

3-tier system — URL/domain **only**, never page content. Whitelist-first
with safety net: a whitelist hit wins immediately; otherwise the request
falls through Tier 2 (rules) and Tier 3 (LLM). Implemented in
`features/classifier/urlClassifier.ts`; wired into `app/browser/view.tsx`
alongside the existing YouTube classifier (YouTube URLs still route to
`classifyYouTubeVideo`; everything else goes to `classifyUrl`).

- **Tier 1a — Whitelist** (`features/classifier/whitelist.json`, loaded
by `domainLists.ts`): list of known-good educational domains. Source
of truth is `features/classifier/whitelist-source.txt` (human-editable:
one URL or domain per line, `#` comments allowed). To refresh: edit
the source file and run `node scripts/normalize-whitelist.mjs`, then
commit BOTH files. Matching is suffix-based (a single
`khanacademy.org` entry covers every subdomain).
- **Tier 1b — Blacklist** (`features/classifier/domainLists.ts` TS
module): small hand-curated set of explicit off-topic overrides.
Keep small — Tier 3 catches the long tail.
- **Tier 2 — Rule-based** (`urlClassifier.ts`): TLD check (`.edu`,
`.ac`, `.gov`) and dot/dash-tokenized keyword match against
`learn`, `study`, `academy`, `course`, `university`, `college`,
`school`. Token-level (not substring) matching avoids false
positives like `learnsex.com`.
- **Tier 3 — Gemini fallback** (Edge Function `classify-url` at
`supabase/functions/classify-url/index.ts`): minimal prompt with the
bare domain only, returns `{ educational: true|false }`. Reuses the
same `GEMINI_API_KEY` secret as `classify-youtube`. Client calls via
`classifyUrlRemote` in `lib/api.ts`.
- **Cache**: SQLite `url_classifications` (key: normalized domain after
stripping `www.`/`m.`/`mobile.`) via `db/repositories/urlClassifications.ts`,
fronted by a module-scope `Map`. Only Tier 3 verdicts are written to
SQLite — Tier 1/2 are O(1) from the lists/rules so the disk cache
would just duplicate the source of truth.
- **Fail-open**: offline or LLM error → educational + reason
`offline_optimistic` / `error_optimistic` (matches `youtubeClassifier`).
- **Privacy**: only the bare hostname ever leaves the device. URL path,
query, fragment, and page content are never sent anywhere.

### YouTube Classifier

```
Step 1: YouTube Data API → categoryId (27 = Education) → instant pass
Step 2: LLM fallback on title + description if categoryId is ambiguous
Always: Cache result by videoId
```

### Analytics / Insights Screen

- Weekly/monthly study time breakdowns
- Subject distribution
- Best study hours pattern
- Streak history and milestones

### Tarkeez Pro (Subscription)

- Gate all AI-powered features behind `isPro` flag
- Pro features: AI note summarization, flashcard generation, Quiz Me mode,
advanced analytics, unlimited history, multi-device sync
- Basic must stay fully functional: timer, PDF, notes, browser monitoring, feed

### Live Collaborative Sessions

- Supabase Realtime is already set up
- Students study together with a shared session timer

---

## 🚫 Never Do

- Hardcode Supabase URL or keys — env variables only
- Insert into profiles from app code — trigger handles it, doing both causes duplicate key error
- Use public URLs for storage — always signed URLs
- Read page content for URL classification — domain only
- Allow study time to be manually edited after a session ends — sessions are immutable
- Change the AsyncStorage key prefix — breaking change
- Inflate or fake study session data
- Modify navigation or layout files unless explicitly asked
- Change existing TypeScript types
- Use `@tarkeez/` (lowercase) — always `@Tarkeez/`

