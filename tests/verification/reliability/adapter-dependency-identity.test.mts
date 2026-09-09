import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import * as core from '../../../skills/nova/core/src/index.ts';
import { prepareRuntime } from '../../../skills/nova/core/execution/engine-runtime.ts';
import { frozenRegistryRecord, graphSnapshot, writeRunSnapshots, readRunSnapshot, verifyPinnedPackages } from '../../../skills/nova/core/execution/engine-snapshots.ts';
import { recoverPipeline } from '../../../skills/nova/core/execution/engine-run.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import type { PipelineDefinition, EffectRequest } from '@kubeclaw/plugin-sdk';
import type { PlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';

// A real consumer of the public dependency API. Native HTTP and the original
// registry/runtime/effect journals execute every external operation.
const consumer = `import fs from 'node:fs'; export function activate(context) {
  return {async ready(){fs.appendFileSync(context.config.marker,'ready\\n');},async shutdown(){},async invoke({request,fence}) {
    fence.assertCurrent();
    const call=()=>context.invoke('network.http',{operation:'request',resource:{type:'network.url',canonicalId:context.config.origin},payload:{method:'POST',body:{value:'same'}}});
    const first=await call();await call();return first;
  }};
}`;

test('nested effects bind actual invocation and attempt, replay once after reconstruction; old snapshots refuse execution', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'dependency-identity-'));
  let hits=0;
  const server=http.createServer((request,response)=>{request.resume();request.on('end',()=>{hits++;response.writeHead(200,{'content-type':'application/json'});response.end('{"ok":true}');});});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  let runtime:core.AdapterRuntime|undefined;
  try {
    const address=server.address();assert(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
    const pluginRoot=path.join(root,'plugins'),plugin=path.join(pluginRoot,'consumer');fs.mkdirSync(plugin,{recursive:true});
    fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({id:'test.dependency-consumer',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',observers:[],
      stages:[{id:'stage',type:'test.dependency',module:'stage.mjs',export:'execute',requiredCapabilities:['runtime.dispatch'],configSchema:'empty.json',inputSchema:'empty.json',resultSchema:'result.json'}],
      adapters:[{id:'consumer',module:'adapter.mjs',export:'activate',providesCapabilities:['runtime.dispatch'],requiredCapabilities:['network.http'],configSchema:'config.json'}]}));
    fs.writeFileSync(path.join(plugin,'adapter.mjs'),consumer);
    fs.writeFileSync(path.join(plugin,'stage.mjs'),`export async function execute(input,context){await context.invoke('runtime.dispatch',{operation:'dispatch',resource:{type:'runtime.agent',canonicalId:'probe'},payload:{}});return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]};}`);
    fs.writeFileSync(path.join(plugin,'empty.json'),JSON.stringify({type:'object',additionalProperties:false}));
    fs.writeFileSync(path.join(plugin,'result.json'),JSON.stringify({$schema:'https://json-schema.org/draft/2020-12/schema',$ref:'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult'}));
    fs.writeFileSync(path.join(plugin,'config.json'),JSON.stringify({type:'object',properties:{origin:{type:'string'},marker:{type:'string'}},required:['origin','marker'],additionalProperties:false}));
    const roots=[path.resolve('skills/common/plugins'),pluginRoot];
    const adapterId='test.dependency-consumer:consumer',stageId='test.dependency-consumer:stage';
    const platform:PlatformConfig={schemaVersion:'pipeline-platform.v2',shutdownTimeoutMs:1000,administrativeDecisionIssuers:[],storageRoot:path.join(root,'state'),installationRoots:roots,trustedBuiltinRoots:roots,
      externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},orchestratorIssuerId:'test:operator',activeAdapters:[],observers:{},
      providers:{'runtime.dispatch':adapterId,'network.http':'kubeclaw.network-http:http'},
      grants:{[stageId]:{'runtime.dispatch':{allowedAgents:['probe']}},[adapterId]:{'network.http':{allowedOrigins:[origin]}}},
      adapters:{[adapterId]:{origin,marker:path.join(root,'ready.log')},'kubeclaw.network-http:http':{allowedOrigins:[origin],allowedMethods:['POST']}}};
    const definition:PipelineDefinition={schemaVersion:'pipeline-definition.v2',id:'dependency-test',maxConcurrency:1,stages:[{id:'one',type:'test.dependency',dependsOn:[],input:{},config:{},execution:{maxAttempts:1,maxRemediationCycles:0,timeoutMs:10000}}]};
    const prepared=await prepareRuntime(platform,definition);
    const observed:EffectRequest[]=[];
    const create=()=>new core.AdapterRuntime({granted:prepared.granted,activated:prepared.activated,configs:new Map(Object.entries(platform.adapters)),shutdownTimeoutMs:1000,async emitDomainEvent(){},
      effects:new core.EffectCoordinator(new core.FileEffectJournal(path.join(root,'effects.jsonl')),undefined,{requested(request){observed.push(request);},accepted(){},completed(){}},new core.FileResourceLockManager(path.join(root,'locks')))});
    runtime=create();await runtime.start();
    const attempt={runId:'run:dependency',stageId:'one',attemptId:'attempt:one',attemptNumber:1};
    const invocation={operation:'dispatch',resource:{type:'runtime.agent',canonicalId:'probe'},payload:{}};
    await runtime.invoke('runtime.dispatch',attempt,'parent:one',invocation,new AbortController().signal);assert.equal(hits,1,'same child called twice by same parent performs once');
    const graph=graphSnapshot(definition),registry=frozenRegistryRecord(prepared,definition,graph);
    const matching=runRoot(platform.storageRoot,attempt.runId);fs.mkdirSync(matching,{recursive:true});
    writeRunSnapshots(matching,graph,registry);verifyPinnedPackages(matching,prepared);
    await runtime.shutdown();runtime=create();await runtime.start();
    await runtime.invoke('runtime.dispatch',attempt,'parent:one',invocation,new AbortController().signal);assert.equal(hits,1,'durable same-owner replay after restart');
    await runtime.invoke('runtime.dispatch',attempt,'parent:later',invocation,new AbortController().signal);assert.equal(hits,2,'later parent in same attempt owns a distinct effect');
    await runtime.invoke('runtime.dispatch',{...attempt,attemptId:'attempt:two',attemptNumber:2},'parent:retry',invocation,new AbortController().signal);assert.equal(hits,3,'new attempt does not reuse former child identity');
    const children=observed.filter(request=>request.capability==='network.http');
    assert.equal(new Set(children.map(request=>request.idempotencyKey)).size,3);
    assert(children.every(request=>request.deliveryId===undefined),'generic dependencies need no fabricated delivery identity');
    const readyBefore=fs.readFileSync(path.join(root,'ready.log'),'utf8');
    assert.equal(registry.dependencyIdentityVersion,'parent-invocation.v1');
    for(const marker of [undefined,'other-version']) {
      const id=`run:old:${marker??'absent'}`,directory=runRoot(platform.storageRoot,id);fs.mkdirSync(directory,{recursive:true});
      const {dependencyIdentityVersion:_version,...legacy}=registry;
      writeRunSnapshots(directory,graph,{...legacy,...(marker?{dependencyIdentityVersion:marker}:{})});
      assert.equal(readRunSnapshot(directory).graph.digest,graph.digest,'historical read stays available');
      await assert.rejects(recoverPipeline(platform,definition,id),/RECOVERY_DEPENDENCY_IDENTITY_MISMATCH/);
      assert.equal(fs.readFileSync(path.join(root,'ready.log'),'utf8'),readyBefore,'recovery never starts adapters');
      assert.equal(hits,3,'incompatible persisted identity rejected before adapter/external execution');
    }
  } finally {await runtime?.shutdown();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(root,{recursive:true,force:true});}
});

