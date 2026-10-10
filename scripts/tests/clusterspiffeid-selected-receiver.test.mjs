import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { receiverContracts, clusterSPIFFEIDSelectedReceiverContracts as contracts } from '../docs-clusterspiffeid-selected-receiver-contracts.mjs';
const api='spire.spiffe.io/v1alpha1',kind='ClusterSPIFFEID';
const selected=[ '$.apiVersion','$.kind','$.metadata','$.spec','$.spec.className','$.spec.fallback','$.spec.hint','$.spec.namespaceSelector','$.spec.namespaceSelector.matchExpressions','$.spec.namespaceSelector.matchExpressions[]','$.spec.namespaceSelector.matchExpressions[].key','$.spec.namespaceSelector.matchExpressions[].operator','$.spec.namespaceSelector.matchExpressions[].values','$.spec.namespaceSelector.matchExpressions[].values[]','$.spec.podSelector','$.spec.podSelector.matchLabels','$.spec.podSelector.matchLabels["*"]','$.spec.spiffeIDTemplate'];
const find=p=>receiverContracts.find(x=>x.fieldPath===p);
test('actual selected 18-field union has explicit complete receiver records',()=>{
 assert.deepEqual(receiverContracts.map(x=>x.fieldPath),selected);
 for(const r of receiverContracts){assert.deepEqual(r.authoritySelector,{apiVersion:api,kind,fieldPath:r.fieldPath});for(const key of ['purpose','receiver','operationScope','omitted','nullValue','emptyValue','invalidValue','changeImpact'])assert.ok(r[key]?.length>20,key);assert.ok(r.evidence.length>=7);assert.ok(r.cases.length);assert.ok(r.qualificationLimits.some(x=>x.includes('no live')));}
});
test('exact selected indices and label keys survive; an additional selected field fails closed',()=>{
 const input=[{apiVersion:api,kind,fieldPath:'$.spec.namespaceSelector.matchExpressions[0].values[1]'},{fieldPath:'$.spec.podSelector.matchLabels["kubeclaw.dev/worker-trust"]'}];
 assert.deepEqual(contracts(api,kind,input).map(x=>x.authoritySelector.fieldPath),input.map(x=>x.fieldPath));
 for(const path of ['$.spec.admin','$.spec.namespaceSelector.matchLabels["x"]','$.spec.podSelector.matchLabels.bad','$.spec.namespaceSelector.matchExpressions[].new'])assert.throws(()=>contracts(api,kind,[{fieldPath:path}]),/UNAUTHORED/);
 assert.throws(()=>contracts('spire.spiffe.io/v2',kind),/IDENTITY/);assert.throws(()=>contracts(api,'Other'),/IDENTITY/);assert.throws(()=>contracts(api,kind,[{apiVersion:'v1',fieldPath:'$.spec'}]),/MISMATCH/);assert.throws(()=>contracts(api,kind,[{fieldPath:'$.spec'},{fieldPath:'$.spec'}]),/DUPLICATE/);
});
test('authentication-pinned CRD archive retains selected schema and status boundary',()=>{
 const archive=new URL('../vendor/external-helm-charts/e561d54dd2247552937f90c11e62a828ffcd85456a1b43162691500223bcac07.tgz',import.meta.url);
 assert.equal(createHash('sha256').update(readFileSync(archive)).digest('hex'),'e561d54dd2247552937f90c11e62a828ffcd85456a1b43162691500223bcac07');
 const schema=execFileSync('tar',['-xOf',archive.pathname,'spire-crds/templates/spire.spiffe.io_clusterspiffeids.yaml'],{encoding:'utf8'});
 for(const token of ['scope: Cluster','name: v1alpha1','served: true','storage: true','subresources:\n      status: {}','- spiffeIDTemplate','matchExpressions:','matchLabels:','fallback:','hint:','className:'])assert.ok(schema.includes(token),token);
});
test('receiver separates template syntax, rendering, registration, status and consumer authentication',()=>{
 const r=find('$.spec.spiffeIDTemplate');assert.match(r.changeImpact,/different trust domain/);assert.match(r.emptyValue,/fails Parse/);assert.ok(r.evidence.some(x=>x.claim.includes('PodMeta')&&x.claim.includes('NodeSpec')));
 assert.match(find('$.spec.fallback').changeImpact,/render failure/);assert.match(find('$.spec.className').omitted,/watchClassless/);
 assert.match(find('$.spec.namespaceSelector.matchExpressions[].values').emptyValue,/invalid for In\/NotIn/);
 assert.match(find('$.metadata').changeImpact,/resourceVersion/);assert.match(find('$.kind').omitted,/Unstructured decoding/);
 for(const r of receiverContracts)assert.ok(r.crossFieldConditions.some(x=>x.includes('SVID issuance')&&x.includes('separate')));
});
test('all remote source callouts use immutable commit and finite source bounds',()=>{
 for(const r of receiverContracts)for(const e of r.evidence){assert.match(e.url,/\/blob\/[a-f0-9]{40}\//);const m=e.url.match(/#L(\d+)-L(\d+)$/);assert.ok(m);assert.ok(+m[1]>0&&+m[2]>=+m[1]);assert.ok(e.claim.length>15);}
});
