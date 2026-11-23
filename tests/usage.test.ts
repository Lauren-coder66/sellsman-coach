import { afterAll, expect, test, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(tmpdir(), 'sales-usage-'));
process.env.DATABASE_URL = path.join(directory, 'test.sqlite');
const { sqlite } = await import('../src/lib/db');
const { reserveUsage, closeUsage, usageSummary } = await import('../src/lib/usage');
afterAll(() => { sqlite.close(); rmSync(directory, { recursive: true, force: true }); });

test('friend preview applies its shared daily ceiling across anonymous owners', () => {
  vi.stubEnv('RELEASE_PROFILE', 'friend-preview');
  try {
    const id = reserveUsage('preview-a', 'bailian', 'qwen3.7-flash', 'report', 49_500);
    expect(() => reserveUsage('preview-b', 'bailian', 'qwen3.7-flash', 'profile', 501)).toThrow('额度');
    closeUsage(id, { model: null, totalTokens: 1, outcome: 'ok' });
    expect(usageSummary().limits).toEqual({ day: 50_000 });
  } finally { vi.unstubAllEnvs(); }
});
test('atomic reservation checks concurrency and retains reserves when usage is unknown', () => {
  const first = reserveUsage('owner-a', 'bailian', 'flash', 'report', 55000);
  expect(() => reserveUsage('owner-a', 'bailian', 'flash', 'reply', 100)).toThrow('正在处理');
  closeUsage(first, { model: null, outcome: 'error' });
  expect(() => reserveUsage('owner-a', 'bailian', 'flash', 'reply', 6000)).toThrow('额度');
  expect(usageSummary('owner-a').day).toMatchObject({ calls: 1, measuredTokens: 0, budgetTokens: 55000, unknownUsageCalls: 1 });
  expect(usageSummary('owner-a').byModel[0]).toMatchObject({ reportedCost: null, unknownCostCalls: 1, successCalls: 0, failedCalls: 1, pendingCalls: 0 });
  expect(usageSummary('owner-b').day).toMatchObject({ calls: 0 });
});

test('measured usage and explicitly reported zero costs are kept separate from reservations', () => {
  const id = reserveUsage('owner-c', 'openrouter', 'requested', 'reply', 5000);
  closeUsage(id, { model: 'actual', promptTokens: 500, completionTokens: 100, cost: 0, outcome: 'ok' });
  expect(usageSummary('owner-c').month).toMatchObject({ calls: 1, measuredTokens: 600, budgetTokens: 600, unknownUsageCalls: 0 });
  expect(usageSummary('owner-c').byModel[0]).toMatchObject({ model: 'actual', reportedCost: 0, unknownCostCalls: 0, successCalls: 1, failedCalls: 0, pendingCalls: 0, averageDurationMs: expect.any(Number) });
});
