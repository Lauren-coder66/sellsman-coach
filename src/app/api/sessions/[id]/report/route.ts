import {NextRequest} from 'next/server';
import {eq} from 'drizzle-orm';
import {db} from '@/lib/db';
import {trainingReports} from '@/lib/db/schema';
import {getOwnedSession} from '@/lib/auth/session';
import {success,failure,handleError} from '@/lib/api';
export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{const {id}=await params;if(!await getOwnedSession(id))return failure('NOT_FOUND','会话不存在',404);const report=db.select().from(trainingReports).where(eq(trainingReports.sessionId,id)).get();return report?success(JSON.parse(report.reportJson)):failure('NO_REPORT','报告尚未生成',404)}catch(error){return handleError(error)}
}
