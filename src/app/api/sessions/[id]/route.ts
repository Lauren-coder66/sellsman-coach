import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getOwnedSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { messages, trainingSessions } from '@/lib/db/schema';
import { success, failure, handleError } from '@/lib/api';
export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try { const {id}=await params; const session=await getOwnedSession(id); if(!session)return failure('NOT_FOUND','会话不存在',404); const rows=db.select().from(messages).where(eq(messages.sessionId,id)).orderBy(messages.sequence).all(); return success({session:{id,scenario:JSON.parse(session.scenarioJson),status:session.status},messages:rows}); } catch(error){return handleError(error)}
}
export async function DELETE(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try {const {id}=await params;const session=await getOwnedSession(id);if(!session)return failure('NOT_FOUND','会话不存在',404);db.delete(trainingSessions).where(eq(trainingSessions.id,id)).run();return success({deleted:true});}catch(error){return handleError(error)}
}
