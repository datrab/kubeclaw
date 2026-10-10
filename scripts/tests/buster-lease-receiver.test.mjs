import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';
import {receiverContracts,busterLeaseReceiverContracts} from '../docs-buster-lease-receiver-contracts.mjs';
const get=(path)=>{const r=receiverContracts.find(r=>r.fieldPath===path);assert(r,`Missing ${path}`);return r;};
const root=new URL('../../',import.meta.url);
function ownedSchema(){
 const text=fs.readFileSync(new URL('charts/kubeclaw/templates/buster-namespace-lease-crd.yaml',root),'utf8')
  .replace(/^.*\{\{.*(?:if |end|include |toYaml ).*\}\}.*\n/gm,'')
  .replace(/\{\{\s*\.Values\.busterNamespaceBroker\.leaseApiGroup\s*\}\}/g,'kubeclaw.forgestack.ai')
  .replace(/\{\{\s*\.Values\.busterNamespaceBroker\.leaseApiVersion\s*\}\}/g,'v1alpha1')
  .replace(/\{\{\s*\.Values\.busterNamespaceBroker\.maxTtlSeconds\s*\}\}/g,'86400')
  .replace(/(namespacePrefix:\s*\n\s*type: string\s*\n\s*enum:)\s*\n/,'$1 [test]\n');
 return YAML.parse(text).spec.versions[0].schema.openAPIV3Schema;
}
function walk(node,path='$',rows=new Map()){
 rows.set(path,node);
 for(const [name,child] of Object.entries(node.properties??{}))walk(child,`${path}.${name}`,rows);
 if(node.items)walk(node.items,`${path}[]`,rows);
 return rows;
}
test('all owned recursive schema members and structural constraints have authored receivers',()=>{
 const expected=walk(ownedSchema());
 for(const field of ['apiVersion','kind','metadata'])expected.set(`$.${field}`,{});
 assert.deepEqual([...new Set(receiverContracts.map(r=>r.fieldPath))].sort(),[...expected.keys()].sort());
 for(const [path,node] of expected){
  const r=get(path);
  for(const [key,value] of Object.entries(node)){
   if(['properties','items','type','description'].includes(key))continue;
   assert(r.crossFieldConditions.some(c=>c===`Owned schema ${key}: ${JSON.stringify(value)}.`),`${path} ${key} drift`);
  }
  assert(r.evidence.every(e=>/blob\/[a-f0-9]{40}\/.+#L\d+-L\d+$/.test(e.url)),path);
 }
});
test('dynamic identity stays exact without inventing metadata child schemas',()=>{
 const custom=busterLeaseReceiverContracts('leases.example.org/v9beta1');
 assert(custom.every(r=>r.authoritySelector.apiVersion==='leases.example.org/v9beta1'));
 assert.match(custom.find(r=>r.fieldPath==='$.apiVersion').invalidValue,/leases\.example\.org\/v9beta1/);
 assert(!custom.some(r=>r.fieldPath.startsWith('$.metadata.')));
 assert.match(get('$.metadata').crossFieldConditions.join(' '),/opaqueObjectMeta/);
 assert.match(get('$.kind').omitted,/MissingKind/);
});
test('condition observations cannot be used as complete readiness authority',()=>{
 assert.match(get('$.status.conditions[].status').changeImpact,/Ready.*CredentialsReady=False.*ExposureReady=False/);
 assert.match(get('$.status.conditions[].lastTransitionTime').changeImpact,/does not preserve/);
 assert.match(get('$.status.demoReadiness').changeImpact,/authenticated.*live source.*schema-valid status object alone/);
 assert(get('$.status.demoReadiness').evidence.some(e=>e.url.includes('/demo-readiness-sources.go#L53-L103')));
});
test('immutability and append-only decisions retain transition conditions',()=>{
 const spec=ownedSchema().properties.spec;
 const immutable=spec['x-kubernetes-validations'].map(x=>x.message);
 assert(immutable.includes('testCredentials is immutable'));
 assert(!immutable.includes('purpose is immutable'));
 assert(!immutable.includes('exposure is immutable'));
 assert.match(get('$.spec').changeImpact,/purpose and exposure.*excluded/);
 const product=get('$.status.demoProduct.decisions');
 assert(product.crossFieldConditions.some(c=>c.includes('oldSelf.all')));
 assert(get('$.status.demoProduct.decisions[]').crossFieldConditions.some(c=>c.includes('self == oldSelf')));
 assert(get('$').crossFieldConditions.some(c=>c.includes('recorded human product decisions cannot be removed')));
 assert.match(product.changeImpact,/accept.*without changing expiry.*extend.*array order/);
});
test('dedicated credentials cannot inherit copy permissions or rotate on unresolved creation',()=>{
 const r=get('$.spec.testCredentials');
 assert.match(r.changeImpact,/Every workload-capable.*readers.*copied Secret cannot share/);
 assert.match(get('$.status.generatedCredentials.secretUID').changeImpact,/Same-name replacement.*fails provenance/);
 assert(get('$.status.generatedCredentialIntent').cases.some(c=>c.name==='crash-after-intent'&&/does not silently rotate/.test(c.sourceOutcome)));
 assert.match(get('$.spec.testCredentials.keys').omitted,/Generated.*username\/password.*existing.*requires/);
});
test('retention versions and unresolved exposure stay separate from TTL and timestamp',()=>{
 assert.match(get('$.status.demoReadiness.retentionSeconds').omitted,/v1.*604800.*v2 requires.*no stored-v2 omission default/);
 const exposure=get('$.status.exposureMutation.startedAt');
 assert(exposure.cases.some(c=>/no takeover/.test(c.sourceOutcome)));
 assert.match(exposure.changeImpact,/UID, generation, owner, predecessor lineage/);
 assert.match(get('$.status.runtimeSecurity').changeImpact,/Unavailable.*truncation/);
});
test('rendered policy overrides retain exact custom identity while additions and removals fail closed',()=>{
 const nodes=walk(ownedSchema());
 for(const field of ['apiVersion','kind','metadata'])nodes.set(`$.${field}`,{});
 const boundaries=[...nodes].map(([fieldPath,node])=>({fieldPath,contract:Object.fromEntries(Object.entries(node).filter(([key])=>!['properties','items'].includes(key)))}));
 const ttl=boundaries.find(r=>r.fieldPath==='$.spec.ttlSeconds');ttl.contract.maximum=3600;
 const prefix=boundaries.find(r=>r.fieldPath==='$.spec.namespacePrefix');prefix.contract.enum=['sandbox'];
 const custom=busterLeaseReceiverContracts('lease.example.net/v2',boundaries);
 assert(custom.find(r=>r.fieldPath===ttl.fieldPath).crossFieldConditions.includes('Owned schema maximum: 3600.'));
 assert(custom.find(r=>r.fieldPath===prefix.fieldPath).crossFieldConditions.includes('Owned schema enum: ["sandbox"].'));
 assert.throws(()=>busterLeaseReceiverContracts('lease.example.net/v2',[...boundaries,{fieldPath:'$.spec.newGrant',contract:{type:'string'}}]),/BUSTER_OWNED_BOUNDARY_UNAUTHORED/);
 assert.throws(()=>busterLeaseReceiverContracts('lease.example.net/v2',boundaries.filter(r=>r.fieldPath!=='$.spec.access[].subject')),/BUSTER_OWNED_BOUNDARY_SET_DRIFT/);
});
test('effective access follows bound chart ClusterRoles rather than unused namespaceRole helper',()=>{
 const text=fs.readFileSync(new URL('charts/kubeclaw/templates/buster-namespace-controller.yaml',root),'utf8');
 const rules=mode=>{
  const match=text.match(new RegExp(`kind: ClusterRole\\nmetadata:\\n  name: [^\\n]*-namespace-${mode}\\nrules:([\\s\\S]*?)\\n---`));
  assert(match,mode);return YAML.parse('rules:'+match[1]).rules;
 };
 const tester=rules('tester'),deployer=rules('deployer');
 const grants=(rules,resource,verb)=>rules.some(r=>r.resources.includes(resource)&&r.verbs.includes(verb));
 assert(grants(tester,'pods','get'));assert(!grants(tester,'pods','create'));assert(grants(tester,'jobs','create'));
 assert(grants(deployer,'secrets','get'));assert(grants(deployer,'secrets','list'));assert(grants(deployer,'serviceaccounts','create'));
 assert.match(get('$.spec.access').changeImpact,/deployer.*reads namespace Secrets.*get\/list/);
 assert(get('$.spec.access').qualificationLimits.some(x=>x.includes('BUSTER_RBAC_HELPER_CHART_DIVERGENCE')));
 assert(get('$.spec.access').evidence.some(x=>x.url.includes('buster-namespace-controller.yaml#L24-L67')));
});

// Check producer-to-receiver relationships in the actual sources, not shared
// purpose strings. These checks do not execute Go or a Kubernetes API request.
test('spec trace fields have fixture producers and digest storage but no direct label/readiness consumer',()=>{
 const controllerDirectory=new URL('cmd/buster-namespace-controller/',root);
 const sources=fs.readdirSync(controllerDirectory).filter(p=>p.endsWith('.go')&&!p.endsWith('_test.go'))
  .map(p=>fs.readFileSync(new URL(p,controllerDirectory),'utf8')).join('\n');
 const main=fs.readFileSync(new URL('cmd/buster-namespace-controller/main.go',root),'utf8');
 const labels=main.slice(main.indexOf('func ownerLabels('),main.indexOf('func leaseLabelValue('));
 assert.match(labels,/item\.Metadata\.UID/);assert.match(labels,/item\.Spec\["purpose"\]/);
 assert(!/Spec\["(?:runId|project)"\]/.test(sources),'A new direct trace consumer requires contract review');
 const digest=main.slice(main.indexOf('func leaseSpecDigest('),main.indexOf('func fullLeaseSpecDigest('));
 assert.deepEqual([...digest.matchAll(/delete\(copy, "([^"]+)"\)/g)].map(m=>m[1]).sort(),['exposure','purpose']);
 const fixture=fs.readFileSync(new URL('skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts',root),'utf8');
 assert.match(fixture,/runId: leaseName, project: text\(payload\.project/);
 const ready=fs.readFileSync(new URL('cmd/buster-namespace-controller/demo-readiness.go',root),'utf8');
 assert.match(ready,/"runId": r\.RunID/);
 assert(get('$.spec.runId').evidence.some(e=>e.url.includes('main.go#L1765-L1781')));
 assert(get('$.status.demoReadiness.runId').evidence.some(e=>e.url.includes('demo-readiness.go#L250-L256')));
});
test('published createdAt follows the lease timestamp helper and its parse-error fallback',()=>{
 const main=fs.readFileSync(new URL('cmd/buster-namespace-controller/main.go',root),'utf8');
 const helper=main.slice(main.indexOf('func (c *controller) createdAt('),main.indexOf('// ensureControllerSecretAccess'));
 assert.match(helper,/time\.Parse\(time\.RFC3339, item\.Metadata\.CreationTimestamp\)/);
 assert.match(helper,/if err != nil \{\s*return time\.Now\(\)\.UTC\(\)/);
 assert.match(helper,/return createdAt\.UTC\(\)/);
 assert.match(main,/"createdAt":\s+c\.createdAt\(item\)\.Format\(time\.RFC3339\)/);
 assert(get('$.status.createdAt').evidence.some(e=>e.url.includes('main.go#L674-L680')));
});
test('owned path admission rejects empty while omission can reach the defensive receiver fallback',()=>{
 const schema=ownedSchema().properties.spec.properties.exposure;
 assert(!(schema.required??[]).includes('path'));
 const pattern=new RegExp(schema.properties.path.pattern);
 assert(!pattern.test(''));assert(pattern.test('/'));assert(pattern.test('/health'));
 for(const invalid of ['health','/?query','/#fragment','/line\nnext'])assert(!pattern.test(invalid));
 const main=fs.readFileSync(new URL('cmd/buster-namespace-controller/main.go',root),'utf8');
 const exposure=main.slice(main.indexOf('func previewExposureSpec('),main.indexOf('func (c *controller) ensurePreviewExposure('));
 assert.match(exposure,/path := stringValue\(exposureMap\["path"\]\)\s*if path == "" \{\s*path = "\/"/);
 assert.match(get('$.spec.exposure.path').emptyValue,/explicit empty string fails/);
});
test('actual failed-prepare cleanup slice suppresses delete errors while explicit release propagates them',async()=>{
 const ts=(await import('typescript')).default;
 const {runInNewContext}=await import('node:vm');
 const text=fs.readFileSync(new URL('skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts',root),'utf8');
 const parsed=ts.createSourceFile('fixture.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 let methods=[];const visit=node=>{if(ts.isMethodDeclaration(node))methods.push(node);ts.forEachChild(node,visit);};visit(parsed);
 const method=name=>{const node=methods.find(n=>n.name.getText(parsed)===name);assert(node,name);return node;};
 const cleanup=method('#releaseAfterPrepareFailure').getText(parsed),release=method('#release').getText(parsed);
 let catchBody;const findCatch=node=>{if(ts.isCatchClause(node)&&node.block.getText(parsed).includes('#releaseAfterPrepareFailure'))catchBody=node.block.getText(parsed);ts.forEachChild(node,findCatch);};findCatch(method('#prepare'));
 assert(catchBody,'Original failed-prepare cleanup handler missing');
 const prepare=method('#prepare');
 const applyIndex=prepare.body.statements.findIndex(n=>n.getText(parsed).includes("['apply', '-f', '-']"));
 const protectedIndex=prepare.body.statements.findIndex(n=>ts.isTryStatement(n)&&n.catchClause?.getText(parsed).includes('#releaseAfterPrepareFailure'));
 assert(applyIndex>=0&&protectedIndex>applyIndex,'Lease apply is outside and before failed-prepare cleanup protection; moving it changes the failure contract');
 const dnsLine=text.split('\n').find(line=>line.startsWith('const DNS_LABEL = '));assert(dnsLine);
 const program=`${dnsLine}\nclass Slice {
 #maximumExecutionMs=1000; #controllerNamespace='controller';
 #kubectlRun=stub;
 ${cleanup}
 ${release}
 async failedPrepare(leaseName,error) ${catchBody}
 async explicitRelease(leaseName){return this.#release(leaseName,new AbortController().signal);}
 } new Slice()`;
 const javascript=ts.transpileModule(program,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const cleanupError=new Error('delete failed'),prepareError=new Error('original preparation cancelled');
 const calls=[];const instance=runInNewContext(javascript,{AbortController,setTimeout,clearTimeout,stub:async(...args)=>{calls.push(args);throw cleanupError;}});
 await assert.rejects(instance.failedPrepare('test-lease',prepareError),error=>error===prepareError);
 assert.equal(calls.length,1);assert.equal(calls[0][0][0],'delete');assert.equal(calls[0][2].aborted,false);
 await assert.rejects(instance.explicitRelease('test-lease'),error=>error===cleanupError);
 assert.equal(calls.length,2);
});
