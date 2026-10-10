import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {receiverContracts,webhookSelectedReceiverContracts as contracts} from '../docs-kubernetes-webhook-selected-receiver-contracts.mjs';
import {apiFieldSchemaAuthority} from '../docs-api-schema-authorities.mjs';
const api='admissionregistration.k8s.io/v1';
const kinds=['MutatingWebhookConfiguration','ValidatingWebhookConfiguration'];
const expected=['$.webhooks','$.webhooks[]',...['admissionReviewVersions','admissionReviewVersions[]','clientConfig','clientConfig.service','clientConfig.service.name','clientConfig.service.namespace','clientConfig.service.path','failurePolicy','name','rules','rules[]','rules[].apiGroups','rules[].apiGroups[]','rules[].apiVersions','rules[].apiVersions[]','rules[].operations','rules[].operations[]','rules[].resources','rules[].resources[]','sideEffects','timeoutSeconds'].map(p=>`$.webhooks[].${p}`)];
const find=(kind,p)=>receiverContracts.find(r=>r.kind===kind&&r.fieldPath===p);
test('selected body union owns exact kind/version/path identity and complete branch records',()=>{
 for(const kind of kinds){assert.deepEqual(contracts(api,kind).map(r=>r.fieldPath),['$',...expected]);for(const r of contracts(api,kind)){
 assert.deepEqual(r.authoritySelector,{apiVersion:api,kind,fieldPath:r.fieldPath});
 for(const key of ['purpose','receiver','operationScope','omitted','nullValue','emptyValue','invalidValue','changeImpact'])assert.ok(r[key]?.length>20,key);
 assert.ok(r.evidence.length>=12);assert.ok(r.qualificationLimits.some(s=>s.includes('no live')));
 }}
});
test('added/renamed fields, version changes, mismatched authority and duplicates fail closed',()=>{
 for(const kind of kinds){
 const exact=['$.webhooks[1].rules[2].operations[3]','$.webhooks[0].clientConfig.service.path'];
 assert.deepEqual(contracts(api,kind,exact).map(r=>r.authoritySelector.fieldPath),exact);
 for(const p of ['$.webhooks[].clientConfig.caBundle','$.webhooks[].namespaceSelector','$.webhooks[].renamedTimeout','$.metadata','$.kind'])assert.throws(()=>contracts(api,kind,[p]),/PATH_UNAUTHORED/);
 assert.throws(()=>contracts('admissionregistration.k8s.io/v2',kind),/IDENTITY_UNQUALIFIED/);
 assert.throws(()=>contracts(api,kind,[{apiVersion:'v1',fieldPath:expected[0]}]),/AUTHORITY_MISMATCH/);
 assert.throws(()=>contracts(api,kind,[expected[0],expected[0]]),/DUPLICATE/);
 }
 assert.throws(()=>contracts(api,'Other'),/IDENTITY_UNQUALIFIED/);
});
test('removal retains sibling meaning and scalar null does not remove an item',()=>{
 for(const kind of kinds){
 assert.match(find(kind,'$.webhooks[].rules[]').omitted,/other alternatives/);
 assert.match(find(kind,'$.webhooks[].rules[].apiGroups[]').emptyValue,/core API group/);
 assert.match(find(kind,'$.webhooks[].rules[].apiVersions[]').nullValue,/empty string/);
 assert.match(find(kind,'$.webhooks[].rules').emptyValue,/no matching rule/);
 assert.match(find(kind,'$.webhooks[].rules[].operations').invalidValue,/CREATE, UPDATE, DELETE, CONNECT/);
 }
});
test('security and timeout defaults preserve the failed-call versus explicit-denial boundary',()=>{
 for(const kind of kinds){
 assert.match(find(kind,'$.webhooks[].failurePolicy').omitted,/Default Fail/);
 assert.match(find(kind,'$.webhooks[].failurePolicy').invalidValue,/does not override an explicit backend denial/);
 assert.match(find(kind,'$.webhooks[].timeoutSeconds').emptyValue,/0 is invalid/);
 assert.match(find(kind,'$.webhooks[].timeoutSeconds').invalidValue,/1 through 30/);
 assert.match(find(kind,'$.webhooks[].sideEffects').omitted,/required pointer/);
 assert.match(find(kind,'$.webhooks[].admissionReviewVersions').invalidValue,/first recognized/);
 for(const condition of ['namespaceSelector','objectSelector','caBundle','443','Never','Equivalent','Historical reason','legacy compatibility'])assert.ok(find(kind,'$.webhooks').crossFieldConditions.some(s=>s.includes(condition)),condition);
 }
});
test('primary callouts retain original immutable authority and finite bounds',()=>{
 for(const r of receiverContracts)for(const e of r.evidence){assert.match(e.url,/^https:\/\/github.com\/kubernetes\/kubernetes\/blob\/66452049f3d692768c39c797b21b793dce80314e\//);const m=e.url.match(/#L(\d+)-L(\d+)$/);assert.ok(m);assert.ok(+m[1]>0&&+m[2]>=+m[1]);}
});
test('independent authentic discovered context union agrees with body contract scope', {skip:!process.env.WEBHOOK_SELECTED_EVIDENCE},()=>{
 const gaps=JSON.parse(readFileSync(`${process.env.WEBHOOK_SELECTED_EVIDENCE}/current-authentic-selected-receiver-gaps.json`));
 const contexts=JSON.parse(readFileSync(`${process.env.WEBHOOK_SELECTED_EVIDENCE}/current-authentic-output-contexts.json`)).contexts;
 for(const kind of kinds){const resource=gaps.resources.find(r=>r.kind===kind);assert.equal(resource.apiVersion,api);
 const body=resource.selection.fieldPaths.filter(p=>p.startsWith('$.webhooks'));assert.deepEqual(new Set(body),new Set(expected));
 assert.equal(contracts(api,kind,body).length,body.length);
 for(const context of resource.contexts){assert.ok(contexts.some(c=>c.kind===kind&&c.apiVersion===api&&c.outputDigest===context.outputDigest));assert.equal(context.producer,'external-helm');assert.match(context.archiveSha256,/^[a-f0-9]{64}$/);}
 for(const p of body){const exact=resource.selection.applicability[p].map(a=>a.fieldPath);for(const path of new Set(exact))assert.equal(contracts(api,kind,[path])[0].authoritySelector.fieldPath,path);}
 }
});

test('selected upstream schema types and required constraints cannot silently drift',()=>{
 for(const kind of kinds)for(const path of ['$',...expected]){const a=apiFieldSchemaAuthority(api,kind,path);
 const type=path==='$'?'object':path.endsWith('[]')?(path.endsWith('webhooks[]')||path.endsWith('rules[]')?'object':'string'):/\.(?:webhooks|rules|admissionReviewVersions|apiGroups|apiVersions|operations|resources)$/.test(path)?'array':/\.(?:clientConfig|service)$/.test(path)?'object':path.endsWith('timeoutSeconds')?'integer':'string';
 assert.equal(a.type,type,`${kind} ${path}`);assert.equal(a.authoritySha256,'483500149ee52ce5753d75f5639101d985bb4f5e902cc05b1ba7627465d62446');
 if(path.endsWith('.sideEffects')||path.endsWith('.admissionReviewVersions')||path.endsWith('.clientConfig')||path.endsWith('.name'))assert.equal(a.requiredBySchema,true,path);
 if(path.endsWith('.timeoutSeconds'))assert.equal(a.format,'int32');
 }
});
