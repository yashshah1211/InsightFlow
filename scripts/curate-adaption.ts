import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { RunProvenance, validateAdaptedRows } from '../src/lib/analysis/artifact-validation';
import { approvedTrainingRows, candidateSha256, compareTrainingCandidates } from '../src/lib/analysis/training-curation';
import { readPilotManifest, readGoldReview } from './adaption-manifest';
const [input, manifestPath, provenancePath, goldPath, approvalsPath] = process.argv.slice(2);
if (!input || !manifestPath || !provenancePath || !goldPath) throw new Error('Supply normalized JSONL, manifest, real provenance, human-review CSV and optional verified completion-review JSON');
const bytes = readFileSync(input);
if (bytes.length > 10 * 1024 * 1024) throw new Error('Artifact exceeds 10 MiB');
const provenance = RunProvenance.parse(JSON.parse(readFileSync(provenancePath, 'utf8')));
const manifest = readPilotManifest(manifestPath);
if (manifest.sourceSha256 !== provenance.sourceSha256 || manifest.configSha256 !== provenance.configSha256 || provenance.artifactSha256 !== createHash('sha256').update(bytes).digest('hex')) throw new Error('Real run/source/config/artifact provenance mismatch');
const result = validateAdaptedRows(bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)), manifest.patterns, manifest.pilotHashes);
if (result.rejected.length || result.missingPatternCount || result.accepted.some(row => row.annotation.pipelineVersion !== provenance.pipelineVersion)) throw new Error('Only complete validated output enters curation');
const gold = readGoldReview(goldPath,manifest);
const evaluation = compareTrainingCandidates(result.accepted, manifest.patterns.filter(row => manifest.pilotHashes.includes(row.normalized_hash)), gold);
const approvals: unknown[] = approvalsPath ? JSON.parse(readFileSync(approvalsPath, 'utf8')) : [];
const training = approvedTrainingRows(result.accepted, manifest.patterns, approvals);
const reviewPath = input + '.completion-review.json';
if (!existsSync(reviewPath)) writeFileSync(reviewPath, JSON.stringify(result.accepted.map(row => ({ normalizedHash: row.normalizedHash,
  candidateSha256: candidateSha256(row.annotation), status: 'unreviewed', reviewer: '', reviewedAt: null })), null, 2) + '\n');
const report = { status: 'candidate_curation', generatedCandidates: result.accepted.length, humanApprovedTrainingRows: training.length, evaluation, provenance,
  limitations: ['Generated completion is a training candidate, not an independent customer classification.', 'No fine-tuning, downstream inference, DB writes or live metric activation performed.'] };
writeFileSync(input + '.curation.json', JSON.stringify(report, null, 2) + '\n');
writeFileSync(input + '.training.jsonl', training.map(row => JSON.stringify({ ...row, provenance })).join('\n') + (training.length ? '\n' : ''));
console.log(JSON.stringify({ status: report.status, generatedCandidates: report.generatedCandidates, humanApprovedTrainingRows: training.length, evaluation }, null, 2));
