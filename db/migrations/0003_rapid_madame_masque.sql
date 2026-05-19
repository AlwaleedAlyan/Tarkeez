CREATE TABLE `url_classifications` (
	`domain` text PRIMARY KEY NOT NULL,
	`is_educational` integer NOT NULL,
	`reason` text NOT NULL,
	`classified_at` integer NOT NULL
);
