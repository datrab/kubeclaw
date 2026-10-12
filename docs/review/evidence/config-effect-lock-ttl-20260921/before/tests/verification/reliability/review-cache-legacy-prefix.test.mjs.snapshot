// Exact archived owning cache producer, current registered ArtifactStore and native process death.
// Crash invocation uses the profile read from an original snapshot; full StageExecutor
// propagation/checkpoint recovery is covered separately, not simulated by this context.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {admittedCacheValue} from '../../fixtures/review-cache-stage/value.mjs';
import {readRunSnapshot} from '../../../skills/nova/core/execution/engine-snapshots.ts';
import {prepareRuntime} from '../../../skills/nova/core/execution/engine-runtime.ts';
import {AdapterRuntime,EffectCoordinator,FileEffectJournal,FileResourceLockManager} from '../../../skills/nova/core/src/index.ts';

// These tests exercise real I/O and crash recovery, not sub-second deadlines.
// Keep operation budgets below the 30-second child watchdog on loaded CI runners.
const ioTimeoutMs=5000,lockTtlMs=10000;
const source=path.resolve('.'),self=fileURLToPath(import.meta.url),fixtures=path.join(source,'tests/verification/reliability/fixtures');
const archived=path.join(fixtures,'legacy-review-cache');
function verify(file,sha){const bytes=fs.readFileSync(file);assert.equal(crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),sha);}
async function modules(root,version,old){
  const manifest=JSON.parse(fs.readFileSync(path.join(archived,'provenance.json'),'utf8'));
  for(const file of manifest.files)verify(path.join(archived,file.archivePath),file.gitBlobSha1);
  const core=path.join(root,'core'),review=path.join(root,'review');
  if(!fs.existsSync(core)){
    fs.cpSync(path.join(source,'skills/nova/core'),core,{recursive:true,filter:f=>!f.split(path.sep).includes('node_modules')});
    fs.symlinkSync(path.join(source,'node_modules'),path.join(core,'node_modules'),'dir');
    if(version!=='v4'){
      let snapshot=path.join(archived,'engine-snapshots.ts.txt');
      if(version==='v2'){
        snapshot=path.join(fixtures,'legacy-transport-profile/engine-snapshots-v2.ts.txt');
        verify(snapshot,JSON.parse(fs.readFileSync(path.join(fixtures,'legacy-transport-profile/provenance.json'),'utf8')).gitBlobSha1);
      }
      if(version==='v1'){
        const base=path.join(fixtures,'legacy-source-producer'),provenance=JSON.parse(fs.readFileSync(path.join(base,'provenance.json'),'utf8'));
        snapshot=path.join(base,'core/execution/engine-snapshots.ts.txt');
        for(const name of ['engine-snapshots.ts','graph.ts']){
          const relative=`core/execution/${name}.txt`;verify(path.join(base,relative),provenance.files.find(f=>f.archivePath===relative).gitBlobSha1);
        }
        fs.copyFileSync(path.join(base,'core/execution/graph.ts.txt'),path.join(core,'execution/graph.ts'));
      }
      fs.copyFileSync(snapshot,path.join(core,'execution/engine-snapshots.ts'));
    }
    fs.mkdirSync(review);fs.symlinkSync(path.join(source,'node_modules'),path.join(review,'node_modules'),'dir');
    for(const name of ['repository-audit-cache.ts','review-content-cache.ts'])fs.copyFileSync(path.join(archived,name+'.txt'),path.join(review,name));
    fs.copyFileSync(path.join(source,'skills/nova/plugins/review/src/review-ordering.ts'),path.join(review,'review-ordering.ts'));
  }
  const selected=old&&version!=='v4'?review:path.join(source,'skills/nova/plugins/review/src');
  return {snapshots:await import(pathToFileURL(path.join(core,'execution/engine-snapshots.ts'))),
    cache:await import(pathToFileURL(path.join(selected,'repository-audit-cache.ts'))),records:await import(pathToFileURL(path.join(selected,'review-content-cache.ts')))};
}
function platform(root){
  const roots=[path.join(source,'tests/fixtures/review-cache-stage'),path.join(source,'skills/common/plugins')];
  return {schemaVersion:'pipeline-platform.v2',installationRoots:roots,trustedBuiltinRoots:roots,externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},
    providers:{'artifacts.read':'kubeclaw.artifact-store:artifact-store','artifacts.write':'kubeclaw.artifact-store:artifact-store'},
    grants:{'test.review-cache:cache':{'artifacts.read':{allowedNamespaces:['kubeclaw.review']},'artifacts.write':{allowedNamespaces:['kubeclaw.review']}}},
    adapters:{'kubeclaw.artifact-store:artifact-store':{artifactRoot:path.join(root,'artifacts')}},activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),
    shutdownTimeoutMs:ioTimeoutMs,effectLockTtlMs:lockTtlMs,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
}
const definition={schemaVersion:'pipeline-definition.v2',id:'test:cache-prefix',maxConcurrency:1,stages:[{id:'review',type:'test.review-cache',dependsOn:[],
  config:{crashAttempts:[],rewriteAttempts:[]},input:{},execution:{maxAttempts:3,maxRemediationCycles:0,timeoutMs:10000}}]};
