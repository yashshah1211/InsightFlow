// Local operator tool. Only the allowlisted low-privilege values leave this machine.
// Phase 7B authorizes these stages; flags do not independently grant permission.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { URL } from 'node:url';
const stage = process.argv[2], cli = process.argv[3];
let operation = 'configuration';
let redactions = [], activeOutput;
assert(['readonly', 'writes', 'inspect'].includes(stage) && cli, 'Stage and local Vercel CLI path required');
const directory = 'artifacts/live-preview'; mkdirSync(directory, { recursive: true });
const projectId = 'prj_J3kD79zIEtR84ytA1oLqndYAUm4D';
const origin = 'https://insightflow-preview-demo.vercel.app';
const link = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
assert.equal(link.projectId, projectId);
function vc(args) {
  return execFileSync(process.execPath, [cli, ...args, '--scope', 'yashshah1211s-projects'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
}
function inspect(url) {
  const value = JSON.parse(vc(['api', '/v13/deployments/' + new URL(url).hostname]));
  assert.equal(value.projectId, projectId); assert.equal(value.target, null, 'Must be a Preview deployment');
  return { id: value.id, url: 'https://' + value.url, target: value.target, readyState: value.readyState,
    projectId: value.projectId, origin, checkedAt: new Date().toISOString() };
}
try {
  if (stage === 'inspect') {
    const file = directory + '/deployment-' + process.argv[4] + '.json';
    const prior = JSON.parse(readFileSync(file, 'utf8')); assert(prior.url, 'Inspect provider state before retrying an uncertain submission');
    Object.assign(prior, inspect(prior.url)); writeFileSync(file, JSON.stringify(prior, null, 2));
    process.stdout.write(JSON.stringify(prior) + '\n');
  } else {
    const output = directory + '/deployment-' + stage + '.json';
    activeOutput = output;
    let prior;
    if (existsSync(output)) {
      assert(process.argv.includes('--retry-confirmed-no-submission'), 'Preserve deployment ledger; inspect existing attempt rather than resubmit');
      prior = JSON.parse(readFileSync(output, 'utf8'));
      assert(!prior.url && prior.status !== 'submitted', 'Do not resubmit an existing deployment');
      const list = JSON.parse(vc(['api', '/v6/deployments?projectId=' + projectId]));
      assert(list.deployments.every(d => d.created < Date.parse(prior.startedAt)), 'Remote deployment may already exist; stop');
    }
    if (stage === 'writes') {
      const auth = JSON.parse(readFileSync(directory + '/auth.json', 'utf8'));
      assert.equal(auth.status, 'passed'); assert.equal(auth.origin, origin);
    }
    const config = {};
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const match = line.match(/^(SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|INSIGHTFLOW_WRITES_ENABLED)=(.*)$/);
      if (match) config[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    }
    assert.equal(config.INSIGHTFLOW_WRITES_ENABLED, 'false', 'Local writes must remain disabled');
    assert.equal(new URL(config.SUPABASE_URL).hostname, 'dbacbcbglbqmqwxscesu.supabase.co');
    assert(config.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'), 'Require the existing low-privilege publishable key');
    const values = { INSIGHTFLOW_DATA_MODE: 'fixture', INSIGHTFLOW_WRITES_ENABLED: String(stage === 'writes'),
      INSIGHTFLOW_DEPLOYMENT_PROFILE: 'authenticated-preview', APP_ORIGIN: origin,
      SUPABASE_URL: config.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: config.SUPABASE_PUBLISHABLE_KEY };
    redactions = [config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY];
    operation = 'project preflight';
    const project = JSON.parse(vc(['api', '/v9/projects/' + projectId]));
    assert.equal(project.name, 'insightflow-preview'); assert.equal(project.accountId, link.orgId);
    assert.equal(project.ssoProtection, null); assert.equal(project.nodeVersion, '24.x');
    const team = JSON.parse(vc(['api', '/v2/teams/' + link.orgId]));
    assert.equal(team.billing.plan, 'hobby', 'No paid plan permitted');
    assert((project.env ?? []).every(item => Object.hasOwn(values, item.key)), 'Unexpected project environment configuration');
    operation = 'source audit';
    const dry = JSON.parse(vc(['deploy', '--dry', '--json', '--yes']));
    writeFileSync('artifacts/preview-source-manifest.json', JSON.stringify(dry, null, 2));
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/verify-preview-package.ts'], { stdio: 'pipe', windowsHide: true });
    const evidence = { stage, projectId, origin, status: 'attempt_started', startedAt: new Date().toISOString(),
      environmentNames: Object.keys(values), writesEnabled: stage === 'writes', sourceAuditPassed: true,
      priorAttempts: prior ? [...(prior.priorAttempts ?? []), { startedAt: prior.startedAt, status: prior.status, operation: prior.failedOperation, diagnostic: prior.diagnostic, remoteAbsenceVerified: true }] : [] };
    writeFileSync(output, JSON.stringify(evidence, null, 2));
    operation = 'deployment submission';
    const args = ['deploy', '--target=preview', '--yes', '--no-wait'];
    for (const [name, value] of Object.entries(values)) args.push('--env', name + '=' + value, '--build-env', name + '=' + value);
    // Child arguments and raw CLI errors can contain values: never echo either.
    const stdout = vc(args);
    const url = stdout.match(/https:\/\/insightflow-preview-[a-z0-9]+-yashshah1211s-projects\.vercel\.app/)?.[0];
    assert(url, 'Submission uncertain; inspect provider before retrying');
    Object.assign(evidence, { url, status: 'submitted' }); writeFileSync(output, JSON.stringify(evidence, null, 2));
    operation = 'deployment inspection';
    Object.assign(evidence, inspect(url)); writeFileSync(output, JSON.stringify(evidence, null, 2));
    process.stdout.write(JSON.stringify(evidence) + '\n');
  }
} catch (error) {
  let diagnostic = String(error.stderr || error.code || 'assertion/preflight failure');
  for (const value of redactions) diagnostic = diagnostic.replaceAll(value, '[redacted]');
  diagnostic = diagnostic.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted token]');
  if (activeOutput && existsSync(activeOutput)) {
    const ledger = JSON.parse(readFileSync(activeOutput, 'utf8'));
    Object.assign(ledger, { status: 'uncertain', failedOperation: operation, diagnostic });
    writeFileSync(activeOutput, JSON.stringify(ledger, null, 2));
  }
  process.stderr.write('Preview operation failed at ' + operation + '. No raw CLI error or environment values printed. Inspect the local ledger/provider state before any retry.\n');
  process.exitCode = 1;
}
