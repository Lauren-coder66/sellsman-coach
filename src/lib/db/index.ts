import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

const file = process.env.DATABASE_URL ? path.resolve(process.env.DATABASE_URL) : path.join(process.cwd(), 'data', 'sales-coach.sqlite');
fs.mkdirSync(path.dirname(file), { recursive: true });

function connect() {
  const sqlite = new Database(file);
  sqlite.pragma('busy_timeout = 30000');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS training_sessions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, scenario_config TEXT NOT NULL, hidden_customer_profile TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS training_sessions_owner_idx ON training_sessions(owner_id);
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('user','customer')), content TEXT NOT NULL, sequence INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS messages_session_sequence_uq ON messages(session_id, sequence);
    CREATE TABLE IF NOT EXISTS training_reports (id TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE REFERENCES training_sessions(id) ON DELETE CASCADE, report_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS saved_scenarios (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, product TEXT NOT NULL, description TEXT NOT NULL, identity TEXT NOT NULL, personality TEXT NOT NULL, difficulty TEXT NOT NULL, goal TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS saved_scenarios_owner_idx ON saved_scenarios(owner_id);
  `);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

type Connection = ReturnType<typeof connect>;
const globalStore = globalThis as typeof globalThis & { salesCoachConnection?: Connection };
export const { sqlite, db } = globalStore.salesCoachConnection ??= connect();
