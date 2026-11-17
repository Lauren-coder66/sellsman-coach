import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

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
