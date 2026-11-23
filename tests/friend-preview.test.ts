import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, expect, test, vi } from 'vitest';
import { proxy } from '../src/proxy';
import { releaseProblems } from '../scripts/validate-release.mjs';

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
