import { afterAll, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const directory = mkdtempSync(path.join(tmpdir(), 'sales-coach-migration-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const migrationsFolder = path.resolve('drizzle');

test('migrations create all tables in an empty database', () => {
  const sqlite = new Database(path.join(directory, 'fresh.sqlite'));
  try {
    migrate(drizzle(sqlite), { migrationsFolder });
    const names = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    expect(names.map(row => row.name)).toEqual(expect.arrayContaining(['training_sessions', 'messages', 'training_reports', 'saved_scenarios', 'training_focus']));
  } finally { sqlite.close(); }
});

test('migrations preserve a database created before the migration journal existed', () => {
  const sqlite = new Database(path.join(directory, 'legacy.sqlite'));
  try {
    sqlite.exec(`
      CREATE TABLE training_sessions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, scenario_config TEXT NOT NULL, hidden_customer_profile TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, sequence INTEGER NOT NULL, created_at INTEGER NOT NULL);
      CREATE UNIQUE INDEX messages_session_sequence_uq ON messages(session_id, sequence);
      CREATE TABLE training_reports (id TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE REFERENCES training_sessions(id) ON DELETE CASCADE, report_json TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE INDEX training_sessions_owner_idx ON training_sessions(owner_id);
      INSERT INTO training_sessions VALUES ('legacy-session', 'legacy-owner', '{}', '{}', 'active', 1, 1);
    `);
    migrate(drizzle(sqlite), { migrationsFolder });
    expect(sqlite.prepare('SELECT id FROM training_sessions WHERE id = ?').get('legacy-session')).toEqual({ id: 'legacy-session' });
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'saved_scenarios'").get()).toBeTruthy();
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'training_focus'").get()).toBeTruthy();
  } finally { sqlite.close(); }
});
