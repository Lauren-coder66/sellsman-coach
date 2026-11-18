import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { GetBucketLifecycleConfigurationCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { copySqlite, verifySqlite } from './sqlite-copy.mjs';
import { sendOpsAlert } from './ops-alert.mjs';

/** @param {Readonly<Record<string, string | undefined>>} [env] */
export function backupConfig(env = process.env) {
  const prefix = env.BACKUP_PREFIX ?? 'sales-coach/';
  const days = Number(env.BACKUP_KEEP_DAYS ?? 30);
  if (!/^(?:[a-z0-9][a-z0-9_-]*\/)+$/.test(prefix) || !Number.isInteger(days) || days < 7 || days > 365) {
    throw Error('invalid retention configuration');
  }
  return { prefix, days };
}

export function lifecycleRule({ prefix, days }) {
  return { ID: 'sales-coach-offsite', Status: 'Enabled', Filter: { Prefix: prefix }, Expiration: { Days: days } };
}

export async function verifyRetention(client, bucket, config) {
  const rule = lifecycleRule(config);
  const { Rules } = await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }),
    { abortSignal: AbortSignal.timeout(15000) });
  if (!Rules?.some(entry => entry.ID === rule.ID && entry.Status === 'Enabled' &&
      entry.Filter && Object.keys(entry.Filter).length === 1 && entry.Filter.Prefix === rule.Filter.Prefix &&
      entry.Expiration?.Days === rule.Expiration.Days)) throw Error('retention rule not installed');
}

/** @param {Readonly<Record<string, string | undefined>>} [env] */
export function backupStorage(env = process.env) {
  const { BACKUP_PROVIDER: provider, BACKUP_BUCKET: bucket, BACKUP_REGION: region, BACKUP_ENDPOINT: endpoint } = env;
  if (!bucket || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw Error('invalid backup bucket');
  if (provider === 'r2' && /^https:\/\/[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/.test(endpoint ?? '')) {
    return { bucket, region: 'auto', endpoint, forcePathStyle: true };
  }
  if (provider === 's3' && !endpoint && /^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region ?? '')) {
    return { bucket, region, ignoreConfiguredEndpoints: true };
  }
  throw Error('invalid backup provider configuration');
}

async function digest(filename) {
  const checksum = createHash('sha256');
  for await (const bytes of createReadStream(filename)) checksum.update(bytes);
  return checksum.digest('hex');
}

export function backupStore(client, bucket, prefix) {
  function verifyKey(key) {
    if (!key.startsWith(prefix) || !/^\d{17}-[0-9a-f-]{36}\.sqlite$/.test(key.slice(prefix.length))) {
      throw Error('backup key outside configured namespace');
    }
  }
  return {
    async upload(key, source) {
      verifyKey(key);
      const sha256 = await digest(source);
      const file = await stat(source);
      const body = createReadStream(source);
      try {
        await client.send(new PutObjectCommand({
          Bucket: bucket, Key: key, Body: body, ContentLength: file.size,
          ContentType: 'application/octet-stream', IfNoneMatch: '*', Metadata: { sha256 },
        }), { abortSignal: AbortSignal.timeout(180_000) });
      } finally { body.destroy(); }
      return sha256;
    },
    async download(key, dest, expectedHash) {
      verifyKey(key);
      const timeout = AbortSignal.timeout(180_000);
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: timeout });
      const sha256 = result.Metadata?.sha256;
      if (!/^[a-f0-9]{64}$/.test(sha256 ?? '') || (expectedHash && sha256 !== expectedHash)) {
        result.Body?.destroy();
        throw Error('backup metadata did not match');
      }
      await pipeline(result.Body, createWriteStream(dest, { flags: 'wx', mode: 0o600 }), { signal: timeout });
      if (await digest(dest) !== sha256) throw Error('download digest did not match');
      verifySqlite(dest);
    },
  };
}

export async function backupStatus(directory) {
  return JSON.parse(await readFile(path.join(directory, 'offsite-status.json'), 'utf8'));
}

export async function runOffsite({ operation, directory, store, prefix, source, key, destination, notify = sendOpsAlert }) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const tmp = await mkdtemp(path.join(directory, '.transfer-'));
  const snapshot = path.join(tmp, 'snapshot.sqlite');
  const download = path.join(tmp, 'download.sqlite');
  const status = async (value) => {
    const pending = path.join(tmp, 'status.json');
    await writeFile(pending, JSON.stringify(value), { mode: 0o600 });
    await rename(pending, path.join(directory, 'offsite-status.json'));
  };
  const last = operation === 'backup' ? await backupStatus(directory).catch(() => ({})) : {};
  const attemptedAt = new Date().toISOString();
  try {
    if (operation === 'backup') {
      const object = prefix + attemptedAt.replace(/\D/g, '') + '-' + randomUUID() + '.sqlite';
      await copySqlite(source, snapshot);
      const sha256 = await store.upload(object, snapshot);
      await store.download(object, download, sha256);
      await status({ outcome: 'ok', latestVerifiedAt: new Date().toISOString(), attemptedAt, key: object });
      return object;
    }
    await store.download(key, download);
    await copySqlite(download, destination);
    return key;
  } catch {
    if (operation === 'backup') {
      await status({ ...last, outcome: 'failed', attemptedAt }).catch(() => console.error('[ops-event] backup_status_write_failed'));
    }
    await notify([operation === 'backup' ? 'offsite_backup_failed' : 'offsite_restore_failed'])
      .catch(() => console.error('[ops-event] alert_delivery_failed'));
    throw Error(operation === 'backup' ? 'offsite backup failed' : 'offsite restore failed');
  } finally {
    await Promise.all([snapshot, snapshot + '-wal', snapshot + '-shm', download, download + '-wal', download + '-shm',
      path.join(tmp, 'status.json')].map(file => rm(file, { force: true })));
    await rmdir(tmp);
  }
}

async function main() {
  const [operation, key, destination] = process.argv.slice(2);
  const { prefix, days } = backupConfig();
  if (operation === 'lifecycle') {
    console.log(JSON.stringify({ Rules: [lifecycleRule({ prefix, days })] }, null, 2));
    return;
  }
  if (!['backup', 'restore', 'check-retention'].includes(operation) || (operation === 'restore' && (!key || !destination))) {
    throw Error('invalid offsite operation');
  }
  const { bucket, ...options } = backupStorage();
  const client = new S3Client({ ...options, requestChecksumCalculation: 'WHEN_REQUIRED', maxAttempts: 2 });
  try {
    if (operation === 'check-retention') {
      await verifyRetention(client, bucket, { prefix, days });
      console.log(JSON.stringify({ event: 'offsite_retention_ok', days }));
      return;
    }
    const object = await runOffsite({
      operation, directory: process.env.BACKUP_DIRECTORY ?? '/var/backups/sales-coach',
      store: backupStore(client, bucket, prefix), prefix, source: process.env.DATABASE_URL, key, destination,
    });
    console.log(JSON.stringify({ event: 'offsite_' + operation + '_ok', key: object }));
  } finally { client.destroy(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('[ops-event] offsite_command_failed'); process.exitCode = 1; });
}
