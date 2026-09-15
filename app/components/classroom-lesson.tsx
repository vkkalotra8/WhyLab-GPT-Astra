'use client';
import { useMemo, useState } from 'react';
import { buildClassroomLesson, gradePercentage } from '../lib/investigation/classroom-lesson';
import type { Investigation } from '../lib/investigation/types';
export default function ClassroomLesson({ investigation }: { investigation: Investigation }) {
  const lesson = useMemo(() => buildClassroomLesson(investigation), [investigation]);
  const [answers, setAnswers] = useState<Record<string, string>>({}), [checked, setChecked] = useState(false), [choice, setChoice] = useState(''), [reflection, setReflection] = useState(''), [notice, setNotice] = useState('');
  function reset() { setAnswers({}); setChecked(false); setChoice(''); setReflection(''); setNotice('Worksheet reset.'); }
  function download() { const payload = { worksheetVersion: 1, lesson, responses: { answers, interpretationChoice: choice === '' ? null : Number(choice), reflection }, feedback: checked ? lesson.exercises.map(e => ({ exerciseId: e.id, ...gradePercentage(answers[e.id] ?? '', e.expectedPercent) })) : null, investigation };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'whylab-classroom-worksheet.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('Worksheet downloaded with measured evidence and your responses.'); }
  return <section className="classroom-lesson"><h3>Classroom worksheet</h3><p>Read the measured evidence, calculate, explain, then propose a test. Enter percentages without a percent sign; rounding tolerance is 0.05 percentage points.</p>
    {lesson.exercises.length ? lesson.exercises.map(e => <div key={e.id}><label>{e.question}<input type="number" min="0" max="100" step="any" value={answers[e.id] ?? ''} onChange={event => { setAnswers(a => ({ ...a, [e.id]: event.target.value })); setChecked(false); }} /></label><p>Evidence: {e.evidenceIds.join(', ') || e.resultId} · Result: {e.resultId}</p><details><summary>Formula and hint</summary><p>{e.explanation}</p></details>{checked && <p>{gradePercentage(answers[e.id] ?? '', e.expectedPercent).feedback}</p>}</div>) : <p>No defined classification measurements are available for numerical exercises.</p>}
    <label>{lesson.interpretation.question}<select value={choice} onChange={e => { setChoice(e.target.value); setChecked(false); }}><option value="">Choose an interpretation</option>{lesson.interpretation.options.map((option, i) => <option value={i} key={option}>{option}</option>)}</select></label>
    {checked && <p>{choice === '' ? 'Choose an interpretation.' : Number(choice) === lesson.interpretation.correctIndex ? 'Correct. ' + lesson.interpretation.explanation : 'Reconsider the evidence scope. ' + lesson.interpretation.explanation}</p>}
    <label>Verification plan<textarea maxLength={4000} value={reflection} onChange={e => setReflection(e.target.value)} placeholder={lesson.reflection} /></label><p>{lesson.reflection}</p><p>Your plan is for classroom discussion and is not automatically graded or executed.</p>
    <div className="flagship-actions"><button onClick={() => { setChecked(true); setNotice('Worksheet feedback updated.'); }}>Check worksheet answers</button><button onClick={reset}>Reset worksheet</button><button onClick={download}>Download classroom worksheet</button></div><p role="status">{notice}</p>
    <details><summary>Instructor answer key and discussion guide</summary><ul>{lesson.exercises.map(e => <li key={e.id}>{e.metric}: {e.expectedPercent.toFixed(2)}% · {e.resultId}</li>)}</ul><p>{lesson.interpretation.explanation}</p><p>Discuss whether the proposed experiment could falsify the hypothesis, whether it preserves the evaluation criterion, and whether independent data is needed.</p></details>
    <p>Responses remain in this page session until reset or reload. Download to retain them; the file includes the answer key and source investigation.</p>
  </section>;
}
