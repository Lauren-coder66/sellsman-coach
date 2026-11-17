import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { messages, trainingFocus, trainingSessions } from '@/lib/db/schema';
import { focusDimensions, type FocusDimension } from '@/lib/focus';

export type TrendDays = 7 | 30 | 90;
type SessionRow = { id: string; scenarioJson: string; status: string; createdAt: number };
type FocusRow = { sessionId: string; dimension: FocusDimension };
const timeZone = 'Asia/Shanghai';
const formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });

export function localDayKey(timestamp: number) {
  const parts = formatter.formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dayBefore(key: string, offset: number) {
  return new Date(Date.parse(`${key}T00:00:00Z`) - offset * 86_400_000).toISOString().slice(0, 10);
}

export function startDayKey(now: number, days: TrendDays) {
  return dayBefore(localDayKey(now), days - 1);
}

export function buildProgress(sessions: SessionRow[], focusRows: FocusRow[], userTurns: number, days: TrendDays, now = Date.now()) {
  const today = localDayKey(now);
  const start7 = startDayKey(now, 7);
  const start30 = startDayKey(now, 30);
  const byDate = new Map<string, number>();
  const focusBySession = new Map(focusRows.map(row => [row.sessionId, row.dimension]));
  const focusCounts = Object.fromEntries(focusDimensions.map(dimension => [dimension, 0])) as Record<FocusDimension, number>;
  for (const row of focusRows) focusCounts[row.dimension]++;
  for (const session of sessions) {
    const date = localDayKey(session.createdAt);
    if (date <= today) byDate.set(date, (byDate.get(date) ?? 0) + 1);
  }
  const trend = Array.from({ length: days }, (_, index) => {
    const date = dayBefore(today, days - 1 - index);
    return { date, count: byDate.get(date) ?? 0 };
  });
  return {
    timeZone,
    asOfDate: today,
    days,
    summary: {
      total: sessions.length,
      completed: sessions.filter(session => session.status === 'completed').length,
      last7: [...byDate].filter(([date]) => date >= start7).reduce((sum, [, count]) => sum + count, 0),
      last30: [...byDate].filter(([date]) => date >= start30).reduce((sum, [, count]) => sum + count, 0),
      activeDays: byDate.size,
      userTurns,
      normalCount: sessions.length - focusRows.length,
      focusedCount: focusRows.length,
    },
    trend,
    focusCounts,
    latestCompletedId: sessions.find(session => session.status === 'completed')?.id ?? null,
    recent: sessions.slice(0, 10).map(session => ({
      id: session.id,
      product: (JSON.parse(session.scenarioJson) as { product: string }).product,
      status: session.status,
      createdAt: session.createdAt,
      focusDimension: focusBySession.get(session.id) ?? null,
    })),
  };
}

export function getProgress(ownerId: string | undefined, days: TrendDays, now = Date.now()) {
  if (!ownerId) return buildProgress([], [], 0, days, now);
  const sessions = db.select({
    id: trainingSessions.id,
    scenarioJson: trainingSessions.scenarioJson,
    status: trainingSessions.status,
    createdAt: trainingSessions.createdAt,
  }).from(trainingSessions).where(eq(trainingSessions.ownerId, ownerId))
    .orderBy(desc(trainingSessions.createdAt), desc(trainingSessions.id)).all();
  const focusRows = db.select({
    sessionId: trainingFocus.sessionId,
    dimension: trainingFocus.dimension,
  }).from(trainingFocus).innerJoin(trainingSessions, eq(trainingFocus.sessionId, trainingSessions.id))
    .where(eq(trainingSessions.ownerId, ownerId)).all();
  const userTurns = db.select({ total: sql<number>`count(*)` }).from(messages)
    .innerJoin(trainingSessions, eq(messages.sessionId, trainingSessions.id))
    .where(and(eq(trainingSessions.ownerId, ownerId), eq(messages.role, 'user'))).get()?.total ?? 0;
  return buildProgress(sessions, focusRows, userTurns, days, now);
}
