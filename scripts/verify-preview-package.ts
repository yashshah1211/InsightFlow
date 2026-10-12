import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, lstatSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { fixtureRecords } from '../src/lib/fixtures';

const root = resolve('.');
const sha = (bytes: Buffer, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const manifestPath = 'artifacts/preview-source-manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  fileCount: number; totalSize: number; files: { path: string; size: number; sha: string }[];
};
const allowedRoot = new Set(['package.json', 'package-lock.json', 'next.config.ts', 'next-env.d.ts', 'tsconfig.json', 'postcss.config.mjs', 'vercel.json']);
const allowedScripts = new Set(['scripts/build-readiness.ts', 'scripts/start-standalone.mjs']);
const credentialPattern = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-|pt_live_)[A-Za-z0-9_-]{20,}|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@|\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/;
// Compare private values in memory. Never log their values or load them into the process.
const secrets = existsSync('.env.local') ? readFileSync('.env.local', 'utf8').split(/\r?\n/).flatMap(line => {
  const match = line.match(/^(?:ADAPTION_API_KEY|SUPABASE_[A-Z_]*(?:KEY|URL)|LIVE_TEST_USER_[A-Z_]+|VERCEL_[A-Z_]*TOKEN)=(.*)$/);
  const value = match?.[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  return value && value.length >= 8 ? [Buffer.from(value)] : [];
}) : [];
function clean(bytes: Buffer, path: string) {
  assert(!credentialPattern.test(bytes.toString()), `Credential pattern found in ${path}`);
  assert(!secrets.some(secret => bytes.includes(secret)), `Local private value found in ${path}`);
}
assert.equal(manifest.files.length, manifest.fileCount);
assert(manifest.totalSize < 100 * 1024 * 1024, 'Hobby CLI source size limit');
let total = 0;
for (const file of manifest.files) {
  const path = file.path.replaceAll('\\', '/');
  assert(!path.includes('..') && (allowedRoot.has(path) || allowedScripts.has(path) || path.startsWith('src/')), `Unexpected upload input: ${path}`);
  assert(!/(?:^|\/)(?:\.env[^/]*|artifacts|data|\.git|\.venv|\.worktrees|node_modules)(?:\/|$)/.test(path), `Protected input: ${path}`);
  const bytes = readFileSync(path);
  assert.equal(bytes.length, file.size, `Stale size: ${path}`);
  assert.equal(sha(bytes, 'sha1'), file.sha, `Stale CLI manifest: ${path}`);
  clean(bytes, path); total += bytes.length;
}
assert.equal(total, manifest.totalSize);
for (const required of ['src/lib/fixtures/index.ts', 'src/lib/db/deployment-profile.ts', ...allowedScripts, ...allowedRoot]) {
  assert(manifest.files.some(file => file.path === required), `Missing source: ${required}`);
}
const csv = readFileSync('src/lib/fixtures/feedback.csv');
const rows = parse(csv, { columns: true }) as { review: string; category: string }[];
const records = fixtureRecords();
assert.deepEqual(rows.map(row => [row.review, row.category]), records.map(row => [row.rawText, row.category]));
assert.equal(records.length, 10);
assert.equal(new Set(records.map(record => record.normalizedHash)).size, 9);
let traces = 0, generatedFiles = 0;
function inspect(directory: string) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name), stat = lstatSync(path);
    // Dependency packages and cache are not application build outputs or CLI inputs.
    if (stat.isSymbolicLink() || name === 'node_modules' || name === 'cache') continue;
    // The denied /.env.local HTTP probe creates cached 404 HTML/RSC, not an env file.
    const cachedProbe = relative(root, path).replaceAll('\\', '/').includes('/route-cache/APP_PAGE/')
      && /^\.env\.local\.(?:html|rsc|meta|segments)$/.test(name);
    if (cachedProbe) assert.equal(JSON.parse(readFileSync(join(dirname(path), '.env.local.meta'), 'utf8')).status, 404);
    assert(!/^\.env(?:\.|$)/.test(name) || cachedProbe, 'Environment file in generated output');
    assert(!['data', 'artifacts', '.venv', '.worktrees'].includes(name), 'Private data in generated output');
    if (stat.isDirectory()) { inspect(path); continue; }
    const bytes = readFileSync(path); clean(bytes, relative(root, path)); generatedFiles++;
    if (name.endsWith('.nft.json')) {
      const trace = JSON.parse(bytes.toString()) as { files: string[] }; traces++;
      for (const file of trace.files) {
        const resolved = relative(root, resolve(dirname(path), file)).replaceAll('\\', '/');
        assert(!/(?:^|\/)(?:\.env[^/]*|data|artifacts|\.venv|\.worktrees)(?:\/|$)/.test(resolved), `Protected traced dependency in ${relative(root, path)}`);
      }
    }
  }
}
inspect('.next');
assert(traces > 10, 'Expected built API traces');
const evidence = { checkedAt: new Date().toISOString(), fileCount: manifest.fileCount, sourceBytes: total,
  manifestSha256: sha(readFileSync(manifestPath)), fixtureCsvSha256: sha(csv), records: 10, patterns: 9, repeatedRows: 1,
  buildTraces: traces, generatedFiles, protectedSourceExcluded: true, privateValueScanPassed: true };
writeFileSync('artifacts/preview-package-audit.json', JSON.stringify(evidence, null, 2));
console.log('PASS synthetic CLI inputs and generated build output', evidence);
