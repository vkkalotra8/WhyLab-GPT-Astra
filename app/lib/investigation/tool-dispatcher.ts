import { diagnosticToolCallSchema, diagnosticToolResultSchema, type DiagnosticToolCall, type DiagnosticToolResult, toolNames } from './tool-contracts.ts';
import { createId, type Id } from './primitives.ts';
import type { Evidence, VerificationExperiment } from './types.ts';
import type { EvaluationDataset } from './evaluation-ingestion.ts';
import { executeDiagnostic } from './tool-registry.ts';

export interface DiagnosticExecutionReport {
  result: DiagnosticToolResult;
  evidence: Evidence[];
  experiments: VerificationExperiment[];
  details: unknown;
}

export interface DispatchedCallOutcome {
  callIndex: number;
  callId: string;
  toolName: string;
  diagnostic?: DiagnosticToolCall;
  report?: DiagnosticExecutionReport;
  feedback: unknown;
  errorOccurred: boolean;
  isCached: boolean;
  stoppedReason?: string;
}

export interface ToolDispatcherOptions {
  maxConcurrency?: number;
  toolTimeoutMs?: number;
  simulatedDelayMs?: number;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}

/** Detect if any call in the batch depends on a previous call in the same batch. */
export function detectDependencies(
  batch: readonly { call_id: string; name: string; arguments: string }[]
): Map<string, string[]> {
  const dependencies = new Map<string, string[]>();
  const seenCallIds = new Set<string>();

  for (const call of batch) {
    const deps: string[] = [];
    try {
      const rawArgs = call.arguments;
      for (const priorId of seenCallIds) {
        if (rawArgs.includes(priorId)) {
          deps.push(priorId);
        }
      }
    } catch {
      // Ignore argument parse errors here; validation catches them
    }
    dependencies.set(call.call_id, deps);
    seenCallIds.add(call.call_id);
  }

  return dependencies;
}

/** Executes a single diagnostic call asynchronously with timeout and cancellation safety. */
export async function executeDiagnosticAsync(
  diagnostic: DiagnosticToolCall,
  datasets: ReadonlyMap<string, EvaluationDataset>,
  options?: { signal?: AbortSignal; timeoutMs?: number; simulatedDelayMs?: number }
): Promise<DiagnosticExecutionReport> {
  const signal = options?.signal;
  if (signal?.aborted) {
    throw new Error('Execution cancelled');
  }

  // Support optional timeout per tool execution
  let timeoutTimer: NodeJS.Timeout | undefined;
  const timeoutPromise = options?.timeoutMs && options.timeoutMs > 0
    ? new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(() => {
          reject(new Error(`Tool execution timed out after ${options.timeoutMs}ms`));
        }, options.timeoutMs);
      })
    : null;

  // Support optional simulated async delay for concurrency benchmarking
  const delayPromise = options?.simulatedDelayMs && options.simulatedDelayMs > 0
    ? new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, options.simulatedDelayMs);
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error('Execution cancelled'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
      })
    : new Promise<void>(resolve => queueMicrotask(resolve));

  try {
    if (timeoutPromise) {
      await Promise.race([delayPromise, timeoutPromise]);
    } else {
      await delayPromise;
    }

    if (signal?.aborted) {
      throw new Error('Execution cancelled');
    }

    return executeDiagnostic(diagnostic, datasets);
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }
}

/**
 * Dispatches a batch of diagnostic calls concurrently with:
 * 1. Bounded concurrency (maxConcurrency)
 * 2. Dependency ordering (dependent tools wait for prerequisites)
 * 3. Isolated error handling (one failure does not crash siblings)
 * 4. Per-tool timeouts and cancellation propagation
 * 5. Deterministic output order matching declaration sequence
 */
