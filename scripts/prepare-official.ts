import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseFeedbackCsv, groupRecords, hashReview } from '../src/lib/analysis/ingest';
import { annotateHeuristically } from '../src/lib/analysis/heuristic';
import { assertOfficial, OFFICIAL_SOURCE, OFFICIAL_SHA256 } from '../src/lib/analysis/official';
import { OfficialArtifact } from '../src/lib/db/artifact-schema';
const bytes = readFileSync('data/raw/customer_feedback.csv');
const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
if (sourceSha256 !== OFFICIAL_SHA256) throw new Error('Original file checksum differs; verify source before publishing');
const parsed = parseFeedbackCsv(bytes, { filename: 'customer_feedback.csv', contentType: 'text/csv' });
// Fixed source-file timestamp, not a complaint date. Generation time recorded separately.
const importedAt = '2026-10-10T15:26:30.572Z';
const batchId = 'official-' + sourceSha256.slice(0,16);
const records = parsed.accepted.map((r, i) => ({ kind: 'record' as const, id: batchId + '-' + (i+1), batchId, ...r,
  normalizedHash: hashReview(r.rawText), source: 'official_csv' as const, importedAt, observedAt: null, annotation: annotateHeuristically(r.rawText) }));
const summary = assertOfficial(records, groupRecords(records), parsed.rejectedRows.length);
const artifact = OfficialArtifact.parse({ artifactVersion: 1, sourceUrl: OFFICIAL_SOURCE, sourceSha256, generatedAt: new Date().toISOString(), records,
  meta: { contractVersion: '1.0.0', mode: 'database', batchId, dataSourceStatus: 'ready', analysisStatus: 'partial',
    provenance: { source: 'official_csv', label: 'Official competition CSV; read-only generated server artifact (not Supabase)', methodologyVersion: 'heuristic-v2' },
    limitations: ['7,000 source rows represent 320 repeated text patterns, not independent customers.',
      'No complaint dates/customer IDs; importedAt is source-file metadata, never customer event time.',
      'Narrow unreviewed heuristic analysis; unsupported cases remain unknown; confidence is null.',
      'No Adaption jobs or evaluations performed. Official artifact is separate from private authenticated workspaces.'] } });
mkdirSync('data/processed', { recursive: true });
writeFileSync('data/processed/official.json', JSON.stringify(artifact));
console.log(JSON.stringify({ status: 'passed', sourceSha256, batchId, artifactBytes: Buffer.byteLength(JSON.stringify(artifact)), summary }, null, 2));
