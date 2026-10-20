import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
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
export const analyticsEvents=sqliteTable('analytics_events',{
  id:text('id').primaryKey(),session:text('session').notNull(),type:text('type').notNull(),
  day:text('day').notNull(),createdAt:integer('created_at').notNull(),productId:text('product_id'),
  device:text('device').notNull(),source:text('source').notNull(),country:text('country').notNull().default('ZZ'),
},table=>[index('analytics_day_type').on(table.day,table.type)]);
export const salesLedger=sqliteTable('sales_ledger',{
  id:text('id').primaryKey(),reference:text('reference').notNull().unique(),
  day:text('day').notNull(),amount:integer('amount').notNull(),quantity:integer('quantity').notNull(),
  refund:integer('refund').notNull().default(0),refundDay:text('refund_day'),
  voided:integer('voided').notNull().default(0),version:integer('version').notNull().default(1),
  updatedAt:text('updated_at').notNull(),
});
