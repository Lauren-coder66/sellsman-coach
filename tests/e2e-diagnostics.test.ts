import { afterEach, describe, expect, it, vi } from 'vitest';
import { e2eCorrelationId, logE2EDiagnostic, safeDiagnosticError } from '../src/lib/e2e-diagnostics';

afterEach(() => vi.unstubAllEnvs());

describe('E2E diagnostic boundaries', () => {
  it('accepts a UUID header only outside production E2E mode', () => {
    const headers = new Headers({ 'x-sales-coach-e2e-correlation-id': 'ebdd4936-3a3a-4a0e-b39f-074f93eab436' });
    vi.stubEnv('E2E_TEST', '1');
    vi.stubEnv('NODE_ENV', 'test');
    expect(e2eCorrelationId(headers)).toBe('ebdd4936-3a3a-4a0e-b39f-074f93eab436');
    expect(e2eCorrelationId(new Headers({ 'x-sales-coach-e2e-correlation-id': 'unsafe' }))).toMatch(/^[0-9a-f-]{36}$/);
    vi.stubEnv('NODE_ENV', 'production');
    expect(e2eCorrelationId(headers)).toBeUndefined();
  });

  it('logs only safe error fields and never logs in production', () => {
    const error = Object.assign(new Error('private SQL and password'), { name: 'VendorInternalError', code: 'SQLITE_BUSY', errno: 5, sql: 'private SQL' });
    expect(safeDiagnosticError(error)).toEqual({ errorName: 'Unknown', sqliteCode: 'SQLITE_BUSY', sqliteErrno: 5 });
    vi.stubEnv('E2E_TEST', '1');
    vi.stubEnv('NODE_ENV', 'test');
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const correlationId = e2eCorrelationId(new Headers({ 'x-sales-coach-e2e-correlation-id': 'ebdd4936-3a3a-4a0e-b39f-074f93eab436' }));
      logE2EDiagnostic('session-create', 'messages-insert', error, correlationId, true);
      expect(logger).toHaveBeenCalledOnce();
      expect(logger.mock.calls[0][0]).toBe('[session-create-diagnostic]');
      expect(JSON.parse(String(logger.mock.calls[0][1]))).toMatchObject({
        stage: 'messages-insert', correlationId: 'ebdd4936-3a3a-4a0e-b39f-074f93eab436',
        databaseInitialized: true, errorName: 'Unknown', sqliteCode: 'SQLITE_BUSY', sqliteErrno: 5,
      });
      expect(JSON.stringify(logger.mock.calls)).not.toMatch(/private|password|sql":"/i);
      vi.stubEnv('NODE_ENV', 'production');
      logE2EDiagnostic('session-create', 'messages-insert', error);
      expect(logger).toHaveBeenCalledOnce();
    } finally {
      logger.mockRestore();
    }
  });
});
