'use client';
import { useState } from 'react';
import {
  buildIncidentReport,
  incidentReportMarkdown,
  incidentIssueMarkdown,
  deriveCiPolicy,
  defaultReportContext
} from '../lib/investigation/incident-report';
import type { Investigation } from '../lib/investigation/types';

export default function IncidentReportExport({ investigation }: { investigation: Investigation }) {
  const [model, setModel] = useState(''), [severity, setSeverity] = useState('unassessed'), [rationale, setRationale] = useState('');
  const [notice, setNotice] = useState('');

  function getReport() {
    if (severity !== 'unassessed' && !rationale.trim()) throw new Error('Explain the operational impact before assigning severity.');
    return buildIncidentReport(investigation, {
      modelIdentifier: model.trim() || defaultReportContext.modelIdentifier,
      severity,
      severityRationale: rationale.trim() || defaultReportContext.severityRationale
    });
  }

  function download(format: 'json' | 'md') {
    try {
      const report = getReport();
      const content = format === 'json' ? JSON.stringify(report, null, 2) : incidentReportMarkdown(report);
      const url = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `whylab-incident-report.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`Incident report (${format.toUpperCase()}) downloaded with complete evidence snapshot.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Report could not be generated.'); }
  }

  async function copyGitHubIssue() {
    try {
      const report = getReport();
      const issueBody = incidentIssueMarkdown(report);
      await navigator.clipboard.writeText(issueBody);
      setNotice('GitHub issue markdown copied to clipboard! Ready to paste into GitHub Issues.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not copy GitHub issue.'); }
  }

  function downloadCiGate() {
    try {
      const policy = deriveCiPolicy(investigation);
      if (!policy) {
        setNotice('No passing before/after repair comparison recorded yet. Apply and verify a repair in Repair Lab to generate a measured CI gate.');
        return;
      }
      const content = JSON.stringify(policy, null, 2);
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'whylab-ci-gate.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Executable CI policy gate (whylab-ci-gate.json) downloaded at measured thresholds.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not generate CI policy gate.'); }
  }

  const ciPolicy = deriveCiPolicy(investigation);

  const workflowYml = `# .github/workflows/whylab-reliability.yml
name: ML Reliability Gate
on: [push, pull_request]

jobs:
  reliability-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - name: Evaluate WhyLab Reliability Policy
        run: npm run check:reliability
`;

  return (
    <section className="incident-export" id="export-lab">
      <h3>ML Incident Report & CI/CD Operational Remedies</h3>
      <p>
        Export this investigation with complete provenance, policies, and verification. Annotate model identity and severity, copy an actionable GitHub Issue, or download an executable CI/CD reliability gate generated directly from measured passing repair thresholds.
      </p>

      <div className="astra-inputs">
        <label>
          Model identifier (optional)
          <input maxLength={4000} value={model} onChange={e => setModel(e.target.value)} placeholder="Model name, version or artifact ID" />
        </label>
        <label>
          Incident severity
          <select value={severity} onChange={e => setSeverity(e.target.value)}>
            {['unassessed', 'low', 'moderate', 'high', 'critical'].map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Severity rationale
          <textarea maxLength={4000} value={rationale} onChange={e => setRationale(e.target.value)} placeholder="Describe observed operational impact; avoid inferring it from accuracy alone." />
        </label>
      </div>

      <div className="flagship-actions" style={{ flexWrap: 'wrap', gap: '10px' }}>
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
        <button type="button" onClick={copyGitHubIssue} title="Copy GitHub Issue markdown to clipboard">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
          Copy GitHub Issue
        </button>
        <button type="button" onClick={downloadCiGate} title="Download executable CI no-regression policy">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Download CI Gate JSON
        </button>
      </div>

      {notice && <p role="status" className="notice-banner" style={{ marginTop: '12px' }}>{notice}</p>}

      <details className="score-formula-details" style={{ marginTop: '14px' }}>
        <summary>Inspect Runnable CI Gate & GitHub Actions Workflow</summary>
        <div className="formula-card">
          <p><strong>Generated CI Policy ({ciPolicy ? `${ciPolicy.checks.length} checks active` : 'No passing comparison'}):</strong></p>
          <pre style={{ maxHeight: '180px', overflowY: 'auto', background: '#0f172a', color: '#e2e8f0', padding: '10px', borderRadius: '6px' }}>
            {ciPolicy ? JSON.stringify(ciPolicy, null, 2) : '// Pass a repair comparison to generate exact measured threshold gates'}
          </pre>
          <p style={{ marginTop: '10px' }}><strong>Example GitHub Actions Integration (.github/workflows/whylab-reliability.yml):</strong></p>
          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: '10px', borderRadius: '6px' }}>
            {workflowYml}
          </pre>
        </div>
      </details>
    </section>
  );
}

