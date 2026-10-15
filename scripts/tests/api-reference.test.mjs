import assert from 'node:assert/strict';
import test from 'node:test';
import { apiResourceFieldBoundaries } from '../docs-api-schema-authorities.mjs';
import { renderApiResourceReference, renderImplicitMetadataReferences, renderImplicitMetadataReference, validateImplicitMetadataReferences } from '../docs-api-reference.mjs';

import { implicitKubernetesObjectMetaReferences } from '../docs-kubernetes-metadata-receiver-contracts.mjs';

// Renderer fixtures are synthetic content, never runtime or acceptance proof.
function fixture() {
  const rows = apiResourceFieldBoundaries('v1', 'ConfigMap').map(row => ({ ...row,
    receiverContract: {
      kind: 'ConfigMap', fieldPath: row.fieldPath,
      purpose: 'Literal <script>alert(1)</script> [link](bad) and `code` | value',
      receiver: 'Synthetic renderer fixture', operationScope: 'Fixture only',
      omitted: 'Omitted fixture', nullValue: 'Null fixture', emptyValue: 'Empty fixture',
      invalidValue: 'Invalid fixture', changeImpact: 'Change fixture',
      crossFieldConditions: ['Related fixture'], qualificationLimits: ['No runtime evidence'],
      cases: [{ name: 'Example fixture', condition: 'Fixture condition', sourceOutcome: 'Fixture outcome' }],
      evidence: [{ url: 'https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/staging/src/k8s.io/api/core/v1/types.go#L1-L2', claim: 'Fixture link only' }],
    },
  }));
  return [{apiVersion:'v1',kind:'ConfigMap',rows,extra:[],missing:[],sourceContexts:[{path:'fixture.yaml',document:0}]}];
}
const link = path => `[${path}](https://example.invalid/fixture)`;

test('maintenance inventory cannot publish missing receivers even when its summary says complete', () => {
  const resources=fixture();
  resources[0].rows.find(row=>row.fieldPath==='$.metadata').receiverContract=null;
  assert.throws(()=>renderApiResourceReference(resources,link), /API_REFERENCE_RECEIVER_MISSING: v1\/ConfigMap \$\.metadata/);
  assert.throws(()=>renderApiResourceReference(undefined,link), /API_REFERENCE_INVENTORY_MISSING/);
});

test('removed unselected paths, changed schema facts and duplicate rows reject publication', () => {
  const removed=fixture();removed[0].rows.pop();
  assert.throws(()=>renderApiResourceReference(removed,link), /API_REFERENCE_BOUNDARY_COUNT/);
  const changed=fixture();changed[0].rows[0].contract.type='incorrect';
  assert.throws(()=>renderApiResourceReference(changed,link), /API_REFERENCE_SCHEMA_DRIFT/);
  const duplicate=fixture();duplicate[0].rows.push(duplicate[0].rows[0]);
  assert.throws(()=>renderApiResourceReference(duplicate,link), /API_REFERENCE_PATH_DUPLICATE/);
});

