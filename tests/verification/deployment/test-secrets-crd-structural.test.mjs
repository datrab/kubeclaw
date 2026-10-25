import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import yaml from 'js-yaml';
function conflicts(schema,path='$') {
 if (!schema || typeof schema!=='object') return [];
 const result=[];
 if(schema.properties && Object.hasOwn(schema,'additionalProperties')) result.push(path);
 if(schema.properties) for(const [name,child]of Object.entries(schema.properties))result.push(...conflicts(child,path+'.'+name));
 if(schema.additionalProperties && typeof schema.additionalProperties==='object')result.push(...conflicts(schema.additionalProperties,path+'.*'));
 if(schema.items)result.push(...conflicts(schema.items,path+'[]'));
 return result;
}
test('rendered Lease CRD uses Kubernetes fixed-object and dynamic-map schemas without mixing them',()=>{
 const rendered=execFileSync('helm',['template','buster','charts/kubeclaw','-f','releases/values/buster.yaml',
 '--set','runtimeInfrastructure.registry.endpoint=https://registry.example.test','--set','runtimeInfrastructure.registry.transport=https','--set','runtimeInfrastructure.registry.authSecretName=registry-test'],{encoding:'utf8',maxBuffer:8*1024*1024});
 const crd=yaml.loadAll(rendered).find(doc=>doc?.kind==='CustomResourceDefinition'&&doc.metadata.name==='busternamespaceleases.kubeclaw.forgestack.ai');
 assert.ok(crd);
 const schema=crd.spec.versions.find(v=>v.name==='v1alpha1').schema.openAPIV3Schema;
 assert.deepEqual(conflicts(schema),[]);
 const spec=schema.properties.spec.properties.testSecrets;
 assert.deepEqual(Object.keys(spec.properties).sort(),['secrets','values']);
 assert.equal(spec.properties.values.additionalProperties.properties.kind.type,'string');
 assert.equal(spec.properties.secrets.additionalProperties.additionalProperties.type,'string');
 // Recreate the rejected published shape; generic JSON-Schema validity would
 // not catch this Kubernetes-specific structural restriction.
 const broken=structuredClone(spec);broken.additionalProperties=false;
 broken.properties.values.additionalProperties.additionalProperties=false;
 assert.deepEqual(conflicts(broken),['$','$.values.*']);
});
