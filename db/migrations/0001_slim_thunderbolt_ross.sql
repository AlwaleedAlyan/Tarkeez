CREATE TABLE `youtube_classifications` (
	`video_id` text PRIMARY KEY NOT NULL,
	`is_educational` integer NOT NULL,
	`reason` text NOT NULL,
	`classified_at` integer NOT NULL
);
