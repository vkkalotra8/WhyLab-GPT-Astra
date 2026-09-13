import type { DiagnosticToolCall, ToolInput, ToolOutput } from '../app/lib/investigation/tool-contracts.ts';
import type { Id } from '../app/lib/investigation/primitives.ts';
// Compile-time assertions; this module has no runtime entry point.
export function contractTypeChecks(call: DiagnosticToolCall, dataset: Id<'dataset'>) {
    const input: ToolInput<'check_calibration'> = { datasetId: dataset, positiveLabel: 'yes', bins: 10, strategy: 'equal_width' };
    // @ts-expect-error A dataset ID cannot identify an investigation.
    const wrongId: Id<'investigation'> = dataset;
    // @ts-expect-error Calibration input cannot omit its bin configuration.
    const missing: ToolInput<'check_calibration'> = { datasetId: dataset, positiveLabel: 'yes' };
    // @ts-expect-error Classification output is not arbitrary text.
    const output: ToolOutput<'compute_classification_metrics'> = 'accuracy is high';
    if (call.tool === 'threshold_sweep') {
        const thresholds: number[] = call.input.thresholds;
        // @ts-expect-error Discriminated tool input must not expose calibration fields.
        const bins = call.input.bins;
        return [thresholds, bins];
    }
    return [input, wrongId, missing, output];
}
