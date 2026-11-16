import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server';
import {eq} from 'drizzle-orm';
import {db} from '@/lib/db';
import {trainingSessions,messages,trainingReports} from '@/lib/db/schema';
import {getOwnedSession} from '@/lib/auth/session';
import {success,failure,handleError} from '@/lib/api';
import {getAIProvider} from '@/lib/ai';
export async function POST(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
 try {const {id}=await params;const session=await getOwnedSession(id);if(!session)return failure('NOT_FOUND','会话不存在',404);const prior=db.select().from(trainingReports).where(eq(trainingReports.sessionId,id)).get();if(prior)return success({report:JSON.parse(prior.reportJson)});if(session.status==='finishing')return failure('IN_PROGRESS','报告正在生成',409);const rows=db.select().from(messages).where(eq(messages.sessionId,id)).orderBy(messages.sequence).all();const userRows=rows.filter(m=>m.role==='user');const changed=db.update(trainingSessions).set({status:'finishing',updatedAt:Date.now()}).where(eq(trainingSessions.id,id)).run();if(!changed.changes)return failure('CONFLICT','状态更新失败',409);
 try {const report=userRows.length<3?{summary:'训练样本不足，不生成正式能力评分。',customer_outcome:'样本不足',scores:null,issues:[],strengths:[],improvements:[],next_training_suggestion:'至少完成三轮训练。',sample_insufficient:true}:await getAIProvider().generateTrainingReport(JSON.parse(session.scenarioJson),rows);const checked={...report,issues:report.issues.filter(issue=>{const original=userRows.find(m=>m.id===issue.message_id);return !!original&&original.content.includes(issue.quote)})};db.transaction(tx=>{tx.insert(trainingReports).values({id:randomUUID(),sessionId:id,reportJson:JSON.stringify(checked),createdAt:Date.now()}).run();tx.update(trainingSessions).set({status:'completed',updatedAt:Date.now()}).where(eq(trainingSessions.id,id)).run()});return success({report:checked})}catch(error){db.update(trainingSessions).set({status:'failed',updatedAt:Date.now()}).where(eq(trainingSessions.id,id)).run();return failure('REPORT_ERROR',error instanceof Error?error.message:'报告生成失败',502)}}catch(error){return handleError(error)}
}
