PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_study_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`material_id` text,
	`note_id` text,
	`external_url` text,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`duration_sec` integer NOT NULL,
	`paused_sec` integer DEFAULT 0,
	`pages_read` integer,
	`page_times_json` text,
	`selections` integer,
	`words_added` integer,
	`keystrokes` integer,
	`strokes_added` integer,
	`created_at` integer NOT NULL,
	`sync_status` text DEFAULT 'pending_create' NOT NULL,
	CONSTRAINT "ss_xor_chk" CHECK((CASE WHEN "__new_study_sessions"."material_id" IS NOT NULL THEN 1 ELSE 0 END
         + CASE WHEN "__new_study_sessions"."note_id" IS NOT NULL THEN 1 ELSE 0 END
         + CASE WHEN "__new_study_sessions"."external_url" IS NOT NULL THEN 1 ELSE 0 END) = 1)
);
--> statement-breakpoint
INSERT INTO `__new_study_sessions`("id", "user_id", "material_id", "note_id", "external_url", "started_at", "ended_at", "duration_sec", "paused_sec", "pages_read", "page_times_json", "selections", "words_added", "keystrokes", "strokes_added", "created_at", "sync_status") SELECT "id", "user_id", "material_id", "note_id", NULL, "started_at", "ended_at", "duration_sec", "paused_sec", "pages_read", "page_times_json", "selections", "words_added", "keystrokes", "strokes_added", "created_at", "sync_status" FROM `study_sessions`;--> statement-breakpoint
DROP TABLE `study_sessions`;--> statement-breakpoint
ALTER TABLE `__new_study_sessions` RENAME TO `study_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `study_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_sync_idx` ON `study_sessions` (`sync_status`) WHERE "study_sessions"."sync_status" != 'synced';