test('full reference includes every path and behavior dimension, retains schema facts and escapes literal prose', () => {
  const resources=fixture();const output=renderApiResourceReference(resources,link);
  assert.equal((output.match(/<a id="api-field-/gu)??[]).length,resources[0].rows.length);
  for(const label of ['Receiver:','Operation:','Omitted:','JSON null:','Explicit empty value:',
    'Invalid value:','Change effect:','Related conditions:','Examples and expected outcomes:',
    'Scope and limits:','Implementation sources:','Pinned API schema constraints'])assert(output.includes(label));
  assert(!output.includes('<script>'));assert(!output.includes('[link](bad)'));
  assert(output.includes('&#60;script&#62;'));assert(output.includes('&#91;link&#93;(bad)'));
  assert(output.includes(resources[0].rows[0].authoritySha256));
  assert(output.includes('Expected from the cited source: Fixture outcome'));
});

test('unpinned implementation links and empty cases cannot become publication evidence', () => {
  const unpinned=fixture();unpinned[0].rows[0].receiverContract.evidence[0].url='https://github.com/kubernetes/kubernetes/blob/master/path#L1';
  assert.throws(()=>renderApiResourceReference(unpinned,link),/(?:API_REFERENCE_EVIDENCE|API_RECEIVER_EVIDENCE)_INCOMPLETE/);
  const empty=fixture();empty[0].rows[0].receiverContract.cases[0].sourceOutcome='';
  assert.throws(()=>renderApiResourceReference(empty,link),/(?:API_REFERENCE_CASE|API_RECEIVER_CASE)_INCOMPLETE/);
});


test('internal open-proof notes cannot be published as product limitations', () => {
  for (const note of ['OPEN DOCUMENTATION PROOF: inspect source',
    'OPEN SHARED METADATA PROOF: qualify the implicit metadata receiver',
    'Available-source documentation gap: missing consumer proof',
    'An unclosed source-proof obligation remains']) {
    const resources=fixture();resources[0].rows[0].receiverContract.qualificationLimits.push(note);
    assert.throws(()=>renderApiResourceReference(resources,link),/API_REFERENCE_UNRESOLVED_PROOF/);
  }
  const product=fixture();product[0].rows[0].receiverContract.qualificationLimits.push('A configured driver must support this feature.');
  assert(renderApiResourceReference(product,link).includes('A configured driver must support this feature.'));
});


test('implicit metadata stays separate from schema rows and all references resolve', () => {
  const references=structuredClone(implicitKubernetesObjectMetaReferences);
  const resources=references.map(({apiVersion,kind})=>({apiVersion,kind}));
  assert.deepEqual(validateImplicitMetadataReferences(resources,references),references);
  // Layout fixtures contain synthetic prose. The authored reference may have
  // unresolved source obligations and must not supply a publication PASS.
  const sample=fixture()[0].rows[0].receiverContract;
  const synthetic=references.map(reference=>({...reference,contracts:reference.contracts.map(receiver=>({
    ...structuredClone(sample),fieldPath:receiver.fieldPath
  }))}));
  const output=synthetic.map(renderImplicitMetadataReference).join('\n\n');
  assert.equal((output.match(/<a id="api-metadata-/gu)??[]).length,references.length);
  assert.equal((output.match(/#### <code>/gu)??[]).length,references.reduce((n,r)=>n+r.contracts.length,0));
  assert(!output.includes('<summary>Pinned API schema constraints</summary>'));
  for(const label of ['Receiver:','Operation:','Omitted:','JSON null:','Explicit empty value:','Invalid value:','Change effect:']) assert(output.includes(label));
  const missing=references.slice(1);
  assert.throws(()=>validateImplicitMetadataReferences(resources,missing),/API_REFERENCE_METADATA_MISSING/);
  assert.throws(()=>validateImplicitMetadataReferences(resources,[...references,references[0]]),/API_REFERENCE_METADATA_DUPLICATE/);
  const changed=structuredClone(references);changed[0].contracts[0].cases[0].sourceOutcome='Unverified replacement';
  assert.throws(()=>validateImplicitMetadataReferences(resources,changed),/API_REFERENCE_METADATA_DRIFT/);
  synthetic[0].contracts[0].qualificationLimits.push('Complete consumer discovery remains an open source-audit obligation.');
  assert.throws(()=>renderImplicitMetadataReference(synthetic[0]),/API_REFERENCE_UNRESOLVED_PROOF/);
});

test('opaque metadata must link the matching canonical reference before publication', () => {
  const reference=implicitKubernetesObjectMetaReferences.find(r=>r.kind==='CiliumNetworkPolicy');
  const sample=fixture()[0].rows[0].receiverContract;
  const resource={apiVersion:reference.apiVersion,kind:reference.kind,extra:[],sourceContexts:[],rows:
    apiResourceFieldBoundaries(reference.apiVersion,reference.kind).map(row=>({...row,receiverContract:{
      ...structuredClone(sample),kind:reference.kind,fieldPath:row.fieldPath,
      ...(row.fieldPath==='$.metadata'?{canonicalReferenceId:reference.referenceId}:{})
    }}))};
  const unresolved=reference.contracts.some(receiver=>receiver.qualificationLimits.some(value=>value.includes('open source-audit obligation')));
  if(unresolved) {
    assert.throws(()=>renderApiResourceReference([resource],link,[reference]),/API_REFERENCE_UNRESOLVED_PROOF/);
  } else {
    const output=renderApiResourceReference([resource],link,[reference]);
    const target=output.match(/Create, update, ownership and deletion\]\(#(api-metadata-[a-f0-9]+)\)/u)?.[1];
    assert(target);assert(output.includes(`<a id="${target}"></a>`));
    assert.equal((output.match(/<a id="api-field-/gu)??[]).length,resource.rows.length);
  }
  const metadata=resource.rows.find(row=>row.fieldPath==='$.metadata').receiverContract;
  metadata.canonicalReferenceId='wrong-kind';
  assert.throws(()=>renderApiResourceReference([resource],link,[reference]),/API_REFERENCE_METADATA_LINK_MISSING/);
  metadata.canonicalReferenceId=reference.referenceId;
  assert.throws(()=>renderApiResourceReference([resource],link,[]),/API_REFERENCE_METADATA_MISSING/);
});

test('reader explanations retain their links and reject unsupported targets', () => {
  const resources=fixture();
  const receiver=resources[0].rows[0].receiverContract;
  receiver.readerReferences=[{label:'ConfigMap consumption',target:'configuration-change-impact.md#configmap-consumption'}];
  assert(renderApiResourceReference(resources,link).includes('[ConfigMap consumption](configuration-change-impact.md#configmap-consumption)'));
  receiver.readerReferences[0].target='../missing.md#unknown';
  assert.throws(()=>renderApiResourceReference(resources,link),/API_REFERENCE_READER_LINK_INVALID/);
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { apiProductSelection, versionedApiReceiverRegistries, productApiReceiverRecords } from '../docs-api-product-scope.mjs';
import { apiReceiverCoverage } from '../docs-api-receiver-coverage.mjs';

test('source-selected publication binds raw paths, quoted keys, schema and source changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-product-test-'));
  fs.mkdirSync(path.join(root, 'examples'));
  try {
    const content = 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: fixture\n  labels:\n    example.org/name: selected\ndata:\n  config.yml: value\n';
    fs.writeFileSync(path.join(root, 'examples/fixture.yaml'), content);
    const contexts = [{ path: 'examples/fixture.yaml', document: 0, sourceDigest: createHash('sha256').update(content).digest('hex') }];
    const records = versionedApiReceiverRegistries.get('v1');
    const selection = apiProductSelection('v1', 'ConfigMap', contexts, records, root);
    assert(selection.fieldPaths.includes('$.data["*"]'));
    assert(selection.fieldPaths.includes('$.metadata.labels["*"]'));
    assert(!selection.fieldPaths.some(value => value.startsWith('$.metadata.managedFields')));
    const resource = { ...apiReceiverCoverage('v1', 'ConfigMap', records, selection), sourceContexts: contexts };
    const output = renderApiResourceReference([resource], link, [], root);
    assert(output.includes('authored-resource-field'));
    assert(!output.includes('full pinned API schema'));
    const omittedContext = structuredClone(resource); omittedContext.sourceContexts = [];
    assert.throws(() => renderApiResourceReference([omittedContext], link, [], root), /API_PRODUCT_DISCOVERY_DRIFT/);
    const removed = structuredClone(resource); removed.rows.pop();
    assert.throws(() => renderApiResourceReference([removed], link, [], root), /API_REFERENCE_BOUNDARY_COUNT/);
    const forged = structuredClone(resource); forged.productSelection.fieldPaths.pop();
    assert.throws(() => renderApiResourceReference([forged], link, [], root), /API_PRODUCT_SELECTION_DRIFT/);
    const changed = structuredClone(resource); changed.rows[0].contract.type = 'wrong';
    assert.throws(() => renderApiResourceReference([changed], link, [], root), /API_REFERENCE_SCHEMA_DRIFT/);
    fs.writeFileSync(path.join(root, 'examples/fixture.yaml'), content.replace('value', 'changed'));
    assert.throws(() => renderApiResourceReference([resource], link, [], root), /API_PRODUCT_(?:SOURCE|DISCOVERY)_DRIFT/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('relevant PVC omissions carry pinned receiver evidence without expanding absent alternatives', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-product-pvc-'));
  fs.mkdirSync(path.join(root, 'examples'));
  try {
    const content = 'apiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: fixture\nspec:\n  accessModes: [ReadWriteOnce]\n  resources:\n    requests:\n      storage: 1Gi\n';
    fs.writeFileSync(path.join(root, 'examples/fixture.yaml'), content);
    const contexts = [{ path: 'examples/fixture.yaml', document: 0, sourceDigest: createHash('sha256').update(content).digest('hex') }];
    const selection = apiProductSelection('v1', 'PersistentVolumeClaim', contexts, versionedApiReceiverRegistries.get('v1'), root);
    const omission = selection.applicability['$.spec.storageClassName'];
    assert(omission?.some(item => item.reason === 'receiver-default-under-present-parent' && item.evidence.length));
    assert(!selection.fieldPaths.includes('$.spec.dataSource.name'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('an added upstream choice is discovered and cannot pass with its meaning removed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-product-add-'));
  fs.mkdirSync(path.join(root, 'examples'));
  try {
    const content = 'apiVersion: v1\nkind: ConfigMap\nmetadata: {name: fixture}\nimmutable: true\ndata: {key: value}\n';
    fs.writeFileSync(path.join(root, 'examples/fixture.yaml'), content);
    const contexts = [{ path: 'examples/fixture.yaml', document: 0, sourceDigest: createHash('sha256').update(content).digest('hex') }];
    const records = versionedApiReceiverRegistries.get('v1');
    const selection = apiProductSelection('v1', 'ConfigMap', contexts, records, root);
    assert(selection.fieldPaths.includes('$.immutable'));
    const resource = { ...apiReceiverCoverage('v1', 'ConfigMap', records.filter(record => record.fieldPath !== '$.immutable'), selection), sourceContexts: contexts };
    assert.throws(() => renderApiResourceReference([resource], link, [], root), /API_REFERENCE_RECEIVER_MISSING/);
    const complete = structuredClone({ ...apiReceiverCoverage('v1', 'ConfigMap', records, selection), sourceContexts: contexts });
    complete.rows.find(row => row.fieldPath === '$.immutable').receiverContract.purpose = 'Tampered selected meaning';
    assert.throws(() => renderApiResourceReference([complete], link, [], root), /API_REFERENCE_RECEIVER_IDENTITY_DRIFT/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

import { discoverProductApiContexts, assertProductApiContexts, productScopeLimits } from '../docs-api-product-scope.mjs';
import { nativeOutputConsumerMatches, discoverScriptApiOutputs, discoverGoApiOutputs, discoverShellApiOutputs } from '../docs-api-output-discovery.mjs';
import { upstreamApiReference } from '../docs-api-reference.mjs';

function sourceFixture(contents, run) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'api-discovery-mutation-'));
  try {
    for(const [source,bytes]of Object.entries(contents)){fs.mkdirSync(path.dirname(path.join(root,source)),{recursive:true});fs.writeFileSync(path.join(root,source),bytes);}
    const authority=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');
    if(fs.existsSync(authority)){
      const registry=JSON.parse(fs.readFileSync(authority,'utf8'));
      for(const family of ['nonApiOutputContracts','nativeFileWriterCallContracts','nativeFileWriterCapabilities','kubernetesCommandContracts'])for(const contract of registry[family]??[])for(const operation of contract.operations??[])if(operation.selectors&&!operation.factsDigest)operation.factsDigest=nativeOperationFactDigest(deriveNativeOperationFacts(root,operation.source,operation.selectors));
      fs.writeFileSync(authority,JSON.stringify(registry));
    }
    return run(root);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}

test('malformed newly added raw source fails independent discovery before context comparison',()=> {
  sourceFixture({'examples/new.yaml':'apiVersion: v1\nkind: ConfigMap\nmetadata: [unterminated\n'},root=> {
    assert.throws(()=>discoverProductApiContexts(root),/API_PRODUCT_YAML_INVALID/);
    assert.throws(()=>assertProductApiContexts([],root),/API_PRODUCT_YAML_INVALID/);
  });
});

test('array default evidence survives an explicit sibling in a different actual item',()=> {
  const bytes='apiVersion: cilium.io/v2\nkind: CiliumNetworkPolicy\nmetadata: {name: fixture}\nspec:\n  endpointSelector: {}\n  ingress:\n  - icmps:\n    - fields:\n      - family: IPv6\n        type: 128\n      - type: 8\n';
  sourceFixture({'examples/icmp.yaml':bytes},root=> {
    const contexts=discoverProductApiContexts(root).map(({apiVersion,kind,...context})=>context);
    const selection=apiProductSelection('cilium.io/v2','CiliumNetworkPolicy',contexts,versionedApiReceiverRegistries.get('cilium.io/v2'),root);
    const path='$.spec.ingress[].icmps[].fields[].family';
    assert(selection.applicability[path].some(item=>item.reason==='authored-resource-field'&&item.fieldPath==='$.spec.ingress[0].icmps[0].fields[0].family'));
    assert(selection.applicability[path].some(item=>item.reason==='schema-default-under-present-parent'&&item.fieldPath==='$.spec.ingress[0].icmps[0].fields[1].family'));
  });
});

test('Deployment omissions include runtime defaults and conditional materialized children per actual parent',()=> {
  const base='apiVersion: apps/v1\nkind: Deployment\nmetadata: {name: fixture}\nspec:\n  selector: {matchLabels: {app: fixture}}\n  template:\n    metadata: {labels: {app: fixture}}\n    spec:\n      containers: [{name: app, image: example.invalid/app:v1}]\n      volumes:\n      - name: explicit\n        secret: {secretName: explicit, defaultMode: 256}\n      - name: omitted\n        secret: {secretName: omitted}\n      - name: config\n        configMap: {name: config}\n';
  sourceFixture({'examples/workload.yaml':base},root=> {
    const select=()=>apiProductSelection('apps/v1','Deployment',discoverProductApiContexts(root).map(({apiVersion,kind,...context})=>context),versionedApiReceiverRegistries.get('apps/v1'),root);
    const selected=select();
    for(const field of ['$.spec.revisionHistoryLimit','$.spec.progressDeadlineSeconds','$.spec.template.spec.dnsPolicy','$.spec.template.spec.restartPolicy','$.spec.template.spec.terminationGracePeriodSeconds','$.spec.template.spec.volumes[].configMap.defaultMode'])assert(selected.applicability[field].some(item=>item.evidence?.some(e=>e.url.includes('/blob/66452049f3d692768c39c797b21b793dce80314e/'))),field);
    assert(selected.applicability['$.spec.template.spec.volumes[].secret.defaultMode'].some(item=>item.fieldPath==='$.spec.template.spec.volumes[1].secret.defaultMode'&&item.reason==='receiver-default-under-present-parent'));
    assert(selected.applicability['$.spec.strategy.rollingUpdate.maxSurge'].some(item=>item.materializedBy==='$.spec.strategy.rollingUpdate'));
    fs.writeFileSync(path.join(root,'examples/workload.yaml'),base.replace('  selector:','  strategy: {type: Recreate}\n  selector:'));
    assert(!select().fieldPaths.includes('$.spec.strategy.rollingUpdate.maxSurge'));
  });
});

test('new chart resource and hidden conditional field both fail the original resource coverage gate',()=> {
  sourceFixture({'charts/new/Chart.yaml':'apiVersion: v2\nname: new\nversion: 0.1.0\n','charts/new/values.yaml':'optional: false\n',
    'charts/new/templates/resource.yaml':'apiVersion: v1\nkind: ConfigMap\nmetadata: {name: discovered}\ndata: {key: value}\n'},root=> {
      const resources=discoverProductApiContexts(root);
      assert(resources.some(item=>item.kind==='ConfigMap'&&item.producer==='helm'));
      assert.throws(()=>assertProductApiContexts([],root),/API_PRODUCT_DISCOVERY_DRIFT/);
      fs.appendFileSync(path.join(root,'charts/new/templates/resource.yaml'),'{{- if .Values.newFeature.enabled }}\nimmutable: true\n{{- end }}\n');
      fs.appendFileSync(path.join(root,'charts/new/values.yaml'),'newFeature: {enabled: false}\n');
      assert.throws(()=>discoverProductApiContexts(root),/API_PRODUCT_HELM_BRANCH_UNDISCOVERED/);
  });
});

test('new script constructor is detected without executing its external-effect code',()=> {
  sourceFixture({'scripts/new-producer.mjs':"throw Error('MUST_NOT_EXECUTE');\nconst output={apiVersion:'v1',kind:'ConfigMap',metadata:{name:'new'},immutable:true};\n"},root=> {
    const outputs=discoverScriptApiOutputs(root);
    assert.equal(outputs.length,1);
    assert.equal(outputs[0].value.immutable,true);
    assert.throws(()=>assertProductApiContexts([],root),/API_PRODUCT_DISCOVERY_DRIFT/);
    fs.appendFileSync(path.join(root,'scripts/new-producer.mjs'),"const next={apiVersion:'batch/v1',kind:'Job',metadata:{name:'next'},spec:{template:{spec:{containers:[{name:'app',image:'example.invalid/app'}],restartPolicy:'Never'}}}};\n");
    assert.equal(discoverScriptApiOutputs(root).length,2);
  });
});

test('new workload kinds use authenticated GVK authority and Argo points at its versioned CRD definition',()=> {
  for(const [version,kind]of [['batch/v1','Job'],['batch/v1','CronJob'],['apps/v1','StatefulSet'],['policy/v1','PodDisruptionBudget']])assert(apiResourceFieldBoundaries(version,kind).some(row=>row.fieldPath==='$.spec'));
  assert.match(upstreamApiReference('argoproj.io/v1alpha1','Application'),/\/argo-cd\/blob\/v3\.5\.2\/manifests\/crds\/application-crd\.yaml$/u);
  assert.match(upstreamApiReference('argoproj.io/v1alpha1','AppProject'),/\/argo-cd\/blob\/v3\.5\.2\/manifests\/crds\/appproject-crd\.yaml$/u);
  assert(!productScopeLimits.some(value=>/hooks|discovery.*not established|require.*inventories/iu.test(value)));
});


test('new shell output and changed serialized fields invalidate source-bound contexts with original line provenance',()=> {
  const source='#!/bin/sh\n# provenance\nkubectl create configmap published \\\n  --from-literal=ready=yes\n\ncat <<EOF\napiVersion: v1\nkind: Pod\nmetadata: {name: public}\nspec: {containers: [{name: app, image: example.invalid/app}]}\nEOF\n';
  sourceFixture({'scripts/publish.sh':source},root=> {
    const outputs=discoverShellApiOutputs(root);
    assert.equal(outputs.length,2);
    assert.equal(outputs.find(item=>item.value.kind==='ConfigMap').context.line,3);
    assert.equal(outputs.find(item=>item.value.kind==='ConfigMap').value.data.ready,'<source-derived-payload>');
    const original=outputs.map(item=>item.context);
    fs.writeFileSync(path.join(root,'scripts/publish.sh'),source.replace('spec: {containers:','spec: {hostNetwork: true, containers:'));
    assert.notEqual(discoverShellApiOutputs(root).find(item=>item.value.kind==='Pod').context.outputDigest,original.find(item=>item.kind==='Pod').outputDigest);
    assert.throws(()=>assertProductApiContexts(original.map(context=>({apiVersion:context.apiVersion,kind:context.kind,sourceContexts:[context]})),root),/API_PRODUCT_DISCOVERY_DRIFT/);
    fs.writeFileSync(path.join(root,'scripts/publish.sh'),source.replace('metadata: {name: public}','metadata: [broken'));
    assert.throws(()=>discoverShellApiOutputs(root),/API_PRODUCT_SHELL_YAML_INVALID/);
  });
});

test('Job parallelism changes omission applicability and StatefulSet OnDelete does not materialize rolling limits',()=> {
  const job='apiVersion: batch/v1\nkind: Job\nmetadata: {name: fixture}\nspec:\n  template:\n    spec: {restartPolicy: Never, containers: [{name: app, image: example.invalid/app}]}\n';
  sourceFixture({'examples/job.yaml':job},root=> {
    const select=()=>apiProductSelection('batch/v1','Job',discoverProductApiContexts(root).map(({apiVersion,kind,...context})=>context),versionedApiReceiverRegistries.get('batch/v1'),root);
    assert(select().fieldPaths.includes('$.spec.completions'));
    fs.writeFileSync(path.join(root,'examples/job.yaml'),job.replace('spec:\n  template:','spec:\n  parallelism: 2\n  template:'));
    assert(!select().fieldPaths.includes('$.spec.completions'));
  });
  const stateful='apiVersion: apps/v1\nkind: StatefulSet\nmetadata: {name: fixture}\nspec:\n  serviceName: fixture\n  selector: {matchLabels: {app: fixture}}\n  template:\n    metadata: {labels: {app: fixture}}\n    spec: {containers: [{name: app, image: example.invalid/app}]}\n';
  sourceFixture({'examples/stateful.yaml':stateful},root=> {
    const select=()=>apiProductSelection('apps/v1','StatefulSet',discoverProductApiContexts(root).map(({apiVersion,kind,...context})=>context),versionedApiReceiverRegistries.get('apps/v1'),root);
    assert(select().fieldPaths.includes('$.spec.updateStrategy.rollingUpdate.partition'));
    assert(select().fieldPaths.includes('$.spec.persistentVolumeClaimRetentionPolicy.whenDeleted'));
    fs.writeFileSync(path.join(root,'examples/stateful.yaml'),stateful.replace('  serviceName:','  updateStrategy: {type: OnDelete}\n  serviceName:'));
    assert(!select().fieldPaths.includes('$.spec.updateStrategy.rollingUpdate.partition'));
  });
});

test('Go constructor additions, changed map fields and malformed syntax fail independently of a saved context list',()=> {
  const source='package main\nfunc output() map[string]interface{} { return map[string]interface{}{"apiVersion":"rbac.authorization.k8s.io/v1","kind":"Role","metadata":map[string]interface{}{"name":"discovered"},"rules":[]interface{}{map[string]interface{}{"verbs":[]interface{}{"get"},"resources":[]interface{}{"pods"},"apiGroups":[]interface{}{""}}}} }\n';
  sourceFixture({'cmd/producer/main.go':source},root=> {
    const original=discoverGoApiOutputs(root);
    assert.equal(original.length,1);
    assert.equal(original[0].value.rules[0].verbs[0],'get');
    fs.writeFileSync(path.join(root,'cmd/producer/main.go'),source.replace('"verbs":','"resourceNames":[]interface{}{"restricted"},"verbs":'));
    const changed=discoverGoApiOutputs(root);
    assert.deepEqual(changed[0].value.rules[0].resourceNames,['restricted']);
    assert.notEqual(changed[0].context.outputDigest,original[0].context.outputDigest);
    assert.throws(()=>assertProductApiContexts(original.map(({context})=>({apiVersion:context.apiVersion,kind:context.kind,sourceContexts:[context]})),root),/API_PRODUCT_DISCOVERY_DRIFT/);
    fs.writeFileSync(path.join(root,'cmd/producer/main.go'),'package main\nfunc malformed( {');
    assert.throws(()=>discoverGoApiOutputs(root),/API_PRODUCT_GO_PRODUCER_PARSE_FAILED/);
  });
});

import { execFileSync } from 'node:child_process';
import { discoverExternalChartApiOutputs } from '../docs-api-output-discovery.mjs';
import { assertProducerAdapterAuthority,producerAdapterOperationRecipe,shellRawOutputSinks,shellRawOutputOperationRecipe } from '../docs-api-output-discovery.mjs';

test('new active external Application binds authenticated chart output and rejects changed pins or malformed bindings',()=> {
  sourceFixture({'chart/Chart.yaml':'apiVersion: v2\nname: external\nversion: 0.1.0\n','chart/values.yaml':'immutable: false\n','chart/templates/config.yaml':'apiVersion: v1\nkind: ConfigMap\nmetadata: {name: external}\nimmutable: {{ .Values.immutable }}\n',
    'gitops/new.yaml':'apiVersion: argoproj.io/v1alpha1\nkind: Application\nmetadata: {name: new}\nspec:\n  destination: {namespace: default}\n  sources:\n  - repoURL: https://example.invalid/charts\n    chart: external\n    targetRevision: 0.1.0\n    helm:\n      valueFiles: [$values/gitops/values.yaml]\n','gitops/values.yaml':'immutable: false\n'},root=> {
    fs.mkdirSync(path.join(root,'scripts/vendor/external-helm-charts'),{recursive:true});
    const archivePath='scripts/vendor/external-helm-charts/fixture.tgz';
    execFileSync('tar',['-czf',path.join(root,archivePath),'-C',root,'chart']);
    const archive=fs.readFileSync(path.join(root,archivePath));
    const manifest=JSON.stringify({charts:{new:{chart:'external',version:'0.1.0',repository:'https://example.invalid/charts',path:archivePath,sha256:createHash('sha256').update(archive).digest('hex'),size:archive.length}}});
    fs.writeFileSync(path.join(root,'scripts/external-helm-archives.json'),manifest);
    fs.writeFileSync(path.join(root,'scripts/external-helm-archives.sha256'),`${createHash('sha256').update(manifest).digest('hex')}  external-helm-archives.json\n`);
    const original=discoverExternalChartApiOutputs(root);
    assert.equal(original.length,1);assert.equal(original[0].value.immutable,false);
    fs.writeFileSync(path.join(root,'gitops/values.yaml'),'immutable: true\n');
    const changed=discoverExternalChartApiOutputs(root);assert.equal(changed[0].value.immutable,true);assert.notEqual(changed[0].context.inputDigest,original[0].context.inputDigest);
    const binding=fs.readFileSync(path.join(root,'gitops/new.yaml'),'utf8');
    const missingBinding=binding.replace('$values/gitops/values.yaml','$values/gitops/optional.yaml');
    fs.writeFileSync(path.join(root,'gitops/new.yaml'),missingBinding);assert.throws(()=>discoverExternalChartApiOutputs(root),/API_PRODUCT_EXTERNAL_VALUE_INPUT_MISSING/);
    fs.writeFileSync(path.join(root,'gitops/new.yaml'),missingBinding.replace('    helm:\n','    helm:\n      ignoreMissingValueFiles: true\n'));
    const omittedOptional=discoverExternalChartApiOutputs(root);assert.equal(omittedOptional[0].value.immutable,false);assert.deepEqual(omittedOptional[0].context.inputs,[]);
    fs.writeFileSync(path.join(root,'gitops/optional.yaml'),'immutable: true\n');const presentOptional=discoverExternalChartApiOutputs(root);assert.equal(presentOptional[0].value.immutable,true);assert.deepEqual(presentOptional[0].context.inputs,['gitops/optional.yaml']);assert.notEqual(presentOptional[0].context.inputDigest,omittedOptional[0].context.inputDigest);
    fs.writeFileSync(path.join(root,'gitops/new.yaml'),binding);
    fs.writeFileSync(path.join(root,'chart/templates/config.yaml'),'apiVersion: v1\nkind: ConfigMap\nmetadata: {name: external}\ndata:\n  version: {{ .Capabilities.KubeVersion.Version | quote }}\n  customApi: {{ .Capabilities.APIVersions.Has "example.test/v1/Widget" | quote }}\n');
    execFileSync('tar',['-czf',path.join(root,archivePath),'-C',root,'chart']);
    const changedArchive=fs.readFileSync(path.join(root,archivePath));const updatedManifest=JSON.parse(manifest);updatedManifest.charts.new.sha256=createHash('sha256').update(changedArchive).digest('hex');updatedManifest.charts.new.size=changedArchive.length;
    const updatedBytes=JSON.stringify(updatedManifest);fs.writeFileSync(path.join(root,'scripts/external-helm-archives.json'),updatedBytes);fs.writeFileSync(path.join(root,'scripts/external-helm-archives.sha256'),createHash('sha256').update(updatedBytes).digest('hex'));
    const defaultCapabilities=discoverExternalChartApiOutputs(root);
    fs.writeFileSync(path.join(root,'gitops/new.yaml'),binding.replace('    helm:\n','    helm:\n      kubeVersion: 1.33.1\n      apiVersions: [example.test/v1/Widget]\n'));
    const configuredCapabilities=discoverExternalChartApiOutputs(root);
    assert.equal(configuredCapabilities[0].value.data.version,'v1.33.1');assert.equal(configuredCapabilities[0].value.data.customApi,'true');assert.equal(defaultCapabilities[0].value.data.customApi,'false');assert.notEqual(configuredCapabilities[0].context.dependencyDigest,defaultCapabilities[0].context.dependencyDigest);
    fs.writeFileSync(path.join(root,'gitops/new.yaml'),binding.replace('0.1.0','0.2.0'));
    assert.throws(()=>discoverExternalChartApiOutputs(root),/API_PRODUCT_EXTERNAL_ARCHIVE_AUTHORITY_MISSING/);
    fs.writeFileSync(path.join(root,'gitops/new.yaml'),'spec: [broken');
    assert.throws(()=>discoverExternalChartApiOutputs(root),/API_PRODUCT_EXTERNAL_BINDING_YAML_INVALID/);
    fs.writeFileSync(path.join(root,'gitops/new.yaml'),binding);fs.appendFileSync(path.join(root,archivePath),'tampered');
    assert.throws(()=>discoverExternalChartApiOutputs(root),/API_PRODUCT_EXTERNAL_ARCHIVE_DRIFT/);
  });
});

test('Go indexed field additions and lexical bindings alter the actual constructed output',()=> {
 const source='package main\nfunc output() map[string]interface{} { object := map[string]interface{}{"apiVersion":"v1","kind":"ConfigMap","metadata":map[string]interface{}{"name":"actual"}}; object["immutable"] = true; return object }\nfunc unrelated() { object := map[string]interface{}{"immutable":false}; _ = object }\n';
 sourceFixture({'cmd/producer/main.go':source},root=> {
  const outputs=discoverGoApiOutputs(root);assert.equal(outputs.length,1);assert.equal(outputs[0].value.immutable,true);
  fs.writeFileSync(path.join(root,'cmd/producer/main.go'),source.replace('object["immutable"] = true','object["immutable"] = true; object["data"] = map[string]interface{}{"new":"published"}'));
  const changed=discoverGoApiOutputs(root);assert.deepEqual(changed[0].value.data,{new:'published'});assert.notEqual(outputs[0].context.outputDigest,changed[0].context.outputDigest);
 });
});

test('script output binds serialized template inputs and keeps unrelated lexical declarations separate',()=> {
 const body="import fs from 'node:fs';import YAML from 'yaml';const template=new URL('../examples/base.yaml',import.meta.url);const documents=YAML.parseAllDocuments(fs.readFileSync(template,'utf8')).map(doc=>{return doc.toJS()});const base=documents.find(doc=>doc.kind==='Deployment');function unrelated(){const base={spec:{wrong:true}};return base};const published={apiVersion:'apps/v1',kind:'Deployment',...structuredClone(base)};";
 const resource='apiVersion: apps/v1\nkind: Deployment\nmetadata: {name: actual}\nspec: {replicas: 1}\n';
 sourceFixture({'scripts/serialize.mjs':body,'examples/base.yaml':resource},root=> {
  const original=discoverScriptApiOutputs(root);assert.equal(original.length,1);assert.deepEqual(original[0].value.spec,{replicas:1});assert.deepEqual(original[0].context.inputs,['examples/base.yaml']);
  fs.writeFileSync(path.join(root,'examples/base.yaml'),resource.replace('replicas: 1','replicas: 1, paused: true'));
  const changed=discoverScriptApiOutputs(root);assert.equal(changed[0].value.spec.paused,true);assert.notEqual(original[0].context.inputDigest,changed[0].context.inputDigest);
  fs.writeFileSync(path.join(root,'examples/base.yaml'),'apiVersion: [broken');assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_SCRIPT_INPUT_YAML_INVALID/);
 });
});

import YAML from 'yaml';
import { discoverHelmApiOutputs, discoverRejectedApiOutputProfiles, walkProductSources } from '../docs-api-output-discovery.mjs';

test('reviewed illustrative rejection remains observed and fails closed on changed input, error, or unexpected success',()=> {
 const input='examples/illustrative.yaml';const chart='charts/kubeclaw';
 const bad='agentRole: buster\nillustrativeCase: incomplete\n';
 const template='{{- if eq .Values.illustrativeCase "incomplete" }}{{- fail "fixture input requires preparation" }}{{- end }}\napiVersion: v1\nkind: ConfigMap\nmetadata: {name: accepted}\n';
 sourceFixture({[`${chart}/Chart.yaml`]:'apiVersion: v2\nname: kubeclaw\nversion: 0.1.0\n',[`${chart}/values.yaml`]:'illustrativeCase: complete\n',[`${chart}/templates/object.yaml`]:template,[input]:bad,'docs/site/use/install.md':'# Installation\n\n## Select Configuration\n\nPrepare complete input before mutation.\n'},root=> {
  assert.throws(()=>discoverHelmApiOutputs(root),/API_PRODUCT_HELM_RENDER_FAILED/);
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  const stderr=execFileSync('sh',['-c','helm template discovery charts/kubeclaw --namespace default --kube-version 1.35.0 --include-crds -f examples/illustrative.yaml 2>&1 || true'],{cwd:root,encoding:'utf8'}).trim();
  let registry={version:1,profiles:[{chart,profile:input,expectedError:stderr,canonicalProcedure:'docs/site/use/install.md#select-configuration',owner:'fixture preparer',safeStop:'Stop before deploying this incomplete illustration.',preparationCriterion:'Prepare the required values and require successful render.',inputSourceDigests:{[input]:sha(bad)},chartSourceDigests:Object.fromEntries(walkProductSources(root,[chart],()=>true).map(source=>[source,sha(fs.readFileSync(path.join(root,source)))])),discoveryInputDigest:sha(YAML.stringify(YAML.parse(bad)))}]};
  const write=()=>fs.writeFileSync(path.join(root,'scripts/docs-api-rejected-output-profiles.json'),JSON.stringify(registry));fs.mkdirSync(path.join(root,'scripts'),{recursive:true});write();
  const rejected=discoverRejectedApiOutputProfiles(root);assert.equal(rejected.length,1);assert.equal(rejected[0].observedOutputBytes,0);assert.notEqual(rejected[0].observedExitCode,0);assert(discoverHelmApiOutputs(root).every(output=>output.context.profile!==input));
  fs.appendFileSync(path.join(root,input),'newField: true\n');assert.throws(()=>discoverHelmApiOutputs(root),/API_PRODUCT_REJECTED_PROFILE_INPUT_DRIFT/);
  fs.writeFileSync(path.join(root,input),bad);registry.profiles[0].expectedError='different diagnosis';write();assert.throws(()=>discoverHelmApiOutputs(root),/API_PRODUCT_REJECTED_PROFILE_ERROR_DRIFT/);
  const valid=bad.replace('incomplete','complete');fs.writeFileSync(path.join(root,input),valid);registry.profiles[0].inputSourceDigests[input]=sha(valid);registry.profiles[0].discoveryInputDigest=sha(YAML.stringify(YAML.parse(valid)));registry.profiles[0].expectedError=stderr;write();assert.throws(()=>discoverHelmApiOutputs(root),/API_PRODUCT_REJECTED_PROFILE_UNEXPECTED_SUCCESS/);
 });
});

test('explicit guarded self-test API-shaped analysis fixtures do not hide ordinary output constructors',()=> {
 sourceFixture({'scripts/producer.mjs':"function analysisFixture(){return {apiVersion:'v1',kind:'ConfigMap',metadata:{name:'fixture'}}};if(process.argv.includes('--self-test'))analysisFixture();function actual(){return {apiVersion:'v1',kind:'ConfigMap',metadata:{name:'actual'}}};actual();"},root=> {
  const outputs=discoverScriptApiOutputs(root);assert.equal(outputs.length,1);assert.equal(outputs[0].value.metadata.name,'actual');
  fs.appendFileSync(path.join(root,'scripts/producer.mjs'),'analysisFixture();');
  assert.equal(discoverScriptApiOutputs(root).length,2);
 });
});

test('a helper-only dictionary mutation cannot escape supported output branch discovery',()=> {
 const helper='{{- define "fixture.object" -}}{{- $root := .root -}}{{- $object := dict "apiVersion" "v1" "kind" "ConfigMap" "metadata" (dict "name" "actual") -}}{{- toYaml $object -}}{{- end -}}';
 sourceFixture({'charts/helper/Chart.yaml':'apiVersion: v2\nname: helper\nversion: 0.1.0\n','charts/helper/values.yaml':'hidden: {enabled: false}\n','charts/helper/templates/_object.tpl':helper,'charts/helper/templates/object.yaml':'{{ include "fixture.object" (dict "root" $) }}\n'},root=> {
  assert.equal(discoverHelmApiOutputs(root).length,1);
  fs.writeFileSync(path.join(root,'charts/helper/templates/_object.tpl'),helper.replace('{{- toYaml $object -}}','{{- if $root.Values.hidden.enabled -}}{{- $_ := set $object "immutable" true -}}{{- end -}}{{- toYaml $object -}}'));
  assert.throws(()=>discoverHelmApiOutputs(root),/API_PRODUCT_HELM_BRANCH_UNDISCOVERED/);
  fs.writeFileSync(path.join(root,'charts/helper/values.yaml'),'hidden: {enabled: true}\n');
  assert.equal(discoverHelmApiOutputs(root)[0].value.immutable,true);
 });
});

test('new API YAML emitted as a script string changes discovery without executing the producer',()=> {
 const manifest='apiVersion: v1\nkind: ConfigMap\nmetadata: {name: serialized}\ndata: {key: public}\n';
 sourceFixture({'scripts/publish.mjs':`console.log(${JSON.stringify(manifest)});throw Error('producer must not execute');`},root=> {
  const outputs=discoverScriptApiOutputs(root);assert.equal(outputs.length,1);assert.equal(outputs[0].value.data.key,'public');assert.equal(outputs[0].context.profile,'serialized-literal');
  fs.writeFileSync(path.join(root,'scripts/publish.mjs'),`process.stdout.write(${JSON.stringify(manifest+'immutable: true\n')});`);const changed=discoverScriptApiOutputs(root);assert.equal(changed[0].value.immutable,true);assert.notEqual(changed[0].context.outputDigest,outputs[0].context.outputDigest);
  fs.writeFileSync(path.join(root,'scripts/publish.mjs'),`console.log(${JSON.stringify(manifest+'broken: [\n')});`);assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_SCRIPT_SERIALIZED_YAML_INVALID/);
 });
});

test('a newly authored chart template without a chart binding fails closed',()=> {
 sourceFixture({'charts/unbound/templates/new.yaml':'apiVersion: v1\nkind: ConfigMap\nmetadata: {name: new}\n'},root=> {
  assert.throws(()=>discoverHelmApiOutputs(root),/API_PRODUCT_HELM_TEMPLATE_WITHOUT_CHART_AUTHORITY/);
 });
});

test('a new typed Kubernetes Go producer fails qualification instead of disappearing without literal TypeMeta',()=> {
 sourceFixture({'cmd/new/main.go':'package main\nimport corev1 "k8s.io/api/core/v1"\nfunc output() corev1.Pod {return corev1.Pod{}}\n'},root=> {
  assert.throws(()=>discoverGoApiOutputs(root),/API_PRODUCT_GO_TYPED_CONSTRUCTOR_UNQUALIFIED/);
 });
});

test('destructured API helper parameters retain their actual calling scope and changed serialized fields',()=> {
 const source="function publish(context){const {metadata}=context;return {apiVersion:'v1',kind:'ConfigMap',metadata:{...metadata},data:{key:'value'}}};function caller(){const metadata={name:'actual',labels:{first:'true'}};const context={metadata};return publish(context)};function unrelated(){const metadata={name:'wrong'};return metadata}";
 sourceFixture({'scripts/helper.mjs':source},root=> {
  const original=discoverScriptApiOutputs(root);assert.equal(original[0].value.metadata.name,'actual');assert.deepEqual(original[0].value.metadata.labels,{first:'true'});
  fs.writeFileSync(path.join(root,'scripts/helper.mjs'),source.replace("first:'true'","first:'true',newPublicField:'retained'"));const changed=discoverScriptApiOutputs(root);assert.equal(changed[0].value.metadata.labels.newPublicField,'retained');assert.notEqual(original[0].context.outputDigest,changed[0].context.outputDigest);
 });
});

test('the exact unsupported Prism field retains its dedicated contract without becoming a served schema property',()=> {
 const source='#!/bin/bash\ncmd_prism_e2e() {\n kubectl apply -n "$NAMESPACE" -f - <<EOF\napiVersion: v1\nkind: ConfigMap\nmetadata: {name: earlier}\nEOF\n kubectl apply -n "$NAMESPACE" -f - <<EOF\napiVersion: kubeclaw.forgestack.ai/v1alpha1\nkind: BusterNamespaceLease\nmetadata: {name: prism}\nspec: {capabilityProfile: storage}\nEOF\n}\n';
 sourceFixture({'scripts/deploy.sh':source},root=> {
  const selected=()=>{const contexts=discoverShellApiOutputs(root).map(output=>output.context).filter(context=>context.kind==='BusterNamespaceLease');return apiProductSelection('kubeclaw.forgestack.ai/v1alpha1','BusterNamespaceLease',contexts,productApiReceiverRecords('kubeclaw.forgestack.ai/v1alpha1','BusterNamespaceLease'),root)};
  const selection=selected();assert(!selection.fieldPaths.includes('$.spec.capabilityProfile'));assert.equal(selection.authoredUnknownFields[0].authoredValue,'storage');assert.equal(selection.authoredUnknownFields[0].receiverContract.status,'unsupported-authored-input');assert.equal(selection.authoredUnknownFields[0].schemaAuthority,null);assert(selection.fieldPaths.includes('$.spec.access[].subject'));
  fs.writeFileSync(path.join(root,'scripts/deploy.sh'),source.replace('capabilityProfile: storage','capabilityProfile: changed'));assert.throws(selected,/API_PRODUCT_AUTHORED_UNKNOWN_VALUE_DRIFT/);
  fs.writeFileSync(path.join(root,'scripts/deploy.sh'),source.replaceAll('kubectl apply -n','kubectl apply --validate=ignore -n'));assert.throws(selected,/BUSTER_AUTHORED_UNKNOWN_CONTEXT_GAP/);
  fs.writeFileSync(path.join(root,'scripts/deploy.sh'),source.replace('capabilityProfile: storage','unreviewedField: storage'));assert.throws(selected,/BUSTER_AUTHORED_UNKNOWN_FIELD_GAP/);
 });
});

test('changed installer flags, transform pipelines and a new Helm producer stop before stale adapters can rebind',()=> {
 const source='#!/bin/bash\nhelm upgrade --install actual example/chart --version 1.0.0\nnode scripts/render-reviewed.mjs input.yaml\n';
 sourceFixture({'scripts/install.sh':source},root=> {
  const registry={version:1,owner:'fixture adapter author',closureCondition:'Review changed operation and refresh adapter proof.',sources:{'scripts/install.sh':{operationRecipe:producerAdapterOperationRecipe('scripts/install.sh',source),sha256:createHash('sha256').update(source).digest('hex'),operation:'Reviewed fixture installer and transform caller.',operationDigest:createHash('sha256').update(source).digest('hex'),invocations:source.trim().split('\n').slice(1)}}};fs.writeFileSync(path.join(root,'scripts/docs-api-producer-adapter-authorities.json'),JSON.stringify(registry));
  assertProducerAdapterAuthority(root,['scripts/install.sh']);
  fs.writeFileSync(path.join(root,'scripts/install.sh'),source.replace('--version 1.0.0','--version 1.0.0 --set newPublicFlag=true'));assert.throws(()=>discoverShellApiOutputs(root),/API_PRODUCT_ADAPTER_(?:AUTHORITY|INVOCATION|OPERATION)_DRIFT/);
  fs.writeFileSync(path.join(root,'scripts/install.sh'),source.replace('render-reviewed.mjs','render-unreviewed.mjs'));assert.throws(()=>discoverShellApiOutputs(root),/API_PRODUCT_ADAPTER_(?:AUTHORITY|INVOCATION|OPERATION)_DRIFT/);
  fs.writeFileSync(path.join(root,'scripts/install.sh'),source);fs.writeFileSync(path.join(root,'scripts/new-install.sh'),'helm install new new/chart --version 1.0.0\n');assert.throws(()=>discoverShellApiOutputs(root),/API_PRODUCT_(?:ADAPTER_OPERATION_UNCLASSIFIED|SHELL_RAW_OUTPUT_ROLE_UNQUALIFIED)/);
  fs.writeFileSync(path.join(root,'scripts/new-install.sh'),'args=(upgrade --install new new/chart)\nhelm "${args[@]}"\n');assert.throws(()=>discoverShellApiOutputs(root),/API_PRODUCT_(?:ADAPTER_OPERATION_UNCLASSIFIED|SHELL_RAW_OUTPUT_ROLE_UNQUALIFIED)/);
 });
});

test('a newly imported typed Kubernetes JavaScript emitter cannot vanish before shape classification',()=> {
 sourceFixture({'scripts/new-sdk.mjs':"import {V1Pod} from '@kubernetes/client-node';const pod=new V1Pod();"},root=> {
  assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_SCRIPT_TYPED_SDK_UNQUALIFIED/);
 });
});

test('DaemonSet strategy defaults and Pod children are context qualified while CSI omitted capabilities keep their own receiving route',()=> {
 const daemon='apiVersion: apps/v1\nkind: DaemonSet\nmetadata: {name: actual}\nspec:\n  updateStrategy: {type: RollingUpdate}\n  template:\n    spec: {containers: [{name: app, image: example.invalid/app}]}\n';
 sourceFixture({'examples/daemon.yaml':daemon,'examples/driver.yaml':'apiVersion: storage.k8s.io/v1\nkind: CSIDriver\nmetadata: {name: actual}\nspec: {attachRequired: false}\n'},root=> {
  const selection=(version,kind)=>apiProductSelection(version,kind,discoverProductApiContexts(root).filter(context=>context.kind===kind),productApiReceiverRecords(version,kind),root);
  const rolling=selection('apps/v1','DaemonSet');assert(rolling.fieldPaths.includes('$.spec.updateStrategy.rollingUpdate.maxUnavailable'));assert(rolling.fieldPaths.includes('$.spec.template.spec.dnsPolicy'));assert(rolling.fieldPaths.includes('$.spec.revisionHistoryLimit'));assert.match(rolling.applicability['$.spec.updateStrategy.rollingUpdate.maxSurge'][0].omission,/defaults to 0/);
  fs.writeFileSync(path.join(root,'examples/daemon.yaml'),daemon.replace('type: RollingUpdate','type: OnDelete'));assert(!selection('apps/v1','DaemonSet').fieldPaths.includes('$.spec.updateStrategy.rollingUpdate'));
  const driver=selection('storage.k8s.io/v1','CSIDriver');assert(driver.fieldPaths.includes('$.spec.requiresRepublish'));assert.equal(driver.applicability['$.spec.volumeLifecycleModes[]'][0].fieldPath,'$.spec.volumeLifecycleModes[0]');assert.equal(driver.applicability['$.spec.volumeLifecycleModes[]'][0].reason,'receiver-materialized-default-child');assert.match(driver.applicability['$.spec.seLinuxMount'][0].omission,/When SELinuxMountReadWriteOncePod is enabled/);assert(driver.applicability['$.spec.fsGroupPolicy'][0].evidence[0].url.includes('/pkg/apis/storage/v1/defaults.go#'));
  fs.writeFileSync(path.join(root,'examples/driver.yaml'),'apiVersion: storage.k8s.io/v1\nkind: CSIDriver\nmetadata: {name: actual}\nspec: {attachRequired: false, volumeLifecycleModes: []}\n');assert.equal(selection('storage.k8s.io/v1','CSIDriver').applicability['$.spec.volumeLifecycleModes[]'][0].reason,'receiver-materialized-default-child');
 });
});

test('Pod-only service links and conditional account admission are selected on the actual Pod route',()=> {
 sourceFixture({'examples/pod.yaml':'apiVersion: v1\nkind: Pod\nmetadata: {name: actual}\nspec: {automountServiceAccountToken: false, containers: [{name: app, image: example.invalid/app}]}\n','examples/template.yaml':'apiVersion: apps/v1\nkind: Deployment\nmetadata: {name: template}\nspec: {template: {spec: {containers: [{name: app, image: example.invalid/app}]}}}\n'},root=> {
  const selected=(version,kind)=>apiProductSelection(version,kind,discoverProductApiContexts(root).filter(context=>context.kind===kind),productApiReceiverRecords(version,kind),root);
  const pod=selected('v1','Pod');assert(pod.fieldPaths.includes('$.spec.enableServiceLinks'));assert.match(pod.applicability['$.spec.serviceAccountName'][0].omission,/even when automountServiceAccountToken is false/);assert.match(pod.applicability['$.spec.serviceAccountName'][0].omission,/non-mirror Pod create/);
  const template=selected('apps/v1','Deployment');assert(!template.fieldPaths.includes('$.spec.template.spec.enableServiceLinks'));assert(!template.fieldPaths.includes('$.spec.template.spec.serviceAccountName'));
 });
});

test('selected Pod workload records retain the Pod receiving route and reject new body fields', () => {
  const fields=['$.spec','$.spec.containers','$.spec.containers[]','$.spec.containers[].name','$.spec.serviceAccountName'];
  const records=productApiReceiverRecords('v1','Pod',fields).filter(record=>record.kind==='Pod');
  for(const fieldPath of fields) {
    const record=records.find(record=>record.fieldPath===fieldPath);
    assert.ok(record,fieldPath);
    assert.deepEqual(record.authoritySelector,{apiVersion:'v1',kind:'Pod',fieldPath});
    assert.ok(record.evidence.some(evidence=>evidence.url.includes('pkg/registry/core/pod/')||evidence.url.includes('plugin/pkg/admission/serviceaccount/')));
  }
  assert.throws(()=>productApiReceiverRecords('v1','Pod',['$.spec.unknownNewProducerField']),/EXPANDED_WORKLOAD_RECEIVER_GAP: v1\/Pod/);
  assert.equal(productApiReceiverRecords('apps/v1','Pod',fields).filter(record=>record.kind==='Pod').length,0);
});

test('published computed updates resolve and conditional updates reject qualification',()=> {
 sourceFixture({'bin/new.mjs':"const body={apiVersion:'v1',kind:'ConfigMap',metadata:{name:'new'}};body['immutable']=true;console.log(JSON.stringify(body));"},root=>{
   assert.equal(discoverScriptApiOutputs(root)[0].value.immutable,true);
   const file=path.join(root,'bin/new.mjs');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace("body['immutable']=true","if(process.env.FLAG)body['immutable']=true"));
   assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_SCRIPT_MUTATION_BRANCH_UNQUALIFIED/);
   fs.renameSync(file,path.join(root,'bin/renamed.mjs'));assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_SCRIPT_MUTATION_BRANCH_UNQUALIFIED/);
   fs.rmSync(path.join(root,'bin/renamed.mjs'));assert.deepEqual(discoverScriptApiOutputs(root),[]);
 });
});
test('dynamic serialized API templates and shell transforms fail closed',()=> {
 sourceFixture({'bin/new.mjs':'process.stdout.write(`apiVersion: v1\nkind: ${process.env.KIND}\nmetadata: {name: new}\n`);'},root=>assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_SCRIPT_(?:SERIALIZED_OUTPUT|OUTPUT_ROLE)_UNQUALIFIED/));
 sourceFixture({'bin/new.sh':'kubectl create configmap new --from-literal=a=b --dry-run=client -o yaml | sed s/ConfigMap/Secret/ | kubectl apply -f -\n'},root=>assert.throws(()=>discoverShellApiOutputs(root),/API_PRODUCT_SHELL_(?:PIPELINE|RAW_OUTPUT_ROLE)_UNQUALIFIED/));
});
test('actual Python secret functions retain supported offline conditional witnesses',()=> {
 const outputs=discoverScriptApiOutputs(path.resolve(import.meta.dirname,'../..')).filter(output=>output.context.producer==='python-offline-original');
 assert(outputs.some(output=>output.value.stringData?.token==='synthetic-token'));
 assert(outputs.some(output=>output.value.stringData?.authkey==='synthetic-safe-payload'));
 assert(outputs.some(output=>output.value.type==='kubernetes.io/dockerconfigjson'&&output.value.data['.dockerconfigjson']));
 assert(!outputs.some(output=>output.context.profile==='retained'));
 assert(!outputs.some(output=>output.context.profile==='copy-disabled'&&output.value.metadata.name==='ghcr-secret'));
});

import { discoverTransformedApiOutputs } from '../docs-api-output-discovery.mjs';
test('actual returned continuous transform publishes the selected directory source',()=> {
 const outputs=discoverTransformedApiOutputs(path.resolve(import.meta.dirname,'../..'));
 const app=outputs.find(output=>output.context.profile==='continuous-bootstrap'&&output.value.kind==='Application');assert(app);
 assert.deepEqual(app.value.spec.source,{repoURL:'https://example.invalid/discovery.git',targetRevision:'main',path:'gitops/production/apps',directory:{include:'applications.yaml'}});
 assert.equal(app.context.publicOutput,'gitops/production/bootstrap.yaml');assert(app.context.inputs.includes('scripts/gitops.mjs'));
});
test('refreshing source hashes alone cannot authorize an altered installer invocation',()=> {
 const source='helm upgrade --install cilium cilium/cilium --version 1.20.1 --namespace cilium --values my-values/infra/cilium-values.yaml\n';
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 const record={operationRecipe:producerAdapterOperationRecipe('scripts/deploy-cilium.sh',source),sha256:sha(source),operationDigest:sha(source),operation:'Fixture installer',invocations:[source.trim()]};
 sourceFixture({'scripts/deploy-cilium.sh':source,'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify({version:1,sources:{'scripts/deploy-cilium.sh':record}})},root=>{
 assertProducerAdapterAuthority(root,['scripts/deploy-cilium.sh']);const changed=source.trim()+' --set hubble.relay.enabled=false\n';
 fs.writeFileSync(path.join(root,'scripts/deploy-cilium.sh'),changed);record.sha256=sha(changed);record.operationDigest=sha(changed);
 fs.writeFileSync(path.join(root,'scripts/docs-api-producer-adapter-authorities.json'),JSON.stringify({version:1,sources:{'scripts/deploy-cilium.sh':record}}));
 assert.throws(()=>assertProducerAdapterAuthority(root,['scripts/deploy-cilium.sh']),/API_PRODUCT_ADAPTER_INVOCATION_DRIFT/);
 });
});
test('new unsupported public emitter languages fail qualification rather than vanish',()=> {
 sourceFixture({'packaging/new.rb':"puts 'apiVersion: v1\\nkind: Secret'"},root=>assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_PRODUCER_LANGUAGE_UNQUALIFIED/));
 sourceFixture({'tools/renamed.py':"def output():\n return {'apiVersion':'v1','kind':'Secret'}\n"},root=>assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_PYTHON_(?:PRODUCER|SERIALIZED_OUTPUT_ROLE)_UNQUALIFIED/));
});
test('an authenticated caller rewrite cannot reuse a stale transform positional recipe',()=> {
 const root=path.resolve(import.meta.dirname,'../..');const source=fs.readFileSync(path.join(root,'scripts/deploy.sh'),'utf8');
 sourceFixture({'scripts/deploy.sh':source.replace('"$INFRA_DIR/litellm-config.yaml" "$INFRA_DIR/litellm-deployment.yaml")','"$INFRA_DIR/litellm-other.yaml" "$INFRA_DIR/litellm-deployment.yaml")')},fixture=>{
 assert.throws(()=>discoverTransformedApiOutputs(fixture),/API_PRODUCT_ADAPTED_RECIPE_INVOCATION_DRIFT/);
 });
});
test('original Python producer changes and module environment initialization alter offline emitted Secrets',()=> {
 const root=path.resolve(import.meta.dirname,'../..');const producer=fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8');
 sourceFixture({'ops/pod/bootstrap.py':producer,'scripts/deploy-ops-pod.sh':'python3 ops/pod/bootstrap.py secrets\n'},fixture=>{
 const before=discoverScriptApiOutputs(fixture);assert(before.length);
 fs.writeFileSync(path.join(fixture,'ops/pod/bootstrap.py'),producer.replace("'type': 'Opaque', 'stringData': values", "'type': 'Opaque', 'immutable': True, 'stringData': values").replace("os.environ.get('OPS_NAMESPACE', 'kubeclaw-ops')", "'changed-namespace'"));
 const after=discoverScriptApiOutputs(fixture);assert(after.some(output=>output.value.immutable===true));assert(after.every(output=>output.value.metadata.namespace==='changed-namespace'));assert.notEqual(after[0].context.outputDigest,before[0].context.outputDigest);
 fs.renameSync(path.join(fixture,'ops/pod/bootstrap.py'),path.join(fixture,'ops/pod/renamed.py'));assert.throws(()=>discoverScriptApiOutputs(fixture),/API_PRODUCT_PYTHON_(?:PRODUCER|SERIALIZED_OUTPUT_ROLE)_UNQUALIFIED/);
 fs.rmSync(path.join(fixture,'ops/pod/renamed.py'));assert.deepEqual(discoverScriptApiOutputs(fixture),[]);
 });
});
test('new public bootstrap discovery resource cannot disappear behind credential-only capture',()=>{
 const repository=path.resolve(import.meta.dirname,'../..'),source='ops/pod/bootstrap.py';
 const producer=fs.readFileSync(path.join(repository,source),'utf8');
 const changed=producer.replace(/^def discover\(\):[\s\S]*?(?=^def setup_secrets\(\):)/mu,
  "def discover():\n    return {'apiVersion': 'v1', 'kind': 'Namespace', 'metadata': {'name': 'new-public-output'}}\n\n");
 assert.notEqual(changed,producer);
 sourceFixture({[source]:changed,'scripts/deploy-ops-pod.sh':'python3 ops/pod/bootstrap.py discover\n'},root=>{
  assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_PYTHON_PUBLIC_OUTPUT_FLOW_UNQUALIFIED/);
 });
});
test('original Python transport transformations are discovered and unsupported transports fail closed',()=>{
 const repository=path.resolve(import.meta.dirname,'../..'),source='ops/pod/bootstrap.py',producer=fs.readFileSync(path.join(repository,source),'utf8');
 const transform='if data:\n        payload = json.loads(data)\n        payload["immutable"] = True\n        data = json.dumps(payload)\n    result = subprocess.run(base + args, input=data,';
 sourceFixture({[source]:producer.replace('result = subprocess.run(base + args, input=data,',transform),'scripts/deploy-ops-pod.sh':'python3 ops/pod/bootstrap.py secrets\n'},root=>{
  const outputs=discoverScriptApiOutputs(root);assert(outputs.length);assert(outputs.every(output=>output.value.kind==='Secret'&&output.value.immutable===true));
  fs.writeFileSync(path.join(root,source),producer.replace('subprocess.run(base + args,','subprocess.run(["curl", "https://example.invalid"],'));
  assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_PYTHON_ADAPTER_FAILED/);
 });
});
import { discoverNonApiOutputClassifications } from '../docs-api-output-discovery.mjs';
test('actual local kubeconfig sink is classified without ignoring API-shaped Config submissions',()=> {
 const root=path.resolve(import.meta.dirname,'../..');const classifications=discoverNonApiOutputClassifications(root);
 assert(classifications.some(item=>item.path==='docker/buster-runtime-entrypoint.sh'&&item.classification==='local-kubernetes-client-configuration'));
 sourceFixture({'bin/new.sh':'kubectl apply -f - <<EOF\napiVersion: v1\nkind: Config\nclusters: []\nusers: []\ncontexts: []\ncurrent-context: example\nEOF\n'},fixture=>assert.throws(()=>discoverShellApiOutputs(fixture),/API_PRODUCT_CLIENT_CONFIG_SINK_UNQUALIFIED/));
});
test('terminal emitted JS binding excludes later updates and rejects multiple changed publications',()=> {
 const source="const body={apiVersion:'v1',kind:'ConfigMap',metadata:{name:'new'}};console.log(JSON.stringify(body));body.immutable=true;";
 sourceFixture({'bin/new.mjs':source},root=>{assert.equal(discoverScriptApiOutputs(root)[0].value.immutable,undefined);fs.appendFileSync(path.join(root,'bin/new.mjs'),'console.log(JSON.stringify(body));');assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_SCRIPT_MULTIPLE_OUTPUT_VARIANTS_UNQUALIFIED/);});
});

test('markerless serialized stdout, aliases, files and public returns fail closed',()=>{
 const variants=[
  'process.stdout.write(JSON.stringify(JSON.parse(process.argv[2])));',
  'const bytes=JSON.stringify(JSON.parse(process.argv[2]));process.stdout.write(bytes);',
  "import fs from 'node:fs';fs.writeFileSync('public.json',JSON.stringify(JSON.parse(process.argv[2])));",
  'export function emitted(){return JSON.stringify(JSON.parse(process.argv[2]));}',
 ];
 for(const [index,source]of variants.entries())sourceFixture({[`bin/docs-new-${index}.mjs`]:source},root=>{
  assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_SCRIPT_OUTPUT_ROLE_UNQUALIFIED/);
  const before=path.join(root,`bin/docs-new-${index}.mjs`),after=path.join(root,'bin/renamed.mjs');fs.renameSync(before,after);
  assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_SCRIPT_OUTPUT_ROLE_UNQUALIFIED/);fs.rmSync(after);assert.deepEqual(discoverScriptApiOutputs(root),[]);
 });
 sourceFixture({'bin/diagnostic.mjs':"const value={schemaVersion:'diagnostic.v1',status:process.argv[2]};const bytes=JSON.stringify(value);console.log(bytes);"},root=>assert.deepEqual(discoverScriptApiOutputs(root),[]));
});
test('actual registry Job constructor retains original alias mutations and deletions',()=>{
 const outputs=discoverScriptApiOutputs(path.resolve(import.meta.dirname,'../..'));
 const job=outputs.find(output=>output.context.path==='scripts/render-registry-local.mjs'&&output.value.kind==='Job');assert(job);
 const container=job.value.spec.template.spec.containers[0];assert(!Object.hasOwn(container,'ports'));assert(!Object.hasOwn(container,'readinessProbe'));assert(!Object.hasOwn(container,'livenessProbe'));
 assert.equal(container.args[0],'garbage-collect');assert(container.volumeMounts.length>0);assert(container.resources.requests.cpu);
});
test('terminal identity mutations classify a former diagnostic as an API body',()=>{
 sourceFixture({'bin/body.mjs':"const body={metadata:{name:'changed'}};body['apiVersion']='v1';body.kind='Secret';console.log(JSON.stringify(body));"},root=>{
  const output=discoverScriptApiOutputs(root);assert.equal(output.length,1);assert.equal(output[0].value.kind,'Secret');
  fs.writeFileSync(path.join(root,'bin/body.mjs'),"const body={status:'ok'};body[process.argv[2]]=process.argv[3];console.log(JSON.stringify(body));");
  assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_SCRIPT_OUTPUT_ROLE_UNQUALIFIED/);
 });
});
test('temporary file locations do not authorize unknown serialized API-capable values',()=>{
 sourceFixture({'bin/temporary.mjs':"import fs from 'node:fs';import path from 'node:path';const directory=fs.mkdtempSync('/tmp/discovery-');fs.writeFileSync(path.join(directory,'body.json'),JSON.stringify(JSON.parse(process.argv[2])));"},root=>assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_SCRIPT_OUTPUT_ROLE_UNQUALIFIED/));
});

import { classifySerializedOutputRoles, deriveNativeOperationFacts, nativeOperationFactDigest } from '../docs-api-output-role-classification.mjs';
test('native role operation tuples cannot be authorized by refreshed source hashes',()=>{
 const repository=path.resolve(import.meta.dirname,'../..');const source='scripts/prepare-native-worker-pools.mjs';
 const original=fs.readFileSync(path.join(repository,source),'utf8');const registry=JSON.parse(fs.readFileSync(path.join(repository,'scripts/docs-api-producer-adapter-authorities.json'),'utf8'));
 sourceFixture({[source]:original,'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)},root=>{
  assert(classifySerializedOutputRoles(root,source,[source]).some(role=>role.basis==='validated-fixed-machine-id-file'));
  const changed=original.replace("read('/etc/machine-id')",'JSON.parse(process.argv[2])');fs.writeFileSync(path.join(root,source),changed);
  registry.sources[source]={sha256:createHash('sha256').update(changed).digest('hex'),operationDigest:createHash('sha256').update(changed).digest('hex')};fs.writeFileSync(path.join(root,'scripts/docs-api-producer-adapter-authorities.json'),JSON.stringify(registry));
  assert(classifySerializedOutputRoles(root,source,[source]).some(role=>role.role==='unknown'&&role.expression==='`${machineId}\\n`'));
 });
});
test('qualified canonical serializers still reject unknown actual caller payloads',()=>{
 const repository=path.resolve(import.meta.dirname,'../..');const source=fs.readFileSync(path.join(repository,'skills/nova/core/execution/engine-snapshots.ts'),'utf8');
 const start=source.indexOf('export function canonicalJson('),end=source.indexOf('\n}',start)+2;const canonical=source.slice(start,end);
 sourceFixture({'bin/canonical.ts':canonical+"\nprocess.stdout.write(canonicalJson(JSON.parse(process.argv[2])));"},root=>assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_SCRIPT_OUTPUT_ROLE_UNQUALIFIED/));
});

test('markerless shell submissions and Python or Go serializers cannot disappear',()=>{
 sourceFixture({'bin/new.sh':'kubectl apply -f - <<EOF\n${UNKNOWN_BODY}\nEOF\n'},root=>assert.throws(()=>discoverShellApiOutputs(root),/API_PRODUCT_SHELL_SUBMITTED_OUTPUT_ROLE_UNQUALIFIED/));
 sourceFixture({'bin/new.py':'import json,sys\nprint(json.dumps(json.loads(sys.argv[1])))\n'},root=>{
  assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_PYTHON_SERIALIZED_OUTPUT_ROLE_UNQUALIFIED/);
  fs.writeFileSync(path.join(root,'bin/new.py'),"import json\nprint(json.dumps({'status':'ok'}))\n");assert.deepEqual(discoverScriptApiOutputs(root),[]);
 });
 sourceFixture({'bin/new.go':'package main\nimport("encoding/json";"os")\nfunc main(){var body any;json.NewDecoder(os.Stdin).Decode(&body);json.NewEncoder(os.Stdout).Encode(body)}\n'},root=>assert.throws(()=>discoverGoApiOutputs(root),/API_PRODUCT_GO_(?:SERIALIZED|RAW)_OUTPUT_ROLE_UNQUALIFIED/));
});

test('raw helper-call stdout and file outputs fail closed without serialization markers',()=>{
 for(const body of ["function read(){return process.argv[2]}process.stdout.write(read());", "import fs from 'node:fs';function read(){return process.argv[2]}fs.writeFileSync('public.yaml',read());"])
  sourceFixture({'bin/new.mjs':body},root=>assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_SCRIPT_OUTPUT_ROLE_UNQUALIFIED/));
});

