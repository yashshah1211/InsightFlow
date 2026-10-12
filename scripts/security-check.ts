import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const pending=execFileSync('git',['ls-files','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const credentialPattern=/(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:sk-|pt_live_)[A-Za-z0-9_-]{20,}|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,})/;
const bad:string[]=[];
for (const path of [...new Set([...tracked,...pending])]) {
  if ((/^\.env/.test(path)&&path!=='.env.example') || /^(?:node_modules|\.next|artifacts|data\/processed)\//.test(path) ||
    (/^data\/raw\//.test(path)&&path!=='data/raw/.gitkeep')) { bad.push(path);continue; }
  const text=readFileSync(path,'utf8');
  if (credentialPattern.test(text)) bad.push(path);
  if (path.endsWith('.tsx') && /(?:SUPABASE_SERVICE_ROLE_KEY|ADAPTION_API_KEY)/.test(text)) bad.push(path);
}
if (bad.length) { console.error('Security check failed (filenames only):',bad);process.exitCode=1; }
else console.log('PASS credential/artifact scan; no protected data or credential patterns in tracked/pending source');
execFileSync('git',['diff','--check'],{stdio:'inherit'});
console.log('PASS whitespace/diff check');
