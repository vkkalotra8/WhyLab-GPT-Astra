'use client';
import { useMemo } from 'react';
import { ingestTrainingLog } from '../lib/investigation/training-logs';

export default function TrainingLogPreview({ text }: { text: string }) {
  const preview = useMemo(() => {
    if (!text.trim()) return null;
    try { return { diagnostics: ingestTrainingLog({ name: 'training-log.txt', text }).diagnostics, error: null }; }
    catch (error) { return { diagnostics: null, error: error instanceof Error ? error.message : 'Unable to parse training logs.' }; }
  }, [text]);
  if (!preview) return null;
  if (!preview.diagnostics) return <p role="status">{preview.error}</p>;
  const { history, findings, warnings } = preview.diagnostics;
  return <section aria-label="Training log diagnostics" className="panel">
    <h3>Reported training history</h3>
    <p>Parsed locally from your logs. These values and heuristic patterns are unverified; they do not establish a cause.</p>
    <p>{history.length} recognized epochs. Trend checks require at least four consecutive epochs with matching loss metrics.</p>
    {findings.map((finding, index) => <article key={index}><h4>{finding.title}</h4><p>{finding.evidence}</p><p>Verification to try: {finding.experiment}</p></article>)}
    {!findings.length && <p>No supported trend heuristic triggered. This does not establish that training is healthy.</p>}
    <details><summary>Reported epochs and parser limitations</summary>
      <ul>{history.map(point => <li key={point.epoch}>Epoch {point.epoch}: {Object.entries(point.metrics).map(([key,value]) => key + ' = ' + value).join(', ')}</li>)}</ul>
      <ul>{warnings.map((warning,index) => <li key={index}>{warning}</li>)}</ul>
    </details>
  </section>;
}
