import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import Database from 'better-sqlite3';

const dir = mkdtempSync(path.join(tmpdir(), 'sales-quota-'));
const file = path.join(dir, 'test.sqlite');
const port = 3121;
const scene = { product:'限流验收', description:'测试设备维护', identity:'门店负责人', difficulty:'简单', personality:'普通型', goal:'了解客户需求' };
const profile = { identity: '门店负责人', needs: '维护', budget: '待确认', concerns: '时间', purchaseIntent: '了解服务', decisionCriteria: '清单' };
let received = 0;
let firstArrived;
let releaseFirst;
const first = new Promise(resolve => { firstArrived = resolve; });
const release = new Promise(resolve => { releaseFirst = resolve; });
const fake = createServer(async (req, res) => {
  const chunks = [];
  for await (const part of req) chunks.push(part);
  try {
    const call = JSON.parse(Buffer.concat(chunks));
    received++;
    if (received === 1) { firstArrived(); await release; }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      model: 'test-model', choices: [{ message: { content: JSON.stringify(call.max_tokens === 1400 ? profile : { reply: '可以先看看维护范围吗？' }) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
    }));
  } catch { res.writeHead(400).end(); }
});
const check = (ok, reason) => { if (!ok) throw Error(reason); };
let app;
try {
  const probe = createServer();
  probe.listen(port, '127.0.0.1');
  await once(probe, 'listening');
  await new Promise(resolve => probe.close(resolve));
  fake.listen(0, '127.0.0.1');
  await once(fake, 'listening');
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, AI_MODE: 'real', AI_CREATE_STRATEGY: 'sequential', AI_PROVIDER: 'isolated-fixture', AI_MODEL: 'test-model',
      AI_API_URL: `http://127.0.0.1:${fake.address().port}/chat/completions`, AI_API_KEY: 'fixture-only',
      ACCOUNT_REQUIRED: '0', BETTER_AUTH_URL: '', BETTER_AUTH_SECRET: '', DATABASE_URL: file },
    windowsHide: true, stdio: ['ignore', 'ignore', 'inherit'],
  });
  const base = `http://127.0.0.1:${port}`;
  let healthy = false;
  for (let i = 0; i < 80 && !healthy; i++) {
    healthy = await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) }).then(r => r.ok, () => false);
    if (!healthy) await setTimeout(125);
  }
  check(healthy, 'isolated server readiness');
  const owner = randomUUID();
  const create = () => fetch(base + '/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'sales_coach_owner=' + owner },
    body: JSON.stringify(scene), signal: AbortSignal.timeout(30_000) });
  const creation = create();
  await Promise.race([first, setTimeout(12_000, false)]).then(value => check(value !== false, 'fixture received first request'));
  const blocked = await Promise.all(Array.from({ length: 6 }, create));
  check(blocked.every(result => result.status === 429) && received === 1, 'parallel requests bypassed reservation');
  releaseFirst();
  check((await creation).status === 201 && received === 2, 'first creation or opening failed');
  const sqlite = new Database(file);
  try {
    const row = sqlite.prepare("SELECT count(*) n, sum(tokens) tokens FROM ai_usage WHERE owner_id=?").get(owner);
    check(row.n === 2 && row.tokens === 260, 'unexpected counted usage');
    sqlite.prepare("UPDATE ai_usage SET tokens=60000 WHERE owner_id=?").run(owner);
    check((await create()).status === 429 && received === 2, 'daily quota bypassed');
    sqlite.prepare("UPDATE ai_usage SET tokens=100 WHERE owner_id=?").run(owner);
    const add = sqlite.prepare("INSERT INTO ai_usage(id,owner_id,model,provider,operation,started_at,completed_at,reserved_tokens,tokens,outcome) VALUES(?,?,'test-model','fixture','reply',?,?,100,100,'ok')");
    for (let i = row.n; i < 24; i++) add.run(randomUUID(), owner, Date.now(), Date.now());
    check((await create()).status === 429 && received === 2, 'minute quota bypassed');
  } finally { sqlite.close(); }
  console.log(JSON.stringify({ parallel429: blocked.length, fakeUpstreamCalls: received, daily429: true, minute429: true }));
} finally {
  releaseFirst();
  if (app?.exitCode === null && app?.signalCode === null) {
    const done = once(app, 'exit');
    app.kill();
    await done;
  }
  if (fake.listening) await new Promise(resolve => fake.close(resolve));
}
