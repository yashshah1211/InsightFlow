import { expect,it } from 'vitest';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { Annotation } from '@/lib/contracts';
import { annotateHeuristically } from '@/lib/analysis/heuristic';
import { hashReview } from '@/lib/analysis/ingest';
import { validateAdaptedRows, RunProvenance } from '@/lib/analysis/artifact-validation';
it('exported pilot schema exactly matches canonical frozen annotation schema',()=>{
  expect(JSON.parse(readFileSync('scripts/adaption/annotation.schema.json','utf8'))).toEqual(z.toJSONSchema(Annotation));
});
it('artifact validator rejects invented quotes, duplicate/unknown IDs, missing rows and denied fraud allegations',()=>{
  const text='I was not a victim of fraud.';
  const hash=hashReview(text);
  const annotation={...annotateHeuristically(text),analyzedBy:'adaption' as const,pipelineVersion:'test-only-artifact'};
  const row={normalizedHash:hash,annotation};
  const patterns=[{normalized_hash:hash,review:text}];
  expect(validateAdaptedRows([row],patterns,[hash]).accepted).toHaveLength(1);
  expect(validateAdaptedRows([row,row],patterns,[hash]).rejected).toHaveLength(1);
  expect(validateAdaptedRows([{...row,normalizedHash:'b'.repeat(64)}],patterns,[hash]).missingPatternCount).toBe(1);
  expect(validateAdaptedRows([{...row,annotation:{...annotation,evidenceQuote:'invented'}}],patterns,[hash]).accepted).toHaveLength(0);
  expect(validateAdaptedRows([{...row,annotation:{...annotation,issueTypes:['suspected_fraud']}}],patterns,[hash]).accepted).toHaveLength(0);
});
it('run provenance cannot omit actual run ID and numeric confidence/review verification cannot be fabricated',()=>{
  expect(RunProvenance.safeParse({datasetId:'test',runId:null}).success).toBe(false);
  const text='Delivery was delayed but support was helpful.';
  const hash=hashReview(text);
  const annotation={...annotateHeuristically(text),analyzedBy:'adaption' as const,confidence:.9};
  expect(validateAdaptedRows([{normalizedHash:hash,annotation}],[{normalized_hash:hash,review:text}],[hash]).rejected).toHaveLength(1);
});
it('protects fraud denials while preserving separate affirmative allegations in mixed clauses',()=>{
  for (const text of ['No signs of fraudulent activity appeared during checkout.', 'I found no unexplained charge in the ledger.', 'I was not a victim of fraud and I was not scammed.']) {
    const hash=hashReview(text);
    const annotation={...annotateHeuristically(text),analyzedBy:'adaption' as const,issueTypes:['suspected_fraud']};
    expect(validateAdaptedRows([{normalizedHash:hash,annotation}],[{normalized_hash:hash,review:text}],[hash]).accepted).toHaveLength(0);
  }
  const text='No signs of fraudulent activity appeared in the first order, but I was scammed on the second.';
  const hash=hashReview(text);
  const annotation={...annotateHeuristically(text),analyzedBy:'adaption' as const,issueTypes:['suspected_fraud']};
  expect(validateAdaptedRows([{normalizedHash:hash,annotation}],[{normalized_hash:hash,review:text}],[hash]).accepted).toHaveLength(1);
});