test('public arrow serializer returns retain the markerless unknown-root rejection',()=>{
 sourceFixture({'bin/new.mjs':'export const emitted=()=>JSON.stringify(JSON.parse(process.argv[2]));'},root=>assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_SCRIPT_OUTPUT_ROLE_UNQUALIFIED/));
});
test('installer default values cannot rebind a stale recipe through hash-only refresh',()=>{
 const source='NAMESPACE=${NAMESPACE:-original}\nhelm upgrade --install cilium cilium/cilium --namespace "$NAMESPACE" --version 1.20.1\n';
 const digest=bytes=>createHash('sha256').update(bytes).digest('hex');const record={operation:'Fixture structured installer',sha256:digest(source),operationDigest:digest(source),invocations:[source.trim().split('\n')[1]],operationRecipe:producerAdapterOperationRecipe('scripts/deploy-cilium.sh',source)};
 sourceFixture({'scripts/deploy-cilium.sh':source,'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify({version:1,sources:{'scripts/deploy-cilium.sh':record}})},root=>{
  assertProducerAdapterAuthority(root,['scripts/deploy-cilium.sh']);const changed=source.replace(':-original',':-changed');fs.writeFileSync(path.join(root,'scripts/deploy-cilium.sh'),changed);record.sha256=digest(changed);record.operationDigest=digest(changed);fs.writeFileSync(path.join(root,'scripts/docs-api-producer-adapter-authorities.json'),JSON.stringify({version:1,sources:{'scripts/deploy-cilium.sh':record}}));assert.throws(()=>assertProducerAdapterAuthority(root,['scripts/deploy-cilium.sh']),/API_PRODUCT_ADAPTER_RECIPE_DRIFT/);
 });
});
test('markerless dynamic shell heredoc file bodies fail output-role qualification',()=>{
 sourceFixture({'bin/new.sh':'cat > public.yaml <<EOF\n${UNKNOWN_BODY}\nEOF\n'},root=>assert.throws(()=>discoverShellApiOutputs(root),/API_PRODUCT_SHELL_EMITTED_OUTPUT_ROLE_UNQUALIFIED/));
});
test('a known kind cannot authorize an unknown API-version identity in a new emitter',()=>{
 sourceFixture({'bin/new.mjs':"const body={apiVersion:JSON.parse(process.argv[2]).version,kind:'BusterNamespaceLease',metadata:{name:'unknown'},spec:{}};console.log(JSON.stringify(body));"},root=>assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_SCRIPT_IDENTITY_UNRESOLVED/));
});

test('markerless direct Kubernetes submissions fail without an actual adapted input contract',()=>{
 sourceFixture({'bin/new.mjs':"import{execFileSync}from'node:child_process';execFileSync('kubectl',['apply','-f','-'],{input:JSON.stringify(JSON.parse(process.argv[2]))});"},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));
});

