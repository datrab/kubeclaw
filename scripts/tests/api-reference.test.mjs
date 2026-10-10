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
import { discoverScriptApiOutputs, discoverGoApiOutputs, discoverShellApiOutputs } from '../docs-api-output-discovery.mjs';
import { upstreamApiReference } from '../docs-api-reference.mjs';

function sourceFixture(contents, run) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'api-discovery-mutation-'));
  try {
    for(const [source,bytes]of Object.entries(contents)){fs.mkdirSync(path.dirname(path.join(root,source)),{recursive:true});fs.writeFileSync(path.join(root,source),bytes);}
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
import { assertProducerAdapterAuthority,producerAdapterOperationRecipe,shellRawOutputSinks } from '../docs-api-output-discovery.mjs';

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
  fs.writeFileSync(path.join(root,'scripts/install.sh'),source);fs.writeFileSync(path.join(root,'scripts/new-install.sh'),'helm install new new/chart --version 1.0.0\n');assert.throws(()=>discoverShellApiOutputs(root),/API_PRODUCT_ADAPTER_OPERATION_UNCLASSIFIED/);
  fs.writeFileSync(path.join(root,'scripts/new-install.sh'),'args=(upgrade --install new new/chart)\nhelm "${args[@]}"\n');assert.throws(()=>discoverShellApiOutputs(root),/API_PRODUCT_ADAPTER_OPERATION_UNCLASSIFIED/);
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
 sourceFixture({'bin/new.sh':'kubectl create configmap new --from-literal=a=b --dry-run=client -o yaml | sed s/ConfigMap/Secret/ | kubectl apply -f -\n'},root=>assert.throws(()=>discoverShellApiOutputs(root),/API_PRODUCT_SHELL_PIPELINE_UNQUALIFIED/));
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

import { classifySerializedOutputRoles } from '../docs-api-output-role-classification.mjs';
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
 sourceFixture({'bin/new.go':'package main\nimport("encoding/json";"os")\nfunc main(){var body any;json.NewDecoder(os.Stdin).Decode(&body);json.NewEncoder(os.Stdout).Encode(body)}\n'},root=>assert.throws(()=>discoverGoApiOutputs(root),/API_PRODUCT_GO_SERIALIZED_OUTPUT_ROLE_UNQUALIFIED/));
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
 const registry={kubernetesCommandContracts:[{source,basis:'actual-get-only-caller',operations:[{source,recipeRef:source}]}],nativeRoleOperationTuples:{[source]:producerAdapterOperationRecipe(source,original).statements}};
 sourceFixture({[source]:original,'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)},root=>{
  assert.doesNotThrow(()=>discoverScriptApiOutputs(root));fs.writeFileSync(path.join(root,source),original.replace("['get','pods']","['apply','-f','-']"));assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/);
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
test('changing an original shell sink cannot reuse its source operation recipe',()=>{
 const source='bin/native.sh',bytes="BODY=initial;printf '%s' \"$BODY\" | sed 's/x/y/'\n";
 const registry={shellRawOutputContracts:[{source,role:'non-api',basis:'fixture native consumer',sinks:shellRawOutputSinks(source,bytes),operationRecipe:producerAdapterOperationRecipe(source,bytes)}]};
 sourceFixture({[source]:bytes,'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)},root=>{
  assert.doesNotThrow(()=>discoverShellApiOutputs(root));fs.writeFileSync(path.join(root,source),bytes.replace('s/x/y/','s/x/z/'));assert.throws(()=>discoverShellApiOutputs(root),/SHELL_RAW_OUTPUT_ROLE_UNQUALIFIED/);
 });
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
 const operations=[{source,recipeRef:source}],registry={nativeRoleOperationTuples:{[source]:producerAdapterOperationRecipe(source,bytes).statements},nonApiOutputContracts:[{source,sink:'fs.writeFileSync',expression:'JSON.stringify(value)',role:'api-capable-utility',basis:'fixture generic native file capability',operations}],nativeFileWriterCapabilities:[{source,export:'store',inputParameter:'value',operations}]};
 for(const call of ["const save=store;const third=save;third('public.yaml',JSON.parse(process.argv[2]));","const save=store.bind(null,'public.yaml');save(JSON.parse(process.argv[2]));","store.call(null,'public.yaml',JSON.parse(process.argv[2]));","store.apply(null,['public.yaml',JSON.parse(process.argv[2])]);"]){sourceFixture({[source]:bytes,'bin/new.mjs':"import{store}from'../scripts/native-store.mjs';"+call,'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));}
});
test('reassigned stdout and file writer aliases reject unsupported publication operations',()=>{
 for(const bytes of ["let emit=()=>{};emit=console.log;emit(JSON.parse(process.argv[2]));","import fs from'node:fs';let write=fs.writeFileSync;write=process.argv[2];write('public.yaml',{status:'ok'});","let write;write=require('fs').writeFileSync;write('public.yaml',process.argv[2]);"]){sourceFixture({'bin/new.mjs':bytes},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));}
});
test('unsupported writer prototype calls, containers and callback escapes cannot hide output',()=>{
 for(const bytes of ["import fs from'node:fs';fs.writeFileSync.call(null,'public.yaml',process.argv[2]);","console.log.apply(null,[JSON.parse(process.argv[2])]);","import fs from'node:fs';const box={save:fs.writeFileSync};box.save('public.yaml',process.argv[2]);","invoke(console.log,JSON.parse(process.argv[2]));"]){sourceFixture({'bin/new.mjs':bytes},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));}
});
test('workspace package wildcard exports retain native writer input qualification',()=>{
 const source='node_modules/@kubeclaw/fixture/native-store.mjs',bytes="import fs from'node:fs';export function store(file,value){fs.writeFileSync(file,JSON.stringify(value));}",operations=[{source,recipeRef:source}];
 const registry={nativeRoleOperationTuples:{[source]:producerAdapterOperationRecipe(source,bytes).statements},nonApiOutputContracts:[{source,sink:'fs.writeFileSync',expression:'JSON.stringify(value)',role:'api-capable-utility',basis:'fixture generic native file capability',operations}],nativeFileWriterCapabilities:[{source,export:'store',inputParameter:'value',operations}]};
 sourceFixture({[source]:bytes,'node_modules/@kubeclaw/fixture/package.json':JSON.stringify({name:'@kubeclaw/fixture',exports:{'./*':'./*.mjs'}}),'bin/new.mjs':"import{store}from'@kubeclaw/fixture/native-store';store('public.yaml',JSON.parse(process.argv[2]));",'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)},root=>assert.throws(()=>discoverScriptApiOutputs(root),/OUTPUT_ROLE_UNQUALIFIED/));
});
test('diamond reexports and repeated writer calls keep independent input qualification',()=>{
 const source='scripts/native-store.mjs',bytes="import fs from'node:fs';export function store(file,value){fs.writeFileSync(file,JSON.stringify(value));}",operations=[{source,recipeRef:source}],registry={nativeRoleOperationTuples:{[source]:producerAdapterOperationRecipe(source,bytes).statements},nonApiOutputContracts:[{source,sink:'fs.writeFileSync',expression:'JSON.stringify(value)',role:'api-capable-utility',basis:'fixture generic native file capability',operations}],nativeFileWriterCapabilities:[{source,export:'store',inputParameter:'value',operations}]};
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
 const source='tools/native-worker-nri/main.go',bytes=fs.readFileSync(new URL('../..//'+source,import.meta.url),'utf8'),registry={nativeLanguageSerializationContracts:[{source,language:'Go',basis:'original native diagnostic fixture',operation:{syntax:bytes}}]};
 sourceFixture({[source]:bytes,'scripts/docs-api-producer-adapter-authorities.json':JSON.stringify(registry)},root=>{assert.doesNotThrow(()=>discoverGoApiOutputs(root));fs.writeFileSync(path.join(root,source),bytes.replace('fmt.Fprintln(os.Stderr, err)','fmt.Fprintf(os.Stderr,"%s",os.Args[1])'));assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/);});
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
 for(const call of ['fmt.Print("a",os.Args[1])','fmt.Printf("a%s",os.Args[1])','fmt.Fprint(os.Stdout,"a",os.Args[1])','fmt.Printf("status: %s\\n",os.Args[1])','fmt.Print("api","Version: v1\\nkind: Secret\\n")'])sourceFixture({'bin/new.go':'package main\nimport "os"\nimport "fmt"\nfunc main(){'+call+'}\n'},root=>assert.throws(()=>discoverGoApiOutputs(root),/GO_RAW_OUTPUT_ROLE_UNQUALIFIED/));
 sourceFixture({'bin/new.go':'package main\nimport "fmt"\nfunc main(){fmt.Print("native"," literal")}\n'},root=>assert.doesNotThrow(()=>discoverGoApiOutputs(root)));
});
