import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { RunProvenance, validateAdaptedRows } from '../src/lib/analysis/artifact-validation';
import { readPilotManifest, readGoldReview } from './adaption-manifest';
import { compareTrainingCandidates } from '../src/lib/analysis/training-curation';
const [path,manifestPath,provenancePath,humanPath]=process.argv.slice(2);
if (!path || !manifestPath || !provenancePath || !humanPath) throw new Error('Input, manifest, provenance and human-review paths are required');
const bytes=readFileSync(path);
if (bytes.length>10*1024*1024) throw new Error('Artifact exceeds 10 MiB');
const provenance=RunProvenance.parse(JSON.parse(readFileSync(provenancePath,'utf8')));
const manifest=readPilotManifest(manifestPath);
if (provenance.artifactSha256!==createHash('sha256').update(bytes).digest('hex') || manifest.sourceSha256!==provenance.sourceSha256 || manifest.configSha256!==provenance.configSha256) throw new Error('Artifact/source/config provenance mismatch');
// Actual provider columns must first be inspected and explicitly mapped to these canonical rows.
const rows=bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
const result=validateAdaptedRows(rows,manifest.patterns,manifest.pilotHashes);
if (result.accepted.some(row=>row.annotation.pipelineVersion!==provenance.pipelineVersion)) throw new Error('Pipeline version does not match real run provenance');
const gold=readGoldReview(humanPath,manifest);
const taskEvaluation=compareTrainingCandidates(result.accepted,manifest.patterns.filter(row=>manifest.pilotHashes.includes(row.normalized_hash)),gold);
const sentimentEvaluation={verifiedDenominator:taskEvaluation.pairedDenominator,correct:taskEvaluation.candidate.correct.sentiment,accuracy:taskEvaluation.candidate.accuracy.sentiment};
const report={status:result.rejected.length || result.missingPatternCount?'partial':'validated',acceptedRows:result.accepted.length,rejectedRows:result.rejected,missingPatternCount:result.missingPatternCount,
  sentimentEvaluation,taskEvaluation,provenance,
  limitations:['Structural/evidence validity does not prove task quality.','No auto-persistence: inspect validated annotations and human gold labels before enabling analytics.']};
writeFileSync(path+'.validation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,acceptedRows:report.acceptedRows,rejectedRows:report.rejectedRows.length,missingPatternCount:report.missingPatternCount,sentimentEvaluation:report.sentimentEvaluation},null,2));
if (report.status!=='validated') process.exitCode=1;