test('markerless dynamic Kubernetes command arguments fail closed',()=>{
 sourceFixture({'bin/new.mjs':"import{execFileSync}from'node:child_process';const args=JSON.parse(process.argv[2]);execFileSync('kubectl',args,{input:process.argv[3]});"},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));
});
test('aliased Kubernetes subprocess imports cannot hide dynamic arguments',()=>{
 sourceFixture({'bin/new.mjs':"import{spawnSync as send}from'node:child_process';send('kubectl',JSON.parse(process.argv[2]));"},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));
});
test('changed native Kubernetes callers cannot reuse original read-only operation recipes',()=>{
 const source='bin/native.mjs',original="import{execFileSync}from'node:child_process';function query(args){return execFileSync('kubectl',args);}query(['get','pods']);";
 const registry={kubernetesCommandContracts:[{source,basis:'actual-get-only-caller',operations:[{source,selectors:[{symbol:'query'},{expression:"query(['get','pods'])"}]}]}]};
 sourceFixture({[source]:original,'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)},root=>{
  assert.doesNotThrow(()=>discoverScriptApiOutputs(root));
  const mutations=[
   original.replace("['get','pods']","['apply','-f','-']"),
   original+"query(['apply','-f','-']);",
   original+"const alias=query;alias(['apply','-f','-']);",
   original.replace("return execFileSync", "args[0]='apply';return execFileSync"),
   original.replace("'kubectl',args", "'kubectl',args,{input:process.argv[2]}"),
   original.replace("query(['get','pods'])", "query(JSON.parse(process.argv[2]))"),
  ];
  for(const changed of mutations){
   fs.writeFileSync(path.join(root,source),changed);
   const refreshed=structuredClone(registry);for(const operation of refreshed.kubernetesCommandContracts[0].operations){operation.selectors=[{symbol:'query'}];const facts=deriveNativeOperationFacts(root,source,operation.selectors);assert(facts,'changed source must have a valid refreshed receipt');operation.factsDigest=nativeOperationFactDigest(facts);}
   fs.writeFileSync(path.join(root,'scripts/docs-api-producer-adapter-authorities.json'),JSON.stringify(refreshed));
   assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/,'changed actual caller or body must fail even after receipt refresh');
  }
 });
});
test('markerless direct Kubernetes HTTP submission cannot vanish',()=>{
 sourceFixture({'bin/new.mjs':"fetch('/api/v1/namespaces',{method:'POST',body:JSON.stringify(JSON.parse(process.argv[2]))});"},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));
});
test('aliased native serializers and markerless Python stdout fail closed',()=>{
 for(const [name,bytes]of Object.entries({'bin/new.py':"import json as j\nprint(j.dumps(j.loads(__import__('sys').argv[1])))\n",'bin/raw.py':"import sys\nprint(sys.argv[1])\n",'bin/new.go':'package main\nimport j "encoding/json"\nimport "os"\nfunc main(){v:=map[string]any{}; j.Unmarshal([]byte(os.Args[1]),&v); b,_:=j.Marshal(v);os.Stdout.Write(b)}\n'}))sourceFixture({[name]:bytes},root=>assert.throws(()=>name.endsWith('.go')?discoverGoApiOutputs(root):discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));
});
test('markerless raw Go stdout cannot silently publish an unknown document',()=>{
 sourceFixture({'bin/new.go':'package main\nimport "os"\nfunc main(){os.Stdout.WriteString(os.Args[1])}\n'},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/));
});
test('local aliases of native stdout sinks retain fail-closed roles',()=>{
 sourceFixture({'bin/new.py':"import sys\nwrite=sys.stdout.write\nwrite(sys.argv[1])\n"},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));
 sourceFixture({'bin/new.go':'package main\nimport "os"\nfunc main(){out:=os.Stdout;out.WriteString(os.Args[1])}\n'},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/));
});
test('Go format-only raw streams and serializer trivia do not authorize unknown outputs',()=>{
 for(const [name,bytes]of Object.entries({'bin/raw.go':'package main\nimport "fmt"\nimport "os"\nfunc main(){fmt.Printf("%s",os.Args[1])}\n','bin/encoder.go':'package main\nimport j "encoding/json"\nimport "os"\nfunc main(){j.NewEncoder /* trivia */ (os.Stdout).Encode(os.Args[1])}\n'}))sourceFixture({[name]:bytes},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/));
});
test('markerless Go files and dot-import format outputs fail closed',()=>{
 for(const [name,bytes]of Object.entries({'bin/file.go':'package main\nimport "os"\nfunc main(){os.WriteFile("public.yaml",[]byte(os.Args[1]),0600)}\n','bin/dot.go':'package main\nimport . "fmt"\nimport "os"\nfunc main(){Printf("%s",os.Args[1])}\n'}))sourceFixture({[name]:bytes},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/));
});
test('markerless raw shell stdout, files, branches and literal API streams fail closed',()=>{
 for(const bytes of ["printf '%s' \"$BODY\"\n","echo \"$BODY\" > public.yaml\n","if true;then printf '%s\\n' \"$BODY\";fi\n","cat public.yaml\n","printf '%s' '{\"apiVersion\":\"v1\",\"kind\":\"Secret\",\"metadata\":{\"name\":\"x\"}}'\n"])sourceFixture({'bin/new.sh':bytes},root=>assert.throws(()=>discoverShellApiOutputs(root),/SHELL_RAW_OUTPUT_ROLE_UNQUALIFIED/));
 sourceFixture({'bin/new.sh':"BODY='{\"status\":\"ok\"}';printf '%s' \"$BODY\"\n"},root=>assert.doesNotThrow(()=>discoverShellApiOutputs(root)));
});
test('shell arithmetic is not an output command, while nested command substitutions remain visible',()=>{
 const source='bin/arithmetic.sh';
 const counters='counter=$((counter + 1))\nblocks=$(( maximum_bytes / 1024 ))\nversion=$(( 10#${BASH_REMATCH[1]} * 10000 + 10#${BASH_REMATCH[2]} ))\n';
 assert.deepEqual(shellRawOutputSinks(source,counters),[]);
 const nested=shellRawOutputSinks(source,'age=$(( $(date +%s) - $(metadata "$selected" started_epoch) ))\n');
 assert(nested.some(s=>s.command==='date'&&s.args[0]==='+%s'));
 assert(nested.some(s=>s.command==='metadata'&&s.args.includes('started_epoch')));
 assert(!nested.some(s=>s.command.startsWith('$(date')));
});
test('fresh shell receipts cannot hide unknown or Kubernetes emitters inside arithmetic',()=>{
 const source='bin/arithmetic.sh';
 for(const bytes of ['value=$(( $("$reader" "$1") + 1 ))\n',`value=$(( $(printf '%s' '{"apiVersion":"v1","kind":"Secret"}') + 1 ))\n`]){
  const sinks=shellRawOutputSinks(source,bytes);
  assert(sinks.some(s=>s.command==='$reader'||s.args.some(a=>a.includes('apiVersion'))));
  const contract={source,role:'non-api',basis:'refreshed arithmetic fixture',sinks,operationRecipe:shellRawOutputOperationRecipe(source,bytes),sinkConsumers:sinks.map(s=>({source,line:s.line,command:s.command,channel:s.channel??'command-output',argumentsDigest:createHash('sha256').update(JSON.stringify(s.args)).digest('hex'),kind:'native-tool-or-selected-stream',purpose:'refreshed arithmetic consumer',sourceEvidence:bytes}))};
  sourceFixture({[source]:bytes,'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify({shellRawOutputContracts:[contract]})},root=>assert.throws(()=>discoverShellApiOutputs(root),/SHELL_CONSUMER_UNQUALIFIED/));
 }
});
test('changing an original shell sink cannot reuse its source operation recipe',()=>{
 const source='bin/native.sh',bytes="git status --short | awk '{ print; count += 1; if (count >= 30) exit }'\n";
 const sinks=shellRawOutputSinks(source,bytes),registry={shellRawOutputContracts:[{source,role:'non-api',basis:'fixture native consumer',sinks,operationRecipe:shellRawOutputOperationRecipe(source,bytes),sinkConsumers:sinks.map(sink=>({source,line:sink.line,command:sink.command,argumentsDigest:createHash('sha256').update(JSON.stringify(sink.args)).digest('hex'),kind:'fixed-native-text-transform',purpose:'Finite native git-status row query',sourceEvidence:bytes}))}]};
 sourceFixture({[source]:bytes,'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)},root=>{
  assert.doesNotThrow(()=>discoverShellApiOutputs(root));fs.writeFileSync(path.join(root,source),bytes.replace('count >= 30','count >= 20'));assert.throws(()=>discoverShellApiOutputs(root),/SHELL_RAW_OUTPUT_ROLE_UNQUALIFIED/);
 });
});
test('refreshed shell sink metadata cannot replace the selected consumer or forward unbound stdin',()=>{
 const repository=path.resolve(import.meta.dirname,'../..'),authority='scripts/docs-api-producer-adapter-authorities.json';
 const selected=JSON.parse(fs.readFileSync(path.join(repository,authority),'utf8')).shellRawOutputContracts[0];
 for(const bytes of ['#!/bin/sh\ntee /dev/null\n','#!/bin/sh\ncat\n','#!/bin/sh\nsed -n p\n'])for(const replaceEvidence of [false,true]) {
  const contract=structuredClone(selected),source=contract.source;
  contract.sinks=shellRawOutputSinks(source,bytes);contract.operationRecipe=shellRawOutputOperationRecipe(source,bytes);
  contract.sinkConsumers=contract.sinks.map(sink=>({...selected.sinkConsumers[0],source,line:sink.line,command:sink.command,channel:sink.channel??'command-output',argumentsDigest:createHash('sha256').update(JSON.stringify(sink.args)).digest('hex'),...(replaceEvidence?{kind:'native-tool-or-selected-stream',sourceEvidence:bytes}:{})}));
  sourceFixture({[source]:bytes,[authority]:JSON.stringify({shellRawOutputContracts:[contract]})},root=>assert.throws(()=>discoverShellApiOutputs(root),/SHELL_CONSUMER_UNQUALIFIED/));
 }
});
test('actual refreshed shell consumers reject caller files and captured stdin publication chains',()=>{
 const repository=path.resolve(import.meta.dirname,'../..'),authority='scripts/docs-api-producer-adapter-authorities.json';
 const selected=JSON.parse(fs.readFileSync(path.join(repository,authority),'utf8')).shellRawOutputContracts[0];
 const input='apiVersion: v1\nkind: ConfigMap\nmetadata: {name: hidden}\n';
 for(const body of ['cat "$1"','value=$(cat); printf "%s\\n" "$value"','first=$(cat); second=$first; printf "%s\\n" "$second"','cat | tee /dev/null']){
  const bytes='#!/bin/sh\n'+body+'\n',contract=structuredClone(selected),source=contract.source;
  contract.sinks=shellRawOutputSinks(source,bytes);contract.operationRecipe=shellRawOutputOperationRecipe(source,bytes);
  contract.sinkConsumers=contract.sinks.map(sink=>({source,line:sink.line,command:sink.command,channel:sink.channel??'command-output',argumentsDigest:createHash('sha256').update(JSON.stringify(sink.args)).digest('hex'),kind:sink.channel==='command-substitution'?'captured-operation':['echo','printf'].includes(sink.command)?'framed-or-native-scalar-output':'native-tool-or-selected-stream',purpose:'actual refreshed source consumer',sourceEvidence:bytes}));
  sourceFixture({[source]:bytes,'input.yaml':input,[authority]:JSON.stringify({shellRawOutputContracts:[contract]})},root=>{
   assert.throws(()=>discoverShellApiOutputs(root),/SHELL_CONSUMER_UNQUALIFIED/,body);
   const actual=spawnSync('sh',[path.join(root,source),path.join(root,'input.yaml')],{input,encoding:'utf8',timeout:5000});assert.equal(actual.status,0,actual.stderr);assert.equal(actual.stdout,input,body);
  });
 }
});

test('refreshed named shell files require selected producer ancestry for every consumer',()=>{
 const source='bin/named-output.sh',authority='scripts/docs-api-producer-adapter-authorities.json';
 for(const body of ['cat /tmp/native-config.json','declared=/tmp/native-config.json; cat "$declared"','sed -n p /tmp/native-config.json','jq -r . "$1"']){
  const bytes='#!/bin/sh\n'+body+'\n',sinks=shellRawOutputSinks(source,bytes),contract={source,role:'non-api',basis:'refreshed named file role',sinks,operationRecipe:shellRawOutputOperationRecipe(source,bytes),sinkConsumers:sinks.map(sink=>({source,line:sink.line,command:sink.command,channel:sink.channel??'command-output',argumentsDigest:createHash('sha256').update(JSON.stringify(sink.args)).digest('hex'),kind:'native-tool-or-selected-stream',purpose:'refreshed named file consumer',sourceEvidence:bytes}))};
  sourceFixture({[source]:bytes,[authority]:JSON.stringify({shellRawOutputContracts:[contract]})},root=>assert.throws(()=>discoverShellApiOutputs(root),/SHELL_CONSUMER_UNQUALIFIED|SHELL_RAW_OUTPUT_ROLE_UNQUALIFIED/,body));
 }
});

test('actual selected Trivy report format and auth token consumers cannot inherit refreshed file receipts',()=>{
 const repository=path.resolve(import.meta.dirname,'../..'),authority='scripts/docs-api-producer-adapter-authorities.json',registry=JSON.parse(fs.readFileSync(path.join(repository,authority),'utf8'));
 const qualified=(source,bytes)=>{const contract=structuredClone(registry.shellRawOutputContracts.find(contract=>contract.source===source));assert(contract);contract.sinks=shellRawOutputSinks(source,bytes);contract.operationRecipe=shellRawOutputOperationRecipe(source,bytes);contract.sinkConsumers=contract.sinks.map(sink=>({source,line:sink.line,command:sink.command,channel:sink.channel??'command-output',argumentsDigest:createHash('sha256').update(JSON.stringify(sink.args)).digest('hex'),kind:sink.channel==='command-substitution'?'captured-operation':['echo','printf'].includes(sink.command)?'framed-or-native-scalar-output':'native-tool-or-selected-stream',purpose:'actual selected refreshed named file consumer',sourceEvidence:bytes}));return {[source]:bytes,[authority]:JSON.stringify({shellRawOutputContracts:[contract]})};};
 const reportSource='scripts/scan-runtime-images.sh',reportBytes=fs.readFileSync(path.join(repository,reportSource),'utf8');
 sourceFixture(qualified(reportSource,reportBytes),root=>assert.deepEqual(discoverShellApiOutputs(root),[]));
 for(const changed of [reportBytes.replace('--format table','--format json'),reportBytes.replace('  cat "$report"','  printf "%s\\n" "$replacement" >"$report"\n  cat "$report"')]){assert.notEqual(changed,reportBytes);sourceFixture(qualified(reportSource,changed),root=>assert.throws(()=>discoverShellApiOutputs(root),/SHELL_CONSUMER_UNQUALIFIED|SHELL_RAW_OUTPUT_ROLE_UNQUALIFIED/));}
 const tokenSource='ops/pod/shell.sh',tokenBytes=fs.readFileSync(path.join(repository,tokenSource),'utf8'),tokenDependencies=Object.fromEntries(['ops/pod/bootstrap.py','charts/ops-pod/templates/workload.yaml'].map(source=>[source,fs.readFileSync(path.join(repository,source),'utf8')]));
 sourceFixture({...qualified(tokenSource,tokenBytes),...tokenDependencies},root=>assert.deepEqual(discoverShellApiOutputs(root),[]));
 const published=tokenBytes.replace('export KUBECLAW_MCP_TOKEN','printf "%s\\n" "$KUBECLAW_MCP_TOKEN"\nexport KUBECLAW_MCP_TOKEN');assert.notEqual(published,tokenBytes);sourceFixture({...qualified(tokenSource,published),...tokenDependencies},root=>assert.throws(()=>discoverShellApiOutputs(root),/SHELL_CONSUMER_UNQUALIFIED|SHELL_RAW_OUTPUT_ROLE_UNQUALIFIED/));
});

test('actual selected native config producer changes revoke named file consumer custody',()=>{
 const repository=path.resolve(import.meta.dirname,'../..'),source='scripts/activate-native-worker-ax41.sh',producer='scripts/render-native-worker-node.mjs',authority='scripts/docs-api-producer-adapter-authorities.json',registry=JSON.parse(fs.readFileSync(path.join(repository,authority),'utf8'));
 const bytes=fs.readFileSync(path.join(repository,source),'utf8'),contract=structuredClone(registry.shellRawOutputContracts.find(contract=>contract.source===source));assert(contract);contract.sinks=shellRawOutputSinks(source,bytes);contract.operationRecipe=shellRawOutputOperationRecipe(source,bytes);contract.sinkConsumers=contract.sinks.map(sink=>({source,line:sink.line,command:sink.command,channel:sink.channel??'command-output',argumentsDigest:createHash('sha256').update(JSON.stringify(sink.args)).digest('hex'),kind:sink.channel==='command-substitution'?'captured-operation':['echo','printf'].includes(sink.command)?'framed-or-native-scalar-output':'native-tool-or-selected-stream',purpose:'actual selected native config consumer',sourceEvidence:bytes}));
 const dependencies=Object.fromEntries([producer,'scripts/native-worker-node-policy.mjs','versions.json','my-values/infra/native-worker-pools-ax41.yaml'].map(file=>[file,fs.readFileSync(path.join(repository,file),'utf8')]));
 const selectedRegistry={version:1,sources:Object.fromEntries([source,producer].map(file=>[file,structuredClone(registry.sources[file])])),shellRawOutputContracts:[contract]};
 sourceFixture({...dependencies,[source]:bytes,[authority]:JSON.stringify(selectedRegistry)},root=>{
  assert.deepEqual(discoverShellApiOutputs(root),[]);
  const changed=dependencies[producer].replace("'containerd-nri.toml': '[plugins.\"io.containerd.nri.v1.nri\"]\\n  disable = false\\n'","'containerd-nri.toml': 'apiVersion: v1\\nkind: Secret\\nmetadata: {name: hidden}\\n'");assert.notEqual(changed,dependencies[producer]);fs.writeFileSync(path.join(root,producer),changed);
  const refreshed=structuredClone(selectedRegistry),record=refreshed.sources[producer];record.sha256=record.operationDigest=createHash('sha256').update(changed).digest('hex');record.operationRecipe=producerAdapterOperationRecipe(producer,changed);record.invocations=changed.replace(/\\\n/gu,' ').split('\n').map(line=>line.trim()).filter(line=>['helm ',"'helm'",'render-','continuousDocuments','bootstrapDocuments','infrastructure','charts/'].some(token=>line.includes(token))&&!line.startsWith('//')&&!line.startsWith('#'));fs.writeFileSync(path.join(root,authority),JSON.stringify(refreshed));
  assert.throws(()=>discoverShellApiOutputs(root),/SHELL_CONSUMER_UNQUALIFIED|SHELL_RAW_OUTPUT_ROLE_UNQUALIFIED/,'actual selected producer bytes must revoke cached native file custody');
 });
});

test('actual authenticated ops render file forwards API fields and changed producer output',()=>{
 const repository=path.resolve(import.meta.dirname,'../..'),source='scripts/deploy-ops-pod.sh',producer='scripts/updates/deployment-release.mjs',authority='scripts/docs-api-producer-adapter-authorities.json',registry=JSON.parse(fs.readFileSync(path.join(repository,authority),'utf8'));
 const files={},copy=directory=>{for(const entry of fs.readdirSync(path.join(repository,directory),{withFileTypes:true})){const file=directory+'/'+entry.name;if(entry.isDirectory())copy(file);else if(entry.isFile())files[file]=fs.readFileSync(path.join(repository,file),'utf8');}};copy('scripts/updates');copy('charts/ops-pod');copy('ops/pod');copy('tools/ops-mcp/src');for(const file of [source,'releases/ops-images.json','releases/values/ops.yaml'])files[file]=fs.readFileSync(path.join(repository,file),'utf8');
 const selected={version:1,sources:structuredClone(registry.sources),shellRawOutputContracts:registry.shellRawOutputContracts.filter(contract=>contract.source===source||contract.source.startsWith('ops/pod/')),nativeLanguageSerializationContracts:registry.nativeLanguageSerializationContracts.filter(contract=>contract.source.startsWith('ops/pod/'))};
 sourceFixture({...files,[authority]:JSON.stringify(selected)},root=>{
  fs.symlinkSync(path.join(repository,'node_modules'),path.join(root,'node_modules'),'dir');execFileSync('git',['init','--quiet',root]);const common=execFileSync('git',['rev-parse','--git-common-dir'],{cwd:repository,encoding:'utf8'}).trim();fs.writeFileSync(path.join(root,'.git/objects/info/alternates'),path.resolve(repository,common,'objects')+'\n');
  const before=discoverShellApiOutputs(root),forwarded=before.filter(output=>output.context.forwardedProducer?.path===producer);assert(forwarded.length,'actual ops rendered.yaml API file was treated as native instead of forwarding selected producer');assert(forwarded.some(output=>output.value.kind==='StatefulSet'&&output.value.spec.template.spec.containers.some(container=>container.name==='codex')));
  const original=files[producer],changed=original.replace('process.stdout.write(rendered);',"process.stdout.write(rendered+'\\n---\\napiVersion: v1\\nkind: ConfigMap\\nmetadata: {name: selected-extra}\\ndata: {reviewerAdded: selected}\\n');");assert.notEqual(changed,original);fs.writeFileSync(path.join(root,producer),changed);
  const refreshed=structuredClone(selected),record=refreshed.sources[producer];if(record){record.sha256=record.operationDigest=createHash('sha256').update(changed).digest('hex');record.operationRecipe=producerAdapterOperationRecipe(producer,changed);record.invocations=changed.replace(/\\\n/gu,' ').split('\n').map(line=>line.trim()).filter(line=>['helm ',"'helm'",'render-','continuousDocuments','bootstrapDocuments','infrastructure','charts/'].some(token=>line.includes(token))&&!line.startsWith('//')&&!line.startsWith('#'));}fs.writeFileSync(path.join(root,authority),JSON.stringify(refreshed));
  try{const after=discoverShellApiOutputs(root);assert(after.some(output=>output.context.forwardedProducer?.path===producer&&output.value.kind==='ConfigMap'&&output.value.data?.reviewerAdded==='selected'),'changed selected producer field disappeared after executable receipt refresh');}
  catch(error){assert.match(error.message,/API_PRODUCT_(?:SHELL_(?:CONSUMER|RAW_OUTPUT_ROLE)_UNQUALIFIED|ADAPTED_RECIPE_INVOCATION_DRIFT|ADAPTER_|RELEASE_)/);}
 });
});

test('selected native tee producers and imported factories revoke shell cache after semantic changes',()=>{
 const source='bin/native-check.sh',producer='tests/verification/e2e/native-check.mts',factory='tests/verification/e2e/receipt.mjs',authority='scripts/docs-api-producer-adapter-authorities.json';
 const bytes='kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- node "$runtime_repo_root/'+producer+'" | tee "$receipt_tmp"\n';
 const sinks=shellRawOutputSinks(source,bytes),contract={source,role:'non-api',basis:'selected native producer pipeline',sinks,operationRecipe:shellRawOutputOperationRecipe(source,bytes),sinkConsumers:sinks.map(sink=>({source,line:sink.line,command:sink.command,argumentsDigest:createHash('sha256').update(JSON.stringify(sink.args)).digest('hex'),kind:'native-tool-or-selected-stream',purpose:'selected native receipt producer',sourceEvidence:bytes,channel:sink.channel??'command-output'}))};
 for(const imported of [false,true])sourceFixture({[source]:bytes,[producer]:imported?"import {createRecord} from './receipt.mjs';process.stdout.write(JSON.stringify(createRecord()));":"process.stdout.write(JSON.stringify({schemaVersion:'native-check.v1',ok:true}));",[factory]:"export function createRecord(){return {schemaVersion:'native-check.v1',ok:true};}",[authority]:JSON.stringify({shellRawOutputContracts:[contract]})},root=>{
  assert.deepEqual(discoverShellApiOutputs(root),[]);
  if(imported)fs.writeFileSync(path.join(root,factory),"export function createRecord(){return {apiVersion:'v1',kind:'Secret',metadata:{name:'hidden'}};}");
  else fs.writeFileSync(path.join(root,producer),"process.stdout.write(JSON.stringify({apiVersion:'v1',kind:'Secret',metadata:{name:'hidden'}}));");
  assert.throws(()=>discoverShellApiOutputs(root),/SHELL_CONSUMER_UNQUALIFIED|SHELL_RAW_OUTPUT_ROLE_UNQUALIFIED/,'changed selected producer must invalidate cached native stream');
 });
 sourceFixture({[source]:bytes,[producer]:"const emit=process.stdout.write;const writers=[emit];writers[0](JSON.stringify({schemaVersion:'native-check.v1',ok:true}));",[authority]:JSON.stringify({shellRawOutputContracts:[contract]})},root=>assert.throws(()=>discoverShellApiOutputs(root),/SHELL_CONSUMER_UNQUALIFIED|SHELL_RAW_OUTPUT_ROLE_UNQUALIFIED/));
});

test('markerless serialized roots in an unsupported public language fail qualification',()=>{
 sourceFixture({'bin/new.rb':'require "json"\nputs JSON.generate(JSON.parse(ARGV[0]))\n'},root=>assert.throws(()=>discoverScriptApiOutputs(root),/PRODUCER_LANGUAGE_UNQUALIFIED/));
});
test('markerless root mutations retain identity through aliases and unsupported escapes',()=>{
 const prefix="let root={status:'ok'};const alias=root;const third=alias;";
 for(const operation of ["alias[process.argv[2]]=process.argv[3];","third[process.argv[2]]=process.argv[3];","delete third[process.argv[2]];","third.status+=process.argv[2];","root=JSON.parse(process.argv[2]);","Object.assign(third,JSON.parse(process.argv[2]));","Reflect.set(third,process.argv[2],process.argv[3]);","mutate(third);"]){sourceFixture({'bin/new.mjs':prefix+operation+"console.log(JSON.stringify(root));"},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));}
 sourceFixture({'bin/new.mjs':"let root={status:'ok'};console.log(JSON.stringify(root));root[process.argv[2]]=process.argv[3];"},root=>assert.doesNotThrow(()=>discoverScriptApiOutputs(root)));
});
test('static JavaScript stdout and file aliases retain unknown-root qualification',()=>{
 for(const bytes of ["import {writeFileSync as write} from 'node:fs';write('public.yaml',JSON.stringify(JSON.parse(process.argv[2])));","import f from 'node:fs/promises';await f.writeFile('public.yaml',process.argv[2]);","const emit=console.log;emit(JSON.stringify(JSON.parse(process.argv[2])));","const out=process.stdout;const emit=out.write;emit(process.argv[2]);","import fs from 'node:fs';const out=fs.createWriteStream('public.yaml');out.write(process.argv[2]);"]){sourceFixture({'bin/new.mjs':bytes},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));}
});
test('static types and aliased native writer capabilities do not authorize unknown emitted roots',()=>{
 for(const bytes of ["const body:string=JSON.parse(process.argv[2]);console.log(JSON.stringify(body));","interface Root{status:string};export function emit(body:Root){console.log(JSON.stringify(body));}","function relay(body:unknown):{status:string}{return body as {status:string}};console.log(JSON.stringify(relay(JSON.parse(process.argv[2]))));","const {writeFileSync:save}=require('fs');save('public.yaml',process.argv[2]);","import fs from 'node:fs';const save=fs.writeFileSync.bind(fs,'public.yaml');save(process.argv[2]);"]){sourceFixture({'bin/new.ts':bytes},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED|OUTPUT_IDENTITY_UNQUALIFIED/));}
});
test('literal API text forwarded through an original function is discovered',()=>{sourceFixture({'bin/new.ts':"function emit(body:string){console.log(body)};emit('apiVersion: v1\\nkind: Secret\\nmetadata: {name: x}');"},root=>assert(discoverScriptApiOutputs(root).some(output=>output.value.apiVersion==='v1'&&output.value.kind==='Secret'&&output.value.metadata.name==='x')));});
test('native file utility aliases and bound calls retain unknown input rejection',()=>{
 const source='scripts/native-store.mjs',bytes="import fs from'node:fs';export function store(file,value){fs.writeFileSync(file,JSON.stringify(value));}";
 const operations=[{source,selectors:[{expression:'JSON.stringify(value)'}]}],registry={nonApiOutputContracts:[{source,sink:'fs.writeFileSync',expression:'JSON.stringify(value)',role:'api-capable-utility',basis:'fixture generic native file capability',operations}],nativeFileWriterCapabilities:[{source,export:'store',inputParameter:'value',operations}]};
 for(const call of ["const save=store;const third=save;third('public.yaml',JSON.parse(process.argv[2]));","const save=store.bind(null,'public.yaml');save(JSON.parse(process.argv[2]));","store.call(null,'public.yaml',JSON.parse(process.argv[2]));","store.apply(null,['public.yaml',JSON.parse(process.argv[2])]);"]){sourceFixture({[source]:bytes,'bin/new.mjs':"import{store}from'../scripts/native-store.mjs';"+call,'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));}
});
test('reassigned stdout and file writer aliases reject unsupported publication operations',()=>{
 for(const bytes of ["let emit=()=>{};emit=console.log;emit(JSON.parse(process.argv[2]));","import fs from'node:fs';let write=fs.writeFileSync;write=process.argv[2];write('public.yaml',{status:'ok'});","let write;write=require('fs').writeFileSync;write('public.yaml',process.argv[2]);"]){sourceFixture({'bin/new.mjs':bytes},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));}
});
test('unsupported writer prototype calls, containers and callback escapes cannot hide output',()=>{
 for(const bytes of ["import fs from'node:fs';fs.writeFileSync.call(null,'public.yaml',process.argv[2]);","console.log.apply(null,[JSON.parse(process.argv[2])]);","import fs from'node:fs';const box={save:fs.writeFileSync};box.save('public.yaml',process.argv[2]);","invoke(console.log,JSON.parse(process.argv[2]));"]){sourceFixture({'bin/new.mjs':bytes},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));}
});
test('workspace package wildcard exports retain native writer input qualification',()=>{
 const source='node_modules/@kubeclaw/fixture/native-store.mjs',bytes="import fs from'node:fs';export function store(file,value){fs.writeFileSync(file,JSON.stringify(value));}",operations=[{source,selectors:[{expression:'JSON.stringify(value)'}]}];
 const registry={nonApiOutputContracts:[{source,sink:'fs.writeFileSync',expression:'JSON.stringify(value)',role:'api-capable-utility',basis:'fixture generic native file capability',operations}],nativeFileWriterCapabilities:[{source,export:'store',inputParameter:'value',operations}]};
 sourceFixture({[source]:bytes,'node_modules/@kubeclaw/fixture/package.json':JSON.stringify({name:'@kubeclaw/fixture',exports:{'./*':'./*.mjs'}}),'bin/new.mjs':"import{store}from'@kubeclaw/fixture/native-store';store('public.yaml',JSON.parse(process.argv[2]));",'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));
});
test('diamond reexports and repeated writer calls keep independent input qualification',()=>{
 const source='scripts/native-store.mjs',bytes="import fs from'node:fs';export function store(file,value){fs.writeFileSync(file,JSON.stringify(value));}",operations=[{source,selectors:[{expression:'JSON.stringify(value)'}]}],registry={nonApiOutputContracts:[{source,sink:'fs.writeFileSync',expression:'JSON.stringify(value)',role:'api-capable-utility',basis:'fixture generic native file capability',operations}],nativeFileWriterCapabilities:[{source,export:'store',inputParameter:'value',operations}]};
 const fixtures={[source]:bytes,'scripts/left.mjs':"export{store}from'./native-store.mjs';",'scripts/right.mjs':"export{store}from'./native-store.mjs';",'scripts/diamond.mjs':"export*from'./left.mjs';export*from'./right.mjs';",'bin/new.mjs':"import{store}from'../scripts/diamond.mjs';store('native.json',{status:'ok'});store('public.yaml',JSON.parse(process.argv[2]));",'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)};
 sourceFixture(fixtures,root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));
 sourceFixture({...fixtures,'bin/new.mjs':"import{store}from'../scripts/diamond.mjs';store('first.json',{status:'ok'});store('second.json',{status:'ok'});"},root=>assert.doesNotThrow(()=>discoverScriptApiOutputs(root)));
});
test('alternate public diagnostic channels retain unknown serialized root qualification',()=>{
 for(const bytes of ["process.stderr.write(JSON.stringify(JSON.parse(process.argv[2])));","console.error(JSON.stringify(JSON.parse(process.argv[2])));","console.warn(JSON.stringify(JSON.parse(process.argv[2])));","console.info(JSON.stringify(JSON.parse(process.argv[2])));","const out=process.stderr;const emit=out.write;emit(process.argv[2]);"]){sourceFixture({'bin/new.mjs':bytes},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));}
 sourceFixture({'bin/new.py':"import sys,json\nsys.stderr.write(json.dumps(json.loads(sys.argv[1])))\n"},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));
 sourceFixture({'bin/new.go':'package main\nimport "os"\nimport "fmt"\nfunc main(){fmt.Fprintf(os.Stderr,"%s",os.Args[1])}\n'},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/));
});
test('Go formatted file destinations retain unknown serialized input qualification',()=>{
 for(const bytes of ['package main\nimport "os"\nimport "fmt"\nfunc main(){file,_:=os.Create("public.yaml");fmt.Fprintf(file,"%s",os.Args[1])}\n','package main\nimport "os"\nimport "fmt"\nfunc main(){file,_:=os.Create("public.yaml");out:=file;fmt.Fprintln(out,os.Args[1])}\n'])sourceFixture({'bin/new.go':bytes},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/));
});
test('original Go diagnostic consumer qualification rejects changed writer inputs',()=>{
 const source='tools/native-worker-nri/main.go',bytes=fs.readFileSync(new URL('../..//'+source,import.meta.url),'utf8'),authority=JSON.parse(fs.readFileSync(new URL('../docs-api-producer-adapter-authorities.json',import.meta.url),'utf8')),registry={nativeLanguageSerializationContracts:authority.nativeLanguageSerializationContracts.filter(record=>record.source===source)};
 const files=Object.fromEntries([...new Set(registry.nativeLanguageSerializationContracts.flatMap(record=>record.outputs.flatMap(output=>output.dependencyFacts?.map(fact=>fact.path)??[])))].map(file=>[file,fs.readFileSync(new URL('../..//'+file,import.meta.url),'utf8')]));
 sourceFixture({...files,[source]:bytes,'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)},root=>{
  // Original external lifecycle error authority is unsupported. Keep its
  // truthful rejection separate from the independently tested writer control.
  assert.throws(()=>discoverGoApiOutputs(root),/main.go:164:.*unsupported external error-result authority for run/);
  function classify(){const run=spawnSync(process.env.KUBECLAW_DOCS_GO_BINARY??'go',['run',new URL('../docs-api-go-output-role-adapter.go',import.meta.url).pathname],{input:JSON.stringify([{path:path.join(root,source)}]),encoding:'utf8'});assert.equal(run.status,0,run.stderr);return JSON.parse(run.stdout);}
  const original=classify(),guarded=original.find(record=>record.line===164&&record.expression==='fmt.Fprintln(os.Stderr, err)');
  assert(guarded);assert.equal(guarded.diagnosticQualified,true);assert.equal(guarded.authorityQualified,false);
  assert(original.some(record=>record.authorityQualified&&record.diagnosticQualified),'supported configuration diagnostic guard must remain independently qualified');
  const changed=bytes.replace('fmt.Fprintln(os.Stderr, err)','fmt.Fprintf(os.Stderr,"%s",os.Args[1])');assert.notEqual(changed,bytes);fs.writeFileSync(path.join(root,source),changed);
  const modified=classify().filter(record=>record.expression==='fmt.Fprintf(os.Stderr, "%s", os.Args[1])');assert(modified.length);
  assert(modified.every(record=>record.diagnosticQualified!==true&&record.role==='unknown'),'argv replacement must not inherit error-guard qualification');
  assert(modified.some(record=>record.operation!==guarded.operation),'changed writer input must alter the selected operation');
  assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED:.*main.go/);
 });
});
test('Go output values bind lexical declarations and reject mutation or address escape',()=>{
 for(const body of ['func first(){body:=os.Args[1];fmt.Fprintln(os.Stdout,body)}\nfunc other(){body:="safe";_=body}','func main(){body:=os.Args[1];{body:="safe";_=body};fmt.Fprintln(os.Stdout,body)}','func main(){body:=os.Args[1];fmt.Fprintln(os.Stdout,body);body="safe"}','func alter(body *string){*body=os.Args[1]}\nfunc main(){body:="safe";alter(&body);fmt.Fprintln(os.Stdout,body)}'])sourceFixture({'bin/new.go':'package main\nimport "os"\nimport "fmt"\n'+body+'\n'},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/));
 sourceFixture({'bin/new.go':'package main\nimport "os"\nimport "fmt"\nfunc main(){body:="safe";fmt.Fprintln(os.Stdout,body)}\n'},root=>assert.doesNotThrow(()=>discoverGoApiOutputs(root)));
});
test('Go mutable writer aliases, callbacks and containers reject unsupported escapes',()=>{
 for(const body of ['func other(...interface{})(int,error){return 0,nil}\nfunc main(){emit:=fmt.Println;emit=other;emit(os.Args[1])}','func relay(emit func(...interface{})(int,error),body string){emit(body)}\nfunc main(){relay(fmt.Println,os.Args[1])}','func main(){box:=struct{emit func(...interface{})(int,error)}{fmt.Println};box.emit(os.Args[1])}'])sourceFixture({'bin/new.go':'package main\nimport "os"\nimport "fmt"\n'+body+'\n'},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/));
});
test('Go mutable serializer aliases and callback escapes remain unqualified',()=>{
 for(const body of ['func other(any)([]byte,error){return nil,nil}\nfunc main(){emit:=json.Marshal;emit=other;emit(os.Args[1])}','func relay(emit func(any)([]byte,error),body string){emit(body)}\nfunc main(){relay(json.Marshal,os.Args[1])}','func main(){box:=struct{emit func(any)([]byte,error)}{json.Marshal};box.emit(os.Args[1])}'])sourceFixture({'bin/new.go':'package main\nimport "os"\nimport "encoding/json"\n'+body+'\n'},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/));
});
test('Go capability references close dot-import, returned, late-bound and parenthesized calls',()=>{
 const cases=['import . "fmt"\nfunc other(...interface{})(int,error){return 0,nil}\nfunc main(){emit:=Println;emit=other;emit(os.Args[1])}','import "fmt"\nfunc printer()func(...interface{})(int,error){return fmt.Println}\nfunc main(){printer()(os.Args[1])}','import "fmt"\nfunc main(){(fmt.Println)(os.Args[1])}','import "fmt"\nfunc other(...interface{})(int,error){return 0,nil}\nfunc main(){emit:=other;emit=fmt.Println;emit(os.Args[1])}','import "fmt"\nfunc main(){emit:=fmt.Println;ptr:=&emit;(*ptr)(os.Args[1])}','import "fmt"\nfunc main(){ch:=make(chan func(...interface{})(int,error),1);ch<-fmt.Println;emit:=<-ch;emit(os.Args[1])}'];
 for(const body of cases)sourceFixture({'bin/new.go':'package main\nimport "os"\n'+body+'\n'},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/));
 sourceFixture({'bin/new.go':'package main\nimport "fmt"\nfunc main(){emit:=(fmt.Println);emit("safe")}\n'},root=>assert.doesNotThrow(()=>discoverGoApiOutputs(root)));
});
test('Go raw stream copies, HTTP submissions and serializer variants qualify unknown inputs',()=>{
 const cases=['import "io"\nfunc main(){io.Copy(os.Stdout,os.Stdin)}','import "io"\nfunc main(){file,_:=os.Create("public.yaml");copy:=io.Copy;copy(file,os.Stdin)}','import "net/http"\nimport "strings"\nfunc main(){http.Post(os.Args[1],"application/json",strings.NewReader(os.Args[2]))}','import "net/http"\nfunc main(){req,_:=http.NewRequest("POST",os.Args[1],os.Stdin);http.DefaultClient.Do(req)}','import "net/http"\nfunc main(){client:=&http.Client{};req,_:=http.NewRequest("POST",os.Args[1],os.Stdin);client.Do(req)}','import yaml "gopkg.in/yaml.v3"\nfunc main(){yaml.Marshal(os.Args[1])}'];
 for(const body of cases)sourceFixture({'bin/new.go':'package main\nimport "os"\n'+body+'\n'},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/));
});
test('Go dot-imported stream and submission capabilities keep the same grammar',()=>{
 for(const body of ['import . "io"\nimport "os"\nfunc main(){Copy(os.Stdout,os.Stdin)}','import . "net/http"\nimport "os"\nfunc main(){Post(os.Args[1],"application/json",os.Stdin)}','import . "net/http"\nimport "os"\nfunc main(){req,_:=NewRequest("POST",os.Args[1],os.Stdin);DefaultClient.Do(req)}','import . "os"\nfunc main(){WriteFile("public.yaml",[]byte(Args[1]),0600)}','import . "encoding/json"\nimport "os"\nfunc main(){emit:=Marshal;emit(os.Args[1])}'])sourceFixture({'bin/new.go':'package main\n'+body+'\n'},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/));
});
test('Go formatter qualification covers all arguments and unresolved interpolations',()=>{
 for(const call of ['fmt.Print("a",os.Args[1])','fmt.Printf("a%s",os.Args[1])','fmt.Fprint(os.Stdout,"a",os.Args[1])','fmt.Printf("status: %s\\n",os.Args[1])'])sourceFixture({'bin/new.go':'package main\nimport "os"\nimport "fmt"\nfunc main(){'+call+'}\n'},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/));
 sourceFixture({'bin/new.go':'package main\nimport "fmt"\nfunc main(){fmt.Print("native"," literal")}\n'},root=>assert.doesNotThrow(()=>discoverGoApiOutputs(root)));
 sourceFixture({'bin/new.go':'package main\nimport "fmt"\nfunc main(){fmt.Print("api","Version: v1\\nkind: Secret\\n")}\n'},root=>{const outputs=discoverGoApiOutputs(root);assert.equal(outputs.length,1);assert.equal(outputs[0].value.apiVersion,'v1');assert.equal(outputs[0].value.kind,'Secret');});
});

