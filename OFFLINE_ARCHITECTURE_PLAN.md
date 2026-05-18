# Tarkeez — Offline-First Architecture Plan

> Status: Draft for review. No code changes have been made. This document is
> the blueprint for migrating Tarkeez from a network-first architecture with
> opportunistic AsyncStorage caching to a fully offline-first architecture
> where a local relational database is the single source of truth for the UI
> and Supabase is treated as a remote replica.

---

## 1. Current State (Reconnaissance Summary)

### 1.1 Data flow today
- `lib/supabase.ts` — Supabase JS client; AsyncStorage is wired as the
  **auth** persistence adapter only.
- `lib/api.ts` — thin REST gateway; every exported function is a direct
  Supabase round-trip with **zero local caching**: materials CRUD, collections
  CRUD, `collection_materials` join CRUD, notes CRUD (including
  `drawing_strokes` jsonb), study_sessions POST/GET, profile/avatar, signed
  URLs (`fileUrl()`).
- `contexts/AuthContext.tsx` — bootstraps `supabase.auth.getSession()` then
  `GET /auth/me`; refreshes signed avatar URLs every 50 minutes.
- `contexts/LibraryContext.tsx` — the actual data layer. On user change it
  parallel-fetches `materials`, `collections`, `collection_materials`,
  `notes`, hydrates `sessions` from AsyncStorage then reconciles with the DB,
  and holds **all** library state in React state.
- `contexts/ThemeContext.tsx` — local prefs only (`@Tarkeez/prefs`).

### 1.2 Existing local persistence (AsyncStorage keys)
| Key | Holds | Cloud-synced? |
|---|---|---|
| `@Tarkeez/prefs` | theme/accent/notifications | no (local-only) |
| `@Tarkeez/sessions/{userId}` | `Session[]` with `pendingSync` flag | yes, hybrid |
| `@Tarkeez/annos/{userId}/{materialId}` | per-page PDF annotations | **no** (local-only) |
| `@Tarkeez/note_strokes/{userId}/{noteId}` | `Stroke[]` | yes, 1.5s debounced PATCH |
| `@Tarkeez/_migrated_v1` | legacy-key migration sentinel | n/a |

PDFs are cached separately on the filesystem:
`${FileSystem.cacheDirectory}Tarkeez/{userId}/{materialId}.pdf`, with a 30s
download timeout and seed-on-upload.

### 1.3 The one good offline pattern already in place
Study sessions already use an optimistic local-first write + retry pattern
(`LibraryContext.tsx:584-614` / `460-496`):
1. Generate client-side UUID, mark `pendingSync: true`, persist to
   AsyncStorage immediately.
2. Best-effort POST to `/sessions`.
3. On success, clear `pendingSync`. On failure, leave it; a 4s setTimeout
   loop drains the queue when sessions state changes.
4. On hydrate, reconcile by id: DB rows are canonical, local pending rows
   missing from the DB are retained.

**This is the seed pattern we will generalize and apply to every table.**

### 1.4 Gaps that block "fully offline"
- Reads are network-first: opening the app without connectivity shows empty
  materials/collections/notes until React state is hydrated from the network.
- Materials, collections, `collection_materials`, and notes have **no**
  offline write queue — mutations fail loudly without connectivity.
- Note `drawing_strokes` survives offline only because AsyncStorage holds the
  array; but a `notes` row created offline cannot exist yet, so strokes for
  new notes are not possible offline.
- Annotations have no cloud path at all.
- No conflict-resolution policy beyond "DB always wins on rehydrate."

---

## 2. Technology Evaluation

The decision is between WatermelonDB and `expo-sqlite` + Drizzle ORM. Both
work on iOS, Android, and (via WASM) Web; both are TypeScript-friendly. The
real differences are sync philosophy, ergonomics, and how cleanly they fit a
codebase that already speaks Supabase REST.

