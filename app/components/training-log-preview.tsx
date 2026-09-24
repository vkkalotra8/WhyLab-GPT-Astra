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
  if (!preview.diagnostics) return <p role="status" className="training-log-error">{preview.error}</p>;
  const { history, findings, warnings } = preview.diagnostics;
  return (
    <section aria-label="Training log diagnostics" className="panel training-log-preview-panel">
      <div className="training-log-header">
        <div className="training-log-title-row">
          <h3>Reported training history</h3>
          <span className="epoch-count-badge">{history.length} recognized epochs</span>
        </div>
        <p className="training-log-disclaimer">Parsed locally from your logs. These values and heuristic patterns are unverified; they do not establish a cause.</p>
        <p className="training-log-trend-requirement">Trend checks require at least four consecutive epochs with matching loss metrics.</p>
      </div>

      {findings.length > 0 ? (
        <div className="training-log-findings">
          {findings.map((finding, index) => (
            <article key={index} className="training-log-finding-card">
              <h4>{finding.title}</h4>
              <p className="finding-evidence">{finding.evidence}</p>
              <p className="finding-experiment"><strong>Verification to try:</strong> {finding.experiment}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="training-log-no-trends">No supported trend heuristic triggered. This does not establish that training is healthy.</p>
      )}

      <details className="epoch-details-disclosure">
        <summary>Reported epochs and parser limitations</summary>
        <div className="epoch-disclosure-content">
          <ul className="epoch-history-list">
            {history.map(point => (
              <li key={point.epoch}>
                <strong>Epoch {point.epoch}:</strong>{' '}
                {Object.entries(point.metrics).map(([key, value]) => `${key} = ${value}`).join(', ')}
              </li>
            ))}
          </ul>
          {warnings.length > 0 && (
            <ul className="epoch-warnings-list">
              {warnings.map((warning, index) => <li key={index}>{warning}</li>)}
            </ul>
          )}
        </div>
      </details>
    </section>
  );
}
