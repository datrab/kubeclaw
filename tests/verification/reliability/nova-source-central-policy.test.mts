import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { TEST_CORE_POLICY } from '../../fixtures/core-runtime-policy.mjs';
import { captureCoreRuntimePolicy, loadCoreRuntimePolicy } from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import { loadProductionNovaTestGate } from '../../../skills/nova/core/test-gates/runtime-config.ts';
import { plan } from '../../fixtures/test-gate/remote-plan.mts';

function fixture(t: any) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-source-central-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const repository=path.join(root,'repository');fs.mkdirSync(repository);
 const git=(...args:string[])=>execFileSync('git',['-C',repository,...args]);git('init','-q');fs.writeFileSync(path.join(repository,'README'),'source');git('add','.');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','source');
 const environment={ TEST_TOKEN:'x'.repeat(32), TEST_KEY:crypto.generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'}).toString() };
 const config:any={schemaVersion:'nova-remote-test-gate-runtime.v2',corePolicySelection:{file:'./core.json',profile:'selected'},endpoint:'http://127.0.0.1:1',tokenEnvironmentVariable:'TEST_TOKEN',sourceAttestationPrivateKeyEnvironmentVariable:'TEST_KEY',sourceAuthority:'nova:central',stateRoot:'./state',pollMilliseconds:10,maximumResponseBytes:100000,maximumResultBytes:100000,maximumArchiveBytes:100000,maximumArchiveStoreBytes:1000000,maximumEvidenceBytes:100000,maximumEvidenceStoreBytes:1000000,recordLimits:{maximumRecords:100,maximumBytes:1000000,maximumRecordBytes:100000}};
 const file=path.join(root,'runtime.json'),core=path.join(root,'core.json');
 const publish=(maximumMetadataBytes:number)=>fs.writeFileSync(core,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,sourceAcquisition:{...TEST_CORE_POLICY.sourceAcquisition,maximumMetadataBytes}}}}}));
 const runtime=()=>fs.writeFileSync(file,JSON.stringify(config));runtime();publish(65536);
 const input={idempotencyKey:'central:source',pipelineStageId:'test',plan:plan('blocking',null),repositoryRoot:repository,repositoryId:'repository:central',grants:new Map([['test',[] as string[]]]),maximumConcurrency:1,submittedAt:'2026-08-10T03:00:00.000Z',timeoutMs:3000};
 return {root,file,core,config,environment,publish,runtime,input};
}
test('v2 selects central owner for actual Git and HTTP; original captures survive replacement/deletion',async t=>{
 const f=fixture(t);let requests=0;
 const server=http.createServer((req,res)=>{requests++;req.resume();res.writeHead(400,{'content-type':'application/json'});res.end('{"error":"test.expected-rejection"}');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const address=server.address() as {port:number};f.config.endpoint=`http://127.0.0.1:${address.port}`;f.runtime();
 f.publish(1);const a=loadProductionNovaTestGate(f.file,f.environment);
 const captured=loadCoreRuntimePolicy({file:f.core,profile:'selected'});
 f.publish(65536);const b=loadProductionNovaTestGate(f.file,f.environment);
 await assert.rejects(a.execute(f.input),/NOVA_SOURCE_ARCHIVE_SIZE_EXCEEDED/);assert.equal(requests,0);
 await assert.rejects(b.execute(f.input));assert.equal(requests,1,'B actually reaches HTTP submission after acquiring committed Git source');
 fs.unlinkSync(f.core);await assert.rejects(a.execute(f.input),/NOVA_SOURCE_ARCHIVE_SIZE_EXCEEDED/);assert.equal(requests,1);
 // Retained callers receive original captured values, not a current-file fallback.
 const retained=loadProductionNovaTestGate(f.file,f.environment,captured.sourceAcquisition,captured.remotePlanDispatch.cleanupMilliseconds);
 await assert.rejects(retained.execute(f.input),/NOVA_SOURCE_ARCHIVE_SIZE_EXCEEDED/);assert.equal(requests,1);
 assert.throws(()=>loadProductionNovaTestGate(f.file,f.environment),/ENOENT/);
});
test('v2 rejects absent, malformed, duplicate/inline policies; v1 retains its closed legacy reader',async t=>{
 const f=fixture(t);
 for(const value of [undefined,null,{}, {file:'./core.json'}, {file:'./core.json',profile:'selected',extra:1}]){
  fs.writeFileSync(f.file,JSON.stringify({...f.config,corePolicySelection:value}));assert.throws(()=>loadProductionNovaTestGate(f.file,f.environment),/NOVA_REMOTE_CONFIG_INVALID/);
 }
 for(const key of ['sourceAcquisitionPolicy','timeoutMs']){
  fs.writeFileSync(f.file,JSON.stringify({...f.config,[key]:TEST_CORE_POLICY.sourceAcquisition}));assert.throws(()=>loadProductionNovaTestGate(f.file,f.environment),/NOVA_REMOTE_CONFIG_INVALID:root/);
 }
 for(const field of Object.keys(TEST_CORE_POLICY.sourceAcquisition)){
  for(const value of [undefined,0,-1,1.5,'10',2147483648])assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,sourceAcquisition:{...TEST_CORE_POLICY.sourceAcquisition,[field]:value}}),/INVALID/);
 }
 assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,sourceAcquisition:{...TEST_CORE_POLICY.sourceAcquisition,forceKillAfterMs:1500}}),/BUDGET_INVALID/);
 const legacy={...f.config,schemaVersion:'nova-remote-test-gate-runtime.v1'};delete legacy.corePolicySelection;
 fs.writeFileSync(f.file,JSON.stringify(legacy));assert.doesNotThrow(()=>loadProductionNovaTestGate(f.file,f.environment));
 fs.writeFileSync(f.file,JSON.stringify({...legacy,corePolicySelection:f.config.corePolicySelection}));assert.throws(()=>loadProductionNovaTestGate(f.file,f.environment),/NOVA_REMOTE_CONFIG_INVALID:root/);
});
test('real remote gate CLI consumes v2 central selection before spawning dispatch',t=>{
 const f=fixture(t);f.publish(1);const job=path.join(f.root,'job.json');fs.writeFileSync(job,JSON.stringify({...f.input,grants:Object.fromEntries(f.input.grants)}));
 const result=spawnSync(process.execPath,['skills/nova/core/test-gates/remote-gate-cli.ts','--config',f.file,'--job',job,'--timeout-ms','3000'],{encoding:'utf8',env:{...process.env,...f.environment},timeout:10000});
 assert.equal(result.status,1,result.stderr);assert.match(result.stderr,/NOVA_SOURCE_ARCHIVE_SIZE_EXCEEDED/);assert(!result.error);
});