### 2.1 WatermelonDB
**Pros**
- Built-in sync engine with a defined pull/push protocol.
- Reactive observable queries; minimal re-render cost for big lists.
- Battle-tested in large RN apps (Nozbe, Expensify-style workloads).
- Lazy loading scales to tens of thousands of rows.

**Cons**
- Decorator-heavy model classes — friction with strict TS and our "no `any`,
  no implicit types" rule, plus an extra Babel plugin.
- Schema migrations are JS objects, not SQL — debuggability suffers when
  things go wrong on a real device.
- Web adapter is **LokiJS**, not SQLite. Different engine, different
  performance profile, and your existing PWA story would diverge from
  native. (`@nozbe/watermelondb` does not ship a WASM SQLite adapter.)
- Its sync protocol expects server-side `pulled_at`/`changes` endpoints.
  Supabase does **not** provide that out of the box — you'd build a custom
  adapter on top of `select * where updated_at > ?` queries anyway. So
  you'd own the same sync code, but inside Watermelon's contract.
- Reactive observables push restructuring deep into components — every list
  becomes `withObservables`. That's a larger rewrite than Tarkeez needs.

### 2.2 `expo-sqlite` + Drizzle ORM
**Pros**
- First-class TypeScript inference from a schema declared in `.ts` — matches
  the project's strictness rule with zero ceremony.
- Plain SQL under the hood; every query is inspectable and debuggable.
- `drizzle-orm/expo-sqlite` ships a `useLiveQuery` hook that gives us
  reactive reads without restructuring components — the existing
  `useLibrary()` consumer surface barely changes.
- `expo-sqlite` (SDK 51+) has a WASM web build, so iOS/Android/PWA share
  one driver and one query language.
- Migrations are SQL via `drizzle-kit`, generated from schema diffs and
  reviewable in PRs.
- Lightweight (~150KB) — no decorators, no Babel plugin, no
  metaprogramming.
- Direct query control makes the **custom Supabase sync layer trivial** —
  it's just "select rows where dirty=1, push, mark clean."

**Cons**
- No built-in sync engine. We must build it. (We need to build one anyway
  for Supabase, so this is a wash.)
- Reactive subscription model is per-query (`useLiveQuery`) rather than
  per-record observables; for our list sizes this is fine.
- Web/PWA story still requires verifying the WASM build size and OPFS
  support in target browsers (one-off validation in Milestone 7).

### 2.3 Recommendation: `expo-sqlite` + Drizzle ORM

**Why:**
1. Tarkeez already has a working `pendingSync` write-queue pattern. Drizzle
   lets us **generalize that pattern** into a small library (~one file)
   instead of importing a whole sync framework whose contract we then have
   to bridge to Supabase.
2. The codebase rule is "Repository pattern — all Supabase calls in
   `lib/api.ts`." Drizzle keeps that intact: `lib/api.ts` becomes "local DB
   read/write + outbox push to Supabase," and the contexts barely change.
3. Strict TS is non-negotiable for you. Drizzle's inferred types are the
   cleanest in the ecosystem; WatermelonDB's decorator types are weaker.
4. One database engine across iOS, Android, and Web. Watermelon's split
   (Native SQLite vs Loki on web) would force divergent edge cases for a
   PWA-supported app.
5. The sync we need is **not** an "arbitrary CRDT" problem. It's
   "user-owned rows, last-write-wins by `updated_at`, with delete tombstones
   for the join table." That's ~200 lines of code, not a framework.

---

## 3. Local Schema Design

All tables are local replicas of Supabase rows, plus the sync-bookkeeping
columns. Tombstones (`deleted_at`) are kept locally for one sync cycle, then
hard-deleted. Times are stored as `INTEGER` epoch ms to match the existing
session conventions and avoid TZ ambiguity.

