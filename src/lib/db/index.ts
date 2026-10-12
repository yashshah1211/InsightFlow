import 'server-only';
import { fixtureRecords, fixturePatterns, FIXTURE_BATCH_ID } from '@/lib/fixtures';
import type { FeedbackRepository } from './repository';
import { existsSync } from 'node:fs';
import { officialRepository } from './official-repository';
import { deploymentProfile } from './deployment-profile';
export const fixtureRepository: FeedbackRepository = {
  async snapshot(batchId) {
    if (batchId && batchId !== FIXTURE_BATCH_ID) return null;
    return { records: fixtureRecords(), patterns: fixturePatterns(), meta: {
      contractVersion: '1.0.0', mode: 'fixture', batchId: FIXTURE_BATCH_ID, dataSourceStatus: 'ready', analysisStatus: 'partial',
      provenance: { source: 'fixture', label: '10 authored development samples; not the official dataset', methodologyVersion: 'heuristic-v2' },
      limitations: ['Fixture data only; official CSV assertions pending.', 'No customer IDs or complaint dates; import time is not event time.', 'Heuristic analysis is unreviewed and incomplete; no calibrated confidence.', 'Adaption not configured; no jobs submitted or credits spent.'],
    } };
  },
};
export function getRepository(): FeedbackRepository {
  deploymentProfile();
  if (process.env.NODE_ENV === 'production' && !process.env.INSIGHTFLOW_DATA_MODE) throw new Error('Production requires explicit dataset mode');
  const mode = process.env.INSIGHTFLOW_DATA_MODE ?? (existsSync('data/processed/official.json') ? 'official' : 'fixture');
  if (mode === 'official') return officialRepository;
  if (mode !== 'fixture') throw new Error('Unsupported data mode');
  return fixtureRepository;
}
