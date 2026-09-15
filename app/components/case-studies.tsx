'use client';
import ClassroomLesson from './classroom-lesson';
import { useEffect, useRef, useState } from 'react';
import { caseStudies, runCaseStudy, type CaseStudyId } from '../lib/investigation/case-studies';
import type { Investigation } from '../lib/investigation/types';
import EvidenceGraph from './evidence-graph';
import ReliabilityProfile from './reliability-profile';
import IncidentReportExport from './incident-report-export';
export default function CaseStudies() {
  const [selected, setSelected] = useState<CaseStudyId>('calibration'), [result, setResult] = useState<Investigation | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const spec = caseStudies.find(c => c.id === selected)!;
  async function run() { const c = new AbortController(); controller.current = c; setBusy(true); setError(''); setResult(null); try { const response = await fetch(`/fixtures/${spec.file}`, { signal: c.signal, cache: 'no-store' }); if (!response.ok) throw new Error('Case fixture unavailable.'); setResult(runCaseStudy(selected, await response.text())); } catch { if (!c.signal.aborted) setError('Unable to run this case. Retry loading its fixture.'); } finally { setBusy(false); } }
  return <section id="case-studies" className="panel flagship"><h2>More investigations</h2><p>Two synthetic case studies, measured locally from downloadable CSVs. No saved state or API key required.</p><label>Case study<select disabled={busy} value={selected} onChange={e => { setSelected(e.target.value as CaseStudyId); setResult(null); setError(''); }}>{caseStudies.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><h3>{spec.title}</h3><p>{spec.question}</p><div className="flagship-actions"><button disabled={busy} onClick={run}>{busy ? 'Measuring case…' : 'Run selected case'}</button><a href={`/fixtures/${spec.file}`} download>Download case CSV</a></div>{error && <p role="alert">{error}</p>}
    {result && <div className="case-study-results"><p role="status">Case complete. Measurements from {result.datasets[0].rowCount} synthetic rows.</p>{result.toolResults.map(r => <article key={r.id}><h4>{r.tool.replaceAll('_', ' ')}</h4>{r.status === 'completed' && r.tool === 'compute_classification_metrics' && <p>Measured accuracy: {r.output.metrics.find(m => m.name === 'accuracy')?.status === 'measured' ? (r.output.metrics.find(m => m.name === 'accuracy') as { value: number }).value * 100 : 'Undefined'}%</p>}<details open><summary>Measured output and provenance</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 360, overflow: 'auto' }}>{JSON.stringify(r, null, 2)}</pre></details></article>)}<p>{result.diagnosis?.summary}</p><p>Next verification: {spec.nextStep}</p><ClassroomLesson key={result.datasets[0].id} investigation={result} /><ReliabilityProfile investigation={result} /><EvidenceGraph investigation={result} /><IncidentReportExport investigation={result} /></div>}
  </section>;
}
