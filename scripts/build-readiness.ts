import { existsSync, readFileSync } from 'node:fs';
import { validateOfficialArtifact } from '../src/lib/db/validate-official';
import { deploymentProfile } from '../src/lib/db/deployment-profile';
deploymentProfile();
const mode=process.env.INSIGHTFLOW_DATA_MODE;
if (process.env.VERCEL && !mode) throw new Error('Vercel requires explicit INSIGHTFLOW_DATA_MODE; official deployments must never fall back to fixtures.');
if (mode==='official' && !existsSync('data/processed/official.json')) throw new Error('Official mode requires npm run data:prepare before build. Never deploy unlabeled fixture fallback.');
if (mode && !['official','fixture','database'].includes(mode)) throw new Error('Unsupported INSIGHTFLOW_DATA_MODE');
if (mode === 'official' || (!mode && existsSync('data/processed/official.json'))) {
  validateOfficialArtifact(JSON.parse(readFileSync('data/processed/official.json', 'utf8')));
}
console.log('Build dataset readiness checked.');
