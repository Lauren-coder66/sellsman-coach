import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { trainingSessions, messages, trainingReports, trainingFocus } from '@/lib/db/schema';
import { canUseOwner, getOrCreateOwnerId, getOwnerId } from '@/lib/auth/session';
import { success, failure, handleError, parseJson } from '@/lib/api';
import { sessionCreateSchema } from '@/lib/validation';
import { getAIProvider } from '@/lib/ai';
import { focusDetails } from '@/lib/focus';
import { eq, desc, and, or, lt } from 'drizzle-orm';
import { z } from 'zod';
import { reportSource } from '@/lib/report';
import { aiOwner } from '@/lib/ai/usage-context';
import { e2eCorrelationId, logE2EDiagnostic } from '@/lib/e2e-diagnostics';

const cursorSchema = z.object({ createdAt: z.number().int().nonnegative(), id: z.string().uuid() });

export async function POST(request: NextRequest) {
  const correlationId = e2eCorrelationId(request.headers);
  let stage = 'parse-request';
  try {
    const parsed = await parseJson(request, sessionCreateSchema);
    if (parsed.error) return parsed.error;
    const { requestId, sourceSessionId, focusDimension, ...scenario } = parsed.data!;
    const ownerId = await getOrCreateOwnerId(nextStage => { stage = nextStage; });
    stage = 'owner-resolved';
    const id = requestId ?? randomUUID();
    const scenarioJson = JSON.stringify(scenario);
    const resolveExisting = (scope: 'initial' | 'after-transaction') => {
      stage = scope === 'initial' ? 'idempotent-session-query' : 'transaction-result-session-query';
      const row = db.select().from(trainingSessions).where(eq(trainingSessions.id, id)).get();
      if (!row) return null;
      if (row.ownerId !== ownerId || row.scenarioJson !== scenarioJson) return failure('DUPLICATE', '创建请求 ID 已被使用', 409);
      stage = scope === 'initial' ? 'idempotent-focus-query' : 'transaction-result-focus-query';
      const savedFocus = db.select().from(trainingFocus).where(eq(trainingFocus.sessionId, id)).get();
      if (savedFocus?.sourceSessionId !== sourceSessionId || savedFocus?.dimension !== focusDimension) return failure('DUPLICATE', '创建请求内容已变更', 409);
      return success({ id, status: row.status, replayed: true });
    };
    const existing = resolveExisting('initial');
    if (existing) return existing;
    stage = 'source-session-query';
    if (sourceSessionId && !db.select({id:trainingSessions.id}).from(trainingSessions).where(and(eq(trainingSessions.id,sourceSessionId),eq(trainingSessions.ownerId,ownerId))).get()) return failure('NOT_FOUND','来源训练不存在',404);
    const focus = focusDimension ? {dimension:focusDimension,instruction:focusDetails[focusDimension].instruction} : undefined;
    stage = 'generate-customer';
    const provider = getAIProvider();
    const { profile, opening } = await aiOwner.run(ownerId, async () => {
      if (provider.generateCustomerSetup && process.env.AI_CREATE_STRATEGY === 'combined') {
        return provider.generateCustomerSetup(scenario, focus);
      }
      const profile = await provider.generateCustomerProfile(scenario, focus);
      return { profile, opening: await provider.generateCustomerOpening(scenario, profile, focus) };
    });
    const now = Date.now();
    stage = 'transaction-begin';
    // Reserve the writer before reads so a concurrent commit cannot invalidate their WAL snapshot.
    const created = db.transaction(tx => {
      stage = 'owner-access-check';
      if (!canUseOwner(ownerId)) return false;
      stage = 'transaction-session-query';
      if (tx.select({id:trainingSessions.id}).from(trainingSessions).where(eq(trainingSessions.id,id)).get()) return false;
      stage = 'transaction-source-query';
      if (sourceSessionId && !tx.select({id:trainingSessions.id}).from(trainingSessions).where(and(eq(trainingSessions.id,sourceSessionId),eq(trainingSessions.ownerId,ownerId))).get()) return false;
      stage = 'training-sessions-insert';
      tx.insert(trainingSessions).values({id, ownerId, scenarioJson, customerProfileJson: JSON.stringify(profile), status:'active', createdAt:now, updatedAt:now}).run();
      stage = 'messages-insert';
      tx.insert(messages).values({id:randomUUID(),sessionId:id,role:'customer',content:opening,sequence:0,createdAt:now}).run();
      if (sourceSessionId && focusDimension) {
        stage = 'training-focus-insert';
        tx.insert(trainingFocus).values({sessionId:id,sourceSessionId,dimension:focusDimension,createdAt:now}).run();
      }
      stage = 'transaction-commit';
      return true;
    }, { behavior: 'immediate' });
    stage = 'transaction-result-check';
    if (!created) return resolveExisting('after-transaction') ?? failure('NOT_FOUND','账号或来源训练不可用',404);
    return success({id, status:'active', scenario, focus}, 201);
  } catch (error) {
    logE2EDiagnostic('session-create', stage, error, correlationId, true);
    return handleError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return success({items:[],nextCursor:null});
    const status = request.nextUrl.searchParams.get('status');
    const requestedLimit = Number(request.nextUrl.searchParams.get('limit') || 20);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 50) return failure('INVALID_LIMIT','每页数量需为1至50',422);
    const limit = requestedLimit;
    if (status && !['active','replying','finishing','completed','failed'].includes(status)) return failure('INVALID_STATUS','状态无效',422);
    const rawCursor = request.nextUrl.searchParams.get('cursor');
    let cursor: z.infer<typeof cursorSchema> | null = null;
    if (rawCursor) {
      try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8'))); }
      catch { return failure('INVALID_CURSOR','分页游标无效',422); }
    }
    const older = cursor ? or(lt(trainingSessions.createdAt,cursor.createdAt),and(eq(trainingSessions.createdAt,cursor.createdAt),lt(trainingSessions.id,cursor.id))) : undefined;
    const rows = db.select().from(trainingSessions).where(and(eq(trainingSessions.ownerId,ownerId),status ? eq(trainingSessions.status,status) : undefined,older)).orderBy(desc(trainingSessions.createdAt),desc(trainingSessions.id)).limit(limit+1).all();
    const page = rows.slice(0,limit);
    const last = page.at(-1);
    const nextCursor = rows.length > limit && last ? Buffer.from(JSON.stringify({createdAt:last.createdAt,id:last.id})).toString('base64url') : null;
    return success({items:page.map(row=>{const saved=db.select().from(trainingReports).where(eq(trainingReports.sessionId,row.id)).get();const focus=db.select().from(trainingFocus).where(eq(trainingFocus.sessionId,row.id)).get();const report=saved?JSON.parse(saved.reportJson):null;const scores=report?.scores;const score=scores?Object.values(scores as Record<string,{score:number}>).reduce((sum,item)=>sum+item.score,0):null;return {id:row.id,scenario:JSON.parse(row.scenarioJson),status:row.status,createdAt:row.createdAt,updatedAt:row.updatedAt,score,scoreSource:report?reportSource(report):null,focusDimension:focus?.dimension??null}}),nextCursor});
  } catch(error) { return handleError(error); }
}
