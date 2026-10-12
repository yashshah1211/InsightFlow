import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { caseFold } from 'unicode-case-folding';
import { Category, ImportFileMetadata, MAX_CSV_BYTES, type FeedbackRecordType, type FeedbackPatternType } from '@/lib/contracts';

export class IngestError extends Error {
  constructor(public code: 'INVALID_CSV' | 'FILE_TOO_LARGE' | 'UNSUPPORTED_FILE', message: string) { super(message); }
}
// Unicode case folding uses the pinned Unicode data utility.
// Do not remove punctuation, accents, or negation, and do not merge by similarity.
export function normalizeReview(text: string): string {
  return caseFold(text.trim().replace(/\s+/gu, ' '));
}
export function hashReview(text: string): string { return createHash('sha256').update(normalizeReview(text), 'utf8').digest('hex'); }
export function emptyCategoryCounts() { return Object.fromEntries(Category.options.map(c => [c, 0])) as Record<typeof Category.options[number], number>; }

export function parseFeedbackCsv(bytes: Uint8Array, metadata: { filename: string; contentType: string }) {
  if (bytes.byteLength > MAX_CSV_BYTES) throw new IngestError('FILE_TOO_LARGE', 'CSV exceeds 5 MiB');
  if (!ImportFileMetadata.safeParse({ ...metadata, size: bytes.byteLength }).success) throw new IngestError('UNSUPPORTED_FILE', 'Provide a nonempty .csv file with an allowed content type');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new IngestError('INVALID_CSV', 'CSV must be valid UTF-8'); }
  if (text.includes('\0')) throw new IngestError('INVALID_CSV', 'NUL bytes are not allowed');
  let rows: string[][];
  try { rows = parse(text, { bom: true, relax_column_count: true, skip_empty_lines: false, max_record_size: 20000 }); }
  catch { throw new IngestError('INVALID_CSV', 'Malformed quoting or oversized CSV record'); }
  if (rows[0]?.length !== 2 || rows[0][0] !== 'review' || rows[0][1] !== 'category') throw new IngestError('INVALID_CSV', 'Expected exact header review,category');
  if (rows.length > 50001) throw new IngestError('INVALID_CSV', 'Maximum 50,000 source rows per import');
  const accepted: { rawText: string; category: typeof Category.options[number]; rowNumber: number }[] = [];
  const rejectedRows: { rowNumber: number; reason: string }[] = [];
  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2; // Logical CSV row, including header; quoted newlines do not increment it.
    const category = Category.safeParse(row[1]);
    const reason = row.length !== 2 ? 'Expected 2 columns' : !row[0]?.trim() ? 'Empty review' : row[0].length > 10000 ? 'Review exceeds 10,000 characters' : !category.success ? 'Unsupported category' : null;
    if (reason || !category.success) rejectedRows.push({ rowNumber, reason: reason ?? 'Unsupported category' });
    else accepted.push({ rawText: row[0], category: category.data, rowNumber });
  });
  if (!accepted.length) throw new IngestError('INVALID_CSV', 'CSV contains no valid feedback rows');
  return { accepted, rejectedRows, contentHash: createHash('sha256').update(bytes).digest('hex') };
}

export function groupRecords(records: FeedbackRecordType[]): FeedbackPatternType[] {
  const groups = new Map<string, FeedbackPatternType>();
  for (const record of records) {
    const key = `${record.batchId}:${record.normalizedHash}`;
    let group = groups.get(key);
    if (!group) {
      group = { kind: 'pattern', batchId: record.batchId, normalizedHash: record.normalizedHash,
        normalizedText: normalizeReview(record.rawText), exampleOriginalText: record.rawText,
        occurrenceCount: 0, categoryCounts: emptyCategoryCounts(), annotation: record.annotation };
      groups.set(key, group);
    }
    group.occurrenceCount++;
    group.categoryCounts[record.category]++;
  }
  return [...groups.values()];
}
