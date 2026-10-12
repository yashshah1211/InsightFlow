import type { ObjectiveType, PriorityFactorsType } from '@/lib/contracts';
export const PRIORITY_VERSION = 'priority-v1';
export const WEIGHTS: Record<ObjectiveType, PriorityFactorsType> = {
  safety: { severity: .7, distinctPatternShare: .1, negativeShare: .1, evidenceCoverage: .1 },
  experience: { severity: .55, distinctPatternShare: .2, negativeShare: .15, evidenceCoverage: .1 },
  operations: { severity: .55, distinctPatternShare: .25, negativeShare: .1, evidenceCoverage: .1 },
};
export function computePriority(factors: PriorityFactorsType, objective: ObjectiveType) {
  const weights = WEIGHTS[objective];
  const score = Math.round(Object.entries(factors).reduce((sum, [key, value]) => sum + value * weights[key as keyof PriorityFactorsType], 0) * 10000) / 100;
  return { score, objective, factors, weights, methodologyVersion: PRIORITY_VERSION,
    rationale: 'Weighted severity, distinct-pattern share, negative-or-mixed share and evidence coverage. Repetition has zero direct weight; severity dominates.' };
}
