CREATE TABLE `annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`material_id` text NOT NULL,
	`page_number` integer NOT NULL,
	`page_data_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `annotations_user_material_page_uniq` ON `annotations` (`user_id`,`material_id`,`page_number`);--> statement-breakpoint
CREATE TABLE `collection_materials` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`material_id` text,
	`note_id` text,
	`added_at` integer NOT NULL,
	`sync_status` text DEFAULT 'synced' NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "cm_xor_chk" CHECK(("collection_materials"."material_id" IS NOT NULL) <> ("collection_materials"."note_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cm_coll_material_uniq` ON `collection_materials` (`collection_id`,`material_id`) WHERE "collection_materials"."material_id" IS NOT NULL AND "collection_materials"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `cm_coll_note_uniq` ON `collection_materials` (`collection_id`,`note_id`) WHERE "collection_materials"."note_id" IS NOT NULL AND "collection_materials"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`server_updated_at` integer,
	`sync_status` text DEFAULT 'synced' NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `collections_user_idx` ON `collections` (`user_id`);--> statement-breakpoint
CREATE TABLE `materials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`file_name` text,
	`mime_type` text DEFAULT 'application/pdf',
	`size_bytes` integer,
	`total_pages` integer,
	`current_page` integer DEFAULT 1,
	`local_file_path` text,
	`is_downloaded` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`server_updated_at` integer,
	`sync_status` text DEFAULT 'synced' NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `materials_user_idx` ON `materials` (`user_id`);--> statement-breakpoint
CREATE INDEX `materials_sync_idx` ON `materials` (`sync_status`) WHERE "materials"."sync_status" != 'synced';--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text DEFAULT 'Untitled' NOT NULL,
	`content_html` text DEFAULT '' NOT NULL,
	`strokes_file_path` text,
	`strokes_byte_size` integer DEFAULT 0 NOT NULL,
	`strokes_dirty_at` integer,
	`strokes_server_synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`server_updated_at` integer,
	`sync_status` text DEFAULT 'synced' NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `notes_user_idx` ON `notes` (`user_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`photo_path` text,
	`photo_transform` text,
	`updated_at` integer NOT NULL,
	`server_updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `study_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`material_id` text,
	`note_id` text,
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
	CONSTRAINT "ss_xor_chk" CHECK(("study_sessions"."material_id" IS NOT NULL) <> ("study_sessions"."note_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `study_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_sync_idx` ON `study_sessions` (`sync_status`) WHERE "study_sessions"."sync_status" != 'synced';--> statement-breakpoint
CREATE TABLE `sync_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`operation` text NOT NULL,
	`payload_json` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`next_attempt_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `outbox_ready_idx` ON `sync_outbox` (`next_attempt_at`);