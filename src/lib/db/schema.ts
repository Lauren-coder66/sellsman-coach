import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const trainingSessions = sqliteTable('training_sessions', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  scenarioJson: text('scenario_config').notNull(),
  customerProfileJson: text('hidden_customer_profile').notNull(),
  status: text('status').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [index('training_sessions_owner_idx').on(table.ownerId)]);

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => trainingSessions.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'customer'] }).notNull(),
  content: text('content').notNull(),
  sequence: integer('sequence').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [uniqueIndex('messages_session_sequence_uq').on(table.sessionId, table.sequence)]);

export const trainingReports = sqliteTable('training_reports', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().unique().references(() => trainingSessions.id, { onDelete: 'cascade' }),
  reportJson: text('report_json').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const savedScenarios = sqliteTable('saved_scenarios', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  product: text('product').notNull(),
  description: text('description').notNull(),
  identity: text('identity').notNull(),
  personality: text('personality').notNull(),
  difficulty: text('difficulty').notNull(),
  goal: text('goal').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [index('saved_scenarios_owner_idx').on(table.ownerId)]);

export const trainingFocus = sqliteTable('training_focus', {
  sessionId: text('session_id').primaryKey().references(() => trainingSessions.id, { onDelete: 'cascade' }),
  sourceSessionId: text('source_session_id').notNull(),
  dimension: text('dimension', { enum: ['need_discovery', 'value_expression', 'objection_handling', 'next_step'] }).notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [index('training_focus_source_idx').on(table.sourceSessionId)]);

export const aiUsage = sqliteTable('ai_usage', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  model: text('model').notNull(),
  provider: text('provider').notNull(),
  operation: text('operation').notNull(),
  startedAt: integer('started_at').notNull(),
  completedAt: integer('completed_at'),
  reservedTokens: integer('reserved_tokens').notNull(),
  tokens: integer('tokens'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  cost: real('cost'),
  outcome: text('outcome'),
}, table => [index('ai_usage_owner_time_idx').on(table.ownerId, table.startedAt), index('ai_usage_time_idx').on(table.startedAt)]);

export const subscriptions = sqliteTable('subscriptions', {
  ownerId: text('owner_id').primaryKey(),
  plan: text('plan', { enum: ['standard', 'premium'] }).notNull(),
  state: text('state', { enum: ['active', 'cancelled', 'expired'] }).notNull(),
  validUntil: integer('valid_until').notNull(),
});

export const billingOrders = sqliteTable('billing_orders', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  plan: text('plan', { enum: ['standard', 'premium'] }).notNull(),
  state: text('state', { enum: ['pending', 'paid', 'cancelled', 'refunded'] }).notNull(),
  provider: text('provider').notNull(),
  externalId: text('external_id').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [uniqueIndex('billing_order_external_idx').on(table.provider, table.externalId)]);

export const voiceAttempts = sqliteTable('voice_attempts', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  sessionId: text('session_id').notNull().references(() => trainingSessions.id, { onDelete: 'cascade' }),
  startedAt: integer('started_at').notNull(),
  seconds: integer('seconds').notNull(),
  transcript: text('transcript'),
  endedAt: integer('ended_at'),
}, table => [index('voice_attempts_owner_time_idx').on(table.ownerId, table.startedAt)]);

export const productFeedback = sqliteTable('product_feedback', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  category: text('category', { enum: ['problem', 'suggestion', 'other'] }).notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [index('product_feedback_owner_time_idx').on(table.ownerId, table.createdAt)]);
