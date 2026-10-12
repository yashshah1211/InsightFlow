import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { Hash } from '../src/lib/contracts';
import { OFFICIAL_SHA256 } from '../src/lib/analysis/official';
import { hashReview } from '../src/lib/analysis/ingest';

const Manifest = z.object({ profile: z.literal('phase6b-v1').optional(), sourceKind: z.enum(['official_csv', 'synthetic_original']).optional(),
  sourceSha256: Hash, configSha256: Hash, pilotSha256: Hash, pilotRows: z.number().int(), pilotHashes: z.array(Hash),
  patterns: z.array(z.object({ normalized_hash: Hash, review: z.string().min(1) })) });
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Bind synthetic artifacts to the locally authored source; preserve the official checksum boundary. */
export function readPilotManifest(path: string) {
  const manifest = Manifest.parse(JSON.parse(readFileSync(path, 'utf8')));
  const folder = dirname(path);
  if (manifest.sourceKind === 'synthetic_original') {
    if (manifest.profile !== 'phase6b-v1' || manifest.pilotRows !== 25 || manifest.patterns.length !== 25) throw new Error('Unrecognized synthetic source profile');
    const source = readFileSync(join(folder, 'source.csv'));
    if (sha(source) !== manifest.sourceSha256) throw new Error('Synthetic source checksum mismatch');
    const rows = z.array(z.strictObject({ review: z.string().min(1) })).parse(parse(source, { columns: true }));
    if (rows.length !== 25 || rows.some((row, i) => row.review !== manifest.patterns[i].review || hashReview(row.review) !== manifest.patterns[i].normalized_hash)) throw new Error('Synthetic source correspondence mismatch');
  } else {
    if (manifest.sourceSha256 !== OFFICIAL_SHA256) throw new Error('Official source checksum mismatch');
    const source = readFileSync('data/raw/customer_feedback.csv');
    if (sha(source) !== OFFICIAL_SHA256) throw new Error('Official source file changed');
    const reviews = new Set((parse(source, { columns: true }) as { review: string }[]).map(row => row.review));
    if (manifest.patterns.some(row => !reviews.has(row.review) || hashReview(row.review) !== row.normalized_hash)) throw new Error('Official pattern is outside source');
  }
  const pilot = readFileSync(join(folder, 'pilot.csv'));
  const config = JSON.parse(readFileSync(join(folder, 'config.json'), 'utf8'));
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value !== null && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => JSON.stringify(key) + ':' + canonical(v)).join(',') + '}';
    return JSON.stringify(value);
  };
  if (sha(pilot) !== manifest.pilotSha256 || sha(Buffer.from(canonical(config))) !== manifest.configSha256) throw new Error('Pilot/config checksum mismatch');
  const rows = z.array(z.object({ review: z.string(), normalized_hash: Hash })).parse(parse(pilot, { columns: true }));
  const patterns = new Map(manifest.patterns.map(row => [row.normalized_hash, row.review]));
  if (rows.length !== manifest.pilotRows || new Set(manifest.pilotHashes).size !== rows.length || manifest.pilotHashes.length !== rows.length ||
    rows.some((row, i) => row.normalized_hash !== manifest.pilotHashes[i] || hashReview(row.review) !== row.normalized_hash || patterns.get(row.normalized_hash) !== row.review)) throw new Error('Pilot source correspondence mismatch');
  return manifest;
}

export function readGoldReview(path: string, manifest: ReturnType<typeof readPilotManifest>) {
  const rows = parse(readFileSync(path, 'utf8'), { columns: true }) as Record<string, string>[];
  if (manifest.profile === 'phase6b-v1') {
    const byHash = new Map(manifest.patterns.map(row => [row.normalized_hash, row.review]));
    if (rows.length !== 25 || new Set(rows.map(row => row.normalized_hash)).size !== 25 || rows.some(row => !manifest.pilotHashes.includes(row.normalized_hash) || row.review !== byHash.get(row.normalized_hash))) throw new Error('Gold source correspondence mismatch');
    for (const row of rows.filter(row => row.review_status === 'verified')) {
      z.object({ reviewer: z.string().trim().min(1), reviewed_at: z.iso.datetime({ offset: true }), independence_attestation: z.string().trim().min(1),
        gold_negation: z.string().trim().min(1), gold_mixed: z.enum(['true', 'false', 'unknown']), gold_aspects: z.string().min(1) }).parse(row);
      const aspects = z.array(z.strictObject({ topic: z.string().min(1), sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed', 'unknown']), evidenceQuote: z.string().min(1) })).parse(JSON.parse(row.gold_aspects));
      if (aspects.some(aspect => !row.review.includes(aspect.evidenceQuote))) throw new Error('Gold aspect quote is outside source');
    }
  }
  return rows;
}
