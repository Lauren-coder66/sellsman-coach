import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';
import { migrateSqlite } from './migrate';

const file = process.env.DATABASE_URL ? path.resolve(process.env.DATABASE_URL) : path.join(process.cwd(), 'data', 'sales-coach.sqlite');
fs.mkdirSync(path.dirname(file), { recursive: true });

function connect() {
  const sqlite = new Database(file);
  try {
    sqlite.pragma('busy_timeout = 30000');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    migrateSqlite(sqlite, path.resolve('drizzle'));
    return { sqlite, db: drizzle(sqlite, { schema }) };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

type Connection = ReturnType<typeof connect>;
const globalStore = globalThis as typeof globalThis & { salesCoachConnection?: Connection };
export const { sqlite, db } = globalStore.salesCoachConnection ??= connect();
