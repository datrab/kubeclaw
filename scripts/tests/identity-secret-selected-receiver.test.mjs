import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import YAML from 'yaml';
import {identitySecretReceiverContracts as body} from '../docs-kubernetes-identity-secret-receiver-contracts.mjs';
import {receiverContracts as metadata} from '../docs-kubernetes-metadata-receiver-contracts.mjs';
import {receiverContracts as envelope} from '../docs-kubernetes-envelope-receiver-contracts.mjs';

const root=new URL('../../',import.meta.url).pathname;
const archive=root+'scripts/vendor/external-helm-charts/10d54f6984e5f97b2e96e64440c7c0c37af2ed1b17c1521fa6c0da3529bdeec1.tgz';
const normalize=p=>p.replace(/\["(?:[^"\\]|\\.)*"\]/g,'[<exact-key>]').replace(/\[\d+\]/g,'[]');
function resolve(kind,path){
 if(path.startsWith('$.metadata'))return metadata.find(r=>r.kind===kind&&r.fieldPath===normalize(path));
 if(['$.apiVersion','$.kind'].includes(path))return envelope.find(r=>r.kind===kind&&r.fieldPath===path);
 return body('v1',kind,[path])[0];
}
test('actual authenticated monitoring accounts and Secrets join body and stored root providers',()=>{
 assert.equal(createHash('sha256').update(readFileSync(archive)).digest('hex'),'10d54f6984e5f97b2e96e64440c7c0c37af2ed1b17c1521fa6c0da3529bdeec1');
 const output=execFileSync('helm',['template','prometheus',archive,'--namespace','monitoring','--values',root+'gitops/platform/values/prometheus.yaml'],{encoding:'utf8',maxBuffer:20*1024*1024});
 const docs=YAML.parseAllDocuments(output);for(const doc of docs)assert.deepEqual(doc.errors,[]);
 const objects=docs.map(d=>d.toJS()).filter(o=>o&&['ServiceAccount','Secret'].includes(o.kind));
 assert.ok(objects.some(o=>o.kind==='ServiceAccount'));assert.ok(objects.some(o=>o.kind==='Secret'));
 for(const obj of objects){
  const walk=(v,p)=>{
   assert.ok(resolve(obj.kind,p),obj.kind+':'+p);
   if(Array.isArray(v))v.forEach((item,i)=>walk(item,p+`[${i}]`));
   else if(v&&typeof v==='object')for(const [key,value]of Object.entries(v)){
    const map=['$.data','$.stringData','$.metadata.labels','$.metadata.annotations'].includes(p);
    walk(value,p+(map?`[${JSON.stringify(key)}]`:'.'+key));
   }
  };
  for(const [key,v]of Object.entries(obj))walk(v,'$.'+key);
 }
});
test('new selected body fields stop and exact credential key identities survive',()=>{
 for(const kind of ['Secret','ServiceAccount'])assert.throws(()=>body('v1',kind,['$.newField']),/RECEIVER_GAP/);
 assert.throws(()=>body('v2','Secret',['$.type']),/RECEIVER_GVK/);
 assert.throws(()=>body('v1','Unknown',[]),/RECEIVER_GVK/);
 const fieldPath='$.data[".dockerconfigjson"]';const r=body('v1','Secret',[{fieldPath}])[0];
 assert.equal(r.fieldPath,fieldPath);assert.equal(r.authoritySelector.fieldPath,fieldPath);
 assert.equal(resolve('Pod','$.metadata.resourceVersion').authoritySelector.kind,'Pod');
});
