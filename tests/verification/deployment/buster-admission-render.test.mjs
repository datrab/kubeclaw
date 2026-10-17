import {buildBusterImageBundle} from '../../../scripts/build-buster-image-bundle.mjs';
import {declaredPipelineServices,materializePipelineGeneration} from '../../../scripts/updates/pipeline-generation.mjs';
import {busterChartProjection} from '../../../scripts/generate-buster-chart-config.mjs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import yaml from 'js-yaml';

const retired = ['BUSTER_V2_MAX_ACTIVE_JOBS', 'BUSTER_V2_MAX_QUEUED_JOBS', 'BUSTER_V2_MAX_CONCURRENT_ATTEMPTS'];
test('actual Buster chart binds both authored admission profiles and rejects retired ENV authors', async () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'buster-admission-render-'));
 try{
  const revision=execFileSync('git',['rev-parse','--verify','HEAD'],{encoding:'utf8'}).trim();
  const builtAt=new Date().toISOString();
  const image=await buildBusterImageBundle({repository:process.cwd(),output:path.join(root,'image'),revision,builtAt});
  const manifest=JSON.parse(fs.readFileSync(path.join(image.packageRoot,'manifest.json'),'utf8'));
  assert.equal(manifest.commit,revision);assert.equal(manifest.builtAt,builtAt);
  assert.equal(image.metadata.revision,revision);
  // Local source receipt only: render-only OCI/native identities below are not installed facts.
  const foundation=path.join(image.packageRoot,'skills/packages/plugin-foundation/config');
  const boot=await import(pathToFileURL(path.join(foundation,'pipeline-boot.mjs')).href),projection=await import(pathToFileURL(path.join(foundation,'pipeline-composition.ts')).href);
  const author=path.join(root,'config'),chart=path.join(root,'chart');fs.cpSync('config',author,{recursive:true});fs.cpSync('charts/kubeclaw',chart,{recursive:true,dereference:true});
  const values=yaml.load(fs.readFileSync('my-values/buster-values.yaml','utf8'));
  values.busterNative={namespace:'kubeclaw',nodeName:'admission-render-only',policyDigest:'a'.repeat(64)};
  values.runtimeInfrastructure={registry:{endpoint:'https://registry.example.test',transport:'https',authSecretName:'registry-test'}};
  const container=values.extraContainers.find(item=>item.name==='buster-v2-runtime');container.image='ghcr.io/datrab/kubeclaw-buster-runtime@sha256:'+'a'.repeat(64);
  const file=path.join(root,'values.yaml'),checksums=[];let retained;
  const render=()=>{fs.writeFileSync(file,yaml.dump(values));return spawnSync('helm',['template','agent-buster',chart,'--namespace','kubeclaw','-f',file],{encoding:'utf8',maxBuffer:16*1024*1024});};
  const profiles=[{maximumActiveJobs:2,maximumQueuedJobs:8,maximumConcurrentAttempts:64},
   {maximumActiveJobs:1,maximumQueuedJobs:3,maximumConcurrentAttempts:4}];
  for(const admission of profiles){
   const {maximumQueuedJobs}=admission;
   const component=path.join(author,'components/buster-engine.config.json'),document=JSON.parse(fs.readFileSync(component));document.profiles.runtime.settings.admission=admission;fs.writeFileSync(component,JSON.stringify(document));
   const generation=path.join(root,`generation-${maximumQueuedJobs}`);await materializePipelineGeneration({authorRoot:author,packageRoot:image.packageRoot,output:generation,services:declaredPipelineServices(author,{role:'buster',namespace:'kubeclaw',releaseName:'agent-buster'}),publisher:path.join(root,'image/publish')});
   const delivery=path.join(root,`delivery-${maximumQueuedJobs}`);fs.mkdirSync(delivery);fs.cpSync(path.join(generation,'expected/buster-preparation'),path.join(delivery,'version'),{recursive:true});fs.symlinkSync('version',path.join(delivery,'..data'));
   const current=boot.capturePipelineBootReceipts(delivery,path.join(generation,'system'),'buster-preparation',image.packageRoot,'/app/skills');
   const runtimeDelivery=path.join(root,`runtime-delivery-${maximumQueuedJobs}`);fs.mkdirSync(runtimeDelivery);
   fs.cpSync(path.join(generation,'expected/buster-runtime'),path.join(runtimeDelivery,'version'),{recursive:true});fs.symlinkSync('version',path.join(runtimeDelivery,'..data'));
   const captureRuntime=()=>boot.capturePipelineBootReceipts(runtimeDelivery,path.join(generation,'system'),'buster-runtime',image.packageRoot,'/app/skills');
   const runtime=captureRuntime();
   for(const [capture,caller] of [[current,'buster-preparation'],[runtime,'buster-runtime']]){
    const selected=projection.projectBusterSettings(capture,caller);
    assert.deepEqual(selected.admission,admission);assert(Object.isFrozen(selected.admission));
   }
   assert.throws(()=>projection.projectBusterSettings(current,'buster-runtime'),/PIPELINE_VERIFIED_CAPTURE_REQUIRED/u);
   assert.throws(()=>projection.projectBusterSettings(runtime,'buster-preparation'),/PIPELINE_VERIFIED_CAPTURE_REQUIRED/u);
   const entrypoint=path.join(image.packageRoot,'skills/packages/buster-engine/remote-plan-cli.ts');
   const original=fs.readFileSync(entrypoint);
   assert.deepEqual(original,fs.readFileSync('skills/buster/engine/remote-plan-cli.ts'));
   try{fs.appendFileSync(entrypoint,'\n// altered delivered source\n');assert.throws(captureRuntime,/PIPELINE_PACKAGE_READBACK_MISMATCH/u);}
   finally{fs.writeFileSync(entrypoint,original);}
   assert.deepEqual(projection.projectBusterSettings(captureRuntime(),'buster-runtime').admission,admission);
   if(!retained)retained={parent:current,runtime};else{
    assert.deepEqual(projection.projectBusterSettings(retained.parent,'buster-preparation').admission,profiles[0]);
    assert.deepEqual(projection.projectBusterSettings(retained.runtime,'buster-runtime').admission,profiles[0]);
   }
   values.pipelineDelivery={buster:{...image.metadata,expected:JSON.parse(fs.readFileSync(path.join(delivery,'version/expected-delivery.json')))}};
   fs.writeFileSync(path.join(chart,'files/pipeline/buster-topology.json'),JSON.stringify(busterChartProjection(author)));
   const result=render();assert.equal(result.status,0,result.stderr);const docs=yaml.loadAll(result.stdout),deployment=docs.find(doc=>doc?.kind==='Deployment'&&doc.metadata.name==='agent-buster');
   checksums.push(deployment.spec.template.metadata.annotations['checksum/pipeline-delivery']);
   const actual=deployment.spec.template.spec.containers.find(item=>item.name==='buster-v2-runtime');assert(!(actual.env??[]).some(item=>item.name==='SWARM_CONFIG'));assert(actual.volumeMounts.some(item=>item.mountPath==='/run/pipeline-delivery'&&item.readOnly&&!item.subPath));
  }
  assert.notEqual(checksums[0],checksums[1]);
  for(const name of retired){container.env.push({name,value:'8'});const result=render();assert.notEqual(result.status,0);assert.match(result.stderr,/duplicates the native Buster startup author/);container.env.pop();}
  for(const name of retired)for(const source of ['docker/Dockerfile.buster-runtime','docker/buster-runtime-entrypoint.sh'])assert(!fs.readFileSync(source,'utf8').includes(name));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('actual service CLI rejects inherited retired ENV before opening its parent channel', () => {
  assert.equal(process.getuid(), 1000, 'this unprivileged CLI proof uses its real service identity');
  assert.equal(process.getgid(), 1000);
  for (const name of retired) {
    const environment = { ...process.env, [name]: '2' };
    delete environment.NODE_TEST_CONTEXT; delete environment.SWARM_CONFIG;
    const result = spawnSync(process.execPath, ['skills/buster/engine/remote-plan-cli.ts', '--config', '/unused-runtime.json'],
      { env: environment, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`SWARM_CONFIG_LEGACY_OVERRIDE:${name}`), result.stderr);
    assert.doesNotMatch(result.stderr, /EBADF|ENOENT|BUSTER_SERVICE_IDENTITY_REQUIRED/);
  }
});
