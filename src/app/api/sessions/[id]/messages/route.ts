import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server';
import {eq} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '@/lib/db';
import {messages} from '@/lib/db/schema';
import {getOwnedSession} from '@/lib/auth/session';
import {success,failure,handleError,parseJson} from '@/lib/api';
import {getAIProvider} from '@/lib/ai';
const inputSchema=z.object({content:z.string().trim().min(1).max(1000),requestId:z.string().uuid()});
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 try {
  const {id}=await params,session=await getOwnedSession(id);
  if(!session)return failure('NOT_FOUND','会话不存在',404);
  if(session.status!=='active')return failure('NOT_ACTIVE','训练已结束',409);
  const parsed=await parseJson(request,inputSchema);if(parsed.error)return parsed.error;
  const {content,requestId}=parsed.data!;
  let history=db.select().from(messages).where(eq(messages.sessionId,id)).orderBy(messages.sequence).all();
  const existing=history.find(m=>m.id===requestId);
  if(existing){
   if(existing.role!=='user'||existing.content!==content)return failure('DUPLICATE','请求 ID 冲突',409);
   const following=history.find(m=>m.sequence===existing.sequence+1);
   if(following?.role==='customer')return success({reply:following.content,alreadySaved:true});
   if(history.at(-1)?.id!==requestId)return failure('CONFLICT','历史消息已更新，请刷新',409);
  }else{
   if(history.filter(m=>m.role==='user').length>=30)return failure('LIMIT','已达到30轮上限',409);
   db.insert(messages).values({id:requestId,sessionId:id,role:'user',content,sequence:history.length,createdAt:Date.now()}).run();
   history=db.select().from(messages).where(eq(messages.sessionId,id)).orderBy(messages.sequence).all();
  }
  try{
   const reply=await getAIProvider().generateCustomerReply(JSON.parse(session.scenarioJson),JSON.parse(session.customerProfileJson),history);
   db.insert(messages).values({id:randomUUID(),sessionId:id,role:'customer',content:reply,sequence:history.length,createdAt:Date.now()}).run();
   return success({reply});
  }catch(error){return failure('MOCK_ERROR',error instanceof Error?error.message:'模拟客户回复失败',502)}
 }catch(error){return handleError(error)}
}
