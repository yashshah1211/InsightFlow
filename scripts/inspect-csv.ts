import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { parseFeedbackCsv, groupRecords, hashReview } from '../src/lib/analysis/ingest';
import { summarize } from '../src/lib/analysis/summary';
import type { FeedbackRecordType } from '../src/lib/contracts';
const path = resolve(process.argv[2] ?? 'data/raw/customer_feedback.csv');
if (!existsSync(path)) {
  console.log(JSON.stringify({ status: 'pending', reason: 'Official CSV absent; no full-dataset assertion executed', path }, null, 2));
} else {
  const parsed = parseFeedbackCsv(readFileSync(path), { filename: 'customer_feedback.csv', contentType: 'text/csv' });
  const records: FeedbackRecordType[] = parsed.accepted.map((r, i) => ({ kind: 'record', id: `inspect-${i}`, batchId: 'local-inspection',
    ...r, normalizedHash: hashReview(r.rawText), source: 'official_csv', importedAt: new Date().toISOString(), observedAt: null, annotation: null }));
  const patterns = groupRecords(records);
  const summary = summarize(records, patterns);
  const top20RecordCount = patterns.sort((a, b) => b.occurrenceCount - a.occurrenceCount).slice(0, 20).reduce((n, p) => n + p.occurrenceCount, 0);
  console.log(JSON.stringify({ summary, top20RecordCount, rejectedRows: parsed.rejectedRows }, null, 2));
  assert.equal(parsed.rejectedRows.length, 0);
  assert.equal(summary.recordCount, 7000);
  assert.equal(summary.uniqueTextCount, 320);
  assert.equal(summary.repeatedRecordCount, 6680);
  assert.deepEqual(summary.categoryCounts, { 'Product Feedback': 1738, 'Customer Service': 1707, 'Fraud and Scam': 1755, 'Operational Issues': 1800 });
  assert.deepEqual(summary.categoryPatternCounts, { 'Product Feedback': 183, 'Customer Service': 66, 'Fraud and Scam': 35, 'Operational Issues': 36 });
  assert.equal(top20RecordCount, 5025);
  console.log('Official dataset assertions passed.');
}
