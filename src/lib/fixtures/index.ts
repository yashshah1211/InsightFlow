import { hashReview, groupRecords } from '@/lib/analysis/ingest';
import { annotateHeuristically } from '@/lib/analysis/heuristic';
import type { FeedbackRecordType } from '@/lib/contracts';
export const FIXTURE_BATCH_ID = 'fixture-batch-v1';
export const FIXTURE_IMPORTED_AT = '2026-01-01T00:00:00Z';
// Deliberately authored examples, not copied or reconstructed official dataset rows.
const rows = [
  ['Checkout crashed twice, please fix it.', 'Operational Issues'],
  [' checkout CRASHED twice, please fix it. ', 'Operational Issues'],
  ['The product is defective.', 'Product Feedback'],
  ['I was a victim of fraud.', 'Fraud and Scam'],
  ['I was not a victim of fraud.', 'Fraud and Scam'],
  ['No fraudulent activity detected.', 'Fraud and Scam'],
  ['Delivery was delayed but support was helpful.', 'Customer Service'],
  ['Support never responded.', 'Customer Service'],
  ['I love the excellent product.', 'Product Feedback'],
  ['The packaging is blue.', 'Product Feedback'],
] as const;
export function fixtureRecords(): FeedbackRecordType[] {
  return rows.map(([rawText, category], i) => ({ kind: 'record', id: `fixture-record-${i + 1}`, batchId: FIXTURE_BATCH_ID,
    rowNumber: i + 2, rawText, category, normalizedHash: hashReview(rawText), source: 'fixture',
    importedAt: FIXTURE_IMPORTED_AT, observedAt: null, annotation: annotateHeuristically(rawText) }));
}
export function fixturePatterns() { return groupRecords(fixtureRecords()); }
