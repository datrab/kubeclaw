import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {runPipelineV2,recoverPipelineV2} from '../../../skills/nova/core/execution/engine.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {readRunSnapshot} from '../../../skills/nova/core/execution/engine-snapshots.ts';

const source=path.resolve('.'),self=fileURLToPath(import.meta.url),runId='run:cache-profile';
function configuration(root){
  const roots=[path.join(source,'tests/fixtures/review-cache-stage'),path.join(source,'skills/common/plugins')];
  return {schemaVersion:'pipeline-platform.v2',installationRoots:roots,trustedBuiltinRoots:roots,
    externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{'artifacts.write':'kubeclaw.artifact-store:artifact-store','artifacts.read':'kubeclaw.artifact-store:artifact-store'},
    grants:{'test.review-cache:cache':{'artifacts.write':{allowedNamespaces:['kubeclaw.review']},'artifacts.read':{allowedNamespaces:['kubeclaw.review']}}},
    adapters:{'kubeclaw.artifact-store:artifact-store':{artifactRoot:path.join(root,'artifacts')}},
    activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:100,effectLockTtlMs:100,
    orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
}
const definition={schemaVersion:'pipeline-definition.v2',id:'test:cache-profile',maxConcurrency:1,
  stages:[{id:'review',type:'test.review-cache',dependsOn:[],config:{crashAttempts:[1,2],rewriteAttempts:[2]},input:{},
    execution:{maxAttempts:4,maxRemediationCycles:0,timeoutMs:10000}}]};
if(process.argv[2]==='--child'){
  const [root,mode]=process.argv.slice(3);
  const result=await(mode==='create'?runPipelineV2:recoverPipelineV2)(configuration(root),definition,runId);
  process.stdout.write(JSON.stringify({result})+'\n');
}else{
  test('genuine v4 StageExecutor checkpoints and retains same-key v2 refs through en/tr/sv interrupted attempts',async t=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'review-cache-native-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const p=configuration(root),location=runRoot(p.storageRoot,runId),journal=path.join(location,'events.jsonl');
    async function child(mode,locale,attempt){
      const processChild=spawn(process.execPath,[self,'--child',root,mode],{cwd:source,env:{...process.env,LANG:locale,LC_ALL:locale},stdio:['ignore','pipe','pipe']});
      let out='',err='',timeout=false;processChild.stdout.on('data',b=>out+=b);processChild.stderr.on('data',b=>err+=b);
      const timer=setTimeout(()=>{timeout=true;processChild.kill('SIGKILL');},30000);
      const [code,signal]=await once(processChild,'exit');clearTimeout(timer);
      assert.equal(timeout,false,'watchdog is not an expected checkpoint crash');
      if(attempt<3){assert.equal(signal,'SIGKILL',JSON.stringify({code,out,err}));assert.ok(out.endsWith(`CACHE_CHECKPOINT:${attempt}\n`),out);}
      else assert.equal(code,0,JSON.stringify({signal,out,err}));
      const lines=out.trim().split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
      if(attempt===3)assert.equal(lines.at(-1).result.status,'succeeded',JSON.stringify(lines));
      return lines.find(line=>line.attempt===attempt);
    }
    const first=await child('create','en_US.UTF-8',1);assert.equal(first.executions,1);assert.equal(first.prior.length,0);
    const snapshot=readRunSnapshot(location);assert.equal(snapshot.schemaVersion,'run-snapshot.v4');
    const snapshotBytes=fs.readFileSync(path.join(location,'run-snapshot.json')),prefix1=fs.readFileSync(journal);
    const second=await child('recover','tr_TR.UTF-8',2);assert.equal(second.hits,1);assert.equal(second.executions,0);assert.equal(second.prior.length,1);
    assert.deepEqual(fs.readFileSync(journal).subarray(0,prefix1.length),prefix1);
    assert.equal(second.artifacts[0].digest,first.artifacts[0].digest,'same v2 key/value across locales keeps all original bytes');
    const prefix2=fs.readFileSync(journal),third=await child('recover','sv_SE.UTF-8',3);
    assert.equal(third.hits,1);assert.equal(third.executions,0);assert.equal(third.prior.length,2);
    assert.deepEqual(third.prior.map(a=>a.producer.attemptNumber),[1,2]);
    assert.equal(new Set(third.prior.map(a=>a.digest)).size,1);assert.equal(third.artifacts[0].producer.attemptNumber,1);
    assert.deepEqual(fs.readFileSync(journal).subarray(0,prefix2.length),prefix2);
    assert.deepEqual(fs.readFileSync(path.join(location,'run-snapshot.json')),snapshotBytes);
    const events=fs.readFileSync(journal,'utf8').trim().split('\n').map(line=>JSON.parse(line).entry);
    assert.equal(events.filter(e=>e.type==='artifact.created').length,2);
    assert.ok(events.filter(e=>e.type==='artifact.created').every(e=>e.payload.checkpoint===true));
    t.diagnostic(JSON.stringify({nativeModel:false,registeredTestStage:true,attempts:3,seedExecutions:1,retainedRefs:2,digest:first.artifacts[0].digest}));
  });
}
