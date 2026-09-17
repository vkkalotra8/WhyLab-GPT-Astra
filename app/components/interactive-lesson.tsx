"use client";
import { useId, useState } from 'react';
import { demonstration, lessons } from '../lib/lessons';
export default function InteractiveLesson({ diagnosisId, evidence }: { diagnosisId: string; evidence: string }) {
  const lesson=lessons[diagnosisId];
  if(!lesson)return null;
  return <LessonBody key={diagnosisId} diagnosisId={diagnosisId} evidence={evidence}/>;
}
function LessonBody({ diagnosisId, evidence }: { diagnosisId: string; evidence: string }) {
  const lesson=lessons[diagnosisId];
  const [level,setLevel]=useState('beginner');
  const [dial,setDial]=useState(lesson.initial);
  const [answer,setAnswer]=useState<number|null>(null);
  const [checked,setChecked]=useState(false);
  const id=useId();
  const demo=demonstration(diagnosisId,dial);
  const start=diagnosisId==='imbalance'?50:0;
  const curve=Array.from({length:21},(_,i)=>({x:start+i*(100-start)/20,value:demonstration(diagnosisId,start+i*(100-start)/20).value}));
  const maximum=Math.max(.001,...curve.map(point=>point.value));
  const x=(value:number)=>30+(value-start)/(100-start)*290;
  const y=(value:number)=>120-value/maximum*100;
  return <details className="interactive-lesson"><summary>06 / Learn why: {lesson.title}</summary>
    <p className="lesson-evidence">Connected evidence: {evidence}</p>
    <label className="lesson-level" htmlFor={`${id}-level`}>Explanation depth<select id={`${id}-level`} value={level} onChange={event=>setLevel(event.target.value)}><option value="beginner">Beginner</option><option value="advanced">Advanced</option></select></label>
    <p className="description">{level==='beginner'?lesson.beginner:lesson.advanced}</p>
    <div className="lesson-demo"><span className="eyebrow">ILLUSTRATIVE SIMULATION / NOT YOUR MODEL</span><label htmlFor={`${id}-dial`}>{lesson.control}: {dial}{lesson.unit}</label><input id={`${id}-dial`} type="range" min={diagnosisId==='imbalance'?50:0} max="100" value={dial} onChange={event=>setDial(Number(event.target.value))}/><svg className="lesson-simulation-chart" viewBox="0 0 350 145" role="img" aria-label={demo.label+' as the demonstration control changes. Current exact value is below.'}><path d="M30 15V120H325" fill="none" stroke="#66768c"/><polyline points={curve.map(point=>x(point.x)+','+y(point.value)).join(' ')} fill="none" stroke="#c1a2ff" strokeWidth="2"/><circle cx={x(dial)} cy={y(demo.value)} r="4" fill="#56dfce"/><text x="30" y="138">{start}</text><text x="320" y="138" textAnchor="end">100 (control)</text><text x="30" y="12">Output: 0 to {maximum.toFixed(2)}</text></svg><output htmlFor={`${id}-dial`} aria-live="polite">{demo.label}: <strong>{demo.value.toFixed(diagnosisId==='missing'?0:3)}{demo.suffix}</strong></output><p className="description">{demo.note}</p><button className="new-button" onClick={()=>setDial(lesson.initial)}>Reset demonstration</button></div>
    <fieldset className="lesson-quiz"><legend>{lesson.question}</legend>{lesson.options.map((option,index)=><label key={option}><input type="radio" name={`${id}-answer`} checked={answer===index} onChange={()=>{setAnswer(index);setChecked(false);}}/>{option}</label>)}<button className="new-button" disabled={answer===null} onClick={()=>setChecked(true)}>Check understanding</button><p role="status">{checked ? `${answer===lesson.correct?'Correct.':'Not quite.'} ${lesson.explanation}` : 'Choose an answer, then check your reasoning.'}</p></fieldset>
    <p className="description">Lesson progress is temporary and resets when the investigation evidence changes.</p>
  </details>;
}
