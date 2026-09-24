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
  return <details className="interactive-lesson">
    <summary>Learn the concept: {lesson.title}</summary>
    <div className="lesson-content">
      <div className="lesson-concept-section">
        <p className="lesson-evidence">Connected evidence: {evidence}</p>
        <label className="lesson-level" htmlFor={`${id}-level`}>
          <span>Explanation depth</span>
          <select id={`${id}-level`} value={level} onChange={event=>setLevel(event.target.value)}>
            <option value="beginner">Beginner</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
        <p className="description lesson-explanation-text">{level==='beginner'?lesson.beginner:lesson.advanced}</p>
      </div>

      <div className="lesson-demo">
        <span className="eyebrow violet">ILLUSTRATIVE SIMULATION / NOT YOUR MODEL</span>
        
        <div className="lesson-slider-control">
          <label htmlFor={`${id}-dial`} className="lesson-dial-label">
            <span>{lesson.control}</span>
            <span className="lesson-dial-value">{dial}{lesson.unit}</span>
          </label>
          <input id={`${id}-dial`} className="lesson-slider" type="range" min={diagnosisId==='imbalance'?50:0} max="100" value={dial} onChange={event=>setDial(Number(event.target.value))}/>
        </div>

        <div className="lesson-chart-wrapper">
          <svg className="lesson-simulation-chart" viewBox="0 0 350 145" role="img" aria-label={demo.label+' as the demonstration control changes. Current exact value is below.'}>
            <path d="M30 15V120H325" fill="none" stroke="#66768c"/>
            <polyline points={curve.map(point=>x(point.x)+','+y(point.value)).join(' ')} fill="none" stroke="#c1a2ff" strokeWidth="2"/>
            <circle cx={x(dial)} cy={y(demo.value)} r="4" fill="#56dfce"/>
            <text x="30" y="138">{start}</text>
            <text x="320" y="138" textAnchor="end">100 (control)</text>
            <text x="30" y="12">Output: 0 to {maximum.toFixed(2)}</text>
          </svg>
        </div>

        <output htmlFor={`${id}-dial`} aria-live="polite" className="lesson-output">{demo.label}: <strong>{demo.value.toFixed(diagnosisId==='missing'?0:3)}{demo.suffix}</strong></output>
        <p className="description lesson-demo-note">{demo.note}</p>
        <button className="new-button lesson-reset-btn" onClick={()=>setDial(lesson.initial)}>Reset demonstration</button>
      </div>

      <fieldset className="lesson-quiz">
        <legend>{lesson.question}</legend>
        <div className="lesson-quiz-options">
          {lesson.options.map((option,index)=><label key={option} className={`quiz-option-label ${answer===index?'selected':''}`}>
            <input type="radio" name={`${id}-answer`} checked={answer===index} onChange={()=>{setAnswer(index);setChecked(false);}}/>
            <span className="quiz-option-text">{option}</span>
          </label>)}
        </div>
        <div className="lesson-quiz-actions">
          <button className="new-button" disabled={answer===null} onClick={()=>setChecked(true)}>Check understanding</button>
        </div>
        <p role="status" className={`lesson-quiz-feedback ${checked ? (answer===lesson.correct ? 'correct' : 'incorrect') : ''}`}>{checked ? `${answer===lesson.correct?'Correct.':'Not quite.'} ${lesson.explanation}` : 'Choose an answer, then check your reasoning.'}</p>
      </fieldset>
      <p className="description lesson-footnote">Lesson progress is temporary and resets when the investigation evidence changes.</p>
    </div>
  </details>;
}
