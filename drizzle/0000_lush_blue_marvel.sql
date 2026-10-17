CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`edition_id` text NOT NULL,
	`kind` text NOT NULL,
	`request_key` text NOT NULL,
	`startedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`edition_id`) REFERENCES `editions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `first_attempt` ON `attempts` (`user_id`,`edition_id`) WHERE "attempts"."kind" = 'ranked';--> statement-breakpoint
CREATE UNIQUE INDEX `attempt_request` ON `attempts` (`user_id`,`edition_id`,`request_key`);--> statement-breakpoint
CREATE INDEX `attempt_edition` ON `attempts` (`edition_id`);--> statement-breakpoint
CREATE TABLE `corrections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`edition_id` text NOT NULL,
	`topic` integer NOT NULL,
	`question` integer NOT NULL,
	`correct` integer NOT NULL,
	`explanation` text NOT NULL,
	`source_url` text NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `editions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `editions` (
	`id` text PRIMARY KEY NOT NULL,
	`track` text NOT NULL,
	`date` text NOT NULL,
	`content` text NOT NULL,
	`digest` text NOT NULL,
	`kind` text NOT NULL,
	`publishedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `edition_slot` ON `editions` (`track`,`date`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `question_history` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `editions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`edition_id` text NOT NULL,
	`topic` integer NOT NULL,
	`question` integer NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `editions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`actual_credits` integer,
	`estimated_credits` integer,
	`detail` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_cache` (
	`url` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`published_date` text NOT NULL,
	`retrieved_at` text NOT NULL,
	`content` text NOT NULL,
	`digest` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`topic` integer NOT NULL,
	`a0` integer NOT NULL,
	`a1` integer NOT NULL,
	`submittedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `locked_pair` ON `submissions` (`attempt_id`,`topic`);--> statement-breakpoint
CREATE TABLE `topic_history` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`story_key` text NOT NULL,
	`date` text NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `editions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `distinct_daily_story` ON `topic_history` (`story_key`,`date`);