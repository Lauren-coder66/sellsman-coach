import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export function mailConfiguration(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (env.RELEASE_PROFILE === 'production' && (env.AUTH_MAIL_TRANSPORT !== 'resend' ||
      env.AUTH_MAIL_TEST_URL || env.ACCOUNT_TEST_MAIL_DIR || env.E2E_TEST === '1')) {
    throw new Error('Production requires Resend transport');
  }
  if (env.AUTH_MAIL_TRANSPORT === 'loopback-test') {
    const url = new URL(env.AUTH_MAIL_TEST_URL ?? '');
    const origin = new URL(env.BETTER_AUTH_URL ?? '');
    if (env.RELEASE_PROFILE !== 'staging' || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port ||
        url.pathname !== '/emails' || url.username || url.password || url.search || url.hash ||
        !['127.0.0.1', 'localhost'].includes(origin.hostname)) throw new Error('Invalid isolated mail configuration');
    return { url: url.href, from: 'test@example.invalid' };
  }
  if (env.NODE_ENV !== 'production' && env.E2E_TEST === '1' && env.ACCOUNT_TEST_MAIL_DIR) {
    return { directory: env.ACCOUNT_TEST_MAIL_DIR };
  }
  if ((env.AUTH_MAIL_TRANSPORT && env.AUTH_MAIL_TRANSPORT !== 'resend') || !env.RESEND_API_KEY || !env.AUTH_MAIL_FROM) {
    throw new Error('Account email is not configured');
  }
  return { url: 'https://api.resend.com/emails', key: env.RESEND_API_KEY, from: env.AUTH_MAIL_FROM };
}

export async function sendAccountEmail(to: string, subject: string, url: string) {
  const config = mailConfiguration();
  if (config.directory) {
    await writeFile(path.join(config.directory, `${randomUUID()}.json`), JSON.stringify({ to, subject, url }), { mode: 0o600, flag: 'wx' });
    return;
  }
  const response = await fetch(config.url!, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
    headers: { ...(config.key ? { Authorization: `Bearer ${config.key}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.from, to: [to], subject, text: url }),
  }).catch(() => {
    console.warn('[ops-event] mail_failure network');
    throw new Error('Account email transport unavailable');
  });
  await response.body?.cancel();
  if (!response.ok) {
    console.warn('[ops-event] mail_failure rejected');
    throw Error(`Account email delivery failed (${response.status})`);
  }
}
