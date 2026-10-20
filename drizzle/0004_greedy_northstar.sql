CREATE TABLE `crm_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`kind` text NOT NULL,
	`request_hash` text NOT NULL,
	`details` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `crm_actions_order` ON `crm_actions` (`order_id`);--> statement-breakpoint
CREATE TABLE `crm_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`ok` integer NOT NULL,
	CONSTRAINT "crm_mutation_succeeded" CHECK("crm_checks"."ok"=1)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_phone_unique` ON `customers` (`phone`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`name` text NOT NULL,
	`variant_name` text NOT NULL,
	`sku` text NOT NULL,
	`pillow` text DEFAULT '' NOT NULL,
	`quantity` integer NOT NULL,
	`unit_amount` integer NOT NULL,
	`returned` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `order_items_order` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_variant` ON `order_items` (`product_id`,`variant_id`);--> statement-breakpoint
CREATE TABLE `order_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text NOT NULL,
	`day` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transactions_day` ON `order_transactions` (`day`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_reference` ON `order_transactions` (`order_id`,`type`,`method`,`reference`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`idempotency` text NOT NULL,
	`request_hash` text NOT NULL,
	`customer_id` text NOT NULL,
	`data` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`amount` integer NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	`refunded` integer DEFAULT 0 NOT NULL,
	`stock_state` text DEFAULT 'reserved' NOT NULL,
	`tracking` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`country` text DEFAULT 'ZZ' NOT NULL,
	`source` text DEFAULT 'direct' NOT NULL,
	`session` text,
	`version` integer DEFAULT 1 NOT NULL,
	`day` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_unique` ON `orders` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_idempotency_unique` ON `orders` (`idempotency`);--> statement-breakpoint
CREATE INDEX `orders_created` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `orders_customer` ON `orders` (`customer_id`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`order_id` text,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stock_movements_created` ON `stock_movements` (`created_at`);