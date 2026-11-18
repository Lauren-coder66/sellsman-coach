import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { S3Client } from '@aws-sdk/client-s3';
import { expect, test, vi } from 'vitest';
import { backupConfig, backupStatus, backupStorage, backupStore, lifecycleRule, runOffsite, verifyRetention } from '../scripts/offsite.mjs';
import { collectOps } from '../scripts/ops-monitor.mjs';
import { sendOpsAlert } from '../scripts/ops-alert.mjs';

test('restricts destinations and produces a prefix-scoped retention rule', () => {
  expect(backupStorage({ BACKUP_PROVIDER: 'r2', BACKUP_BUCKET: 'qa-backup',
    BACKUP_ENDPOINT: 'https://' + 'a'.repeat(32) + '.r2.cloudflarestorage.com' })).toMatchObject({ region: 'auto', forcePathStyle: true });
  expect(backupStorage({ BACKUP_PROVIDER: 's3', BACKUP_BUCKET: 'qa-backup', BACKUP_REGION: 'ap-east-1' })).toMatchObject({ region: 'ap-east-1' });
  expect(() => backupStorage({ BACKUP_PROVIDER: 'r2', BACKUP_BUCKET: 'qa-backup', BACKUP_ENDPOINT: 'http://127.0.0.1:1234' })).toThrow();
  expect(() => backupConfig({ BACKUP_PREFIX: '../', BACKUP_KEEP_DAYS: '1' })).toThrow();
  expect(lifecycleRule(backupConfig({ BACKUP_PREFIX: 'text/preprod/', BACKUP_KEEP_DAYS: '45' }))).toEqual({
    ID: 'sales-coach-offsite', Status: 'Enabled', Filter: { Prefix: 'text/preprod/' }, Expiration: { Days: 45 },
  });
});

