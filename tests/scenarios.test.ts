import { afterAll, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { savedScenarioSchema } from '../src/lib/validation';

const directory = mkdtempSync(path.join(tmpdir(), 'sales-coach-scenarios-'));
process.env.DATABASE_URL = path.join(directory, 'test.sqlite');
const { db, sqlite } = await import('../src/lib/db');
const { trainingSessions } = await import('../src/lib/db/schema');
const { createScenario, getOwnedScenario, listOwnedScenarios, updateOwnedScenario, deleteOwnedScenario } = await import('../src/lib/scenarios');
const ownerId = randomUUID();
const outsiderId = randomUUID();
const input = { name: '[QA-TEST] 网站销售', product: '网站开发', description: '企业网站设计开发', identity: '企业负责人', personality: '普通型', difficulty: '中等', goal: '了解客户需求' } as const;

afterAll(() => {
  sqlite.close();
  delete (globalThis as typeof globalThis & { salesCoachConnection?: unknown }).salesCoachConnection;
  rmSync(directory, { recursive: true, force: true });
});

test('scenario fields are validated before saving', () => {
  expect(savedScenarioSchema.safeParse(input).success).toBe(true);
  expect(savedScenarioSchema.safeParse({ ...input, name: '' }).success).toBe(false);
  expect(savedScenarioSchema.safeParse({ ...input, product: 'x'.repeat(81) }).success).toBe(false);
  expect(savedScenarioSchema.safeParse({ ...input, difficulty: '未知' }).success).toBe(false);
});

test('personal scenario CRUD is owner isolated and training keeps an immutable snapshot', () => {
  const created = createScenario(ownerId, input);
  expect(getOwnedScenario(created.id, ownerId)?.scenario.product).toBe('网站开发');
  expect(listOwnedScenarios(ownerId)).toHaveLength(1);
  expect(getOwnedScenario(created.id, outsiderId)).toBeUndefined();
  expect(updateOwnedScenario(created.id, outsiderId, { ...input, product: '越权修改' })).toBeUndefined();
  expect(deleteOwnedScenario(created.id, outsiderId)).toBe(false);

  const sessionId = randomUUID();
  const now = Date.now();
  db.insert(trainingSessions).values({ id: sessionId, ownerId, scenarioJson: JSON.stringify(created.scenario), customerProfileJson: '{}', status: 'active', createdAt: now, updatedAt: now }).run();
  const updated = updateOwnedScenario(created.id, ownerId, { ...input, product: '新版网站开发' });
  expect(updated?.scenario.product).toBe('新版网站开发');
  expect(JSON.parse(db.select().from(trainingSessions).where(eq(trainingSessions.id, sessionId)).get()!.scenarioJson)).toEqual(created.scenario);
  expect(deleteOwnedScenario(created.id, ownerId)).toBe(true);
  expect(getOwnedScenario(created.id, ownerId)).toBeUndefined();
  expect(db.select().from(trainingSessions).where(eq(trainingSessions.id, sessionId)).get()).toBeTruthy();
});
