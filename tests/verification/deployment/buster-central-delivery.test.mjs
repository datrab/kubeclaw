import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import yaml from 'js-yaml';
import {buildBusterImageBundle} from '../../../scripts/build-buster-image-bundle.mjs';
import {buildBusterProofHarness} from '../../../scripts/build-buster-proof-harness.mjs';
import {busterChartProjection} from '../../../scripts/generate-buster-chart-config.mjs';
import {collectReceipts} from '../../../scripts/updates/release-images.mjs';
import {validateBusterImageDelivery} from '../../../scripts/updates/buster-image-delivery.mjs';
import {isImageInput} from '../../../scripts/updates/runtime-inputs.mjs';

const repository=process.cwd(),revision='a'.repeat(40);
let root,result,boot;
test.before(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'buster-central-delivery-'));result=await buildBusterImageBundle({repository,output:path.join(root,'image'),revision,builtAt:'2026-10-15T00:00:00Z'});boot=await import(pathToFileURL(path.join(result.packageRoot,'skills/packages/plugin-foundation/config/pipeline-boot.mjs')).href);});
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
const sealedWrite=(file,bytes)=>{fs.chmodSync(file,0o644);fs.writeFileSync(file,bytes);fs.chmodSync(file,0o444);};
const capture=()=>boot.capturePipelineBootReceipts(result.deliveryRoot,result.systemRoot,'buster-preparation',result.packageRoot,'/app/skills');

test('actual emitted role verifies exact installed files, both selections and native parent/child handoff',async()=>{
 const current=capture(),handoff=boot.captureBusterParentStartupHandoff(current);
 assert.equal(handoff.childSelection.callerId,'buster-runtime');assert.equal(handoff.childSelection.serviceInstanceId,current.selectionReceipt.serviceInstanceId);
 const engine=await import(pathToFileURL(path.join(result.packageRoot,'skills/packages/buster-engine/src/index.ts')).href);assert.equal(typeof engine.BusterRemotePlanRuntime,'function');
 assert(fs.statSync(path.join(result.packageRoot,'skills/node_modules/playwright/cli.js')).mode&0o111);
 assert(!fs.existsSync(path.join(result.packageRoot,'node_modules')));assert(!fs.existsSync(path.join(result.packageRoot,'scripts')));
 assert.equal(result.metadata.expected.generationDigest,busterChartProjection(path.join(repository,'config')).generationDigest);
 validateBusterImageDelivery(result.metadata,revision);
});

test('extra/missing/mutated installed bytes and wrong parent receipt reject; restored original generation works',()=>{
 const extra=path.join(result.packageRoot,'unindexed-helper.mjs');fs.writeFileSync(extra,'export{}');assert.throws(capture,/READBACK_MISMATCH/);fs.rmSync(extra);capture();
 const entry=path.join(result.packageRoot,'skills/packages/buster-engine/native-parent.ts'),original=fs.readFileSync(entry);fs.writeFileSync(entry,'invalid changed image bytes');assert.throws(capture,/READBACK_MISMATCH/);fs.writeFileSync(entry,original);capture();
 const expected=path.join(result.deliveryRoot,'version/expected-delivery.json'),bytes=fs.readFileSync(expected),changed=JSON.parse(bytes);changed.callerId='buster-runtime';sealedWrite(expected,JSON.stringify(changed));assert.throws(capture,/EXPECTED_RECEIPT_INVALID/);sealedWrite(expected,bytes);capture();
 const child=path.join(result.systemRoot,'selections/buster-runtime.json'),childBytes=fs.readFileSync(child);fs.rmSync(child);assert.throws(()=>boot.captureBusterParentStartupHandoff(capture()),/ENOENT/);fs.writeFileSync(child,childBytes,{mode:0o444});assert.equal(boot.captureBusterParentStartupHandoff(capture()).childSelection.callerId,'buster-runtime');
});

