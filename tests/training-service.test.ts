import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { mockProvider } from '../src/lib/ai/mock-provider';
import { AIRequestTimeoutError } from '../src/lib/ai/service';

const directory = mkdtempSync(path.join(tmpdir(), 'sales-coach-unit-'));
process.env.DATABASE_URL = path.join(directory, 'test.sqlite');
const { db, sqlite } = await import('../src/lib/db');
const { messages, trainingReports, trainingSessions } = await import('../src/lib/db/schema');
const { sendMessage, finishSession } = await import('../src/lib/training-service');
const ownerId = randomUUID();
const otherOwner = randomUUID();
const scenario = { product: '[QA-TEST] 服务', description: '测试说明', identity: '负责人', personality: '普通型', difficulty: '简单', goal: '了解客户需求' } as const;
let id: string;

beforeEach(() => {
  id = randomUUID();
  const now = Date.now();
  db.insert(trainingSessions).values({ id, ownerId, scenarioJson: JSON.stringify(scenario), customerProfileJson: JSON.stringify({ identity: '负责人', concern: '价值', stance: 0 }), status: 'active', createdAt: now, updatedAt: now }).run();
  db.insert(messages).values({ id: randomUUID(), sessionId: id, role: 'customer', content: '你好', sequence: 0, createdAt: now }).run();
});
afterAll(() => {
  sqlite.close();
  delete (globalThis as typeof globalThis & { salesCoachConnection?: unknown }).salesCoachConnection;
  rmSync(directory, { recursive: true, force: true });
});

function rows() { return db.select().from(messages).where(eq(messages.sessionId, id)).orderBy(messages.sequence).all(); }
function reportRows() { return db.select().from(trainingReports).where(eq(trainingReports.sessionId, id)).all(); }
function session() { return db.select().from(trainingSessions).where(eq(trainingSessions.id, id)).get()!; }

test('same requestId is idempotent and cannot create a second customer reply', async () => {
  const requestId = randomUUID();
  const first = await sendMessage(id, ownerId, '我想了解需求', requestId, mockProvider);
  const second = await sendMessage(id, ownerId, '我想了解需求', requestId, mockProvider);
  expect(first.ok).toBe(true);
  expect(second).toMatchObject({ ok: true, data: { alreadySaved: true } });
  expect(rows()).toHaveLength(3);
});

test('concurrent requests reserve the session before generating a reply', async () => {
  let release!: (value: string) => void;
  const waiting = new Promise<string>(resolve => { release = resolve; });
  const provider = { ...mockProvider, generateCustomerReply: vi.fn(() => waiting) };
  const requestId = randomUUID();
  const first = sendMessage(id, ownerId, '我想了解需求', requestId, provider);
  const duplicate = await sendMessage(id, ownerId, '我想了解需求', requestId, provider);
  const different = await sendMessage(id, ownerId, '再说一句', randomUUID(), provider);
  expect(duplicate).toMatchObject({ ok: false, code: 'IN_PROGRESS', status: 409 });
  expect(different).toMatchObject({ ok: false, code: 'PENDING_REPLY', status: 409 });
  expect(provider.generateCustomerReply).toHaveBeenCalledTimes(1);
  release('客户回复');
  expect((await first).ok).toBe(true);
  expect(rows()).toHaveLength(3);
});

test('saved user message survives reply failure and retries with the same ID', async () => {
  const requestId = randomUUID();
  const broken = { ...mockProvider, generateCustomerReply: vi.fn().mockRejectedValue(new Error('模拟失败')) };
  expect(await sendMessage(id, ownerId, '我的问题', requestId, broken)).toMatchObject({ ok: false, code: 'CUSTOMER_REPLY_ERROR', status: 502 });
  expect(rows().at(-1)).toMatchObject({ id: requestId, role: 'user' });
  expect(session().status).toBe('active');
  expect(await sendMessage(id, ownerId, '另一条', randomUUID(), mockProvider)).toMatchObject({ ok: false, code: 'PENDING_REPLY' });
  expect((await sendMessage(id, ownerId, '我的问题', requestId, mockProvider)).ok).toBe(true);
  expect(rows()).toHaveLength(3);
});

test('a timed out customer reply keeps the user message and returns 504', async () => {
  const requestId = randomUUID();
  const provider = { ...mockProvider, generateCustomerReply: vi.fn().mockRejectedValue(new AIRequestTimeoutError()) };
  expect(await sendMessage(id, ownerId, '我的需求', requestId, provider)).toMatchObject({ ok: false, code: 'AI_TIMEOUT', status: 504 });
  expect(rows().at(-1)).toMatchObject({ id: requestId, role: 'user' });
  expect(session().status).toBe('active');
  expect((await sendMessage(id, ownerId, '我的需求', requestId, mockProvider)).ok).toBe(true);
  expect(rows()).toHaveLength(3);
});

