import { AIServiceError, explainWithOpenAI, isAIConfigured, publicAIError } from '../../lib/server/openai-service.ts';
import { authorizePaidRequest } from '../../lib/server/access-control.ts';
import { enforceSharedQuota } from '../../lib/server/shared-quota.ts';
﻿import { localExplanation, validateExplanationInput, createBudget } from '../../lib/explanations';
export const runtime='nodejs';
const budget=createBudget();
const headers={'Cache-Control':'no-store'};
const configured=isAIConfigured;
export function GET(){return Response.json({aiAvailable:configured()}, {headers});}
async function readBody(request:Request) {
 const reader=request.body?.getReader();if(!reader)throw new Error('Empty request.');let size=0;const chunks:Uint8Array[]=[];
 try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>24000){await reader.cancel();throw new Error('Request exceeds 24 KB.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function POST(request:Request) {
 const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)return Response.json({error:'Only same-origin requests are accepted.'},{status:403,headers});
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return Response.json({error:'Use application/json.'},{status:415,headers});
 let payload:unknown;try{payload=await readBody(request);}catch{return Response.json({error:'Invalid JSON or request exceeds 24 KB.'},{status:400,headers});}
 if(typeof payload!=='object'||payload===null||!('mode' in payload)||!['local','ai'].includes(String(payload.mode))||!('hypothesis' in payload))return Response.json({error:'Choose local or ai mode and provide a hypothesis.'},{status:400,headers});
 let input;try{input=validateExplanationInput(payload.hypothesis);}catch(error){return Response.json({error:error instanceof Error?error.message:'Invalid evidence.'},{status:400,headers});}
 if(payload.mode==='local')return Response.json({mode:'local',explanation:localExplanation(input)},{headers});
 const authorization=authorizePaidRequest(request);
 if(authorization==='not_configured')return Response.json({error:'Paid endpoint access control is not configured.'},{status:503,headers});
 if(authorization)return Response.json({error:'A valid access token is required.'},{status:401,headers});
 const quota=await enforceSharedQuota(request,'explain');
 if(!quota.allowed)return Response.json({error:quota.reason==='limited'?'Shared explanation limit reached. Try again later.':'Shared usage controls are unavailable.'},{status:quota.reason==='limited'?429:503,headers:{...headers,'Retry-After':String(quota.retryAfter)}});
 if(!('consent' in payload)||payload.consent!==true)return Response.json({error:'Confirm sending the displayed excerpts to OpenAI.'},{status:400,headers});
 if(!configured())return Response.json({error:'AI is not configured. Use the local explanation.'},{status:503,headers});
 const release=budget.acquire();if(!release)return Response.json({error:'AI request limit reached. Use the local explanation or try later.'},{status:429,headers:{...headers,'Retry-After':'60'}});
 try {
  const explanation=await explainWithOpenAI(input,request.signal);
  return Response.json({mode:'ai',explanation},{headers});
 }catch(cause){return Response.json({error:cause instanceof AIServiceError?publicAIError(cause.code):'AI explanation was unavailable or failed validation. Your investigation is unchanged; use the local explanation.'},{status:502,headers});}finally{release();}
}
