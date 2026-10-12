import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { AdaptionRun } from '../src/lib/contracts';
import { RunProvenance, AdaptedRow } from '../src/lib/analysis/artifact-validation';
import { readPilotManifest } from './adaption-manifest';

const [folder, output] = process.argv.slice(2);
if (!folder || !output || existsSync(output)) throw new Error('Supply the ignored pilot folder and a new local proof-preview JSON path');
const read = (name: string) => JSON.parse(readFileSync(join(folder, name), 'utf8'));
const manifest = readPilotManifest(join(folder, 'manifest.json'));
const run = read('execute.json'), download = read('download.json');
const validation = read('normalized-output.jsonl.validation.json');
const curation = read('normalized-output.jsonl.curation.json');
const quality = read('phase6d-provider-quality.json');
const mapping = read('normalized-output.jsonl.mapping.json');
const bytes = readFileSync(join(folder, 'normalized-output.jsonl'));
const provenance = RunProvenance.parse(read('normalized-output.jsonl.provenance.json'));
const candidates = bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(line => AdaptedRow.parse(JSON.parse(line)));
if (manifest.sourceKind !== 'synthetic_original' || validation.status !== 'validated' || validation.acceptedRows !== candidates.length ||
  provenance.artifactSha256 !== createHash('sha256').update(bytes).digest('hex') ||
  provenance.runId !== run.runId || run.runId !== download.runId || run.datasetId !== download.datasetId ||
  mapping.rawArtifactSha256 !== download.artifactSha256 || curation.humanApprovedTrainingRows !== 0 ||
  candidates.some(row => row.annotation.reviewStatus !== 'unreviewed')) throw new Error('Actual validated/candidate provenance failed');
const runPreview = AdaptionRun.parse({ id: 'synthetic-pilot-phase6d', datasetId: run.datasetId, runId: run.runId,
  status: 'ready', sourceRows: manifest.pilotRows, processedRows: download.rowCount,
  estimatedCredits: run.estimatedCredits, actualCredits: run.actualCredits, artifactPath: null, errorMessage: null });
const examples = candidates.slice(0, 2).map(candidate => ({ sourcePatternHash: candidate.normalizedHash,
  originalSyntheticReview: manifest.patterns.find(source => source.normalized_hash === candidate.normalizedHash)!.review,
  providerCandidate: candidate.annotation, humanCompletionApproval: 'unreviewed' }));
const preview = { status: 'local_integration_preview_not_persisted_or_published', sourceKind: 'synthetic_original',
  datasetLabel: 'Separate 25-review original synthetic Adaptive Data pilot',
  run: runPreview, providerStatus: 'succeeded', inputRows: manifest.pilotRows, outputRows: candidates.length,
  schemaAndEvidenceAcceptedRows: validation.acceptedRows, independentPilotAgreement: curation.evaluation,
  providerQuality: { ...quality.quality, interpretation: 'Provider dataset grading only; not sentiment accuracy or independent gold' },
  provenance, rawArtifactSha256: download.artifactSha256, unreviewedCandidates: candidates.length,
  humanApprovedCompletions: curation.humanApprovedTrainingRows, humanApprovedTrainingRows: 0,
  annotationsActivated: false, modelTrained: false, publicFixtureDataAffected: false,
  deploymentPerformed: false, supabasePersistencePerformed: false, examples,
  integrationInstructions: ['Use a separate synthetic pilot proof section; do not attach these outputs to the 10 public fixtures or official data.',
    'The run DTO validates against frozen AdaptionRun v1; the additional proof/evaluation fields require a separately coordinated view.',
    'Show actual run/counts and unreviewed candidate status; actual credits remain unavailable.',
    'Keep gold, account balance, raw responses and review metadata private. Obtain separate publication/deployment approval.'],
  limitations: ['Successful processing and structural validity do not establish task correctness.',
    'Exact topic/aspect-set agreement is literal and does not remap synonyms.',
    'No human completion approvals, classifier activation or custom model training occurred.'] };
writeFileSync(output, JSON.stringify(preview, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: preview.status, inputRows: preview.inputRows, outputRows: preview.outputRows,
  schemaAndEvidenceAcceptedRows: preview.schemaAndEvidenceAcceptedRows, unreviewedCandidates: preview.unreviewedCandidates,
  humanApprovedTrainingRows: preview.humanApprovedTrainingRows, annotationsActivated: false, persistedOrPublished: false }, null, 2));
