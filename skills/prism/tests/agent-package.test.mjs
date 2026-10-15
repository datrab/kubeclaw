import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rename,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {buildPrismImageBundle} from '../../../scripts/build-prism-image-bundle.mjs';

test('actual agent image COPY context imports the real bridge, prompt, WorkerCore and locked validators after relocation',async()=>{
 const target=await mkdtemp(join(tmpdir(),'prism-agent-package-'));
 try{
  const dockerfile=await readFile('docker/Dockerfile.prism-agent','utf8');
  assert.ok(dockerfile.includes('COPY --from=prism-bridge-dependencies /image/role /app/prism'));
  assert.ok(dockerfile.includes('node scripts/build-prism-image-bundle.mjs prism-agent-bridge /image'));
  const result=await buildPrismImageBundle({repository:resolve('.'),output:join(target,'image'),callerId:'prism-agent-bridge',revision:'a'.repeat(40),builtAt:'2026-10-15T00:00:00Z'});
  const relocated=join(target,'relocated-role'); await rename(result.packageRoot,relocated);
  const child=spawn(process.execPath,['--input-type=module','-e',`
    await import('./skills/packages/prism-engine/server/agent-job-runner.mjs');
    const {preferencePrompt}=await import('./skills/packages/prism-engine/server/preference-prompt.mjs');
    if(!preferencePrompt({generationId:'g',snapshotDigest:'d',snapshot:{}}).includes('generationId g')) throw new Error('prompt import');
    const {agentLauncherProfile}=await import('./skills/packages/prism-engine/server/agent-attempt.ts');
    console.log((await agentLauncherProfile()).engine.engineId);
  `],{cwd:relocated,stdio:'pipe'});
  let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
  const code=await new Promise(resolve=>child.once('close',resolve));assert.equal(code,0,output);assert.match(output,/prism-openclaw-launcher/);
 }finally{await rm(target,{recursive:true,force:true});}
});
