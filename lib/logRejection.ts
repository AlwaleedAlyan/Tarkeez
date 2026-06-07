import { ApiError } from "@/lib/api";

// True for the transient "no internet" failure that `fetch` throws on both
// React Native (`TypeError: Network request failed`) and Web (`TypeError:
// Failed to fetch`). The local SQLite write that preceded it is unaffected —
// the outbox row sits with `sync_status=pending_*` waiting for the next
// reconnect — so callers should treat this as a warning, not an error.
export function isOfflineError(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false;
  return /Network request failed|Failed to fetch/i.test(err.message);
}

// Labeled warning/error logger. Used by every `.catch` we add to `void`
// promises and by the global unhandled-rejection tracker. Routes benign
// transient failures (offline / aborted fetch / ApiError) to `console.warn`
// so they don't show up as red `ERROR` lines in the Metro dev console.
export function logRejection(label: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  if (isOfflineError(err) || err instanceof ApiError) {
    console.warn(`[${label}] ${message}`);
  } else {
    console.error(`[${label}]`, err);
  }
}