test('finish conflicts with an active reply, then creates only one final report', async () => {
  let release!: (value: string) => void;
  const waiting = new Promise<string>(resolve => { release = resolve; });
  const provider = { ...mockProvider, generateCustomerReply: () => waiting };
  const requestId = randomUUID();
  const sending = sendMessage(id, ownerId, '我的问题', requestId, provider);
  expect(await finishSession(id, ownerId, mockProvider)).toMatchObject({ ok: false, code: 'IN_PROGRESS', status: 409 });
  release('客户回复');
  await sending;
  const first = await finishSession(id, ownerId, mockProvider);
  const second = await finishSession(id, ownerId, mockProvider);
  expect(first.ok).toBe(true);
  expect(second).toEqual(first);
  expect(reportRows()).toHaveLength(1);
  expect(session().status).toBe('completed');
  expect(await sendMessage(id, ownerId, '结束后发送', randomUUID(), mockProvider)).toMatchObject({ ok: false, code: 'NOT_ACTIVE' });
});

test('failed report can retry and invalid quotations never persist', async () => {
  for (let index = 0; index < 3; index++) await sendMessage(id, ownerId, `第${index}轮需求`, randomUUID(), mockProvider);
  const broken = { ...mockProvider, generateTrainingReport: vi.fn().mockRejectedValue(new Error('报告失败')) };
  expect(await finishSession(id, ownerId, broken)).toMatchObject({ ok: false, code: 'REPORT_ERROR', status: 502 });
  expect(session().status).toBe('failed');
  expect(reportRows()).toHaveLength(0);
  const fake = { ...mockProvider, generateTrainingReport: vi.fn(async (...args: Parameters<typeof mockProvider.generateTrainingReport>) => ({ ...(await mockProvider.generateTrainingReport(...args)), issues: [{ message_id: randomUUID(), quote: '伪造原话', problem: '', reason: '', suggestion: '', better_expression: '' }] })) };
  expect(await finishSession(id, ownerId, fake)).toMatchObject({ ok: false, code: 'REPORT_ERROR' });
  expect(reportRows()).toHaveLength(0);
  expect((await finishSession(id, ownerId, mockProvider)).ok).toBe(true);
  expect(reportRows()).toHaveLength(1);
  expect(session().status).toBe('completed');
});

test('other owners cannot read or change the session through the service', async () => {
  expect(await sendMessage(id, otherOwner, '尝试发送', randomUUID(), mockProvider)).toMatchObject({ ok: false, code: 'NOT_FOUND', status: 404 });
  expect(await finishSession(id, otherOwner, mockProvider)).toMatchObject({ ok: false, code: 'NOT_FOUND', status: 404 });
  expect(rows()).toHaveLength(1);
});

test('a stale reply lease can recover without duplicating the saved user message', async () => {
  const requestId = randomUUID();
  db.insert(messages).values({ id: requestId, sessionId: id, role: 'user', content: '继续沟通', sequence: 1, createdAt: Date.now() }).run();
  db.update(trainingSessions).set({ status: 'replying', updatedAt: Date.now() - 61_000 }).where(eq(trainingSessions.id, id)).run();
  expect((await sendMessage(id, ownerId, '继续沟通', requestId, mockProvider)).ok).toBe(true);
  expect(rows()).toHaveLength(3);
  expect(session().status).toBe('active');
});

test('only one concurrent report generator can commit, and a stale finishing lease can recover', async () => {
  for (let index = 0; index < 3; index++) await sendMessage(id, ownerId, `第${index}轮需求`, randomUUID(), mockProvider);
  let release!: (value: Awaited<ReturnType<typeof mockProvider.generateTrainingReport>>) => void;
  const waiting = new Promise<Awaited<ReturnType<typeof mockProvider.generateTrainingReport>>>(resolve => { release = resolve; });
  const provider = { ...mockProvider, generateTrainingReport: () => waiting };
  const first = finishSession(id, ownerId, provider);
  expect(await finishSession(id, ownerId, mockProvider)).toMatchObject({ ok: false, code: 'IN_PROGRESS', status: 409 });
  db.update(trainingSessions).set({ updatedAt: Date.now() - 61_000 }).where(eq(trainingSessions.id, id)).run();
  const recovered = await finishSession(id, ownerId, mockProvider);
  expect(recovered.ok).toBe(true);
  release(await mockProvider.generateTrainingReport(scenario, rows()));
  expect(await first).toMatchObject({ ok: false, code: 'IN_PROGRESS' });
  expect(reportRows()).toHaveLength(1);
  expect(session().status).toBe('completed');
});