if(process.argv[2]==='--child'){
  const [root,version,operation,boundary,producer]=process.argv.slice(3),old=producer==='archive';
  const m=await modules(root,version,old),snapshotRoot=path.join(root,'snapshot');fs.mkdirSync(snapshotRoot,{recursive:true});
  if(!fs.existsSync(path.join(snapshotRoot,'run-snapshot.json')))m.snapshots.writeRunSnapshots(snapshotRoot,m.snapshots.graphSnapshot(definition),{});
  const snapshot=readRunSnapshot(snapshotRoot),profile=snapshot.schemaVersion==='run-snapshot.v4'?snapshot.reviewCacheProfile:undefined;
  const p=platform(root),prepared=await prepareRuntime(p,definition),journalFile=path.join(root,operation==='seed'?'seed-effects.jsonl':'effects.jsonl');
  const audit=Object.fromEntries(['requested','accepted','completed'].map(phase=>[phase,request=>{
    if(phase===boundary){fs.writeSync(1,`CACHE_AUDIT:${phase}\n`);process.kill(process.pid,'SIGKILL');}
  }]));
  const journal=new FileEffectJournal(journalFile),runtime=new AdapterRuntime({granted:prepared.granted,activated:prepared.activated,configs:new Map(Object.entries(p.adapters)),
    effects:new EffectCoordinator(journal,undefined,audit,new FileResourceLockManager(path.join(root,'locks')),lockTtlMs),shutdownTimeoutMs:ioTimeoutMs,async emitDomainEvent(){throw Error('UNEXPECTED_EVENT');}});
  await runtime.start();
  const {job,identity,value}=admittedCacheValue(),record=m.records.buildReviewCacheRecord(job,identity,value,profile);
  const attempt={runId:'run:cache-prefix',stageId:'review',attemptId:operation==='read'?'attempt:read':'attempt:write',attemptNumber:operation==='read'?2:1};
  const refFile=path.join(root,'refs.json');
  const context={contract:{lease:{attempt},artifacts:operation==='read'?JSON.parse(fs.readFileSync(refFile,'utf8')):[],...(profile?{reviewCacheProfile:profile}:{})},
    invoke:(capability,request)=>runtime.invoke(capability,attempt,`cache:${operation==='seed'?'write':operation}`,request,new AbortController().signal)};
  const cache=new m.cache.RepositoryAuditArtifactCache(context);let error,parsed;
  try{
    if(operation==='read')parsed=m.records.parseReviewCacheRecord(await cache.read(record.cacheKey),job,identity);
    else {await cache.write(record);fs.writeFileSync(refFile,JSON.stringify(cache.artifacts()));}
  }catch(e){error=e.message;}finally{await runtime.shutdown();}
  const request=await journal.request(`cache:${operation==='seed'?'write':operation}`);
  console.log(JSON.stringify({error:error??null,parsedVersion:parsed?.schemaVersion,request,snapshotVersion:snapshot.schemaVersion}));
}else{
  async function child(root,version,operation,boundary='none',producer='current',locale='en_US.UTF-8'){
    const p=spawn(process.execPath,[self,'--child',root,version,operation,boundary,producer],{cwd:source,env:{...process.env,LANG:locale,LC_ALL:locale},stdio:['ignore','pipe','pipe']});
    let out='',err='',timedOut=false;p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);
    const timer=setTimeout(()=>{timedOut=true;p.kill('SIGKILL');},30000),[code,signal]=await once(p,'exit');clearTimeout(timer);
    assert.equal(timedOut,false,'watchdog is not an expected audit boundary');
    if(boundary!=='none'){assert.equal(signal,'SIGKILL',JSON.stringify({code,err,out}));assert.equal(out,`CACHE_AUDIT:${boundary}\n`);return;}
    assert.equal(code,0,JSON.stringify({signal,err,out}));return JSON.parse(out);
  }
  for(const version of ['v1','v2','v3','v4'])for(const operation of ['write','read'])for(const boundary of ['requested','accepted','completed']){
    test(`${version} original cache ${operation} ${boundary} SIGKILL preserves exact pending operation and authority`,async t=>{
      const root=fs.mkdtempSync(path.join(os.tmpdir(),'cache-prefix-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
      if(operation==='read'){const seed=await child(root,version,'seed','none','archive');assert.equal(seed.error,null);}
      await child(root,version,operation,boundary,'archive');
      const file=path.join(root,'effects.jsonl'),prefix=fs.readFileSync(file),entries=prefix.toString().trim().split('\n').map(line=>JSON.parse(line).entry);
      assert.deepEqual(entries.map(e=>e.type),boundary==='requested'?['requested']:boundary==='accepted'?['requested','accepted']:['requested','accepted','completed']);
      const requested=entries[0].request;assert.equal(requested.operation,operation==='write'?'put_json':version==='v4'?'get_json_bytes':'get_json');
      assert.equal(Object.hasOwn(requested.payload,operation==='write'?'encoding':'reference'),version==='v4');
      if(operation==='write')assert.equal(requested.payload.value.schemaVersion,version==='v4'?'review-content-cache.v2':'review-content-cache.v1');
      const result=await child(root,version,operation,'none','current',version==='v4'?'tr_TR.UTF-8':'en_US.UTF-8');
      assert.deepEqual(result.request,requested);assert.deepEqual(fs.readFileSync(file).subarray(0,prefix.length),prefix);
      if(boundary==='accepted'){assert.match(result.error,/EFFECT_RECOVERY_RECEIPT_UNAVAILABLE/);assert.deepEqual(fs.readFileSync(file),prefix);}
      else{assert.equal(result.error,null);if(boundary==='completed')assert.deepEqual(fs.readFileSync(file),prefix);}
      assert.equal(result.snapshotVersion,`run-snapshot.${version}`);
      if(operation==='read'&&boundary==='completed'&&version!=='v4'){
        const wrongLocale=await child(root,version,operation,'none','current','tr_TR.UTF-8');
        assert.match(wrongLocale.error,/cache proof is invalid/);assert.deepEqual(fs.readFileSync(file),prefix);
      }
    });
  }
}