test('Python lexical parameters, imports, mutation ordering and writer escapes fail explicitly',()=>{
 const cases=[
  "import sys\ndef first():\n body=sys.argv[1]\n print(body)\ndef other():\n body='safe'\n print(body)\nfirst()\n",
  "import json,sys\ndef emit(json):\n print(json.dumps(sys.argv[1]))\nemit(object())\n",
  "import json,sys\ndef emit(body):\n print(json.dumps(body))\nbody={'safe':True}\nemit(json.loads(sys.argv[1]))\n",
  "import json,sys\nbody={'safe':True}\nalias=body\nalias.update(json.loads(sys.argv[1]))\nprint(json.dumps(body))\n",
  "import json,sys\nbody={'safe':True}\nbody[sys.argv[1]]=sys.argv[2]\nprint(json.dumps(body))\n",
  "import sys\nsys.stdout.writelines(sys.argv[1:])\n",
  "import sys\ndef cap():\n return print\ncap()(sys.argv[1])\n",
  "import sys\nbox={'writer':print}\nbox['writer'](sys.argv[1])\n",
  "import sys\ndef use(callback):\n callback(sys.argv[1])\nuse(print)\n",
 ];for(const bytes of cases)sourceFixture({'my-values/probe.py':bytes},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));
 sourceFixture({'bin/safe.py':"import json\nbody={'safe':True}\nprint(json.dumps(body))\nbody.update({'apiVersion':'v1','kind':'Secret'})\n"},root=>assert.doesNotThrow(()=>discoverScriptApiOutputs(root)));
});

test('JavaScript writers cannot escape in nested collections, callbacks, returns or mutable aliases',()=>{
 for(const bytes of [
  'const emit=console.log;[emit].forEach(callback=>callback(process.argv[2]));',
  'function cap(){return console.log};cap()(process.argv[2]);',
  'const box={writers:[console.log]};box.writers[0](process.argv[2]);',
  'function cap(){return {emit:console.log}};cap().emit(process.argv[2]);',
  'const emit=console.log;new Set([emit]).forEach(callback=>callback(process.argv[2]));',
  'const emit=console.log;Promise.resolve(emit).then(callback=>callback(process.argv[2]));',
 ])sourceFixture({'my-values/probe.mjs':bytes},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));
});

test('all raw shell stream families and unrecognized public emitters require a consumer',()=>{
 for(const bytes of ["sed '' \"$1\"\n","awk '{print}' \"$1\"\n",'tee /dev/null\n','head "$1"\n','tail "$1"\n','cut -c1- "$1"\n','tr a b\n','base64 -d "$1"\n','custom_emit "$1"\n','/opt/product/publish "$1"\n','command sed \'\' "$1"\n','exec awk \'{print}\' "$1"\n','"$EMITTER" "$1"\n','tee public.yaml >/dev/null\n','sed \'\' "$1" >&2\n','custom_emit "$1" >/dev/null\n','body=$(custom_emit >public.yaml)\n','sort -o public.yaml >/dev/null\n','uniq input.yaml public.yaml >/dev/null\n'])sourceFixture({'my-values/probe.sh':'#!/bin/sh\n'+bytes},root=>assert.throws(()=>discoverShellApiOutputs(root),/RAW_OUTPUT_ROLE_UNQUALIFIED/));
});

test('Go stream, selected-client, interface and function-result writers report gaps',()=>{
 for(const bytes of [
  'import("os";"strings")\nfunc main(){strings.NewReader(os.Args[1]).WriteTo(os.Stdout)}',
  'import "os"\nfunc main(){os.Stdout.ReadFrom(os.Stdin)}',
  'import "os"\nfunc main(){println(os.Args[1])}',
  'import "net/http"\ntype C = http.Client\nfunc send(c *C,r *http.Request){c.Do(r)}\nfunc main(){send(&C{},nil)}',
  'import "io"\nfunc emit(w io.Writer,b []byte){w.Write(b)}',
  'import("os";"io")\nfunc cap()io.Writer{return os.Stdout}\nfunc main(){cap().Write([]byte(os.Args[1]))}',
  'import("os";"io")\nfunc emit(w io.ReaderFrom){w.ReadFrom(os.Stdin)}\nfunc main(){emit(os.Stdout)}',
 ])sourceFixture({'my-values/probe.go':'package main\n'+bytes+'\n'},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/));
 const body='apiVersion: v1\\nkind: ConfigMap\\nmetadata: {name: forwarded}\\n';sourceFixture({'bin/literal.go':'package main\nimport "fmt"\nfunc emit(body string){fmt.Print(body)}\nfunc main(){emit("'+body+'")}\n'},root=>{const outputs=discoverGoApiOutputs(root);assert.equal(outputs.length,1);assert.equal(outputs[0].value.metadata.name,'forwarded');});
});

test('refreshed whole-source native contracts cannot suppress raw API possibilities',()=>{
 for(const [source,language,bytes]of [['scripts/native.go','Go','package main\nimport "os"\nfunc main(){os.Stdout.WriteString(os.Args[1])}\n'],['scripts/native.py','Python','import sys\nprint(sys.argv[1])\n']]){
 const registry={nativeLanguageSerializationContracts:[{source,language,basis:'original-fixed-diagnostic-inspection-or-cleanup-result',operation:{syntax:bytes}}]};sourceFixture({[source]:bytes,'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)},root=>assert.throws(()=>language==='Go'?discoverGoApiOutputs(root):discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));
 }
});

test('Node runtime conditional, wildcard, root and namespace reexports retain writer roles',()=>{
 for(const [exports,specifier,form]of [[{'.':{types:'./types.ts',import:'./runtime.mjs'}},'@kubeclaw/probe','named'],[{'./*':{node:{import:'./runtime.mjs'},default:'./types.ts'}},'@kubeclaw/probe/writer','named'],['./runtime.mjs','@kubeclaw/probe','named'],[{'.':'./runtime.mjs'},'@kubeclaw/probe','namespace']]){
 const declaration=form==='named'?`import {publish} from '${specifier}';publish`: `import * as output from '${specifier}';output.publish`;sourceFixture({'node_modules/@kubeclaw/probe/package.json':JSON.stringify({name:'@kubeclaw/probe',type:'module',exports}),'node_modules/@kubeclaw/probe/types.ts':'export declare function publish(file:string,content:string):void;', 'node_modules/@kubeclaw/probe/runtime.mjs':"export {writeFileSync as publish} from 'node:fs';",'bin/new.mjs':declaration+"('public.yaml',process.argv[2]);"},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));
 }
});

test('literal computed properties and ordered unambiguous deletion retain final emitted value',()=>{
 sourceFixture({'bin/probe.mjs':"const resource={apiVersion:'v1',kind:'ConfigMap',metadata:{name:'removed'}};delete resource['kind'];console.log(JSON.stringify(resource));"},root=>assert.equal(discoverScriptApiOutputs(root).length,0));
 sourceFixture({'bin/probe.mjs':"const resource={apiVersion:'v1',kind:'ConfigMap',metadata:{name:'restored'}};delete resource.kind;resource['kind']='Secret';console.log(JSON.stringify(resource));"},root=>assert.equal(discoverScriptApiOutputs(root)[0].value.kind,'Secret'));

 sourceFixture({'my-values/probe.mjs':"const resource={['apiVersion']:'v1',['kind']:'ConfigMap',metadata:{name:'literal'},data:{keep:'yes',remove:'no'}};delete resource.data.remove;console.log(JSON.stringify(resource));"},root=>{const outputs=discoverScriptApiOutputs(root);assert.equal(outputs.length,1);assert.deepEqual(outputs[0].value.data,{keep:'yes'});});
 for(const operation of ['if(process.argv[2])delete resource.data;','delete resource[process.argv[2]];'])sourceFixture({'bin/probe.mjs':"const resource={apiVersion:'v1',kind:'ConfigMap',metadata:{name:'literal'},data:{keep:'yes'}};"+operation+'console.log(JSON.stringify(resource));'},root=>assert.throws(()=>discoverScriptApiOutputs(root),/UNQUALIFIED/));
});

test('public symlink entries and unregistered documentation helpers retain discovery',()=>{
 sourceFixture({'tools/original.mjs':"console.log('apiVersion: v1\\nkind: ConfigMap\\nmetadata: {name: linked}\\n');"},root=>{fs.mkdirSync(path.join(root,'my-values'),{recursive:true});fs.symlinkSync('../tools/original.mjs',path.join(root,'my-values/linked.mjs'));assert(discoverScriptApiOutputs(root).some(output=>output.context.path==='my-values/linked.mjs'));});
 sourceFixture({'scripts/docs-new.mjs':"process.stdout.write(process.argv[2]);",'package.json':JSON.stringify({scripts:{'docs:new':'node scripts/docs-new.mjs'}})},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));
});


