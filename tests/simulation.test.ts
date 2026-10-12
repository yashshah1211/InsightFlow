import { expect, it } from 'vitest';
import { buildIssues } from '@/lib/analysis/issues';
import { fixturePatterns } from '@/lib/fixtures';
import { simulatePriorities } from '@/lib/analysis/simulation';

it('sensitivity changes hypothetical scores using API factors without mutating server priorities', () => {
  const issues = buildIssues(fixturePatterns());
  const original = structuredClone(issues);
  const baseline = simulatePriorities(issues, 40, 30);
  const changed = simulatePriorities(issues, 10, 70);
  expect(changed.map(result => [result.id, result.score])).not.toEqual(baseline.map(result => [result.id, result.score]));
  expect(issues).toEqual(original);
  for (const result of changed) {
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(Object.values(result.weights).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
    expect(result.serverScore).toBe(issues.find(issue => issue.id === result.id)!.priority.score);
  }
});

it('hypothetical rankings are deterministic regardless of input ordering and empty-safe', () => {
  const issues = buildIssues(fixturePatterns());
  expect(simulatePriorities([...issues].reverse(), 70, 10)).toEqual(simulatePriorities(issues, 70, 10));
  expect(simulatePriorities([], 40, 30)).toEqual([]);
});
