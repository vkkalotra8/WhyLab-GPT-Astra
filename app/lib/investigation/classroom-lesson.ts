import { validateInvestigation } from './validation.ts';
import type { Investigation } from './types.ts';
export function buildClassroomLesson(value: Investigation) {
  const v = validateInvestigation(value);
  const exercises = v.toolResults.flatMap(r => {
    if (r.status !== 'completed' || r.tool !== 'compute_classification_metrics') return [];
    return r.output.metrics.filter(m => ['accuracy', 'balanced_accuracy'].includes(m.name) && m.status === 'measured').map(m => ({
      id: `${r.id}:${m.name}`, metric: m.name, question: `Report ${m.name.replaceAll('_', ' ')} as a percentage for ${r.datasetIds.join(', ')}.`,
      expectedPercent: m.status === 'measured' ? m.value * 100 : 0, resultId: r.id, callId: r.callId, evidenceIds: [...r.evidenceIds], datasetIds: [...r.datasetIds],
      explanation: m.name === 'accuracy' ? 'Accuracy is correct predictions divided by all evaluated rows.' : 'Binary balanced accuracy is the mean of positive recall and negative recall; it weights classes equally.',
    }));
  });
  return { lessonVersion: 1, investigationId: v.id, exercises,
    interpretation: { question: 'What do these descriptive measurements establish?', options: ['The training cause is proven.', 'Observed performance on the supplied data; causal explanations still need appropriate tests.', 'The model is safe in every future environment.'], correctIndex: 1, explanation: 'A measured diagnostic describes its evidence scope. A causal explanation, safety claim or generalization claim requires further evidence.' },
    reflection: 'Propose one verification experiment: name the hypothesis, data needed, factor to change, factors to hold fixed, acceptance criterion, and an outcome that would weaken your hypothesis.',
    limitations: ['Educational feedback, not a certified assessment.', 'No grades, names or classroom accounts are stored or sent to a server.', 'Numerical answers allow 0.05 percentage points for rounding; undefined metrics do not become exercises.'],
  };
}
export function gradePercentage(answer: string, expectedPercent: number) {
  if (!answer.trim() || !Number.isFinite(Number(answer)) || Number(answer) < 0 || Number(answer) > 100) return { status: 'invalid', feedback: 'Enter a finite percentage from 0 to 100, without the percent sign.' };
  const correct = Math.abs(Number(answer) - expectedPercent) <= .05 + Number.EPSILON * 100;
  return { status: correct ? 'correct' : 'retry', feedback: correct ? 'Correct within the stated rounding tolerance.' : 'Review the measured evidence and formula, then try again.' };
}
