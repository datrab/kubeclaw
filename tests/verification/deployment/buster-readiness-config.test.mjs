import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import { busterChartProjection } from '../../../scripts/generate-buster-chart-config.mjs';
import { prismChartProjection } from '../../../scripts/generate-prism-chart-config.mjs';
import { buildBusterImageBundle } from '../../../scripts/build-buster-image-bundle.mjs';
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
  const revision=execFileSync('git',['rev-parse','--verify','HEAD'],{cwd:repository,encoding:'utf8'}).trim();
  const charts={};
  for(const name of ['kubeclaw','prism']) {
   charts[name]=path.join(root,name);fs.cpSync(`charts/${name}`,charts[name],{recursive:true,dereference:true});
  }
  const values={kubeclaw:yaml.load(fs.readFileSync('my-values/buster-values.yaml','utf8')),prism:yaml.load(fs.readFileSync('charts/prism/ci-values.yaml','utf8'))};
  values.kubeclaw.busterNative={namespace:'kubeclaw',nodeName:'readiness-render-only',policyDigest:'a'.repeat(64)};
  values.kubeclaw.runtimeInfrastructure={registry:{endpoint:'https://registry.example.test',transport:'https',authSecretName:'registry-test'}};
  values.kubeclaw.extraContainers.find(item=>item.name==='buster-v2-runtime').image='ghcr.io/datrab/kubeclaw-buster-runtime@sha256:'+'a'.repeat(64);
  const digests={kubeclaw:[],prism:[]};
  const packaged=path.join(root,'packaged');fs.mkdirSync(packaged);
  const render=(name,projection)=>{
   const file=path.join(root,`${name}-values.yaml`);fs.writeFileSync(file,yaml.dump(values[name]));
   const destination=path.join(packaged,name);fs.rmSync(destination,{recursive:true,force:true});fs.mkdirSync(destination);
   execFileSync('helm',['package',charts[name],'--destination',destination],{stdio:'pipe'});
   const archives=fs.readdirSync(destination).filter(file=>file.endsWith('.tgz'));assert.equal(archives.length,1);
   const archive=path.join(destination,archives[0]),filename=name==='kubeclaw'?'buster-topology.json':'prism-topology.json';
   assert.deepEqual(JSON.parse(execFileSync('tar',['-xOf',archive,`${name}/files/pipeline/${filename}`],{encoding:'utf8'})),projection);
   return spawnSync('helm',['template',projection.deployment.releaseName,archive,'--namespace',projection.deployment.namespace,'-f',file],{encoding:'utf8',maxBuffer:16*1024*1024});
  };
  let retained;
  for(const [index,policy] of [{maximumExecutionMs:300,maximumOutputBytes:64},{maximumExecutionMs:2500,maximumOutputBytes:1024}].entries()) {
   writePolicy(policy);
   const builtAt=new Date().toISOString();
   const bundle=await buildBusterImageBundle({repository:privateRepository,output:path.join(root,`image-${index}`),revision,builtAt});
   const manifest=JSON.parse(fs.readFileSync(path.join(bundle.packageRoot,'manifest.json'),'utf8'));
   assert.equal(manifest.commit,revision);assert.equal(manifest.builtAt,builtAt);
   assert.equal(bundle.metadata.revision,revision);
   const foundation=path.join(bundle.packageRoot,'skills/packages/plugin-foundation/config');
   const boot=await import(pathToFileURL(path.join(foundation,'pipeline-boot.mjs')).href);
   const receiver=await import(pathToFileURL(path.join(foundation,'pipeline-composition.ts')).href);
   const services=declaredPipelineServices(authorRoot,{role:'buster',namespace:bundle.metadata.namespace,releaseName:bundle.metadata.releaseName});
   const captures=[];
   for(const caller of ['buster-preparation','buster-runtime']) {
    assert(services.some(service=>service.callerId===caller));
    const transport=path.join(root,`transport-${index}-${caller}`);fs.mkdirSync(transport);
    fs.cpSync(path.join(path.dirname(bundle.systemRoot),'expected',caller),path.join(transport,'version-A'),{recursive:true});
    fs.symlinkSync('version-A',path.join(transport,'..data'));
    const capture=()=>boot.capturePipelineBootReceipts(transport,bundle.systemRoot,caller,bundle.packageRoot,'/app/skills');
    const selected=capture();
    const settings=receiver.projectBusterSettings(selected,caller);
    assert.deepEqual(settings.dependencyReadiness,policy);assert(Object.isFrozen(settings.dependencyReadiness));
    assert.throws(()=>receiver.projectBusterSettings(selected,caller==='buster-runtime'?'buster-preparation':'buster-runtime'),/PIPELINE_VERIFIED_CAPTURE_REQUIRED/u);
    captures.push({caller,capture,selected});
   }
   const delivered=path.join(bundle.packageRoot,'skills/packages/buster-engine/remote-plan-cli.ts');
   const source=fs.readFileSync(delivered);assert.deepEqual(source,fs.readFileSync('skills/buster/engine/remote-plan-cli.ts'));
   try {
    fs.appendFileSync(delivered,'\n// changed delivered readiness source\n');
    for(const {capture} of captures)assert.throws(capture,/PIPELINE_PACKAGE_READBACK_MISMATCH/u);
   } finally {fs.writeFileSync(delivered,source);}
   for(const {caller,capture} of captures)assert.deepEqual(receiver.projectBusterSettings(capture(),caller).dependencyReadiness,policy);
   if(!retained)retained={receiver,captures,policy};
   else for(const {caller,selected} of retained.captures)assert.deepEqual(retained.receiver.projectBusterSettings(selected,caller).dependencyReadiness,retained.policy);
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
