'use client';
import { useState } from 'react';
import { buildIncidentReport, incidentReportMarkdown, defaultReportContext } from '../lib/investigation/incident-report';
import type { Investigation } from '../lib/investigation/types';

export default function IncidentReportExport({ investigation }: { investigation: Investigation }) {
  const [model, setModel] = useState(''), [severity, setSeverity] = useState('unassessed'), [rationale, setRationale] = useState('');
  const [notice, setNotice] = useState('');
  function download(format: 'json' | 'md') {
    try {
      if (severity !== 'unassessed' && !rationale.trim()) throw new Error('Explain the operational impact before assigning severity.');
      const report = buildIncidentReport(investigation, { modelIdentifier: model.trim() || defaultReportContext.modelIdentifier, severity, severityRationale: rationale.trim() || defaultReportContext.severityRationale });
      const content = format === 'json' ? JSON.stringify(report, null, 2) : incidentReportMarkdown(report);
      const url = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `whylab-incident-report.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Incident report downloaded with the complete evidence snapshot.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Report could not be generated.'); }
  }
  return <section className="incident-export"><h3>ML incident report</h3><p>Export this investigation with provenance, policies and verification. Model identity and severity are your annotations; monitoring and CI/CD checks are suggestions or recorded results, not deployed controls.</p>
    <div className="astra-inputs"><label>Model identifier (optional)<input maxLength={4000} value={model} onChange={e => setModel(e.target.value)} placeholder="Model name, version or artifact ID" /></label><label>Incident severity<select value={severity} onChange={e => setSeverity(e.target.value)}>{['unassessed', 'low', 'moderate', 'high', 'critical'].map(s => <option key={s}>{s}</option>)}</select></label><label>Severity rationale<textarea maxLength={4000} value={rationale} onChange={e => setRationale(e.target.value)} placeholder="Describe observed operational impact; avoid inferring it from accuracy alone." /></label></div>
    <div className="flagship-actions">
      <button type="button" className="new-button" onClick={() => download('md')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
        Export incident Markdown
      </button>
      <button type="button" onClick={() => download('json')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
        Export incident JSON
      </button>
    </div>
    <p role="status">{notice}</p>
  </section>;
}
