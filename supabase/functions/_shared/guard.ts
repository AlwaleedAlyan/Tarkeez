// Shared auth + rate-limit guard for Edge Functions (audit FIX-01).
//
// Both classifier functions previously ran unauthenticated and unthrottled,
// letting anyone holding the public anon key burn Gemini/YouTube API quota.
// This module provides:
//   1. requireUserId  — verifies the caller's Supabase JWT and returns their
//      user id. Works even if gateway-level verify_jwt is disabled.
//   2. rateLimit      — atomic per-user fixed-window counter backed by
//      Postgres (public.check_rate_limit RPC), consistent across isolates.
//
// Failure policy is FAIL-CLOSED: any guard error rejects the request. This is
// safe because the client classifier (features/classifier/*) degrades to an
// optimistic local verdict on any remote error.

// @ts-expect-error — esm.sh URL import only resolves inside the Deno runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// @ts-expect-error — Deno is a runtime global on Supabase Functions.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
// @ts-expect-error — Deno is a runtime global on Supabase Functions.
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// @ts-expect-error — Deno is a runtime global on Supabase Functions.
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";

/** Error carrying an HTTP status; handlers translate it into a Response. */
export class HttpError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(status: number, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Verifies the Authorization: Bearer <jwt> header against Supabase Auth and
 * returns the authenticated user's id. Throws HttpError(401) otherwise.
 */
export async function requireUserId(req: Request): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new HttpError(500, "auth_not_configured");
  }
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "missing_authorization");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) throw new HttpError(401, "invalid_token");
  return data.user.id as string;
}

export type RateLimitOutcome = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Increments the fixed-window counter for (bucket, userId) and reports whether
 * the request is within `limit` requests per `windowSeconds`. Uses the service
 * role: the caller is already authenticated, and the counter table is internal
 * bookkeeping with RLS locked down. Throws HttpError(503) if the backing RPC
 * is unavailable (fail-closed to protect paid API quota).
 */
export async function rateLimit(
  userId: string,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitOutcome> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(503, "rate_limit_unavailable");
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: `${bucket}:${userId}`,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error || !data) {
    throw new HttpError(503, "rate_limit_unavailable");
  }
  const row = data as {
    allowed?: unknown;
    remaining?: unknown;
    retry_after_seconds?: unknown;
  };
  return {
    allowed: row.allowed === true,
    remaining: typeof row.remaining === "number" ? row.remaining : 0,
    retryAfterSeconds: typeof row.retry_after_seconds === "number"
      ? row.retry_after_seconds
      : windowSeconds,
  };
}
