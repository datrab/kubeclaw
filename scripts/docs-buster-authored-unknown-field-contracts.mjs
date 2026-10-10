/** One actual authored input outside the served owned CRD schema.
 * This registry never adds a schema property or a controller capability.
 * Source/contract evidence is distinct from admission and live execution.
 */
const productRevision='bc55a98da5897ed97ffdc0fdf9703fb9f04cd14b';
const kubernetesRevision='66452049f3d692768c39c797b21b793dce80314e';
const opsKubectlRevision='fde4e0d59d36fe2a47ecc1462cbb1cb572299cda';
const hostKubectlRevision='fc0e7a6ca50f7ce368f9a5516e1716b473ed3a26';
const link=(repo,revision,path,a,b,claim)=>({url:`https://github.com/${repo}/blob/${revision}/${path}#L${a}-L${b}`,claim});
const own=(path,a,b,claim)=>link('datrab/kubeclaw',productRevision,path,a,b,claim);
const k=(path,a,b,claim)=>link('kubernetes/kubernetes',kubernetesRevision,path,a,b,claim);
const ops=(path,a,b,claim)=>link('kubernetes/kubectl',opsKubectlRevision,path,a,b,claim);
const host=(path,a,b,claim)=>link('kubernetes/kubernetes',hostKubectlRevision,path,a,b,claim);
const expectedContext=Object.freeze({apiVersion:'kubeclaw.forgestack.ai/v1alpha1',kind:'BusterNamespaceLease',path:'scripts/deploy.sh',producer:'shell-shape',profile:'heredoc',document:1,requestOperation:'kubectl-apply',requestInvocation:'kubectl apply -n "$NAMESPACE" -f -',requestConstructor:'cmd_prism_e2e'});
const pruning='Under the declared served structural CRD, spec.capabilityProfile is unknown: spec has explicit properties, no additionalProperties or unknown-field preservation. Server coercion removes this key before schema validation and persistence when the request is allowed to continue. Pruning does not supply a replacement or grant a storage capability. Other required fields, authorization, admission and controller dependencies remain independent.';
const strict='If this unknown field reaches the pinned API server with fieldValidation=Strict, CRD decoding reports unknown field "spec.capabilityProfile". Create returns BadRequest through decode-error conversion; JSON/merge patch returns Invalid for the patch through its strict decode path. These are source-qualified error families, not an observed CLI result. Client fallback schema validation can reject before sending the write.';
const client='The authored kubectl apply call has no --validate, --server-side or --force flag. The reviewed Ops client is k8s.io/kubectl v0.34.11 (kubectl v1.34.11), independently from versions.json buildArgs.KUBECTL_VERSION=1.35.6 for other tool builds. Both reviewed clients default --validate to strict and forward fieldValidation=Strict through the apply helper. The parameter-verifying validator defers to a server with support; if support is unavailable, strict falls back to client schema validation, which can reject an unknown property. Actual PATH kubectl, discovery/schema caches, installed server and CRD must be checked. A versions.json default does not establish the executable that cmd_prism_e2e used.';
const controller='The complete production namespace-controller/helper set has no capabilityProfile dispatch or storage-profile selector. Provisioning uses fixed namespace ResourceQuota/LimitRange settings, access requests and copied-secret allowlists. The controller receives a generic spec map; leaseSpecDigest hashes its complete map after removing purpose and exposure. With the declared CRD pruning, capabilityProfile does not reach that map. If an independently installed schema preserves it, the key can affect this generic digest and immutability checks without selecting storage behavior. Do not describe that alternate installation as complete nonconsumption.';
const recovery='Stop after an apply error and retain the client version, request, stderr, selected context and lease name. A timeout/interruption can leave an uncertain stored object: use the original namespace/name to inspect UID, resourceVersion, stored spec, status.phase/status.message and controller logs before another write. Check the installed CRD against the declared schema and distinguish absent spec.capabilityProfile from a last-applied annotation containing its authored text. A successful admission or Ready phase does not demonstrate a storage profile, PVC provisioning or usable persistence. Correct this producer/receiver mismatch through an authorized product change; changing validation to Ignore is not a storage-capability repair.';
const polling='In the normal top-level invocation, set -euo pipefail causes a failing apply to stop before the phase loop. If a caller changes shell error handling and continues, the loop still cannot turn rejection into a capability grant. After an accepted apply, the script reads phase up to 120 times and sleeps 2 seconds after each unresolved read. Ready breaks; Failed or Expired returns 1 with the controller message. Rejected is not an explicit terminal branch and reaches the timeout. GET failures are suppressed with || true and become an empty phase. API latency adds time beyond the sleeps. A final namespaceName mismatch also returns 1. The RETURN cleanup trap is installed only after these checks, so an early apply/poll failure has no cleanup trap from this function; inspect lease/namespace/finalizer/TTL ownership before cleanup.';
const evidence=[
 own('scripts/deploy.sh',68,68,'Top-level shell enables errexit, nounset and pipefail.'),
 own('scripts/deploy.sh',1848,1871,'cmd_prism_e2e defaults PRISM_E2E_USE_LEASE to true and authors capabilityProfile: storage in kubectl apply stdin.'),
 own('scripts/deploy.sh',1873,1901,'Phase polling handles Ready, Failed and Expired, checks namespace, and installs cleanup only after the lease checks.'),
 own('charts/kubeclaw/templates/buster-namespace-lease-crd.yaml',34,186,'Owned served spec lists its properties and required fields; capabilityProfile, additionalProperties and preserve-unknown are absent from this structural boundary.'),
 own('cmd/buster-namespace-controller/main.go',75,80,'Lease decoding uses a generic spec map.'),
 own('cmd/buster-namespace-controller/main.go',251,316,'Controller validates known spec inputs and compares the spec digest; it does not dispatch capabilityProfile.'),
 own('cmd/buster-namespace-controller/main.go',931,961,'Namespace quota and default limits are fixed maps, including PVC count/storage ceilings, without a profile selection.'),
 own('cmd/buster-namespace-controller/main.go',1598,1654,'Known spec validation and whole-map digest after removing purpose/exposure qualify the nonconsumer claim.'),
 own('ops/pod/kubectl-build/go.mod',1,9,'Ops kubectl dependencies pin v0.34.11.'),
 own('ops/pod/Dockerfile',23,37,'Ops build selects v1.34.11, verifies the module version and builds kubectl.'),
 own('versions.json',24,24,'Other tool build defaults select KUBECTL_VERSION 1.35.6; this is not the actual installed PATH version.'),
 k('staging/src/k8s.io/apiextensions-apiserver/pkg/apiserver/customresource_handler.go',1189,1199,'Strict serializer determines tracking of unknown CRD field paths.'),
 k('staging/src/k8s.io/apiextensions-apiserver/pkg/apiserver/customresource_handler.go',1321,1345,'Schema coercing decoder reports tracked unknown fields as strict decoding errors.'),
 k('staging/src/k8s.io/apiextensions-apiserver/pkg/apiserver/customresource_handler.go',1431,1441,'CRD coercion prunes unknown fields and nonnullable nulls before restoring root metadata.'),
 k('staging/src/k8s.io/apiextensions-apiserver/pkg/apiserver/schema/pruning/algorithm.go',58,113,'Unknown properties are removed and optionally recorded regardless of their value; preservation and additionalProperties are explicit alternate branches.'),
 k('staging/src/k8s.io/apiserver/pkg/endpoints/handlers/create.go',119,140,'Warn and Strict use strict decoding; Warn adds warnings and continues, while other decode errors stop create.'),
 k('staging/src/k8s.io/apiserver/pkg/endpoints/handlers/patch.go',337,371,'JSON/merge patch handles Warn as warnings and strict decoding errors as Invalid patch errors.'),
 k('staging/src/k8s.io/apiserver/pkg/endpoints/handlers/rest.go',242,255,'Decode-error conversion returns BadRequest.'),
 k('staging/src/k8s.io/apiserver/pkg/endpoints/handlers/rest.go',403,413,'An omitted server fieldValidation directive defaults to Warn; this differs from kubectl strict default.'),
 ops('pkg/cmd/util/helpers.go',480,488,'AddValidateFlags defaults kubectl validation to strict.'),
 ops('pkg/cmd/apply/apply.go',298,304,'Apply selects its validator from the validation directive.'),
 ops('pkg/cmd/apply/apply.go',572,575,'Apply helper forwards fieldValidation.'),
 ops('pkg/validation/schema.go',116,153,'Parameter validation defers to a supporting server and falls back to schema validation for strict when unsupported.'),
 ops('pkg/cmd/apply/apply.go',674,711,'Client-side apply embeds last-applied configuration; create prunes nulls after preparing the annotation.'),
 host('staging/src/k8s.io/kubectl/pkg/cmd/util/helpers.go',468,476,'Reviewed v1.35.6 client also defaults kubectl validation to strict.'),
];
const record=Object.freeze({
 apiVersion:'kubeclaw.forgestack.ai/v1alpha1',kind:'BusterNamespaceLease',fieldPath:'$.spec.capabilityProfile',
 authorityRole:'authored-outside-served-schema',status:'unsupported-authored-input',schemaAuthority:null,
 authoredValue:'storage',purpose:'Explain the actual Prism E2E lease request that attempts to select a storage capability which the receiver does not implement.',
 receiver:'kubectl validation and apply request construction; Kubernetes CRD coercion/pruning; namespace-controller known spec consumers',
 operationScope:`Only ${expectedContext.requestConstructor}, ${expectedContext.requestInvocation}, producer ${expectedContext.producer}, profile ${expectedContext.profile} in ${expectedContext.path}. ${client}`,
 omitted:'No capability profile is requested. There is no served schema/controller default for this key; fixed namespace quotas and limits do not become a selected storage profile.',
 nullValue:'A present unknown null property has no nullable/type/default contract. Client validation can reject it. Client-side apply create removes null keys after recording the authored annotation; patch null can remove the key. If this property reaches CRD coercion, it is removed as an unknown property. Do not infer a typed optional string default.',
 emptyValue:'An authored empty string is still an unknown key. Strict/client validation can reject it; Warn/Ignore can allow the pruned object to proceed. Empty string is not an implemented profile or a disable flag.',
 invalidValue:`Even the selected string storage is outside the served schema. Malformed YAML/JSON can fail earlier; no supported enum or type constraint exists for this key. ${strict}`,
 changeImpact:'Changing this value does not select a storage profile under the declared CRD/controller. A newly declared schema property or consumer dispatch changes the authority and invalidates this exceptional contract; re-review validation, capability effects, migration and all producer paths.',
 crossFieldConditions:[pruning,controller,'Authorization and the other owned lease fields retain their existing contracts; this exceptional record does not replace the owned 150 boundaries.',polling],
 cases:[
  {name:'actual-authored-storage',condition:'Default-enabled Prism E2E lease authors capabilityProfile: storage.',sourceOutcome:`${client} ${strict}`},
  {name:'warn',condition:'A separately constructed request reaches the pinned server with fieldValidation=Warn.',sourceOutcome:`Unknown-field warnings are returned and the pruned object can continue through independent validation/admission. This is not the actual script default. ${pruning}`},
  {name:'ignore',condition:'A separately constructed request reaches the pinned server with fieldValidation=Ignore.',sourceOutcome:`No unknown-field strict diagnostic is requested, but schema pruning still removes the key. This is not the actual script default. ${pruning}`},
  {name:'omitted-server-directive',condition:'A request omits the server fieldValidation query parameter.',sourceOutcome:'Pinned server default is Warn. The reviewed kubectl defaults instead select and forward Strict, so no --validate flag in the script does not establish Warn.'},
  {name:'last-applied-annotation',condition:'A client-side apply is accepted after client/server validation decisions.',sourceOutcome:'The last-applied-configuration annotation can preserve the authored capabilityProfile text as JSON inside a string. That text is distinct from the pruned stored spec and is not a controller storage-profile input.'},
  {name:'unknown-result',condition:'Apply times out or is interrupted without a conclusive stored result.',sourceOutcome:recovery},
  {name:'polling-terminal-gap',condition:'An accepted lease later reports Rejected or phase reads fail.',sourceOutcome:polling},
 ],evidence,
 qualificationLimits:['Authored source/contract expectation only; no API, deployment, provisioning, storage-capability or Live success is established.',client,recovery,'The historical reason for authoring capabilityProfile is not established by its name. The intended storage selection is an inference from the literal storage; the receiver implementation does not supply it.'],
 implementationGap:{owner:'Prism deploy script and namespace broker maintainers',blockedStep:'Selecting an implemented storage capability from the Prism E2E lease request',safeStop:'Stop before the Prism live run when relying on this requested profile. Do not infer storage readiness from successful admission or Ready; resolve the producer/served-schema/controller mismatch before relying on that capability.',acceptanceCondition:'An authorized product change removes the unsupported request or supplies a served schema and actual consumer with validation, capability effects and migration/error tests; independently verify the complete request path.'},
});
export const receiverContracts=Object.freeze([record]);
export function authoredUnknownFieldContracts(apiVersion,kind,exactBoundaries,context) {
 if(kind!=='BusterNamespaceLease') return [];
 if(apiVersion!==record.apiVersion) throw Error(`BUSTER_AUTHORED_UNKNOWN_GVK_GAP: ${apiVersion}/${kind}`);
 for(const [key,value] of Object.entries(expectedContext)) if(context?.[key]!==value) throw Error(`BUSTER_AUTHORED_UNKNOWN_CONTEXT_GAP: ${key}`);
 if(context.clientBaseline!==undefined && !['ops-kubectl-v1.34.11','host-default-v1.35.6'].includes(context.clientBaseline)) throw Error(`BUSTER_AUTHORED_UNKNOWN_CLIENT_GAP: ${context.clientBaseline}`);
 return exactBoundaries.map(boundary=>{
  const fieldPath=typeof boundary==='string'?boundary:boundary.fieldPath;
  if(fieldPath!==record.fieldPath) throw Error(`BUSTER_AUTHORED_UNKNOWN_FIELD_GAP: ${apiVersion}/${kind}:${fieldPath}`);
  if(typeof boundary!=='string' && boundary.contract?.type!==undefined && boundary.contract.type!=='string') throw Error(`BUSTER_AUTHORED_UNKNOWN_VALUE_GAP: ${fieldPath}: authored value is a string, not a served-schema type`);
  return {...record,authoritySelector:{apiVersion,kind,fieldPath,...expectedContext},producerContext:{...context},clientBaseline:context.clientBaseline ?? 'unresolved-installed-client'};
 });
}
