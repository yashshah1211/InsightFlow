import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import process, { env, argv, execPath, exit } from 'node:process';
const root = resolve('.next/standalone');
if (!existsSync(resolve(root,'server.js'))) throw new Error('Run npm run build before npm start');
const options = { PORT: env.PORT ?? '3000', HOSTNAME: env.HOSTNAME ?? '127.0.0.1' };
for (let i=2;i<argv.length;i+=2) {
  if (argv[i]==='--port') options.PORT=argv[i+1];
  else if (argv[i]==='--hostname') options.HOSTNAME=argv[i+1];
  else throw new Error('Supported start flags: --port and --hostname');
}
// Next standalone does not automatically copy static/public assets.
cpSync(resolve('.next/static'),resolve(root,'.next/static'),{recursive:true});
if (existsSync('public')) cpSync(resolve('public'),resolve(root,'public'),{recursive:true});
const child=spawn(execPath,[resolve(root,'server.js')],{cwd:root,env:{...env,...options},stdio:'inherit'});
process.on('SIGINT',()=>child.kill('SIGINT'));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
child.on('exit',code=>exit(code ?? 1));
