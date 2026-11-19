import { afterAll, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(tmpdir(), 'sales-feedback-'));
process.env.DATABASE_URL = path.join(directory, 'test.sqlite');
const { sqlite } = await import('../src/lib/db');
const { feedbackInput, listFeedback, saveFeedback } = await import('../src/lib/feedback');
afterAll(() => { vi.restoreAllMocks(); sqlite.close(); rmSync(directory, { recursive: true, force: true }); });

test('feedback is validated, idempotent, owner isolated and rate limited', () => {
  expect(feedbackInput.safeParse({ requestId: randomUUID(), category: 'problem', content: 'short' }).success).toBe(false);
  expect(feedbackInput.safeParse({ requestId: randomUUID(), category: 'problem', content: 'x'.repeat(1501) }).success).toBe(false);
  const clock = vi.spyOn(Date, 'now');
  const start = Date.parse('2026-11-19T12:00:00Z');
  const entry = (content: string) => ({ requestId: randomUUID(), category: 'problem' as const, content });
  const first = entry('第一次反馈内容足够长');
  clock.mockReturnValue(start);
  expect(saveFeedback('account:owner-a', first)).toBe('created');
  expect(saveFeedback('account:owner-a', first)).toBe('replayed');
  expect(saveFeedback('account:owner-b', first)).toBe('conflict');
  expect(saveFeedback('account:owner-a', { ...first, content: '另外一条反馈内容足够长' })).toBe('conflict');
  expect(saveFeedback('account:owner-a', entry('太快提交的反馈内容'))).toBe('limited');
  clock.mockReturnValue(start + 30_000);
  expect(saveFeedback('account:owner-a', entry('第二次反馈内容足够长'))).toBe('created');
  clock.mockReturnValue(start + 60_000);
  expect(saveFeedback('account:owner-a', entry('第三次反馈内容足够长'))).toBe('created');
  clock.mockReturnValue(start + 90_000);
  expect(saveFeedback('account:owner-a', entry('第四次反馈应被限制'))).toBe('limited');
  expect(listFeedback('account:owner-a')).toHaveLength(3);
  expect(listFeedback('account:owner-b')).toEqual([]);
});
