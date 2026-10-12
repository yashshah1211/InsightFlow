import { expect, it } from 'vitest';
import { annotateHeuristically } from '@/lib/analysis/heuristic';
import { hashReview } from '@/lib/analysis/ingest';
import { approvedTrainingRows, candidateSha256, compareTrainingCandidates } from '@/lib/analysis/training-curation';
const text = 'Delivery was delayed but support was helpful.';
const hash = hashReview(text);
// Authored test candidate: never stored or represented as a real provider run.
const candidate = { normalizedHash: hash, annotation: { ...annotateHeuristically(text), analyzedBy: 'adaption' as const, pipelineVersion: 'test-only' } };
const sources = [{ normalized_hash: hash, review: text }];
it('blank gold yields unavailable accuracy and no automatic training approvals', () => {
  const result = compareTrainingCandidates([candidate], sources, [{ review_status: 'unreviewed' }]);
  expect(result.pairedDenominator).toBe(0);
  expect(result.candidate.accuracy.sentiment).toBeNull();
  expect(approvedTrainingRows([candidate], sources, [])).toEqual([]);
});
it('compares candidates and baseline on the same independently reviewed pattern set', () => {
  const gold = { normalized_hash: hash, review: text, gold_sentiment: 'mixed', gold_severity: candidate.annotation.severity,
    gold_issue_types: JSON.stringify(candidate.annotation.issueTypes), review_status: 'verified' };
  const result = compareTrainingCandidates([candidate], sources, [gold]);
  expect(result.pairedDenominator).toBe(1);
  expect(result.candidate.correct).toEqual({ sentiment: 1, severity: 1, topics: 1 });
  expect(result.candidate.accuracy).toEqual(result.heuristicBaseline.accuracy);
  expect(() => compareTrainingCandidates([candidate], sources, [gold, gold])).toThrow('Duplicate');
  expect(() => compareTrainingCandidates([candidate], sources, [{ ...gold, review: 'changed' }])).toThrow('exact source');
});
it('training export requires specific human approval bound to immutable completion bytes', () => {
  const approval = { normalizedHash: hash, candidateSha256: candidateSha256(candidate.annotation), reviewer: 'test-reviewer', reviewedAt: '2026-10-11T00:00:00Z', status: 'verified' };
  expect(approvedTrainingRows([candidate], sources, [approval])[0].context).toBe(text);
  expect(() => approvedTrainingRows([candidate], sources, [{ ...approval, status: 'unreviewed' }])).toThrow();
  expect(() => approvedTrainingRows([candidate], sources, [{ ...approval, candidateSha256: 'a'.repeat(64) }])).toThrow('stale');
});
