import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { afterAll, expect, test, vi } from 'vitest';

const owner = vi.hoisted(() => ({ check: vi.fn(), id: 'test-owner' }));
vi.mock('@/lib/auth/session', () => ({
  canUseOwner: owner.check,
  getOrCreateOwnerId: async () => owner.id,
}));

const directory = mkdtempSync(path.join(tmpdir(), 'sales-coach-create-'));
const database = path.join(directory, 'test.sqlite');
vi.stubEnv('DATABASE_URL', database);
vi.stubEnv('AI_MODE', 'mock');
vi.stubEnv('E2E_TEST', '1');
const { sqlite } = await import('@/lib/db');
const { POST } = await import('@/app/api/sessions/route');
const writer = new Database(database, { timeout: 0 });

afterAll(() => {
  writer.close();
  sqlite.close();
  delete (globalThis as typeof globalThis & { salesCoachConnection?: unknown }).salesCoachConnection;
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

test('creating a session reserves the WAL write lock before reading ownership', async () => {
  sqlite.exec('CREATE TABLE competing_write (id INTEGER PRIMARY KEY)');
  const write = writer.prepare('INSERT INTO competing_write DEFAULT VALUES');
  let competingError: unknown;
  owner.check.mockImplementation(() => {
    // Read on the create transaction, then try to commit on another connection.
    sqlite.prepare('SELECT id FROM training_sessions').get();
    try { write.run(); } catch (error) { competingError = error; }
    return true;
  });
  const requestId = randomUUID();
  const response = await POST(new NextRequest('http://localhost/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ requestId, product: '并发训练', description: '测试并发写入', identity: '企业负责人', personality: '普通型', difficulty: '简单', goal: '了解客户需求' }),
  }));

  expect(response.status).toBe(201);
  expect(competingError).toMatchObject({ code: 'SQLITE_BUSY' });
  expect(sqlite.prepare('SELECT role, sequence FROM messages WHERE session_id = ?').all(requestId)).toEqual([{ role: 'customer', sequence: 0 }]);
  expect(write.run().changes).toBe(1);
});
