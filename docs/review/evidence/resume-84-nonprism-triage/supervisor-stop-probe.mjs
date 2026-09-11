import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const repository=process.cwd(),root=fs.mkdtempSync(path.join(os.tmpdir(),'supervisor-stop-review-'));
const f=name=>path.join(root,name),write=(name,value)=>fs.writeFileSync(f(name),JSON.stringify(value));
const roots=['common','nova','buster'].map(role=>path.join(repository,'skills',role,'plugins'));
write('platform.json',{schemaVersion:'pipeline-platform.v2',installationRoots:roots,trustedBuiltinRoots:roots,externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},storageRoot:f('state'),shutdownTimeoutMs:1000,orchestratorIssuerId:'supervisor-stop-review',administrativeDecisionIssuers:[],providers:{'git.repository.read':'kubeclaw.repository-adapter:repository','artifacts.write':'kubeclaw.artifact-store:artifact-store'},grants:{'kubeclaw.preflight-contract:validate':{'git.repository.read':{allowedPrefixes:['modules/']},'artifacts.write':{allowedNamespaces:['kubeclaw.preflight-contract']}}},adapters:{'kubeclaw.repository-adapter:repository':{repositoryRoot:f('repository')},'kubeclaw.artifact-store:artifact-store':{artifactRoot:f('artifacts')}},activeAdapters:[],observers:{}});
fs.mkdirSync(f('repository'),{recursive:true});
write('pipeline.json',{});
const args=['scripts/supervise-repository-review.mjs','--workdir',repository,'--platform',f('platform.json'),'--graph',f('pipeline.json'),'--run-id','supervisor-stop-review','--heartbeat',f('heartbeat.json'),'--resource-log',f('resources.jsonl'),'--diagnostic-dir',f('diagnostics'),'--log',f('pipeline.log'),'--lease',f('lease.json'),'--max-recoveries','1','--initial-mode','start'];
const child=spawn(process.execPath,args,{cwd:repository,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
try{
 const deadline=Date.now()+15000;
 while(!fs.existsSync(f('diagnostics/attempt-1-exit.json'))){assert(Date.now()<deadline,'first genuine CLI failure missing');await new Promise(r=>setTimeout(r,20));}
 // Let the synchronous original status subprocess return and reach its recovery wait.
 await new Promise(r=>setTimeout(r,1200));
 const stopAt=new Date().toISOString();assert(child.kill('SIGTERM'));
 const outcome=await Promise.race([exited,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('supervisor failed to settle')),12000);timer.unref();})]);
 const diagnostics=fs.readdirSync(f('diagnostics')).sort().map(name=>JSON.parse(fs.readFileSync(f('diagnostics/'+name),'utf8')));
 console.log(JSON.stringify({args,stopAt,outcome,diagnostics,stdout,stderr,pipelineLog:fs.readFileSync(f('pipeline.log'),'utf8'),leaseRetained:fs.existsSync(f('lease.json'))},null,2));
 assert.equal(outcome.code,75,'current behavior must be reproduced exactly');assert.equal(diagnostics.length,2);assert.equal(diagnostics[1].mode,'recover');assert.equal(diagnostics[1].stopping,false);assert(diagnostics[1].capturedAt>stopAt);
}catch(error){console.error(JSON.stringify({stdout,stderr,log:fs.existsSync(f('pipeline.log'))?fs.readFileSync(f('pipeline.log'),'utf8'):null}));throw error;}finally{child.kill('SIGTERM');fs.rmSync(root,{recursive:true,force:true});}
