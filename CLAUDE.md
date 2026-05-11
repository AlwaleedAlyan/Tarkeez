# Stymer — Project Memory

## What This App Does
Stymer is a study time tracker that monitors student activity while reading materials.
Users can upload PDFs, track study sessions, take notes, view insights, and study
together with mates. Available on iOS, Android, and Desktop (PWA).

---

## Tech Stack
- Frontend: Expo / React Native (expo-router)
- Language: TypeScript (strict — no `any`, no implicit types)
- Backend: Supabase (Auth, Database, Storage, Realtime)
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
- After installing the dev build on a device, run `pnpm exec expo start
  --dev-client` and scan the QR with the dev client (NOT with Expo Go).

## Project Structure
```
app/              → screens and navigation (expo-router)
components/       → reusable UI components
contexts/         → AuthContext, LibraryContext, ThemeContext
lib/              → api.ts (Supabase calls), supabase.ts (client)
constants/        → colors, themes, design tokens
hooks/            → useColors
```

### Feature Structure (for new features)
```
/features
  /classifier     → URL & YouTube classification (upcoming)
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
screen (app/) → context/hook → lib/api.ts → Supabase
```
- Business logic lives in `lib/api.ts` — never in components or screens
- UI state lives in contexts — never fetched directly from screens
- New tables always need: RLS enabled + policies mirroring existing pattern
- Offline-first: any user-generated data must work without network

### Before Writing Code, Always Ask:
1. Where does this data live? (local, remote, cache?)
2. What happens offline?
3. Does this need RLS? (answer is always yes)
4. Is there a simpler approach that achieves the same result?
5. Does this create a privacy or security concern?

### Key Patterns
- **Repository pattern** — all Supabase calls abstracted in `lib/api.ts`
- **Offline-first** — AsyncStorage cache first, sync to Supabase in parallel
- **Hybrid sync** — failed POSTs set `pendingSync=true`, retried on reconnect
- **Immutable sessions** — once a study session ends, it cannot be edited
- **No screen reads** — classifier uses URL/domain only, never page content

---

## 🎨 Design Rules

### Stymer's Design Personality
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

### AsyncStorage
- Key prefix is `@Stymer/` (capital S) — never `@stymer/`
- Never change existing AsyncStorage keys — breaking change
- Known keys:
  - `@Stymer/sessions/{userId}` — study sessions cache
  - `@Stymer/note_strokes/{userId}/{noteId}` — drawing strokes cache

### Performance
- Classify URLs on first visit → **cache result** — never re-classify same domain
- Study session timer runs locally — never depends on network
- Feed/social features are lazy loaded — never block core study features
- Debounce all user-input syncs (notes: ~1.5s, sessions: ~4s)
- Memoize expensive computations

---

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
  can read it from raw_user_meta_data.
- ⚠️ Do NOT also insert into profiles from app code — causes profiles_pkey duplicate key error

### How Auth Works
- lib/supabase.ts initializes Supabase client with AsyncStorage
- lib/api.ts routes all calls to Supabase (no custom REST backend)
- contexts/AuthContext.tsx restores session via getSession() on mount
- onAuthStateChange listener keeps user state in sync automatically
- No manual JWT handling — Supabase manages all tokens automatically

### How Library Persistence Works
- Materials stored in `materials` Postgres table; PDF blobs in `materials` Storage bucket
- LibraryContext auto-loads materials, collections, and join rows on user change
- Library top-level renders only uncategorized materials
- `uncategorizedMaterials` = `materials.filter(m => !cmRows.some(r => r.materialId === m.id))`
- Local cache: `${cacheDirectory}Stymer/{user_id}/{material_id}.pdf` (download-on-demand)

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
- id (uuid, primary key) — client-supplied (uuidV4) so AsyncStorage and DB share same id
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
- Storage: hybrid AsyncStorage + Supabase POST (pendingSync pattern, 4s debounce)

### notes
- id (uuid, primary key, default gen_random_uuid())
- user_id (uuid, references profiles on delete cascade, not null)
- title (text, not null, default 'Untitled')
- content_html (text, not null, default '') — HTML from react-native-pell-rich-editor
- drawing_strokes (jsonb, not null, default '[]') — Stroke objects
  ({ color, width, points: {x,y}[], kind?: 'pen'|'highlighter' })
  Cached locally under @Stymer/note_strokes/{userId}/{noteId}, synced with ~1.5s debounced PATCH
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
- File path: {user_id}/avatar.<ext> — one row per user, upsert on change
- Store the PATH in profiles.photo_uri — not the URL
- Re-sign every 50 minutes to avoid expired URLs in long sessions
- Legacy file:// and http(s):// values pass through resolveAvatarUri unchanged

---

## Key Technical Decisions
- ⚠️ `fileUrl()` in lib/api.ts is ASYNC — must always be awaited
- Sessions are hybrid-synced: AsyncStorage cache (immediate, offline-safe) + parallel Supabase POST
- PDF and note sessions share the study_sessions table
- Annotations stored locally in AsyncStorage (not Supabase DB)
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
- PDF annotations and highlights (stored locally)
- Cross-device file access via Supabase Storage signed URLs
- Built-in rich text notes (Supabase-synced, addable to collections)
- Collections (group materials and notes)
- Drawing canvas in notes

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

### URL Classifier (Browser Window)
3-tier system — URL/domain only, never read page content:
```
Tier 1: Local whitelist/blacklist → instant decision
Tier 2: Rule-based (.edu TLD, keywords in domain: learn/study/academy/course)
Tier 3: LLM API call (only if Tier 1 & 2 inconclusive) → cache result
```
- Always cache classification result after first lookup (by domain, not full URL)
- Privacy rule: domain name only — never URL path, never page content

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

### Stymer Pro (Subscription)
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
- Use `@stymer/` (lowercase) — always `@Stymer/`