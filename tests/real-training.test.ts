import { afterAll, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { mockProvider } from '../src/lib/ai/mock-provider';

const directory = mkdtempSync(path.join(tmpdir(), 'sales-coach-real-sim-'));
const originalEnv = { ...process.env };
process.env.DATABASE_URL = path.join(directory, 'test.sqlite');
const { db, sqlite } = await import('../src/lib/db');
const { messages, trainingReports, trainingSessions } = await import('../src/lib/db/schema');
const { sendMessage, finishSession } = await import('../src/lib/training-service');

afterAll(() => {
  sqlite.close();
  delete (globalThis as typeof globalThis & { salesCoachConnection?: unknown }).salesCoachConnection;
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.env = originalEnv;
});

test('simulated real endpoint preserves ten turns, retries failure, and never adds duplicate replies', async () => {
  const ownerId = randomUUID();
  const id = randomUUID();
  const scenario = { product: '[QA-TEST] 企业网站开发', description: '企业网站设计和维护', identity: '企业负责人', personality: '怀疑型', difficulty: '困难', goal: '处理客户异议' } as const;
  const profile = { identity: '企业负责人', needs: '增加线上询盘', budget: '每年两万元', concerns: '不确定投入效果', purchaseIntent: '谨慎比较', decisionCriteria: '需要案例和预算说明', mode: 'real', model: 'simulated-model' };
  const now = Date.now();
  db.insert(trainingSessions).values({ id, ownerId, scenarioJson: JSON.stringify(scenario), customerProfileJson: JSON.stringify(profile), status: 'active', createdAt: now, updatedAt: now }).run();
  db.insert(messages).values({ id: randomUUID(), sessionId: id, role: 'customer', content: '你们有可核实的案例吗？', sequence: 0, createdAt: now }).run();

  process.env.AI_MODE = 'mock'; // A saved real session must keep using real mode after the default changes.
  process.env.AI_PROVIDER = 'local-test';
  process.env.AI_API_URL = 'http://localhost:3999/v1/chat/completions';
  process.env.AI_MODEL = 'new-default-model';
  process.env.AI_ALLOWED_MODELS = 'simulated-model';
  process.env.AI_API_KEY = 'unit-only';
  process.env.AI_TIMEOUT_MS = '1000';
  vi.spyOn(console, 'info').mockImplementation(() => {});
  let failOnce = true;
  let reportAttempts = 0;
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const request = JSON.parse(init.body as string);
    expect(request.model).toBe('simulated-model');
    const input = JSON.parse(request.messages[1].content);
    if (input.messages) {
      expect(input.profile).toBeUndefined();
      expect(input.messages).toHaveLength(21);
      expect(request.temperature).toBe(0);
      reportAttempts++;
      if (reportAttempts === 1) return new Response('', { status: 504 });
      if (reportAttempts === 2) return Response.json({ choices: [{ message: { content: '{}' }, finish_reason: 'length' }] });
      if (reportAttempts === 5) return new Response('', { status: 429 });
      const report = await mockProvider.generateTrainingReport(scenario, input.messages);
      if (reportAttempts === 3) return Response.json({ choices: [{ message: { content: 'not JSON' } }] });
      if (reportAttempts === 4) report.issues[0].quote = '虚构发言';
      return Response.json({ model: 'simulated-model', choices: [{ message: { content: JSON.stringify(report) } }] });
    }
    expect(input.profile).toEqual(profile);
    const turns = input.history.filter((message: { role: string }) => message.role === 'user').length;
    expect(input.history.at(-1).role).toBe('user');
    if (turns === 5 && failOnce) { failOnce = false; return new Response('temporary', { status: 503 }); }
    return Response.json({ choices: [{ message: { content: JSON.stringify({ reply: `第${turns}轮：我还需要核实案例和预算。` }) } }], usage: { total_tokens: 12 } });
  });
  vi.stubGlobal('fetch', fetcher);

  for (let turn = 1; turn <= 10; turn++) {
    const requestId = randomUUID();
    const content = `第${turn}轮：关于网站方案和案例，我想继续沟通。`;
    if (turn === 5) {
      expect(await sendMessage(id, ownerId, content, requestId)).toMatchObject({ ok: false, code: 'CUSTOMER_REPLY_ERROR', status: 502 });
      expect(db.select().from(messages).where(eq(messages.sessionId, id)).all().at(-1)).toMatchObject({ id: requestId, role: 'user' });
    }
    const result = await sendMessage(id, ownerId, content, requestId);
    expect(result).toMatchObject({ ok: true, data: { reply: `第${turn}轮：我还需要核实案例和预算。` } });
    expect(await sendMessage(id, ownerId, content, requestId)).toMatchObject({ ok: true, data: { alreadySaved: true } });
  }
  expect(fetcher).toHaveBeenCalledTimes(11);
  const history = db.select().from(messages).where(eq(messages.sessionId, id)).orderBy(messages.sequence).all();
  expect(history).toHaveLength(21);
  expect(history.filter(message => message.role === 'user')).toHaveLength(10);
  expect(history.filter(message => message.role === 'customer')).toHaveLength(11);
  expect(await finishSession(id, randomUUID())).toMatchObject({ ok: false, status: 404 });
  expect(reportAttempts).toBe(0);
  expect(await finishSession(id, ownerId)).toMatchObject({ ok: false, status: 504, code: 'REPORT_TIMEOUT' });
  expect(await finishSession(id, ownerId)).toMatchObject({ ok: false, status: 502, message: expect.stringContaining('Token 上限') });
  expect(await finishSession(id, ownerId)).toMatchObject({ ok: false, status: 502 });
  expect(reportAttempts).toBe(4);
  expect(db.select().from(trainingReports).where(eq(trainingReports.sessionId, id)).all()).toHaveLength(0);
  expect(db.select().from(trainingSessions).where(eq(trainingSessions.id, id)).get()?.status).toBe('failed');
  expect(await finishSession(id, ownerId)).toMatchObject({ ok: false, status: 429, code: 'REPORT_RATE_LIMIT' });
  const finished = await finishSession(id, ownerId);
  expect(finished).toMatchObject({ ok: true, data: { report: { scoringSource: 'real', scoringModel: 'simulated-model' } } });
  expect(db.select().from(trainingReports).where(eq(trainingReports.sessionId, id)).all()).toHaveLength(1);
  expect(await finishSession(id, ownerId)).toEqual(finished);
  expect(reportAttempts).toBe(6);
});
