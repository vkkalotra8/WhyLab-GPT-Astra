import { buildReliabilityProfile } from './reliability-profile.ts';
﻿import { validateInvestigation } from './validation.ts';
import type { Investigation } from './types.ts';
import { enumeration, object, text } from './schema.ts';
import { ciPolicySchema } from './ci-policy.ts';

export const reportContextSchema = object({ modelIdentifier: text, severity: enumeration(['unassessed', 'low', 'moderate', 'high', 'critical']), severityRationale: text });
export const defaultReportContext = { modelIdentifier: 'Not supplied', severity: 'unassessed' as const, severityRationale: 'Operational impact has not been assessed.' };

// Headline metrics worth gating alongside whichever metric the repair was actually accepted on.
const gateMetrics = ['recall', 'precision', 'balanced_accuracy', 'expected_cost'];

/**
 * Build an executable no-regression gate from measured passing comparisons. Thresholds are the
 * measured values themselves: any tolerance would be an invented number, so teams must widen the
 * gate deliberately. Returns null when nothing was measured, rather than inventing a policy.
 */
export function deriveCiPolicy(investigation: Investigation) {
  const seen = new Set<string>();
  const checks: { stage: 'after'; metric: string; operator: 'at_least' | 'at_most'; value: number; unit: string }[] = [];
  for (const comparison of investigation.comparisons) {
    if (comparison.status !== 'passed') continue;
    for (const m of comparison.afterEvidenceIds.flatMap(eid => investigation.evidence.find(e => e.id === eid)?.measurements ?? [])) {
      if (m.status !== 'measured') continue;
      const accepted = m.name === comparison.criterion.metric && m.unit === comparison.criterion.unit;
      const key = `${m.name}|${m.unit}`;
      if (!accepted && !gateMetrics.includes(m.name) || seen.has(key)) continue;
      seen.add(key);
      checks.push({ stage: 'after', metric: m.name, operator: accepted ? comparison.criterion.operator : m.unit === 'cost' || m.unit === 'loss' ? 'at_most' : 'at_least', value: m.value, unit: m.unit });
    }
  }
  return checks.length ? ciPolicySchema.parse({ version: 1, name: `No-regression gate generated from ${investigation.id}`, checks: checks.slice(0, 50) }) : null;
}