```sql
-- profiles: local cache of the signed-in user only
CREATE TABLE profiles (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT,
  photo_path      TEXT,                -- storage path, not URL
  photo_transform TEXT,                -- JSON
  updated_at      INTEGER NOT NULL,
  server_updated_at INTEGER
);

-- materials: PDF metadata; the file itself stays in cacheDirectory
CREATE TABLE materials (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  title           TEXT NOT NULL,
  file_name       TEXT,
  mime_type       TEXT DEFAULT 'application/pdf',
  size_bytes      INTEGER,
  total_pages     INTEGER,
  current_page    INTEGER DEFAULT 1,
  local_file_path TEXT,                -- absolute path in cacheDirectory or null
  is_downloaded   INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  server_updated_at INTEGER,
  sync_status     TEXT NOT NULL DEFAULT 'synced',  -- 'synced'|'dirty'|'pending_delete'
  deleted_at      INTEGER
);
CREATE INDEX materials_user_idx ON materials(user_id);
CREATE INDEX materials_sync_idx ON materials(sync_status) WHERE sync_status != 'synced';

-- collections
CREATE TABLE collections (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  name            TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  server_updated_at INTEGER,
  sync_status     TEXT NOT NULL DEFAULT 'synced',
  deleted_at      INTEGER
);
CREATE INDEX collections_user_idx ON collections(user_id);

-- collection_materials: join, mirrors the server's cm_one_target_chk XOR
CREATE TABLE collection_materials (
  id              TEXT PRIMARY KEY,    -- local synthetic uuid for outbox identity
  collection_id   TEXT NOT NULL,
  material_id     TEXT,
  note_id         TEXT,
  added_at        INTEGER NOT NULL,
  sync_status     TEXT NOT NULL DEFAULT 'synced',
  deleted_at      INTEGER,
  CHECK ((material_id IS NOT NULL) <> (note_id IS NOT NULL))
);
CREATE UNIQUE INDEX cm_coll_material_uniq
  ON collection_materials(collection_id, material_id)
  WHERE material_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX cm_coll_note_uniq
  ON collection_materials(collection_id, note_id)
  WHERE note_id IS NOT NULL AND deleted_at IS NULL;

-- notes
-- IMPORTANT: drawing strokes do NOT live in SQLite. They live on the
-- filesystem at ${documentDirectory}Tarkeez/{userId}/strokes/{noteId}.json,
-- mirroring how PDFs are handled. SQLite only holds the manifest: a path,
-- a byte-size hint, and a dirty timestamp the sync layer watches.
CREATE TABLE notes (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL,
  title                TEXT NOT NULL DEFAULT 'Untitled',
  content_html         TEXT NOT NULL DEFAULT '',
  strokes_file_path    TEXT,            -- absolute path or null when empty
  strokes_byte_size    INTEGER NOT NULL DEFAULT 0,
  strokes_dirty_at     INTEGER,         -- non-null = local file ahead of server
  strokes_server_synced_at INTEGER,     -- last successful push timestamp
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  server_updated_at    INTEGER,
  sync_status          TEXT NOT NULL DEFAULT 'synced',
  deleted_at           INTEGER
);
CREATE INDEX notes_user_idx ON notes(user_id);

-- study_sessions: immutable once written; mirrors the server XOR constraint
CREATE TABLE study_sessions (
  id              TEXT PRIMARY KEY,    -- client-supplied uuid
  user_id         TEXT NOT NULL,
  material_id     TEXT,
  note_id         TEXT,
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER NOT NULL,
  duration_sec    INTEGER NOT NULL,
  paused_sec      INTEGER DEFAULT 0,
  pages_read      INTEGER,
  page_times_json TEXT,                -- JSON Record<number, number>
  selections      INTEGER,
  words_added     INTEGER,
  keystrokes      INTEGER,
  strokes_added   INTEGER,
  created_at      INTEGER NOT NULL,
  sync_status     TEXT NOT NULL DEFAULT 'pending_create',
  CHECK ((material_id IS NOT NULL) <> (note_id IS NOT NULL))
);
CREATE INDEX sessions_user_idx ON study_sessions(user_id);
CREATE INDEX sessions_sync_idx ON study_sessions(sync_status)
  WHERE sync_status != 'synced';

-- annotations: local-only today; same shape kept so we can sync later
CREATE TABLE annotations (
  id              TEXT PRIMARY KEY,    -- composite: user_id|material_id|page
  user_id         TEXT NOT NULL,
  material_id     TEXT NOT NULL,
  page_number     INTEGER NOT NULL,
  page_data_json  TEXT NOT NULL,       -- { strokes, highlights }
  updated_at      INTEGER NOT NULL,
  UNIQUE(user_id, material_id, page_number)
);

-- generic outbox for failed/queued cloud pushes
CREATE TABLE sync_outbox (
  id              TEXT PRIMARY KEY,
  table_name      TEXT NOT NULL,
  row_id          TEXT NOT NULL,
  operation       TEXT NOT NULL,       -- 'insert'|'update'|'delete'
  payload_json    TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  next_attempt_at INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX outbox_ready_idx ON sync_outbox(next_attempt_at);

-- bookkeeping: per-table pull cursors, schema version
CREATE TABLE meta (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL
);
-- expected keys: schema_version, pull_cursor:materials, pull_cursor:notes, ...
```

