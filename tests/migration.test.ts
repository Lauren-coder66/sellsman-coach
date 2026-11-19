import { afterAll, expect, test } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { migrateSqlite } from '../src/lib/db/migrate';

const directory = mkdtempSync(path.join(tmpdir(), 'sales-coach-migration-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const migrationsFolder = path.resolve('drizzle');

test('migrations create all tables in an empty database', () => {
  const sqlite = new Database(path.join(directory, 'fresh.sqlite'));
  try {
    migrateSqlite(sqlite, migrationsFolder);
    const names = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    expect(names.map(row => row.name)).toEqual(expect.arrayContaining(['training_sessions', 'messages', 'training_reports', 'saved_scenarios', 'training_focus', 'ai_usage', 'subscriptions', 'billing_orders', 'voice_attempts', 'product_feedback']));
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
    migrateSqlite(sqlite, migrationsFolder);
    expect(sqlite.prepare('SELECT id FROM training_sessions WHERE id = ?').get('legacy-session')).toEqual({ id: 'legacy-session' });
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'saved_scenarios'").get()).toBeTruthy();
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'training_focus'").get()).toBeTruthy();
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'product_feedback'").get()).toBeTruthy();
  } finally { sqlite.close(); }
});

test('separate startup processes apply each migration to the same database once', async () => {
  const file = path.join(directory, 'parallel.sqlite');
  const migrationModule = pathToFileURL(path.resolve('src/lib/db/migrate.ts')).href;
  const start = `
    import Database from 'better-sqlite3';
    import { migrateSqlite } from ${JSON.stringify(migrationModule)};
    const db = new Database(process.argv[1]);
    try {
      db.pragma('busy_timeout = 5000');
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      migrateSqlite(db, process.argv[2]);
    } finally { db.close(); }
  `;
  const execute = promisify(execFile);
  const results = await Promise.allSettled(Array.from({ length: 8 }, () =>
    execute(process.execPath, ['--input-type=module', '-e', start, file, migrationsFolder], { timeout: 10_000 })));
  expect(results.flatMap(result => result.status === 'rejected' ? [String(result.reason)] : [])).toEqual([]);
  const sqlite = new Database(file);
  try {
    const history = sqlite.prepare('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at').all();
    expect(history).toEqual(readMigrationFiles({ migrationsFolder }).map(migration => ({
      hash: migration.hash, created_at: migration.folderMillis,
    })));
    expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
  } finally { sqlite.close(); }
}, 15_000);
