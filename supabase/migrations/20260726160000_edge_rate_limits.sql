-- FIX-01: rate-limit bookkeeping for Edge Functions.
--
-- Provides public.check_rate_limit(), an atomic fixed-window counter used by
-- the classify-url / classify-youtube Edge Functions to throttle per-user
-- spend on paid third-party APIs (Gemini, YouTube Data).
--
-- Security model:
--   * The table is RLS-enabled with no policies and all direct grants revoked
--     — clients can never read or write counters.
--   * The function is SECURITY DEFINER and executable ONLY by service_role,
--     i.e. callable exclusively from trusted server-side code (Edge Functions).

create table if not exists public.edge_rate_limits (
  key text primary key,
  window_start timestamptz not null,
  request_count integer not null default 0
);

alter table public.edge_rate_limits enable row level security;

revoke all on table public.edge_rate_limits from anon, authenticated;

comment on table public.edge_rate_limits is
  'Fixed-window rate-limit counters consumed by Edge Functions via check_rate_limit(). Rows self-overwrite each window; optionally prune stale rows with pg_cron.';

-- Atomic check-and-increment. Returns:
--   { allowed: bool, remaining: int, retry_after_seconds: int }
-- The ON CONFLICT upsert takes a row lock, so concurrent invocations of the
-- same key serialize correctly.
create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_reset_at timestamptz;
  v_count integer;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'check_rate_limit: limit and window must be positive';
  end if;

  -- Align to the fixed window boundary.
  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );
  v_reset_at := v_window_start + make_interval(secs => p_window_seconds);

  insert into public.edge_rate_limits (key, window_start, request_count)
  values (p_key, v_window_start, 1)
  on conflict (key) do update set
    window_start = excluded.window_start,
    request_count = case
      -- New window started: reset the counter.
      when public.edge_rate_limits.window_start < excluded.window_start then 1
      else public.edge_rate_limits.request_count + 1
    end
  returning request_count into v_count;

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'remaining', greatest(p_limit - v_count, 0),
    'retry_after_seconds',
      greatest(0, floor(extract(epoch from v_reset_at - v_now))::integer)
  );
end;
$$;

-- Functions are EXECUTE-granted to PUBLIC by default in Postgres — revoke,
-- then grant only to service_role.
revoke all on function public.check_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer)
  to service_role;

-- Optional: prune stale counter rows daily (requires pg_cron extension):
--   select cron.schedule(
--     'prune-edge-rate-limits',
--     '17 3 * * *',
--     $$delete from public.edge_rate_limits
--       where window_start < now() - interval '2 days'$$
--   );
