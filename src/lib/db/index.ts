import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';
import { migrateSqlite } from './migrate';
import { logE2EDiagnostic } from '@/lib/e2e-diagnostics';

const file = process.env.DATABASE_URL ? path.resolve(process.env.DATABASE_URL) : path.join(process.cwd(), 'data', 'sales-coach.sqlite');
let initializationStage = 'create-parent-directory';

function connect() {
  initializationStage = 'open-database';
  const sqlite = new Database(file);
  try {
    initializationStage = 'set-busy-timeout';
    sqlite.pragma('busy_timeout = 30000');
    initializationStage = 'set-wal-mode';
    sqlite.pragma('journal_mode = WAL');
    initializationStage = 'set-foreign-keys';
    sqlite.pragma('foreign_keys = ON');
    initializationStage = 'run-drizzle-migrations';
    migrateSqlite(sqlite, path.resolve('drizzle'));
    initializationStage = 'create-drizzle-connection';
    return { sqlite, db: drizzle(sqlite, { schema }) };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

type Connection = ReturnType<typeof connect>;
const globalStore = globalThis as typeof globalThis & { salesCoachConnection?: Connection };
const connection = (() => {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const reused = Boolean(globalStore.salesCoachConnection);
    const ready = globalStore.salesCoachConnection ??= connect();
    logE2EDiagnostic('db-init', reused ? 'connection-reused' : 'connection-ready', undefined, undefined, true);
    return ready;
  } catch (error) {
    logE2EDiagnostic('db-init', initializationStage, error, undefined, false);
    throw error;
  }
})();
export const { sqlite, db } = connection;
