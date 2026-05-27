import { sqlite } from "@/db/client";

// Defensive self-heal for the study_sessions table.
//
// The `external_url` column (and the 3-way material/note/external XOR check)
// is introduced by migration 0002. If a build is running against a DB where
// that migration never applied — a stale install, or a migration that errored
// at boot — then every session insert AND the live `select *` reference a
// column that doesn't exist and throw, so NO sessions persist or render and
// the failure is otherwise silent. Drizzle won't re-run a migration it has
// already recorded, so this guard repairs the table independently of the
// migration journal.
//
// Presence of `external_url` is 1:1 with migration 0002 having run, so when
// the column exists this is a no-op. When it's missing we rebuild the table to
// the target shape (preserving existing rows). Runs synchronously at boot
// before the providers mount, so the first live query sees the healed table.

const REBUILD_SQL = `
CREATE TABLE IF NOT EXISTS \`__heal_study_sessions\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`user_id\` text NOT NULL,
  \`material_id\` text,
  \`note_id\` text,
  \`external_url\` text,
  \`started_at\` integer NOT NULL,
  \`ended_at\` integer NOT NULL,
  \`duration_sec\` integer NOT NULL,
  \`paused_sec\` integer DEFAULT 0,
  \`pages_read\` integer,
  \`page_times_json\` text,
  \`selections\` integer,
  \`words_added\` integer,
  \`keystrokes\` integer,
  \`strokes_added\` integer,
  \`created_at\` integer NOT NULL,
  \`sync_status\` text DEFAULT 'pending_create' NOT NULL,
  CONSTRAINT "ss_xor_chk" CHECK((CASE WHEN "__heal_study_sessions"."material_id" IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN "__heal_study_sessions"."note_id" IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN "__heal_study_sessions"."external_url" IS NOT NULL THEN 1 ELSE 0 END) = 1)
);
INSERT INTO \`__heal_study_sessions\`("id", "user_id", "material_id", "note_id", "external_url", "started_at", "ended_at", "duration_sec", "paused_sec", "pages_read", "page_times_json", "selections", "words_added", "keystrokes", "strokes_added", "created_at", "sync_status")
  SELECT "id", "user_id", "material_id", "note_id", NULL, "started_at", "ended_at", "duration_sec", "paused_sec", "pages_read", "page_times_json", "selections", "words_added", "keystrokes", "strokes_added", "created_at", "sync_status" FROM \`study_sessions\`;
DROP TABLE \`study_sessions\`;
ALTER TABLE \`__heal_study_sessions\` RENAME TO \`study_sessions\`;
CREATE INDEX IF NOT EXISTS \`sessions_user_idx\` ON \`study_sessions\` (\`user_id\`);
CREATE INDEX IF NOT EXISTS \`sessions_sync_idx\` ON \`study_sessions\` (\`sync_status\`) WHERE "study_sessions"."sync_status" != 'synced';
`;

function hasExternalUrlColumn(): boolean {
  if (!sqlite) return true;
  const cols = sqlite.getAllSync<{ name: string }>(
    "PRAGMA table_info('study_sessions')",
  );
  return cols.some((c) => c.name === "external_url");
}

export function ensureSessionsSchema(): void {
  if (!sqlite) return; // legacy (db == null) path has no SQLite table
  try {
    if (hasExternalUrlColumn()) return;
    console.warn(
      "[db] study_sessions is missing external_url — rebuilding table to repair a stale/failed migration",
    );
    sqlite.execSync(REBUILD_SQL);
    console.info("[db] study_sessions schema repaired");
  } catch (err) {
    console.error("[db] ensureSessionsSchema failed", err);
  }
}
