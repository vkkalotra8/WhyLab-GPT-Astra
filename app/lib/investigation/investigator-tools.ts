/** Provider-facing strict schemas. Runtime contracts remain the execution authority. */
type JsonSchema = Record<string, unknown>;
const string: JsonSchema = { type: 'string', minLength: 1, maxLength: 4000 };
const nullable = (s: JsonSchema): JsonSchema => ({ anyOf: [s, { type: 'null' }] });
const list = (s: JsonSchema, maxItems = 20, minItems = 0): JsonSchema => ({ type: 'array', items: s, minItems, maxItems });
const choice = (...values: string[]): JsonSchema => ({ type: 'string', enum: values });
const number = (minimum: number, maximum: number, integer = false): JsonSchema => ({ type: integer ? 'integer' : 'number', minimum, maximum });
const object = (properties: Record<string, JsonSchema>): JsonSchema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const evaluation = { datasetId: string, positiveLabel: string };
const columns = list(string, 10, 1);
const criterion = object({ metric: choice('accuracy_paradox_gap'), operator: choice('at_least'), value: number(0.001, 100), unit: choice('percentage_points') });
const definitions = {
  profile_dataset: [object({ datasetId: string, targetColumn: nullable(string) }), 'Inspect missingness, feature types, class counts and available metadata before choosing diagnostics.'],
  compute_classification_metrics: [object(evaluation), 'Compute confusion matrix and classification rates from supplied predictions.'],
  threshold_sweep: [object({ ...evaluation, thresholds: list(number(0, 1), 51, 1), costs: { type: 'null' } }), 'Evaluate up to 51 thresholds. Cost policies are unavailable in this loop; pass null.'],
  check_calibration: [object({ ...evaluation, bins: number(2, 20, true), strategy: choice('equal_width', 'equal_frequency') }), 'Compute Brier score and calibration bins; descriptive only.'],
  scan_feature_leakage: [object({ datasetId: string, targetColumn: string, featureColumns: columns, predictionTimeColumn: nullable(string), outcomeTimeColumn: nullable(string), assumptionEvidenceIds: list(string, 0) }), 'Screen potential leakage; cannot confirm causal leakage. No user assumptions are registered in this loop.'],
  run_drift_tests: [object({ referenceDatasetId: string, comparisonDatasetId: string, columns, method: choice('ks', 'psi', 'wasserstein'), bins: nullable(number(2, 20, true)) }), 'Compare two distinct registered datasets. Select compatible features and one named method; PSI needs bins.'],
  slice_evaluation: [object({ ...evaluation, columns, minimumSampleSize: number(1, 1000000, true) }), 'Evaluate group/site/environment/device/timestamp slices, preserving limitations.'],
  run_counterfactual_test: [object({ ...evaluation, hypothesisId: string, method: choice('accuracy_paradox'), seed: number(0, 4294967295, true), criterion }), 'Falsify a registered accuracy-paradox hypothesis. Use the caller-declared criterion exactly; seed is retained but exact weighting is deterministic.'],
  propose_hypothesis: [object({ kind: choice('accuracy_paradox', 'other'), statement: string, evidenceIds: list(string, 20, 1), missingEvidence: list(string, 10) }), 'Register a proposed hypothesis grounded in existing evidence. The application assigns its ID. Proposals are not confirmed facts.'],
  finish_investigation: [object({ reason: choice('sufficient_evidence', 'insufficient_evidence'), evidenceIds: list(string, 20, 1), missingEvidence: list(string, 10) }), 'Explicitly stop after diagnostics. Cite only registered evidence IDs. Final diagnosis is a separate stage.'],
} satisfies Record<string, [JsonSchema, string]>;
export const investigatorTools = Object.entries(definitions).map(([name, [parameters, description]]) => ({ type: 'function' as const, name, description, parameters, strict: true }));
