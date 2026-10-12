import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readPilotManifest, readGoldReview } from './adaption-manifest';
import { mapProviderOutput } from '../src/lib/analysis/provider-output';
import { validateAdaptedRows, RunProvenance } from '../src/lib/analysis/artifact-validation';
import { compareTrainingCandidates, candidateSha256 } from '../src/lib/analysis/training-curation';
import { PublicPilotProof } from '../src/lib/analysis/public-pilot-proof';

// Offline only. Recompute mapping and evaluation; never serialize private objects wholesale.
const folder = process.argv.slice(2).find(argument => argument !== '--check') ?? 'artifacts/adaption/phase6b-synthetic';
const output = 'src/lib/analysis/adaption-public-proof.json';
const bytes = (name: string) => readFileSync(join(folder, name));
const read = (name: string) => JSON.parse(bytes(name).toString('utf8'));
const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const manifest = readPilotManifest(join(folder, 'manifest.json'));
assert.equal(manifest.sourceKind, 'synthetic_original');
const run = read('execute.json'), status = read('phase6d-latest-status.json'), download = read('download.json');
const attempt = read('execute.attempt.json'), quality = read('phase6d-provider-quality.json');
assert.equal(attempt.status, 'recorded');
assert.equal(attempt.binding.manifestSha256, sha(bytes('manifest.json')));
assert.equal(run.manifestSha256, attempt.binding.manifestSha256);
assert.equal(status.status, 'succeeded');
for (const item of [download, quality]) {
  assert.equal(item.datasetId, run.datasetId); assert.equal(item.runId, run.runId);
}
assert.equal(status.datasetId, run.datasetId); assert.equal(status.providerRunId, run.runId);
assert.equal(run.sourceSha256, manifest.sourceSha256); assert.equal(run.configSha256, manifest.configSha256);
assert.equal(run.pilotSha256, manifest.pilotSha256); assert.equal(quality.evaluationStatus, 'succeeded');
assert.equal(sha(bytes('provider-output.jsonl')), download.artifactSha256);
const mapped = mapProviderOutput(bytes('provider-output.jsonl').toString('utf8').trim().split(/\r?\n/).map(line => JSON.parse(line)), manifest.patterns);
assert.equal(mapped.rejected.length, 0); assert.equal(mapped.missingSources, 0);
const regenerated = Buffer.from(mapped.rows.map(row => JSON.stringify(row)).join('\n') + '\n');
assert.deepEqual(regenerated, bytes('normalized-output.jsonl'), 'Preserve exact canonical mapping');
const provenance = RunProvenance.parse(read('normalized-output.jsonl.provenance.json'));
assert.equal(provenance.artifactSha256, sha(regenerated)); assert.equal(provenance.runId, run.runId);
assert.equal(provenance.datasetId, run.datasetId); assert.equal(provenance.sourceSha256, manifest.sourceSha256);
assert.equal(provenance.configSha256, manifest.configSha256); assert.equal(provenance.completedAt, status.observedAt);
const validation = validateAdaptedRows(mapped.rows, manifest.patterns, manifest.pilotHashes);
assert.equal(validation.rejected.length, 0); assert.equal(validation.missingPatternCount, 0);
const gold = readGoldReview(join(folder, 'human-review.csv'), manifest);
assert(gold.every(row => row.review_status === 'verified'));
const evaluation = compareTrainingCandidates(validation.accepted, manifest.patterns, gold);
assert.deepEqual(evaluation, read('phase6d-independent-evaluation.json').pairedEvaluation);
const reviews = read('normalized-output.jsonl.completion-review.json') as { normalizedHash: string; candidateSha256: string; status: string }[];
assert.equal(reviews.length, 25); assert.equal(new Set(reviews.map(row => row.normalizedHash)).size, 25);
for (const candidate of validation.accepted) {
  assert.equal(candidate.annotation.reviewStatus, 'unreviewed');
  const review = reviews.find(row => row.normalizedHash === candidate.normalizedHash)!;
  assert.equal(review.status, 'unreviewed'); assert.equal(review.candidateSha256, candidateSha256(candidate.annotation));
}
assert.equal(bytes('normalized-output.jsonl.training.jsonl').length, 0);
const knownMixed = gold.filter(row => row.gold_mixed !== 'unknown');
const byHash = new Map(validation.accepted.map(row => [row.normalizedHash, row.annotation]));
const mixed = gold.filter(row => row.gold_mixed === 'true');
const pairSet = (aspects: { topic: string; sentiment: string }[]) => JSON.stringify([...new Set(aspects.map(a => JSON.stringify([a.topic, a.sentiment])))].sort());
const paired = (key: 'sentiment' | 'severity' | 'topics') => ({ candidate: evaluation.candidate.correct[key],
  heuristic: evaluation.heuristicBaseline.correct[key], denominator: evaluation.pairedDenominator });
