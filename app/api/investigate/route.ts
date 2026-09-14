import { investigateWithOpenAI } from '../../lib/server/openai-investigator.ts';
import { isAIConfigured } from '../../lib/server/openai-service.ts';
import { createBudget } from '../../lib/explanations.ts';
import { ingestEvaluationCsv, EvaluationValidationError } from '../../lib/investigation/evaluation-ingestion.ts';
import { investigationUploadSchema, activityMessage } from '../../lib/investigation-workflow.ts';
export const runtime='nodejs';
export const maxDuration=150;
const headers={'Cache-Control':'no-store'};
const budget=createBudget();
export function GET(){return Response.json({available:isAIConfigured()},{headers});}
export async function POST(request:Request){
  const error=(message:string,status:number)=>Response.json({error:message},{status,headers});
  if(request.headers.get('origin')!==new URL(request.url).origin)return error('Only same-origin requests are accepted.',403);
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return error('Use application/json.',415);
  const release=budget.acquire();if(!release)return error('Investigation request limit reached. Try again later.',429);
  let payload;
  try{
    const reader=request.body?.getReader();if(!reader)throw new Error('Empty body');
    let timedOut=false;
    const cancel=()=>{void reader.cancel().catch(()=>{});};
    request.signal.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(()=>{timedOut=true;cancel();},15000);let size=0;const parts:Uint8Array[]=[];
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12000000){await reader.cancel();throw new Error('Too large');}parts.push(value);}}finally{clearTimeout(timer);request.signal.removeEventListener('abort',cancel);reader.releaseLock();}
    if(timedOut||request.signal.aborted)throw new Error('Upload interrupted');
    const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
    payload=investigationUploadSchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  }catch{release();return error('Provide consent, valid settings, and one to three CSV files up to 2 MB each.',400);}
  if(!isAIConfigured()){release();return error('Astra is not configured. Set WHYLAB_AI_ENABLED, OPENAI_API_KEY and OPENAI_MODEL on the server.',503);}
  let datasets;
  try{datasets=payload.files.map(file=>ingestEvaluationCsv(file.text,file.name,{labels:payload.labels}));if(datasets.reduce((n,d)=>n+d.rows.length,0)>20000)throw new Error('Row limit');}
  catch(cause){release();return error(cause instanceof EvaluationValidationError?cause.message:'Use at most 20,000 total evaluation rows.',400);}
  const controller=new AbortController();const active=AbortSignal.any([request.signal,controller.signal]);const encoder=new TextEncoder();
  const stream=new ReadableStream<Uint8Array>({
    start(output){let closed=false;
      const send=(value:unknown)=>{if(closed||active.aborted)return;try{output.enqueue(encoder.encode(JSON.stringify(value)+'\n'));}catch{closed=true;controller.abort();}};
      const task=async()=>{try{
        for(const d of datasets)send({type:'progress',message:`Dataset parsed: ${d.metadata.rowCount} evaluation rows`});
        send({type:'progress',message:'Astra investigation started'});
        const run=await investigateWithOpenAI({objective:payload.objective,consent:true,accuracyParadoxGap:payload.accuracyParadoxGap,datasets},active,event=>{const message=activityMessage(event.kind,event.code);if(message)send({type:'progress',message});});
        send({type:'result',investigation:run.finalInvestigation});
      }catch{send({type:'error',message:'Investigation was unavailable or failed validation. Check configuration or try again.'});}
      finally{release();if(!closed){closed=true;try{output.close();}catch{}}}};
      void task();
    },cancel(){controller.abort();},
  });
  return new Response(stream,{headers:{...headers,'Content-Type':'application/x-ndjson; charset=utf-8','X-Content-Type-Options':'nosniff','X-Accel-Buffering':'no'}});
}