test('v2 central remote cleanup budget reaches real HTTP cancellation and is captured before owner replacement',async t=>{
 const f=fixture(t);let deletes=0;
 const server=http.createServer((req,res)=>{req.resume();if(req.method==='DELETE')deletes++;res.writeHead(200,{'content-type':'application/json'});res.write(' ');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();server.close();});
 f.config.endpoint=`http://127.0.0.1:${(server.address() as {port:number}).port}`;f.runtime();
 const owner=JSON.parse(fs.readFileSync(f.core,'utf8'));owner.profiles.selected.settings.remotePlanDispatch.cleanupMilliseconds=150;fs.writeFileSync(f.core,JSON.stringify(owner));
 const gate=loadProductionNovaTestGate(f.file,f.environment);
 const captured=loadCoreRuntimePolicy({file:f.core,profile:'selected'});
 owner.profiles.selected.settings.remotePlanDispatch.cleanupMilliseconds=10000;fs.writeFileSync(f.core,JSON.stringify(owner));
 assert.throws(()=>loadProductionNovaTestGate(f.file,f.environment,captured.sourceAcquisition),/NOVA_REMOTE_RETAINED_POLICY_INCOMPLETE/);
 assert.throws(()=>loadProductionNovaTestGate(f.file,f.environment,undefined,captured.remotePlanDispatch.cleanupMilliseconds),/NOVA_REMOTE_RETAINED_POLICY_INCOMPLETE/);
 const started=Date.now();
 await assert.rejects(gate.execute({...f.input,timeoutMs:500}),/TIMEOUT:REMOTE_STATE_UNKNOWN/);
 assert.equal(deletes,1);assert.ok(Date.now()-started<3000,'selected 150ms reconciliation, not current or hidden 10s');
 fs.unlinkSync(f.core);
 assert.throws(()=>loadProductionNovaTestGate(f.file,f.environment,captured.sourceAcquisition),/NOVA_REMOTE_RETAINED_POLICY_INCOMPLETE/);
 assert.throws(()=>loadProductionNovaTestGate(f.file,f.environment,undefined,captured.remotePlanDispatch.cleanupMilliseconds),/NOVA_REMOTE_RETAINED_POLICY_INCOMPLETE/);
 const retained=loadProductionNovaTestGate(f.file,f.environment,captured.sourceAcquisition,captured.remotePlanDispatch.cleanupMilliseconds);
 await assert.rejects(retained.execute({...f.input,timeoutMs:500}),/TIMEOUT:REMOTE_STATE_UNKNOWN/);assert.equal(deletes,2);
 for(const value of [undefined,0,-1,1.5,'10',2147483648])assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,remotePlanDispatch:{cleanupMilliseconds:value}}),/INVALID/);
});
