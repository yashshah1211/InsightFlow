import 'server-only';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateOfficialArtifact } from './validate-official';
import type { FeedbackRepository } from './repository';
export const officialRepository: FeedbackRepository = {
  async snapshot(batchId) {
    const { artifact, patterns } = validateOfficialArtifact(JSON.parse(readFileSync(resolve('data/processed/official.json'), 'utf8')));
    if (batchId && batchId !== artifact.meta.batchId) return null;
    return { records: artifact.records, patterns, meta: artifact.meta, analysisCreatedAt: artifact.generatedAt };
  },
};
