import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, lstatSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, join, dirname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { DashboardResponse, FeedbackResponse, DataLabResponse } from '../src/lib/contracts';
import { validateOfficialArtifact } from '../src/lib/db/validate-official';
import { assertOfficial } from '../src/lib/analysis/official';

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const artifactPath = 'data/processed/official.json';
const sourceBytes = readFileSync(artifactPath);
validateOfficialArtifact(JSON.parse(sourceBytes.toString()));
const standalone = resolve('.next/standalone');
assert.ok(existsSync(join(standalone, 'server.js')), 'Build first');
// Check every domain GET trace, not just the standalone copy.
for (const route of ['dashboard', 'feedback', 'issues', 'issues/[id]', 'decisions', 'data-lab', 'reports/export']) {
  const tracePath = resolve(`.next/server/app/api/${route}/route.js.nft.json`);
  const trace = JSON.parse(readFileSync(tracePath, 'utf8')) as { files: string[] };
  assert.ok(trace.files.some(file => resolve(dirname(tracePath), file) === resolve(artifactPath)), `Artifact missing from ${route} trace`);
}
mkdirSync('artifacts/production-packages', { recursive: true });
const packageRoot = mkdtempSync(resolve('artifacts/production-packages/release-'));
cpSync(standalone, packageRoot, { recursive: true, dereference: true });
cpSync('.next/static', join(packageRoot, '.next/static'), { recursive: true });
if (existsSync('public')) cpSync('public', join(packageRoot, 'public'), { recursive: true });
const packagedArtifact = join(packageRoot, artifactPath);
assert.equal(sha(readFileSync(packagedArtifact)), sha(sourceBytes), 'Packaged bytes differ');
// A relocated package must not retain links into the original checkout.
function inspect(directory: string) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), 'Package must be self-contained');
    assert.ok(!/^\.env(?:\.|$)/.test(entry), 'Environment secrets must not be packaged');
    if (stat.isDirectory()) inspect(path);
  }
}
inspect(packageRoot);
assert.ok(!existsSync(join(packageRoot, 'data/raw/customer_feedback.csv')));
const socket = createServer();
socket.listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = (socket.address() as { port: number }).port;
await new Promise<void>(resolve => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
let child: ChildProcess | undefined;
async function launch(mode?: string) {
  // Do not inherit developer .env, Auth keys, NODE_OPTIONS or provider credentials.
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP,
    NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port), INSIGHTFLOW_WRITES_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1' };
  if (mode) env.INSIGHTFLOW_DATA_MODE = mode;
  child = spawn(process.execPath, ['server.js'], { cwd: packageRoot, env, stdio: 'ignore' });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Packaged server exited');
    try { await fetch(base + '/api/dashboard'); return; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  throw new Error('Packaged server did not start');
}
async function stop() {
  if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
}
async function json(path: string) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, path);
  assert.ok(response.headers.get('cache-control')?.includes('no-store'));
  return response.json();
}
try {
  await launch('official');
  const dashboard = DashboardResponse.parse(await json('/api/dashboard'));
  const records = [];
  const patterns = [];
  for (let page = 1; page <= 70; page++) {
    const result = FeedbackResponse.parse(await json(`/api/feedback?view=records&pageSize=100&page=${page}`));
    assert.equal(result.meta.provenance.source, 'official_csv');
    for (const item of result.data.items) { assert.equal(item.kind, 'record'); if (item.kind === 'record') records.push(item); }
  }
  for (let page = 1; page <= 4; page++) {
    const result = FeedbackResponse.parse(await json(`/api/feedback?view=patterns&pageSize=100&page=${page}`));
    for (const item of result.data.items) { assert.equal(item.kind, 'pattern'); if (item.kind === 'pattern') patterns.push(item); }
  }
  assertOfficial(records, patterns);
  assert.equal(dashboard.data.summary.recordCount, 7000);
  const lab = DataLabResponse.parse(await json('/api/data-lab'));
  assert.equal(lab.data.top20RecordCount, 5025);
  const denial = await fetch(base + '/api/feedback', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(denial.status, 401);
  renameSync(packagedArtifact, packagedArtifact + '.held');
  try { assert.equal((await fetch(base + '/api/dashboard')).status, 503, 'Missing artifact must fail closed'); }
  finally { renameSync(packagedArtifact + '.held', packagedArtifact); }
  await stop();
  await launch();
  assert.equal((await fetch(base + '/api/dashboard')).status, 503, 'Unset production mode must fail closed');
  const location = relative(resolve('.'), packageRoot);
  assert.ok(!isAbsolute(location) && !location.startsWith('..'));
  const report = { status: 'passed', verification: 'relocated local standalone runtime; not remote Vercel', packageRoot,
    sourceSha256: lab.meta.provenance.source === 'official_csv' ? JSON.parse(sourceBytes.toString()).sourceSha256 : null,
    artifactSha256: sha(sourceBytes), rawRows: records.length, patterns: patterns.length, repeats: 6680,
    top20Rows: lab.data.top20RecordCount, unauthenticatedWriteStatus: denial.status, missingArtifactStatus: 503, unsetProductionModeStatus: 503, tracedRoutes: 7 };
  writeFileSync('artifacts/production-packages/verification.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await stop(); }
