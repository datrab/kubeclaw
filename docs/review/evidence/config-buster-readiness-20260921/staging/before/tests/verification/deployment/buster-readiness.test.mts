import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseAllDocuments} from 'yaml';
import {runDependencyProcess} from '../../../skills/buster/engine/test-gates/dependency-process.ts';
import {BuildkitReadiness} from '../../../skills/buster/engine/test-gates/buildkit-readiness.ts';

// Native Node proves the generic process mechanism only. It is never a BuildKit executable.
test('bounded dependency process terminates actual child process groups and awaits closure',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'readiness-process-'));
 try{
  const pidfile=path.join(root,'pids.json');
  const script=`const fs=require('node:fs');const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(process.argv[1],JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);`;
  const result=await runDependencyProcess({executable:process.execPath,args:['-e',script,pidfile],maximumExecutionMs:300,maximumOutputBytes:1024});
  assert.equal(result.code,'DEPENDENCY_TIMEOUT');assert.equal(result.signal,'SIGKILL');assert.ok(result.durationMs<3000);
  const pids=JSON.parse(fs.readFileSync(pidfile,'utf8')) as number[];
  for(const pid of pids){
   // A killed orphan can briefly remain a zombie until the container's init reaps it.
   try{const stat=fs.readFileSync(`/proc/${pid}/stat`,'utf8');assert.match(stat,/\) Z /u);}
   catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('bounded process limits actual output and exports safe cause metadata without payload or inherited credentials',async()=>{
 const canary='private-platform-canary';const old=process.env.KUBECLAW_READINESS_PRIVATE_TEST;
 process.env.KUBECLAW_READINESS_PRIVATE_TEST=canary;
 try{
  const result=await runDependencyProcess({executable:process.execPath,args:['-e',"if(process.env.KUBECLAW_READINESS_PRIVATE_TEST)process.exit(33);process.stdout.write('private-diagnostic-canary'.repeat(10000));setInterval(()=>{},1000)"],maximumExecutionMs:1000,maximumOutputBytes:64});
  assert.equal(result.code,'DEPENDENCY_OUTPUT_LIMIT');assert.equal(result.signal,'SIGKILL');
  assert.doesNotMatch(JSON.stringify(result),/private-platform-canary|private-diagnostic-canary/u);
  const success=await runDependencyProcess({executable:process.execPath,args:['-e','process.exit(0)'],maximumExecutionMs:1000,maximumOutputBytes:64});
  assert.equal(success.code,'DEPENDENCY_OK');
 }finally{if(old===undefined)delete process.env.KUBECLAW_READINESS_PRIVATE_TEST;else process.env.KUBECLAW_READINESS_PRIVATE_TEST=old;}
});
test('missing native BuildKit fails closed; concurrent callers share one check and completed checks are never cached',async()=>{
 const check=new BuildkitReadiness({buildctlExecutable:'/missing/native/buildctl-private-path',buildkitHost:'unix:///missing/buildkit.sock',maximumExecutionMs:1000,maximumOutputBytes:1024});
 const first=check.check();assert.equal(check.check(),first);const failed=await first;
 assert.equal(failed.ok,false);assert.equal(failed.code,'DEPENDENCY_SPAWN_FAILED');assert.equal(failed.errno,'ENOENT');
 const next=check.check();assert.notEqual(next,first);assert.equal((await next).ok,false);
 assert.doesNotMatch(JSON.stringify(failed),/buildctl-private-path/u);
 await check.shutdown();
 const stopped=await check.check();assert.equal(stopped.code,'DEPENDENCY_CANCELLED');assert.equal(stopped.errno,null);
 assert.throws(()=>new BuildkitReadiness({buildctlExecutable:'/usr/local/bin/buildctl',buildkitHost:'unix:///buildkit.sock',maximumExecutionMs:30001,maximumOutputBytes:1024}),/DEPENDENCY_PROCESS_LIMIT_INVALID/u);
});
test('actual Helm uses bootstrap and functional readiness separately from liveness',()=>{
 const rendered=spawnSync('helm',['template','readiness-test','charts/kubeclaw','-f','my-values/buster-values.yaml','--set','runtimeInfrastructure.registry.endpoint=https://registry.example.test','--set','runtimeInfrastructure.registry.transport=https','--set','runtimeInfrastructure.registry.authSecretName=registry-test'],{encoding:'utf8'});
 assert.equal(rendered.status,0,rendered.stderr);
 const deployment=parseAllDocuments(rendered.stdout).map(doc=>doc.toJSON()).find(doc=>doc?.kind==='Deployment'&&doc.spec.template.spec.containers.some((item:{name:string})=>item.name==='buster-v2-runtime'));
 const worker=deployment.spec.template.spec.containers.find((item:{name:string})=>item.name==='buster-v2-runtime');
 assert.equal(worker.startupProbe.httpGet.path,'/bootstrapz');assert.equal(worker.readinessProbe.httpGet.path,'/readyz');assert.equal(worker.livenessProbe.httpGet.path,'/healthz');
 assert.equal(worker.readinessProbe.timeoutSeconds,2);
});

test('dependency shutdown cancels native descendants before returning and pre-aborted work never starts', async () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'readiness-cancel-'));
 const controller=new AbortController();
 const pidfile=path.join(root,'pids.json');
 const script=`const fs=require('node:fs');const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(process.argv[1],JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);`;
 const pending=runDependencyProcess({executable:process.execPath,args:['-e',script,pidfile],maximumExecutionMs:30000,maximumOutputBytes:1024,signal:controller.signal});
 try {
  const deadline=Date.now()+2000;
  while(!fs.existsSync(pidfile)&&Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(fs.existsSync(pidfile),'actual child must start before cancellation');
  const pids=JSON.parse(fs.readFileSync(pidfile,'utf8')) as number[];
  const started=Date.now();
  controller.abort();
  const result=await pending;
  assert.equal(result.code,'DEPENDENCY_CANCELLED');assert.equal(result.signal,'SIGKILL');
  assert.ok(Date.now()-started<2000,'shutdown must not wait for the 30-second probe deadline');
  for(const pid of pids){
   try{assert.match(fs.readFileSync(`/proc/${pid}/stat`,'utf8'),/\) Z /u);}
   catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  }
  const marker=path.join(root,'must-not-start');
  const cancelled=await runDependencyProcess({executable:process.execPath,args:['-e',"require('node:fs').writeFileSync(process.argv[1],'started')",marker],maximumExecutionMs:30000,maximumOutputBytes:1024,signal:controller.signal});
  assert.equal(cancelled.code,'DEPENDENCY_CANCELLED');assert.equal(cancelled.signal,null);assert.equal(fs.existsSync(marker),false);
 } finally {controller.abort();await pending;fs.rmSync(root,{recursive:true,force:true});}
});
