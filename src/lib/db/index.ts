import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';
import { migrateSqlite } from './migrate';

const file = process.env.DATABASE_URL ? path.resolve(process.env.DATABASE_URL) : path.join(process.cwd(), 'data', 'sales-coach.sqlite');
fs.mkdirSync(path.dirname(file), { recursive: true });

function diagnostic(event: string, details: Record<string, unknown>) {
  if (process.env.E2E_TEST !== '1') return;
  console.error(JSON.stringify({ diagnostic: event, ...details }));
}

function connect() {
  const sqlite = new Database(file);
  try {
    sqlite.pragma('busy_timeout = 30000');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    migrateSqlite(sqlite, path.resolve('drizzle'));
    const realpath = fs.realpathSync(file);
    const stat = fs.statSync(file);
    diagnostic('db-connection', {
      databaseUrl: file,
      realpath,
      dev: stat.dev,
      ino: stat.ino,
      databaseList: sqlite.pragma('database_list'),
      journalMode: sqlite.pragma('journal_mode', { simple: true }),
      walExists: fs.existsSync(`${file}-wal`),
      walSize: fs.existsSync(`${file}-wal`) ? fs.statSync(`${file}-wal`).size : 0,
    });
    return { sqlite, db: drizzle(sqlite, { schema }) };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

type Connection = ReturnType<typeof connect>;
const globalStore = globalThis as typeof globalThis & { salesCoachConnection?: Connection };
export const { sqlite, db } = globalStore.salesCoachConnection ??= connect();
