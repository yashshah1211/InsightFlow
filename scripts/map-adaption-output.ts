import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readPilotManifest } from './adaption-manifest';
import { mapProviderOutput, ADAPTION_MAPPER_VERSION } from '../src/lib/analysis/provider-output';
import { RunProvenance } from '../src/lib/analysis/artifact-validation';

const [folder, output] = process.argv.slice(2);
if (!folder || !output) throw new Error('Supply the ignored pilot folder and a new normalized JSONL path');
if (existsSync(output) || existsSync(output + '.provenance.json') || existsSync(output + '.mapping.json')) throw new Error('Preserve existing mapped artifacts');
const manifest = readPilotManifest(join(folder, 'manifest.json'));
if (manifest.sourceKind !== 'synthetic_original') throw new Error('This inspected mapper is limited to the original synthetic pilot');
const run = JSON.parse(readFileSync(join(folder, 'execute.json'), 'utf8'));
const download = JSON.parse(readFileSync(join(folder, 'download.json'), 'utf8'));
const status = JSON.parse(readFileSync(join(folder, 'phase6d-latest-status.json'), 'utf8'));
const raw = readFileSync(join(folder, 'provider-output.jsonl'));
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
if (raw.length > 10 * 1024 * 1024 || sha(raw) !== download.artifactSha256 ||
    run.datasetId !== download.datasetId || run.runId !== download.runId || status.status !== 'succeeded' ||
    status.datasetId !== run.datasetId || status.providerRunId !== run.runId ||
    run.sourceSha256 !== manifest.sourceSha256 || run.configSha256 !== manifest.configSha256 || run.pilotSha256 !== manifest.pilotSha256) {
  throw new Error('Real run/download/source correspondence failed');
}
const input = raw.toString('utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const mapped = mapProviderOutput(input, manifest.patterns);
const bytes = Buffer.from(mapped.rows.map(row => JSON.stringify(row)).join('\n') + (mapped.rows.length ? '\n' : ''));
const provenance = RunProvenance.parse({ datasetId: run.datasetId, runId: run.runId, pipelineVersion: ADAPTION_MAPPER_VERSION,
  sourceSha256: manifest.sourceSha256, configSha256: manifest.configSha256, artifactSha256: sha(bytes),
  completedAt: status.observedAt, actualCredits: run.actualCredits });
writeFileSync(output, bytes, { flag: 'wx' });
writeFileSync(output + '.provenance.json', JSON.stringify(provenance, null, 2) + '\n', { flag: 'wx' });
writeFileSync(output + '.mapping.json', JSON.stringify({ ...mapped.audit, rejected: mapped.rejected, missingSources: mapped.missingSources,
  rawArtifactSha256: sha(raw), normalizedArtifactSha256: sha(bytes), realRunId: run.runId,
  completionTimeOrigin: 'First observed succeeded timestamp; no explicit provider completed_at field',
  providerUpdatedAt: status.providerUpdatedAt, confidenceReason: 'All actual candidates returned null; no calibrated confidence created',
  schemaInspection: ['enhanced_prompt', 'enhanced_completion', 'normalized_hash', 'original_context', 'review'],
  limitations: ['Imported candidates remain unreviewed; provenance normalization is not human approval.',
    'No classification/evidence repairs, model training or analytics activation.'] }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ...mapped.audit, rejectedRows: mapped.rejected.length, missingSources: mapped.missingSources }, null, 2));
if (mapped.rejected.length || mapped.missingSources) process.exitCode = 1;
