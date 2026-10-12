import { expect, it } from 'vitest';
import { annotateHeuristically, validateAnnotationEvidence } from '@/lib/analysis/heuristic';
import { buildIssues } from '@/lib/analysis/issues';
import { computePriority } from '@/lib/analysis/priority';
import { coverage, summarize } from '@/lib/analysis/summary';
import { groupRecords } from '@/lib/analysis/ingest';
import { fixtureRecords, fixturePatterns } from '@/lib/fixtures';
it.each(['I was not a victim of fraud.', 'No fraudulent activity detected.', 'I was never a victim of fraud.', 'Fraudulent activity was not detected.'])('does not accuse fraud for %s', text => {
  const a = annotateHeuristically(text);
  expect(a.issueTypes).not.toContain('suspected_fraud');
  expect(a.sentiment).not.toBe('negative');
});
it('recognizes positive fraud evidence, denied allegations and mixed aspects separately', () => {
  const text = 'I was not a victim of fraud but the product is defective.';
  const a = annotateHeuristically(text);
  expect(a.issueTypes).toEqual(['defective_product']);
  const mixed = annotateHeuristically('Delivery was delayed but support was helpful.');
  expect(mixed.sentiment).toBe('mixed');
  expect(mixed.aspects.map(a => a.sentiment)).toEqual(['negative', 'positive']);
  expect(annotateHeuristically('I was a victim of fraud.').issueTypes).toContain('suspected_fraud');
});
it('unknown language and negated praise do not become positive', () => {
  expect(annotateHeuristically('Not excellent.').sentiment).toBe('unknown');
  expect(annotateHeuristically('The packaging is blue.').confidence).toBeNull();
});
it.each([
  'The ticket kiosk had technical issues during our rehearsal, but the technician kept me informed.',
  'Delivery was delayed for the workshop trays, but the tracking notes were excellent.',
  'Our display stand is defective, but I love the spare-part guide.',
])('preserves positive and negative aspects in authored conjunction samples: %s',text=>{
  const a=annotateHeuristically(text);
  expect(a.sentiment).toBe('mixed');
  expect(validateAnnotationEvidence(text,a)).toBe(true);
});
it('every fixture evidence quote occurs in original text; invented evidence rejected', () => {
  for (const record of fixtureRecords()) expect(validateAnnotationEvidence(record.rawText, record.annotation!)).toBe(true);
  expect(validateAnnotationEvidence('original', { ...annotateHeuristically('original'), evidenceQuote: 'fabricated' })).toBe(false);
});
it('retains no dates and exposes coverage denominators and unavailable metrics', () => {
  const summary = summarize(fixtureRecords(), fixturePatterns());
  expect(summary.timestampCoverage).toEqual({ covered: 0, total: 10, ratio: 0, basis: 'records' });
  expect(summary.annotationCoverage).toEqual({ covered: 8, total: 9, ratio: 8 / 9, basis: 'patterns' });
  expect(summary.uniqueCustomers.value).toBeNull();
  expect(summary.timeTrends.status).toBe('unavailable');
  expect(coverage(0, 0, 'patterns').ratio).toBeNull();
  expect(Object.values(summary.sentimentCounts).reduce((a, b) => a + b, 0)).toBe(9);
});
it.each(['safety', 'experience', 'operations'] as const)('ranks deterministically for %s, without repetition boosting', objective => {
  const patterns = fixturePatterns();
  const before = buildIssues(patterns, objective);
  const records = fixtureRecords();
  const repeated = groupRecords([...records, ...Array.from({ length: 1000 }, (_, i) => ({ ...records[0], id: `copy-${i}` }))]);
  expect(buildIssues(repeated, objective)).toEqual(before);
  expect(buildIssues([...patterns].reverse(), objective)).toEqual(before);
  expect(before[0].id).toBe('suspected_fraud');
});
it('a low-severity issue with maximal prevalence cannot outrank critical evidence by repetition', () => {
  const severe = computePriority({ severity: 1, distinctPatternShare: .01, negativeShare: 1, evidenceCoverage: 1 }, 'experience');
  const low = computePriority({ severity: .25, distinctPatternShare: 1, negativeShare: 1, evidenceCoverage: 1 }, 'experience');
  expect(severe.score).toBeGreaterThan(low.score);
});
