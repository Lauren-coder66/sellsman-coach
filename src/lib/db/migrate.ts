import type Database from 'better-sqlite3';
import { readMigrationFiles } from 'drizzle-orm/migrator';

export function migrateSqlite(sqlite: Database.Database, migrationsFolder: string) {
  const migrations = readMigrationFiles({ migrationsFolder });
  // Take the write lock before reading Drizzle's journal so other processes can't replay the same migration.
  sqlite.transaction(() => {
    sqlite.exec('CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)');
    const last = sqlite.prepare('SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1').pluck().get();
    const record = sqlite.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)');
    for (const migration of migrations) {
      if (last !== undefined && Number(last) >= migration.folderMillis) continue;
      for (const statement of migration.sql) sqlite.exec(statement);
      record.run(migration.hash, migration.folderMillis);
    }
  }).immediate();
}
