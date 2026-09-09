import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,cp,mkdir,symlink,rm} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';

test('actual agent image COPY context imports the real bridge, prompt, WorkerCore and locked validators after relocation',async()=>{
 const target=await mkdtemp(join(tmpdir(),'prism-agent-package-'));
 try{
  const dockerfile=await readFile('docker/Dockerfile.prism-agent','utf8');
  const line=dockerfile.split('\n').find(value=>value.startsWith('COPY skills/prism/server/agent-bridge.mjs '));assert.ok(line);
  const sources=line.split(/\s+/).slice(1,-1);assert.ok(sources.includes('skills/prism/server/preference-prompt.mjs'));
  for(const source of sources)await cp(source,join(target,basename(source)));
  await mkdir(join(target,'node_modules/@kubeclaw'),{recursive:true});
  await mkdir(join(target,'skills/worker'),{recursive:true});await cp('skills/worker/core',join(target,'skills/worker/core'),{recursive:true});
  await mkdir(join(target,'contracts/pipeline-worker-core'),{recursive:true});await cp('contracts/pipeline-worker-core/v1',join(target,'contracts/pipeline-worker-core/v1'),{recursive:true});
  await symlink('../../skills/worker/core',join(target,'node_modules/@kubeclaw/worker-core'));
  await symlink('../../contracts/pipeline-worker-core/v1',join(target,'node_modules/@kubeclaw/pipeline-worker-core-contract'));
  const installed=new Set();
  const dependency=async(name)=>{
   if(installed.has(name))return;installed.add(name);
   const manifest=JSON.parse(await readFile(`node_modules/${name}/package.json`,'utf8'));
   await cp(`node_modules/${name}`,join(target,'node_modules',name),{recursive:true,dereference:true});
   for(const child of Object.keys(manifest.dependencies??{}))await dependency(child);
  };
  const contract=JSON.parse(await readFile('contracts/pipeline-worker-core/v1/package.json','utf8'));
  for(const name of Object.keys(contract.dependencies))await dependency(name);
  const child=spawn(process.execPath,['--input-type=module','-e',"await import('./agent-job-runner.mjs'); const {agentAttempt}=await import('./agent-attempt.ts'); const {randomUUID}=await import('node:crypto'); const result=await agentAttempt({id:randomUUID(),fence:randomUUID(),expires_at:new Date(Date.now()+60000),request_digest:'sha256:'+'0'.repeat(64),request:{}},'package-test'); console.log(result.profile.engine.engineId);"],{cwd:target,stdio:'pipe'});
  let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
  const code=await new Promise(resolve=>child.once('close',resolve));assert.equal(code,0,output);assert.match(output,/prism-openclaw-launcher/);
 }finally{await rm(target,{recursive:true,force:true});}
});
