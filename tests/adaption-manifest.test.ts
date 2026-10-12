import { expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { hashReview } from '@/lib/analysis/ingest';
import { readPilotManifest, readGoldReview } from '../scripts/adaption-manifest';

it('binds synthetic validation to actual source bytes and rejects altered source, config and missing human approval', () => {
  const folder = mkdtempSync(join(tmpdir(), 'insightflow-pilot-test-'));
  try {
    const reviews = Array.from({ length: 25 }, (_, i) => `Test-only authored sample ${i}: a folding bracket with a cobalt dial.`);
    const patterns = reviews.map(review => ({ review, normalized_hash: hashReview(review) }));
    const source = 'review\n' + reviews.join('\n') + '\n';
    const pilot = 'review,normalized_hash\n' + patterns.map(row => `${row.review},${row.normalized_hash}`).join('\n') + '\n';
    const sha = (value: string) => createHash('sha256').update(value).digest('hex');
    const manifest = { profile: 'phase6b-v1', sourceKind: 'synthetic_original', sourceSha256: sha(source), configSha256: sha('{}'),
      pilotSha256: sha(pilot), pilotRows: 25, patterns, pilotHashes: patterns.map(row => row.normalized_hash) };
    writeFileSync(join(folder, 'source.csv'), source);
    writeFileSync(join(folder, 'pilot.csv'), pilot);
    writeFileSync(join(folder, 'config.json'), '{}');
    const path = join(folder, 'manifest.json');
    writeFileSync(path, JSON.stringify(manifest));
    expect(readPilotManifest(path).sourceKind).toBe('synthetic_original');
    const gold = join(folder, 'gold.csv');
    writeFileSync(gold, 'normalized_hash,review,review_status,reviewer,reviewed_at,independence_attestation\n' + patterns.map(row => `${row.normalized_hash},${row.review},verified,,,`).join('\n'));
    expect(() => readGoldReview(gold, readPilotManifest(path))).toThrow();
    writeFileSync(join(folder, 'source.csv'), source + 'tampered\n');
    expect(() => readPilotManifest(path)).toThrow('source checksum');
    writeFileSync(join(folder, 'source.csv'), source);
    writeFileSync(join(folder, 'config.json'), '{"unreviewed":true}');
    expect(() => readPilotManifest(path)).toThrow('config checksum');
    writeFileSync(path, JSON.stringify({ ...manifest, profile: undefined }));
    expect(() => readPilotManifest(path)).toThrow('Unrecognized synthetic');
    writeFileSync(path, JSON.stringify({ ...manifest, sourceKind: 'official_csv' }));
    expect(() => readPilotManifest(path)).toThrow('Official source checksum');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
