import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { buildCommittedSourceSnapshot, FileNovaRemotePlanStore, createRemotePlanJob, resolveTestPlan, buildRegistry, discoverPackages } from '../../../skills/nova/core/src/index.ts';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-budget-review-'));
try {
 const repository = path.join(temporary,'repo'); fs.mkdirSync(repository);
 const git = (...args) => execFileSync('git',['-C',repository,...args],{encoding:'utf8'}).trim();
 git('init','-q');
 const privateKey=crypto.generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});
 const source = [];
 for(let i=0;i<2;i++) {
  fs.writeFileSync(path.join(repository,'README.md'),`Review archive ${i}\n`);git('add','README.md');
  git('-c','user.name=Review','-c','user.email=review@example.invalid','commit','-qm',`snapshot ${i}`);
  source.push(buildCommittedSourceSnapshot({repositoryRoot:repository,repositoryId:'repository:review',pipelineStageId:'stage:test',creatorAuthority:'nova:review',attestationPrivateKey:privateKey,maximumArchiveBytes:100000}));
 }
 const roots=[path.resolve('skills/buster/plugins')];
 const registry=buildRegistry(discoverPackages({installationRoots:roots,trustPolicy:{trustedBuiltinRoots:roots,allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'review'}}));
 const limits={cpuMillis:1000,memoryBytes:1048576,logBytes:1000,artifactBytes:1000,artifactFiles:1,processes:1};
 const plan=resolveTestPlan({planId:'plan:review',runId:'run:review',project:'review',scope:{moduleId:'module',gateId:null},createdAt:'2026-09-07T00:00:00Z',registry,
 declaration:{tests:{command:{uses:'kubeclaw.direct-command@1',config:{executable:'node',args:['--version'],workingDirectory:'.',resultMode:'exit-code'}}}},suiteTemplates:[],facts:{changedPaths:[],moduleType:null,pipelineStage:null},
 policy:{defaultTimeoutMs:1000,maximumTimeoutMs:1000,defaultLimits:limits,maximumLimits:limits,maximumRetryCount:1,maximumMatrixSize:1,maximumNodes:1,defaultConcurrencyLimit:1,maximumConcurrencyLimits:{}}});
 const sizes=source.map(s=>s.repositoryArchive.length); const budget=Math.max(...sizes)+1;
 const storeRoot=path.join(temporary,'store');
 const store=new FileNovaRemotePlanStore(storeRoot,{maximumArchiveBytes:100000,maximumArchiveStoreBytes:budget,recordLimits:{maximumRecords:10,maximumRecordBytes:100000,maximumBytes:1000000}});
 for(let i=0;i<2;i++) await store.persistBeforeDispatch(createRemotePlanJob({idempotencyKey:`review:${i}`,pipelineStageId:'stage:test',plan,...source[i],grants:new Map([['command',['command.execute']]]),maximumConcurrency:1,submittedAt:plan.createdAt}));
 const files=fs.readdirSync(path.join(storeRoot,'blobs'),{recursive:true,withFileTypes:true}).filter(f=>f.isFile());
 const actual=files.reduce((sum,f)=>sum+fs.statSync(path.join(f.parentPath,f.name)).size,0);
 assert.equal(files.length,2);assert.ok(actual>budget);
 console.log(JSON.stringify({configuredMaximumArchiveStoreBytes:budget,actualArchiveBlobBytes:actual,archives:files.length,sizes}));
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
