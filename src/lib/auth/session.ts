import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { trainingSessions } from '@/lib/db/schema';

const cookieName = 'sales_coach_owner';

export async function getOrCreateOwnerId() {
  const jar = await cookies();
  let ownerId = jar.get(cookieName)?.value;
  if (!ownerId) {
    ownerId = randomUUID();
    jar.set(cookieName, ownerId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return ownerId;
}

export async function getOwnedSession(sessionId: string) {
  const jar = await cookies();
  const ownerId = jar.get(cookieName)?.value;
  if (!ownerId) return undefined;
  return db.select().from(trainingSessions).where(and(eq(trainingSessions.id, sessionId), eq(trainingSessions.ownerId, ownerId))).get();
}