test('explicit dependency delivery identity survives attempts while original operator records reject foreign payload and uncertain resend', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'dependency-delivery-'));
  let hits=0;const received:string[]=[];const bodies:string[]=[];
  const server=http.createServer((request,response)=>{const chunks:Buffer[]=[];request.on('data',chunk=>chunks.push(chunk));request.on('end',()=>{
    bodies.push(Buffer.concat(chunks).toString('utf8'));hits++;received.push(String(request.headers['idempotency-key']));
    if(request.url?.startsWith('/uncertain')){request.socket.destroy();return;}
    response.writeHead(200,{'content-type':'application/json'});response.end('{"id":"123456789012345678"}');
  });});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const secretName=`DEPENDENCY_DELIVERY_${process.pid}`;process.env[secretName]='local-protocol-secret';
  let runtime:core.AdapterRuntime|undefined;
  try {
    const address=server.address();assert(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
    const pluginRoot=path.join(root,'plugins'),plugin=path.join(pluginRoot,'consumer');fs.mkdirSync(plugin,{recursive:true});
    fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({id:'test.delivery-consumer',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',stages:[{id:'stage',type:'test.delivery',module:'stage.mjs',export:'execute',requiredCapabilities:['runtime.dispatch'],configSchema:'config.json',inputSchema:'config.json',resultSchema:'result.json'}],observers:[],
      adapters:[{id:'consumer',module:'adapter.mjs',export:'activate',providesCapabilities:['runtime.dispatch'],requiredCapabilities:['operator.request'],configSchema:'config.json'}]}));
    fs.writeFileSync(path.join(plugin,'config.json'),JSON.stringify({type:'object',additionalProperties:false}));
    fs.writeFileSync(path.join(plugin,'stage.mjs'),`export async function execute(input,context){return context.invoke('runtime.dispatch',{operation:'dispatch',resource:{type:'runtime.agent',canonicalId:'probe'},payload:input});}`);
    fs.writeFileSync(path.join(plugin,'result.json'),JSON.stringify({type:'object'}));
    fs.writeFileSync(path.join(plugin,'adapter.mjs'),`export function activate(context){return {async ready(){},async shutdown(){},async invoke({request,fence}){
      fence.assertCurrent();return context.invoke('operator.request',{operation:'publish',resource:{type:'operator.target',canonicalId:request.payload.target},payload:{type:'demo.access',summary:request.payload.summary}},{deliveryId:request.payload.deliveryId});
    }}}`);
    const roots=[path.resolve('skills/common/plugins'),pluginRoot];
    const snapshot=core.buildRegistry(core.discoverPackages({installationRoots:roots,trustPolicy:{trustedBuiltinRoots:roots,allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'test:dependency-delivery'}}));
    const id='test.delivery-consumer:consumer',operator='kubeclaw.operator-messaging:operator';
    const granted=core.resolveCapabilityGrants(snapshot,{enabledRegistrations:new Set(['test.delivery-consumer:stage']),providers:new Map([
      ['runtime.dispatch',id],['operator.request',operator],['network.http','kubeclaw.network-http:http'],['secrets.read','kubeclaw.secret-resolver:secrets']]),
      grants:new Map([['test.delivery-consumer:stage',new Map([['runtime.dispatch',{allowedAgents:['probe']} ]])],[id,new Map([['operator.request',{allowedTargets:['operators','uncertain','large']}]])],
        [operator,new Map([['network.http',{allowedOrigins:[origin]}],['secrets.read',{allowedNames:['webhook']} ]])]])});
    const activated=await core.activateRegistry(snapshot,new Set(granted.grants.keys()));
    const configs=new Map<string,Record<string,unknown>>([[id,{}],[operator,{deliveryRoot:path.join(root,'delivery'),targets:{
      large:{endpoint:origin+'/large',tokenSecret:'webhook',format:'json',maxPayloadBytes:1048576},
      operators:{endpoint:origin+'/messages',tokenSecret:'webhook',format:'discord_webhook'},uncertain:{endpoint:origin+'/uncertain',tokenSecret:'webhook',format:'discord_webhook'}}}],
      ['kubeclaw.network-http:http',{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['content-type','idempotency-key','x-kubeclaw-signature']}],
      ['kubeclaw.secret-resolver:secrets',{environment:{webhook:secretName}}]]);
    const observed:EffectRequest[]=[];
    const create=(interruptKey?:string,quota?:number)=>new core.AdapterRuntime({granted,activated,configs:quota===undefined?configs:new Map([...configs,[operator,{...configs.get(operator),deliveryRoot:path.join(root,'quota'),maximumDeliveryBytes:quota}]]),shutdownTimeoutMs:1000,async emitDomainEvent(){},
      effects:new core.EffectCoordinator(new core.FileEffectJournal(path.join(root,'effects.jsonl')),undefined,{requested(request){observed.push(request);},accepted(request){if(request.idempotencyKey===interruptKey)throw new Error('TEST_ACCEPTED_BEFORE_RESERVE');},completed(){}},new core.FileResourceLockManager(path.join(root,'locks')))});
    runtime=create();await runtime.start();
    const invoke=(number:number,summary='Full URL and generated demo credentials',target='operators',runId='run:one')=>runtime!.invoke('runtime.dispatch',
      {runId,stageId:'delivery',attemptId:`attempt:${runId}:${number}`,attemptNumber:number},`parent:${runId}:${number}`,
      {operation:'dispatch',resource:{type:'runtime.agent',canonicalId:'probe'},payload:{summary,target,deliveryId:`stable:${target}`}},new AbortController().signal);
    const first=await invoke(1);assert.equal(first.deliveryId,'stable:operators');assert.equal(hits,1);
    await runtime.shutdown();runtime=create();await runtime.start();
    assert.deepEqual(await invoke(1),first);assert.equal(hits,1);
    assert.deepEqual(await invoke(2),first);assert.equal(hits,1,'fresh child attempt reads accepted original receipt');
    await assert.rejects(invoke(3,'changed credentials'),/DURABLE_RECORD.*CONFLICT/);assert.equal(hits,1);
    await assert.rejects(invoke(1,undefined,undefined,'run:foreign'),/DURABLE_RECORD.*CONFLICT/);assert.equal(hits,1);
    await assert.rejects(invoke(4,undefined,'uncertain'));assert.equal(hits,2);
    await assert.rejects(invoke(5,undefined,'uncertain'),/OPERATOR_DELIVERY_UNRESOLVED/);assert.equal(hits,2);
    for (const mode of ['foreign-run','foreign-stage','changed-payload','same-owner']) {
      const key=`crash-before-reserve:${mode}`;
      const attempt={runId:mode==='foreign-run'?'run:foreign':'run:one',stageId:mode==='foreign-stage'?'foreign':'delivery',attemptId:`attempt:${mode}`,attemptNumber:20};
      const query={operation:'publish',resource:{type:'operator.target',canonicalId:'operators'},payload:{type:'demo.access',summary:mode==='changed-payload'?'changed':'Full URL and generated demo credentials'}};
      await runtime.shutdown();runtime=create(key);await runtime.start();
      await assert.rejects(runtime.invoke('operator.request',attempt,key,query,new AbortController().signal,'stable:operators'),/TEST_ACCEPTED_BEFORE_RESERVE/);
      const journal=new core.FileEffectJournal(path.join(root,'effects.jsonl'));
      assert(await journal.request(key));assert.equal(await journal.receipt(key),undefined,'real coordinator left accepted prefix with no completion');
      await runtime.shutdown();runtime=create();await runtime.start();
      const recovered=runtime.invoke('operator.request',attempt,key,query,new AbortController().signal,'stable:operators');
      if(mode==='same-owner')assert.deepEqual(await recovered,first);
      else {await assert.rejects(recovered,/OPERATOR_RECEIPT_REQUEST_UNBOUND/);assert.equal(await journal.receipt(key),undefined);}
      assert.equal(hits,2,'receipt reconciliation never transmits');
    }
    const children=observed.filter(request=>request.capability==='operator.request'&&request.deliveryId==='stable:operators');
    assert.equal(new Set(children.map(request=>request.idempotencyKey)).size,8);
    assert.deepEqual(received,['stable:operators','stable:uncertain']);
    const envelope={type:'demo.access',artifact:''};
    const maximum=1048576,overhead=Buffer.byteLength(JSON.stringify(envelope));
    const payload={...envelope,artifact:'\\'.repeat(Math.floor((maximum-overhead)/2))};
    const bytes=JSON.stringify(payload);assert(Buffer.byteLength(bytes)<=maximum&&Buffer.byteLength(bytes)>=maximum-1);
    assert(Buffer.byteLength(JSON.stringify(bytes))>maximum+65536,'high escaping exceeds former record limit without derived allowance');
    const large=(key:string,value=payload,deliveryId?:string)=>runtime!.invoke('operator.request',
      {runId:'run:large',stageId:'delivery',attemptId:key,attemptNumber:1},key,
      {operation:'publish',resource:{type:'operator.target',canonicalId:'large'},payload:value},new AbortController().signal,deliveryId);
    await large('large:legacy');await large('large:explicit',payload,'large:delivery');
    assert.equal(hits,4);assert.deepEqual(bodies.slice(-2),[bytes,bytes],'maximum valid body is transmitted byte-for-byte under legacy and explicit identity');
    await assert.rejects(large('large:oversize',{...payload,artifact:payload.artifact+'\\'},'large:oversize'),/OPERATOR_PAYLOAD_SIZE_EXCEEDED/);assert.equal(hits,4);
    await runtime.shutdown();runtime=create(undefined,1024);await runtime.start();
    await assert.rejects(large('large:quota',payload,'large:quota'),/DURABLE_RECORD_STORE_FULL/);assert.equal(hits,4,'aggregate quota remains enforced before HTTP');

  } finally {await runtime?.shutdown();delete process.env[secretName];server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(root,{recursive:true,force:true});}
});
