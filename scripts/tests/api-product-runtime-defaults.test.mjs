import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { apiProductSelection, versionedApiReceiverRegistries } from '../docs-api-product-scope.mjs';

function select(value) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-actual-defaults-'));
  try {
    const bytes = YAML.stringify(value);
    fs.writeFileSync(path.join(root, 'producer.yaml'), bytes);
    return apiProductSelection(value.apiVersion, value.kind, [{path:'producer.yaml', document:0,
      sourceDigest:createHash('sha256').update(bytes).digest('hex')}], versionedApiReceiverRegistries.get(value.apiVersion), root);
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
}
const omissions = (selected, field) => (selected.applicability[field] ?? []).filter(row => row.reason === 'receiver-default-under-present-parent');

test('omission evidence follows each actual container and preserves explicit sibling policy', () => {
  const selected = select({apiVersion:'apps/v1',kind:'Deployment',metadata:{name:'fixture'},spec:{
    selector:{matchLabels:{app:'fixture'}},template:{metadata:{labels:{app:'fixture'}},spec:{containers:[
      {name:'explicit',image:'example.invalid/app:v1',imagePullPolicy:'Always'},
      {name:'implicit',image:'example.invalid/app:latest'},
    ]}}}});
  const pull = omissions(selected, '$.spec.template.spec.containers[].imagePullPolicy');
  assert.ok(selected.fieldPaths.includes('$'), 'the submitted resource envelope must have reader coverage');
  assert.deepEqual(selected.applicability['$'].map(row=>({fieldPath:row.fieldPath,reason:row.reason})),
    [{fieldPath:'$',reason:'authored-resource-root'}]);
  assert.deepEqual(pull.map(row => row.fieldPath), ['$.spec.template.spec.containers[1].imagePullPolicy']);
  assert.match(pull[0].omission, /parsed image tag is latest/);
  for (const field of ['terminationMessagePath','terminationMessagePolicy']) {
    assert.deepEqual(omissions(selected, `$.spec.template.spec.containers[].${field}`).map(row=>row.fieldPath),
      [0,1].map(index=>`$.spec.template.spec.containers[${index}].${field}`));
  }
});

test('Service port defaults bind each omitted port member and actual Service type', () => {
  const selected = select({apiVersion:'v1',kind:'Service',metadata:{name:'fixture'},spec:{ports:[
    {name:'implicit',port:80}, {name:'explicit',port:81,targetPort:8081,protocol:'UDP'},
  ]}});
  for(const member of ['protocol','targetPort']) {
    assert.deepEqual(omissions(selected, `$.spec.ports[].${member}`).map(row=>row.fieldPath), [`$.spec.ports[0].${member}`]);
  }
  for(const field of ['type','sessionAffinity','internalTrafficPolicy']) assert.equal(omissions(selected, `$.spec.${field}`).length,1);
  assert.equal(omissions(selected, '$.spec.externalTrafficPolicy').length,0);
  assert.equal(omissions(selected, '$.spec.allocateLoadBalancerNodePorts').length,0);
});

test('conditional Service defaults do not select unused LoadBalancer or ExternalName alternatives', () => {
  const service = type => select({apiVersion:'v1',kind:'Service',metadata:{name:'fixture'},spec:{type,ports:[{port:80}],...(type==='ExternalName'?{externalName:'example.invalid'}:{})}});
  const external = service('ExternalName');
  for(const field of ['internalTrafficPolicy','externalTrafficPolicy','allocateLoadBalancerNodePorts']) assert.equal(omissions(external, `$.spec.${field}`).length,0);
  const loadBalancer = service('LoadBalancer');
  for(const field of ['internalTrafficPolicy','externalTrafficPolicy','allocateLoadBalancerNodePorts']) assert.equal(omissions(loadBalancer, `$.spec.${field}`).length,1);
});

test('explicit zero values receive evidence without overriding explicit false or nonempty values', () => {
  const selected = select({apiVersion:'v1',kind:'Service',metadata:{name:'fixture'},spec:{type:'LoadBalancer',
    sessionAffinity:'',internalTrafficPolicy:'',allocateLoadBalancerNodePorts:false,ports:[{port:80,targetPort:0,protocol:''}]}});
  const zero = field => (selected.applicability[field]??[]).filter(row=>row.reason==='receiver-default-for-explicit-zero-value');
  for(const field of ['$.spec.sessionAffinity','$.spec.ports[].protocol','$.spec.ports[].targetPort']) assert.equal(zero(field).length,1);
  assert.equal(zero('$.spec.internalTrafficPolicy').length,0);
  assert.equal(zero('$.spec.allocateLoadBalancerNodePorts').length,0);
});

test('container-port defaults use the actual receiving kind and container member', () => {
  const selected = select({apiVersion:'v1',kind:'Pod',metadata:{name:'fixture'},spec:{containers:[
    {name:'app',image:'example.invalid/app:v1',ports:[{containerPort:8080},{containerPort:8081,protocol:'UDP'}]},
  ],initContainers:[{name:'init',image:'example.invalid/init:v1',ports:[{containerPort:9000}]}]}});
  for(const [member,range] of [['containers','375-L379'],['initContainers','301-L305']]) {
    const rows=omissions(selected, `$.spec.${member}[].ports[].protocol`);
    assert.deepEqual(rows.map(row=>row.fieldPath), [`$.spec.${member}[0].ports[0].protocol`]);
    assert.ok(rows[0].evidence.some(row=>row.url.endsWith(`zz_generated.defaults.go#L${range}`)));
  }
});
