// Read-only product audit: original registered ACP transport -> real HTTP 503.
// No gateway success response, model execution, or native gateway claim.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const sourceRoot=path.resolve('.'), self=fileURLToPath(import.meta.url);
if(process.argv[2]==='--child'){
  const [directory,origin,journalName]=process.argv.slice(3);
  const core=await import('../../../skills/nova/core/src/index.ts');
  const {validateReferencedSchema}=await import('../../../skills/common/plugin-runtime/foundation/registry/schema.ts');
  const {buildArchitectureRequest}=await import('../../../skills/nova/plugins/architecture-validator/src/protocol.ts');
  const input={task:'Review the named component scores.',architecture:{ä:1,z:2}};
  validateReferencedSchema(fs.readFileSync('skills/nova/plugins/architecture-validator/schemas/input.schema.json','utf8'),'original architecture input').validate(input);
  const payload=buildArchitectureRequest('agent',input,undefined);
  const roots=['common','nova'].map(role=>path.join(sourceRoot,'skills',role,'plugins'));
  const snapshot=core.buildRegistry(core.discoverPackages({installationRoots:roots,trustPolicy:{trustedBuiltinRoots:roots,allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'audit:locale'}}));
  const runtimeId='kubeclaw.runtime-dispatch:openclaw';
  const grants=new Map([
    ['kubeclaw.architecture-validator:architecture',new Map([['runtime.dispatch',{allowedAgents:['agent']}],['artifacts.write',{allowedNamespaces:['kubeclaw.architecture-validator']}],['artifacts.read',{allowedNamespaces:['kubeclaw.architecture-validator']}],['git.repository.read',{allowedPrefixes:['.']}]])],
    [runtimeId,new Map([['network.http',{allowedOrigins:[origin]}],['secrets.read',{allowedNames:['runtime.token']}],['git.repository.read',{allowedPrefixes:['.']}]])],
  ]);
  const granted=core.resolveCapabilityGrants(snapshot,{enabledRegistrations:new Set(['kubeclaw.architecture-validator:architecture']),grants,
    providers:new Map([['runtime.dispatch',runtimeId],['network.http','kubeclaw.network-http:http'],['secrets.read','kubeclaw.secret-resolver:secrets'],['git.repository.read','kubeclaw.repository-adapter:repository'],['artifacts.read','kubeclaw.artifact-store:artifact-store'],['artifacts.write','kubeclaw.artifact-store:artifact-store']])});
  const activated=await core.activateRegistry(granted.snapshot,new Set(granted.grants.keys()));
  process.env.KUBECLAW_AUDIT_LOCAL_TOKEN='deliberate-local-audit-token';
  const configs=new Map([
    [runtimeId,{targets:{agent:{endpoint:origin+'/fault',tokenSecret:'runtime.token',runtime:'acp',agentId:'audit',agentRole:'architecture',model:'audit/model',cwd:directory,repositoryRoot:directory,resultPathPrefix:'results',spawnIntervalMs:0,pollMs:10,maxPollMs:10,maxPolls:1,sessionTimeoutMs:80}}}],
    ['kubeclaw.network-http:http',{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['authorization','content-type'],timeoutMs:1000}],
    ['kubeclaw.secret-resolver:secrets',{environment:{'runtime.token':'KUBECLAW_AUDIT_LOCAL_TOKEN'}}],
    ['kubeclaw.repository-adapter:repository',{repositoryRoot:directory}],
    ['kubeclaw.artifact-store:artifact-store',{artifactRoot:path.join(directory,'artifacts')}],
  ]);
  const journalPath=path.join(directory,journalName);
  const runtime=new core.AdapterRuntime({granted,activated,configs,effects:new core.EffectCoordinator(new core.FileEffectJournal(journalPath),undefined,undefined,new core.FileResourceLockManager(path.join(directory,'locks'))),shutdownTimeoutMs:100,async emitDomainEvent(){throw Error('UNEXPECTED_EVENT');}});
  await runtime.start();
  let error;
  try{await runtime.invoke('runtime.dispatch',{runId:'run:audit',stageId:'architecture',attemptId:'attempt:audit',attemptNumber:1},'dispatch:architecture-audit',{operation:'dispatch',resource:{type:'runtime.agent',canonicalId:'agent'},payload},new AbortController().signal);assert.fail('503 is not successful execution');}
  catch(e){error=e.message;assert.match(error,/EFFECT_OUTCOME_UNRESOLVED/);}
  finally{await runtime.shutdown();}
  const journal=new core.FileEffectJournal(journalPath),request=await journal.request('dispatch:architecture-audit'),receipt=await journal.receipt('dispatch:architecture-audit');
  assert.equal(receipt.status,'failed');assert.equal(request.idempotencyKey,'dispatch:architecture-audit');
  process.stdout.write(JSON.stringify({locale:Intl.DateTimeFormat().resolvedOptions().locale,error,parentEffectId:request.effectId,payload,receiptStatus:receipt.status}));
}else{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'openclaw-identity-audit-')),requests=[];
  const server=http.createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString());requests.push(body);res.writeHead(503,{'content-type':'text/plain'});res.end('Deliberate local HTTP failure; this endpoint is not an OpenClaw Gateway.');});
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
  async function child(locale,journal){
    const processChild=spawn(process.execPath,[self,'--child',root,origin,journal],{cwd:sourceRoot,env:{...process.env,LANG:locale,LC_ALL:locale},stdio:['ignore','pipe','pipe']});
    let out='',err='';processChild.stdout.on('data',b=>out+=b);processChild.stderr.on('data',b=>err+=b);
    const timeout=setTimeout(()=>processChild.kill('SIGKILL'),30000),[code,signal]=await once(processChild,'exit');clearTimeout(timeout);
    assert.equal(code,0,JSON.stringify({signal,err}));return JSON.parse(out);
  }
  try{
    const en=await child('en_US.UTF-8','en.jsonl');assert.equal(requests.length,1);assert.equal(requests[0].tool,'sessions_spawn');
    const sv=await child('sv_SE.UTF-8','sv.jsonl');assert.equal(requests.length,2);assert.equal(requests[1].tool,'sessions_spawn');
    assert.equal(en.parentEffectId,sv.parentEffectId);assert.deepEqual(en.payload,sv.payload);
    assert.notEqual(requests[0].idempotencyKey,requests[1].idempotencyKey);assert.notEqual(requests[0].args.label,requests[1].args.label);
    const prefix=fs.readFileSync(path.join(root,'en.jsonl'));
    const replay=await child('sv_SE.UTF-8','en.jsonl');assert.equal(requests.length,2);assert.deepEqual(fs.readFileSync(path.join(root,'en.jsonl')),prefix);
    const summarize=request=>({tool:request.tool,idempotencyKey:request.idempotencyKey,label:request.args.label,resultDirective:request.args.task.split('\n').find(x=>x.startsWith('Write the exact raw JSON result'))});
    console.log(JSON.stringify({boundary:'original architecture builder/schema -> registered Core/ACP adapter -> real503 HTTP receiver',nativeGateway:false,acceptedGatewaySessions:0,locales:[en.locale,sv.locale],sameCanonicalParentEffect:en.parentEffectId,architecture:en.payload.architecture,outbound:requests.map(summarize),replay:{locale:replay.locale,noAdditionalHttp:true,journalUnchanged:true,error:replay.error}},null,2));
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
}
