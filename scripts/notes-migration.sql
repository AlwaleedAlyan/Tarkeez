-- Stymer notes feature migration.
-- Run this once in the Supabase SQL editor before shipping the notes feature.

-- 1. notes table
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Untitled',
  content_html text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_id_idx on public.notes(user_id);

alter table public.notes enable row level security;

drop policy if exists notes_select_own on public.notes;
drop policy if exists notes_insert_own on public.notes;
drop policy if exists notes_update_own on public.notes;
drop policy if exists notes_delete_own on public.notes;

create policy notes_select_own on public.notes
  for select using (auth.uid() = user_id);
create policy notes_insert_own on public.notes
  for insert with check (auth.uid() = user_id);
create policy notes_update_own on public.notes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy notes_delete_own on public.notes
  for delete using (auth.uid() = user_id);

-- 2. Extend collection_materials so it can also hold notes.
-- A row links a collection to EITHER a material or a note, never both.

alter table public.collection_materials
  drop constraint if exists collection_materials_pkey;

alter table public.collection_materials
  alter column material_id drop not null;

alter table public.collection_materials
  add column if not exists note_id uuid references public.notes(id) on delete cascade;

alter table public.collection_materials
  drop constraint if exists cm_one_target_chk;

alter table public.collection_materials
  add constraint cm_one_target_chk
    check ( (material_id is not null)::int + (note_id is not null)::int = 1 );

create unique index if not exists cm_collection_material_uniq
  on public.collection_materials(collection_id, material_id)
  where material_id is not null;

create unique index if not exists cm_collection_note_uniq
  on public.collection_materials(collection_id, note_id)
  where note_id is not null;

create index if not exists cm_note_id_idx on public.collection_materials(note_id);

-- 3. drawing_strokes JSONB column on notes (used by the in-note drawing canvas).
alter table public.notes
  add column if not exists drawing_strokes jsonb not null default '[]'::jsonb;

-- 4. Make study_sessions support both PDFs and notes; add note-specific counters.
alter table public.study_sessions
  alter column material_id drop not null;

alter table public.study_sessions
  alter column pages_read drop not null,
  alter column pages_read drop default;

alter table public.study_sessions
  add column if not exists note_id        uuid references public.notes(id) on delete cascade,
  add column if not exists words_added    integer,
  add column if not exists keystrokes     integer,
  add column if not exists strokes_added  integer;

alter table public.study_sessions
  drop constraint if exists ss_one_target_chk;

alter table public.study_sessions
  add constraint ss_one_target_chk
    check ((material_id is not null)::int + (note_id is not null)::int = 1);

create index if not exists ss_note_id_idx on public.study_sessions(note_id);
create index if not exists ss_material_id_idx on public.study_sessions(material_id);

-- 5. Avatars bucket — per-user profile photo storage. Mirrors `materials` policy shape.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', false, 5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_select_own on storage.objects;
drop policy if exists avatars_insert_own on storage.objects;
drop policy if exists avatars_update_own on storage.objects;
drop policy if exists avatars_delete_own on storage.objects;

create policy avatars_select_own on storage.objects for select
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy avatars_insert_own on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy avatars_update_own on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy avatars_delete_own on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- 6. Materials bucket — (re-)apply RLS policies and diagnose path mismatches.
--    Idempotent. Run if cross-device PDF loads aren't working.
insert into storage.buckets (id, name, public, file_size_limit)
values ('materials', 'materials', false, 15 * 1024 * 1024)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists materials_select_own on storage.objects;
drop policy if exists materials_insert_own on storage.objects;
drop policy if exists materials_update_own on storage.objects;
drop policy if exists materials_delete_own on storage.objects;

create policy materials_select_own on storage.objects for select
  using (bucket_id = 'materials' and auth.uid()::text = (storage.foldername(name))[1]);
create policy materials_insert_own on storage.objects for insert
  with check (bucket_id = 'materials' and auth.uid()::text = (storage.foldername(name))[1]);
create policy materials_update_own on storage.objects for update
  using (bucket_id = 'materials' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'materials' and auth.uid()::text = (storage.foldername(name))[1]);
create policy materials_delete_own on storage.objects for delete
  using (bucket_id = 'materials' and auth.uid()::text = (storage.foldername(name))[1]);

-- Diagnostic: list each material and whether the storage object actually
-- exists at the expected path.
--   object_exists = false  →  upload silently failed OR the filename in the
--                             DB doesn't match the bytes in storage (encoding
--                             / unicode normalization mismatch).
--   object_exists = true   →  if the file still won't load on another device,
--                             the issue is RLS or signed-URL related, not the
--                             upload — share the new "HTTP …" / "Could not
--                             sign URL …" error message.
select
  m.id,
  m.title,
  m.user_id,
  m.file_name,
  (m.user_id::text || '/' || m.file_name) as expected_path,
  exists(
    select 1 from storage.objects o
    where o.bucket_id = 'materials'
      and o.name = (m.user_id::text || '/' || m.file_name)
  ) as object_exists
from public.materials m
order by m.created_at desc
limit 20;
