import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { observeActiveRoleBundle } from './active-role-bundle-observer.mjs';
import { selectedRelease } from '../../scripts/updates/deployment-release.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = fs.readFileSync(new URL('./active-role-bundle-observer.mjs',import.meta.url),'utf8');
function fixture(t, role='nova') {
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'active-bundle-observation-')));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const commit='1'.repeat(40), manifest={schemaVersion:'pipeline-runtime-bundle.v1',bundleKind:'app-skills-package-set',role,commit,contractVersion:'v2'};
 const member=`${role}-${commit}`,origin=path.join(root,member);fs.mkdirSync(path.join(origin,'skills'),{recursive:true});
 const expectedBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync(path.join(origin,'manifest.json'),expectedBytes);
 const archive=path.join(root,'accepted-fixture.tgz');execFileSync('tar',['-czf',archive,'-C',root,member]);
 const sha=hash(fs.readFileSync(archive)), image=`ghcr.io/fixture/kubeclaw-${role==='buster'?'buster-gateway':role==='prism'?'prism-agent':role}@sha256:${'a'.repeat(64)}`;
 const bundle={sha256:sha,url:`https://github.com/fixture/repo/releases/download/code-bundles-1-1/${role}-${commit}.tgz`,contractVersion:'v2'};
 const selection={images:{[role==='buster'?'buster-gateway':role==='prism'?'prism-agent':role]:image},code:{commit,sourceRunId:1,sourceRunAttempt:1,bundles:{[role]:bundle}}};
 const environment=values=>Object.entries(values).map(([name,value])=>({name,value}));
 const main={name:'gateway',image,env:environment({KUBECLAW_CODE_BUNDLE_ENABLED:'true',KUBECLAW_CODE_BUNDLE_AGENT:role,KUBECLAW_CODE_BUNDLE_EXPECTED_COMMIT:commit,KUBECLAW_CODE_BUNDLE_CONTRACT_VERSION:'v2',KUBECLAW_CODE_BUNDLE_MANIFEST:'/runtime-config/code-bundle-manifest.json',PRIVATE_TOKEN:'NEVER_LOG_THIS'}),volumeMounts:[{name:'runtime-config',mountPath:'/runtime-config',readOnly:true}]};
 const init={name:'init-setup',image,env:environment({CODE_BUNDLE_ENABLED:'true',CODE_BUNDLE_ARCHIVE_URL:bundle.url,CODE_BUNDLE_SHA256:sha,CODE_BUNDLE_EXPECTED_COMMIT:commit,CODE_BUNDLE_CONTRACT_VERSION:'v2',AGENT_NAME:role}),volumeMounts:[{name:'runtime-config',mountPath:'/runtime-config'}]};
 const pod={metadata:{uid:'fixture-uid',name:'fixture-pod',namespace:'fixture'},spec:{containers:[main],initContainers:[init],volumes:[{name:'runtime-config',emptyDir:{}}]},status:{containerStatuses:[{name:'gateway',containerID:'containerd://main-1',imageID:`containerd://sha256:${'c'.repeat(64)}`,restartCount:0,state:{running:{startedAt:'2026-10-21T00:00:00Z'}}}],initContainerStatuses:[{name:'init-setup',containerID:'containerd://init-1',imageID:`containerd://sha256:${'d'.repeat(64)}`,state:{terminated:{exitCode:0,finishedAt:'2026-10-20T23:59:59Z'}}}]}};
 const statePath=path.join(root,'state.json'), activeManifest=path.join(root,'active-manifest.json');fs.writeFileSync(activeManifest,expectedBytes);
 const state={pod,after:structuredClone(pod),activeManifest,gets:0,commands:[]};
 const shim=path.join(root,'kubectl-fixture.mjs');fs.writeFileSync(shim,`#!/usr/bin/env node\nimport fs from 'node:fs';import{execFileSync}from'node:child_process';const file=${JSON.stringify(statePath)},s=JSON.parse(fs.readFileSync(file)),args=process.argv.slice(2);s.commands.push(args);const i=args.findIndex(x=>x==='get'||x==='exec');if(args[i]==='get'){s.gets++;fs.writeFileSync(file,JSON.stringify(s));process.stdout.write(JSON.stringify(s.gets===1?s.pod:s.after));}else if(args[i]==='exec'){fs.writeFileSync(file,JSON.stringify(s));const p=args.indexOf('--');if(args[p+1]!=='node'||args[p+2]!=='-e'||args[p+4]!=='/runtime-config/code-bundle-manifest.json')throw Error('unexpected remote reader');process.stdout.write(execFileSync(process.execPath,['-e',args[p+3],s.activeManifest],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));}else throw Error('write command not permitted in fixture');\n`,{mode:0o755});
 const args={selection,role,archive,kubeconfig:path.join(root,'kubeconfig'),context:'fixture-context',namespace:'fixture',podName:'fixture-pod',containerName:'gateway',expectedUid:'fixture-uid',kubectl:shim};
 return {root,args,state,manifest,expectedBytes,activeManifest,save(){fs.writeFileSync(statePath,JSON.stringify(state));},run(){this.save();return observeActiveRoleBundle(args);},record(){return JSON.parse(fs.readFileSync(statePath));}};
}
for(const role of ['nova','buster','prism'])test(`observes actual fixture manifest bytes and separate local archive identity for ${role}`,t=>{
 const f=fixture(t,role),result=f.run(),record=f.record();assert.equal(result.role,role);assert.equal(result.observedManifestSha256,hash(f.expectedBytes));assert.equal(result.acceptedArchiveSha256,hash(fs.readFileSync(f.args.archive)));assert.equal(result.localArchiveHashVerified,true);assert.equal(result.manifestMatchesAcceptedArchive,true);assert.equal(result.liveArchiveBytesObserved,false);assert.equal(result.fullActivePayloadVerified,false);assert.equal(result.loadedModuleIdentityProven,false);assert.equal(result.imageID,f.state.pod.status.containerStatuses[0].imageID);assert.notEqual(result.imageID,f.state.pod.spec.containers[0].image);assert.equal(record.gets,2);assert.equal(record.commands.length,3);for(const c of record.commands){assert(c.includes('--context=fixture-context'));assert(c.includes('--namespace=fixture'));assert(c.includes(`--kubeconfig=${f.args.kubeconfig}`));}assert(!JSON.stringify(result).includes('NEVER_LOG_THIS'));
});
for(const[name,mutate,code]of[
 ['changed Pod UID',f=>{f.state.after.metadata.uid='replacement';},'POD_IDENTITY_CHANGED'],
 ['changed container lifetime',f=>{f.state.after.status.containerStatuses[0].containerID='containerd://main-2';},'CONTAINER_CHANGED_DURING_OBSERVATION'],
 ['changed restart count',f=>{f.state.after.status.containerStatuses[0].restartCount=1;},'CONTAINER_CHANGED_DURING_OBSERVATION'],
 ['different requested image',f=>{f.state.pod.spec.containers[0].image='ghcr.io/fixture/wrong@sha256:'+ 'f'.repeat(64);},'REQUESTED_IMAGE_MISMATCH'],
 ['failed init',f=>{f.state.pod.status.initContainerStatuses[0].state.terminated.exitCode=1;},'RUNNING_CONTAINER_AND_COMPLETED_INIT_REQUIRED'],
 ['wrong configured archive hash',f=>{f.state.pod.spec.initContainers[0].env.find(x=>x.name==='CODE_BUNDLE_SHA256').value='0'.repeat(64);},'INIT_PROFILE_MISMATCH'],
 ['duplicate reserved environment',f=>{f.state.pod.spec.containers[0].env.push({name:'KUBECLAW_CODE_BUNDLE_AGENT',value:'nova'});},'LITERAL_PROFILE_ENV_REQUIRED'],
 ['writable manifest mount',f=>{f.state.pod.spec.containers[0].volumeMounts[0].readOnly=false;},'READONLY_SHARED_MANIFEST_PROFILE_REQUIRED'],
 ['different manifest volume',f=>{f.state.pod.spec.initContainers[0].volumeMounts[0].name='other';},'READONLY_SHARED_MANIFEST_PROFILE_REQUIRED'],
 ['external manifest volume',f=>{f.state.pod.spec.volumes[0]={name:'runtime-config',secret:{secretName:'fixture-only'}};},'INIT_MANIFEST_VOLUME_REQUIRED'],
 ['same metadata but different live manifest bytes',f=>{fs.writeFileSync(f.activeManifest,JSON.stringify(f.manifest));},'OBSERVED_MANIFEST_MISMATCH'],
 ['different live manifest commit',f=>{fs.writeFileSync(f.activeManifest,JSON.stringify({...f.manifest,commit:'0'.repeat(40)}));},'OBSERVED_MANIFEST_MISMATCH'],
 ['changed local archive bytes',f=>{fs.appendFileSync(f.args.archive,'changed');},'ACCEPTED_ARCHIVE_HASH_MISMATCH'],
 ['unknown role',f=>{f.args.role='constructor';},'ROLE_IMAGE_SELECTION_REQUIRED'],
 ['image-only selection',f=>{delete f.args.selection.code;},'CODE_SELECTION_REQUIRED'],
])test(`rejects ${name}`,t=>{const f=fixture(t);mutate(f);assert.throws(()=>f.run(),new RegExp(`ACTIVE_BUNDLE_${code}`));});
test('missing selection in an isolated checkout stops exact stdin CLI before cluster operations',t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'bundle-selection-absent-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'scripts/updates'),{recursive:true});fs.symlinkSync('/home/node/.openclaw/workspace/kubeclaw-pr13-recovery/scripts/updates/deployment-release.mjs',path.join(root,'scripts/updates/deployment-release.mjs'));
 assert.throws(()=>selectedRelease(root,'runtime'),/No selected runtime release/);
 const result=spawnSync(process.execPath,['--input-type=module','-','nova','unused.tgz','missing-kubeconfig','never-used-context','fixture','fixture-pod','gateway','fixture-uid'],{cwd:root,input:source,encoding:'utf8'});assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr.trim(),'ACTIVE_BUNDLE_SELECTION_OR_READER_FAILED');
});
test('present but incompatible current selection stops exact stdin CLI before cluster operations',()=>{
 const root=fs.realpathSync(new URL('../../',import.meta.url));assert(fs.existsSync(path.join(root,'releases/runtime-images.json')));assert(fs.existsSync(path.join(root,'releases/runtime-code.json')));
 assert.throws(()=>selectedRelease(root,'runtime'),e=>e.stderr?.toString().includes('RELEASE_CONFIGURATION_CHANGED: charts/kubeclaw/files/config/knip.json'));
 const result=spawnSync(process.execPath,['--input-type=module','-','nova','unused.tgz','missing-kubeconfig','never-used-context','fixture','fixture-pod','gateway','fixture-uid'],{cwd:root,input:source,encoding:'utf8'});assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr.trim(),'ACTIVE_BUNDLE_SELECTION_OR_READER_FAILED');
});
