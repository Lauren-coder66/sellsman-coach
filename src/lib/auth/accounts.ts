import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { sqlite } from '@/lib/db';

async function sendAccountEmail(to: string, subject: string, url: string) {
  const testDirectory = process.env.ACCOUNT_TEST_MAIL_DIR;
  if (process.env.NODE_ENV !== 'production' && process.env.E2E_TEST === '1' && testDirectory) {
    await writeFile(path.join(testDirectory, `${randomUUID()}.json`), JSON.stringify({ to, subject, url }), { mode: 0o600, flag: 'wx' });
    return;
  }
  if (!process.env.RESEND_API_KEY || !process.env.AUTH_MAIL_FROM) throw Error('Account email is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.AUTH_MAIL_FROM, to: [to], subject, text: url }),
  });
  if (!response.ok) throw Error(`Account email delivery failed (${response.status})`);
}

export function accountsConfigured() {
  return !!(process.env.BETTER_AUTH_URL && process.env.BETTER_AUTH_SECRET);
}

function buildAuth() {
  const baseURL = new URL(process.env.BETTER_AUTH_URL!);
  if ((baseURL.protocol !== 'https:' && (baseURL.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(baseURL.hostname))) ||
      baseURL.username || baseURL.password || baseURL.pathname !== '/' || baseURL.search || baseURL.hash) {
    throw new Error('Invalid account origin');
  }
  if (process.env.BETTER_AUTH_SECRET!.length < 32) throw new Error('Account secret must have at least 32 characters');
  return betterAuth({
    database: sqlite,
    baseURL: baseURL.origin,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [baseURL.origin],
    telemetry: { enabled: false },
    logger: { level: 'warn' },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => sendAccountEmail(user.email, '重置销售陪练密码', url),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: ({ user, url }) => sendAccountEmail(user.email, '验证销售陪练邮箱', url),
    },
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: ({ user, url }) => sendAccountEmail(user.email, '确认修改销售陪练邮箱', url),
      },
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification: ({ user, url }) => sendAccountEmail(user.email, '确认删除销售陪练账号', url),
      },
    },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 35 },
  });
}

let ready: Promise<ReturnType<typeof buildAuth>> | undefined;

export async function getAccounts() {
  if (!accountsConfigured()) return null;
  ready ??= (async () => {
    const auth = buildAuth();
    const plan = await getMigrations(auth.options);
    if (plan.schemaProblems.length) throw Error('Account schema needs repair');
    await plan.runMigrations();
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS anonymous_owner_claims (owner_id TEXT PRIMARY KEY);
      CREATE TRIGGER IF NOT EXISTS sales_coach_account_delete AFTER DELETE ON "user" BEGIN
        DELETE FROM training_sessions WHERE owner_id = 'account:' || OLD.id;
        DELETE FROM saved_scenarios WHERE owner_id = 'account:' || OLD.id;
        UPDATE ai_usage SET owner_id = 'deleted:' || id WHERE owner_id = 'account:' || OLD.id;
        DELETE FROM subscriptions WHERE owner_id = 'account:' || OLD.id;
        UPDATE billing_orders SET owner_id = 'deleted:' || id WHERE owner_id = 'account:' || OLD.id;
      END;
    `);
    return auth;
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}
