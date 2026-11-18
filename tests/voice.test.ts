import { afterEach, expect, test, vi } from 'vitest';
import { bailianVoice, safeAudioURL, wavDuration } from '../src/lib/voice/bailian';
import { encodeWav } from '../src/lib/voice/wav';

afterEach(() => vi.unstubAllGlobals());
test('canonical microphone data is measured by server and invalid or oversized audio is rejected', () => {
  expect(wavDuration(new Uint8Array(encodeWav(new Float32Array(16000))))).toBe(1);
  expect(() => wavDuration(new Uint8Array(encodeWav(new Float32Array(240001))))).toThrow();
  expect(() => wavDuration(new Uint8Array(80))).toThrow();
});

test('recognition and synthesis use server credentials only for the provider endpoints', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '我想先了解客户需求。' } }] }))
    .mockResolvedValueOnce(Response.json({ output: { audio: { url: 'https://bailian-audio.oss-cn-beijing.aliyuncs.com/result.wav' } } }))
    .mockResolvedValueOnce(new Response('simulated audio'));
  vi.stubGlobal('fetch', fetcher);
  const voice = bailianVoice('test-only');
  expect(await voice.transcribe(new Uint8Array(encodeWav(new Float32Array(16000))))).toBe('我想先了解客户需求。');
  expect(await new Response(await voice.synthesize('可以先看方案。')).text()).toBe('simulated audio');
  expect(fetcher.mock.calls[2][1].headers).toBeUndefined();
  expect(() => safeAudioURL('https://example.com/result.wav')).toThrow();
});
