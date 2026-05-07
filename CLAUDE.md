# Stymer — Project Memory

## What This App Does
Stymer is a study time tracker that monitors student activity
while reading materials. Users can upload PDFs, track study
sessions, view insights, and study together with mates.
Available on iOS, Android, and Desktop (PWA).

## Tech Stack
- Frontend: Expo / React Native (expo-router)
- Language: TypeScript
- Backend: Supabase (Auth, Database, Storage, Realtime)
- State Management: React Context (AuthContext, LibraryContext)
- Package manager: pnpm
- Validation: Zod

## Project Structure
- app/            → screens and navigation (expo-router)
- components/     → reusable UI components
- contexts/       → AuthContext, LibraryContext, ThemeContext
- lib/            → api.ts (Supabase calls), supabase.ts (client)
- constants/      → colors, themes
- hooks/          → useColors

## Environment Variables
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY

## Supabase Infrastructure

### Project
- Project name: Stymer
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
  can read it from raw_user_meta_data. Do NOT also insert
  into profiles from app code — that causes a
  profiles_pkey duplicate key error.

### Database Tables

profiles
- id (uuid, references auth.users, primary key)
- name (text, not null)
- email (text)
- photo_uri (text)
- photo_transform (jsonb)
- RLS: view ✅ insert ✅ update ✅

materials
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
- RLS policies (must exist for upload to work):
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
  Verify with:
  `select policyname, cmd, qual, with_check from pg_policies
   where schemaname='public' and tablename='materials';`

study_sessions
- id (uuid, auto generated, primary key)
- user_id (uuid, references profiles)
- material_id (uuid, references materials)
- started_at (bigint)
- ended_at (bigint)
- duration_sec (integer)
- paused_sec (integer, default 0)
- pages_read (integer, default 0)
- page_times (jsonb)
- selections (integer, default 0)
- created_at (timestamptz)
- RLS: view ✅ insert ✅ update ✅ delete ✅

mates
- id (uuid, auto generated, primary key)
- user_id (uuid, references profiles)
- mate_id (uuid, references profiles)
- status (text: 'pending', 'accepted', 'blocked')
- created_at (timestamptz)
- RLS: view ✅ insert ✅ update ✅ delete ✅

collections
- id (uuid, primary key, default gen_random_uuid())
- user_id (uuid, references auth.users on delete cascade)
- name (text, not null)
- created_at (timestamptz, default now())
- RLS: select/insert/update/delete all gated on
  `auth.uid() = user_id` (mirrors the materials policy pattern)

collection_materials  (many-to-many join: a material can live in N
collections at once; a collection can hold many materials)
- collection_id (uuid, references collections on delete cascade)
- material_id  (uuid, references materials   on delete cascade)
- added_at     (timestamptz, default now())
- primary key  (collection_id, material_id) — prevents duplicates
- index on material_id for "which collections is this material in?"
- RLS:
  - select / delete: gated on owning the parent collection
    (`exists(... where c.id = collection_id and c.user_id = auth.uid())`)
  - insert: gated on owning the parent collection ONLY — the user
    does NOT need to own the material being attached. Forward-
    compatible with future mate-shared materials.

### Storage
- Bucket name: materials
- Visibility: PRIVATE
- File size limit: 15MB (enforced client-side AND in lib/api.ts;
  also set the bucket `file_size_limit` in Supabase to 15MB)
- Allowed MIME types: Any
- Policies: upload ✅ read ✅ delete ✅
- Files served via signed URLs (valid 3600 seconds)
- File path structure: {user_id}/{file_name}
- Single source of truth for the limit: `MAX_MATERIAL_BYTES` in lib/api.ts

### How Auth Works
- lib/supabase.ts initializes Supabase client with AsyncStorage
- lib/api.ts routes all calls to Supabase (no custom REST backend)
- contexts/AuthContext.tsx restores session via getSession() on mount
- onAuthStateChange listener keeps user state in sync automatically
- No manual JWT handling — Supabase manages all tokens automatically

### How Library Persistence Works
- Materials are stored in the `materials` Postgres table; PDF blobs live in
  the `materials` Storage bucket at path `{user_id}/{file_name}`.
- contexts/LibraryContext.tsx auto-loads materials, collections, and
  collection-material join rows whenever `user` changes (login, app launch
  with existing session) by calling GET `/materials`, `/collections`, and
  `/collection-materials`. RLS scopes everything to the current user.
- The library top-level renders only **uncategorized** materials —
  `materials.filter(m => !cmRows.some(r => r.materialId === m.id))`,
  surfaced by the context as `uncategorizedMaterials`. Materials in any
  collection are reachable only via the collection detail screen.
- Collections render as a horizontal strip above the uncategorized list.
  Tapping one navigates to `app/collection/[id].tsx`.
- The empty state shows only when both `collections` and
  `uncategorizedMaterials` are empty.
- Local cache: `${cacheDirectory}Stymer/{user_id}/{material_id}.pdf` is a
  download-on-demand cache populated by `ensureLocalFile()`. Sessions and
  annotations are stored locally in AsyncStorage (not in the DB).

## Key Technical Decisions
- Migrated from custom Express backend to Supabase
- fileUrl() in lib/api.ts is ASYNC — must always be awaited
- Sessions stored locally in AsyncStorage (not Supabase DB)
- Annotations stored locally in AsyncStorage (not Supabase DB)
- All tables have Row Level Security (RLS) enabled
- Storage bucket is private — always use signed URLs, never public URLs
- profiles table auto-populated via trigger on auth.users insert

## Features Built
- Email/password authentication (signup, login, logout)
- Profile management (name, email, photo, password update)
- PDF material upload and viewing
- Study session recording and tracking
- PDF annotations and highlights (stored locally)
- Cross-device file access via Supabase Storage signed URLs

## Features Still to Build
- Mate/friend system (mates table ready)
- Live collaborative study sessions (Supabase Realtime)
- Study insights and analytics screen
- Desktop PWA optimization
- Push notifications

## Important Rules for Claude Code
- Never hardcode Supabase URL or keys — use env variables only
- Always await fileUrl() — it is async
- Do not change any existing TypeScript types
- Do not modify navigation or layout files unless asked
- Do not change AsyncStorage keys — prefix is @stymer/
- Test all Supabase queries with RLS in mind
- When adding new tables, always enable RLS and add policies