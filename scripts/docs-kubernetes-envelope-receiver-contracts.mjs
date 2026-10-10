import { qualifyAuthoredDeploymentOperation } from './docs-kubernetes-metadata-receiver-contracts.mjs';
// Built-in API identity fields. CRD and nested-template metadata are separate receivers.
const revision = '66452049f3d692768c39c797b21b793dce80314e';
const source = (path, start, end, claim) => ({
  url: `https://github.com/kubernetes/kubernetes/blob/${revision}/${path}#L${start}-L${end}`, claim,
});
const serializer = (a,b,claim) => source('staging/src/k8s.io/apimachinery/pkg/runtime/serializer/json/json.go',a,b,claim);
const evidence = [
  source('staging/src/k8s.io/apimachinery/pkg/runtime/serializer/json/meta.go',48,62,'Identity interpretation decodes apiVersion and kind as strings, parses the group/version and returns the declared kind.'),
  serializer(116,127,'Identity defaults fill missing kind, fill an absent group/version pair, or fill a missing version when the group matches the default.'),
  serializer(148,155,'Decode interprets body identity and applies the supplied default identity.'),
  serializer(164,215,'Registered target selection, missing kind/version checks, object creation and typed decoding have distinct error branches.'),
  source('staging/src/k8s.io/apiserver/pkg/endpoints/handlers/create.go',116,147,'Create supplies endpoint identity to decoding, handles decode errors and rejects a group/version the endpoint does not accept.'),
  source('staging/src/k8s.io/apiserver/pkg/endpoints/handlers/update.go',104,135,'Update supplies endpoint identity to decoding, handles decode errors and rejects a group/version the endpoint does not accept.'),
  source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go',950,1003,'Custom literal decoders are selected first; null leaves an ordinary string at its fresh zero value.'),
];
const resources = [
  ['v1','ResourceQuota'],
  ['v1','LimitRange'],
  ['rbac.authorization.k8s.io/v1','Role'],
  ['rbac.authorization.k8s.io/v1','RoleBinding'],
  ['batch/v1','Job'],
  ['batch/v1','CronJob'],
  ['apps/v1','StatefulSet'],
  ['policy/v1','PodDisruptionBudget'],
  ['apps/v1','Deployment'],
  ['networking.k8s.io/v1','Ingress'],
  ['networking.k8s.io/v1','NetworkPolicy'],
  ['admissionregistration.k8s.io/v1','ValidatingAdmissionPolicy'],
  ['admissionregistration.k8s.io/v1','ValidatingAdmissionPolicyBinding'],
  ['rbac.authorization.k8s.io/v1','ClusterRole'],
  ['rbac.authorization.k8s.io/v1','ClusterRoleBinding'],
  ['networking.k8s.io/v1','IngressClass'],
  ['apiextensions.k8s.io/v1','CustomResourceDefinition'],
];
export const receiverContracts = resources.flatMap(([apiVersion,kind]) => ['apiVersion','kind'].map(field => ({
  kind,fieldPath:`$.${field}`,authoritySelector:{apiVersion,kind,fieldPath:`$.${field}`},
  purpose:field==='apiVersion'?'Names the API group and version used to interpret this resource.':'Names the resource type represented by this object.',
  receiver:'Kubernetes v1.35 JSON identity interpreter, typed serializer and built-in REST create or replacement-update handler.',
  operationScope:'A complete JSON object sent to the correct built-in REST create or replacement-update endpoint with its registered default identity. Manifest discovery and apply request construction are separate operations.',
  omitted:'The fresh identity string is empty. At this endpoint, the supplied default identity can fill the missing value before registered typed decoding. This does not establish that a manifest client can discover an endpoint without an explicit identity.',
  nullValue:'JSON null leaves the fresh identity string empty. The supplied default identity can fill it on this route. Null does not request a different resource type or version.',
  emptyValue:'The empty string is interpreted as a missing identity component. Endpoint defaults can fill it; unscoped decoding without sufficient defaults can instead report missing kind or version.',
  invalidValue:field==='apiVersion'?'A non-string token or group/version parse error fails identity interpretation. An unregistered identity can fail typed selection or conversion. A decoded group/version not accepted by this endpoint is rejected.':'A non-string token fails identity interpretation. An unknown kind can fail registered object selection or conversion; a missing kind after defaults fails ordinary typed decoding. A different kind is not a supported way to change the type of a stored resource.',
  changeImpact:'Identity directs decoding and conversion. Use the correct endpoint and a supported served API version. Changing these strings does not itself migrate a resource, change its spec or prove that a request succeeded.',
  crossFieldConditions:[
    `Write apiVersion: ${apiVersion} and kind: ${kind} in this resource manifest so that clients can select its intended endpoint.`,
    'The defaulting helper fills kind independently. When both group and version are empty it fills both. When only version is empty and the declared group matches the default group, it fills version. It does not replace a nonempty group or version.',
    'Body decoding and conversion occur before endpoint group/version acceptance. Authentication, authorization, admission and storage can still reject a correctly identified object.',
    'The unstructured-object branch has different identity handling. These built-in typed records do not establish CRD behavior or template metadata behavior.',
  ],
  cases:[
    {name:'Correct explicit identity',condition:`The body declares ${apiVersion} and ${kind} on its corresponding served endpoint.`,sourceOutcome:'The declared identity is interpreted for typed decoding and endpoint acceptance. This alone does not establish spec validity or successful persistence.'},
    {name:'Absent identity with endpoint defaults',condition:'Both identity strings are omitted from a fresh body and the registered endpoint supplies its complete default identity.',sourceOutcome:'The serializer fills the missing components from that default before typed object selection. Manifest-client discovery is outside this condition.'},
    {name:'No default identity',condition:'Ordinary typed decoding has neither a declared kind/version nor sufficient supplied or registered target defaults.',sourceOutcome:'The missing kind or version check returns an error before object creation; this differs from decoding at a registered endpoint.'},
    {name:'Incompatible identity token',condition:`${field} is a JSON object instead of a string.`,sourceOutcome:'The identity interpreter returns a JSON decode error; it does not convert the object to a string.'},
  ],
  evidence:[...evidence],
  qualificationLimits:[
    'These are pinned implementation expectations. No API request, manifest discovery, conversion, apply, migration or storage operation was executed.',
    'The actual server must serve the selected endpoint and version. Check discovery and the response before treating any create, replacement or migration as successful.',
  ],
})));

receiverContracts.forEach(qualifyAuthoredDeploymentOperation);

// CRD registration is itself a typed built-in object. Custom-resource instances
// use the separate unstructured TypeMeta provider; do not borrow that branch.
for (const record of receiverContracts.filter(record => ['ClusterRole','ClusterRoleBinding','IngressClass','CustomResourceDefinition'].includes(record.kind))) {
 record.crossFieldConditions[3] = 'These are typed built-in root identity records, including CustomResourceDefinition registration. Instances registered by that CRD use a separate unstructured receiver; endpoint defaulting here does not establish their identity behavior.';
 record.crossFieldConditions.push('These resources are cluster-scoped. TypeMeta identifies the object representation; metadata name and the endpoint identify its stored lifetime. Labels, release namespace and body kind/version do not grant permissions.');
 if (record.kind === 'CustomResourceDefinition') record.evidence.push(source('staging/src/k8s.io/apiextensions-apiserver/pkg/registry/customresourcedefinition/etcd.go',42,64,'CRD registration storage constructs typed CustomResourceDefinition objects and installs its built-in create/update/reset strategies.'));
}
