import { z } from 'zod';
import { Annotation, Hash, DateTime } from '@/lib/contracts';
import { validateAnnotationEvidence } from './heuristic';
export const RunProvenance = z.strictObject({ datasetId:z.string().min(1),runId:z.string().min(1),pipelineVersion:z.string().min(1),
  sourceSha256:Hash,configSha256:Hash,artifactSha256:Hash,completedAt:DateTime,
  actualCredits:z.number().nonnegative().nullable() });
export const AdaptedRow = z.strictObject({ normalizedHash:Hash,annotation:Annotation });
export function validateAdaptedRows(rows:unknown[],patterns:{normalized_hash:string;review:string}[],pilotHashes:string[]) {
  const byHash=new Map(patterns.map(p=>[p.normalized_hash,p.review]));
  const allowed=new Set(pilotHashes), seen=new Set<string>();
  const accepted:z.infer<typeof AdaptedRow>[]=[];
  const rejected:{index:number;reason:string}[]=[];
  rows.forEach((raw,index)=>{
    const parsed=AdaptedRow.safeParse(raw);
    if (!parsed.success) {rejected.push({index,reason:'Schema mismatch'});return;}
    const row=parsed.data, review=byHash.get(row.normalizedHash);
    if (!review || !allowed.has(row.normalizedHash) || seen.has(row.normalizedHash)) {rejected.push({index,reason:'Missing, duplicate, or out-of-pilot correspondence'});return;}
    if (!validateAnnotationEvidence(review,row.annotation) || row.annotation.analyzedBy!=='adaption' || row.annotation.confidence!==null || row.annotation.reviewStatus!=='unreviewed') {rejected.push({index,reason:'Evidence/provenance/confidence validation failed'});return;}
    const denial = /\b(?:not a victim of fraud|no(?: signs of)? fraudulent activity(?: detected)?|no unexplained charge)\b/gi;
    // A denial in one clause must not erase an affirmative allegation in another.
    const hasDenial = new RegExp(denial.source, 'i').test(review);
    const remainder = review.replace(denial, '');
    const hasOtherAllegation = /\b(?:(?:was|were|am|are|have been|has been) (?:scammed|a victim of fraud|a scam|fraudulent)|(?:received|sent|sold) (?:a |an )?counterfeit|unauthorized (?:charge|debit) (?:appeared|occurred))\b/i.test(remainder);
    if (hasDenial && !hasOtherAllegation && row.annotation.issueTypes.includes('suspected_fraud')) {rejected.push({index,reason:'Denied fraud converted into accusation'});return;}
    seen.add(row.normalizedHash);accepted.push(row);
  });
  return {accepted,rejected,missingPatternCount:allowed.size-seen.size};
}
