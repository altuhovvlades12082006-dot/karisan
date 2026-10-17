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
export const adminSessions = sqliteTable('admin_sessions', {
  tokenHash:text('token_hash').primaryKey(),expiresAt:integer('expires_at').notNull(),credentialVersion:text('credential_version').notNull(),
});
export const loginAttempts = sqliteTable('login_attempts', {
  key:text('key').primaryKey(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull(),
});
