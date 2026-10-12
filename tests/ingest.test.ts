import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseFeedbackCsv, normalizeReview, hashReview, groupRecords } from '@/lib/analysis/ingest';
import { MAX_CSV_BYTES } from '@/lib/contracts';
import { fixtureRecords } from '@/lib/fixtures';
const parse = (text: string, filename = 'sample.csv', contentType = 'text/csv') => parseFeedbackCsv(Buffer.from(text), { filename, contentType });
describe('secure CSV ingest', () => {
  it('handles BOM, quoted commas, escaped quotes and multiline records without changing raw text', () => {
    const result = parse('\ufeffreview,category\r\n"Great, ""really""\nhelpful",Customer Service\r\n');
    expect(result.accepted[0]).toEqual({ rawText: 'Great, "really"\nhelpful', category: 'Customer Service', rowNumber: 2 });
  });
  it('reports invalid semantic rows while retaining logical order', () => {
    const result = parse('review,category\na,Product Feedback\n,Customer Service\nx,unknown\nx,Product Feedback,extra\nb,Operational Issues');
    expect(result.accepted.map(r => r.rowNumber)).toEqual([2, 6]);
    expect(result.rejectedRows.map(r => r.rowNumber)).toEqual([3, 4, 5]);
  });
  it.each(['review,category\n', 'review,category\n,Product Feedback', 'text,category\na,Product Feedback', 'review,category\n"unterminated,Product Feedback', 'review,category\na\0,Product Feedback'])('rejects unusable CSV %s', text => expect(() => parse(text)).toThrow());
  it('rejects bad UTF-8, extension, MIME, and oversize bytes', () => {
    expect(() => parseFeedbackCsv(new Uint8Array([0xff]), { filename: 'x.csv', contentType: 'text/csv' })).toThrow(/UTF-8/);
    expect(() => parse('review,category\na,Product Feedback', 'x.exe')).toThrow();
    expect(() => parse('review,category\na,Product Feedback', 'x.csv', 'text/html')).toThrow();
    expect(() => parseFeedbackCsv(new Uint8Array(MAX_CSV_BYTES + 1), { filename: 'x.csv', contentType: 'text/csv' })).toThrow(/5 MiB/);
  });
  it('rejects >10000-character review with row report when another valid row exists', () => {
    expect(parse(`review,category\n${'x'.repeat(10001)},Product Feedback\ny,Product Feedback`).rejectedRows[0].reason).toMatch(/10,000/);
  });
  it('keeps content hash stable for retry detection', () => {
    expect(parse('review,category\na,Product Feedback').contentHash).toBe(parse('review,category\na,Product Feedback').contentHash);
  });
  it('fixture CSV matches authored repository rows', () => {
    const parsed = parse(readFileSync('src/lib/fixtures/feedback.csv', 'utf8'));
    expect(parsed.accepted.map(r => r.rawText)).toEqual(fixtureRecords().map(r => r.rawText));
  });
});
describe('exact grouping', () => {
  it('normalizes whitespace/case without removing negation or punctuation', () => {
    expect(normalizeReview('  GREAT\n product  ')).toBe('great product');
    expect(hashReview('Straße')).toBe(hashReview('STRASSE'));
    expect(hashReview('ﬃ')).toBe(hashReview('FFI'));
    expect(hashReview('I was not a victim of fraud')).not.toBe(hashReview('I was a victim of fraud'));
  });
  it('retains repeated raw rows and scopes groups to batch', () => {
    const records = fixtureRecords();
    const patterns = groupRecords(records);
    expect(records).toHaveLength(10);
    expect(patterns).toHaveLength(9);
    expect(patterns[0].occurrenceCount).toBe(2);
    expect(groupRecords([...records, { ...records[0], batchId: 'other' }])).toHaveLength(10);
  });
  it('retains conflicting category membership in a single exact group', () => {
    const r = fixtureRecords()[0];
    const p = groupRecords([r, { ...r, id: 'conflict', category: 'Customer Service' }])[0];
    expect(p.categoryCounts['Customer Service']).toBe(1);
    expect(p.categoryCounts['Operational Issues']).toBe(1);
  });
});
