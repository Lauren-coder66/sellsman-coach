import Database from 'better-sqlite3';
import { stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { backupStatus } from './offsite.mjs';
import { sendOpsAlert } from './ops-alert.mjs';

export async function collectOps(logs, { database, backupDirectory, offsiteRequired, now = Date.now(), ready }) {
  const api = { requests: 0, limited: 0, failed: 0, errorRate: null };
  const events = { mailFailures: 0, systemErrors: 0 };
  for await (const line of logs) {
    if (line.startsWith('[ops-event] mail_failure')) { events.mailFailures++; continue; }
    if (line.startsWith('[api-error]') || line.startsWith('[ops-event]') || line === '[account-error] operation-failed') {
      events.systemErrors++;
      continue;
    }
    try {
      const entry = JSON.parse(line);
      if (typeof entry?.logger === 'string' && entry.logger.startsWith('http.log.access.') &&
          Number.isInteger(entry.status) && entry.status >= 100 && entry.status < 600) {
        api.requests++;
        if (entry.status === 429) api.limited++;
        if (entry.status >= 500) api.failed++;
      } else if (entry?.level === 'error' && typeof entry.logger === 'string') {
        events.systemErrors++;
      }
    } catch { /* Ignore logs outside the selected formats. */ }
  }
  if (api.requests) api.errorRate = api.failed / api.requests;

  let ai = null;
  let storage = null;
  try {
    const sqlite = new Database(database, { readonly: true, fileMustExist: true, timeout: 5000 });
    try {
      ai = sqlite.prepare(`SELECT count(*) AS calls, coalesce(sum(outcome = 'ok'), 0) AS succeeded,
        coalesce(sum(outcome IS NOT NULL AND outcome != 'ok'), 0) AS failed,
        sum(tokens) AS measuredTokens, count(*) - count(tokens) AS unknownUsageCalls,
        round(avg(completed_at - started_at)) AS meanMs
        FROM ai_usage WHERE started_at >= ? AND operation != 'voice-turn'`).get(now - 3600_000);
      const finished = ai.succeeded + ai.failed;
      ai.successRate = finished ? ai.succeeded / finished : null;
    } finally { sqlite.close(); }
    const [db, wal, volume] = await Promise.all([
      stat(database), stat(database + '-wal').catch(error => { if (error.code !== 'ENOENT') throw error; }),
      statfs(path.dirname(database)),
    ]);
    storage = { databaseBytes: db.size + (wal?.size ?? 0), availableBytes: volume.bavail * volume.bsize };
  } catch { events.systemErrors++; }

  const saved = await backupStatus(backupDirectory).catch(() => null);
  const latestVerifiedAt = saved?.latestVerifiedAt ?? null;
  const backup = { state: saved?.outcome ?? 'unknown', latestVerifiedAt, required: offsiteRequired };
  const alerts = [];
  if (!ready) alerts.push('service_unhealthy');
  if (api.failed >= 3 && api.errorRate >= 0.05) alerts.push('api_error_rate_high');
  if (ai?.failed >= 3 && ai.successRate < 0.9) alerts.push('ai_failure_rate_high');
  if (ai?.meanMs >= 30000) alerts.push('ai_latency_high');
  if (storage && storage.availableBytes < 1024 ** 3) alerts.push('database_disk_low');
  if (offsiteRequired && (backup.state !== 'ok' || !Number.isFinite(Date.parse(latestVerifiedAt)) ||
      now - Date.parse(latestVerifiedAt) > 26 * 3600_000)) alerts.push('offsite_backup_unverified');
  if (events.mailFailures) alerts.push('mail_delivery_failure');
  if (events.systemErrors) alerts.push('system_errors');
  return { ready, windowSeconds: 3600, api, ai, storage, backup, events, alerts };
}

async function main() {
  const ready = await fetch('http://127.0.0.1:3000/api/health', { signal: AbortSignal.timeout(5000) })
    .then(response => response.ok, () => false);
  const logs = createInterface({ input: process.stdin });
  const report = await collectOps(logs, {
    database: process.env.DATABASE_URL, backupDirectory: process.env.BACKUP_DIRECTORY ?? '/var/backups/sales-coach',
    offsiteRequired: process.env.OPS_OFFSITE_REQUIRED === '1', ready,
  });
  console.log(JSON.stringify(report));
  await sendOpsAlert(report.alerts);
  if (report.alerts.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('[ops-event] monitor_or_alert_failed'); process.exitCode = 1; });
}
