CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session` text NOT NULL,
	`type` text NOT NULL,
	`day` text NOT NULL,
	`created_at` integer NOT NULL,
	`product_id` text,
	`device` text NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analytics_day_type` ON `analytics_events` (`day`,`type`);--> statement-breakpoint
CREATE TABLE `sales_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`day` text NOT NULL,
	`amount` integer NOT NULL,
	`quantity` integer NOT NULL,
	`refund` integer DEFAULT 0 NOT NULL,
	`refund_day` text,
	`voided` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_ledger_reference_unique` ON `sales_ledger` (`reference`);