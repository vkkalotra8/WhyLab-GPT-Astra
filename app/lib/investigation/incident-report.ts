import { buildReliabilityProfile } from './reliability-profile.ts';
﻿import { validateInvestigation } from './validation.ts';
import type { Investigation } from './types.ts';
import { enumeration, object, text } from './schema.ts';

export const reportContextSchema = object({ modelIdentifier: text, severity: enumeration(['unassessed', 'low', 'moderate', 'high', 'critical']), severityRationale: text });
export const defaultReportContext = { modelIdentifier: 'Not supplied', severity: 'unassessed' as const, severityRationale: 'Operational impact has not been assessed.' };

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
    cicd: { status: 'Recorded checks only; no CI/CD integration or deployment gate was executed.', checks: reliabilityChecks },
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
    '## Reliability profile', jsonBlock(r.reliabilityProfile),
    '## Limitations', ...r.limitations.map(s => '- ' + s),
    '## Complete canonical provenance snapshot', 'Includes sources, tool versions and inputs, evidence, experiments, repairs, comparisons and events.', jsonBlock(v),
  ].join('\n\n') + '\n';
}
