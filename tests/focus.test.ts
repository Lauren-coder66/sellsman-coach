import { afterAll, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { focusDetails, focusDimensions } from '../src/lib/focus';
import { sessionCreateSchema } from '../src/lib/validation';
import { mockProvider } from '../src/lib/ai/mock-provider';

const directory = mkdtempSync(path.join(tmpdir(), 'sales-coach-focus-'));
process.env.DATABASE_URL = path.join(directory, 'test.sqlite');
const { db, sqlite } = await import('../src/lib/db');
const { trainingSessions, trainingFocus, messages } = await import('../src/lib/db/schema');
const { sendMessage, finishSession } = await import('../src/lib/training-service');
const ownerId = randomUUID();
const scenario = { product: '[QA-TEST] 网站服务', description: '企业网站开发', identity: '负责人', personality: '普通型', difficulty: '中等', goal: '了解客户需求' } as const;

afterAll(() => {
  sqlite.close();
  delete (globalThis as typeof globalThis & { salesCoachConnection?: unknown }).salesCoachConnection;
  rmSync(directory, { recursive: true, force: true });
});

test('all four focus dimensions require a source session', () => {
  for (const focusDimension of focusDimensions) {
    expect(sessionCreateSchema.safeParse({ ...scenario, sourceSessionId: randomUUID(), focusDimension }).success).toBe(true);
    expect(focusDetails[focusDimension].instruction.length).toBeGreaterThan(0);
  }
  expect(sessionCreateSchema.safeParse(scenario).success).toBe(true);
  expect(sessionCreateSchema.safeParse({ ...scenario, focusDimension: 'next_step' }).success).toBe(false);
  expect(sessionCreateSchema.safeParse({ ...scenario, sourceSessionId: randomUUID() }).success).toBe(false);
  expect(sessionCreateSchema.safeParse({ ...scenario, sourceSessionId: randomUUID(), focusDimension: 'invalid' }).success).toBe(false);
});

test('source deletion retains focused training and its model context', async () => {
  const sourceId = randomUUID();
  const childId = randomUUID();
  const now = Date.now();
  const session = (id: string) => ({ id, ownerId, scenarioJson: JSON.stringify(scenario), customerProfileJson: JSON.stringify({ identity: '负责人', concern: '价值', stance: 0 }), status: 'active', createdAt: now, updatedAt: now });
  db.insert(trainingSessions).values([session(sourceId), session(childId)]).run();
  db.insert(trainingFocus).values({ sessionId: childId, sourceSessionId: sourceId, dimension: 'objection_handling', createdAt: now }).run();
  db.insert(messages).values({ id: randomUUID(), sessionId: childId, role: 'customer', content: '你好', sequence: 0, createdAt: now }).run();
  const provider = { ...mockProvider, generateCustomerReply: vi.fn(mockProvider.generateCustomerReply), generateTrainingReport: vi.fn(mockProvider.generateTrainingReport) };
  await sendMessage(childId, ownerId, '我的问题', randomUUID(), provider);
  expect(provider.generateCustomerReply).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), { dimension: 'objection_handling', instruction: focusDetails.objection_handling.instruction });
  db.delete(trainingSessions).where(eq(trainingSessions.id, sourceId)).run();
  expect(db.select().from(trainingSessions).where(eq(trainingSessions.id, childId)).get()).toBeTruthy();
  expect(db.select().from(trainingFocus).where(eq(trainingFocus.sessionId, childId)).get()?.sourceSessionId).toBe(sourceId);
  for (let index = 0; index < 2; index++) await sendMessage(childId, ownerId, `追问${index}`, randomUUID(), provider);
  expect((await finishSession(childId, ownerId, provider)).ok).toBe(true);
  expect(provider.generateTrainingReport).toHaveBeenCalledWith(expect.anything(), expect.anything(), { dimension: 'objection_handling', instruction: focusDetails.objection_handling.instruction });
  db.delete(trainingSessions).where(eq(trainingSessions.id, childId)).run();
  expect(db.select().from(trainingFocus).where(eq(trainingFocus.sessionId, childId)).get()).toBeUndefined();
});
