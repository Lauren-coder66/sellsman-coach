import {getOwnerId} from '@/lib/auth/session';
import {eq,desc,inArray} from 'drizzle-orm';
import {db} from '@/lib/db';
import {trainingSessions,messages,trainingReports} from '@/lib/db/schema';
import {success,handleError} from '@/lib/api';
import {localDayKey,startDayKey} from '@/lib/progress';
import {getAIMode} from '@/lib/ai';
export async function GET(){
  try{
  const ownerId=await getOwnerId();
  if(!ownerId)return success({aiMode:getAIMode(),total:0,completed:0,last7:0,turns:0,latest:null,latestScore:null,recent:[]});
  const sessions=db.select().from(trainingSessions).where(eq(trainingSessions.ownerId,ownerId)).orderBy(desc(trainingSessions.createdAt)).all();
  const now=Date.now(),today=localDayKey(now),start7=startDayKey(now,7);
  const last7=sessions.filter(session=>{const date=localDayKey(session.createdAt);return date>=start7&&date<=today}).length;
  const ids=sessions.map(s=>s.id);
  const userMessages=ids.length?db.select().from(messages).where(inArray(messages.sessionId,ids)).all().filter(m=>m.role==='user'):[];
  const reportRows=ids.length?db.select().from(trainingReports).where(inArray(trainingReports.sessionId,ids)).all():[];
  const score=(id:string)=>{const raw=reportRows.find(r=>r.sessionId===id);if(!raw)return null;const scores=JSON.parse(raw.reportJson).scores;if(!scores)return null;return Object.values(scores as Record<string,{score:number}>).reduce((sum,item)=>sum+item.score,0)};
  const recent=sessions.slice(0,5).map(s=>({id:s.id,scenario:JSON.parse(s.scenarioJson),status:s.status,createdAt:s.createdAt,score:score(s.id)}));
  return success({aiMode:getAIMode(),total:sessions.length,completed:sessions.filter(s=>s.status==='completed').length,last7,turns:userMessages.length,latest:recent[0]||null,latestScore:recent.find(s=>s.score!==null)?.score??null,recent});
}catch(error){return handleError(error)}}


