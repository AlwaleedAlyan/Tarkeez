import { sqlite } from "@/db/client";

// TEMPORARY one-shot diagnostic for the "Insights shows zero" bug.
// Logs the decisive runtime facts about the local study_sessions table so we
// can tell whether sessions are being inserted, what their durationSec is, and
// whether the table/columns even exist. Remove once the root cause is fixed.
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

    const sample = sqlite.getAllSync<{
      id: string;
      duration_sec: number;
      sync_status: string;
      material_id: string | null;
      note_id: string | null;
      external_url: string | null;
    }>(
      "SELECT id, duration_sec, sync_status, material_id, note_id, external_url FROM study_sessions ORDER BY started_at DESC LIMIT 5",
    );
    for (const r of sample) {
      console.info(
        `[diag] session ${r.id.slice(0, 8)} dur=${r.duration_sec}s status=${r.sync_status} m=${!!r.material_id} n=${!!r.note_id} url=${!!r.external_url}`,
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
