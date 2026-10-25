import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import yaml from 'js-yaml';
import {runtimeImages} from '../../../scripts/updates/runtime-components.mjs';
import {runtimePublicationCommand} from '../../../scripts/updates/runtime-publication-scope.mjs';
const root=path.resolve(import.meta.dirname,'../../..');
test('actual receipt CLIs retain authenticated-baseline-shaped other roles despite building every component',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rollout-receipts-'));
 try {
  const before='a'.repeat(40),after='b'.repeat(40),baseline='releases/gitops/test-baseline';
  const priorCode={schemaVersion:1,commit:before,sourceRunId:123,sourceRunAttempt:1,bundles:Object.fromEntries(['nova','buster','prism'].map(role=>[role,{url:`https://github.com/example/repo/releases/download/code-bundles-123-1/${role}-${before}.tgz`,sha256:'a'.repeat(64),contractVersion:'v2'}]))};
  const prior={schemaVersion:1,commit:before,sourceRunId:123,sourceRunAttempt:1,images:Object.fromEntries(runtimeImages.map(name=>[name,`ghcr.io/example/kubeclaw-${name}@sha256:${'a'.repeat(64)}`]))};
  fs.mkdirSync(path.join(dir,baseline),{recursive:true});fs.mkdirSync(path.join(dir,'input'));fs.mkdirSync(path.join(dir,'dist'));
  fs.writeFileSync(path.join(dir,baseline,'bundle.receipt'),JSON.stringify({schemaVersion:'kubeclaw-gitops-bundle.v1',receipt:{...prior,code:priorCode}}));
  for(const name of runtimeImages)fs.writeFileSync(path.join(dir,'input',name+'.json'),JSON.stringify({name,commit:after,image:`ghcr.io/example/kubeclaw-${name}@sha256:${'b'.repeat(64)}`}));
  for(const role of ['nova','buster','prism'])fs.writeFileSync(path.join(dir,'dist',`${role}-${after}.tgz`),'synthetic test archive; not deployment evidence');
  const env={...process.env,NODE_ENV:'test',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:after,GITHUB_RUN_ID:'456',GITHUB_RUN_ATTEMPT:'1',SOURCE_RUN_ID:'456',SOURCE_RUN_ATTEMPT:'1',RUNTIME_REFRESH_PLAN:'',RUNTIME_RECEIPT_SCOPE:'buster',GITOPS_RETAINED_BASELINE:baseline};
  const run=(file,args)=>execFileSync(process.execPath,[path.join(root,'scripts/updates',file),...args],{cwd:dir,env,stdio:'pipe'});
  run('release-images.mjs',['input',after,'dist/images.json','runtime']);run('code-release.mjs',['dist',after,'example/repo']);
  const images=JSON.parse(fs.readFileSync(path.join(dir,'dist/images.json'))),code=JSON.parse(fs.readFileSync(path.join(dir,'dist/runtime-code.json')));
  assert.equal(images.retainedBaseline,baseline);assert.equal(code.retainedBaseline,baseline);
  for(const name of runtimeImages)assert.equal(images.images[name],['buster-runtime','namespace-controller'].includes(name)?`ghcr.io/example/kubeclaw-${name}@sha256:${'b'.repeat(64)}`:prior.images[name]);
  for(const role of ['nova','prism'])assert.deepEqual(code.bundles[role],{...priorCode.bundles[role],source:{commit:before,sourceRunId:123,sourceRunAttempt:1}});
  assert.equal(runtimePublicationCommand({...prior,code:priorCode},{...images,code},true),'export-buster');
  const rejected=spawnSync(process.execPath,[path.join(root,'scripts/updates/release-images.mjs'),'input',after,'rejected.json','runtime'],{cwd:dir,env:{...env,GITOPS_RETAINED_BASELINE:''}});
  assert.notEqual(rejected.status,0);assert.equal(fs.existsSync(path.join(dir,'rejected.json')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('workflow transports receipt scope and selector baseline without bypassing candidate authentication',()=>{
 const read=name=>yaml.load(fs.readFileSync(path.join(root,'.github/workflows',name),'utf8'));
 const main=read('build-images.yaml'),receipt=read('publish-image-receipts.yaml'),publish=read('auto-promote-runtime.yaml');
 assert.deepEqual(main.on.workflow_dispatch.inputs.receipt_scope.options,['all','buster']);
 assert.equal(main.env.RUNTIME_RECEIPT_SCOPE,"${{ inputs.receipt_scope || 'all' }}");
 assert.equal(main.jobs['preserve-receipts'].with.receipt_scope,main.env.RUNTIME_RECEIPT_SCOPE);
 assert.equal(receipt.env.RUNTIME_RECEIPT_SCOPE,main.env.RUNTIME_RECEIPT_SCOPE);
 const step=publish.jobs.publish.steps.find(s=>s.name==='Materialize and validate Argo deployment');
 assert.equal(step.env.GITOPS_RETAINED_BASELINE,'${{ steps.selection.outputs.retained_baseline }}');
 assert.match(step.run,/GITOPS_RETAINED_BASELINE= node scripts\/updates\/verify-release-source.mjs/);
 const selector=fs.readFileSync(path.join(root,'scripts/updates/select-runtime-deployment.mjs'),'utf8');
 assert.ok(selector.indexOf('await verifyReleaseSources')<selector.indexOf('fs.writeFileSync'));
 assert.match(selector,/RETAINED_BASELINE_MISMATCH/);
});
