import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, closeSync, openSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setDefaultResultOrder } from 'node:dns';
import { getCACertificates, setDefaultCACertificates } from 'node:tls';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import Database from 'better-sqlite3';
import { createEmailVerificationToken } from 'better-auth/api';
import { collectOps } from './ops-monitor.mjs';

const caddy = process.env.CADDY_BIN;
if (!caddy) throw Error('Set CADDY_BIN to the verified local Caddy executable.');
const real = process.argv.includes('--real');
const recordedUsage = 139003;
const alreadyUsed = Number(process.env.QA_PRIOR_TOKENS ?? recordedUsage);
if (real && (!Number.isInteger(alreadyUsed) || alreadyUsed < recordedUsage || alreadyUsed >= 200000)) {
  throw Error('Incorrect prior QA token count.');
}
if (real) {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  if (process.env.AI_PROVIDER !== 'bailian' || process.env.AI_MODEL !== 'qwen3.7-flash' || !process.env.AI_API_KEY ||
      process.env.AI_API_URL !== 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions') {
    throw Error('Real acceptance requires the permitted fixed model and endpoint.');
  }
}
const directory = mkdtempSync(path.join(tmpdir(), 'sales-staging-'));
const log = path.join(directory, 'app.log');
const dbPath = name => path.join(directory, name + '.sqlite');
const origin = 'https://localhost:3443';
const localhost = '127.0.0.1';
const secret = randomBytes(36).toString('hex');
const report = { mode: real ? 'real' : 'mock', mail: 'isolated HTTP transport', checks: [], corpus: [] };
const events = [];
const processes = [];
let next;
let failMail = true;
setDefaultResultOrder('ipv4first');
function check(ok, name) { if (!ok) throw Error('Check failed: ' + name); }
function mark(name) { report.checks.push(name); console.log(name); }
function calls() {
  return existsSync(log) ? readFileSync(log, 'utf8').split(/\r?\n/)
    .filter(line => line.includes('[ai-call] ')).map(line => JSON.parse(line.split('[ai-call] ')[1])) : [];
}
function budget() {
  if (!real) return;
  const previous = calls();
  check(previous.length < 28 && previous.every(event => event.requestedModel === 'qwen3.7-flash' && event.actualModel === 'qwen3.7-flash' &&
    Number.isFinite(event.totalTokens) && (event.cost === 0 || event.cost == null)), 'fixed model, usage and cost');
  check(alreadyUsed + previous.reduce((sum, event) => sum + event.totalTokens, 0) + 18000 < 200000, 'real-test budget');
}
function spawnLogged(exe, args, env, filename) {
  const fd = openSync(filename, 'a', 0o600);
  try {
    const child = spawn(exe, args, { env, windowsHide: true, stdio: ['ignore', fd, fd] });
    processes.push(child);
    return child;
  } finally { closeSync(fd); }
}
async function stop(child) {
  if (child && child.exitCode === null && child.signalCode === null) {
    const done = once(child, 'exit');
    child.kill();
    await done;
  }
}
async function waitFor(test, name) {
  for (let index = 0; index < 80; index++) {
    if (await test().catch(() => false)) return;
    await setTimeout(150);
  }
  throw Error('Timed out: ' + name);
}
const mailbox = createServer(async (request, response) => {
  if (request.url !== '/emails' || request.method !== 'POST' || request.headers.authorization) { response.writeHead(400).end(); return; }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    const message = JSON.parse(Buffer.concat(chunks));
    if (failMail) { failMail = false; events.push({ failed: true }); response.writeHead(503).end(); return; }
    events.push(message);
    response.writeHead(200).end('{}');
  } catch { response.writeHead(400).end(); }
});
function spin(database) {
  next = spawnLogged(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', localhost, '--port', '3120'], {
    ...process.env, DATABASE_URL: database, RELEASE_PROFILE: 'staging', ACCOUNT_REQUIRED: '1', E2E_TEST: '0',
    BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: secret, AUTH_MAIL_TRANSPORT: 'loopback-test',
    AUTH_MAIL_TEST_URL: `http://127.0.0.1:${mailbox.address().port}/emails`, AUTH_MAIL_FROM: '', RESEND_API_KEY: '',
    AI_MODE: real ? 'real' : 'mock', VOICE_BAILIAN_API_KEY: '', USAGE_ADMIN_EMAIL: email('alice'),
  }, log);
}
function client(ip) {
  const jar = new Map();
  return async (route, { method = 'GET', body, ...extra } = {}) => {
    const url = new URL(route, origin);
    check(url.origin === origin, 'same-origin email and requests');
    const res = await fetch(url, {
      signal: AbortSignal.timeout(95_000), method, redirect: 'manual',
      headers: { Origin: origin, Cookie: [...jar.values()].join('; '), 'X-Forwarded-For': ip, ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookies = res.headers.getSetCookie();
    for (const cookie of setCookies) {
      const pair = cookie.split(';')[0];
      const name = pair.split('=')[0];
      if (/Max-Age=0/i.test(cookie)) jar.delete(name); else jar.set(name, pair);
    }
    return { status: res.status, location: res.headers.get('location'), cookies: setCookies, data: await res.json().catch(() => null) };
  };
}
const email = name => name + '@example.invalid';
const oldPassword = 'staging-test-password-013';
const newPassword = 'staging-test-password-014';
const latestMail = (to, keyword) => events.findLast(event => event.to?.[0] === to && event.subject.includes(keyword));
function backup(mode, source, target) {
  const copied = spawnSync(process.execPath, ['scripts/sqlite-copy.mjs', mode, source, target], { encoding: 'utf8', windowsHide: true });
  check(copied.status === 0, mode + ' database');
}
const post = (action, body = {}) => ({ method: 'POST', body, ...action });
const scene = { product: '咖啡设备维护', description: '设备维护与检查', identity: '门店负责人', difficulty: '中等', personality: '普通型', goal: '处理客户异议' };
try {
  // A unique backup directory and localhost bindings keep the drill away from live infrastructure.
  for (const port of [3120, 3180, 3443]) {
    const socket = createServer();
    socket.listen(port, localhost);
    await once(socket, 'listening');
    await new Promise(resolve => socket.close(resolve));
  }
  mailbox.listen(0, localhost);
  await once(mailbox, 'listening');
  let caddyConfig = readFileSync('deploy/Caddyfile', 'utf8').replaceAll('\r\n', '\n').replace('{\n', `{\n admin off\n persist_config off\n http_port 3180\n https_port 3443\n default_bind 127.0.0.1\n skip_install_trust\n storage file_system {\n root "${directory.replaceAll('\\', '/')}/pki"\n }\n`);
  caddyConfig = caddyConfig.replace(/^\{\$PUBLIC_DOMAIN\} \{/m, 'localhost {\n tls internal').replaceAll('{$PUBLIC_DOMAIN}', 'localhost')
    .replace('https://localhost{uri}', 'https://localhost:3443{uri}').replace('reverse_proxy app:3000', 'reverse_proxy 127.0.0.1:3120');
  const configFile = path.join(directory, 'Caddyfile');
  writeFileSync(configFile, caddyConfig);
  const valid = spawnSync(caddy, ['validate', '--config', configFile, '--adapter', 'caddyfile'], { windowsHide: true, encoding: 'utf8' });
  if (valid.status !== 0) throw Error('Caddy configuration failed: ' + valid.stderr);
  spawnLogged(caddy, ['run', '--config', configFile, '--adapter', 'caddyfile'], process.env, path.join(directory, 'proxy.log'));
  const ca = path.join(directory, 'pki', 'pki', 'authorities', 'local', 'root.crt');
  await waitFor(async () => existsSync(ca), 'local CA');
  setDefaultCACertificates([...getCACertificates('default'), readFileSync(ca, 'utf8')]);
  spin(dbPath('live'));
  await waitFor(async () => (await fetch(origin + '/api/health', { signal: AbortSignal.timeout(1500) })).ok, 'production build via HTTPS');
  const redirect = await fetch('http://localhost:3180/api/health', { redirect: 'manual', signal: AbortSignal.timeout(2500) });
  check(redirect.status === 308 && redirect.headers.get('location') === origin + '/api/health', `HTTP redirect (${redirect.status}, ${redirect.headers.get('location')})`);
  const oversized = await fetch(origin + '/api/auth/sign-up/email', { method: 'POST', headers: { 'Content-Type':'application/json', Origin:origin },
    body: JSON.stringify({ email:'oversize@example.invalid', name: 'x'.repeat(65_536), password:'test-only-password-123' }) });
  check(oversized.status === 413, 'proxy rejects oversized write before app');
  mark('local TLS, HTTP redirect and production readiness');
  const alice = client('192.0.2.10');
  const bob = client('192.0.2.20');
  check((await alice('/api/auth/sign-up/email', post({}, { name:'Alice', email:'not-an-email', password:oldPassword }))).status === 400, 'invalid email');
  const sign = await alice('/api/auth/sign-up/email', post({}, { name:'Alice', email:email('alice'), password:oldPassword, callbackURL:'/account', emailVerified:true }));
  check(sign.status === 200 && sign.data.user.emailVerified === false, 'client cannot mark verified');
  await waitFor(async () => events.some(event => event.failed), 'isolated delivery failure');
  check((await alice('/api/auth/sign-in/email', post({}, { email:email('alice'), password:oldPassword }))).status === 403, 'unverified login');
  const resend = await alice('/api/auth/send-verification-email', post({}, { email:email('alice'), callbackURL:'/account' }));
  check(resend.status === 200, 'verification resend');
  await waitFor(async () => Boolean(latestMail(email('alice'), '验证')), 'resent mail');
  const verification = latestMail(email('alice'), '验证').text;
  check(new URL(verification).origin === origin && new URL(verification).pathname === '/api/auth/verify-email', 'verification link shape');
  const actualToken = new URL(verification).searchParams.get('token');
  const claims = JSON.parse(Buffer.from(actualToken.split('.')[1], 'base64url'));
  check(claims.exp - claims.iat === 3600, 'verification lifetime');
  const expired = await createEmailVerificationToken(secret, email('alice'), undefined, -5, { userId: sign.data.user.id });
  const verifyExpired = await alice('/api/auth/verify-email?callbackURL=%2Faccount&token=' + encodeURIComponent(expired));
  check(verifyExpired.status === 302 && new URL(verifyExpired.location, origin).searchParams.has('error'), 'expired verification rejected');
  check((await alice(verification)).status === 302, 'successful verification');
  const verifiedAgain = await alice(verification);
  check(verifiedAgain.status === 302 && !new URL(verifiedAgain.location, origin).searchParams.has('error'), 'verification replay is idempotent');
  const logged = await alice('/api/auth/sign-in/email', post({}, { email:email('alice'), password:oldPassword }));
  check(logged.status === 200 && logged.cookies.some(cookie => /^__Secure-.*session_token=/.test(cookie) &&
    /; Secure/i.test(cookie) && /; HttpOnly/i.test(cookie) && /; SameSite=Lax/i.test(cookie)), 'secure session cookie');
  mark('email rejection, delivery failure/retry, expiry, idempotency and secure cookie');
  const mailCount = events.length;
  check((await bob('/api/auth/request-password-reset', post({}, { email:email('unknown'), redirectTo:'/account/reset' }))).status === 200 &&
    events.length === mailCount, 'unknown email not disclosed or mailed');
  check((await bob('/api/auth/sign-up/email', post({}, { name:'Bob', email:email('bob'), password:oldPassword, callbackURL:'/account' }))).status === 200, 'second registration');
  await waitFor(async () => Boolean(latestMail(email('bob'), '验证')), 'second verification');
  check((await bob(latestMail(email('bob'), '验证').text)).status === 302, 'second verification link');
  check((await bob('/api/auth/sign-in/email', post({}, { email:email('bob'), password:oldPassword }))).status === 200, 'second login');

  budget();
  const created = await alice('/api/sessions', post({}, scene));
  check(created.status === 201, 'create authorized production training');
  const route = '/api/sessions/' + created.data.data.id;
  for (const content of ['您最关注维护费还是上门时间？', '工作日两小时内联系确认，维护清单提前发给您。', '下周二看清单，不用签约，可以吗？']) {
    budget();
    check((await alice(route + '/messages', post({}, { content, requestId: randomUUID() }))).status === 200, 'conversation turn');
  }
  budget();
  const finish = await alice(route + '/finish', post({}));
  check(finish.status === 200, 'score report');
  const conversation = (await alice(route)).data.data.messages;
  const saved = finish.data.data.report;
  check(saved.scoringSource === report.mode && saved.issues.every(q => conversation.some(m => m.role === 'user' && m.id === q.message_id && m.content.includes(q.quote))), 'report source and evidence');
  check((await alice(route + '/report')).status === 200 && (await alice('/api/sessions')).data.data.items.length === 1, 'history and report');
  check((await bob(route)).status === 404 && (await bob(route + '/report')).status === 404 && (await bob(route + '/finish', post({}))).status === 404, 'cross-user isolation');
  check((await alice('/api/account/usage?scope=system')).status === 200 &&
    (await bob('/api/account/usage?scope=system')).status === 404, 'verified administrator access only');
  mark('administrator usage access limited to configured account');
  check((await alice('/api/account/export')).data.sessions.length === 1, 'data export');
  mark('training, assessment, history, authorization and export');
  check((await alice('/api/auth/sign-out', post({}))).status === 200 && (await alice(route)).status === 404, 'logout');
  check((await alice('/api/auth/request-password-reset', post({}, { email:email('alice'), redirectTo:'/account/reset' }))).status === 200, 'password reset request');
  await waitFor(async () => Boolean(latestMail(email('alice'), '重置')), 'password reset email');
  const reset = await alice(latestMail(email('alice'), '重置').text);
  check(reset.status === 302 && new URL(reset.location, origin).pathname === '/account/reset', 'reset link callback');
  const token = new URL(reset.location, origin).searchParams.get('token');
  const expDb = new Database(dbPath('live'));
  const tokenRow = expDb.prepare('SELECT expiresAt FROM verification WHERE identifier=?').get('reset-password:' + token);
  check(Math.abs(new Date(tokenRow.expiresAt).getTime() - Date.now() - 1800000) < 30000, 'password reset lifetime');
  expDb.prepare('UPDATE verification SET expiresAt=? WHERE identifier=?').run(new Date(Date.now() - 1000).toISOString(), 'reset-password:' + token);
  expDb.close();
  check((await alice('/api/auth/reset-password', post({}, { token, newPassword }))).status === 400, 'expired password reset rejected');
  check((await alice('/api/auth/request-password-reset', post({}, { email:email('alice'), redirectTo:'/account/reset' }))).status === 200, 'fresh reset request');
  const freshReset = await alice(latestMail(email('alice'), '重置').text);
  const freshToken = new URL(freshReset.location, origin).searchParams.get('token');
  check((await alice('/api/auth/reset-password', post({}, { token:freshToken, newPassword }))).status === 200, 'reset password');
  check((await alice('/api/auth/reset-password', post({}, { token:freshToken, newPassword }))).status === 400, 'used reset token rejected');
  const resumed = client('192.0.2.30');
  let afterResetLogin = await resumed('/api/auth/sign-in/email', post({}, { email:email('alice'), password:newPassword }));
  if (afterResetLogin.status === 429) {
    mark('credentials endpoint throttled repeated requests');
    await setTimeout(10_100);
    afterResetLogin = await resumed('/api/auth/sign-in/email', post({}, { email:email('alice'), password:newPassword }));
  }
  check(afterResetLogin.status === 200, 'login after reset');
  mark('logout, reset expiry, one-time reset and new login');

  if (real && process.argv.includes('--corpus')) {
    const cases = JSON.parse(readFileSync('tests/fixtures/sales-quality-v1.json','utf8')).cases;
    const sqlite = new Database(dbPath('live'));
    try {
      const owner = 'account:' + sign.data.user.id;
      for (const sample of cases) {
        const id = randomUUID();
        sqlite.transaction(() => {
          sqlite.prepare("INSERT INTO training_sessions VALUES(?,?,?,?,'active',?,?)")
            .run(id, owner, JSON.stringify(scene), JSON.stringify({ mode:'real', identity:scene.identity }), Date.now(), Date.now());
          const insert = sqlite.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)');
          for (const [sequence, message] of sample.dialogue.entries()) insert.run(randomUUID(), id, message.role, message.content, sequence, Date.now());
        })();
        budget();
        const rated = await resumed('/api/sessions/' + id + '/finish', post({}));
        check(rated.status === 200, `corpus report ${sample.id} (HTTP ${rated.status})`);
        const result = rated.data.data.report;
        if (sample.id === 'short') { check(result.scores === null, 'short unscored corpus'); continue; }
        const ending = sample.dialogue.findLast(x => x.role === 'customer');
        check(result.customer_outcome === `客户最后回复：「${ending.content}」` &&
          result.issues.every(issue => sqlite.prepare("SELECT 1 FROM messages WHERE id=? AND session_id=? AND role='user' AND instr(content,?)>0")
            .get(issue.message_id, id, issue.quote)), 'corpus outcome and quotes ' + sample.id);
        report.corpus.push({ id: sample.id, total: Object.values(result.scores).reduce((n,x) => n + x.score,0), quotes: result.issues.length });
      }
      const concernId = randomUUID();
      sqlite.prepare("INSERT INTO training_sessions VALUES(?,?,?,?,'active',?,?)")
        .run(concernId, owner, JSON.stringify(scene), JSON.stringify({ mode:'real', identity:scene.identity, concerns:'上门时效不确定；需要明确维护范围' }), Date.now(), Date.now());
      const repeatedConcern = [['customer','报修后多久能到店？'], ['user','我们先对齐维护范围。'], ['customer','上门时效具体是几小时？']];
      const insert = sqlite.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)');
      for (const [sequence, [role, text]] of repeatedConcern.entries()) insert.run(randomUUID(), concernId, role, text, sequence, Date.now());
      budget();
      const continued = await resumed('/api/sessions/' + concernId + '/messages', post({}, {
        content: '确认承诺是工作时间两小时内上门，到店前通知您。今天我们也可以先对照维护范围，您希望确认哪项？', requestId: randomUUID(),
      }));
      check(continued.status === 200 && !/[^。！？!?]*(上门|响应速度|响应时效|几小时|多久能到)[^。！？!?]*[？?]/u.test(continued.data.data.reply), 'resolved concern not asked a third time');
      report.resolvedConcernReply = continued.data.data.reply;
    } finally { sqlite.close(); }
    mark('real regression corpus with outcome and evidence checks');
  }
  backup('backup',dbPath('live'),dbPath('backup'));
  await stop(next);
  spin(dbPath('live'));
  await waitFor(async () => (await fetch(origin + '/api/health', { signal:AbortSignal.timeout(1500) })).ok, 'restarted server');
  check((await resumed(route + '/report')).status === 200, 'report survives server restart with auth');
  await stop(next);
  backup('restore',dbPath('backup'),dbPath('restored'));
  spin(dbPath('restored'));
  await waitFor(async () => (await fetch(origin + '/api/health', { signal:AbortSignal.timeout(1500) })).ok, 'restored database');
  check(JSON.stringify((await resumed(route + '/report')).data.data) === JSON.stringify(saved), 'restored account report matches');
  check((await resumed('/api/auth/delete-user', post({}, { callbackURL:'/' }))).status === 200, 'delete request');
  await waitFor(async () => Boolean(latestMail(email('alice'), '删除')), 'deletion email');
  check((await resumed(latestMail(email('alice'), '删除').text)).status === 302, 'delete verified');
  check((await resumed(route)).status === 404 && (await bob('/api/account/export')).status === 200, 'delete scope and remaining account');
  mark('restart, restore, deletion and isolation');
  const sensitive = events.filter(event => event.text).map(event => event.text);
  const logs = readFileSync(log, 'utf8') + '\n' + readFileSync(path.join(directory, 'proxy.log'),'utf8');
  check(sensitive.every(link => !logs.includes(link) && !logs.includes(new URL(link).searchParams.get('token') ?? new URL(link).pathname.split('/').at(-1))), 'secret-bearing links not in logs');
  mark('no verification or reset links in logs');
  const entries = logs.split(/\r?\n/);
  const access = entries.flatMap(line => {
    try {
      const parsed = JSON.parse(line);
      return parsed.logger?.startsWith('http.log.access.') ? [parsed] : [];
    } catch { return []; }
  });
  check(access.length > 10 && access.every(entry => !entry.request && !entry.resp_headers && !entry.user_id),
    'operational access logs omit request and response details');
  const metrics = await collectOps(entries, { database: dbPath('restored'), backupDirectory: directory,
    offsiteRequired: false, ready: true });
  check(metrics.api.requests === access.length && metrics.events.mailFailures === 1, 'proxy counts and mail failure reach monitoring');
  report.metrics = metrics;
  mark('redacted Caddy status metrics and mail failure count');
} catch (error) {
  report.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const child of processes.reverse()) await stop(child);
  if (mailbox.listening) await new Promise(resolve => mailbox.close(resolve));
  report.calls = calls();
  const artifact = path.join(directory, 'result.json');
  writeFileSync(artifact, JSON.stringify(report, null, 2));
  console.log(artifact);
}
