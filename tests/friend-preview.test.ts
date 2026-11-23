import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, expect, test, vi } from 'vitest';
import { proxy } from '../src/proxy';
import { releaseProblems } from '../scripts/validate-release.mjs';
import { availableTrainingModels, callModel } from '../src/lib/ai/service';
import { z } from 'zod';

afterEach(() => vi.unstubAllEnvs());

test('the friend preview protects pages and APIs and accepts writes only from its HTTPS site', () => {
  const origin = 'https://friends-preview.onrender.com';
  const authorization = 'Basic ' + Buffer.from('guest:test-password').toString('base64');
  const env = {
    RELEASE_PROFILE: 'friend-preview', DATABASE_URL: '/var/lib/sales-coach/preview.sqlite',
    RENDER_EXTERNAL_URL: origin, AI_MODE: 'mock', ACCOUNT_REQUIRED: '0',
    PREVIEW_AUTH_SHA256: createHash('sha256').update(authorization).digest('hex'),
  };
  expect(releaseProblems(env)).toEqual([]);
  expect(releaseProblems({ ...env, AI_MODE: 'real', PREVIEW_AUTH_SHA256: '' })).toEqual(['PREVIEW_AUTH_SHA256', 'PREVIEW_CONFIGURATION']);
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const request = (path: string, method = 'GET', headers?: HeadersInit) =>
    proxy(new NextRequest('http://localhost:3000' + path, { method, headers }));
  expect(request('/').status).toBe(401);
  expect(request('/api/sessions').status).toBe(401);
  expect(request('/api/health').status).toBe(200);
  expect(request('/api/sessions', 'POST', { authorization, origin }).status).toBe(200);
  expect(request('/api/sessions', 'POST', { authorization, origin: 'https://other.example' }).status).toBe(403);
  vi.stubEnv('PREVIEW_AUTH_SHA256', '');
  expect(request('/', 'GET', { authorization }).status).toBe(401);
});

test('the protected preview lists only the approved model and requires an explicit switch, key, and usage owner', async () => {
  const env = {
    RELEASE_PROFILE: 'friend-preview', DATABASE_URL: '/var/lib/sales-coach/preview.sqlite',
    RENDER_EXTERNAL_URL: 'https://friends-preview.onrender.com', AI_MODE: 'mock', ACCOUNT_REQUIRED: '0',
    PREVIEW_AUTH_SHA256: 'a'.repeat(64), AI_CALLS_ENABLED: '1', AI_MODEL: 'unapproved',
    AI_ALLOWED_MODELS: 'also-unapproved', AI_API_KEY: '',
  };
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  expect(releaseProblems(env)).toContain('AI_API_KEY');
  expect(availableTrainingModels()).toEqual([]);
  vi.stubEnv('AI_API_KEY', 'fixture-only');
  expect(releaseProblems({ ...env, AI_API_KEY: 'fixture-only' })).toEqual([]);
  expect(availableTrainingModels()).toEqual(['qwen3.7-flash']);
  await expect(callModel('profile', 'test', {}, z.object({}), 100)).rejects.toThrow('需要用量记录');
  vi.stubEnv('AI_CALLS_ENABLED', '0');
  expect(availableTrainingModels()).toEqual([]);
  await expect(callModel('profile', 'test', {}, z.object({}), 100)).rejects.toThrow('模型服务已拒绝');
});
