import { afterAll, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';

const directory = mkdtempSync(path.join(tmpdir(), 'sales-coach-progress-'));
process.env.DATABASE_URL = path.join(directory, 'test.sqlite');
const { db, sqlite } = await import('../src/lib/db');
const { messages, trainingFocus, trainingSessions } = await import('../src/lib/db/schema');
const { buildProgress, getProgress, localDayKey, startDayKey } = await import('../src/lib/progress');
const now = Date.parse('2026-11-17T16:30:00Z'); // 2026-11-18 00:30 in Shanghai
const scenarioJson = JSON.stringify({ product: '[QA-TEST] 服务' });

afterAll(() => {
  sqlite.close();
  delete (globalThis as typeof globalThis & { salesCoachConnection?: unknown }).salesCoachConnection;
  rmSync(directory, { recursive: true, force: true });
});

test('Shanghai calendar boundaries and zero-filled 7/30/90-day trends', () => {
  expect(localDayKey(now)).toBe('2026-11-18');
  expect(localDayKey(Date.parse('2026-11-17T15:59:00Z'))).toBe('2026-11-17');
  expect(startDayKey(now, 7)).toBe('2026-11-12');
  expect(startDayKey(now, 30)).toBe('2026-10-20');
  expect(startDayKey(now, 90)).toBe('2026-08-21');
  const timestamps = [
    '2026-11-17T16:00:00Z', // today
    '2026-11-11T16:00:00Z', // first day of 7-day range
    '2026-11-11T15:59:00Z', // just outside 7 days
    '2026-10-19T16:00:00Z', // first day of 30-day range
    '2026-10-19T15:59:00Z', // just outside 30 days
    '2026-08-20T16:00:00Z', // first day of 90-day range
    '2026-08-20T15:59:00Z', // just outside 90 days
  ];
  const sessions = timestamps.map((value, index) => ({ id: String(index), scenarioJson, status: index === 0 ? 'completed' : 'active', createdAt: Date.parse(value) }));
  const focusRows = [{ sessionId: '0', dimension: 'need_discovery' as const }, { sessionId: '3', dimension: 'next_step' as const }];
  const seven = buildProgress(sessions, focusRows, 4, 7, now);
  expect(seven.summary).toMatchObject({ total: 7, completed: 1, last7: 2, last30: 4, activeDays: 7, userTurns: 4, normalCount: 5, focusedCount: 2 });
  expect(seven.trend).toHaveLength(7);
  expect(seven.trend[0]).toEqual({ date: '2026-11-12', count: 1 });
  expect(seven.trend.at(-1)).toEqual({ date: '2026-11-18', count: 1 });
  expect(seven.trend.slice(1, -1).every(day => day.count === 0)).toBe(true);
  const thirty = buildProgress(sessions, focusRows, 4, 30, now);
  expect(thirty.trend[0]).toEqual({ date: '2026-10-20', count: 1 });
  expect(thirty.trend).toHaveLength(30);
  const ninety = buildProgress(sessions, focusRows, 4, 90, now);
  expect(ninety.trend[0]).toEqual({ date: '2026-08-21', count: 1 });
  expect(ninety.trend).toHaveLength(90);
  expect(ninety.focusCounts).toEqual({ need_discovery: 1, value_expression: 0, objection_handling: 0, next_step: 1 });
});

test('database statistics change after completion and deletion and remain owner isolated', () => {
  const ownerA = randomUUID();
  const ownerB = randomUUID();
  const sourceId = randomUUID();
  const focusedId = randomUUID();
  const otherId = randomUUID();
  const insert = (id: string, ownerId: string) => db.insert(trainingSessions).values({ id, ownerId, scenarioJson, customerProfileJson: '{}', status: 'active', createdAt: now, updatedAt: now }).run();
  const empty = getProgress(undefined, 30, now);
  expect(empty.summary).toMatchObject({ total: 0, completed: 0, last7: 0, last30: 0, activeDays: 0, userTurns: 0, normalCount: 0, focusedCount: 0 });
  expect(empty.trend.every(day => day.count === 0)).toBe(true);
  insert(sourceId, ownerA);
  insert(otherId, ownerB);
  expect(getProgress(ownerA, 30, now).summary).toMatchObject({ total: 1, completed: 0, normalCount: 1, focusedCount: 0 });
  db.update(trainingSessions).set({ status: 'completed' }).where(eq(trainingSessions.id, sourceId)).run();
  db.insert(messages).values({ id: randomUUID(), sessionId: sourceId, role: 'user', content: '测试发言', sequence: 0, createdAt: now }).run();
  insert(focusedId, ownerA);
  db.insert(trainingFocus).values({ sessionId: focusedId, sourceSessionId: sourceId, dimension: 'objection_handling', createdAt: now }).run();
  expect(getProgress(ownerA, 7, now).summary).toMatchObject({ total: 2, completed: 1, last7: 2, activeDays: 1, userTurns: 1, normalCount: 1, focusedCount: 1 });
  expect(getProgress(ownerA, 7, now).focusCounts.objection_handling).toBe(1);
  expect(getProgress(ownerB, 7, now).summary).toMatchObject({ total: 1, completed: 0, userTurns: 0, focusedCount: 0 });
  db.delete(trainingSessions).where(eq(trainingSessions.id, focusedId)).run();
  expect(getProgress(ownerA, 7, now).summary).toMatchObject({ total: 1, completed: 1, focusedCount: 0 });
  db.delete(trainingSessions).where(eq(trainingSessions.id, sourceId)).run();
  expect(getProgress(ownerA, 7, now).summary).toMatchObject({ total: 0, completed: 0, userTurns: 0, activeDays: 0 });
});