**Schema notes:**
- Strokes are deliberately **not** stored in SQLite. A dense Skia drawing
  can produce 250–500 KB of JSON per note (see §5); keeping that in a row
  would bloat the DB file, slow `VACUUM`, and balloon every backup. Instead
  the strokes array is serialized to a JSON file on disk, the same way PDFs
  already live on the filesystem cache. SQLite only carries the manifest
  (`strokes_file_path`, `strokes_byte_size`, `strokes_dirty_at`,
  `strokes_server_synced_at`). The sync worker reads the file at push time
  and ships the bytes straight to Supabase's `notes.drawing_strokes` jsonb
  column — the server contract is unchanged.
- Strokes files live under `${FileSystem.documentDirectory}Tarkeez/`
  (persistent), **not** `cacheDirectory`. PDFs can be re-downloaded; locally
  drawn strokes that haven't synced yet cannot. Path:
  `${documentDirectory}Tarkeez/{userId}/strokes/{noteId}.json`.
- All "owned by user" tables carry `user_id` so multi-account on the same
  device is safe; on logout we either keep the DB and partition by user, or
  drop the DB. Recommendation: keep it; partition reads with
  `WHERE user_id = ?`.
- `sync_status` is the dirty flag; `server_updated_at` is the last server
  timestamp we observed (for LWW conflict resolution).

---

## 4. Execution Plan — Milestones

Each milestone is **independently shippable** and leaves the app in a
working state. Existing behavior is preserved until the final cutover.

### Milestone 0 — Dependencies and scaffolding *(no behavior change)*
- Add `expo-sqlite`, `drizzle-orm`, `drizzle-kit` (dev) to `package.json`.
- Create `db/` directory: `schema.ts`, `client.ts` (opens DB,
  WAL mode on native), `migrations/`.
- Generate the v1 migration with `drizzle-kit generate`.
- Wire `db.open()` into `_layout.tsx` boot so the DB is ready before
  contexts mount.
- **Acceptance:** app boots unchanged; an empty SQLite file exists; one
  smoke test inserts and selects a row in a hidden screen.

### Milestone 1 — Read-side dual-write for `materials` and `collections`
*(behavior: identical to today)*
- On every successful Supabase read in `LibraryContext`, **also** upsert
  rows into local SQLite. The UI still reads from React state.
- Add a `db/repositories/` module per entity with typed Drizzle queries.
- Backfill: on first boot after the upgrade, drain existing AsyncStorage
  caches (`@Tarkeez/sessions/...`, `@Tarkeez/note_strokes/...`,
  `@Tarkeez/annos/...`) into the new tables and set a `meta` sentinel so we
  don't run again.
- **Acceptance:** with the app open, `sqlite_master` shows the right
  schema; `SELECT COUNT(*) FROM materials` matches what the UI shows.

