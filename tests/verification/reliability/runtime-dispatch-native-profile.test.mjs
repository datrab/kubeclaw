// Actual original run creation, registered adapters, HTTP and process death.
// The 503 ACP receiver is deliberately NOT a Gateway; no session success claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

// These tests exercise real I/O and crash recovery, not sub-second deadlines.
// Keep operation budgets below the 30-second child watchdog on loaded CI runners.
const ioTimeoutMs=5000,lockTtlMs=10000;
const source=path.resolve('.'),self=fileURLToPath(import.meta.url);
const fixtures=path.join(source,'tests/verification/reliability/fixtures');
const runId='run:transport-profile',key='dispatch:profile-boundary';
const definition={schemaVersion:'pipeline-definition.v2',id:'pipeline:profile',maxConcurrency:1,stages:[{
  id:'architecture',type:'kubeclaw.validate.architecture',dependsOn:[],config:{agent:'agent'},
  input:{task:'Review the scores.',architecture:{ä:1,z:2}},execution:{maxAttempts:1,maxRemediationCycles:0,timeoutMs:5000},
}]};
function platform(root,origin,kind){
  const runtimeId=`kubeclaw.runtime-dispatch:${kind==='generic'?'runtime':'openclaw'}`;
  const roots=['common','nova'].map(role=>path.join(source,'skills',role,'plugins'));
  return {schemaVersion:'pipeline-platform.v2',installationRoots:roots,trustedBuiltinRoots:roots,
    externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{'runtime.dispatch':runtimeId,
      'network.http':'kubeclaw.network-http:http','secrets.read':'kubeclaw.secret-resolver:secrets',
      'git.repository.read':'kubeclaw.repository-adapter:repository','artifacts.read':'kubeclaw.artifact-store:artifact-store','artifacts.write':'kubeclaw.artifact-store:artifact-store'},
    grants:{'kubeclaw.architecture-validator:architecture':{'runtime.dispatch':{allowedAgents:['agent']},
      'git.repository.read':{allowedPrefixes:['.']},'artifacts.read':{allowedNamespaces:['kubeclaw.architecture-validator']},'artifacts.write':{allowedNamespaces:['kubeclaw.architecture-validator']}},
      [runtimeId]:{'network.http':{allowedOrigins:[origin]},'secrets.read':{allowedNames:['runtime.token']},...(kind==='generic'?{}:{'git.repository.read':{allowedPrefixes:['.']}})}},
    adapters:{[runtimeId]:{targets:{agent:kind==='generic'?{endpoint:origin+'/ack',tokenSecret:'runtime.token'}:
      {endpoint:origin+'/fault',tokenSecret:'runtime.token',runtime:'acp',agentId:'audit',agentRole:'architecture',model:'audit/model',cwd:root,
        repositoryRoot:root,resultPathPrefix:'results',spawnIntervalMs:0,pollMs:10,maxPollMs:10,maxPolls:1,sessionTimeoutMs:ioTimeoutMs}}},
      'kubeclaw.network-http:http':{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['authorization','content-type','idempotency-key','x-kubeclaw-signature'],timeoutMs:ioTimeoutMs},
      'kubeclaw.secret-resolver:secrets':{environment:{'runtime.token':'KUBECLAW_PROFILE_LOCAL_TOKEN'}},
      'kubeclaw.repository-adapter:repository':{repositoryRoot:root},'kubeclaw.artifact-store:artifact-store':{artifactRoot:path.join(root,'artifacts')}},
    activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:ioTimeoutMs,effectLockTtlMs:lockTtlMs,
    orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
}
function archivedCore(root,version){
  if(version==='v4')return path.join(source,'skills/nova/core');
  const target=path.join(root,'archived-core');
  if(!fs.existsSync(target)){
    fs.cpSync(path.join(source,'skills/nova/core'),target,{recursive:true,filter:file=>!file.split(path.sep).includes('node_modules')});
    fs.symlinkSync(path.join(source,'node_modules'),path.join(target,'node_modules'),'dir');
    const old=version==='v1'?path.join(fixtures,'legacy-source-producer/core/execution/engine-snapshots.ts.txt'):
      version==='v2'?path.join(fixtures,'legacy-transport-profile/engine-snapshots-v2.ts.txt'):
      path.join(fixtures,'legacy-review-cache/engine-snapshots.ts.txt');
    const manifest=JSON.parse(fs.readFileSync(path.join(fixtures,version==='v1'?'legacy-source-producer/provenance.json':
      version==='v2'?'legacy-transport-profile/provenance.json':'legacy-review-cache/provenance.json'),'utf8'));
    const verify=(file,sha)=>{const bytes=fs.readFileSync(file);assert.equal(crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),sha);};
    verify(old,version==='v1'?manifest.files.find(x=>x.archivePath==='core/execution/engine-snapshots.ts.txt').gitBlobSha1:
      version==='v2'?manifest.gitBlobSha1:manifest.files.find(x=>x.archivePath==='engine-snapshots.ts.txt').gitBlobSha1);
    fs.copyFileSync(old,path.join(target,'execution/engine-snapshots.ts'));
    if(version==='v1'){
      const graph=path.join(fixtures,'legacy-source-producer/core/execution/graph.ts.txt');
      verify(graph,manifest.files.find(x=>x.archivePath==='core/execution/graph.ts.txt').gitBlobSha1);
      fs.copyFileSync(graph,path.join(target,'execution/graph.ts'));
    }
  }
  return target;
}
if(process.argv[2]==='--child'){
  const [root,origin,version,mode,boundary,localeJournal]=process.argv.slice(3);
  process.env.KUBECLAW_PROFILE_LOCAL_TOKEN='deliberate-local-profile-token';
  const core=await import(pathToFileURL(path.join(source,'skills/nova/core/src/index.ts')));
  const snapshots=await import(pathToFileURL(path.join(source,'skills/nova/core/execution/engine-snapshots.ts')));
  const {prepareRuntime}=await import(pathToFileURL(path.join(source,'skills/nova/core/execution/engine-runtime.ts')));
  const {runRoot}=await import(pathToFileURL(path.join(source,'skills/nova/core/execution/run-root.ts')));
  const {buildArchitectureRequest}=await import(pathToFileURL(path.join(source,'skills/nova/plugins/architecture-validator/src/protocol.ts')));
  const p=platform(root,origin,mode==='prefix'||mode.startsWith('helper-')?'generic':'acp');
  const location=runRoot(p.storageRoot,runId);
  if(mode.startsWith('helper-')){
    const sdk=await import('@kubeclaw/plugin-sdk');
    const modules=path.join(source,'skills/nova/plugins/review/src');
    const {buildReviewGraph}=await import(pathToFileURL(path.join(modules,'review-graph.ts')));
    const {parseReviewSnapshotInventory}=await import(pathToFileURL(path.join(modules,'review-snapshot-inventory.ts')));
    const {buildScalableReviewPlan}=await import(pathToFileURL(path.join(modules,'review-scale-slicing.ts')));
    const {buildScalableReviewJobs}=await import(pathToFileURL(path.join(modules,'scalable-review-jobs.ts')));
    const {executeScalableReviewJobs}=await import(pathToFileURL(path.join(modules,'scalable-review-execution.ts')));
    const verification=await import(pathToFileURL(path.join(modules,'scalable-review-verification.ts')));
    const documents=[{path:'a.ts',content:'throw new Error("broken");\n'}];
    const files=documents.map(document=>({path:document.path,objectId:'a'.repeat(40),mode:'100644',sizeBytes:Buffer.byteLength(document.content)}));
    const inventory=parseReviewSnapshotInventory({head:'b'.repeat(40),files,inventoryDigest:sdk.sha256Text(sdk.canonicalJson(files))});
    const graph=buildReviewGraph(inventory,[]),tokenCounts=new Map([['a.ts',10]]),budget={maxFiles:2,maxBytes:1000,maxTokens:1000};
    const plan=buildScalableReviewPlan(inventory,graph,tokenCounts,budget);
    const jobs=buildScalableReviewJobs({plan,graph,documents,tokenCounts,budget});assert.equal(jobs.length,1);
    const finding={category:'correctness',priority:'P1',claim:'The operation always throws.',impact:'The operation cannot complete.',
      locations:[{path:'a.ts',lineHint:1}],evidence:[{kind:'reviewed-source',digest:jobs[0].source[0].digest}],recommendedFix:'Return the intended value.',
      changeRelation:'introduced',scopeRelation:'inside',evidenceStrength:'direct',rootCauseHint:'unconditional-throw'};
    const proposal={id:sdk.sha256Text(sdk.canonicalJson(finding)),jobId:jobs[0].id,jobDigest:jobs[0].digest,finding};
    const verificationJobs=verification.buildScalableVerificationJobs({proposals:[proposal],integrityIssues:[],incompleteJobs:[]},jobs,sdk.sha256Text('policy'));
    const prepared=await prepareRuntime(p,definition),journal=new core.FileEffectJournal(path.join(root,'helper-effects.jsonl'));
    const runtime=new core.AdapterRuntime({granted:prepared.granted,activated:prepared.activated,configs:new Map(Object.entries(p.adapters)),
      effects:new core.EffectCoordinator(journal,undefined,undefined,new core.FileResourceLockManager(path.join(root,'locks')),lockTtlMs),shutdownTimeoutMs:ioTimeoutMs,
      async emitDomainEvent(){throw Error('UNEXPECTED_EVENT');}});
    await runtime.start();const checked=[];
    try{
      for(const [tag,contract] of [['legacy',undefined],['current',{runtimeDispatchProfile:sdk.CURRENT_RUNTIME_DISPATCH_PROFILE}],
        ['undefined',{runtimeDispatchProfile:undefined}],['future',{runtimeDispatchProfile:{schemaVersion:'future',encoding:'future'}}],
        ['null',{runtimeDispatchProfile:null}],['extra',{runtimeDispatchProfile:{...sdk.CURRENT_RUNTIME_DISPATCH_PROFILE,extra:true}}]]){
        const context={...(contract===undefined?{}:{contract}),invoke:(capability,request)=>runtime.invoke(capability,
          {runId,stageId:'architecture',attemptId:'attempt:helper',attemptNumber:1},`dispatch:helper-${tag}`,request,new AbortController().signal)};
        await assert.rejects(()=>mode==='helper-review'?executeScalableReviewJobs(jobs,'agent',context,1):
          verification.executeScalableVerificationJobs(verificationJobs,'agent',context,1));
        const request=await journal.request(`dispatch:helper-${tag}`);
        if(tag==='legacy'||tag==='current'){
          assert.ok(request,'original helper reached actual registered HTTP adapter');
          assert.equal(Object.hasOwn(request,'runtimeDispatchProfile'),tag==='current');
          assert.equal((await journal.receipt(`dispatch:helper-${tag}`)).status,'completed');
        }else assert.equal(request,undefined,'invalid present profile is never admitted as legacy');
        checked.push(tag);
      }
    }finally{await runtime.shutdown();}
    process.stdout.write(JSON.stringify({helper:mode,checked,nativeModel:false}));
  }else if(mode==='pipeline'||mode==='recover'){
    // Historical source writer is archived byte-for-byte; current source is used
    // for all package resolution. No old local Git object or fabricated journal.
    const engine=await import(pathToFileURL(path.join(mode==='pipeline'?archivedCore(root,version):path.join(source,'skills/nova/core'),'execution/engine.ts')));
    let result,error;
    try{result=await(mode==='pipeline'?engine.runPipelineV2(p,definition,runId):engine.recoverPipelineV2(p,definition,runId));}
    catch(e){error=e.message;}
    const snapshot=snapshots.readRunSnapshot(location);
    const journal=new core.FileEffectJournal(path.join(location,'effects.jsonl'));
    const request=(await journal.recoveryEntries()).find(x=>x.request.capability==='runtime.dispatch')?.request;
    assert.ok(request,'actual original stage dispatched');
    assert.equal(Object.hasOwn(request,'runtimeDispatchProfile'),['v3','v4'].includes(version));
    assert.equal(Object.hasOwn(request.payload,'runtimeDispatchProfile'),false);
    process.stdout.write(JSON.stringify({result,error,snapshotVersion:snapshot.schemaVersion,request,location}));
  }else{
    fs.mkdirSync(location,{recursive:true});
    if(!fs.existsSync(path.join(location,'run-snapshot.json'))){
      const old=await import(pathToFileURL(path.join(archivedCore(root,version),'execution/engine-snapshots.ts')));
      // ASCII snapshot graph makes the genuine v1 reader's existing locale gate
      // independent of the Unicode production model payload tested below.
      const ascii={...definition,stages:definition.stages.map(s=>({...s,input:{task:'Inspect.',architecture:{a:1,z:2}}}))};
      old.writeRunSnapshots(location,old.graphSnapshot(ascii),{});
    }
    const snapshot=snapshots.readRunSnapshot(location),profile=['run-snapshot.v3','run-snapshot.v4'].includes(snapshot.schemaVersion)?snapshot.runtimeDispatchProfile:undefined;
    const prepared=await prepareRuntime(p,definition),journalPath=path.join(root,localeJournal);
    const audit=Object.fromEntries(['requested','accepted','completed'].map(name=>[name,request=>{
      if(name===boundary&&request.capability==='runtime.dispatch'){
        fs.writeSync(1,`AUDIT_BOUNDARY:${name}\n`);process.kill(process.pid,'SIGKILL');
      }
    }]));
    const runtime=new core.AdapterRuntime({granted:prepared.granted,activated:prepared.activated,configs:new Map(Object.entries(p.adapters)),
      effects:new core.EffectCoordinator(new core.FileEffectJournal(journalPath),undefined,audit,new core.FileResourceLockManager(path.join(root,'locks')),lockTtlMs),
      shutdownTimeoutMs:ioTimeoutMs,async emitDomainEvent(){throw Error('UNEXPECTED_EVENT');}});
    await runtime.start();let result,error;
    const payload=buildArchitectureRequest('agent',definition.stages[0].input,undefined);
    try{result=await runtime.invoke('runtime.dispatch',{runId,stageId:'architecture',attemptId:'attempt:profile',attemptNumber:1},key,
      {operation:'dispatch',resource:{type:'runtime.agent',canonicalId:'agent'},payload,...(profile?{runtimeDispatchProfile:profile}:{})},new AbortController().signal);}
    catch(e){error=e.message;}finally{await runtime.shutdown();}
    const journal=new core.FileEffectJournal(journalPath),request=await journal.request(key),receipt=await journal.receipt(key);
    assert.equal(Object.hasOwn(request,'runtimeDispatchProfile'),['v3','v4'].includes(version));
    process.stdout.write(JSON.stringify({result,error,request,receipt,snapshotVersion:snapshot.schemaVersion}));
  }
}else{
  async function fixture(t){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-profile-native-')),requests=[];
    const server=http.createServer(async(req,res)=>{
      const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks).toString(),body=JSON.parse(raw);
      requests.push({body,url:req.url,headers:req.headers});
      if(req.url==='/ack'){
        assert.equal(req.headers['x-kubeclaw-signature'],'v1='+crypto.createHmac('sha256','deliberate-local-profile-token').update(`${req.headers['idempotency-key']}.${raw}`).digest('hex'));
        res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({received:true}));
      }else{res.writeHead(503,{'content-type':'text/plain'});res.end('Controlled failure, not an OpenClaw Gateway.');}
    });server.listen(0,'127.0.0.1');await once(server,'listening');
    t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});});
    async function child(directory,version,mode,boundary='none',locale='en_US.UTF-8',journal='effects.jsonl'){
      fs.mkdirSync(directory,{recursive:true});
      const child=spawn(process.execPath,[self,'--child',directory,`http://127.0.0.1:${server.address().port}`,version,mode,boundary,journal],
        {cwd:source,env:{...process.env,LANG:locale,LC_ALL:locale},stdio:['ignore','pipe','pipe']});
      let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
      let timedOut=false;
      const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},30000),[code,signal]=await once(child,'exit');clearTimeout(timer);
      assert.equal(timedOut,false,'watchdog termination is never a successful crash boundary');
      if(boundary!=='none'){assert.equal(signal,'SIGKILL',JSON.stringify({code,err}));assert.equal(out,`AUDIT_BOUNDARY:${boundary}\n`);return;}
      assert.equal(code,0,JSON.stringify({signal,err,out}));return JSON.parse(out);
    }
    return {root,requests,child};
  }
  for(const version of ['v1','v2','v3','v4'])test(`actual ${version} run creation carries frozen transport choice; terminal reopen preserves prefix`,async t=>{
    const f=await fixture(t),directory=path.join(f.root,'pipeline');
    const first=await f.child(directory,version,'pipeline');assert.equal(first.result.status,'blocked');assert.equal(f.requests.length,1);
    assert.equal(first.snapshotVersion,`run-snapshot.${version}`);assert.equal(f.requests[0].body.tool,'sessions_spawn');
    const file=path.join(first.location,'effects.jsonl'),prefix=fs.readFileSync(file);
    const reopened=await f.child(directory,version,'recover','none',version==='v1'?'en_US.UTF-8':'sv_SE.UTF-8');
    assert.match(reopened.error,/RECOVERY_RUN_TERMINAL/);assert.equal(f.requests.length,1);assert.deepEqual(fs.readFileSync(file),prefix);
    t.diagnostic(JSON.stringify({version,nativeGateway:false,actualPostCount:f.requests.length,requestProfile:first.request.runtimeDispatchProfile??'legacy',reopen:reopened.error}));
  });
  for(const version of ['v1','v2','v3','v4'])for(const boundary of ['requested','accepted','completed'])test(`original ${version} snapshot + registered HTTP ${boundary} SIGKILL prefix resumes without retagging`,async t=>{
    const f=await fixture(t),directory=path.join(f.root,'prefix');
    await f.child(directory,version,'prefix',boundary);assert.equal(f.requests.length,boundary==='completed'?1:0);
    const file=path.join(directory,'effects.jsonl'),prefix=fs.readFileSync(file);
    const originalRecords=prefix.toString().trim().split('\n').map(line=>JSON.parse(line).entry);
    assert.deepEqual(originalRecords.map(record=>record.type),boundary==='requested'?['requested']:
      boundary==='accepted'?['requested','accepted']:['requested','accepted','completed']);
    if(boundary==='completed')assert.equal(originalRecords[2].receipt.status,'completed');
    const result=await f.child(directory,version,'prefix','none',version==='v1'?'en_US.UTF-8':'sv_SE.UTF-8');
    assert.deepEqual(fs.readFileSync(file).subarray(0,prefix.length),prefix,'resume preserves every original prefix byte');
    if(boundary==='accepted'){
      assert.match(result.error,/EFFECT_RECOVERY_RECEIPT_UNAVAILABLE/);assert.equal(f.requests.length,0);assert.deepEqual(fs.readFileSync(file),prefix);
    }else{assert.deepEqual(result.result,{received:true});assert.equal(f.requests.length,1);if(boundary==='completed')assert.deepEqual(fs.readFileSync(file),prefix);}
    assert.equal(result.snapshotVersion,`run-snapshot.${version}`);
  });
  for(const version of ['v2','v3','v4'])test(`declared ${version} ACP transport profile owns locale selection without claiming a Gateway`,async t=>{
    const f=await fixture(t),directory=path.join(f.root,'locale');
    const en=await f.child(directory,version,'transport','none','en_US.UTF-8','en.jsonl');
    const sv=await f.child(directory,version,'transport','none','sv_SE.UTF-8','sv.jsonl');
    assert.equal(f.requests.length,2);assert.equal(en.request.effectId,sv.request.effectId);
    const [left,right]=f.requests.map(x=>x.body);
    assert.equal(left.tool,'sessions_spawn');assert.equal(right.tool,'sessions_spawn');
    if(['v3','v4'].includes(version)){
      assert.equal(left.idempotencyKey,right.idempotencyKey);assert.equal(left.args.label,right.args.label);assert.equal(left.args.task,right.args.task);
      assert.match(left.idempotencyKey,/json-utf16-v1/);
    }else{
      assert.notEqual(left.idempotencyKey,right.idempotencyKey);assert.doesNotMatch(left.idempotencyKey,/json-utf16-v1/);
    }
    const file=path.join(directory,'en.jsonl'),prefix=fs.readFileSync(file);
    const replay=await f.child(directory,version,'transport','none','sv_SE.UTF-8','en.jsonl');
    assert.match(replay.error,/EFFECT_OUTCOME_UNRESOLVED/);assert.equal(f.requests.length,2);assert.deepEqual(fs.readFileSync(file),prefix);
    t.diagnostic(JSON.stringify({version,nativeGateway:false,localeStable:['v3','v4'].includes(version),transportKeys:[left.idempotencyKey,right.idempotencyKey],noRepeat:true}));
  });
  for(const helper of ['helper-review','helper-verification'])test(`original ${helper} preserves invoke-only API and rejects invalid present profile before real HTTP`,async t=>{
    const f=await fixture(t),result=await f.child(path.join(f.root,helper),'v3',helper);
    assert.deepEqual(result.checked,['legacy','current','undefined','future','null','extra']);assert.equal(f.requests.length,2);
    assert.deepEqual(f.requests[0].body,f.requests[1].body,'closed profile never changes original model payload');
  });
}
