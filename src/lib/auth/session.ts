import { randomUUID } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { db, sqlite } from '@/lib/db';
import { trainingSessions } from '@/lib/db/schema';
import { accountsConfigured, getAccounts } from './accounts';
import { AccountRequiredError } from './errors';

export const anonymousCookie = 'sales_coach_owner';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type DiagnosticStage = (stage: string) => void;

export async function getAccountSession(onStage?: DiagnosticStage) {
  onStage?.('owner-init-before');
  const auth = await getAccounts();
  onStage?.('owner-init-after');
  if (!auth) return null;
  onStage?.('owner-account-query');
  return auth.api.getSession({ headers: await headers() });
}

export function accountOwner(id: string) { return `account:${id}`; }

export function canUseOwner(owner: string) {
  if (!accountsConfigured()) return uuid.test(owner);
  if (owner.startsWith('account:')) return Boolean(sqlite.prepare('SELECT 1 FROM "user" WHERE id = ?').get(owner.slice(8)));
  return uuid.test(owner) && !sqlite.prepare('SELECT 1 FROM anonymous_owner_claims WHERE owner_id = ?').get(owner);
}

export async function anonymousOwner(onStage?: DiagnosticStage) {
  onStage?.('owner-cookie-read');
  const value = (await cookies()).get(anonymousCookie)?.value;
  if (!value || !uuid.test(value)) return undefined;
  onStage?.('owner-anonymous-query');
  return canUseOwner(value) ? value : undefined;
}

export async function getOwnerId(onStage?: DiagnosticStage) {
  const session = await getAccountSession(onStage);
  if (session?.user.emailVerified) return accountOwner(session.user.id);
  return process.env.ACCOUNT_REQUIRED === '1' ? undefined : anonymousOwner(onStage);
}

export async function getOrCreateOwnerId(onStage?: DiagnosticStage) {
  const current = await getOwnerId(onStage);
  if (current) return current;
  if (process.env.ACCOUNT_REQUIRED === '1') throw new AccountRequiredError();
  onStage?.('owner-cookie-create');
  const jar = await cookies();
  const ownerId = randomUUID();
  jar.set(anonymousCookie, ownerId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return ownerId;
}

export async function getOwnedSession(sessionId: string) {
  const ownerId = await getOwnerId();
  if (!ownerId) return undefined;
  return db.select().from(trainingSessions).where(and(eq(trainingSessions.id, sessionId), eq(trainingSessions.ownerId, ownerId))).get();
}
