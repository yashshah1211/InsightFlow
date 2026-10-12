import { Sentiment, type FeedbackRecordType, type FeedbackPatternType, type SummaryType } from '@/lib/contracts';
import { emptyCategoryCounts } from './ingest';
export function coverage(covered: number, total: number, basis: 'records' | 'patterns') { return { covered, total, ratio: total ? covered / total : null, basis }; }
export function summarize(records: FeedbackRecordType[], patterns: FeedbackPatternType[]): SummaryType {
  const categoryCounts = emptyCategoryCounts();
  const categoryPatternCounts = emptyCategoryCounts();
  const sentimentCounts = Object.fromEntries(Sentiment.options.map(s => [s, 0])) as SummaryType['sentimentCounts'];
  for (const record of records) categoryCounts[record.category]++;
  for (const pattern of patterns) {
    for (const category of Object.keys(categoryCounts) as (keyof typeof categoryCounts)[]) if (pattern.categoryCounts[category]) categoryPatternCounts[category]++;
    sentimentCounts[pattern.annotation?.sentiment ?? 'unknown']++;
  }
  return { recordCount: records.length, uniqueTextCount: patterns.length, repeatedRecordCount: records.length - patterns.length,
    categoryCounts, categoryPatternCounts, sentimentCounts, sentimentBasis: 'patterns',
    annotationCoverage: coverage(patterns.filter(p => p.annotation && p.annotation.sentiment !== 'unknown').length, patterns.length, 'patterns'),
    timestampCoverage: coverage(records.filter(r => r.observedAt !== null).length, records.length, 'records'),
    uniqueCustomers: { status: 'unavailable', value: null, reason: 'Source has no customer identifiers' },
    timeTrends: { status: 'unavailable', value: null, reason: records.some(r => r.observedAt !== null) ? 'Time-series computation is not implemented; legitimate dates remain available on records' : 'This batch has no source complaint dates' } };
}
