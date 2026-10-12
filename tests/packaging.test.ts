import { afterEach, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { getRepository } from '@/lib/db';
import { validateOfficialArtifact } from '@/lib/db/validate-official';
afterEach(() => vi.unstubAllEnvs());
it('production requires explicit mode instead of silently selecting fixtures', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('INSIGHTFLOW_DATA_MODE', '');
  expect(() => getRepository()).toThrow('explicit dataset mode');
  vi.stubEnv('INSIGHTFLOW_DATA_MODE', 'fixture');
  expect(getRepository()).toBeDefined();
});
it('build validation rejects malformed official data', () => {
  expect(() => validateOfficialArtifact({})).toThrow();
});
it.skipIf(!existsSync('data/processed/official.json'))('build validation rejects altered official data', () => {
  const artifact = JSON.parse(readFileSync('data/processed/official.json', 'utf8'));
  expect(validateOfficialArtifact(artifact).summary.recordCount).toBe(7000);
  artifact.records[0].rawText += ' altered';
  expect(() => validateOfficialArtifact(artifact)).toThrow('source fingerprint');
});
it.skipIf(!existsSync('data/processed/official.json'))('copied source checksum cannot legitimize reordered or renumbered rows', () => {
  const artifact = JSON.parse(readFileSync('data/processed/official.json', 'utf8'));
  artifact.records[0].rowNumber += 1;
  expect(() => validateOfficialArtifact(artifact)).toThrow('source fingerprint');
});
