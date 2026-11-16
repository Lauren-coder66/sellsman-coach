import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { trainingSessions, messages, trainingReports } from '@/lib/db/schema';
import { getOrCreateOwnerId } from '@/lib/auth/session';
import { success, failure, handleError, parseJson } from '@/lib/api';
import { scenarioSchema } from '@/lib/validation';
import { getAIProvider } from '@/lib/ai';
import { eq, desc, and } from 'drizzle-orm';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJson(request, scenarioSchema);
    if (parsed.error) return parsed.error;
    const scenario = parsed.data!;
    const ownerId = await getOrCreateOwnerId();
    const provider = getAIProvider();
    const profile = await provider.generateCustomerProfile(scenario);
    const opening = await provider.generateCustomerOpening(scenario, profile);
    const id = randomUUID();
    const now = Date.now();
    db.transaction(tx => {
      tx.insert(trainingSessions).values({id, ownerId, scenarioJson: JSON.stringify(scenario), customerProfileJson: JSON.stringify(profile), status:'active', createdAt:now, updatedAt:now}).run();
      tx.insert(messages).values({id:randomUUID(),sessionId:id,role:'customer',content:opening,sequence:0,createdAt:now}).run();
    });
    return success({id, status:'active', scenario}, 201);
  } catch (error) { return handleError(error); }
}

export async function GET(request: NextRequest) {
  try {
    const ownerId = (await cookies()).get('sales_coach_owner')?.value;
    if (!ownerId) return success({items:[],nextCursor:null});
    const status = request.nextUrl.searchParams.get('status');
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit') || 20),1),50);
    if (status && !['active','finishing','completed','failed'].includes(status)) return failure('INVALID_STATUS','状态无效',422);
    const rows = db.select().from(trainingSessions).where(status ? and(eq(trainingSessions.ownerId,ownerId),eq(trainingSessions.status,status)) : eq(trainingSessions.ownerId,ownerId)).orderBy(desc(trainingSessions.createdAt)).limit(limit).all();
    return success({items:rows.map(row=>{const saved=db.select().from(trainingReports).where(eq(trainingReports.sessionId,row.id)).get();const scores=saved?JSON.parse(saved.reportJson).scores:null;const score=scores?Object.values(scores as Record<string,{score:number}>).reduce((sum,item)=>sum+item.score,0):null;return {id:row.id,scenario:JSON.parse(row.scenarioJson),status:row.status,createdAt:row.createdAt,updatedAt:row.updatedAt,score}}),nextCursor:null});
  } catch(error) { return handleError(error); }
}
