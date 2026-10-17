import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const products = sqliteTable('products', {
  id: text('id').primaryKey(), data: text('data').notNull(),
  version: integer('version').notNull().default(1),
  archived: integer('archived').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});
export const admins = sqliteTable('admins', {
  slot: text('slot').primaryKey(), userId: text('user_id').notNull().unique(),
  createdAt: text('created_at').notNull(),
});
export const settings = sqliteTable('settings', {key:text('key').primaryKey(),value:text('value').notNull()});
