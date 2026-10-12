import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { summarize } from './summary';
import type { FeedbackRecordType, FeedbackPatternType } from '@/lib/contracts';
export const OFFICIAL_SOURCE = 'https://drive.google.com/file/d/1P3YOc8nJxLAkBVf9jx9uYRerniTipPAQ/view';
export const OFFICIAL_SHA256 = '82b09450e0e5144c4a21cb33a9556dab6afd7618228496e7f4c321f687250c41';
// Derived locally from the checksum-verified original: [logical row, verbatim text, category].
// This binds generated content/order too; copying sourceSha256 metadata cannot legitimize altered rows.
export const OFFICIAL_ROWS_SHA256 = '6416408f949678e72e3d9a530d311f11725171bb77e484595aa82b5168cf82e5';
export function officialRowsSha256(records: Pick<FeedbackRecordType, 'rowNumber' | 'rawText' | 'category'>[]) {
  return createHash('sha256').update(JSON.stringify(records.map(r => [r.rowNumber, r.rawText, r.category]))).digest('hex');
}
export function assertOfficial(records: FeedbackRecordType[], patterns: FeedbackPatternType[], rejected = 0) {
  const summary = summarize(records, patterns);
  assert.equal(rejected, 0);
  assert.equal(summary.recordCount, 7000);
  assert.equal(summary.uniqueTextCount, 320);
  assert.equal(summary.repeatedRecordCount, 6680);
  assert.deepEqual(summary.categoryCounts, { 'Product Feedback': 1738, 'Customer Service': 1707, 'Fraud and Scam': 1755, 'Operational Issues': 1800 });
  assert.deepEqual(summary.categoryPatternCounts, { 'Product Feedback': 183, 'Customer Service': 66, 'Fraud and Scam': 35, 'Operational Issues': 36 });
  assert.equal([...patterns].sort((a,b) => b.occurrenceCount - a.occurrenceCount).slice(0,20).reduce((n,p) => n+p.occurrenceCount,0), 5025);
  assert.ok(records.every(r => r.observedAt === null));
  return summary;
}
