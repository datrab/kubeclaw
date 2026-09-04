import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, createProductionNovaTestGate, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { BusterRemotePlanRuntime, BusterRemotePlanService, FileBusterPlanJobStore } from '@kubeclaw/buster-engine';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'security-remote-vertical-'));const repository=path.join(root,'repository');
const token='security-remote-vertical-token-0001';const keys=crypto.generateKeyPairSync('ed25519');
const privateKey=keys.privateKey.export({type:'pkcs8',format:'pem'}),publicKey=keys.publicKey.export({type:'spki',format:'pem'});
try{
  fs.mkdirSync(repository,{recursive:true});fs.writeFileSync(path.join(repository,'package.json'),'\n{"name":"security-proof","version":"1.0.0"}\n');
  fs.writeFileSync(path.join(repository,'package-lock.json'),'\n{"name":"security-proof","version":"1.0.0","lockfileVersion":3,"requires":true,"packages":{"":{"name":"security-proof","version":"1.0.0"}}}\n');
  execFileSync('git',['-C',repository,'init','-q']);execFileSync('git',['-C',repository,'config','user.email','security@example.invalid']);
  execFileSync('git',['-C',repository,'config','user.name','Security Proof']);execFileSync('git',['-C',repository,'add','.']);
  execFileSync('git',['-C',repository,'commit','-qm','Security remote fixture']);
  const pluginRoot=path.resolve('skills/buster/plugins');const registry=buildRegistry(discoverPackages({installationRoots:[pluginRoot],trustPolicy:{trustedBuiltinRoots:[pluginRoot],allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'security-remote-vertical'}}));
  const limits={cpuMillis:300000,memoryBytes:1073741824,logBytes:1048576,artifactBytes:1048576,artifactFiles:8,processes:8};
  const plan=resolveTestPlan({planId:'plan:security:remote',runId:'run:security:remote',project:'security-remote',scope:{moduleId:'security',gateId:null},createdAt:'2026-09-04T00:00:00.000Z',declaration:{tests:{dependency:{uses:'kubeclaw.dependency-scan-trivy@1',mode:'blocking',retries:0,concurrencyGroup:'security-dependency',config:{projectDirectory:'.',policy:{profile:'strict-v1'}}}},concurrencyLimits:{'security-dependency':1}},suiteTemplates:[],registry,facts:{changedPaths:['package-lock.json'],moduleType:'service',pipelineStage:'test'},policy:{defaultTimeoutMs:300000,maximumTimeoutMs:300000,defaultLimits:limits,maximumLimits:limits,maximumRetryCount:1,maximumMatrixSize:1,maximumNodes:2,defaultConcurrencyLimit:1,maximumConcurrencyLimits:{'security-dependency':1}}});
  const records={maximumRecords:100,maximumBytes:134217728,maximumRecordBytes:67108864};const cacheCandidates=[path.join(os.homedir(),'.cache/trivy'),path.join(os.homedir(),'.cache/.cache/trivy'),'/tmp/.cache/trivy'];const cache=cacheCandidates.find((item)=>fs.existsSync(item));assert.ok(cache,'real Trivy database is required');
  const store=new FileBusterPlanJobStore(path.join(root,'buster-state'),{recordLimits:records,maximumArchiveBytes:8388608,maximumResultBytes:67108864,maximumResultStoreBytes:134217728,trustedSourceAuthority:'nova:production',sourceAttestationPublicKey:publicKey});
  const service=new BusterRemotePlanService({store,registry,workerRevision:'b'.repeat(40),runtimeRoot:path.join(root,'buster-runs'),tarExecutable:'/usr/bin/tar',maximumExtractedBytes:33554432,allowedCapabilities:new Set(['security.scan']),securityScan:{trivyExecutable:'/usr/local/bin/trivy',allowedRegistryPrefixes:['docker.io/library'],maximumExecutionMs:300000,maximumOutputBytes:67108864,cacheDirectory:cache}});
  const runtime=new BusterRemotePlanRuntime({service,host:'127.0.0.1',port:0,token,maximumRequestBytes:16777216,maximumResponseBytes:65536,maximumResultBytes:67108864,shutdownTimeoutMs:5000});const address=await runtime.start();
  try{const gate=createProductionNovaTestGate({stateRoot:path.join(root,'nova-state'),endpoint:`http://127.0.0.1:${address.port}`,token,sourceAuthority:'nova:production',sourceAttestationPrivateKey:privateKey,pollMilliseconds:10,maximumResponseBytes:65536,maximumResultBytes:67108864,maximumArchiveBytes:8388608,maximumArchiveStoreBytes:33554432,maximumEvidenceBytes:67108864,maximumEvidenceStoreBytes:134217728,recordLimits:records,legacyLedger:{}});
    const executed=await gate.execute({idempotencyKey:'security:remote:vertical',pipelineStageId:'stage:security',plan,repositoryRoot:repository,repositoryId:'repository:security',maximumConcurrency:1,grants:new Map([['dependency',['security.scan']]]),submittedAt:'2026-09-04T00:00:00.000Z',timeoutMs:360000,legacySuites:[]});assert.equal(executed.remote.status.state,'completed');assert.equal(executed.remote.decision.state,'passed');
    const reference=executed.remote.status.result!;const result=JSON.parse((await service.result(executed.remote.status.jobId,reference.contentDigest,reference.sizeBytes)).toString('utf8'));assert.equal(result.attempts[0].providerDetails.values.scanner,'dependency-trivy');const imports=JSON.parse(fs.readFileSync(path.join(root,'nova-state/imports/records/store.json'),'utf8')).records;assert.equal(imports.some((record:any)=>record.payload?.decision?.decisionDigest===executed.remote.decision.decisionDigest),true);
  }finally{await runtime.stop();}
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log(JSON.stringify({ok:true,phase:'security-remote-vertical',authenticatedDispatch:true,evidenceImported:true,realTrivy:true,realAdvisoryDatabase:true,mocks:0,emulators:0}));
