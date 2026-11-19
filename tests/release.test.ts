import { expect, test } from 'vitest';
import { mailConfiguration } from '../src/lib/auth/mail';
import { releaseProblems } from '../scripts/validate-release.mjs';

test('deployment fails closed for missing credentials, nonpersistent database and test mail', () => {
  const bad = {
    RELEASE_PROFILE: 'production', DATABASE_URL: '/tmp/test.sqlite',
    AUTH_MAIL_TRANSPORT: 'loopback-test', PUBLIC_DOMAIN: 'coach.example.org', BETTER_AUTH_URL: 'http://coach.example.org',
  };
  expect(releaseProblems(bad)).toEqual(expect.arrayContaining(['DATABASE_URL', 'BETTER_AUTH_URL', 'AUTH_MAIL_TRANSPORT', 'ACCOUNT_REQUIRED', 'AI_CONFIGURATION', 'AI_CALLS_ENABLED']));
  const ready = { RELEASE_PROFILE: 'production', DATABASE_URL: '/var/lib/sales-coach/app.sqlite', PUBLIC_DOMAIN: 'coach.example.org', BETTER_AUTH_URL: 'https://coach.example.org', BETTER_AUTH_SECRET: 'x'.repeat(32), ACCOUNT_REQUIRED: '1', AUTH_MAIL_TRANSPORT: 'resend', AUTH_MAIL_FROM: 'test@example.org', RESEND_API_KEY: 'test-placeholder', AI_MODE: 'real', AI_PROVIDER: 'bailian', AI_MODEL: 'qwen3.7-flash', AI_API_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', AI_API_KEY: 'test-placeholder' };
  expect(releaseProblems(ready)).toContain('AI_CALLS_ENABLED');
  expect(releaseProblems({ ...ready, AI_CALLS_ENABLED: '1' })).toEqual([]);
  expect(() => mailConfiguration(bad)).toThrow('Production requires Resend');
  expect(() => mailConfiguration({ RELEASE_PROFILE: 'production', AUTH_MAIL_TRANSPORT: 'resend',
    E2E_TEST: '1', ACCOUNT_TEST_MAIL_DIR: '/tmp/mail', RESEND_API_KEY: 'test-placeholder', AUTH_MAIL_FROM: 'test@example.invalid',
  })).toThrow('Production requires Resend');
  expect(releaseProblems({ RELEASE_PROFILE: 'staging', DATABASE_URL: '/var/lib/sales-coach/stage.sqlite' })).toEqual([]);
});

test('the test mail transport rejects non-loopback and requires an explicit staging profile', () => {
  const env = { AUTH_MAIL_TRANSPORT: 'loopback-test', AUTH_MAIL_TEST_URL: 'http://127.0.0.1:3115/emails', BETTER_AUTH_URL: 'https://localhost:3443' };
  expect(() => mailConfiguration(env)).toThrow();
  expect(() => mailConfiguration({ ...env, RELEASE_PROFILE: 'staging', AUTH_MAIL_TEST_URL: 'http://example.com:3115/emails' })).toThrow();
  expect(mailConfiguration({ ...env, RELEASE_PROFILE: 'staging' })).toMatchObject({ url: env.AUTH_MAIL_TEST_URL, from: 'test@example.invalid' });
});
