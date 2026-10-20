import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
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
export const crmChecks=sqliteTable('crm_checks',{id:text('id').primaryKey(),ok:integer('ok').notNull()},t=>[check('crm_mutation_succeeded',sql`${t.ok}=1`)]);
export const customers=sqliteTable('customers',{
  id:text('id').primaryKey(),phone:text('phone').notNull().unique(),name:text('name').notNull(),email:text('email').notNull().default(''),
  notes:text('notes').notNull().default(''),version:integer('version').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
});
export const orders=sqliteTable('orders',{
  id:text('id').primaryKey(),number:text('number').notNull().unique(),idempotency:text('idempotency').notNull().unique(),requestHash:text('request_hash').notNull(),
  customerId:text('customer_id').notNull(),data:text('data').notNull(),status:text('status').notNull().default('new'),
  amount:integer('amount').notNull(),paid:integer('paid').notNull().default(0),refunded:integer('refunded').notNull().default(0),
  stockState:text('stock_state').notNull().default('reserved'),tracking:text('tracking').notNull().default(''),notes:text('notes').notNull().default(''),
  country:text('country').notNull().default('ZZ'),source:text('source').notNull().default('direct'),session:text('session'),
  version:integer('version').notNull().default(1),day:text('day').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('orders_created').on(t.createdAt),index('orders_customer').on(t.customerId)]);
export const orderItems=sqliteTable('order_items',{
  id:text('id').primaryKey(),orderId:text('order_id').notNull(),productId:text('product_id').notNull(),variantId:text('variant_id').notNull(),
  name:text('name').notNull(),variantName:text('variant_name').notNull(),sku:text('sku').notNull(),pillow:text('pillow').notNull().default(''),
  quantity:integer('quantity').notNull(),unitAmount:integer('unit_amount').notNull(),returned:integer('returned').notNull().default(0),
},t=>[index('order_items_order').on(t.orderId),index('order_items_variant').on(t.productId,t.variantId)]);
export const orderTransactions=sqliteTable('order_transactions',{
  id:text('id').primaryKey(),orderId:text('order_id').notNull(),type:text('type').notNull(),amount:integer('amount').notNull(),
  method:text('method').notNull(),reference:text('reference').notNull(),day:text('day').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('transactions_day').on(t.day),uniqueIndex('transactions_reference').on(t.orderId,t.type,t.method,t.reference)]);
export const crmActions=sqliteTable('crm_actions',{
  id:text('id').primaryKey(),orderId:text('order_id').notNull(),kind:text('kind').notNull(),requestHash:text('request_hash').notNull(),
  details:text('details').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('crm_actions_order').on(t.orderId)]);
export const stockMovements=sqliteTable('stock_movements',{
  id:text('id').primaryKey(),productId:text('product_id').notNull(),variantId:text('variant_id').notNull(),orderId:text('order_id'),
  delta:integer('delta').notNull(),reason:text('reason').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('stock_movements_created').on(t.createdAt)]);
