import { afterAll, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';

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
  const scenario = { product: '[QA-TEST] 企业网站开发', description: '企业网站设计和维护', identity: '企业负责人', personality: '怀疑型', difficulty: '困难', goal: '处理客户异议' };
  const profile = { identity: '企业负责人', needs: '增加线上询盘', budget: '每年两万元', concerns: '不确定投入效果', purchaseIntent: '谨慎比较', decisionCriteria: '需要案例和预算说明', mode: 'real' };
  const now = Date.now();
  db.insert(trainingSessions).values({ id, ownerId, scenarioJson: JSON.stringify(scenario), customerProfileJson: JSON.stringify(profile), status: 'active', createdAt: now, updatedAt: now }).run();
  db.insert(messages).values({ id: randomUUID(), sessionId: id, role: 'customer', content: '你们有可核实的案例吗？', sequence: 0, createdAt: now }).run();

  process.env.AI_MODE = 'mock'; // A saved real session must keep using real mode after the default changes.
  process.env.AI_PROVIDER = 'local-test';
  process.env.AI_API_URL = 'http://localhost:3999/v1/chat/completions';
  process.env.AI_MODEL = 'simulated-model';
  process.env.AI_API_KEY = 'unit-only';
  process.env.AI_TIMEOUT_MS = '1000';
  vi.spyOn(console, 'info').mockImplementation(() => {});
  let failOnce = true;
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const input = JSON.parse(JSON.parse(init.body as string).messages[1].content);
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
  expect((await finishSession(id, ownerId)).ok).toBe(true);
  expect(db.select().from(trainingReports).where(eq(trainingReports.sessionId, id)).all()).toHaveLength(1);
  expect((await finishSession(id, ownerId)).ok).toBe(true);
});
