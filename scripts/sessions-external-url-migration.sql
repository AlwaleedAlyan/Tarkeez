-- Adds external_url to study_sessions and widens the single-target check to a
-- 3-way XOR so web/YouTube browser sessions (no material_id/note_id) can sync.
--
-- Run against the Tarkeez Supabase project (SQL editor or `supabase db push`).
-- The local SQLite mirror already has this shape (migration 0002 / the
-- ensureSessionsSchema self-heal). Until this runs, browser sessions POST'd by
-- the push worker are rejected and sit pending in the outbox forever.

alter table public.study_sessions
  add column if not exists external_url text;

alter table public.study_sessions
  drop constraint if exists ss_one_target_chk;

alter table public.study_sessions
  add constraint ss_one_target_chk
    check (
      (material_id is not null)::int
      + (note_id is not null)::int
      + (external_url is not null)::int
      = 1
    );
