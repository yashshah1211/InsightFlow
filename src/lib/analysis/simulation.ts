import type { IssueType, PriorityFactorsType } from '@/lib/contracts';

// Hypothetical sensitivity only. Uses API factors; never changes stored/server priorities.
export function simulatePriorities(issues: IssueType[], severity: number, pattern: number) {
  const weights: PriorityFactorsType = { severity, distinctPatternShare: pattern, negativeShare: 15, evidenceCoverage: 15 };
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  for (const key of Object.keys(weights) as (keyof PriorityFactorsType)[]) weights[key] /= total;
  return issues.map(issue => ({ id: issue.id, title: issue.title, serverScore: issue.priority.score,
    score: Math.round(Object.entries(weights).reduce((sum, [key, value]) => sum + value * issue.priority.factors[key as keyof PriorityFactorsType], 0) * 10000) / 100,
    weights })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
