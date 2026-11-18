import { afterAll, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(tmpdir(), 'sales-voice-turn-'));
process.env.DATABASE_URL = path.join(directory, 'test.sqlite');
const { sqlite } = await import('../src/lib/db');
const { beginVoice, storeVoiceTranscript, claimSynthesis, endVoice } = await import('../src/lib/voice/turn');
const { usageSummary } = await import('../src/lib/usage');
afterAll(() => { sqlite.close(); rmSync(directory, { recursive: true, force: true }); });

test('voice quotas, reconnect and audio synthesis claims survive duplicate submissions', () => {
  const now = Date.now();
  const insert = sqlite.prepare("INSERT INTO training_sessions VALUES (?,?,'{}','{}','active',?,?)");
  insert.run('test-a', 'account:owner-a', now, now);
  insert.run('test-b', 'account:owner-b', now, now);
  expect(() => beginVoice('request-b', 'account:owner-b', 'test-b', 10)).toThrow('套餐');
  sqlite.prepare("INSERT INTO subscriptions VALUES ('account:owner-a','standard','active',?)").run(now + 3600000);
  expect(beginVoice('request-a', 'account:owner-a', 'test-a', 10)).toEqual({ transcript: null });
  expect(() => beginVoice('request-a', 'account:owner-b', 'test-b', 10)).toThrow();
  expect(() => beginVoice('request-c', 'account:owner-a', 'test-a', 10)).toThrow('正在处理');
  storeVoiceTranscript('request-a', '语音转写。');
  expect(beginVoice('request-a', 'account:owner-a', 'test-a', 10)).toEqual({ transcript: '语音转写。' });
  expect(claimSynthesis('request-a')).toBe(true);
  expect(claimSynthesis('request-a')).toBe(false);
  expect(() => beginVoice('request-c', 'account:owner-a', 'test-a', 10)).toThrow('正在处理');
  endVoice('request-a', 'ok');
  sqlite.prepare('DELETE FROM training_sessions WHERE id=?').run('test-a');
  expect(sqlite.prepare('SELECT count(*) n FROM voice_attempts').get()).toEqual({ n: 0 });
  expect(usageSummary('account:owner-a').day).toMatchObject({ calls: 1, budgetTokens: 0, voiceSeconds: 10 });
});
