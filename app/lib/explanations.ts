export type ExplanationInput = { id: string; title: string; evidence: { id: string; text: string }[]; conflicts: string[]; missing: string[]; experiment: string };
export type Explanation = { summary: string; claims: { text: string; evidenceIds: string[] }[]; limitations: string; nextStep: string };
const object=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export function validateExplanationInput(value:unknown):ExplanationInput {
 if(!object(value)||!text(value.id,100)||!text(value.title,200)||!text(value.experiment,2000)||!Array.isArray(value.evidence)||value.evidence.length<1||value.evidence.length>8)throw new Error('Provide a hypothesis and 1-8 evidence excerpts.');
 if(!value.evidence.every(e=>object(e)&&text(e.id,20)&&/^E[1-8]$/.test(e.id)&&text(e.text,1500))||new Set(value.evidence.map(e=>e.id)).size!==value.evidence.length)throw new Error('Evidence references must be unique E1-E8 with excerpts of at most 1,500 characters.');
 for(const field of ['conflicts','missing'])if(!Array.isArray(value[field])||value[field].length>8||!value[field].every(v=>text(v,1000)))throw new Error('Context must contain at most eight bounded text excerpts.');
 return {id:value.id,title:value.title,experiment:value.experiment,evidence:value.evidence.map(e=>({id:e.id,text:e.text})),conflicts:value.conflicts as string[],missing:value.missing as string[]};
}
export function validateExplanation(value:unknown,input:ExplanationInput):Explanation {
 if(!object(value)||!text(value.summary,2000)||!text(value.limitations,2000)||!text(value.nextStep,2000)||!Array.isArray(value.claims)||value.claims.length<1||value.claims.length>8)throw new Error('The explanation did not match the expected format.');
 const ids=new Set(input.evidence.map(e=>e.id));
 if(!value.claims.every(c=>object(c)&&text(c.text,1500)&&Array.isArray(c.evidenceIds)&&c.evidenceIds.length>0&&c.evidenceIds.length<=8&&c.evidenceIds.every(id=>typeof id==='string'&&ids.has(id))))throw new Error('The explanation referenced unavailable evidence.');
 return {summary:value.summary,limitations:value.limitations,nextStep:value.nextStep,claims:value.claims.map(c=>({text:c.text,evidenceIds:c.evidenceIds}))};
}
export function localExplanation(input:ExplanationInput):Explanation {
 return {summary:`${input.title} is a hypothesis supported by the supplied observations, not a confirmed cause.`,claims:input.evidence.map(e=>({text:e.text,evidenceIds:[e.id]})),limitations:[...input.conflicts,...input.missing,'The evidence has not been independently verified. A controlled experiment is needed to distinguish competing explanations.'].join(' '),nextStep:input.experiment};
}
export const explanationSchema={type:'object',additionalProperties:false,properties:{summary:{type:'string'},claims:{type:'array',items:{type:'object',additionalProperties:false,properties:{text:{type:'string'},evidenceIds:{type:'array',items:{type:'string'}}},required:['text','evidenceIds']}},limitations:{type:'string'},nextStep:{type:'string'}},required:['summary','claims','limitations','nextStep']};
// This is process-local protection for a local prototype, not an authenticated quota system.
export function createBudget(minuteLimit=10,dayLimit=100,concurrencyLimit=2) {
 let minute=-1,day=-1,minuteCount=0,dayCount=0,active=0;
 return {acquire(now=Date.now()) {const m=Math.floor(now/60000),d=Math.floor(now/86400000);if(m!==minute){minute=m;minuteCount=0;}if(d!==day){day=d;dayCount=0;}if(minuteCount>=minuteLimit||dayCount>=dayLimit||active>=concurrencyLimit)return null;minuteCount++;dayCount++;active++;let released=false;return ()=>{if(!released){released=true;active--;}};}};
}
