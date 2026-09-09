import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import YAML from 'yaml';

const helm=process.env.KUBECLAW_TEST_HELM ?? 'helm';
function render(values:Record<string,string|boolean>) {
  const args=['template','ready-contract','charts/kubeclaw','--namespace','kubeclaw'];
  for(const [key,value] of Object.entries(values))args.push('--set',`${key}=${String(value)}`);
  return YAML.parseAllDocuments(execFileSync(helm,args,{encoding:'utf8',maxBuffer:8*1024*1024})).map(doc=>doc.toJSON()).filter(Boolean);
}
const server={agentRole:'buster','extraContainers[0].name':'buster-v2-runtime','extraContainers[0].image':'ghcr.io/datrab/kubeclaw-buster-runtime:latest',
  'runtimeInfrastructure.registry.endpoint':'http://registry.render-test:5000','runtimeInfrastructure.registry.transport':'http-lab',
  'busterNamespaceBroker.enabled':true,'busterNamespaceBroker.controller.readiness.enabled':true,
  'busterNamespaceBroker.controller.readiness.audience':'kubeclaw-demo-ready','busterNamespaceBroker.controller.readiness.producerNamespace':'kubeclaw',
  'busterNamespaceBroker.controller.readiness.producerServiceAccount':'agent-nova','busterNamespaceBroker.controller.readiness.tlsSecretName':'render-test-certificate'};

test('original Helm renders internal Ready TLS server and exact TokenReview authority',()=>{
  const docs=render(server);
  const service=docs.find(d=>d.kind==='Service'&&d.metadata.name.endsWith('-demo-ready'));
  assert.equal(service.spec.type,'ClusterIP');assert.equal(service.spec.ports[0].port,8443);
  assert.equal(docs.some(d=>d.kind==='Ingress'&&JSON.stringify(d).includes('demo-ready')),false);
  const deployment=docs.find(d=>d.kind==='Deployment'&&d.metadata.name.endsWith('-namespace-controller'));
  const container=deployment.spec.template.spec.containers[0];
  const env=Object.fromEntries(container.env.map((e:any)=>[e.name,e.value]));
  assert.equal(env.BUSTER_READY_PRODUCER,'system:serviceaccount:kubeclaw:agent-nova');
  assert.equal(env.BUSTER_READY_AUDIENCE,'kubeclaw-demo-ready');assert.equal(env.BUSTER_READY_LISTEN,':8443');
  const rules=docs.filter(d=>d.kind==='ClusterRole').flatMap(d=>d.rules).filter((r:any)=>r.resources?.includes('tokenreviews'));
  assert.equal(rules.length,1);assert.deepEqual(rules[0].verbs,['create']);
  const crd=docs.find(d=>d.kind==='CustomResourceDefinition'&&d.metadata.name.startsWith('busternamespaceleases.'));
  const status=crd.spec.versions[0].schema.openAPIV3Schema.properties.status.properties;
  assert.deepEqual(status.demoReadiness.properties.state.enum,['ready-for-acceptance']);
  assert.equal(status.demoReadiness.properties.retentionSeconds.minimum,1);
  assert.equal(status.demoReadiness.properties.retentionSeconds.maximum,9223372036);
  assert.equal(status.demoReadiness.required.includes('retentionSeconds'),false);
  assert.deepEqual(status.demoReadiness.properties.schemaVersion.enum,['demo-readiness.v1','demo-readiness.v2']);
  assert.equal(status.demoReadiness['x-kubernetes-validations'].some((rule:any)=>rule.rule.includes("self.schemaVersion == 'demo-readiness.v2' && has(self.retentionSeconds)")),true);
  assert.equal(status.demoReadiness['x-kubernetes-validations'].some((rule:any)=>rule.rule==='self.schemaVersion == oldSelf.schemaVersion'),true);
  assert.equal(JSON.stringify(status.demoReadiness).includes('password'),false);
  assert.deepEqual(crd.spec.versions[0].subresources,{status:{}});
  const policy=docs.find(d=>d.kind==='NetworkPolicy'&&d.metadata.name.endsWith('-demo-ready'));
  assert.equal(policy.spec.ingress[0].from[0].namespaceSelector.matchLabels['kubernetes.io/metadata.name'],'kubeclaw');
  assert.throws(()=>render({...server,'busterNamespaceBroker.controller.readiness.producerServiceAccount':''}),/producer ServiceAccount/);
});

test('original chart mounts opt-in audience token only into actual Nova runtime container',()=>{
  const base={agentRole:'nova','serviceAccount.create':true};
  const disabled=render(base);assert.equal(JSON.stringify(disabled).includes('demo-ready-client'),false);
  const docs=render({...base,'busterNamespaceBroker.readyClient.enabled':true,'busterNamespaceBroker.readyClient.endpoint':'https://ready-server.kubeclaw.svc:8443',
    'busterNamespaceBroker.readyClient.audience':'kubeclaw-demo-ready','busterNamespaceBroker.readyClient.caSecretName':'render-test-ca'});
  const pod=docs.find(d=>d.kind==='Deployment'&&d.spec.template.spec.containers.some((c:any)=>c.name==='kubeclaw')).spec.template.spec;
  const mounted=[...(pod.initContainers??[]),...pod.containers].filter((c:any)=>c.volumeMounts?.some((m:any)=>m.name==='demo-ready-client'));
  assert.deepEqual(mounted.map((c:any)=>c.name),['kubeclaw']);
  const source=pod.volumes.find((v:any)=>v.name==='demo-ready-client').projected.sources[0].serviceAccountToken;
  assert.deepEqual(source,{audience:'kubeclaw-demo-ready',expirationSeconds:600,path:'token'});
  assert.equal(pod.containers.find((c:any)=>c.name==='kubeclaw').env.find((e:any)=>e.name==='KUBECLAW_DEMO_READY_TOKEN_PATH').value,'/var/run/kubeclaw/demo-ready/token');
  assert.equal(docs.filter(d=>['Role','ClusterRole'].includes(d.kind)).some(d=>d.rules.some((r:any)=>r.resources?.includes('tokenreviews'))),false);
});