test('real full kubeclaw chart uses exact transported parent receipt and no old source mounts/ENV',()=>{
 const values=yaml.load(fs.readFileSync('my-values/buster-values.yaml','utf8'));
 values.busterNative={namespace:'kubeclaw',nodeName:'fixture-node',policyDigest:'a'.repeat(64)};
 values.runtimeInfrastructure={registry:{endpoint:'https://registry.example.test',transport:'https',authSecretName:'fixture-registry'}};
 values.extraContainers.find(item=>item.name==='buster-v2-runtime').image='ghcr.io/datrab/kubeclaw-buster-runtime@sha256:'+'a'.repeat(64);
 values.pipelineDelivery={buster:result.metadata};const file=path.join(root,'values.yaml');
 const chart=path.join(root,'chart');fs.cpSync('charts/kubeclaw',chart,{recursive:true,dereference:true});
 // Generate from the actual selected input, never pair new receipts with a stale checked-in projection.
 fs.writeFileSync(path.join(chart,'files/pipeline/buster-topology.json'),JSON.stringify(busterChartProjection(path.join(repository,'config'))));
 const render=(name='agent-buster',namespace='kubeclaw')=>{fs.writeFileSync(file,yaml.dump(values));return yaml.loadAll(execFileSync('helm',['template',name,chart,'--namespace',namespace,'-f',file],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));};
 const documents=render(),pod=documents.find(item=>item?.kind==='Deployment'&&item.metadata.name==='agent-buster').spec.template.spec;
 const container=pod.containers.find(item=>item.name==='buster-v2-runtime');assert(!(container.env??[]).some(item=>item.name==='SWARM_CONFIG'));
 const mount=container.volumeMounts.find(item=>item.mountPath==='/run/pipeline-delivery');assert(mount?.readOnly);assert(!mount.subPath);
 assert(!pod.containers.flatMap(item=>item.volumeMounts??[]).some(item=>item.mountPath==='/etc/kubeclaw/swarm'));
 const configMap=documents.find(item=>item?.kind==='ConfigMap'&&item.metadata.name==='agent-buster-pipeline-delivery');assert.deepEqual(JSON.parse(configMap.data['expected-delivery.json']),result.metadata.expected);

 // The namespace-controller policy is authored once in deployment values and
 // delivered through its real read-only ConfigMap mount, not an image fallback.
 const controllerChecksums=[];
 for(const seconds of [60,120]) {
  values.busterNamespaceBroker.controller.policy={...yaml.load(fs.readFileSync('charts/kubeclaw/values.yaml','utf8')).busterNamespaceBroker.controller.policy,defaultDemoRetentionSeconds:seconds,httpClientTimeoutSeconds:seconds/10,runtimeSecurityRefreshSeconds:seconds/12,namespaceDeletionTimeoutSeconds:seconds*2,runtimeSecurityMaximumFindings:seconds/6,runtimeSecurityMaximumSerializedBytes:seconds*20};
  const selected=render(),controller=selected.find(item=>item?.kind==='Deployment'&&item.metadata.name==='agent-buster-namespace-controller');
  const pod=controller.spec.template.spec,actual=pod.containers.find(item=>item.name==='controller');
  assert(actual.env.some(item=>item.name==='BUSTER_CONTROLLER_POLICY_FILE'&&item.value==='/etc/kubeclaw/controller/controller-policy.json'));
  const mount=actual.volumeMounts.find(item=>item.name==='controller-policy');assert(mount?.readOnly&&!mount.subPath);
  const volume=pod.volumes.find(item=>item.name===mount.name),map=selected.find(item=>item?.kind==='ConfigMap'&&item.metadata.name===volume.configMap.name);
  const delivered=JSON.parse(map.data['controller-policy.json']);assert.deepEqual(delivered,values.busterNamespaceBroker.controller.policy);
  controllerChecksums.push(controller.spec.template.metadata.annotations['checksum/controller-policy']);
  const policyFile=path.join(root,`controller-${seconds}.json`);fs.writeFileSync(policyFile,map.data['controller-policy.json']);
  execFileSync('go',['test','./cmd/buster-namespace-controller','-run','^TestControllerActualDeliveredPolicy$','-count=1'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,CONTROLLER_TEST_DELIVERED_POLICY:policyFile,CONTROLLER_TEST_RETENTION_SECONDS:String(seconds),CONTROLLER_TEST_API_TIMEOUT_SECONDS:String(seconds/10),CONTROLLER_TEST_REFRESH_SECONDS:String(seconds/12),CONTROLLER_TEST_DELETION_TIMEOUT_SECONDS:String(seconds*2),CONTROLLER_TEST_FINDINGS:String(seconds/6),CONTROLLER_TEST_FINDING_BYTES:String(seconds*20)}});
 }
 assert.notEqual(controllerChecksums[0],controllerChecksums[1],'controller owner change triggers rollout');
 assert.throws(()=>render('other-release'),/release identity/);
 delete values.pipelineDelivery.buster;assert.throws(render,/exact selected Buster image delivery receipt required/);values.pipelineDelivery.buster=structuredClone(result.metadata);
 values.pipelineDelivery.buster.expected.generationDigest='sha256:'+'b'.repeat(64);assert.throws(render,/generation mismatch/);
 values.pipelineDelivery.buster=result.metadata;values.busterComponentFile='files/config/buster-engine.config.json';assert.throws(render,/retired/);
});

test('immutable release transports exact Buster image metadata; missing/cross-commit receipt cannot be synthesized',()=>{
 const directory=path.join(root,'receipts');fs.mkdirSync(directory);
 const file=path.join(directory,'buster-runtime.json'),receipt={name:'buster-runtime',image:'ghcr.io/datrab/kubeclaw-buster-runtime@sha256:'+'a'.repeat(64),commit:revision,busterDelivery:result.metadata};fs.writeFileSync(file,JSON.stringify(receipt));
 assert.deepEqual(collectReceipts(directory,revision,['buster-runtime']).imageDeliveries['buster-runtime'],result.metadata);
 delete receipt.busterDelivery;fs.writeFileSync(file,JSON.stringify(receipt));assert.throws(()=>collectReceipts(directory,revision,['buster-runtime']),/DELIVERY_IDENTITY/);
 assert.throws(()=>validateBusterImageDelivery(result.metadata,'b'.repeat(40)),/IDENTITY/);
 for(const source of ['skills/buster/engine/test-gates/preparation-supervisor.ts','skills/common/plugins/runtime-dispatch/src/adapter.ts','scripts/build-buster-image-bundle.mjs','scripts/buster-runtime-config-root.mjs','scripts/buster-lifetime-guardian.c','scripts/check-runtime-role-manifests.mjs','tests/fixtures/test-gate/execution-policy.mts'])assert(isImageInput(source),source);
});

test('external proof harness resolves installed role dependencies without changing installed file identity',()=>{
 const before=fs.readFileSync(path.join(result.packageRoot,'manifest.json'),'utf8');const harness=buildBusterProofHarness({repository,output:path.join(root,'proof'),installedRoot:result.packageRoot});
 assert.equal(fs.realpathSync(path.join(harness,'skills/buster/engine')),path.join(result.packageRoot,'skills/packages/buster-engine'));
 const code="await import('./tests/fixtures/test-gate/execution-policy.mts');await import('./tests/fixtures/test-gate/modeled-preparation.mts');await import('@kubeclaw/nova-core');";
 execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:harness,stdio:'pipe'});
 assert.equal(fs.readFileSync(path.join(result.packageRoot,'manifest.json'),'utf8'),before);capture();
});
