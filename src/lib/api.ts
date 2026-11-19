import {NextRequest,NextResponse} from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import {AIModelOutputError,AIProviderAccessError,AIRequestTimeoutError} from '@/lib/ai/service';
import {AccountRequiredError} from '@/lib/auth/errors';
import {AIQuotaError} from '@/lib/ai/usage-context';
import {AIRateLimitError} from '@/lib/ai/service';
import {safeDiagnosticError} from '@/lib/e2e-diagnostics';
export const success=(data:unknown,status=200)=>NextResponse.json({success:true,data},{status});
export const failure=(code:string,message:string,status=400)=>NextResponse.json({success:false,error:{code,message}},{status});
export function parseJson<T>(req:NextRequest,schema:{safeParse(value:unknown):{success:true;data:T}|{success:false;error:{issues:{message:string}[]}}}){return req.json().then(value=>{const result=schema.safeParse(value);return result.success?{data:result.data,error:null}:{data:null,error:failure('INVALID_INPUT',result.error.issues[0]?.message||'参数无效',422)}}).catch(()=>({data:null,error:failure('INVALID_JSON','请求体不是有效 JSON',400)}))}
export function handleError(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof AccountRequiredError) return failure('ACCOUNT_REQUIRED', '请先登录已验证的账号', 401);
  if (error instanceof AIQuotaError || error instanceof AIRateLimitError) return failure('AI_RATE_LIMIT', error.message, 429);
  if (error instanceof AIRequestTimeoutError) return failure('AI_TIMEOUT', error.message, 504);
  if (error instanceof AIProviderAccessError) return failure('AI_UNAVAILABLE', error.message, 503);
  if (error instanceof AIModelOutputError) return failure('AI_INVALID_OUTPUT', error.message, 502);
  console.error('[api-error]', safeDiagnosticError(error).errorName);
  return failure('INTERNAL_ERROR', '服务器暂时无法处理请求', 500);
}
