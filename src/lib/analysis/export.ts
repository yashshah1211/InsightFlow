import type { SummaryType, MetaType } from '@/lib/contracts';
// Neutralize spreadsheet formula injection, then quote RFC4180 cells.
export function csvCell(value: string): string {
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function exportSummary(summary: SummaryType, meta: MetaType) {
  const rows = [
    ['metric', 'value', 'basis', 'source', 'limitation'],
    ['records', String(summary.recordCount), 'records', meta.provenance.label, 'Not independent customers'],
    ['distinct_texts', String(summary.uniqueTextCount), 'patterns', meta.provenance.label, 'Exact normalized text only'],
    ['repeated_rows', String(summary.repeatedRecordCount), 'records', meta.provenance.label, 'Raw rows retained'],
    ['annotation_coverage', String(summary.annotationCoverage.ratio ?? ''), 'patterns', 'heuristic-v2', 'Unreviewed rules; no AI confidence'],
    ['timestamp_coverage', String(summary.timestampCoverage.ratio ?? ''), 'records', meta.provenance.label, 'Import timestamps are not complaint dates'],
    ['unique_customers', '', 'unavailable', meta.provenance.label, summary.uniqueCustomers.reason],
    ['time_trends', '', 'unavailable', meta.provenance.label, summary.timeTrends.reason],
    ...Object.entries(summary.categoryCounts).map(([key, value]) => [`category:${key}`, String(value), 'records', meta.provenance.label, 'Source category; not inferred issue']),
    ...Object.entries(summary.sentimentCounts).map(([key, value]) => [`sentiment:${key}`, String(value), 'patterns', 'heuristic-v2', 'Includes unknown; mixed retains both aspects']),
    ...meta.limitations.map(limitation => ['limitation', '', '', meta.provenance.label, limitation]),
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
