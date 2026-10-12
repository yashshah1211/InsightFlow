import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';

// Local preparation only; this tool has no push, deploy, remote API or provider command.
const base = '3939daf52dd47b222c5acf04498f304fb3be5a1b';
const branch = 'submission/adaption-release';
const folder = 'artifacts/submission/final-release';
const excluded = ['docs/PHASE6A_LIVE_SUPABASE.md', 'docs/PHASE6A_LIVE_SUPABASE.json',
  'docs/SUPABASE_MIGRATION_1_EXECUTION.json', 'docs/SUPABASE_MIGRATION_2_EXECUTION.json'];
const manifestPath = 'docs/SUBMISSION_RELEASE_MANIFEST.json';
const proofPath = 'src/lib/analysis/adaption-public-proof.json';
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const git = (args: string[], env?: NodeJS.ProcessEnv) => execFileSync('git', args, { env: env ?? process.env, windowsHide: true });
mkdirSync(folder, { recursive: true });
const secrets = existsSync('.env.local') ? readFileSync('.env.local', 'utf8').split(/\r?\n/).flatMap(line => {
  const match = line.match(/^(?:ADAPTION_API_KEY|SUPABASE_[A-Z_]*KEY|LIVE_TEST_USER_[A-Z_]+|VERCEL_[A-Z_]*TOKEN)=(.*)$/);
  const value = match?.[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  return value && value.length >= 8 ? [Buffer.from(value)] : [];
}) : [];
const credential = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-|pt_live_)[A-Za-z0-9_-]{20,}|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@|\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/;
const officialPath = 'data/raw/customer_feedback.csv';
// Full substantive records only; short denial phrases are also necessary authored rule tests.
const officialReviews = existsSync(officialPath) ? [...new Set((parse(readFileSync(officialPath), { columns: true }) as { review: string }[])
  .map(row => row.review).filter(review => review.length >= 40))] : [];
function audit(path: string, bytes: Buffer) {
  assert(!/(?:^|\/)(?:artifacts|node_modules|\.next|\.vercel|\.venv|\.worktrees|\.git)(?:\/|$)/.test(path), `Protected path: ${path}`);
  assert(!path.startsWith('data/') || path === 'data/raw/.gitkeep', `Dataset path: ${path}`);
  assert(!/(?:^|\/)\.env/.test(path) || path === '.env.example', `Environment path: ${path}`);
  assert(!excluded.includes(path));
  assert(!credential.test(bytes.toString()) && !secrets.some(secret => bytes.includes(secret)), `Private credential detected in ${path}`);
  assert(!officialReviews.some(review => bytes.includes(Buffer.from(review)) || bytes.includes(Buffer.from(JSON.stringify(review).slice(1, -1)))), `Official review text detected in ${path}`);
  // Whole approved synthetic review strings must never appear in the proposed source tree.
  const localSource = 'artifacts/adaption/phase6b-synthetic/manifest.json';
  if (existsSync(localSource)) {
    const privateReviews = JSON.parse(readFileSync(localSource, 'utf8')).patterns as { review: string }[];
    assert(!privateReviews.some(row => bytes.includes(Buffer.from(row.review)) || bytes.includes(Buffer.from(JSON.stringify(row.review).slice(1, -1)))), `Restricted pilot text detected in ${path}`);
  }
}
if (process.argv[2] === 'manifest') {
  const paths = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).toString().split('\0').filter(Boolean);
  const allowlist = [...new Set([...paths, manifestPath])].filter(path => !excluded.includes(path)).sort();
  for (const path of allowlist.filter(path => path !== manifestPath)) audit(path, readFileSync(path));
  const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
  writeFileSync(manifestPath, JSON.stringify({ status: 'proposed_not_published', publishedBase: base,
    proposedBranch: branch, proof: { path: proofPath, sha256: sha(readFileSync(proofPath)), publicFields: Object.keys(proof) },
    githubFileAllowlist: allowlist, excluded,
    deploymentInputs: 'Only current .vercelignore allowlist; no docs, provider scripts, ignored evidence or environment files',
    exactBlobManifest: 'Ignored artifacts/submission/final-release/snapshot-manifest.json; generated from the committed audited tree',
    publicationAuthorized: false, deploymentAuthorized: false }, null, 2) + '\n');
  console.log(`PASS proposed ${allowlist.length}-file allowlist, private-value and synthetic-source text scan`);
} else if (process.argv[2] === 'snapshot') {
  assert.equal(git(['status', '--porcelain']).toString(), '', 'Commit safe main changes before snapshot preparation');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.proof.sha256, sha(readFileSync(proofPath)));
  assert.equal(git(['rev-parse', 'submission/public-snapshot']).toString().trim(), base);
  assert.equal(git(['for-each-ref', '--format=%(refname)', `refs/heads/${branch}`]).toString(), '', 'Preserve any prepared release; do not recreate');
  const index = resolve(folder, 'release.index'); assert(!existsSync(index), 'Preserve prepared index');
  const env = { ...process.env, GIT_INDEX_FILE: index };
  const main = git(['rev-parse', 'HEAD']).toString().trim();
  git(['read-tree', main], env);
  git(['update-index', '--force-remove', ...excluded], env);
  const tree = git(['write-tree'], env).toString().trim();
  const files = git(['ls-tree', '-r', '-z', tree]).toString().split('\0').filter(Boolean).map(line => {
    const [, mode, type, blob, path] = line.match(/^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/)!;
    assert.equal(type, 'blob'); assert.equal(mode, '100644');
    const bytes = git(['cat-file', 'blob', blob]); audit(path, bytes);
    return { path, mode, blob, size: bytes.length, sha256: sha(bytes) };
  });
  assert.deepEqual(files.map(file => file.path).sort(), manifest.githubFileAllowlist);
  const commitEnv = { ...env, GIT_AUTHOR_NAME: 'Yash Shah', GIT_AUTHOR_EMAIL: 'yashshah1211@users.noreply.github.com',
    GIT_COMMITTER_NAME: 'Yash Shah', GIT_COMMITTER_EMAIL: 'yashshah1211@users.noreply.github.com' };
  const commit = git(['commit-tree', tree, '-p', base, '-m', 'feat: disclose completed synthetic Adaption pilot with aggregate evidence'], commitEnv).toString().trim();
  git(['update-ref', `refs/heads/${branch}`, commit, '0000000000000000000000000000000000000000']);
  assert.equal(git(['rev-parse', `${branch}^`]).toString().trim(), base);
  assert.deepEqual(git(['rev-list', branch]).toString().trim().split(/\r?\n/), [commit, base]);
  writeFileSync(resolve(folder, 'snapshot-manifest.json'), JSON.stringify({ sourceCommit: main, publishedBase: base,
    proposedCommit: commit, tree, branch, files, excluded, credentialFindings: 0, restrictedPilotTextFindings: 0,
    privateHistoryAbsent: true, published: false, deployed: false }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'audited_local_snapshot', commit, tree, fileCount: files.length, published: false, deployed: false }));
} else throw new Error('Use manifest or snapshot; neither publishes anything');
