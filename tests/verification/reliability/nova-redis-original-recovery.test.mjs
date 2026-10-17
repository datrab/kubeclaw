import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {once} from 'node:events';
import {TEST_CORE_POLICY} from '../../fixtures/core-runtime-policy.mjs';
import {loadPlatformConfig} from '../../../skills/common/plugin-runtime/foundation/config/platform.ts';
import {runPipelineV2,resumePipelineV2,recoverPipelineV2} from '../../../skills/nova/core/execution/engine.ts';
import {readRunSnapshot,retainedRuntimePolicies} from '../../../skills/nova/core/execution/engine-snapshots.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {captureRedisRuntimeBindings,restoreRedisRuntimeBindings} from '../../../skills/nova/core/execution/redis-runtime-binding.ts';
const ids=['kubeclaw.redis-transport:publisher','kubeclaw.redis-transport:telemetry'];

test('real Nova wait/resume restores both complete original Redis targets and original Core without current-source refill',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'redis-original-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const wire=[];
 const server=net.createServer(socket=>{socket.on('error',()=>{});socket.once('data',data=>{wire.push(data.toString('utf8'));socket.end('+OK\r\n$3\r\n1-1\r\n');});});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const port=server.address().port;
 const plugin=path.join(root,'plugins/probe');fs.mkdirSync(path.join(plugin,'schemas'),{recursive:true});fs.writeFileSync(path.join(plugin,'package.json'),' {"type":"module"}');
 fs.writeFileSync(path.join(plugin,'entry.mjs'),`export async function execute(input,context){
 if(!context.contract.guidance?.approved)return {schemaVersion:'stage-result.v2',outcome:'orchestrator_required',reason:{code:'test.redis',message:'waiting'},artifacts:[],wait:{schemaVersion:'wait-request.v2',waitId:'wait:redis',kind:'orchestrator',signalType:'core.orchestrator.resume',authorizedIssuer:{type:'orchestrator',id:'nova'},expiresAt:null}};
 await context.invoke('transport.publish',{operation:'publish',resource:{type:'transport.target',canonicalId:'audit'},payload:{original:true}});
 await context.invoke('telemetry.emit',{operation:'append',resource:{type:'telemetry.event',canonicalId:'test.completed'},payload:{original:true}});
 return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]};}`);
 for(const [name,value] of Object.entries({config:{type:'object',additionalProperties:false},input:{type:'object',additionalProperties:false},result:{$ref:'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult'}}))fs.writeFileSync(path.join(plugin,'schemas',name+'.json'),JSON.stringify(value));
 fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({id:'test.redis-original',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',adapters:[],observers:[],stages:[{id:'probe',type:'test.redis-original',module:'entry.mjs',export:'execute',requiredCapabilities:['transport.publish','telemetry.emit'],configSchema:'schemas/config.json',inputSchema:'schemas/input.json',resultSchema:'schemas/result.json'}]}));
 const core=path.join(root,'core.json');fs.writeFileSync(core,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:TEST_CORE_POLICY}}}));
 const secretEnv='REDIS_ORIGINAL_RECOVERY_TEST';const previous=process.env[secretEnv];process.env[secretEnv]='original-fixture-secret';t.after(()=>{if(previous===undefined)delete process.env[secretEnv];else process.env[secretEnv]=previous;});
 const common=path.resolve('skills/common/plugins');
 const original=Object.fromEntries(ids.map((id,i)=>[id,{url:`redis://127.0.0.1:${port}`,passwordSecret:i?'redis.telemetry':'redis.publisher',streamPrefix:i?'original-telemetry':'original-publisher',maxLen:1000+i,dedupTtlMs:60000+i,timeoutMs:1000+i}]));
 const source={schemaVersion:'pipeline-platform.v2',corePolicySelection:{file:core,profile:'selected'},installationRoots:[path.join(root,'plugins'),common],trustedBuiltinRoots:[path.join(root,'plugins'),common],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{'transport.publish':ids[0],'telemetry.emit':ids[1],'secrets.read':'kubeclaw.secret-resolver:secrets'},grants:{'test.redis-original:probe':{'transport.publish':{allowedTargets:['audit']},'telemetry.emit':{allowedEventPrefixes:['test.']}},[ids[0]]:{'secrets.read':{allowedNames:['redis.publisher']}},[ids[1]]:{'secrets.read':{allowedNames:['redis.telemetry']}}},adapters:{...original,'kubeclaw.secret-resolver:secrets':{environment:{'redis.publisher':secretEnv,'redis.telemetry':secretEnv}}},activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:1000,effectLockTtlMs:300000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
 const file=path.join(root,'platform.json'),publish=()=>fs.writeFileSync(file,JSON.stringify(source)),platform=()=>loadPlatformConfig(file);publish();
 const definition={schemaVersion:'pipeline-definition.v2',id:'redis-original',maxConcurrency:1,stages:[{id:'probe',type:'test.redis-original',dependsOn:[],input:{},config:{},execution:{maxAttempts:2,maxRemediationCycles:0,timeoutMs:5000}}]};
 const first=await runPipelineV2(platform(),definition,'redis:A');assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));
 const aRoot=runRoot(source.storageRoot,'redis:A'),snapshot=readRunSnapshot(aRoot),retained=retainedRuntimePolicies(aRoot);
 assert.deepEqual(retained.redisBindings,original);assert(Object.isFrozen(retained.redisBindings));for(const config of Object.values(retained.redisBindings))assert(Object.isFrozen(config));
 for(const id of ids)source.adapters[id]={url:'redis://127.0.0.1:1',passwordSecret:'redis.current',streamPrefix:'current',maxLen:2,dedupTtlMs:2000,timeoutMs:1};publish();
 const current=await runPipelineV2(platform(),definition,'redis:B');assert.equal(current.status,'waiting');assert.equal(readRunSnapshot(runRoot(source.storageRoot,'redis:B')).registry.configuration.adapters[ids[0]].streamPrefix,'current');
 // Mutating current grants remains a recovery failure, not original authority.
 source.grants[ids[0]]['secrets.read'].allowedNames=['redis.current'];publish();
 const wait=first.stages.get('probe').wait,signal={schemaVersion:'resume-signal.v2',signalId:'signal:redis',idempotencyKey:'signal-key:redis',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}};
 await assert.rejects(resumePipelineV2(platform(),definition,'redis:A',signal),/RECOVERY_RUNTIME_CONFIGURATION_MISMATCH/);assert.equal(wire.length,0);
 source.grants[ids[0]]['secrets.read'].allowedNames=['redis.publisher'];publish();fs.unlinkSync(core);
 await assert.rejects(recoverPipelineV2(platform(),definition,'redis:A'),/RECOVERY_SIGNAL_REQUIRED/);assert.equal(wire.length,0);
 assert.equal((await resumePipelineV2(platform(),definition,'redis:A',signal)).status,'succeeded');assert.deepEqual(readRunSnapshot(aRoot),snapshot);assert.equal(wire.length,2);
 for(const [i,raw] of wire.entries()){assert(raw.includes(i?'original-telemetry:v2:telemetry:test.completed':'original-publisher:v2:publisher:audit'));assert(raw.includes(String(1000+i)));assert(raw.includes(String(60000+i)));assert(!raw.includes('current'));}
 assert(!JSON.stringify(snapshot).includes('original-fixture-secret'));
 // Current source and returned maps do not become a mutable original writer.
 assert.equal(retained.redisBindings[ids[0]].streamPrefix,'original-publisher');
});