export async function dispatchDiagnosticBatch(
  batch: readonly { call_id: string; name: string; arguments: string }[],
  context: {
    investigationId: Id<'investigation'>;
    datasets: ReadonlyMap<string, EvaluationDataset>;
    accuracyHypotheses: Set<string>;
    accuracyParadoxGap: number;
    cache: Map<string, unknown>;
    limits: { tools: number; errors: number; [key: string]: number };
    currentToolCount: number;
    activeSignal: AbortSignal;
    event: (kind: string, code: string, entityId?: string | null) => void;
  },
  options: ToolDispatcherOptions = {}
): Promise<DispatchedCallOutcome[]> {
  const maxConcurrency = Math.max(1, Math.min(options.maxConcurrency ?? 3, 5));
  const toolTimeoutMs = options.toolTimeoutMs ?? 15000;
  const simulatedDelayMs = options.simulatedDelayMs ?? 0;
  const dependencies = detectDependencies(batch);

  const outcomes: DispatchedCallOutcome[] = new Array(batch.length);
  const taskPromises = new Map<string, Promise<void>>();
  let toolsAdmitted = 0;

  // Concurrency limiter queue
  let activeWorkers = 0;
  const executionQueue: Array<() => Promise<void>> = [];

  const pumpQueue = () => {
    while (activeWorkers < maxConcurrency && executionQueue.length > 0) {
      const nextTask = executionQueue.shift();
      if (nextTask) {
        activeWorkers++;
        nextTask().finally(() => {
          activeWorkers--;
          pumpQueue();
        });
      }
    }
  };

  const scheduleInPool = (task: () => Promise<void>): Promise<void> => {
    return new Promise((resolve, reject) => {
      executionQueue.push(async () => {
        try {
          await task();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      pumpQueue();
    });
  };

  // Step 1: Pre-process and admit calls up to tool budget
  for (let i = 0; i < batch.length; i++) {
    const call = batch[i];
    const callId = call.call_id;
    const name = call.name;

    // Check tool budget limit
    if (context.currentToolCount + toolsAdmitted >= context.limits.tools) {
      outcomes[i] = {
        callIndex: i,
        callId,
        toolName: name,
        feedback: { error: 'tool_limit_exceeded', instruction: 'Budget reached.' },
        errorOccurred: true,
        isCached: false,
        stoppedReason: 'tool_limit'
      };
      continue;
    }

    toolsAdmitted++;

    // Prepare task execution promise
    const taskPromise = (async () => {
      // Check if this task depends on any earlier call
      const taskDeps = dependencies.get(callId) ?? [];
      if (taskDeps.length > 0) {
        // Wait for all prerequisites
        for (const depId of taskDeps) {
          const depPromise = taskPromises.get(depId);
          if (depPromise) {
            await depPromise;
          }
          // If prerequisite failed, fail this dependent task
          const depOutcome = outcomes.find(o => o && o.callId === depId);
          if (depOutcome?.errorOccurred) {
            outcomes[i] = {
              callIndex: i,
              callId,
              toolName: name,
              feedback: { error: 'dependency_failed', instruction: `Prerequisite call ${depId} failed.` },
              errorOccurred: true,
              isCached: false
            };
            return;
          }
        }
      }

      // Parse and validate arguments
      let args: unknown;
      try {
        args = JSON.parse(call.arguments);
      } catch {
        outcomes[i] = {
          callIndex: i,
          callId,
          toolName: name,
          feedback: { error: 'invalid_or_unsupported_operation', instruction: 'Malformed JSON arguments.' },
          errorOccurred: true,
          isCached: false
        };
        return;
      }

      if (!toolNames.includes(name as typeof toolNames[number])) {
        outcomes[i] = {
          callIndex: i,
          callId,
          toolName: name,
          feedback: { error: 'invalid_or_unsupported_operation', instruction: 'Unsupported tool.' },
          errorOccurred: true,
          isCached: false
        };
        return;
      }

      let diagnostic: DiagnosticToolCall;
      try {
        diagnostic = diagnosticToolCallSchema.parse({
          id: createId('call'),
          investigationId: context.investigationId,
          tool: name,
          toolVersion: 1,
          requestedAt: new Date().toISOString(),
          input: args
        });
      } catch {
        outcomes[i] = {
          callIndex: i,
          callId,
          toolName: name,
          feedback: { error: 'invalid_or_unsupported_operation', instruction: 'Invalid tool schema.' },
          errorOccurred: true,
          isCached: false
        };
        return;
      }

      const input = diagnostic.input;
      if (('columns' in input && input.columns.length > 10) || ('featureColumns' in input && input.featureColumns.length > 10)) {
        outcomes[i] = {
          callIndex: i,
          callId,
          toolName: name,
          feedback: { error: 'invalid_or_unsupported_operation', instruction: 'Excessive columns.' },
          errorOccurred: true,
          isCached: false
        };
        return;
      }

      if (diagnostic.tool === 'run_counterfactual_test' && (!context.accuracyHypotheses.has(diagnostic.input.hypothesisId) || diagnostic.input.criterion.value !== context.accuracyParadoxGap)) {
        outcomes[i] = {
          callIndex: i,
          callId,
          toolName: name,
          feedback: { error: 'invalid_or_unsupported_operation', instruction: 'Unknown hypothesis or changed criterion.' },
          errorOccurred: true,
          isCached: false
        };
        return;
      }

      // Check deduplication cache
      const keyInput = structuredClone(input) as Record<string, unknown>;
      for (const key of ['columns', 'featureColumns', 'thresholds', 'assumptionEvidenceIds']) {
        if (Array.isArray(keyInput[key])) {
          keyInput[key] = [...keyInput[key]].sort();
        }
      }
      if (diagnostic.tool === 'run_counterfactual_test') {
        delete keyInput.seed;
      }
      const cacheKey = name + ':' + canonical(keyInput);

      if (context.cache.has(cacheKey)) {
        outcomes[i] = {
          callIndex: i,
          callId,
          toolName: name,
          diagnostic,
          feedback: { cached: true, data: context.cache.get(cacheKey) },
          errorOccurred: true, // Counts toward duplicate budget in investigator
          isCached: true
        };
        return;
      }

      // Validate dataset scope and columns
      const scope = 'datasetId' in input ? [input.datasetId] : [input.referenceDatasetId, input.comparisonDatasetId];
      if (scope.some(id => !context.datasets.has(id))) {
        outcomes[i] = {
          callIndex: i,
          callId,
          toolName: name,
          feedback: { error: 'invalid_or_unsupported_operation', instruction: 'Unknown dataset.' },
          errorOccurred: true,
          isCached: false
        };
        return;
      }

      const columns = [
        ...('columns' in input ? input.columns : []),
        ...('featureColumns' in input ? input.featureColumns : []),
        ...('targetColumn' in input && input.targetColumn !== null ? [input.targetColumn] : []),
        ...('predictionTimeColumn' in input && input.predictionTimeColumn !== null ? [input.predictionTimeColumn] : []),
        ...('outcomeTimeColumn' in input && input.outcomeTimeColumn !== null ? [input.outcomeTimeColumn] : [])
      ];

      if (
        scope.some(id => columns.some(c => !context.datasets.get(id)!.metadata.columns.includes(c))) ||
        ('positiveLabel' in input && context.datasets.get(scope[0])!.labels.positive !== input.positiveLabel) ||
        ('costs' in input && input.costs !== null) ||
        ('assumptionEvidenceIds' in input && input.assumptionEvidenceIds.length)
      ) {
        outcomes[i] = {
          callIndex: i,
          callId,
          toolName: name,
          feedback: { error: 'invalid_or_unsupported_operation', instruction: 'Unregistered column, class mapping or assumption.' },
          errorOccurred: true,
          isCached: false
        };
        return;
      }

      // Schedule execution inside the bounded concurrency worker pool
      await scheduleInPool(async () => {
        if (context.activeSignal.aborted) {
          outcomes[i] = {
            callIndex: i,
            callId,
            toolName: name,
            feedback: { error: 'cancelled' },
            errorOccurred: true,
            isCached: false,
            stoppedReason: 'cancelled'
          };
          return;
        }

        let report: DiagnosticExecutionReport;
        let isError = false;

        try {
          report = await executeDiagnosticAsync(diagnostic, context.datasets, {
            signal: context.activeSignal,
            timeoutMs: toolTimeoutMs,
            simulatedDelayMs
          });
          context.cache.set(cacheKey, report);
        } catch (err: unknown) {
          isError = true;
          const isTimeout = err instanceof Error && err.message.includes('timed out');
          const datasetIds = 'datasetId' in input ? [input.datasetId] : [input.referenceDatasetId, input.comparisonDatasetId];
          const result = diagnosticToolResultSchema.parse({
            id: createId('result'),
            callId: diagnostic.id,
            tool: diagnostic.tool,
            toolVersion: 1,
            completedAt: new Date().toISOString(),
            datasetIds,
            evidenceIds: [],
            limitations: [],
            status: 'error',
            error: {
              code: isTimeout ? 'timeout' : 'execution_rejected',
              message: isTimeout
                ? `Diagnostic execution timed out after ${toolTimeoutMs}ms.`
                : 'The requested diagnostic is unsupported for this input or exceeded its constraints.',
              retryable: false
            }
          });
          report = { result, evidence: [], experiments: [], details: null };
        }

        outcomes[i] = {
          callIndex: i,
          callId,
          toolName: name,
          diagnostic,
          report,
          feedback: report,
          errorOccurred: isError,
          isCached: false
        };
      });
    })();

    taskPromises.set(callId, taskPromise);
  }

  // Await all scheduled tasks to complete
  await Promise.all(taskPromises.values());

  return outcomes;
}