test('native Python state consumer closes actual keyword callers and capability escapes',()=>{
 const source='ops/pod/supervisor.py',bytes=fs.readFileSync(new URL('../..//'+source,import.meta.url),'utf8'),authority=JSON.parse(fs.readFileSync(new URL('../docs-api-producer-adapter-authorities.json',import.meta.url),'utf8')),registry={nativeLanguageSerializationContracts:authority.nativeLanguageSerializationContracts.filter(record=>record.source===source)};
 sourceFixture({[source]:bytes,'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)},root=>assert.doesNotThrow(()=>discoverScriptApiOutputs(root)));
 for(const addition of ["\nstatus('stopped', **json.loads(sys.argv[1]))\n","\nstatus('stopped', apiVersion='v1', kind='Secret')\n","\ncap=status\ncap('stopped', **json.loads(sys.argv[1]))\n"])sourceFixture({[source]:bytes+addition,'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));
});

test('unsupported public emitter languages retain unknown output possibilities',()=>{
 for(const [extension,bytes]of [['rb','puts ARGV[0]\n'],['lua','io.write(arg[1])\n'],['php','<?php echo $argv[1];\n'],['pl','print $ARGV[0];\n']])sourceFixture({['my-values/probe.'+extension]:bytes},root=>assert.throws(()=>discoverScriptApiOutputs(root),/PRODUCER_LANGUAGE_UNQUALIFIED/));
});

test('an updated native role receipt cannot relabel a literal API root',()=>{
 const source='bin/native.mjs',bytes="const value={apiVersion:'v1',kind:'ConfigMap',metadata:{name:'registered'}};console.log(JSON.stringify(value));";
 const registry={nonApiOutputContracts:[{source,sink:'console.log',expression:'JSON.stringify(value)',basis:'synthetic native role',operations:[{source,selectors:[{expression:'JSON.stringify(value)'}]}]}]};
 sourceFixture({[source]:bytes,'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)},root=>assert.equal(discoverScriptApiOutputs(root)[0].value.metadata.name,'registered'));
});

test('discovery cache rechecks resolved package exports and original publication bytes',()=>{
 const pkg='node_modules/@kubeclaw/fixture/package.json';
 sourceFixture({[pkg]:JSON.stringify({name:'@kubeclaw/fixture',type:'module',exports:'.\/runtime.mjs'}),'node_modules/@kubeclaw/fixture/runtime.mjs':"export{writeFileSync as publish}from'node:fs';",'bin/native.mjs':"import{publish}from'@kubeclaw/fixture';publish('native.json',JSON.stringify({status:'ok'}));"},root=>{
  assert.doesNotThrow(()=>discoverScriptApiOutputs(root));
  fs.writeFileSync(path.join(root,pkg),JSON.stringify({name:'@kubeclaw/fixture',exports:{types:'./types.ts'}}));
  assert.throws(()=>discoverScriptApiOutputs(root),/PACKAGE_RESOLUTION_UNQUALIFIED/);
 });
 sourceFixture({'bin/literal.mjs':"const value={apiVersion:'v1',kind:'ConfigMap',metadata:{name:'before'}};console.log(JSON.stringify(value));"},root=>{
  assert.equal(discoverScriptApiOutputs(root)[0].value.metadata.name,'before');
  fs.writeFileSync(path.join(root,'bin/literal.mjs'),"const value={apiVersion:'v1',kind:'Secret',metadata:{name:'after'}};console.log(JSON.stringify(value));");
  assert.equal(discoverScriptApiOutputs(root)[0].value.kind,'Secret');
 });
});

test('qualified native C control writes and Docker build records reject changed input grammar',()=>{
 const c='skills/common/plugin-runtime/foundation/isolation/sandbox.c',bytes=fs.readFileSync(new URL('../..//'+c,import.meta.url),'utf8');
 sourceFixture({[c]:bytes},root=>assert.doesNotThrow(()=>discoverScriptApiOutputs(root)));
 sourceFixture({[c]:bytes.replace('int length = snprintf(pid,','strcpy(pid, argv[1]);\n  int length = snprintf(pid,')},root=>assert.throws(()=>discoverScriptApiOutputs(root),/PRODUCER_LANGUAGE_UNQUALIFIED/));
 sourceFixture({'docker/Dockerfile.probe':"FROM scratch\nRUN printf 'builder:100000:65536\\n' >> /etc/subuid\n"},root=>assert.doesNotThrow(()=>discoverScriptApiOutputs(root)));
 sourceFixture({'docker/Dockerfile.probe':"FROM scratch\nRUN printf '%s' \"$BODY\"\n"},root=>assert.throws(()=>discoverScriptApiOutputs(root),/PRODUCER_LANGUAGE_UNQUALIFIED/));
 const repository=path.resolve(import.meta.dirname,'../..');
 for(const file of walkProductSources(repository,['docker','ops','tools'],file=>/(?:^|\/)Dockerfile(?:\.|$)/u.test(file)))sourceFixture({[file]:fs.readFileSync(path.join(repository,file),'utf8')},root=>assert.doesNotThrow(()=>discoverScriptApiOutputs(root),file));
});

test('workspace output authority survives relocation only with locally bound runtime dependencies',()=>{
 const source='bin/native.mjs',workspace='contracts/fixture',authority='scripts/docs-api-producer-adapter-authorities.json';
 sourceFixture({[source]:"import{validate}from'@kubeclaw/fixture';const result=validate(JSON.parse(process.argv[2]));console.log(JSON.stringify({...result}));",[workspace+'/package.json']:JSON.stringify({name:'@kubeclaw/fixture',type:'module',exports:'./index.mjs'}),[workspace+'/index.mjs']:"export function validate(input){return {status:'ok'};}"},root=>{
  fs.mkdirSync(path.join(root,'node_modules/@kubeclaw'),{recursive:true});
  fs.symlinkSync(path.join(root,workspace),path.join(root,'node_modules/@kubeclaw/fixture'));
  const selectors=[{expression:'JSON.stringify({...result})'}],facts=deriveNativeOperationFacts(root,source,selectors),factsDigest=nativeOperationFactDigest(facts);
  fs.mkdirSync(path.join(root,'scripts'),{recursive:true});
  fs.writeFileSync(path.join(root,authority),JSON.stringify({nonApiOutputContracts:[{source,sink:'console.log',expression:'JSON.stringify({...result})',basis:'fixture fixed validated response',operations:[{source,selectors,factsDigest}]}]}));
  const relocated=fs.mkdtempSync(path.join(os.tmpdir(),'api-workspace-relocation-'));
  try {
   fs.cpSync(root,relocated,{recursive:true});
   // A shared node_modules link still executes the original workspace. Its
   // escaped authority paths must not qualify the copied source receipt.
   assert.notEqual(nativeOperationFactDigest(deriveNativeOperationFacts(relocated,source,selectors)),factsDigest);
   assert(classifySerializedOutputRoles(relocated,source,[source]).every(output=>output.basis!=='fixture fixed validated response'));
   fs.unlinkSync(path.join(relocated,'node_modules/@kubeclaw/fixture'));
   fs.symlinkSync(path.join(relocated,workspace),path.join(relocated,'node_modules/@kubeclaw/fixture'));
   assert.equal(nativeOperationFactDigest(deriveNativeOperationFacts(relocated,source,selectors)),factsDigest);
   assert.deepEqual(discoverScriptApiOutputs(relocated),[]);
   fs.writeFileSync(path.join(relocated,workspace+'/index.mjs'),'export function validate(input){return input;}');
   assert.throws(()=>discoverScriptApiOutputs(relocated),/API_PRODUCT_SCRIPT_OUTPUT_ROLE_UNQUALIFIED/);
   fs.writeFileSync(path.join(relocated,workspace+'/index.mjs'),"export function validate(input){return {apiVersion:'v1',kind:'ConfigMap',metadata:{name:'added'}};}");
   assert.throws(()=>discoverScriptApiOutputs(relocated),/API_PRODUCT_SCRIPT_(?:OUTPUT_IDENTITY|OUTPUT_ROLE)_UNQUALIFIED/);
  } finally {fs.rmSync(relocated,{recursive:true,force:true});}
 });
});

test('refreshed native receipts cannot conceal returned API identity through runtime package constructors',()=>{
 const source='bin/native.mjs',pkg='node_modules/@kubeclaw/fixture/',authority='scripts/docs-api-producer-adapter-authorities.json';
 for(const invocation of ['validate(JSON.parse(process.argv[2]))','alias(JSON.parse(process.argv[2]))','through(()=>validate(JSON.parse(process.argv[2])))'])for(const published of ['value','{...value}','[value]']) {
  const expression=`JSON.stringify(${published})`,bytes=`import{validate,through}from'@kubeclaw/fixture';const alias=validate;const value=${invocation};console.log(${expression});`;
  sourceFixture({[source]:bytes,[pkg+'package.json']:JSON.stringify({name:'@kubeclaw/fixture',type:'module',exports:{import:'./index.mjs'}}),[pkg+'index.mjs']:"export{validate,through}from'./validation.mjs';",[pkg+'validation.mjs']:"export function validate(input){return {status:'ok'};}export function through(operation){return operation();}"},root=>{
   const operation={source,selectors:[{expression}]},registry={nonApiOutputContracts:[{source,sink:'console.log',expression,basis:'fixture closed diagnostic response',operations:[operation]}]};
   function refresh(){operation.factsDigest=nativeOperationFactDigest(deriveNativeOperationFacts(root,source,operation.selectors));fs.mkdirSync(path.join(root,'scripts'),{recursive:true});fs.writeFileSync(path.join(root,authority),JSON.stringify(registry));}
   refresh();assert.deepEqual(discoverScriptApiOutputs(root),[]);
   fs.writeFileSync(path.join(root,pkg+'validation.mjs'),"export function validate(input){return {apiVersion:'v1',kind:'Secret',metadata:{name:'hidden'}};}export function through(operation){return operation();}");
   refresh();
   assert(classifySerializedOutputRoles(root,source,[source]).every(output=>output.role!=='non-api'),`${invocation}: ${published}`);
   assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_SCRIPT_(?:OUTPUT_IDENTITY|OUTPUT_ROLE)_UNQUALIFIED/);
  });
 }
});

test('namespace and default runtime constructors retain API identity after native receipt refresh',()=>{
 const source='bin/native.mjs',pkg='node_modules/@kubeclaw/fixture/',authority='scripts/docs-api-producer-adapter-authorities.json';
 for(const form of ['namespace','namespace-alias','namespace-element','namespace-destructure','default','default-anonymous','default-arrow']){
  const imported=form.startsWith('namespace')?"import * as kit from '@kubeclaw/fixture';":"import make from '@kubeclaw/fixture';";
  const invocation=form==='namespace-destructure'?'const {make:constructor}=kit;const value=constructor();':form==='namespace-alias'?'const alias=kit;const value=alias.make();':form==='namespace-element'?"const value=kit['make']();":form==='namespace'?'const value=kit.make();':'const value=make();';
  const declaration=form==='default-anonymous'?'export default function()':form==='default-arrow'?'export default () =>':form.startsWith('default')?'export default function make()':'export function make()';
  const constructor=value=>form==='default-arrow'?declaration+`(${value});`:declaration+`{return ${value};}`;
  sourceFixture({[source]:imported+invocation+'console.log(JSON.stringify(value));',[pkg+'package.json']:JSON.stringify({name:'@kubeclaw/fixture',type:'module',exports:{types:'./types.ts',import:'./index.mjs'}}),[pkg+'index.mjs']:constructor("{status:'ok'}")},root=>{
   const operation={source,selectors:[{expression:'JSON.stringify(value)'}]},registry={nonApiOutputContracts:[{source,sink:'console.log',expression:'JSON.stringify(value)',basis:'fixture native diagnostic',operations:[operation]}]};
   const refresh=()=>{operation.factsDigest=nativeOperationFactDigest(deriveNativeOperationFacts(root,source,operation.selectors));fs.mkdirSync(path.join(root,'scripts'),{recursive:true});fs.writeFileSync(path.join(root,authority),JSON.stringify(registry));};
   refresh();assert.deepEqual(discoverScriptApiOutputs(root),[]);
   fs.writeFileSync(path.join(root,pkg+'index.mjs'),constructor("{apiVersion:'v1',kind:'Secret',metadata:{name:'hidden'}}"));
   refresh();const roles=classifySerializedOutputRoles(root,source,[source]);assert(roles.some(output=>output.role==='api'),form);assert(!roles.some(output=>output.role==='non-api'),form);
   assert.throws(()=>discoverScriptApiOutputs(root),/API_PRODUCT_SCRIPT_(?:OUTPUT_IDENTITY|OUTPUT_ROLE)_UNQUALIFIED/);
   const actual=spawnSync(process.execPath,[path.join(root,source)],{encoding:'utf8',timeout:5000});assert.equal(actual.status,0,actual.stderr);assert.equal(JSON.parse(actual.stdout).kind,'Secret');
  });
 }
});

test('opaque runtime namespace members remain an explicit gap after receipt refresh',()=>{
 const source='bin/native.mjs',pkg='node_modules/@kubeclaw/fixture/',expression='JSON.stringify(value)';
 sourceFixture({[source]:"import * as kit from '@kubeclaw/fixture';const value=kit[process.argv[2]]();console.log(JSON.stringify(value));",[pkg+'package.json']:JSON.stringify({name:'@kubeclaw/fixture',type:'module',exports:'./index.mjs'}),[pkg+'index.mjs']:"export function make(){return {apiVersion:'v1',kind:'Secret'};}"},root=>{
  const operation={source,selectors:[{expression}]};operation.factsDigest=nativeOperationFactDigest(deriveNativeOperationFacts(root,source,operation.selectors));fs.mkdirSync(path.join(root,'scripts'),{recursive:true});fs.writeFileSync(path.join(root,'scripts/docs-api-producer-adapter-authorities.json'),JSON.stringify({nonApiOutputContracts:[{source,sink:'console.log',expression,basis:'refreshed native receipt',operations:[operation]}]}));
  const output=classifySerializedOutputRoles(root,source,[source]).find(output=>output.sink==='console.log');assert.equal(output.role,'unknown');assert.equal(output.basis,'unsupported-runtime-imported-constructor');assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/);
 });
});

test('changed imported constructor aliases cannot inherit refreshed native receipts',()=>{
 const source='bin/native.mjs',pkg='node_modules/@kubeclaw/fixture/',expression='JSON.stringify(value)';
 for(const code of ["import {make} from '@kubeclaw/fixture';let alias=make;alias=()=>({apiVersion:'v1',kind:'Secret'});const value=alias();","import * as kit from '@kubeclaw/fixture';let alias=kit;alias={make:()=>({apiVersion:'v1',kind:'Secret'})};const value=alias.make();"]){
  sourceFixture({[source]:code+'console.log(JSON.stringify(value));',[pkg+'package.json']:JSON.stringify({name:'@kubeclaw/fixture',type:'module',exports:'./index.mjs'}),[pkg+'index.mjs']:"export function make(){return {status:'ok'};}"},root=>{
   const operation={source,selectors:[{expression}]};operation.factsDigest=nativeOperationFactDigest(deriveNativeOperationFacts(root,source,operation.selectors));fs.mkdirSync(path.join(root,'scripts'),{recursive:true});fs.writeFileSync(path.join(root,'scripts/docs-api-producer-adapter-authorities.json'),JSON.stringify({nonApiOutputContracts:[{source,sink:'console.log',expression,basis:'refreshed native receipt',operations:[operation]}]}));
   assert(classifySerializedOutputRoles(root,source,[source]).filter(output=>output.sink==='console.log').every(output=>output.role!=='non-api'));assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED|OUTPUT_IDENTITY_UNQUALIFIED/);
  });
 }
});

test('each actual Kubernetes reader contract binds its selected call and effective argv',()=>{
 const repository=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..'),authority='scripts/docs-api-producer-adapter-authorities.json';
 const registry=JSON.parse(fs.readFileSync(path.join(repository,authority),'utf8'));
 for(const originalContract of registry.kubernetesCommandContracts){
  const source=originalContract.source,original=fs.readFileSync(path.join(repository,source),'utf8');
  sourceFixture({[source]:original,[authority]:JSON.stringify({kubernetesCommandContracts:[originalContract]})},root=>{
   const contract=structuredClone(originalContract),local={kubernetesCommandContracts:[contract]};
   const refresh=()=>{for(const operation of contract.operations)operation.factsDigest=nativeOperationFactDigest(deriveNativeOperationFacts(root,operation.source,operation.selectors));fs.writeFileSync(path.join(root,authority),JSON.stringify(local));};
   refresh();assert(classifySerializedOutputRoles(root,source,[source]).some(output=>output.sink==='kubectl-request'&&output.role==='non-api'),source);
   for(const argv of [["create","namespace","hidden"],["delete","namespace","hidden"],["rollout","restart","deployment/hidden"],["exec","pod/hidden","--","sh","-c","touch /tmp/hidden"]]){
    fs.writeFileSync(path.join(root,source),original+`\nexport function additionalSubmission(){return execFileSync('kubectl',${JSON.stringify(argv)},{encoding:'utf8'}); }\n`);
    const added=classifySerializedOutputRoles(root,source,[source]).filter(output=>output.line>original.split('\n').length);assert(added.some(output=>output.sink==='kubectl-request'&&output.role==='unknown'),source+':'+argv[0]);assert(!added.some(output=>output.role==='non-api'),source+':'+argv[0]);
   }
   fs.writeFileSync(path.join(root,source),original+"\nexport function shadowed(execFileSync){return execFileSync('kubectl',['get','secrets'],{encoding:'utf8'});}\n");
   assert(classifySerializedOutputRoles(root,source,[source]).some(output=>output.line>original.split('\n').length&&output.sink==='kubectl-request'&&output.role==='unknown'),source+':shadowed subprocess binding');
   // A new caller of the reviewed wrapper changes its actual argv without
   // changing the selected subprocess expression; even refreshed facts reject.
   const wrapper=source.includes('stateful')?"kube('default',['create','namespace','hidden'])":source.includes('gitops-owner')?null:"kubectl(['create','namespace','hidden'])";
   if(wrapper){fs.writeFileSync(path.join(root,source),original+`\nexport function newCaller(){return ${wrapper};}\n`);refresh();assert(classifySerializedOutputRoles(root,source,[source]).filter(output=>output.sink==='kubectl-request').every(output=>output.role==='unknown'),source);}
  });
 }
});

test('native operation facts bind runtime package validators through reexports',()=>{
 const source='bin/native.mjs',pkg='node_modules/@kubeclaw/fixture/',bytes="import{validate}from'@kubeclaw/fixture';const value=validate(JSON.parse(process.argv[2]));console.log(JSON.stringify(value));";
 const registry={nonApiOutputContracts:[{source,sink:'console.log',expression:'JSON.stringify(value)',basis:'fixture validated local diagnostic',operations:[{source,selectors:[{expression:'JSON.stringify(value)'}]}]}]};
 sourceFixture({[source]:bytes,[pkg+'package.json']:JSON.stringify({name:'@kubeclaw/fixture',type:'module',exports:{types:'./types.ts',import:'./index.mjs'}}),[pkg+'index.mjs']:"export{validate}from'./validation.mjs';",[pkg+'validation.mjs']:"import fs from'node:fs';const schema=JSON.parse(fs.readFileSync(new URL('./schema.json',import.meta.url),'utf8'));export function validate(input){if(!schema.allowed.includes(input.status))throw Error('INVALID');return {status:'ok'};}",[pkg+'schema.json']:JSON.stringify({allowed:['ok']}),'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)},root=>{
  const facts=deriveNativeOperationFacts(root,source,[{expression:'JSON.stringify(value)'}]);
  assert(facts.some(fact=>fact.source===pkg+'package.json'));
  assert(facts.some(fact=>fact.source===pkg+'validation.mjs'&&fact.symbol==='validate'));
  assert.equal(classifySerializedOutputRoles(root,source,[source])[0].basis,'fixture validated local diagnostic');
  assert(facts.some(fact=>fact.source===pkg+'schema.json'));
  fs.writeFileSync(path.join(root,pkg+'schema.json'),JSON.stringify({allowed:['changed']}));
  assert.notEqual(nativeOperationFactDigest(deriveNativeOperationFacts(root,source,[{expression:'JSON.stringify(value)'}])),nativeOperationFactDigest(facts));
  assert(classifySerializedOutputRoles(root,source,[source]).every(output=>output.basis!=='fixture validated local diagnostic'));
  fs.writeFileSync(path.join(root,pkg+'schema.json'),JSON.stringify({allowed:['ok']}));
  fs.writeFileSync(path.join(root,pkg+'validation.mjs'),'export function validate(input){return input;}');
  assert.notEqual(nativeOperationFactDigest(deriveNativeOperationFacts(root,source,[{expression:'JSON.stringify(value)'}])),nativeOperationFactDigest(facts));
  assert(classifySerializedOutputRoles(root,source,[source]).some(output=>output.role==='unknown'));
 });
});

import { spawnSync } from 'node:child_process';
test('native Go closed log grammar rejects refreshed receipts for a new API root',()=>{
 const source='tools/probe/main.go',authority='scripts/docs-api-producer-adapter-authorities.json';
 const log=`package main
import("time";"fmt";"encoding/json")
func logJSON(level string, message string, detail interface{}) {
 record := map[string]interface{}{
  "ts": time.Now().UTC().Format(time.RFC3339Nano),
  "level": level,
  "component": "buster-namespace-controller",
  "message": message,
 }
 if detail != nil { record["detail"] = detail }
 data, err := json.Marshal(record)
 if err != nil { fmt.Println(\`{"level":"error","component":"buster-namespace-controller","message":"failed to marshal log"}\`); return }
 fmt.Println(string(data))
}
func main(){logJSON("info","ready",nil)}
`;
 sourceFixture({[source]:log},root=>{
  function refresh(){const run=spawnSync(process.env.KUBECLAW_DOCS_GO_BINARY??'go',['run',new URL('../docs-api-go-output-role-adapter.go',import.meta.url).pathname],{input:JSON.stringify([{path:path.join(root,source)}]),encoding:'utf8'});assert.equal(run.status,0,run.stderr);const outputs=JSON.parse(run.stdout).filter(output=>output.role==='unknown').map(output=>{const facts=output.dependencies.map(fact=>({...fact,path:path.relative(root,fact.path)}));return {expression:output.expression,function:output.function,operationDigest:createHash('sha256').update(output.operation).digest('hex'),dependencyFacts:facts,dependencyFactsDigest:createHash('sha256').update(JSON.stringify(facts)).digest('hex'),consumer:{kind:'go-log-envelope',source,purpose:'Fixture closed diagnostic log',evidence:['record := map[string]interface{}']}};});fs.mkdirSync(path.dirname(path.join(root,authority)),{recursive:true});fs.writeFileSync(path.join(root,authority),JSON.stringify({nativeLanguageSerializationContracts:[{source,language:'Go',outputs}]}));}
  refresh();assert.doesNotThrow(()=>discoverGoApiOutputs(root));
  fs.writeFileSync(path.join(root,source),log.replace('data, err := json.Marshal(record)','record["apiVersion"]="v1";record["kind"]="Secret"\n data, err := json.Marshal(record)'));
  refresh();assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/);
 });
});

test('native Go payload receipt binds additional incoming transport callers',()=>{
 const source='tools/probe/main.go',authority='scripts/docs-api-producer-adapter-authorities.json',bytes=`package main
import("bytes";"encoding/json";"io")
func requestPayload(body interface{})(io.Reader,error){if body==nil{return nil,nil};data,err:=json.Marshal(body);if err!=nil{return nil,err};return bytes.NewReader(data),nil}
func original(){requestPayload(map[string]interface{}{"apiVersion":"v1","kind":"ConfigMap"})}
`;
 sourceFixture({[source]:bytes},root=>{
  const run=spawnSync(process.env.KUBECLAW_DOCS_GO_BINARY??'go',['run',new URL('../docs-api-go-output-role-adapter.go',import.meta.url).pathname],{input:JSON.stringify([{path:path.join(root,source)}]),encoding:'utf8'});assert.equal(run.status,0,run.stderr);const output=JSON.parse(run.stdout).find(output=>output.expression==='json.Marshal(body)'),facts=output.dependencies.map(fact=>({...fact,path:path.relative(root,fact.path)}));assert(facts.some(fact=>fact.symbol==='original'));
  fs.mkdirSync(path.dirname(path.join(root,authority)),{recursive:true});fs.writeFileSync(path.join(root,authority),JSON.stringify({nativeLanguageSerializationContracts:[{source,language:'Go',outputs:[{expression:output.expression,function:output.function,operationDigest:createHash('sha256').update(output.operation).digest('hex'),dependencyFacts:facts,dependencyFactsDigest:createHash('sha256').update(JSON.stringify(facts)).digest('hex'),consumer:{kind:'go-kubernetes-payload',source,purpose:'Fixture original transport payload',evidence:['return bytes.NewReader(data), nil']}}]}]}));
  assert.doesNotThrow(()=>discoverGoApiOutputs(root));
  fs.writeFileSync(path.join(root,'tools/probe/new.go'),'package main\nimport "os"\nfunc added(){requestPayload(os.Args[1])}\n');
  assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/);
 });
});

test('native Go transport receipt binds aliases, callbacks and returned capabilities',()=>{
 const repository=path.resolve(import.meta.dirname,'../..'),authority='scripts/docs-api-producer-adapter-authorities.json',registry=JSON.parse(fs.readFileSync(path.join(repository,authority),'utf8')),selected={nativeLanguageSerializationContracts:registry.nativeLanguageSerializationContracts.filter(contract=>contract.source.startsWith('cmd/buster-namespace-controller/'))};
 const paths=[...new Set(['charts/kubeclaw/templates/buster-namespace-lease-crd.yaml',...selected.nativeLanguageSerializationContracts.flatMap(contract=>contract.outputs.flatMap(output=>output.dependencyFacts.map(fact=>fact.path)))])],files=Object.fromEntries(paths.map(file=>[file,fs.readFileSync(path.join(repository,file),'utf8')]));
 for(const added of [
  'func unchecked(c *controller){send:=c.kube;send(context.Background(),"POST","/api/v1/namespaces",os.Args[1],"application/json",nil)}',
  'func unchecked(c *controller){callback:=func(){send:=c.kube;send(context.Background(),"POST","/api/v1/namespaces",os.Args[1],"application/json",nil)};callback()}',
  'var transport=func(c *controller){send:=c.kube;send(context.Background(),"POST","/api/v1/namespaces",os.Args[1],"application/json",nil)}',
  'func capability(c *controller)interface{}{return c.kube};func unchecked(c *controller){capability(c)}'
 ])sourceFixture({...files,[authority]:JSON.stringify(selected)},root=>{
  assertOriginalControllerUnsupported(root);assert.doesNotThrow(()=>fixtureControllerShapes(root));
  fs.writeFileSync(path.join(root,'cmd/buster-namespace-controller/unchecked.go'),'package main\nimport("context";"os")\n'+added+'\n');
  assert.throws(()=>fixtureControllerShapes(root),/FINITE_TRANSPORT_CONSUMER_UNQUALIFIED/);
 });
});

test('native Go transport receipts reject refreshed unknown incoming bodies and replaced transfer recipes',()=>{
 const repository=path.resolve(import.meta.dirname,'../..'),authority='scripts/docs-api-producer-adapter-authorities.json';
 const registry=JSON.parse(fs.readFileSync(path.join(repository,authority),'utf8'));
 const selected={nativeLanguageSerializationContracts:registry.nativeLanguageSerializationContracts.filter(contract=>contract.source.startsWith('cmd/buster-namespace-controller/'))};
 const paths=[...new Set(['charts/kubeclaw/templates/buster-namespace-lease-crd.yaml',...selected.nativeLanguageSerializationContracts.flatMap(contract=>contract.outputs.flatMap(output=>output.dependencyFacts.map(fact=>fact.path)))])];
 const files=Object.fromEntries(paths.map(file=>[file,fs.readFileSync(path.join(repository,file),'utf8')])),added='cmd/buster-namespace-controller/unchecked.go',main='cmd/buster-namespace-controller/main.go';
 const variants={
  direct:'func unchecked(c *controller){c.kube(context.Background(),"POST","/api/v1/namespaces",os.Args[1],"application/json",nil)}',
  alias:'func unchecked(c *controller){send:=c.kube;send(context.Background(),"POST","/api/v1/namespaces",os.Args[1],"application/json",nil)}',
  alias_constructor_gap:'func unchecked(c *controller){send:=c.kube;send(context.Background(),"POST","/api/v1/namespaces",map[string]interface{}{"apiVersion":"v1","kind":"Namespace","metadata":map[string]interface{}{"name":"alias"}},"application/json",nil)}',
  callback:'func unchecked(c *controller){invoke(c.kube)}\nfunc invoke(send func(context.Context,string,string,interface{},string,interface{})error){send(context.Background(),"POST","/api/v1/namespaces",os.Args[1],"application/json",nil)}',
  returned:'func capability(c *controller)func(context.Context,string,string,interface{},string,interface{})error{return c.kube}\nfunc unchecked(c *controller){capability(c)(context.Background(),"POST","/api/v1/namespaces",os.Args[1],"application/json",nil)}',
  global:'var send func(context.Context,string,string,interface{},string,interface{})error\nfunc unchecked(c *controller){send=c.kube;send(context.Background(),"POST","/api/v1/namespaces",os.Args[1],"application/json",nil)}',
  payload:'func unchecked(c *controller){requestPayload(os.Args[1]);_=context.Background()}',
  map_address:'func unchecked(c *controller){body:=map[string]interface{}{"apiVersion":"v1","kind":"Namespace"};json.Unmarshal([]byte(os.Args[1]),&body);c.kube(context.Background(),"POST","/api/v1/namespaces",body,"application/json",nil)}',
  alias_mutated_body:'func unchecked(c *controller){body:=map[string]interface{}{"apiVersion":"v1","kind":"Namespace"};alias:=body;alias["kind"]="Secret";alias["immutable"]=true;c.kube(context.Background(),"POST","/api/v1/namespaces",body,"application/json",nil)}',
  helper_mutated_body:'func mutateBody(body map[string]interface{}){body["kind"]="Secret";body["immutable"]=true};func unchecked(c *controller){body:=map[string]interface{}{"apiVersion":"v1","kind":"Namespace"};mutateBody(body);c.kube(context.Background(),"POST","/api/v1/namespaces",body,"application/json",nil)}',
  after_submission:'func unchecked(c *controller){body:=map[string]interface{}{"apiVersion":"v1","kind":"Namespace","metadata":map[string]interface{}{"name":"before"}};c.kube(context.Background(),"POST","/api/v1/namespaces",body,"application/json",nil);body["kind"]="Secret";body["immutable"]=true}',
  supported_patch:'func unchecked(c *controller){c.kube(context.Background(),http.MethodPatch,"/api/v1/namespaces/a/secrets/b",map[string]interface{}{"immutable":true},"application/merge-patch+json",nil)}',
  supported_constructor:'func unchecked(c *controller){body:=map[string]interface{}{"apiVersion":"v1","kind":"Namespace","metadata":map[string]interface{}{"name":"qualification"}};c.kube(context.Background(),"POST","/api/v1/namespaces",body,"application/json",nil)}',
  replaced_request:null,replaced_payload:null,
 };
 for(const [name,body]of Object.entries(variants))sourceFixture({...files,[authority]:JSON.stringify(selected)},root=>{
  if(body)fs.writeFileSync(path.join(root,added),'package main\nimport("context";"os";"encoding/json";"net/http")\n'+body+'\n');
  if(name==='replaced_request')fs.writeFileSync(path.join(root,main),files[main].replace('resp, err := c.httpClient.Do(req)','req.Body = io.NopCloser(strings.NewReader(os.Args[1]))\n\tresp, err := c.httpClient.Do(req)'));
  if(name==='replaced_payload')fs.writeFileSync(path.join(root,main),files[main].replace('data, err := json.Marshal(body)','body = os.Args[1]\n\tdata, err := json.Marshal(body)'));
  const inputs=body?[...paths,added]:paths;
  const run=spawnSync(process.env.KUBECLAW_DOCS_GO_BINARY??'go',['run',new URL('../docs-api-go-output-role-adapter.go',import.meta.url).pathname],{input:JSON.stringify(inputs.filter(file=>file.endsWith(".go")).map(file=>({path:path.join(root,file)}))),encoding:'utf8',maxBuffer:32*1024*1024});assert.equal(run.status,0,run.stderr);
  const actual=JSON.parse(run.stdout),refreshed=structuredClone(selected);
  for(const contract of refreshed.nativeLanguageSerializationContracts)for(const receipt of contract.outputs){
   const output=actual.find(output=>path.relative(root,output.path)===contract.source&&output.function===receipt.function&&output.expression===receipt.expression);assert(output);
   receipt.operationDigest=createHash('sha256').update(output.operation).digest('hex');receipt.dependencyFacts=output.dependencies.map(fact=>({...fact,path:path.relative(root,fact.path)}));receipt.dependencyFactsDigest=createHash('sha256').update(JSON.stringify(receipt.dependencyFacts)).digest('hex');
  }
  fs.writeFileSync(path.join(root,authority),JSON.stringify(refreshed));
  if(name==='supported_constructor')assert(fixtureControllerShapes(root).some(output=>output.value.kind==='Namespace'&&output.value.metadata.name==='qualification'));
  else if(name==='after_submission'){const outputs=fixtureControllerShapes(root),submitted=outputs.find(output=>output.value.metadata?.name==='before');assert.equal(submitted?.value.kind,'Namespace');assert(!('immutable' in submitted.value));}
  else if(name==='supported_patch'){const output=fixtureControllerShapes(root).find(output=>output.context.path===added&&output.value.immutable===true);assert.equal(output?.value.kind,'Secret');assert.equal(output?.context.requestMethod,'MethodPatch');}
  else assert.throws(()=>fixtureControllerShapes(root),/FINITE_TRANSPORT_CONSUMER_UNQUALIFIED/,name);
 });
});

test('actual Python webhook JSON Patch submits selected operations and newly added metadata',()=>{
 const repository=path.resolve(import.meta.dirname,'../..'),source='scripts/align-spire-webhook-order.py',bytes=fs.readFileSync(path.join(repository,source),'utf8');
 for(const changed of [bytes,bytes.replace('{"op": "move", "from": "/webhooks/1", "path": "/webhooks/0"},','{"op": "move", "from": "/webhooks/1", "path": "/webhooks/0"},\n        {"op": "add", "path": "/metadata/labels/reviewerAdded", "value": "selected"},')])sourceFixture({[source]:changed},root=>{
  const outputs=discoverScriptApiOutputs(root),output=outputs.find(output=>output.context.requestPatchType==='json');assert(output,'actual submitted JSON Patch missing');
  assert.equal(output.context.requestMethod,'PATCH');assert.equal(output.context.requestReceiver.kind,'ValidatingWebhookConfiguration');assert.deepEqual(output.context.patchOperations,output.value);
  const selected=apiProductSelection(output.context.apiVersion,output.context.kind,[output.context],versionedApiReceiverRegistries.get(output.context.apiVersion),root);
  assert(selected.metadataPaths.includes('$.metadata.resourceVersion'));assert(selected.fieldPaths.includes('$.webhooks[].name'));assert(!selected.fieldPaths.includes('$.webhooks[].clientConfig'));assert(!selected.fieldPaths.includes('$.webhooks[].failurePolicy'));
  const moved=selected.applicability['$.webhooks[]'].filter(row=>row.operation==='move');assert.deepEqual(moved.map(row=>[row.role,row.fieldPath]),[['destination','$.webhooks[0]'],['source','$.webhooks[1]']]);
  assert.equal(selected.metadataPaths.includes('$.metadata.labels.reviewerAdded'),changed!==bytes);
 });
 for(const replacement of ['{"op": "move", "from": "/webhooks/1", "path": "/webhooks/00"},','{"op": "unsupported", "path": "/webhooks/0"},'])sourceFixture({[source]:bytes.replace('{"op": "move", "from": "/webhooks/1", "path": "/webhooks/0"},',replacement)},root=>{
  assert.throws(()=>{const output=discoverScriptApiOutputs(root).find(output=>output.context.requestPatchType==='json');assert(output);apiProductSelection(output.context.apiVersion,output.context.kind,[output.context],versionedApiReceiverRegistries.get(output.context.apiVersion),root);},/API_PRODUCT_(?:JSON_PATCH|PYTHON)/);
 });
});

test('actual cross-file Ingress factory retains its submitted PATCH resource version and projected additions',()=>{
 const repository=path.resolve(import.meta.dirname,'../..'),directory='cmd/buster-namespace-controller',authority='scripts/docs-api-producer-adapter-authorities.json';
 const registry=JSON.parse(fs.readFileSync(path.join(repository,authority),'utf8')),selected={nativeLanguageSerializationContracts:registry.nativeLanguageSerializationContracts.filter(contract=>contract.source.startsWith(directory+'/'))};
 const paths=fs.readdirSync(path.join(repository,directory)).filter(file=>file.endsWith('.go')&&!file.endsWith('_test.go')).map(file=>directory+'/'+file);
 const authorityPaths=['charts/kubeclaw/templates/buster-namespace-lease-crd.yaml',...selected.nativeLanguageSerializationContracts.flatMap(contract=>contract.outputs.flatMap(output=>output.dependencyFacts.map(fact=>fact.path)))];
 const files=Object.fromEntries([...new Set([...paths,...authorityPaths])].map(file=>[file,fs.readFileSync(path.join(repository,file),'utf8')]));
 sourceFixture({...files,[authority]:JSON.stringify(selected)},root=>{
  assertOriginalControllerUnsupported(root);const before=fixtureControllerShapes(root),submitted=before.find(output=>output.context.path===directory+'/exposure-generation.go'&&output.context.requestMethod==='MethodPatch'&&output.value.kind==='Ingress');
  assert(submitted,'actual current cross-file Ingress PATCH missing');assert.deepEqual(submitted.value.metadata.resourceVersion,{__docsDynamicExpression:'stringValue(metadata["resourceVersion"])'});assert.deepEqual(submitted.context.requestPath,{__docsDynamicExpression:'base + "/" + exposure.IngressName'});
  assert.throws(()=>apiProductSelection(submitted.context.apiVersion,submitted.context.kind,[submitted.context],versionedApiReceiverRegistries.get(submitted.context.apiVersion),root),/unsupported API-read error-result authority/,'whole original Go source is not an admitted publication');const selection=fixtureShapeReceiverSelection(root,submitted,versionedApiReceiverRegistries.get(submitted.context.apiVersion));assert(selection.metadataPaths.includes('$.metadata.resourceVersion'),'captured PATCH shape must select the receiver resourceVersion boundary');
  assert(before.some(output=>output.context.path===directory+'/main.go'&&output.value.kind==='Ingress'&&!Object.hasOwn(output.value.metadata,'resourceVersion')),'original create constructor must retain its own fields');
  const source=directory+'/exposure-generation.go',changed=files[source].replace('objectValue(desired["metadata"])["resourceVersion"] = version','objectValue(desired["metadata"])["resourceVersion"] = version\n\tobjectValue(desired["metadata"])["generation"] = 7');assert.notEqual(changed,files[source]);fs.writeFileSync(path.join(root,source),changed);
  const run=spawnSync(process.env.KUBECLAW_DOCS_GO_BINARY??'go',['run',new URL('../docs-api-go-output-role-adapter.go',import.meta.url).pathname],{input:JSON.stringify(paths.filter(file=>file.endsWith(".go")).map(file=>({path:path.join(root,file)}))),encoding:'utf8',maxBuffer:32*1024*1024});assert.equal(run.status,0,run.stderr);const actual=JSON.parse(run.stdout),refreshed=structuredClone(selected);
  for(const contract of refreshed.nativeLanguageSerializationContracts)for(const receipt of contract.outputs){const output=actual.find(output=>path.relative(root,output.path)===contract.source&&output.function===receipt.function&&output.expression===receipt.expression);assert(output);receipt.operationDigest=createHash('sha256').update(output.operation).digest('hex');receipt.dependencyFacts=output.dependencies.map(fact=>({...fact,path:path.relative(root,fact.path)}));receipt.dependencyFactsDigest=createHash('sha256').update(JSON.stringify(receipt.dependencyFacts)).digest('hex');}
  fs.writeFileSync(path.join(root,authority),JSON.stringify(refreshed));
  try{const after=fixtureControllerShapes(root);assert(after.some(output=>output.context.path===source&&output.context.requestMethod==='MethodPatch'&&output.value.metadata?.generation===7),'new projected submitted field disappeared after receipt refresh');}
  catch(error){assert.match(error.message,/FINITE_TRANSPORT_CONSUMER_UNQUALIFIED/);}
 });
});

test('actual namespace Role alternatives retain base resources and changed conditional appends',()=>{
 const repository=path.resolve(import.meta.dirname,'../..'),directory='cmd/buster-namespace-controller',authority='scripts/docs-api-producer-adapter-authorities.json',main=directory+'/main.go';
 const registry=JSON.parse(fs.readFileSync(path.join(repository,authority),'utf8')),selected={nativeLanguageSerializationContracts:registry.nativeLanguageSerializationContracts.filter(contract=>contract.source.startsWith(directory+'/'))};
 const paths=fs.readdirSync(path.join(repository,directory)).filter(file=>file.endsWith('.go')&&!file.endsWith('_test.go')).map(file=>directory+'/'+file);
 const authorityPaths=['charts/kubeclaw/templates/buster-namespace-lease-crd.yaml',...selected.nativeLanguageSerializationContracts.flatMap(contract=>contract.outputs.flatMap(output=>output.dependencyFacts.map(fact=>fact.path)))];
 const files=Object.fromEntries([...new Set([...paths,...authorityPaths])].map(file=>[file,fs.readFileSync(path.join(repository,file),'utf8')]));
 sourceFixture({...files,[authority]:JSON.stringify(selected)},root=>{
  const roles=()=>fixtureControllerShapes(root).filter(output=>output.value.kind==='Role'&&output.value.rules?.[0]?.resources?.includes('pods'));
  const check=(outputs,changed=false)=>{assert.equal(outputs.length,2);const tester=outputs.find(output=>output.context.conditions?.some(condition=>condition.expression==='mode == "deployer"'&&condition.result===false)),deployer=outputs.find(output=>output.context.conditions?.some(condition=>condition.expression==='mode == "deployer"'&&condition.result===true));assert(tester&&deployer,'actual tester and deployer alternatives missing');
   assert.deepEqual(tester.value.rules[0].resources,['pods','pods/log','services','endpoints','configmaps',...(changed?['events']:[])]);assert.deepEqual(tester.value.rules[1].resources,['deployments','replicasets']);assert.deepEqual(deployer.value.rules[0].resources,[...tester.value.rules[0].resources,'persistentvolumeclaims']);assert.deepEqual(deployer.value.rules[1].resources,['deployments','replicasets','statefulsets',...(changed?['daemonsets']:[])]);};
  check(roles());
  const finalizerBranches=fixtureControllerShapes(root).filter(output=>output.context.path===main&&output.context.line===754);
  assert.equal(finalizerBranches.length,2,'actual reread must retain both no-append and append PATCH paths');
  const branch=(outputs,taken)=>outputs.find(output=>output.context.conditions?.some(condition=>condition.expression==='!contains(finalizers, c.finalizer)'&&condition.result===taken));
  const inheritedFinalizer=branch(finalizerBranches,false),finalizer=branch(finalizerBranches,true);assert(inheritedFinalizer&&finalizer);
  assert.equal(inheritedFinalizer.value.metadata.finalizers.__docsDynamicExpression,'append([]string{}, current.Metadata.Finalizers...)');
  assert.equal(inheritedFinalizer.value.metadata.finalizers.__docsSupportedSequenceAppend,undefined);
  assert.equal(finalizer.value.metadata.finalizers.__docsDynamicExpression,'append(finalizers, c.finalizer)');
  for(const output of finalizerBranches)assert.equal(output.context.requestMethod,'MethodPatch');
  assertOriginalControllerUnsupported(root);assert.throws(()=>apiProductSelection(finalizer.context.apiVersion,finalizer.context.kind,[finalizer.context],productApiReceiverRecords(finalizer.context.apiVersion,finalizer.context.kind),root),/unsupported API-read error-result authority/);const finalizerSelection=fixtureShapeReceiverSelection(root,finalizer,productApiReceiverRecords(finalizer.context.apiVersion,finalizer.context.kind));assert(finalizerSelection.metadataPaths.includes('$.metadata.finalizers'));assert(finalizerSelection.metadataPaths.includes('$.metadata.finalizers[]'),'actual symbolic finalizer array must select its public item boundary');
  const changed=files[main].replace('coreResources := []string{"pods", "pods/log", "services", "endpoints", "configmaps"}','coreResources := []string{"pods", "pods/log", "services", "endpoints", "configmaps", "events"}').replace('appResources = append(appResources, "statefulsets")','appResources = append(appResources, "statefulsets", "daemonsets")').replace('finalizers := append([]string{}, current.Metadata.Finalizers...)','finalizers := append([]string{"existing"}, []string{"retained"}...)');assert.notEqual(changed,files[main]);fs.writeFileSync(path.join(root,main),changed);
  const run=spawnSync(process.env.KUBECLAW_DOCS_GO_BINARY??'go',['run',new URL('../docs-api-go-output-role-adapter.go',import.meta.url).pathname],{input:JSON.stringify(paths.filter(file=>file.endsWith(".go")).map(file=>({path:path.join(root,file)}))),encoding:'utf8',maxBuffer:32*1024*1024});assert.equal(run.status,0,run.stderr);const actual=JSON.parse(run.stdout),refreshed=structuredClone(selected);
  for(const contract of refreshed.nativeLanguageSerializationContracts)for(const receipt of contract.outputs){const output=actual.find(output=>path.relative(root,output.path)===contract.source&&output.function===receipt.function&&output.expression===receipt.expression);assert(output);receipt.operationDigest=createHash('sha256').update(output.operation).digest('hex');receipt.dependencyFacts=output.dependencies.map(fact=>({...fact,path:path.relative(root,fact.path)}));receipt.dependencyFactsDigest=createHash('sha256').update(JSON.stringify(receipt.dependencyFacts)).digest('hex');}
  fs.writeFileSync(path.join(root,authority),JSON.stringify(refreshed));check(roles(),true);
  const finiteBranches=fixtureControllerShapes(root).filter(output=>output.context.path===main&&output.context.line===754),finiteFinalizer=branch(finiteBranches,true),finiteInherited=branch(finiteBranches,false);assert(finiteFinalizer&&finiteInherited);
  assert.deepEqual(finiteInherited.value.metadata.finalizers,['existing','retained']);
  assert.deepEqual(finiteFinalizer.value.metadata.finalizers,['existing','retained',{__docsDynamicExpression:'c.finalizer'}]);
 });
});

test('native Python systemd repair rejects refreshed receipts for changed byte constructors',()=>{
 const source='scripts/repair-k3s-reservation-arguments.py',authority='scripts/docs-api-producer-adapter-authorities.json',bytes=fs.readFileSync(new URL('../..//'+source,import.meta.url),'utf8'),registry=JSON.parse(fs.readFileSync(new URL('../docs-api-producer-adapter-authorities.json',import.meta.url),'utf8'));
 const selected={nativeLanguageSerializationContracts:registry.nativeLanguageSerializationContracts.filter(contract=>contract.source===source)};
 sourceFixture({[source]:bytes,[authority]:JSON.stringify(selected)},root=>assert.doesNotThrow(()=>discoverScriptApiOutputs(root)));
 for(const changed of [bytes.replace('corrected = repair(original)',"corrected = __import__('sys').argv[1]"),bytes.replace('original = unit.read_text()',"original = __import__('sys').argv[1]"),bytes.replace('return "".join(lines[:start]) + changed + "".join(lines[end + 1:])',"return text")])sourceFixture({[source]:changed,[authority]:JSON.stringify(selected)},root=>{
  const run=spawnSync('python3',[new URL('../docs-api-python-output-adapter.py',import.meta.url).pathname,path.join(root,source),'--classify'],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);const outputs=JSON.parse(run.stdout),refreshed=structuredClone(selected);for(const contract of refreshed.nativeLanguageSerializationContracts[0].outputs){const output=outputs.find(output=>output.expression===contract.expression);assert(output);contract.operationDigest=createHash('sha256').update(output.operation).digest('hex');}fs.writeFileSync(path.join(root,authority),JSON.stringify(refreshed));assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/);
 });
});

