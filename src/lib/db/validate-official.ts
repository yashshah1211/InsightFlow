import { OfficialArtifact } from './artifact-schema';
import { groupRecords, hashReview } from '@/lib/analysis/ingest';
import { assertOfficial, OFFICIAL_SHA256, OFFICIAL_SOURCE, OFFICIAL_ROWS_SHA256, officialRowsSha256 } from '@/lib/analysis/official';
import { validateAnnotationEvidence } from '@/lib/analysis/heuristic';

// Shared by build, package verification and the server. A parse alone is insufficient.
export function validateOfficialArtifact(input: unknown) {
  const artifact = OfficialArtifact.parse(input);
  if (officialRowsSha256(artifact.records) !== OFFICIAL_ROWS_SHA256) throw new Error('Official rows differ from the original source fingerprint');
  if (artifact.sourceSha256 !== OFFICIAL_SHA256 || artifact.sourceUrl !== OFFICIAL_SOURCE ||
    artifact.meta.provenance.source !== 'official_csv' || artifact.meta.mode !== 'database' ||
    artifact.records.some(r => r.batchId !== artifact.meta.batchId || r.source !== 'official_csv' ||
      r.normalizedHash !== hashReview(r.rawText) || (r.annotation && !validateAnnotationEvidence(r.rawText, r.annotation)))) {
    throw new Error('Official artifact validation failed');
  }
  const patterns = groupRecords(artifact.records);
  const summary = assertOfficial(artifact.records, patterns);
  return { artifact, patterns, summary };
}
