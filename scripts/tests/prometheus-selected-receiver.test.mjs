import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import YAML from 'yaml';
import {receiverContracts,prometheusSelectedReceiverContracts as select} from '../docs-prometheus-selected-receiver-contracts.mjs';
const root=new URL('../../',import.meta.url).pathname;
const get=(kind,p)=>receiverContracts.find(r=>r.kind===kind&&r.fieldPath===p);
const normalize=p=>p.replace(/\[\d+\]/g,'[]').replace(/\["(?:[^"\\]|\\.)*"\]/g,'["*"]');
const archive=root+'scripts/vendor/external-helm-charts/10d54f6984e5f97b2e96e64440c7c0c37af2ed1b17c1521fa6c0da3529bdeec1.tgz';
const kinds=['Prometheus','PrometheusRule','ServiceMonitor'];
test('actual authenticated monitoring render fields resolve recursively, without unused schema expansion',()=>{
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'10d54f6984e5f97b2e96e64440c7c0c37af2ed1b17c1521fa6c0da3529bdeec1');
 const docs=YAML.parseAllDocuments(execFileSync('helm',['template','prometheus',archive,'--namespace','monitoring','--include-crds','--values',root+'gitops/platform/values/prometheus.yaml'],{encoding:'utf8',maxBuffer:20*1024*1024})).map(d=>d.toJS()).filter(Boolean);
 const chart=YAML.parse(execFileSync('tar',['-xOf',archive,'kube-prometheus-stack/Chart.yaml'],{encoding:'utf8'}));assert.equal(chart.version,'91.4.0');assert.equal(chart.appVersion,'v0.94.0');
 for(const kind of kinds){const schema=docs.find(x=>x.kind==='CustomResourceDefinition'&&x.spec.names.kind===kind);assert.equal(schema.spec.scope,'Namespaced');assert.equal(schema.spec.versions.find(x=>x.name==='v1').served,true);assert.ok(schema.spec.versions.find(x=>x.name==='v1').subresources.status);
 const walk=(value,path,shape)=>{
  const rec=select('monitoring.coreos.com/v1',kind,[path])[0];assert.equal(rec.fieldPath,path);

  if(Array.isArray(value))value.forEach((v,i)=>walk(v,`${path}[${i}]`,shape?.items));
  else if(value&&typeof value==='object')for(const [key,v] of Object.entries(value)){
   const map=shape?.additionalProperties&&!shape?.properties?.[key];const part=map||!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)?`[${JSON.stringify(key)}]`:`.${key}`;
   walk(v,path+part,shape?.properties?.[key]??shape?.additionalProperties);
  }
 };
 for(const obj of docs.filter(x=>x.kind===kind)){const shape=schema.spec.versions.find(x=>x.name==='v1').schema.openAPIV3Schema;for(const [key,val] of Object.entries(obj))walk(val,'$.'+key,shape.properties[key]);}
 assert.throws(()=>select('monitoring.coreos.com/v1',kind,['$.spec.newSelectedField']),/FIELD_GAP/);
 }
 assert.equal(get('Prometheus','$.spec.retention').selectedSchemaConstraints.type,'string');
 assert.ok(!get('Prometheus','$.spec.remoteWrite'),'unused upstream schema remains outside selected contracts');
});
test('exact map keys and array indices survive qualification; changed and renamed schemas fail closed',()=>{
 const boundary={fieldPath:'$.spec.endpoints[2].tlsConfig.ca.secret.name',context:{document:7,producer:'external-helm'}};
 const result=select('monitoring.coreos.com/v1','ServiceMonitor',[boundary])[0];assert.equal(result.fieldPath,boundary.fieldPath);assert.deepEqual(result.exactBoundary,boundary);
 assert.equal(select('monitoring.coreos.com/v1','Prometheus',['$.spec.resources.requests["cpu"]'])[0].authoritySelector.fieldPath,'$.spec.resources.requests["cpu"]');
 for(const path of ['$.spec.endpoints[0].renamedAuthorization','$.spec.selector.matchExpressions[0].operator'])assert.throws(()=>select('monitoring.coreos.com/v1','ServiceMonitor',[path]),/FIELD_GAP/);
 assert.throws(()=>select('monitoring.coreos.com/v1','Prometheus',[{fieldPath:'$.spec.retention',contract:{type:'integer'}}]),/SCHEMA_DRIFT/);
 assert.throws(()=>select('monitoring.coreos.com/v1','Prometheus',[{fieldPath:'$.spec.evaluationInterval',contract:{default:'new-default'}}]),/SCHEMA_DRIFT/);
 for(const [version,kind] of [['monitoring.coreos.com/v2','Prometheus'],['monitoring.coreos.com/v1','Unknown']])assert.throws(()=>select(version,kind,[]),/GVK_GAP/);
});
test('selector scopes, timestamp overrides, transport assets and storage lifetime are distinct',()=>{
 const selectors=get('Prometheus','$.spec.serviceMonitorSelector').crossFieldConditions.join(' ');assert.match(selectors,/nil matches none/);assert.match(selectors,/nil selects the Prometheus namespace/);assert.match(selectors,/empty object matches all/);
 assert.match(get('ServiceMonitor','$.spec.namespaceSelector').crossFieldConditions.join(' '),/not a LabelSelector/);
 assert.match(get('ServiceMonitor','$.spec.endpoints[].authorization').crossFieldConditions.join(' '),/Bearer/);
 assert.match(get('ServiceMonitor','$.spec.endpoints[].tlsConfig.ca.secret.optional').changeImpact,/TLS/);
 assert.match(get('ServiceMonitor','$.spec.endpoints[].tlsConfig.ca.secret.optional').crossFieldConditions.join(' '),/missing asset/);
 assert.match(get('Prometheus','$.spec.storage').crossFieldConditions.join(' '),/storageClassName is omitted/);
 assert.match(get('Prometheus','$.spec.storage').crossFieldConditions.join(' '),/\[\] is retained/);
 assert.match(get('PrometheusRule','$.spec.groups[].rules[].expr').changeImpact,/excludes|omits/);
 assert.match(get('Prometheus','$.kind').omitted,/MissingKind/);
 assert.match(get('Prometheus','$.metadata.labels.release').changeImpact,/Metadata-only/);
 assert.match(get('ServiceMonitor','$.spec.endpoints[]').nullValue,/retains its position/);
});
test('records remain uniquely scoped and distinguish mechanical/local checks from live acceptance',()=>{
 const keys=receiverContracts.map(r=>r.kind+':'+r.fieldPath);assert.equal(new Set(keys).size,keys.length);
 for(const r of receiverContracts){assert.ok(r.evidence.length);for(const e of r.evidence)assert.match(e.url,/\/blob\/[a-f0-9]{40}\/.+#L\d+-L\d+$/);assert.match(r.qualificationLimits.join(' '),/No live API admission/);assert.ok(r.selectedContexts.length,r.fieldPath);assert.ok(r.changeImpact);assert.ok(r.cases.length>=4);}
});
