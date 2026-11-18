import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
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
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve('drizzle') });
  return { sqlite, db };
}

type Connection = ReturnType<typeof connect>;
const globalStore = globalThis as typeof globalThis & { salesCoachConnection?: Connection };
export const { sqlite, db } = globalStore.salesCoachConnection ??= connect();