### Milestone 2 — Migrate reads to local DB
- Replace `LibraryContext`'s React-state-as-source with `useLiveQuery`
  reads from SQLite. The Supabase fetch still happens on user change but
  its job is reduced to "upsert into SQLite" — `useLiveQuery` then pushes
  rows into the UI.
- Empty/loading states based on `(query.status, rows.length)` from Drizzle.
- **Acceptance:** airplane-mode launch shows the full library exactly as
  it appeared online. Hot-reload causes no flash of empty state.

### Milestone 3 — Generic write queue (`sync_outbox`) and push worker
- Build `db/sync.ts`:
  - `enqueue(table, row_id, op, payload)` — inserts into `sync_outbox`.
  - `drain()` — selects ready rows, dispatches to per-table push handlers
    in `lib/api.ts`, marks rows clean on 2xx, applies exponential backoff
    on failure (1s → 2s → 4s → 16s → max 5m).
  - `start()` — runs `drain()` on app foreground, network reconnect
    (`@react-native-community/netinfo`), and a 30s heartbeat.
- Refactor the existing `recordSession` retry loop to use the outbox; this
  is the reference implementation and the unit-test target.
- **Acceptance:** turn off Wi-Fi, end a study session, the row appears
  locally with `sync_status='pending_create'`; reconnect Wi-Fi and within
  ~5s the row in Supabase appears with the same id and the local row
  flips to `'synced'`.

### Milestone 4 — Migrate mutations: collections + `collection_materials`
- `createCollection`, `updateCollection`, `deleteCollection` now write
  SQLite first and enqueue to outbox.
- Same for collection ↔ material/note attach/detach (respect the XOR
  CHECK).
- Deletes are soft locally (`deleted_at`) until the server confirms; the
  UI filters `WHERE deleted_at IS NULL`.
- **Acceptance:** offline create-collection, add-material-to-collection,
  rename, delete; reconnect; server state matches local.

### Milestone 5 — Migrate mutations: notes (text + strokes)
- `createNote`, `updateNote`, `deleteNote` go through the outbox.
- Strokes pipeline:
  1. `saveNoteStrokes(noteId, strokes)` writes the JSON to
     `${documentDirectory}Tarkeez/{userId}/strokes/{noteId}.json` via
     `FileSystem.writeAsStringAsync` (atomic temp-file + rename pattern).
  2. Updates the `notes` row: `strokes_file_path`, `strokes_byte_size`,
     `strokes_dirty_at = now()`.
  3. After a 1.5s debounce, enqueues an outbox row whose payload references
     the file path (not its contents).
  4. The push worker reads the file at send time, ships the array to
     Supabase as the existing `drawing_strokes` jsonb, then sets
     `strokes_server_synced_at = now()` and clears `strokes_dirty_at`.
- The server contract on Supabase is unchanged (still jsonb on `notes`).
- On note delete, both the row and the strokes file are removed.
- `loadNoteStrokes(noteId)` reads from the file first; if absent, falls
  back to the `drawing_strokes` jsonb on the next pull and writes the file
  through to disk.
- **Acceptance:** draw offline on an existing note → strokes persist as a
  file, reopen the app offline, strokes still there; SQLite file size stays
  flat regardless of drawing complexity; reconnect → server's jsonb
  matches.

### Milestone 6 — Migrate mutations: materials (metadata + storage)
- The metadata row (`materials` table) goes through the outbox.
- The PDF binary continues to live on the filesystem cache.
- New flow for offline upload: write file to cacheDirectory immediately,
  insert local materials row with `sync_status='pending_create'` and a
  separate `pending_upload` flag in the outbox payload. On drain, do
  Supabase Storage upload first, then the `materials` insert.
- **Acceptance:** offline-add a PDF → it shows up in the library
  immediately and is openable; reconnect → row + storage object appear
  in Supabase.

### Milestone 7 — Periodic pull + conflict resolution
- Add a per-table pull worker: `SELECT * FROM <table> WHERE user_id = ?
  AND updated_at > pull_cursor:<table>`, then upsert locally with LWW on
  `server_updated_at`.
