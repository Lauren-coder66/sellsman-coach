import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

const directory = mkdtempSync(path.join(tmpdir(), 'sales-prod-smoke-'));
const [original, snapshot, recovered] = ['live.sqlite', 'backup.sqlite', 'restore.sqlite'].map(name => path.join(directory, name));
const origin = 'http://127.0.0.1:3112';
let server;
let owner;
function assert(condition, message) { if (!condition) throw Error(message); }

async function start(database) {
  const alreadyRunning = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(500) }).then(() => true, () => false);
  if (alreadyRunning) throw Error('Port 3112 already has a running server');
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3112'], {
    env: { ...process.env, AI_MODE: 'mock', DATABASE_URL: database, E2E_TEST: '0', ACCOUNT_REQUIRED: '0', BETTER_AUTH_URL: '', BETTER_AUTH_SECRET: '' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error('Server exited');
    try { if ((await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1000)})).ok) return; }
    catch { /* Wait for server to bind. */ }
    await setTimeout(150);
  }
  throw Error('Server health check timed out');
}
async function stop() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const result = once(server, 'exit');
  server.kill();
  await result;
}
function copy(mode, source, dest, expectedStatus = 0) {
  const result = spawnSync(process.execPath, ['scripts/sqlite-copy.mjs', mode, source, dest], { stdio: 'inherit' });
  assert(result.status === expectedStatus, 'Unexpected backup operation result');
}
async function read(id) {
  const response = await fetch(origin + '/api/sessions/' + id, {headers: { Cookie: owner }});
  assert(response.ok, 'Session unavailable');
  assert((await response.json()).data.session.scenario.product === '验收咖啡设备', 'Recovered record mismatch');
}
try {
  await start(original);
  const created = await fetch(origin + '/api/sessions', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({product:'验收咖啡设备',description:'设备维护',identity:'门店负责人',difficulty:'简单',personality:'普通型',goal:'了解客户需求'}),
  });
  assert(created.status === 201, 'Creation failed');
  owner = created.headers.get('set-cookie').split(';')[0];
  const id = (await created.json()).data.id;
  await read(id);
  copy('backup', original, snapshot);
  await stop();
  await start(original);
  await read(id);
  await stop();
  copy('restore', snapshot, recovered);
  copy('restore', snapshot, original, 1);
  await start(recovered);
  await read(id);
  if (process.argv.includes('--load')) {
    const samples = [];
    async function request(method, route, body, cookie = '') {
      const start = performance.now();
      const response = await fetch(origin + route, {
        method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
      samples.push(Math.round(performance.now() - start));
      assert(response.ok, 'Load smoke status ' + response.status);
      return { data: (await response.json()).data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
    }
    await Promise.all(Array.from({ length: 8 }, async (_, index) => {
      const scene = { product: '并发测试设备 ' + index, description: '设备维护', identity: '门店负责人', difficulty: '简单', personality: '普通型', goal: '了解客户需求', requestId: randomUUID() };
      const { data: created, cookie } = await request('POST', '/api/sessions', scene);
      const route = '/api/sessions/' + created.id;
      const duplicate = await request('POST', '/api/sessions', scene, cookie);
      assert(duplicate.data.id === created.id && duplicate.data.replayed, 'Create replay failed');
      for (const content of ['您目前希望解决什么问题？', '我们先了解预算和目标。', '可以约下次沟通。']) {
        const outgoing = { content, requestId: randomUUID() };
        await request('POST', route + '/messages', outgoing, cookie);
        await request('POST', route + '/messages', outgoing, cookie);
      }
      const report = await request('POST', route + '/finish', undefined, cookie);
      const repeated = await request('POST', route + '/finish', undefined, cookie);
      assert(JSON.stringify(report.data) === JSON.stringify(repeated.data), 'Duplicate report differed');
      const history = await request('GET', route, undefined, cookie);
      assert(history.data.messages.length === 7, 'Unexpected message count');
    }));
    samples.sort((a, b) => a - b);
    console.log(JSON.stringify({ concurrentClients: 8, successfulRequests: samples.length, p50Ms: samples[Math.ceil(samples.length * .5) - 1], p95Ms: samples[Math.ceil(samples.length * .95) - 1] }));
  }
  console.log(JSON.stringify({ productionMode: true, healthy: true, restart: true, restore: true, existingDestinationProtected: true, directory }));
} finally {
  await stop();
}
