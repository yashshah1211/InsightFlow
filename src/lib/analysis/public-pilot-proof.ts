import { z } from 'zod';

// Separate static release evidence, not a change to frozen domain API contracts.
const count = z.number().int().nonnegative();
const agreement = z.strictObject({ candidate: count, heuristic: count, denominator: count });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const PublicPilotProof = z.strictObject({
  version: z.literal('adaption-public-proof-1'),
  provider: z.literal('Adaption Adaptive Data'),
  sourceKind: z.literal('synthetic_original'),
  status: z.literal('succeeded'),
  datasetId: z.uuid(), runId: z.string().regex(/^dataset-[a-f0-9-]{36}-\d+$/),
  submittedAt: z.iso.datetime({ offset: true }),
  firstObservedSucceededAt: z.iso.datetime({ offset: true }),
  timestampMeaning: z.literal('First observed success; provider did not expose completed_at'),
  counts: z.strictObject({ inputs: count, outputs: count, structurallyValidated: count,
    humanApprovedCandidates: count, unreviewedCandidates: count }),
  agreement: z.strictObject({ sentiment: agreement, severity: agreement, exactIssueSets: agreement,
    mixedLabel: z.strictObject({ correct: count, denominator: count }),
    mixedAspectPreservation: z.strictObject({ preserved: count, denominator: count }),
    exactAspectSets: z.strictObject({ correct: count, denominator: count }) }),
  providerGrading: z.strictObject({ before: z.number(), after: z.number(), gradeBefore: z.string(), gradeAfter: z.string(),
    interpretation: z.literal('Provider dataset grading; not independent label accuracy') }),
  provenance: z.strictObject({ manifestSha256: hash, sourceSha256: hash, configSha256: hash,
    rawOutputSha256: hash, normalizedOutputSha256: hash, mapperVersion: z.string() }),
  modelTrained: z.literal(false), annotationsActivated: z.literal(false),
  limitations: z.array(z.string()).min(4),
}).superRefine((proof, ctx) => {
  const c = proof.counts;
  if (c.inputs !== 25 || c.outputs !== 25 || c.structurallyValidated !== 25 ||
    c.humanApprovedCandidates !== 0 || c.unreviewedCandidates !== 25 ||
    !proof.runId.startsWith(`dataset-${proof.datasetId}-`)) {
    ctx.addIssue({ code: 'custom', message: 'Only the verified completed 25-row unreviewed pilot is publishable' });
  }
  for (const value of [proof.agreement.sentiment, proof.agreement.severity, proof.agreement.exactIssueSets]) {
    if (value.denominator !== 25 || value.candidate > value.denominator || value.heuristic > value.denominator)
      ctx.addIssue({ code: 'custom', message: 'Invalid paired agreement denominator' });
  }
});