- Run on app foreground and a 60s heartbeat.
- Conflict rule: if `local.sync_status != 'synced'` **and**
  `server.updated_at > local.server_updated_at`, the server wins for
  scalars but local non-strokes mutations are re-applied via a fresh
  outbox push. For strokes, server wins unconditionally (see §5).
- **Acceptance:** edit the same note on two devices offline; the later
  edit wins after both come online.

### Milestone 8 — Web/PWA validation
- Verify `expo-sqlite` WASM build runs in Safari, Chrome, Firefox.
- Confirm OPFS persistence works on each; fall back to IndexedDB if not.
- Measure bundle size delta; budget the WASM into the PWA precache.
- **Acceptance:** PWA opened offline shows the library identically to
  native.

### Milestone 9 — Cutover and cleanup
- Remove the AsyncStorage `@Tarkeez/sessions/...`, `@Tarkeez/annos/...`,
  `@Tarkeez/note_strokes/...` reads. Keep the migration sentinel; delete
  the migration code path on the **following** release after telemetry
  confirms no users are below the post-migration build.
- Remove the network-first React-state fields from `LibraryContext`.
- Update `CLAUDE.md` to reflect the new golden path:
  `screen → context → repository (SQLite) → outbox → lib/api.ts → Supabase`.

---

## 5. Risks and Edge Cases — Drawing Strokes

Storing strokes on the filesystem instead of in SQLite removes the
DB-bloat risk but introduces its own. Ranked by impact:

1. **Unbounded growth → unbounded push payload.** A `Stroke` is
   `{ color, width, points: {x,y}[], kind? }` (`LibraryContext.tsx:66-71`).
   A dense Skia drawing can produce strokes with hundreds of points; 50
   such strokes ≈ 250–500 KB of JSON per note. The server contract still
   ships the **entire** array on every PATCH. On a flaky connection that's
   the difference between a successful sync and a permanent retry loop.
   - *Mitigations (within this plan):* coalesce repeated dirty markers so
     we push at most once per debounce window; exponential backoff
     (Milestone 3) instead of immediate retry; cap the per-note payload
     at ~2 MB and surface a user-facing error rather than retry forever.
   - *Future option (out of scope):* split strokes into a child table on
     both client and server, push deltas. Server-schema change, deferred.

2. **Filesystem vs SQLite consistency.** The two are not transactional
   together. If the app is killed between writing the file and updating
   `strokes_dirty_at`, the row claims clean while the file is ahead — or
   vice versa.
   - *Mitigation:* always write the file **first** (atomic temp-file +
     rename), then update SQLite in the same tick. On boot, run a
     reconciliation pass: for each note, if the file's mtime is newer
     than `strokes_server_synced_at`, mark `strokes_dirty_at = file.mtime`
     so the outbox re-pushes; if the row references a file that no longer
     exists, clear the path and treat strokes as empty.

3. **Two-device "last-writer-wins" silently destroys work.** Drawing on
   device A offline then device B offline means the later push clobbers
   the earlier one.
   - *Mitigations:* document this explicitly in `CLAUDE.md` as the agreed
     semantics; surface a "this note was edited on another device" toast
     when pull detects `server_updated_at > local.server_updated_at` and
     there are local pending stroke edits; consider a one-tap "save my
     copy as a duplicate" recovery path before clobbering.

4. **Stroke transforms (`lib/strokeTransform.ts`) mutate the array
   in-place.** Lasso transforms, scale, and bbox operations rewrite
   points. If a transform runs while a push is in-flight, the pushed
   payload may not match what's currently on disk.
   - *Mitigation:* the push worker re-reads the file inside the same
     async task that performs the PATCH; never push a captured in-memory
     snapshot.