test('S3 wire mock verifies upload, restores SQLite and alerts on corruption or failed uploads', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sales-ops-'));
  const source = path.join(dir, 'source.sqlite');
  const destination = path.join(dir, 'restored.sqlite');
  const database = new Database(source);
  database.exec("PRAGMA journal_mode=WAL; CREATE TABLE proof(value); INSERT INTO proof VALUES ('sqlite-ok')");
  const objects = new Map<string, { content: Buffer; digest: string }>();
  let corrupt = false;
  let unavailable = false;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://127.0.0.1');
    const uri = url.pathname;
    if (unavailable) { response.writeHead(403).end('<Error><Code>AccessDenied</Code></Error>'); return; }
    if (url.searchParams.has('lifecycle')) {
      response.writeHead(200, { 'Content-Type': 'application/xml' }).end(
        '<LifecycleConfiguration><Rule><ID>sales-coach-offsite</ID><Filter><Prefix>sales-coach/</Prefix></Filter><Status>Enabled</Status><Expiration><Days>30</Days></Expiration></Rule></LifecycleConfiguration>',
      );
      return;
    }
    if (request.method === 'PUT') {
      if (request.headers['if-none-match'] !== '*' || !request.headers.authorization?.startsWith('AWS4-HMAC-SHA256')) {
        response.writeHead(400).end(); return;
      }
      if (objects.has(uri)) { response.writeHead(412).end(); return; }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      objects.set(uri, { content: Buffer.concat(chunks), digest: String(request.headers['x-amz-meta-sha256']) });
      response.writeHead(200).end();
      return;
    }
    const object = objects.get(uri);
    if (!object) { response.writeHead(404).end(); return; }
    const bytes = Buffer.from(object.content);
    if (corrupt) bytes[0] ^= 0xff;
    response.writeHead(200, { 'x-amz-meta-sha256': object.digest, 'content-length': bytes.length }).end(bytes);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Mock did not bind');
  const client = new S3Client({
    endpoint: 'http://127.0.0.1:' + address.port, forcePathStyle: true, region: 'auto',
    credentials: { accessKeyId: 'fake-key', secretAccessKey: 'fake-secret' }, requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  const notify = vi.fn(async () => {});
  const prefix = 'sales-coach/';
  const store = backupStore(client, 'qa-bucket', prefix);
  const options = { prefix, store, source, destination, directory: dir, notify, key: '' };
  try {
    await verifyRetention(client, 'qa-bucket', { prefix, days: 30 });
    await expect(verifyRetention(client, 'qa-bucket', { prefix, days: 45 })).rejects.toThrow('retention rule not installed');
    const key = await runOffsite({ ...options, operation: 'backup' });
    expect(objects.size).toBe(1);
    const status = await backupStatus(dir);
    expect(status).toMatchObject({ outcome: 'ok', key });
    await runOffsite({ ...options, operation: 'restore', key });
    const restored = new Database(destination, { readonly: true });
    try { expect(restored.prepare('SELECT value FROM proof').pluck().get()).toBe('sqlite-ok'); }
    finally { restored.close(); }
    const initial = await readFile(destination);
    await expect(runOffsite({ ...options, operation: 'restore', key })).rejects.toThrow('offsite restore failed');
    expect(await readFile(destination)).toEqual(initial);

    corrupt = true;
    await expect(runOffsite({ ...options, operation: 'backup' })).rejects.toThrow('offsite backup failed');
    expect(await backupStatus(dir)).toMatchObject({ outcome: 'failed', latestVerifiedAt: status.latestVerifiedAt });
    const corruptPath = path.join(dir, 'corrupt.sqlite');
    await expect(runOffsite({ ...options, operation: 'restore', key, destination: corruptPath })).rejects.toThrow();
    unavailable = true;
    await expect(runOffsite({ ...options, operation: 'backup' })).rejects.toThrow();
    expect(notify.mock.calls).toEqual([[['offsite_restore_failed']], [['offsite_backup_failed']], [['offsite_restore_failed']], [['offsite_backup_failed']]]);
    expect((await readdir(dir)).some(name => name.startsWith('.transfer-') || name === 'corrupt.sqlite')).toBe(false);
  } finally {
    client.destroy();
    database.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    for (const file of await readdir(dir)) await rm(path.join(dir, file));
    await rmdir(dir);
  }
});

test('aggregates bounded operational metrics and posts only alert codes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sales-monitor-'));
  const database = path.join(dir, 'index.sqlite');
  const db = new Database(database);
  const now = Date.now();
  db.exec('CREATE TABLE ai_usage(started_at, completed_at, operation, outcome, tokens)');
  const insert = db.prepare('INSERT INTO ai_usage VALUES (?, ?, ?, ?, ?)');
  insert.run(now - 1000, now, 'reply', 'ok', 200);
  for (let i = 0; i < 3; i++) insert.run(now - 60_000, now, 'report', 'error', null);
  insert.run(now - 90_000_000, now - 89_999_000, 'reply', 'ok', 900);
  db.close();
  try {
    const status = (status: number) => JSON.stringify({ logger: 'http.log.access.log0', status });
    const report = await collectOps([
      status(200), status(429), status(503), status(500), status(504), '[ops-event] mail_failure rejected', '[api-error] Error',
      'sensitive-content-this-must-not-be-returned',
    ], { database, backupDirectory: dir, offsiteRequired: true, now, ready: false });
    expect(report.api).toEqual({ requests: 5, limited: 1, failed: 3, errorRate: 0.6 });
    expect(report.ai).toMatchObject({ calls: 4, succeeded: 1, failed: 3, measuredTokens: 200, successRate: 0.25, unknownUsageCalls: 3 });
    expect(report.storage?.databaseBytes).toBeGreaterThan(0);
    expect(report.events).toEqual({ mailFailures: 1, systemErrors: 1 });
    expect(report.alerts).toEqual(expect.arrayContaining(['service_unhealthy', 'ai_latency_high', 'mail_delivery_failure', 'offsite_backup_unverified', 'api_error_rate_high']));
    const request = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    await sendOpsAlert(report.alerts, 'https://alerts.example.invalid/', request);
    expect(request).toHaveBeenCalledOnce();
    expect(String(request.mock.calls[0][1]?.body)).not.toContain('sensitive-content');
    await expect(sendOpsAlert(report.alerts, 'http://alerts.example.invalid/', request)).rejects.toThrow();
  } finally { await rm(database); await rmdir(dir); }
});
