-- Drop the keystrokes column from study_sessions on Supabase.
--
-- Run this in the Supabase SQL editor (or `supabase db push`) once. The local
-- SQLite mirror is dropped via db/migrations/0004_fast_saracen.sql on next
-- app boot.
--
-- Safe to run multiple times: DROP COLUMN IF EXISTS is idempotent. No RLS
-- policies, views, functions, indexes, or triggers reference this column, so a
-- single ALTER TABLE is sufficient.

alter table public.study_sessions
  drop column if exists keystrokes;

-- Verify (optional): the keystrokes column should no longer appear.
-- select column_name
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'study_sessions';
