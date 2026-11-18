import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function verifySqlite(filename) {
  const db = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    if (db.pragma('integrity_check', { simple: true }) !== 'ok' ||
      db.pragma('foreign_key_check').length) throw Error('SQLite integrity or foreign key validation failed');
  } finally { db.close(); }
}

export async function copySqlite(sourceName, destinationName) {
  const source = path.resolve(sourceName);
  const dest = path.resolve(destinationName);
  if (source === dest) throw Error('Source and destination must differ');
  // Reserve the target atomically so this tool never replaces an existing database.
  const input = new Database(source, { readonly: true, fileMustExist: true });
  let reserved = false;
  try {
    fs.closeSync(fs.openSync(dest, 'wx', 0o600));
    reserved = true;
    await input.backup(dest);
    verifySqlite(dest);
    reserved = false;
    return dest;
  } finally {
    input.close();
    if (reserved) fs.unlinkSync(dest);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, source, destination] = process.argv.slice(2);
  if (!['backup', 'restore'].includes(mode) || !source || !destination) {
    console.error('Usage: node scripts/sqlite-copy.mjs backup|restore source.sqlite new.sqlite');
    process.exitCode = 1;
  } else {
    copySqlite(source, destination)
      .then(dest => console.log(JSON.stringify({ operation: mode, destination: dest, integrity: 'ok' })))
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