5. **AsyncStorage → filesystem backfill loss.** The existing
   `@Tarkeez/note_strokes/{userId}/{noteId}` cache may be **ahead** of
   the server (debounced PATCH not yet flushed when the user upgraded).
   If we treat the server as canonical on first launch we silently lose
   those strokes.
   - *Mitigation:* the Milestone 1 backfill must run **before** the first
     Supabase pull. For each AsyncStorage strokes key: write the JSON to
     the new filesystem path, set `strokes_dirty_at = now()` on the
     notes row, then delete the AsyncStorage key once the file write is
     confirmed.

6. **Disk pressure and orphan files.** A user with hundreds of large
   drawings could accumulate tens of MB under `documentDirectory`.
   Deleting a note must delete its strokes file; failed deletes become
   orphans.
   - *Mitigation:* on note delete enqueue a filesystem-delete alongside
     the DB delete; on app launch, periodically (e.g. once a week)
     enumerate `${documentDirectory}Tarkeez/{userId}/strokes/` and remove
     files whose `note_id` is not present in SQLite.

7. **Web/PWA filesystem path.** `expo-file-system` on web is backed by
   IndexedDB-emulated paths and may not support arbitrary subpaths.
   - *Mitigation:* on web, fall back to storing strokes as IndexedDB
     entries keyed by `{userId}/{noteId}` via the same abstraction layer.
     Verified in Milestone 8.

8. **`page_times` JSONB on `study_sessions`** has the same shape risk
   but is bounded by page count and written once at session end, so it
   isn't a real issue today. Listed for completeness.

---

## 6. Out of Scope (Explicit Non-Goals)
- Real-time multi-device sync via Supabase Realtime channels. The
  60-second pull cadence is sufficient for the current product; Realtime
  is reserved for the future Live Collaborative Sessions feature.
- Server schema changes. Every milestone above is implementable with the
  current Supabase tables and policies.
- A CRDT for strokes. See §5 risk #3; deliberately deferred.
- Replacing the PDF filesystem cache with SQLite blobs. Filesystem is
  the right place for 15 MB files.
- Cross-user data sharing on the same device. Tarkeez is single-account
  per install today; partitioning by `user_id` is a safety net, not a
  product feature.

---

## 7. How To Verify (End-to-End)
1. **Airplane-mode cold start:** install fresh build → log in online once
   → kill the app → airplane mode on → relaunch → library, notes, and
   sessions render from SQLite within 500 ms with no spinner.
2. **Offline write round-trip:** airplane mode on → create a collection,
   add a PDF, draw on a note, end a study session → airplane mode off →
   within 30 s, Supabase `materials`, `collections`,
   `collection_materials`, `notes`, `study_sessions` reflect all changes
   with matching ids.
3. **Conflict probe:** two devices, both offline, both edit the same
   note's title → bring A online, then B → B's title is the one that
   sticks (LWW), no crash, no duplicate row.
4. **Strokes overflow:** synthesize a 5 MB strokes payload on a test
   note → confirm push is rejected with a user-visible error rather than
   an infinite retry loop.
5. **Schema-migration safety:** simulate upgrading from a build that
   only had AsyncStorage caches → confirm backfill runs once, sentinel
   set, AsyncStorage strokes that were ahead of the server are pushed up
   rather than overwritten.

---

## 8. Files Likely to Change (for reference only — no edits yet)
- New: `db/schema.ts`, `db/client.ts`, `db/migrations/*`,
  `db/repositories/*.ts`, `db/sync.ts`, `db/backfill.ts`,
  `db/strokesStore.ts` (filesystem abstraction for stroke files; web
  variant uses IndexedDB).
- Modified: `lib/api.ts` (split into "remote" push handlers consumed by
  `db/sync.ts`); `contexts/LibraryContext.tsx` (state replaced with
  `useLiveQuery` reads; `saveNoteStrokes`/`loadNoteStrokes` route through
  `db/strokesStore.ts`); `app/_layout.tsx` (boot the DB before
  contexts); `CLAUDE.md` (update the Golden Path, key list, and the
  strokes-on-filesystem rule).
- Untouched: navigation, theme, all screen layouts, all TypeScript types
  exported from contexts (per the project rule "do not change existing
  TypeScript types" — new types live in `db/`).
