import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import yaml from 'js-yaml';
import {loadNativeNodePolicy,nativePoolPolicy} from '../../../scripts/native-worker-node-policy.mjs';
import {busterResourceArgument} from '../../../scripts/buster-resource-overlay.mjs';

test('AX41 Buster uses a bounded browser child without replacing runtime image or credentials',()=>{
 const base=yaml.load(fs.readFileSync('releases/values/buster.yaml','utf8'));
 const overlay=yaml.load(fs.readFileSync('gitops/production/overlays/buster-ax41.yaml','utf8'));
 const docs=yaml.loadAll(execFileSync('helm',['template','agent-buster','charts/kubeclaw','-n','kubeclaw','-f','releases/values/buster.yaml','-f','gitops/production/overlays/buster-ax41.yaml','--set-json',busterResourceArgument(base,overlay)],{encoding:'utf8',maxBuffer:32*1024*1024})).filter(Boolean);
 const pod=docs.find(d=>d.kind==='Deployment'&&d.metadata.name==='agent-buster').spec.template;
 const pool=nativePoolPolicy(loadNativeNodePolicy('my-values/infra/native-worker-pools-ax41.yaml'),'buster');
 assert.equal(pod.metadata.annotations['kubeclaw.dev/native-worker-policy'],pool.policyDigest);
 assert.equal(pod.metadata.annotations['kubeclaw.dev/native-worker-role'],'buster');
 assert.equal(pod.spec.nodeSelector['kubernetes.io/hostname'],pool.nodeName);
 assert.deepEqual(pod.spec.volumes.find(v=>v.name==='buster-browser-cgroup').hostPath,{path:pool.cgroupRoot+'/browser',type:'Directory'});
 const original=base.extraContainers.find(c=>c.name==='buster-v2-runtime');
 const runtime=pod.spec.containers.find(c=>c.name===original.name);
 assert.equal(runtime.image,original.image);
 assert.deepEqual(runtime.resources,overlay.busterRuntimeResources);
 assert.deepEqual(runtime.env.find(e=>e.name==='BUSTER_V2_TOKEN'),original.env.find(e=>e.name==='BUSTER_V2_TOKEN'));
 const registry=JSON.parse(runtime.env.find(e=>e.name==='KUBECLAW_REGISTRY_CONFIG').value);
 assert.equal(registry.registry.transport,'http-lab');
 assert.equal(registry.registry.endpoint,'http://registry-local.kubeclaw.svc.cluster.local:5001');
 for(const v of base.extraVolumes.filter(v=>v.name!=='buster-browser-cgroup'))assert.deepEqual(pod.spec.volumes.find(p=>p.name===v.name),v);
 assert.equal(pod.spec.containers.find(c=>c.name==='kubeclaw').resources.requests.memory,'1Gi');
});
test('resource overrides require a unique runtime and cannot inject container settings',()=>{
 const resources={requests:{cpu:'500m',memory:'2Gi'},limits:{cpu:'1500m',memory:'8Gi'}};
 assert.throws(()=>busterResourceArgument({extraContainers:[]},{busterRuntimeResources:resources}),/CONTAINER_REQUIRED/);
 assert.throws(()=>busterResourceArgument({extraContainers:[{name:'buster-v2-runtime'}]},{busterRuntimeResources:{...resources,image:'bad'}}),/OVERLAY_INVALID/);
});
