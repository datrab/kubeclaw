import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {receiverContracts} from '../docs-kubernetes-node-workloads-receiver-contracts.mjs';
const daemon = receiverContracts.filter(r=>r.kind==='DaemonSet');
test('all daemon records and cases use daemon lineage and qualified operations',()=>{
 assert.ok(daemon.length>200);
 for(const r of daemon){
  const text=JSON.stringify(r);
  assert.doesNotMatch(text,/ReplicaSet|subject to pause|registry-local|LiteLLM|spec\.strategy declares retainKeys/,r.fieldPath);
  for(const e of r.evidence) assert.doesNotMatch(e.url,/apps\/validation\/validation.go#L(?:638-L675|833-L855|847-L852)$/,r.fieldPath);
  for(const c of r.cases.filter(c=>c.name.startsWith('authored-'))){
   assert.match(c.condition,/If (the external DaemonSet|Argo manages)/,r.fieldPath);
   assert.match(c.sourceOutcome,/RollingUpdate or OnDelete/,r.fieldPath);
  }
 }
});
test('CSI item omission differs from zero-length list defaulting',()=>{
 const item=receiverContracts.find(r=>r.kind==='CSIDriver'&&r.fieldPath==='$.spec.volumeLifecycleModes[]');
 const list=receiverContracts.find(r=>r.kind==='CSIDriver'&&r.fieldPath==='$.spec.volumeLifecycleModes');
 assert.match(item.omitted,/leaves \[Ephemeral\], so no default is added/);
 assert.equal(item.cases.find(c=>c.name==='omitted-at-create').sourceOutcome,item.omitted);
 assert.match(item.emptyValue,/retained and rejected/);
 assert.match(list.omitted,/zero-length list defaults/);
 assert.match(list.nullValue,/Null list defaults/);
});
const evidenceRoot=process.env.KUBECLAW_DOCS_KUBERNETES_SOURCE_DIR;
test('authenticated pinned originals show direct Pod create and list-length default predicate',{skip:!evidenceRoot&&'Set KUBECLAW_DOCS_KUBERNETES_SOURCE_DIR to the authenticated primary-source ledger directory'},()=>{
 const ledger=JSON.parse(fs.readFileSync(path.join(evidenceRoot,'source-provenance.json'),'utf8'));
 const read=p=>{const e=ledger.find(e=>e.repo==='kubernetes/kubernetes'&&e.path===p);assert.equal(e.revision,'66452049f3d692768c39c797b21b793dce80314e');const bytes=fs.readFileSync(path.join(evidenceRoot,'primary',e.local));assert.equal(bytes.length,e.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),e.sha256);return bytes.toString('utf8');};
 const validation=read('pkg/apis/apps/validation/validation.go').split('\n').slice(439,470).join('\n');
 assert.match(validation,/func ValidateDaemonSetSpec/);assert.match(validation,/ValidatePodTemplateSpec/);assert.match(validation,/RestartPolicyAlways/);assert.match(validation,/ActiveDeadlineSeconds/);assert.match(validation,/ValidateDaemonSetUpdateStrategy/);
 const controller=read('pkg/controller/daemon/daemon_controller.go');
 const create=controller.split('\n').slice(1006,1044).join('\n');
 assert.match(create,/template\.DeepCopy\(\)/);
 assert.match(create,/ReplaceDaemonSetPodNodeNameNodeAffinity/);
 assert.match(create,/podControl\.CreatePods/);
 assert.doesNotMatch(create,/ReplicaSet/);
 const strategy=controller.split('\n').slice(918,932).join('\n');
 assert.match(strategy,/OnDeleteDaemonSetStrategyType/);assert.match(strategy,/RollingUpdateDaemonSetStrategyType/);
 const patcher=read('staging/src/k8s.io/kubectl/pkg/cmd/apply/patcher.go').split('\n').slice(116,206).join('\n');
 assert.match(patcher,/GetOriginalConfiguration/);assert.match(patcher,/scheme\.Scheme\.New/);assert.match(patcher,/buildStrategicMergeFromBuiltins/);
 const listMerge=read('staging/src/k8s.io/apimachinery/pkg/util/strategicpatch/patch.go').split('\n').slice(1474,1490).join('\n');
 assert.match(listMerge,/fieldPatchStrategy == mergeDirective/);assert.match(listMerge,/return typedPatch, nil/);
 const defaults=read('pkg/apis/storage/v1/defaults.go').split('\n').slice(59,62).join('\n');
 assert.match(defaults,/len\(obj\.Spec\.VolumeLifecycleModes\) == 0/);
 assert.match(defaults,/append\(obj\.Spec\.VolumeLifecycleModes, storagev1\.VolumeLifecyclePersistent\)/);
});
