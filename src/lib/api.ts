import {NextRequest,NextResponse} from 'next/server';
import {AIModelOutputError,AIRequestTimeoutError} from '@/lib/ai/service';
export const success=(data:unknown,status=200)=>NextResponse.json({success:true,data},{status});
export const failure=(code:string,message:string,status=400)=>NextResponse.json({success:false,error:{code,message}},{status});
export function parseJson<T>(req:NextRequest,schema:{safeParse(value:unknown):{success:true;data:T}|{success:false;error:{issues:{message:string}[]}}}){return req.json().then(value=>{const result=schema.safeParse(value);return result.success?{data:result.data,error:null}:{data:null,error:failure('INVALID_INPUT',result.error.issues[0]?.message||'参数无效',422)}}).catch(()=>({data:null,error:failure('INVALID_JSON','请求体不是有效 JSON',400)}))}
export function handleError(error:unknown){if(error instanceof AIRequestTimeoutError)return failure('AI_TIMEOUT',error.message,504);if(error instanceof AIModelOutputError)return failure('AI_INVALID_OUTPUT',error.message,502);console.error(error);return failure('INTERNAL_ERROR','服务器暂时无法处理请求',500)}