const proof = PublicPilotProof.parse({
  version: 'adaption-public-proof-1', provider: 'Adaption Adaptive Data', sourceKind: manifest.sourceKind,
  status: status.status, datasetId: run.datasetId, runId: run.runId, submittedAt: run.submittedAt,
  firstObservedSucceededAt: status.observedAt, timestampMeaning: 'First observed success; provider did not expose completed_at',
  counts: { inputs: manifest.pilotRows, outputs: mapped.rows.length, structurallyValidated: validation.accepted.length,
    humanApprovedCandidates: 0, unreviewedCandidates: reviews.length },
  agreement: { sentiment: paired('sentiment'), severity: paired('severity'), exactIssueSets: paired('topics'),
    mixedLabel: { correct: knownMixed.filter(row => (byHash.get(row.normalized_hash)!.sentiment === 'mixed') === (row.gold_mixed === 'true')).length, denominator: knownMixed.length },
    mixedAspectPreservation: { preserved: mixed.filter(row => {
      const sentiments = byHash.get(row.normalized_hash)!.aspects.map(a => a.sentiment);
      return sentiments.includes('positive') && sentiments.includes('negative');
    }).length, denominator: mixed.length },
    exactAspectSets: { correct: gold.filter(row => pairSet(JSON.parse(row.gold_aspects)) === pairSet(byHash.get(row.normalized_hash)!.aspects)).length, denominator: gold.length } },
  providerGrading: { before: quality.quality.score_before, after: quality.quality.score_after,
    gradeBefore: quality.quality.grade_before, gradeAfter: quality.quality.grade_after,
    interpretation: 'Provider dataset grading; not independent label accuracy' },
  provenance: { manifestSha256: run.manifestSha256, sourceSha256: manifest.sourceSha256, configSha256: manifest.configSha256,
    rawOutputSha256: download.artifactSha256, normalizedOutputSha256: provenance.artifactSha256, mapperVersion: provenance.pipelineVersion },
  modelTrained: false, annotationsActivated: false,
  limitations: ['25 selected original synthetic reviews; pilot agreement is not generalized model accuracy.',
    'Structural and verbatim evidence validation does not establish semantic correctness; negation interpretation still requires human review.',
    'All generated candidates remain unreviewed; zero approved training candidates.',
    'No classifier trained or activated; official records, public demo fixtures and private batch analytics remain heuristic.',
    'Exact issue and aspect sets use literal matching without synonym remapping.',
    'Per-job billed usage unavailable; account and billing details are intentionally excluded.'],
});
const serialized = JSON.stringify(proof, null, 2) + '\n';
if (process.argv.includes('--check')) assert.equal(readFileSync(output, 'utf8'), serialized, 'Public proof is stale');
else writeFileSync(output, serialized);
console.log(JSON.stringify({ status: 'verified_offline', counts: proof.counts, proofSha256: sha(Buffer.from(serialized)), providerRequests: 0 }));
