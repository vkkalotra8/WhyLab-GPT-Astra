import TrainingCurves from "./training-curves";
﻿import type { Evidence } from '../lib/evidence';
export default function EvidenceSummary({ evidence }: { evidence: Evidence }) {
  return <section className="evidence-summary" aria-labelledby="summary-heading">
    <div className="section-heading"><h3 id="summary-heading">Evidence extracted</h3><span className="badge">{evidence.format}</span></div>
    <p className="description">{evidence.source}{evidence.rows !== undefined && ` / ${evidence.rows} rows / ${evidence.columns} columns`}</p>
    <dl className="evidence-metrics">{evidence.metrics.map((metric, i) => <div key={`${metric.label}-${i}`}><dt>{metric.label}</dt><dd>{metric.value}</dd><small>{metric.source}</small></div>)}</dl>
    <TrainingCurves history={evidence.history} />
    <ul className="evidence-warnings">{evidence.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>
  </section>;
}
