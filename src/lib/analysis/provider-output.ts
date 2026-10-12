import { z } from 'zod';
import { Annotation, Hash } from '@/lib/contracts';
import type { AdaptedRow } from './artifact-validation';

export const ADAPTION_MAPPER_VERSION = 'insightflow-adaption-import-v1';
// These are the actual five fields inspected in the real Phase 6D JSONL export.
// A changed export requires a reviewed mapper, rather than guessed columns.
const ProviderRow = z.strictObject({ enhanced_prompt: z.string().nullable(), enhanced_completion: z.string(),
  normalized_hash: Hash, original_context: z.string(), review: z.string().min(1) });
const CandidateAnnotation = z.strictObject(Annotation.shape);
type Source = { normalized_hash: string; review: string };

export function mapProviderOutput(input: unknown[], sources: Source[]) {
  const originals = new Map(sources.map(row => [row.normalized_hash, row.review]));
  const seen = new Set<string>();
  const rows: z.infer<typeof AdaptedRow>[] = [];
  const rejected: { index: number; reason: string }[] = [];
  let fencedJsonRows = 0, correctedOriginRows = 0, ignoredGeneratedPipelineRows = 0, untrustedReviewClaims = 0;
  input.forEach((value, index) => {
    try {
      const source = ProviderRow.parse(value);
      if (originals.get(source.normalized_hash) !== source.review || seen.has(source.normalized_hash)) {
        throw new Error('Source/hash correspondence changed or duplicated');
      }
      let completion = source.enhanced_completion.trim();
      if (completion.startsWith('```')) {
        // Only one whole JSON fence is accepted; no prose, partial extraction or repairs.
        const fence = /^```json\s*\r?\n([\s\S]*)\r?\n```$/.exec(completion);
        if (!fence) throw new Error('Unsupported completion wrapper');
        completion = fence[1]; fencedJsonRows++;
      }
      const candidate = CandidateAnnotation.parse(JSON.parse(completion));
      if (candidate.confidence !== null) throw new Error('Generated confidence is unsupported');
      correctedOriginRows += Number(candidate.analyzedBy !== 'adaption');
      ignoredGeneratedPipelineRows += Number(candidate.pipelineVersion !== ADAPTION_MAPPER_VERSION);
      untrustedReviewClaims += Number(candidate.reviewStatus !== 'unreviewed');
      // Set provenance from the verified download and mapper. Generated origin,
      // version and review-state strings cannot attest to their own provenance.
      // Classification, explanations and evidence remain exactly as returned.
      rows.push({ normalizedHash: source.normalized_hash, annotation: { ...candidate,
        analyzedBy: 'adaption', pipelineVersion: ADAPTION_MAPPER_VERSION, reviewStatus: 'unreviewed' } });
      seen.add(source.normalized_hash);
    } catch (error) {
      const reason = error instanceof z.ZodError ? 'Provider schema mismatch' :
        error instanceof SyntaxError ? 'Completion is not valid JSON' :
          error instanceof Error ? error.message : 'Unsupported provider row';
      rejected.push({ index, reason });
    }
  });
  return { rows, rejected, missingSources: originals.size - seen.size,
    audit: { mapperVersion: ADAPTION_MAPPER_VERSION, inputRows: input.length, mappedRows: rows.length,
      fencedJsonRows, correctedOriginRows, ignoredGeneratedPipelineRows, untrustedReviewClaims,
      classificationFieldsChanged: false, humanApprovalsCreated: 0 } };
}
