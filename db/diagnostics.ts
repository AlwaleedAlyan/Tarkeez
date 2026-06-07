import { sqlite } from "@/db/client";

// TEMPORARY diagnostic for the "Insights shows zero" investigation.
// Logs decisive runtime facts so we can tell whether sessions are being
// inserted, what their durationSec is, whether they're tied to the right
// user_id, and whether the table/columns even exist. Remove once the
// root cause is fixed.
export function logSessionsDiagnostic(): void {
  if (!sqlite) {
    console.info("[diag] sqlite is null (legacy/web fallback path)");
    return;
  }
  try {
    const cols = sqlite.getAllSync<{ name: string }>(
      "PRAGMA table_info('study_sessions')",
    );
    if (cols.length === 0) {
      console.warn("[diag] study_sessions table does NOT exist");
      return;
    }
    console.info(
      "[diag] study_sessions columns:",
      cols.map((c) => c.name).join(", "),
    );

    const count = sqlite.getFirstSync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM study_sessions",
    );
    console.info("[diag] study_sessions row count:", count?.n ?? "?");

    // Break down by user_id — if sessions exist under a different user_id
    // than the currently-logged-in account, useLiveSessions's WHERE filter
    // returns [] and Insights shows zero even though rows are present.
    const byUser = sqlite.getAllSync<{ user_id: string; n: number }>(
      "SELECT user_id, COUNT(*) AS n FROM study_sessions GROUP BY user_id",
    );
    for (const u of byUser) {
      console.info(
        `[diag] sessions for user_id=${u.user_id?.slice(0, 8) ?? "NULL"}: ${u.n}`,
      );
    }

    // Duration distribution — if the bulk of rows are durationSec=0, the
    // closure-zero bug is still active (likely a stale build / hot-reload
    // didn't pick up the ref fix).
    const zeroDur = sqlite.getFirstSync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM study_sessions WHERE duration_sec = 0",
    );
    const realDur = sqlite.getFirstSync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM study_sessions WHERE duration_sec >= 5",
    );
    console.info(
      `[diag] duration_sec breakdown: zero=${zeroDur?.n ?? 0} usable(>=5s)=${realDur?.n ?? 0}`,
    );

    // Sync status — pending rows haven't reached Supabase yet but ARE
    // local (Insights reads from SQLite, not the server).
    const byStatus = sqlite.getAllSync<{ sync_status: string; n: number }>(
      "SELECT sync_status, COUNT(*) AS n FROM study_sessions GROUP BY sync_status",
    );
    for (const r of byStatus) {
      console.info(`[diag] sync_status=${r.sync_status}: ${r.n}`);
    }

    const sample = sqlite.getAllSync<{
      id: string;
      user_id: string;
      duration_sec: number;
      sync_status: string;
      material_id: string | null;
      note_id: string | null;
      external_url: string | null;
      started_at: number;
    }>(
      "SELECT id, user_id, duration_sec, sync_status, material_id, note_id, external_url, started_at FROM study_sessions ORDER BY started_at DESC LIMIT 5",
    );
    for (const r of sample) {
      const when = new Date(r.started_at).toISOString();
      console.info(
        `[diag] session ${r.id.slice(0, 8)} u=${r.user_id?.slice(0, 8) ?? "NULL"} dur=${r.duration_sec}s status=${r.sync_status} m=${!!r.material_id} n=${!!r.note_id} url=${!!r.external_url} at=${when}`,
      );
    }

    const outbox = sqlite.getFirstSync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM sync_outbox WHERE table_name = 'study_sessions'",
    );
    console.info("[diag] pending session outbox rows:", outbox?.n ?? "?");
  } catch (err) {
    console.error("[diag] logSessionsDiagnostic failed", err);
  }
}
