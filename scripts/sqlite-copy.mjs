import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const [mode, sourceName, destinationName] = process.argv.slice(2);
  if (!['backup', 'restore'].includes(mode) || !sourceName || !destinationName) {
    throw Error('Usage: node scripts/sqlite-copy.mjs backup|restore source.sqlite new.sqlite');
  }
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
    const copy = new Database(dest, { readonly: true, fileMustExist: true });
    try {
      if (copy.pragma('integrity_check', { simple: true }) !== 'ok' ||
        copy.pragma('foreign_key_check').length) throw Error('SQLite integrity or foreign key validation failed');
    } finally { copy.close(); }
    reserved = false;
    console.log(JSON.stringify({ operation: mode, destination: dest, integrity: 'ok' }));
  } finally {
    input.close();
    if (reserved) fs.unlinkSync(dest);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
