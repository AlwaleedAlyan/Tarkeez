import { ApiError } from "@/lib/api";

// Labeled warning/error logger. Used by every `.catch` we add to `void`
// promises and by the global unhandled-rejection tracker. Routes benign
// transient failures (offline / aborted fetch / ApiError) to `console.warn`
// so they don't show up as red `ERROR` lines in the Metro dev console.
export function logRejection(label: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const isBenign =
    (err instanceof TypeError && /network request failed/i.test(message)) ||
    err instanceof ApiError;
  if (isBenign) {
    console.warn(`[${label}] ${message}`);
  } else {
    console.error(`[${label}]`, err);
  }
}
