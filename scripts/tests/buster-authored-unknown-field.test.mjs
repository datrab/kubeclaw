import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {receiverContracts,authoredUnknownFieldContracts as select} from '../docs-buster-authored-unknown-field-contracts.mjs';
const root=new URL('../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const context={apiVersion:'kubeclaw.forgestack.ai/v1alpha1',kind:'BusterNamespaceLease',path:'scripts/deploy.sh',producer:'shell-shape',profile:'heredoc',document:1,requestOperation:'kubectl-apply',requestInvocation:'kubectl apply -n "$NAMESPACE" -f -',requestConstructor:'cmd_prism_e2e'};
const apiVersion='kubeclaw.forgestack.ai/v1alpha1';
const field='$.spec.capabilityProfile';
const selected=()=>select(apiVersion,'BusterNamespaceLease',[field],context)[0];
const constructor=()=>{
 const script=read('scripts/deploy.sh');const start=script.indexOf('cmd_prism_e2e() {');const end=script.indexOf('  cleanup_prism_e2e(){',start);
 assert.ok(start>=0 && end>start);return script.slice(start,end)+'}\n';
};
test('actual producer remains present outside the served owned schema',()=>{
 const source=constructor();
 assert.match(source,/\$\{PRISM_E2E_USE_LEASE:-true\}/);
 assert.match(source,/kubectl apply -n "\$NAMESPACE" -f - <<EOF/);
 assert.match(source,/^  capabilityProfile: storage$/m);
 assert.ok(!/--validate|--server-side|--force/.test(source));
 const schema=read('charts/kubeclaw/templates/buster-namespace-lease-crd.yaml');
 const spec=schema.slice(schema.indexOf('            spec:'),schema.indexOf('            status:'));
 assert.ok(!/capabilityProfile|additionalProperties|x-kubernetes-preserve-unknown-fields/.test(spec));
 const record=selected();assert.equal(record.schemaAuthority,null);assert.equal(record.status,'unsupported-authored-input');
 assert.equal(record.authorityRole,'authored-outside-served-schema');assert.equal(record.authoredValue,'storage');
});
test('new fields, context changes, missing bindings and unreviewed client versions fail closed',()=>{
 for(const path of ['$.spec.capabilitiesProfile','$.spec.capabilityProfile.name','$.spec.otherUnknown']) assert.throws(()=>select(apiVersion,'BusterNamespaceLease',[path],context),/BUSTER_AUTHORED_UNKNOWN_FIELD_GAP/);
 for(const [key,value] of Object.entries({apiVersion:'other/v1',kind:'OtherLease',path:'other.sh',producer:'helm',profile:'upgrade',document:2,requestOperation:'replace',requestInvocation:'kubectl apply --validate=ignore -f -',requestConstructor:'other'})) assert.throws(()=>select(apiVersion,'BusterNamespaceLease',[field],{...context,[key]:value}),/BUSTER_AUTHORED_UNKNOWN_CONTEXT_GAP/);
 assert.throws(()=>select(apiVersion,'BusterNamespaceLease',[field],undefined),/CONTEXT_GAP/);
 assert.throws(()=>select('kubeclaw.forgestack.ai/v1beta1','BusterNamespaceLease',[field],context),/GVK_GAP/);
 assert.throws(()=>select(apiVersion,'BusterNamespaceLease',[field],{...context,clientBaseline:'v1.20.0'}),/CLIENT_GAP/);
 assert.throws(()=>select(apiVersion,'BusterNamespaceLease',[{fieldPath:field,contract:{type:'integer'}}],context),/VALUE_GAP/);
 assert.equal(selected().clientBaseline,'unresolved-installed-client');
 assert.equal(select(apiVersion,'BusterNamespaceLease',[{fieldPath:field,contract:{type:'string'}}],context)[0].schemaAuthority,null);
});
test('real client version authorities remain separate from actual installed execution',()=>{
 const modules=read('ops/pod/kubectl-build/go.mod');assert.match(modules,/k8s.io\/kubectl v0\.34\.11/);
 const versions=JSON.parse(read('versions.json'));assert.equal(versions.buildArgs.KUBECTL_VERSION,'1.35.6');assert.equal(versions.imageOverrides['ops-pod'].KUBECTL_VERSION,'v1.34.11');
 assert.match(read('ops/pod/Dockerfile'),/ARG KUBECTL_VERSION=v1\.34\.11/);
 assert.match(selected().operationScope,/default --validate to strict/);
 const r=selected();assert.match(r.cases.find(c=>c.name==='omitted-server-directive').sourceOutcome,/server default is Warn/);
 assert.match(r.cases.find(c=>c.name==='warn').sourceOutcome,/not the actual script default/);
 assert.match(r.cases.find(c=>c.name==='ignore').sourceOutcome,/pruning still removes/);
});
test('controller complete source set has no profile dispatch but preserves the generic digest caveat',()=>{
 const paths=readdirSync(new URL('cmd/buster-namespace-controller/',root)).filter(p=>p.endsWith('.go')&&!p.endsWith('_test.go'));
 assert.ok(paths.length>=8);
 for(const path of paths) assert.ok(!read(`cmd/buster-namespace-controller/${path}`).includes('capabilityProfile'),path);
 const main=read('cmd/buster-namespace-controller/main.go');
 assert.match(main,/func leaseSpecDigest\(spec map\[string\]interface\{\}\)/);
 assert.match(main,/delete\(copy, "purpose"\)[\s\S]*delete\(copy, "exposure"\)[\s\S]*return fullLeaseSpecDigest\(copy\)/);
 const quota=main.slice(main.indexOf('func (c *controller) ensureNamespaceResourceLimits('),main.indexOf('func (c *controller) ensureNamespaceAccess('));
 assert.match(quota,/"requests.storage": "100Gi"/);assert.ok(!quota.includes('item.Spec'));
 assert.match(selected().crossFieldConditions.join(' '),/key can affect this generic digest/);
});
function runLeasePrefix(mode){
 const script=`set -euo pipefail\nPRISM_E2E_USER=fixture-user\nPRISM_NAMESPACE=fixture-prism\nPRISM_RUNTIME_SECRET_NAME=runtime\nPRISM_DATABASE_SECRET_NAME=database\nPRISM_IMAGE_PULL_SECRET_NAME=pull\nNAMESPACE=fixture-control\nrequire_command(){ :; }\nprepare_prism_e2e_source_secrets(){ :; }\nerr(){ printf '%s\\n' "$*" >&2; }\nsleep(){ :; }\nkubectl(){\n printf 'CALL:%s\\n' "$*" >&3\n if [[ "${mode}" == "get-failed" && $1 == get ]]; then return 1; fi\n if [[ $1 == apply ]]; then cat >/dev/null; ${mode==='reject'?'return 42':'return 0'}; fi\n if [[ $* == *status.phase* ]]; then printf '${mode==='phase-failed'?'Failed':mode==='phase-rejected'?'Rejected':''}'; return 0; fi\n if [[ $* == *status.message* ]]; then printf 'fixture controller message'; return 0; fi\n return 1\n}\n${constructor()}\ncmd_prism_e2e\n`;
 const result=spawnSync('bash',['-c',script],{encoding:'utf8',timeout:5000,stdio:['pipe','pipe','pipe','pipe']}); result.calls=result.output[3]; return result;
}
test('actual shell constructor stops on failing apply before polling or cleanup registration',()=>{
 const result=runLeasePrefix('reject');assert.equal(result.status,42,result.stderr);
 assert.ok(!result.calls.includes('CALL:get'));assert.ok(!result.calls.includes('CALL:delete'));
});
test('actual polling stops on Failed but Rejected and hidden GET failures reach timeout',()=>{
 const failed=runLeasePrefix('phase-failed');assert.equal(failed.status,1);assert.match(failed.stderr,/lease entered Failed: fixture controller message/);
 assert.equal((failed.calls.match(/CALL:get.*status.phase/g)||[]).length,1);
 for(const mode of ['phase-rejected','get-failed']){
  const result=runLeasePrefix(mode);assert.equal(result.status,1,result.stderr);
  assert.match(result.stderr,/Timed out waiting for Prism test namespace lease/);
  assert.equal((result.calls.match(/CALL:get.*status.phase/g)||[]).length,120);
  assert.ok(!result.calls.includes('CALL:delete'));
 }
});
test('source-qualified errors, last-applied text and recovery do not grant storage capability',()=>{
 const r=selected();assert.match(r.invalidValue,/BadRequest/);assert.match(r.invalidValue,/Invalid for the patch/);
 assert.match(r.cases.find(c=>c.name==='last-applied-annotation').sourceOutcome,/distinct from the pruned stored spec/);
 assert.match(r.cases.find(c=>c.name==='unknown-result').sourceOutcome,/UID, resourceVersion/);
 assert.match(r.implementationGap.safeStop,/Do not infer storage readiness/);
 assert.equal(receiverContracts.length,1);
});
