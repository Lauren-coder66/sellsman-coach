import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getOwnedSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { messages, trainingFocus, trainingSessions } from '@/lib/db/schema';
import { success, failure, handleError } from '@/lib/api';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const session = await getOwnedSession(id);
    if (!session) return failure('NOT_FOUND', '会话不存在', 404);
    const rows = db.select().from(messages).where(eq(messages.sessionId, id)).orderBy(messages.sequence).all();
    const focus = db.select().from(trainingFocus).where(eq(trainingFocus.sessionId, id)).get();
    const sourceAvailable = focus ? Boolean(db.select({ id: trainingSessions.id }).from(trainingSessions).where(and(eq(trainingSessions.id, focus.sourceSessionId), eq(trainingSessions.ownerId, session.ownerId))).get()) : false;
    return success({
      session: {
        id,
        scenario: JSON.parse(session.scenarioJson),
        status: session.status,
        focus: focus ? { dimension: focus.dimension, sourceSessionId: focus.sourceSessionId, sourceAvailable } : null,
      },
      messages: rows,
    });
  } catch (error) { return handleError(error); }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const session = await getOwnedSession(id);
    if (!session) return failure('NOT_FOUND', '会话不存在', 404);
    db.delete(trainingSessions).where(eq(trainingSessions.id, id)).run();
    return success({ deleted: true });
  } catch (error) { return handleError(error); }
}