test('native Go HTTP consumers reject refreshed receipts for replaced response constructors',()=>{
 const repository=path.resolve(import.meta.dirname,'../..'),authority='scripts/docs-api-producer-adapter-authorities.json',registry=JSON.parse(fs.readFileSync(path.join(repository,authority),'utf8')),selected={nativeLanguageSerializationContracts:registry.nativeLanguageSerializationContracts.filter(contract=>contract.source.startsWith('cmd/buster-namespace-controller/'))};
 const paths=[...new Set(['charts/kubeclaw/templates/buster-namespace-lease-crd.yaml',...selected.nativeLanguageSerializationContracts.flatMap(contract=>contract.outputs.flatMap(output=>output.dependencyFacts.map(fact=>fact.path)))])],files=Object.fromEntries(paths.map(file=>[file,fs.readFileSync(path.join(repository,file),'utf8')]));
 sourceFixture({...files,[authority]:JSON.stringify(selected)},root=>{
  assertOriginalControllerUnsupported(root);const before=fixtureGoRoleCapture(root).filter(role=>role.function==='readinessHandler'&&/^json.NewEncoder/u.test(role.expression));assert(before.length);assert(before.every(role=>fixtureNativeConsumerMatches(root,role)));
  const source='cmd/buster-namespace-controller/demo-readiness.go',bytes=files[source];
  fs.writeFileSync(path.join(root,source),bytes.replace('"retentionSeconds": seconds, "schemaVersion": "demo-ready-response.v1"','"apiVersion": "v1", "kind": "Secret", "retentionSeconds": seconds, "schemaVersion": "demo-ready-response.v1"'));
  const run=spawnSync(process.env.KUBECLAW_DOCS_GO_BINARY??'go',['run',new URL('../docs-api-go-output-role-adapter.go',import.meta.url).pathname],{input:JSON.stringify(paths.filter(file=>file.endsWith(".go")).map(file=>({path:path.join(root,file)}))),encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(run.status,0,run.stderr);const outputs=JSON.parse(run.stdout);
  for(const contract of selected.nativeLanguageSerializationContracts)for(const record of contract.outputs){const output=outputs.find(output=>path.relative(root,output.path)===contract.source&&output.function===record.function&&output.expression===record.expression);assert(output);record.operationDigest=createHash('sha256').update(output.operation).digest('hex');record.dependencyFacts=output.dependencies.map(fact=>({...fact,path:path.relative(root,fact.path)}));record.dependencyFactsDigest=createHash('sha256').update(JSON.stringify(record.dependencyFacts)).digest('hex');}
  fs.writeFileSync(path.join(root,authority),JSON.stringify(selected));const changed=outputs.filter(role=>role.function==='readinessHandler'&&/^json.NewEncoder/u.test(role.expression));assert(changed.length);assert(changed.every(role=>!fixtureNativeConsumerMatches(root,role)),'changed response constructor must not inherit the original receipt consumer');
 });
});


test('native product status API-read root binds original CRD control on repeated and fresh unsupported discovery',()=>{
 const repository=path.resolve(import.meta.dirname,'../..'),authority='scripts/docs-api-producer-adapter-authorities.json',schema='charts/kubeclaw/templates/buster-namespace-lease-crd.yaml';
 const registry=JSON.parse(fs.readFileSync(path.join(repository,authority),'utf8')),selected={nativeLanguageSerializationContracts:registry.nativeLanguageSerializationContracts.filter(contract=>contract.source.startsWith('cmd/buster-namespace-controller/'))};
 const paths=[...new Set([schema,...selected.nativeLanguageSerializationContracts.flatMap(contract=>contract.outputs.flatMap(output=>output.dependencyFacts.map(fact=>fact.path)))])],files=Object.fromEntries(paths.map(file=>[file,fs.readFileSync(path.join(repository,file),'utf8')]));
 const marker='                        required: [schemaVersion, decisionId, payloadDigest, action, leaseName, leaseUID, readyDigest, generation, actorId, issuer, appliedAt, previousExpiry, expiresAt, state, envelope]\n                        properties:\n';assert(files[schema].includes(marker));
 const changes=[
  bytes=>bytes.replace(marker,marker+'                          apiVersion:\n                            type: string\n                          kind:\n                            type: string\n'),
  bytes=>bytes.replace(marker,'                        x-kubernetes-preserve-unknown-fields: true\n'+marker),
  bytes=>bytes.replace('            status:\n              type: object','            status:\n              x-kubernetes-preserve-unknown-fields: true\n              type: object'),
  bytes=>bytes.replace('spec:\n  group:', 'spec:\n  preserveUnknownFields: true\n  group:'),
  bytes=>bytes.replace('                      items:\n                        type: object\n                        x-kubernetes-validations:', '                      items:\n                        type: object\n                        additionalProperties: true\n                        x-kubernetes-validations:'),
 ];
 for(const change of changes)sourceFixture({...files,[authority]:JSON.stringify(selected)},root=>{
  assertOriginalControllerUnsupported(root);const before=fixtureGoRoleCapture(root).filter(role=>role.function==='productHandler'&&/^json.NewEncoder/u.test(role.expression));assert(before.length);assert(before.every(role=>fixtureNativeConsumerMatches(root,role)),'original selected response receipt must qualify independently of unsupported error publication');
  const changed=change(files[schema]);assert.notEqual(changed,files[schema]);fs.writeFileSync(path.join(root,schema),changed);
  const expected=/HTTP_RESPONSE_SCHEMA_AUTHORITY_UNQUALIFIED: charts\/kubeclaw\/templates\/buster-namespace-lease-crd.yaml: \$\.status\.demoProduct\.decisions\.items/;
  assert.throws(()=>discoverGoApiOutputs(root),expected,'repeated original discovery must reject changed schema authority before error publication');
  sourceFixture({...files,[schema]:changed,[authority]:JSON.stringify(selected)},fresh=>assert.throws(()=>discoverGoApiOutputs(fresh),expected));
  fs.writeFileSync(path.join(root,schema),files[schema]);assertOriginalControllerUnsupported(root);const recovered=fixtureGoRoleCapture(root).filter(role=>role.function==='productHandler'&&/^json.NewEncoder/u.test(role.expression));assert.deepEqual(recovered,before);assert(recovered.every(role=>fixtureNativeConsumerMatches(root,role)));
 });
 sourceFixture({...files,[authority]:JSON.stringify(selected)},root=>{
  assertOriginalControllerUnsupported(root);fs.unlinkSync(path.join(root,schema));assert.throws(()=>discoverGoApiOutputs(root),/HTTP_RESPONSE_SCHEMA_AUTHORITY_UNQUALIFIED/);
 });
});

test('recognized stdlib log and HTTP error output wrappers cannot silently disappear',()=>{
 const api='`{"apiVersion":"v1","kind":"Secret"}`';
 for(const body of ['import "log"\nfunc main(){log.SetFlags(0);log.SetPrefix("");log.Print('+api+')}','import "net/http"\nfunc handler(w http.ResponseWriter,r *http.Request){http.Error(w,'+api+',200)};func main(){http.HandleFunc("/",handler)}','import logger "log"\nvar emit=logger.Print;func main(){emit('+api+')}','import "log"\nfunc relay(f func(...any)){};func main(){relay(log.Print)}','import "net/http"\nvar emit=http.Error;func handler(w http.ResponseWriter){emit(w,'+api+',200)}'])sourceFixture({'bin/output-wrapper.go':'package main\n'+body},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED:.*output-wrapper.go/));
 sourceFixture({'bin/output-wrapper.go':'package main\nimport "net/http"\nfunc handler(w http.ResponseWriter){http.Error(w,"fixed diagnostic",400)}'},root=>assert.doesNotThrow(()=>discoverGoApiOutputs(root)));
});

// These fixture helpers inspect selected actual AST consumer/shape boundaries.
// They are NOT whole-source admission: the full original controller has the
// separately asserted unsupported product HTTP error publication. No source
// or operation is removed; all roles remain in the capture.
function fixtureGoRoleCapture(root) {
 const files=fs.readdirSync(root,{recursive:true}).filter(file=>file.endsWith('.go')&&!file.endsWith('_test.go'));
 const run=spawnSync(process.env.KUBECLAW_DOCS_GO_BINARY??'go',['run',new URL('../docs-api-go-output-role-adapter.go',import.meta.url).pathname],{input:JSON.stringify(files.map(file=>({path:path.join(root,file)}))),encoding:'utf8',maxBuffer:32*1024*1024});assert.equal(run.status,0,run.stderr);return JSON.parse(run.stdout);
}
function fixtureNativeConsumerMatches(root,role) {
 const registry=JSON.parse(fs.readFileSync(path.join(root,'scripts/docs-api-producer-adapter-authorities.json'),'utf8'));
 return nativeOutputConsumerMatches(role,registry.nativeLanguageSerializationContracts.filter(contract=>contract.source===path.relative(root,role.path)).flatMap(contract=>contract.outputs),root);
}
function fixtureControllerShapes(root,{transport=true}={}) {
 const roles=fixtureGoRoleCapture(root);
 if(transport){const selected=roles.filter(role=>['kube','requestPayload'].includes(role.function));assert(selected.length);assert(selected.every(role=>fixtureNativeConsumerMatches(root,role)),'FINITE_TRANSPORT_CONSUMER_UNQUALIFIED');}
 const files=fs.readdirSync(root,{recursive:true}).filter(file=>file.endsWith('.go')&&!file.endsWith('_test.go'));
 const run=spawnSync(process.env.KUBECLAW_DOCS_GO_BINARY??'go',['run',new URL('../docs-api-go-output-shapes.go',import.meta.url).pathname],{input:JSON.stringify(files.map(file=>path.join(root,file))),encoding:'utf8',maxBuffer:32*1024*1024});assert.equal(run.status,0,run.stderr);
 return Object.entries(JSON.parse(run.stdout)).flatMap(([absolute,objects])=>objects.map((object,index)=>({value:object.value,context:{...object,apiVersion:object.value.apiVersion,kind:object.value.kind,path:path.relative(root,absolute),document:index,sourceDigest:createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'),producer:'go-shape',outputDigest:createHash('sha256').update(JSON.stringify(object.value)).digest('hex'),...(object.factoryDependencies?{factoryDependencies:object.factoryDependencies.map(dependency=>({...dependency,path:path.relative(root,dependency.path)}))}:{})}})));
}
function assertOriginalControllerUnsupported(root) {
 assert.throws(()=>discoverGoApiOutputs(root),/demo-product.go:422:.*unsupported API-read error-result authority for productHandler/);
 const unsupported=fixtureGoRoleCapture(root).find(role=>role.function==='productHandler'&&role.expression==='http.Error(w, code, 409)');assert(unsupported);assert.equal(unsupported.authorityQualified,false);assert.equal(unsupported.role,'unknown');
}

function fixtureShapeReceiverSelection(root,output,records) {
 // Separate receiver/schema fixture. The input comes from the actual AST
 // shape, but this authored YAML does NOT claim original Go source admission.
 const source='receiver-shape-fixture.yaml',bytes=YAML.stringify(output.value);fs.writeFileSync(path.join(root,source),bytes);
 const context={apiVersion:output.context.apiVersion,kind:output.context.kind,path:source,document:0,sourceDigest:createHash('sha256').update(bytes).digest('hex'),...(output.context.requestMethod?{requestMethod:output.context.requestMethod}:{}),...(output.context.conditions?{conditions:output.context.conditions}:{}),...(output.context.requestAlternatives?{requestAlternatives:output.context.requestAlternatives}:{})};
 return apiProductSelection(context.apiVersion,context.kind,[context],records,root);
}


test('original guarded readiness HTTP error code binds its actual finite allowlist helpers',()=>{
 const repository=path.resolve(import.meta.dirname,'../..'),authority='scripts/docs-api-producer-adapter-authorities.json',registry=JSON.parse(fs.readFileSync(path.join(repository,authority),'utf8')),selected={nativeLanguageSerializationContracts:registry.nativeLanguageSerializationContracts.filter(contract=>contract.source.startsWith('cmd/buster-namespace-controller/'))};
 const paths=[...new Set(['charts/kubeclaw/templates/buster-namespace-lease-crd.yaml',...selected.nativeLanguageSerializationContracts.flatMap(contract=>contract.outputs.flatMap(output=>output.dependencyFacts.map(fact=>fact.path)))])],files=Object.fromEntries(paths.map(file=>[file,fs.readFileSync(path.join(repository,file),'utf8')])),main='cmd/buster-namespace-controller/main.go';
 const original='func contains(values []string, target string) bool {\n\tfor _, value := range values {\n\t\tif value == target {\n\t\t\treturn true\n\t\t}\n\t}\n\treturn false\n}';assert(files[main].includes(original));
 for(const change of [bytes=>bytes.replace(original,'func contains(values []string, target string) bool { return true }'),bytes=>bytes+'\n'+original+'\n',bytes=>bytes.replace('return e.message','message := e.message\n\te.message = "apiVersion: v1\\nkind: Secret"\n\treturn message')])sourceFixture({...files,[authority]:JSON.stringify(selected)},root=>{
  assertOriginalControllerUnsupported(root);
  const before=fixtureGoRoleCapture(root).find(role=>role.expression==='http.Error(w, readyErrorCode(err), 409)');assert(before);assert.equal(before.role,'non-api');assert.equal(before.authorityQualified,true);
  fs.writeFileSync(path.join(root,main),change(files[main]));
  const changed=fixtureGoRoleCapture(root).find(role=>role.expression===before.expression);assert(changed);assert.equal(changed.operation,before.operation);assert.equal(changed.role,'unknown','changed or duplicate allowlist helper must not inherit the original diagnostic purpose');
 });
});

test('ordinary Python exception and pattern capture cannot impersonate the imported serializer',()=>{
 const source='scripts/inspect-data-plane-mtls.py',bytes=fs.readFileSync(new URL('../..//'+source,import.meta.url),'utf8'),authority=JSON.parse(fs.readFileSync(new URL('../docs-api-producer-adapter-authorities.json',import.meta.url),'utf8')),registry={nativeLanguageSerializationContracts:authority.nativeLanguageSerializationContracts.filter(record=>record.source===source)};
 const guard='    context = os.environ.get("KUBE_CONTEXT")',start=bytes.indexOf('    result = inventory('),end=bytes.indexOf('\n\n\nif __name__',start);assert(start>0&&end>start);
 const declarations='\nclass SerializerError(Exception):\n    def loads(self, value):\n        return json.loads(value)\n    def dumps(self, value, indent=None):\n        return \'{"apiVersion":"v1","kind":"Secret"}\'\n\n';
 for(const [name,header]of [['exception','    try:\n        raise SerializerError()\n    except SerializerError as json:\n'],['match','    match SerializerError():\n        case json:\n']]) {
  // Keep original main/get/inventory work in the active lexical capture, so
  // the nested read helper really resolves the captured delegating codec.
  const mainStart=bytes.indexOf('def main():\n'),body=bytes.slice(mainStart+'def main():\n'.length,end),indent=name==='exception'?'    ':'        ',changed=bytes.slice(0,mainStart)+declarations+'def main():\n'+header+body.split('\n').map(line=>indent+line).join('\n')+bytes.slice(end);
  assert(changed.includes('return json.loads(value)')&&changed.includes(guard.trim()));
  sourceFixture({[source]:bytes,'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)},root=>{assert.deepEqual(discoverScriptApiOutputs(root),[]);fs.writeFileSync(path.join(root,source),changed);assert.throws(()=>discoverScriptApiOutputs(root),/PYTHON_SERIALIZED_OUTPUT_ROLE_UNQUALIFIED: scripts\/inspect-data-plane-mtls.py/);});
 }
 for(const body of ['try:\n raise issue\nexcept ValueError as json:\n print(json.dumps({"report":True}))','match value:\n case {"codec": json}:\n  print(json.dumps({"report":True}))','match value:\n case [*json]:\n  print(json.dumps({"report":True}))','match value:\n case {"codec": other, **json}:\n  print(json.dumps({"report":True}))','with manager as json:\n print(json.dumps({"report":True}))'])sourceFixture({'bin/captured.py':'import json\n'+body+'\n'},root=>assert.throws(()=>discoverScriptApiOutputs(root),/PYTHON_SERIALIZED_OUTPUT_ROLE_UNQUALIFIED: bin\/captured.py/));
 sourceFixture({'bin/captured.py':'import json\ntry:\n raise issue\nexcept ValueError as other:\n print(json.dumps({"report":True}))\n'},root=>assert.deepEqual(discoverScriptApiOutputs(root),[]));
});

test('shared Go private output parameter authority rejects indirect helper references and mutations',()=>{
 const api='`{"apiVersion":"v1","kind":"Secret"}`',helper='package main\nimport("net/http";"fmt";"os")\nfunc emit(w http.ResponseWriter,text string){http.Error(w,text,200)}\nfunc ordinary(w http.ResponseWriter){emit(w,"ordinary diagnostic")}\n';
 for(const added of ['func handler(w http.ResponseWriter){callback:=emit;callback(w,'+api+')}','var callback=emit;func handler(w http.ResponseWriter){callback(w,'+api+')}','func relay(f func(http.ResponseWriter,string)){};func call(){relay(emit)}','func returned()func(http.ResponseWriter,string){return emit}','var callbacks=[]func(http.ResponseWriter,string){emit}','var box=struct{emit func(http.ResponseWriter,string)}{emit}'])for(const crossFile of [false,true])sourceFixture({'cmd/probe/main.go':helper,...(crossFile?{'cmd/probe/other.go':'package main\nimport "net/http"\n'+added}:{'cmd/probe/main.go':helper+added})},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED:.*main.go:.*http.Error/));
 for(const mutation of ['text="first";text='+api+';', 'text='+api+';', 'ptr:=&text;*ptr='+api+';', 'alter(&text);','text += os.Args[1];'])sourceFixture({'cmd/probe/main.go':helper.replace('http.Error(w,text,200)',mutation+'http.Error(w,text,200)')},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED:.*http.Error/));
 for(const sink of ['fmt.Print(text)','os.Stdout.WriteString(text)'])sourceFixture({'cmd/probe/main.go':helper.replace('http.Error(w,text,200)',sink)+'var callback=emit'},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/));
 sourceFixture({'cmd/probe/main.go':helper,'cmd/probe/other.go':'package main\nimport "net/http"\nfunc other(w http.ResponseWriter){emit(w,"ordinary diagnostic")}'},root=>assert.deepEqual(discoverGoApiOutputs(root),[]));
 sourceFixture({'cmd/probe/main.go':helper.replace('http.Error(w,text,200)','http.Error(w,text,200);text="ordinary diagnostic"').replace('emit(w,"ordinary diagnostic")','emit(w,'+api+')')},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/));
});

import { assertDocumentationExecutableRole } from '../docs-api-documentation-role-custody.mjs';
test('actual full native documentation executable custody admits only the prepared source-purpose receipts',()=>{
 const repository=path.resolve(import.meta.dirname,'../..');
 for(const source of ['scripts/docs-api-python-output-adapter.py','scripts/docs-api-go-output-role-adapter.go','scripts/docs-api-python-ast-v1.py'])assert.doesNotThrow(()=>assertDocumentationExecutableRole(repository,source));
 for(const source of ['scripts/docs-api-python-output-adapter.py','scripts/docs-api-go-output-role-adapter.go']){
  const bytes=fs.readFileSync(path.join(repository,source),'utf8'),changed=bytes+(source.endsWith('.py')?'\nimport subprocess\nsubprocess.run(["must-not-execute"])\n':'\nfunc init(){os.WriteFile("must-not-execute",[]byte("unqualified"),0600)}\n');
  sourceFixture({[source]:changed},root=>{assert.throws(()=>assertDocumentationExecutableRole(root,source),/native executable\/import\/initialization operations changed/);assert(!fs.existsSync(path.join(root,'must-not-execute')));});
 }
});

test('native Go actual typed method dispatch rejects raw output and stale serializer roots',()=>{
 const method='func(message) String()string{return `{"apiVersion":"v1","kind":"Secret"}`}';
 for(const body of ['func emit(text message){fmt.Fprintln(os.Stdout,text)};func main(){emit("ordinary diagnostic")}','func main(){var text message="ordinary diagnostic";fmt.Fprintln(os.Stdout,text)}','func main(){const text message="ordinary diagnostic";fmt.Fprintln(os.Stdout,text)}','type alias=message;func emit(text alias){fmt.Fprintln(os.Stdout,text)};func main(){emit("ordinary diagnostic")}']){
  const baseline='package main\nimport("fmt";"os")\ntype message string\n'+body;
  sourceFixture({'cmd/probe/main.go':baseline},root=>assert.deepEqual(discoverGoApiOutputs(root),[]));
  sourceFixture({'cmd/probe/main.go':baseline+'\n'+method},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED:.*fmt.Fprintln/));
 }
 const source='cmd/probe/main.go',baseline='package main\nimport("bytes";"encoding/json";"io")\ntype document map[string]interface{}\nfunc requestPayload(body interface{})(io.Reader,error){if body==nil{return nil,nil};data,err:=json.Marshal(body);if err!=nil{return nil,err};return bytes.NewReader(data),nil}\nfunc caller()(io.Reader,error){var value document=map[string]interface{}{"apiVersion":"v1","kind":"ConfigMap"};return requestPayload(value)}\n';
 sourceFixture({[source]:baseline},root=>{
  const run=spawnSync(process.env.KUBECLAW_DOCS_GO_BINARY??'go',['run',new URL('../docs-api-go-output-role-adapter.go',import.meta.url).pathname],{input:JSON.stringify([{path:path.join(root,source)}]),encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  const operation=JSON.parse(run.stdout).find(r=>r.expression==='json.Marshal(body)'),facts=operation.dependencies.map(f=>({...f,path:path.relative(root,f.path)})),sha=text=>createHash('sha256').update(text).digest('hex');
  const registry={nativeLanguageSerializationContracts:[{source,language:'Go',outputs:[{expression:operation.expression,function:operation.function,operationDigest:sha(operation.operation),dependencyFacts:facts,dependencyFactsDigest:sha(JSON.stringify(facts)),consumer:{kind:'go-kubernetes-payload',source,purpose:'Synthetic finite native payload consumer',evidence:['return bytes.NewReader(data), nil']}}]}]},authority=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');
  fs.mkdirSync(path.dirname(authority),{recursive:true});const frozen=JSON.stringify(registry);fs.writeFileSync(authority,frozen);
  assert.equal(discoverGoApiOutputs(root)[0].value.kind,'ConfigMap');
  fs.appendFileSync(path.join(root,source),'func(document) MarshalJSON()([]byte,error){return []byte(`{"apiVersion":"v1","kind":"Secret"}`),nil}\n');
  assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED:.*json.Marshal\(body\)/);
  assert.equal(fs.readFileSync(authority,'utf8'),frozen);
 });
});

test('native Python callable encoder option authority rejects whole publications and keeps formatting neighbors',()=>{
 const encoder='import json\nimport sys\nclass Counterfeit:\n def __init__(self,**options):pass\n def encode(self,value):return \'{"apiVersion":"v1","kind":"Secret"}\'\n def iterencode(self,value):return [self.encode(value)]\n';
 for(const call of ['print(json.dumps({"report":True},cls=Counterfeit))','print(json.dumps({"report":True},**{"cls":Counterfeit}))','json.dump({"report":True},sys.stdout,cls=Counterfeit)','print(json.dumps({"report":True},**options))'])sourceFixture({'bin/probe.py':encoder+call},root=>assert.throws(()=>discoverScriptApiOutputs(root),/PYTHON_SERIALIZED_OUTPUT_ROLE_UNQUALIFIED: bin\/probe.py/));
 for(const options of ['indent=2,sort_keys=True','separators=(",",":"),cls=None','**{"indent":2,"sort_keys":True}'])sourceFixture({'bin/probe.py':'import json\nprint(json.dumps({"report":True},'+options+'))'},root=>assert.deepEqual(discoverScriptApiOutputs(root),[]));
});
