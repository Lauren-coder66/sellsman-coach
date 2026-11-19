import { randomUUID } from 'node:crypto';

const correlationHeader = 'x-sales-coach-e2e-correlation-id';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function e2eDiagnosticsEnabled() {
  return process.env.E2E_TEST === '1' && process.env.NODE_ENV !== 'production';
}

export function e2eCorrelationId(headers: Headers) {
  if (!e2eDiagnosticsEnabled()) return undefined;
  const supplied = headers.get(correlationHeader);
  return supplied && uuid.test(supplied) ? supplied : randomUUID();
}

export function safeDiagnosticError(error: unknown) {
  const candidate = error && typeof error === 'object' ? error as { name?: unknown; code?: unknown; errno?: unknown } : {};
  return {
    errorName: typeof candidate.name === 'string' && /^(Error|TypeError|RangeError|SqliteError)$/.test(candidate.name) ? candidate.name : 'Unknown',
    sqliteCode: typeof candidate.code === 'string' && /^SQLITE_[A-Z0-9_]{1,48}$/.test(candidate.code) ? candidate.code : undefined,
    sqliteErrno: typeof candidate.errno === 'number' && Number.isSafeInteger(candidate.errno) ? candidate.errno : undefined,
  };
}

export function logE2EDiagnostic(event: 'db-init' | 'auth-init' | 'session-create', stage: string, error?: unknown, correlationId?: string, databaseInitialized?: boolean) {
  if (!e2eDiagnosticsEnabled()) return;
  console.error(`[${event}-diagnostic]`, JSON.stringify({
    stage, correlationId, pid: process.pid, databaseInitialized,
    ...(error === undefined ? {} : safeDiagnosticError(error)),
  }));
}