/** All measured records remain in the validated canonical snapshot; annotations are explicit. */
export function buildIncidentReport(value: Investigation, context: unknown = defaultReportContext) {
  const investigation = validateInvestigation(value);
  const annotations = reportContextSchema.parse(context);
  const monitoringSuggestions = [
    'Monitor class prevalence, recall, precision and balanced accuracy on newly labeled evaluation data.',
    'Re-evaluate the declared cost policy on an independent holdout before operational adoption.',
    'Collect reference data for drift checks and split/feature provenance for leakage review.',
  ];
  const reliabilityChecks = investigation.comparisons.map(c => ({ comparisonId: c.id, repairId: c.repairId, datasetId: c.datasetId, criterion: c.criterion, recordedStatus: c.status, baselineEvidenceIds: c.baselineEvidenceIds, afterEvidenceIds: c.afterEvidenceIds }));
  return { reportVersion: 1, reliabilityProfile: buildReliabilityProfile(investigation), investigationId: investigation.id,
    modelIdentifier: { value: annotations.modelIdentifier, provenance: 'User-supplied report annotation; not independently verified.' },
    severity: { level: annotations.severity, rationale: annotations.severityRationale, provenance: 'User-declared operational assessment; not inferred from model metrics.' },
    observedFailure: { objective: investigation.objective, diagnosis: investigation.diagnosis?.summary ?? 'No final diagnosis recorded.' },
    rejectedHypothesisIds: investigation.hypotheses.filter(h => h.status === 'rejected').map(h => h.id),
    unresolvedHypothesisIds: investigation.hypotheses.filter(h => !['confirmed', 'rejected'].includes(h.status)).map(h => h.id),
    monitoringSuggestions: { status: 'Suggestions only; not configured or executed.', items: monitoringSuggestions },
    cicd: { status: 'Recorded checks only; no CI/CD integration or deployment gate was executed.', checks: reliabilityChecks,
      policy: deriveCiPolicy(investigation),
      policyStatus: investigation.comparisons.some(c => c.status === 'passed')
        ? 'Generated from measured passing comparisons as a no-regression gate at the measured values. It is a runnable policy document, not a deployed gate, and carries no tolerance margin.'
        : 'No passing before/after comparison is recorded, so no gate is generated.' },
    limitations: ['Missing model identifiers and severity remain explicit.', 'Confidence is evidence strength, not a probability.', 'Simulated impact under the supplied cost model.', 'A passed same-data comparison does not establish independent holdout reliability.'],
    investigation };
}
export type IncidentReport = ReturnType<typeof buildIncidentReport>;
const safe = (value: string) => value.replace(/[\\`*_{}\[\]<>#|]/g, character => '\\' + character).replace(/\r?\n/g, ' ');
const jsonBlock = (value: unknown) => { const json = JSON.stringify(value, null, 2); const runs = json.match(/`+/g) ?? []; const fence = '`'.repeat(Math.max(3, ...runs.map(s => s.length + 1))); return `${fence}json\n${json}\n${fence}`; };
export function incidentReportMarkdown(report: IncidentReport) {
  // Rebuild from canonical records and validated annotations rather than trusting derived fields.
  const r = buildIncidentReport(report.investigation, { modelIdentifier: report.modelIdentifier.value, severity: report.severity.level, severityRationale: report.severity.rationale });
  const v = r.investigation;
  return [
    '# WhyLab ML Incident Report',
    `Investigation: ${safe(v.id)}\n\nModel: ${safe(r.modelIdentifier.value)} (user annotation)\n\nStatus: ${v.status}`,
    '## Incident severity', `${r.severity.level}: ${safe(r.severity.rationale)}\n\n${r.severity.provenance}`,
    '## Observed failure', safe(v.objective), '## Dataset identifiers', jsonBlock(v.datasets),
    '## Evidence summary and measurements', jsonBlock(v.evidence),
    '## Hypotheses and confidence', jsonBlock(v.hypotheses),
    '## Rejected and unresolved hypotheses', jsonBlock({ rejected: r.rejectedHypothesisIds, unresolved: r.unresolvedHypothesisIds, questions: v.diagnosis?.unresolvedQuestions ?? [] }),
    '## Tests executed and measured results', jsonBlock({ calls: v.toolCalls, results: v.toolResults, verificationExperiments: v.experiments }),
    '## Diagnosis', v.diagnosis ? jsonBlock(v.diagnosis) : 'No final diagnosis recorded.',
    '## Remediation and threshold/cost policy', v.repairs.length ? jsonBlock(v.repairs) : 'No repair recorded.',
    '## Before/after verification', v.comparisons.length ? jsonBlock(v.comparisons) : 'No before/after verification recorded.',
    '## Monitoring suggestions', r.monitoringSuggestions.status, ...r.monitoringSuggestions.items.map(s => '- ' + s),
    '## CI/CD reliability checks', r.cicd.status, jsonBlock(r.cicd.checks),
    '## Generated CI reliability gate', r.cicd.policyStatus, r.cicd.policy ? jsonBlock(r.cicd.policy) : 'No gate generated.',
    '## Reliability profile', jsonBlock(r.reliabilityProfile),
    '## Limitations', ...r.limitations.map(s => '- ' + s),
    '## Complete canonical provenance snapshot', 'Includes sources, tool versions and inputs, evidence, experiments, repairs, comparisons and events.', jsonBlock(v),
  ].join('\n\n') + '\n';
}

/** A GitHub-issue body for the incident. Derived fields are rebuilt from the canonical record. */
export function incidentIssueMarkdown(report: IncidentReport) {
  const r = buildIncidentReport(report.investigation, { modelIdentifier: report.modelIdentifier.value, severity: report.severity.level, severityRationale: report.severity.rationale });
  const v = r.investigation;
  const experiments = v.experiments.filter(e => e.status === 'completed');
  const outcome = (name: string) => experiments.filter(e => e.outcome === name).length;
  return [
    `## ML reliability incident: ${safe(v.id)}`,
    `**Model:** ${safe(r.modelIdentifier.value)} (user annotation)`,
    `**Severity:** ${r.severity.level} — ${safe(r.severity.rationale)}`,
    `**Investigation status:** ${v.status}`,
    '### Observed failure', safe(v.objective),
    '### Diagnosis', safe(v.diagnosis?.summary ?? 'No final diagnosis recorded.'),
    '### Verification',
    `${experiments.length} completed experiment(s): ${outcome('supports')} supporting, ${outcome('weakens')} weakening, ${outcome('rejects')} rejecting, ${outcome('inconclusive')} inconclusive.`,
    '### Follow-up',
    ...['Re-evaluate the declared policy on an independent holdout before operational adoption.',
      'Add the generated reliability gate below to CI and widen its tolerance deliberately.',
      ...r.monitoringSuggestions.items].map(item => `- [ ] ${safe(item)}`),
    '### Generated CI reliability gate', r.cicd.policyStatus,
    r.cicd.policy ? jsonBlock(r.cicd.policy) : 'No gate generated.',
    '### Limitations', ...r.limitations.map(item => '- ' + safe(item)),
  ].join('\n\n') + '\n';
}
