import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {once} from 'node:events';
import {TEST_CORE_POLICY} from '../../fixtures/core-runtime-policy.mjs';
import {loadPlatformConfig} from '../../../skills/common/plugin-runtime/foundation/config/platform.ts';
import {runPipelineV2,resumePipelineV2,recoverPipelineV2} from '../../../skills/nova/core/execution/engine.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {readRunSnapshot,retainedCoreRuntimePolicy} from '../../../skills/nova/core/execution/engine-snapshots.ts';

test('installed approval selected A/B deadlines and explicit task override; original A resumes without current B',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-approval-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const received=[],secret='approval-policy-test-secret',env='APPROVAL_POLICY_'+crypto.randomBytes(8).toString('hex').toUpperCase();process.env[env]=secret;t.after(()=>delete process.env[env]);
 const server=http.createServer(async(request,response)=>{
  const chunks=[];for await(const chunk of request)chunks.push(chunk);const raw=Buffer.concat(chunks).toString('utf8');
  assert.equal(request.headers['x-kubeclaw-signature'],'v1='+crypto.createHmac('sha256',secret).update(request.headers['idempotency-key']+'.'+raw).digest('hex'));
  received.push(JSON.parse(raw));response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({messageId:'approval-'+received.length}));
 });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const origin='http://127.0.0.1:'+server.address().port,common=path.resolve('skills/common/plugins'),nova=path.resolve('skills/nova/plugins');
 const approval='kubeclaw.human-approval:approval',operator='kubeclaw.operator-messaging:operator',waits='kubeclaw.wait-store:waits',network='kubeclaw.network-http:http',secrets='kubeclaw.secret-resolver:secrets';
 const coreFile=path.join(root,'core.json'),platformFile=path.join(root,'platform.json');
 const publish=minutes=>fs.writeFileSync(coreFile,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,humanApproval:{defaultTimeoutMinutes:minutes}}}}}));
 const source={schemaVersion:'pipeline-platform.v2',corePolicySelection:{file:coreFile,profile:'selected'},installationRoots:[common,nova],trustedBuiltinRoots:[common,nova],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{'operator.request':operator,'signal.wait':waits,'network.http':network,'secrets.read':secrets},grants:{[approval]:{'operator.request':{allowedTargets:['operators']},'signal.wait':{allowedSignalTypes:['approval.resolved'],allowedIssuerIds:['operator:release']}},[operator]:{'network.http':{allowedOrigins:[origin]},'secrets.read':{allowedNames:['approval.token']}}},adapters:{[operator]:{deliveryRoot:path.join(root,'deliveries'),targets:{operators:{endpoint:origin+'/approval',tokenSecret:'approval.token',payloadProfile:'standard'}}},[waits]:{root:path.join(root,'waits')},[network]:{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['content-type','idempotency-key','x-kubeclaw-signature']},[secrets]:{environment:{'approval.token':env}}},activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:1000,effectLockTtlMs:300000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
 fs.writeFileSync(platformFile,JSON.stringify(source));const platform=()=>loadPlatformConfig(platformFile);
 const definition=timeout=>({schemaVersion:'pipeline-definition.v2',id:'approval-policy',maxConcurrency:1,stages:[{id:'approval',type:'kubeclaw.decision.human-approval',dependsOn:[],input:{summary:'Approve selected policy.'},config:{target:'operators',issuerId:'operator:release',...(timeout===undefined?{}:{timeoutMinutes:timeout})},execution:{maxAttempts:2,maxRemediationCycles:0,timeoutMs:10000}}]});
 const checkDeadline=async(id,minutes,task)=>{
  const before=Date.now(),result=await runPipelineV2(platform(),definition(task),id),after=Date.now();
  assert.equal(result.status,'waiting',JSON.stringify([...result.stages]));const wait=result.stages.get('approval').wait;
  assert(Date.parse(wait.expiresAt)>=before+minutes*60000);assert(Date.parse(wait.expiresAt)<=after+minutes*60000);
  assert.equal(received.at(-1).expiresAt,wait.expiresAt);assert.equal(received.at(-1).waitId,wait.waitId);
  const records=JSON.parse(fs.readFileSync(path.join(root,'waits/records/store.json'),'utf8')).records;
  assert(records.some(record=>record.payload.wait.waitId===wait.waitId&&record.payload.wait.expiresAt===wait.expiresAt));
  return result;
 };
 publish(2);const first=await checkDeadline('approval:A',2);const aRoot=runRoot(source.storageRoot,'approval:A'),snapshot=readRunSnapshot(aRoot);
 assert.equal(retainedCoreRuntimePolicy(aRoot).humanApproval.defaultTimeoutMinutes,2);
 publish(7);await checkDeadline('approval:B',7);await checkDeadline('approval:explicit',3,3);
 fs.unlinkSync(coreFile);await assert.rejects(recoverPipelineV2(platform(),definition(),'approval:A'),/RECOVERY_SIGNAL_REQUIRED/);
 const wait=first.stages.get('approval').wait;
 const resumed=await resumePipelineV2(platform(),definition(),'approval:A',{schemaVersion:'resume-signal.v2',signalId:'signal:approval-A',idempotencyKey:'signal-key:approval-A',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{decision:'approved',issuer:wait.authorizedIssuer}});
 assert.equal(resumed.status,'succeeded',JSON.stringify([...resumed.stages]));assert.equal(received.length,3,'approved redispatch must not resend');assert.deepEqual(readRunSnapshot(aRoot),snapshot);
 await assert.rejects(runPipelineV2(platform(),definition(),'approval:C'),/ENOENT/);assert(!fs.existsSync(runRoot(source.storageRoot,'approval:C')));
});
