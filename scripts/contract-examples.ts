import { readFileSync, writeFileSync } from 'node:fs';
import { GET as dashboard } from '../src/app/api/dashboard/route';
import { GET as feedback } from '../src/app/api/feedback/route';
import { GET as issues } from '../src/app/api/issues/route';
import { GET as issue } from '../src/app/api/issues/[id]/route';
import { GET as decisions } from '../src/app/api/decisions/route';
import { GET as lab } from '../src/app/api/data-lab/route';
import { POST as manual } from '../src/app/api/feedback/route';
async function main() {
  process.env.INSIGHTFLOW_DATA_MODE = 'fixture';
  const req = (path: string) => new Request(`http://localhost${path}`);
  const examples = {
    dashboard: await (await dashboard(req('/api/dashboard'))).json(),
    feedbackRecords: await (await feedback(req('/api/feedback?pageSize=1'))).json(),
    feedbackPatterns: await (await feedback(req('/api/feedback?view=patterns&pageSize=1'))).json(),
    issues: await (await issues(req('/api/issues'))).json(),
    issueDetail: await (await issue(req('/api/issues/suspected_fraud'), { params: Promise.resolve({ id: 'suspected_fraud' }) })).json(),
    decisions: await (await decisions(req('/api/decisions?objective=operations'))).json(),
    dataLab: await (await lab(req('/api/data-lab'))).json(),
    writeError: await (await manual()).json(),
    invalidQueryError: await (await feedback(req('/api/feedback?page=0'))).json(),
  };
  writeFileSync('docs/api-examples.json', JSON.stringify(examples, null, 2) + '\n');
  const docPath = 'docs/API_CONTRACT.md';
  const docs = readFileSync(docPath, 'utf8');
  const marker = '<!-- generated-fixture-example -->';
  const existing = docs.split(marker)[0].trimEnd();
  writeFileSync(docPath, `${existing}\n\n${marker}\n\nFull pattern response captured from GET /api/feedback?view=patterns&pageSize=1:\n\n\`\`\`json\n${JSON.stringify(examples.feedbackPatterns, null, 2)}\n\`\`\`\n`);
  console.log('Generated docs/api-examples.json from response-validated route handlers.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
