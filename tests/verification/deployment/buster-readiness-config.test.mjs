import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import { busterChartProjection } from '../../../scripts/generate-buster-chart-config.mjs';
import { prismChartProjection } from '../../../scripts/generate-prism-chart-config.mjs';
import { buildBusterImageBundle } from '../../../scripts/build-buster-image-bundle.mjs';
import { captureSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { declaredPipelineServices } from '../../../scripts/updates/pipeline-generation.mjs';

// Preserve the original A/B, malformed-leaf, boundary and rollout obligations.
// Runtime policy is now validated before image publication, not authored by Helm.
// Prism no longer mounts Buster configuration; its shared generation still
// validates every central author before the chart projection is emitted.
test('central readiness A/B and malformed policies follow actual image/chart generation for both charts', async () => {
 const repository=process.cwd(), root=fs.mkdtempSync(path.join(os.tmpdir(),'readiness-chart-'));
 try {
  const privateRepository=path.join(root,'repository');fs.mkdirSync(privateRepository);
  fs.cpSync('config',path.join(privateRepository,'config'),{recursive:true,dereference:true});
  for(const name of ['scripts','skills'])fs.symlinkSync(path.join(repository,name),path.join(privateRepository,name));
  const authorRoot=path.join(privateRepository,'config'), owner=path.join(authorRoot,'components/buster-engine.config.json');
  const originalFile=path.resolve('config/components/buster-engine.config.json'), originalBytes=fs.readFileSync(originalFile);
  assert.notEqual(fs.statSync(owner).ino,fs.statSync(originalFile).ino);
  assert(!fs.lstatSync(owner).isSymbolicLink());
  const baseline=JSON.parse(fs.readFileSync(owner,'utf8'));
  const writePolicy=policy=>{
   const document=structuredClone(baseline);document.profiles.runtime.settings.dependencyReadiness=policy;
   fs.writeFileSync(owner,JSON.stringify(document));
  };
  const charts={};
  for(const name of ['kubeclaw','prism']) {
   charts[name]=path.join(root,name);fs.cpSync(`charts/${name}`,charts[name],{recursive:true,dereference:true});
  }
  const values={kubeclaw:yaml.load(fs.readFileSync('my-values/buster-values.yaml','utf8')),prism:yaml.load(fs.readFileSync('charts/prism/ci-values.yaml','utf8'))};
  values.kubeclaw.busterNative={namespace:'kubeclaw',nodeName:'readiness-render-only',policyDigest:'a'.repeat(64)};
  values.kubeclaw.runtimeInfrastructure={registry:{endpoint:'https://registry.example.test',transport:'https',authSecretName:'registry-test'}};
  values.kubeclaw.extraContainers.find(item=>item.name==='buster-v2-runtime').image='ghcr.io/datrab/kubeclaw-buster-runtime@sha256:'+'a'.repeat(64);
  const digests={kubeclaw:[],prism:[]};
  const render=(name,projection)=>{
   const file=path.join(root,`${name}-values.yaml`);fs.writeFileSync(file,yaml.dump(values[name]));
   return spawnSync('helm',['template',projection.deployment.releaseName,charts[name],'--namespace',projection.deployment.namespace,'-f',file],{encoding:'utf8',maxBuffer:16*1024*1024});
  };
  for(const [index,policy] of [{maximumExecutionMs:300,maximumOutputBytes:64},{maximumExecutionMs:2500,maximumOutputBytes:1024}].entries()) {
   writePolicy(policy);
   const bundle=await buildBusterImageBundle({repository:privateRepository,output:path.join(root,`image-${index}`),revision:'a'.repeat(40),builtAt:'2026-10-16T00:00:00Z'});
   const services=declaredPipelineServices(authorRoot,{role:'buster',namespace:bundle.metadata.namespace,releaseName:bundle.metadata.releaseName});
   const runtime=services.find(service=>service.callerId==='buster-preparation');assert(runtime);
   assert.deepEqual(captureSwarmSettings(path.join(bundle.systemRoot,'pipeline.config.json'),runtime).components['buster-engine'].settings.dependencyReadiness,policy);
   values.kubeclaw.pipelineDelivery={buster:bundle.metadata};
   for(const [name,project] of [['kubeclaw',busterChartProjection],['prism',prismChartProjection]]) {
    const projection=project(authorRoot), filename=name==='kubeclaw'?'buster-topology.json':'prism-topology.json';
    fs.writeFileSync(path.join(charts[name],'files/pipeline',filename),JSON.stringify(projection));
    const result=render(name,projection);assert.equal(result.status,0,result.stderr);
    const docs=yaml.loadAll(result.stdout);digests[name].push(projection.generationDigest);
    if(name==='kubeclaw') {
     const map=docs.find(doc=>doc?.kind==='ConfigMap'&&doc.data?.['expected-delivery.json']);assert(map);
     assert.equal(JSON.parse(map.data['expected-delivery.json']).generationDigest,projection.generationDigest);
    } else assert(docs.some(doc=>doc?.kind==='Deployment'&&doc.spec.template.metadata.annotations?.['checksum/swarm-config']));
    values[name].busterComponentFile='files/config/buster-engine.config.json';
    const retired=render(name,projection);assert.notEqual(retired.status,0);assert.match(retired.stderr,/retired|Additional property busterComponentFile is not allowed/);delete values[name].busterComponentFile;
   }
  }
  for(const name of ['kubeclaw','prism'])assert.notEqual(digests[name][0],digests[name][1],'central owner change must change delivered generation');
  const original=baseline.profiles.runtime.settings.dependencyReadiness;
  const malformed=[undefined,null,[],{},{...original,extra:1}];
  for(const [field,maximum] of [['maximumExecutionMs',30000],['maximumOutputBytes',1048576]]) {
   for(const value of [undefined,null,false,true,'1000',[],{},0,-1,1.5,maximum+1]) {
    const policy={...original,[field]:value};if(value===undefined)delete policy[field];malformed.push(policy);
   }
   for(const value of [1,maximum]) {
    writePolicy({...original,[field]:value});busterChartProjection(authorRoot);prismChartProjection(authorRoot);
   }
  }
  for(const policy of malformed) {
   writePolicy(policy);
   for(const project of [busterChartProjection,prismChartProjection])assert.throws(()=>project(authorRoot),/SWARM|PIPELINE|dependencyReadiness|maximumExecutionMs|maximumOutputBytes/i);
  }
  writePolicy(original);busterChartProjection(authorRoot);prismChartProjection(authorRoot);
  assert.deepEqual(fs.readFileSync(originalFile),originalBytes,'private mutations must not change the source owner');
  assert.doesNotMatch(fs.readFileSync('docker/buster-runtime-entrypoint.sh','utf8'),/dependencyReadiness/);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