test('original Redis capture rejects partial captures, policy disagreement and registration-set drift without refill',()=>{
 const raw={url:'redis://127.0.0.1:1234',passwordSecret:'redis.password',streamPrefix:'original',maxLen:1000,dedupTtlMs:60000,timeoutMs:1000};
 const effective={...raw,...TEST_CORE_POLICY.redisTransport};
 const bindings=captureRedisRuntimeBindings({[ids[0]]:effective},TEST_CORE_POLICY);
 for(const key of Object.keys(effective)){const invalid={...effective};delete invalid[key];assert.throws(()=>captureRedisRuntimeBindings({[ids[0]]:invalid},TEST_CORE_POLICY),/RECOVERY_REDIS_/);}
 assert.throws(()=>captureRedisRuntimeBindings({[ids[0]]:{...effective,maximumPayloadBytes:1}},TEST_CORE_POLICY),/POLICY_MISMATCH/);
 assert.throws(()=>captureRedisRuntimeBindings({[ids[0]]:{...effective,extra:true}},TEST_CORE_POLICY),/CONFIGURATION_INVALID/);
 assert.throws(()=>restoreRedisRuntimeBindings({},bindings),/REGISTRATION_MISMATCH/);
 assert.throws(()=>restoreRedisRuntimeBindings({[ids[0]]:raw,[ids[1]]:raw},bindings),/REGISTRATION_MISMATCH/);
 assert.throws(()=>restoreRedisRuntimeBindings({}, {unknown:raw}),/CONFIGURATION_INVALID/);
 assert.deepEqual(restoreRedisRuntimeBindings({[ids[0]]:{wrong:true}},bindings)[ids[0]],raw);
 assert.deepEqual(restoreRedisRuntimeBindings({},{}),{});
});
