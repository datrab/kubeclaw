/** Selected external node workloads. Source contracts are not API/deployment/live proof.
 * Root TypeMeta and ObjectMeta explicitly delegate to the envelope/metadata modules.
 * Template reuse is qualified by DaemonSet defaulting, strategy and controller preparation.
 */
import {receiverContracts as deploymentTemplates} from './docs-kubernetes-apps-receiver-contracts.mjs';
const revision = '66452049f3d692768c39c797b21b793dce80314e';
const source = (path, lines, claim) => ({url:`https://github.com/kubernetes/kubernetes/blob/${revision}/${path}#L${lines.replace('-', '-L')}`,claim});
const normalize = path => path.replace(/\[(?:"(?:[^"\\]|\\.)*"|'[^']*'|\*)\]/g,'[<exact-key>]').replace(/\[\d+\]/g,'[]');
const rootBoundary = path => /^\$\.(metadata(?:\.|\[|$)|apiVersion$|kind$)/.test(path);
const apiVersions = {DaemonSet:'apps/v1',CSIDriver:'storage.k8s.io/v1'};
export const delegatedRootContracts = Object.freeze({TypeMeta:'docs-kubernetes-envelope-receiver-contracts.mjs',ObjectMeta:'docs-kubernetes-metadata-receiver-contracts.mjs'});
const records=[];
const appsValidation = source('pkg/apis/apps/validation/validation.go','371-403','DaemonSet update validates selector immutability; template and selector validation are resource-specific.');
const specValidation = source('pkg/apis/apps/validation/validation.go','440-535','ValidateDaemonSetSpec requires matching nonempty selector, Always restart policy, no activeDeadlineSeconds, nonnegative timing/history and a valid DaemonSet update strategy.');
const dsDefaults=source('pkg/apis/apps/v1/defaults.go','75-101','SetDefaults_DaemonSet defaults RollingUpdate, maxUnavailable 1, maxSurge 0 and revisionHistoryLimit 10.');
const preparation=[source('pkg/registry/apps/daemonset/strategy.go','71-130','DaemonSet preparation clears/preserves status, drops disabled template fields and increments generation after spec/template changes; validation options come from the actual template.'),source('pkg/apis/apps/v1/zz_generated.defaults.go','46-364','SetObjectDefaults_DaemonSet walks PodSpec, volume, container, probe, lifecycle and init-container template defaults; it does not call SetDefaults_Pod.'),source('pkg/controller/daemon/util/daemonset_util.go','48-120','DaemonSet Pod preparation adds node-condition tolerations and template generation/hash labels.'),source('pkg/controller/daemon/daemon_controller.go','1007-1044','DaemonSet copies its prepared template, sets required affinity to the selected node and submits a new Pod.'),source('pkg/controller/daemon/daemon_controller.go','1293-1340','Node eligibility checks selected node affinity/name and taints with DaemonSet tolerations; continued execution differs from new scheduling.')];
const dsChange='Accepted spec changes increase generation. Template changes are used for new Pods; they do not edit existing Pod fields. RollingUpdate replaces Pods within its availability budget; OnDelete waits for old Pods to be removed. Node eligibility, readiness, admission and runtime dependencies still control progress.';
const dsRecovery='A failed or timed-out apply is an uncertain stored result: read the DaemonSet UID/resourceVersion, generation and observedGeneration before another write. Compare desired/current/updated/available/misscheduled counts and Pod events. Check eligible nodes, taints, scheduler constraints, host mounts, images and controller logs. Restore the intended template or dependency and observe reconciliation; deleting healthy Pods before diagnosing node or mount failure can remove node services.';
const csiRecovery='A registration write timeout does not show whether the object was stored. Read the named cluster-scoped CSIDriver and resourceVersion before retrying. For mount/attach failure, inspect Pod events, matching CSI driver name, node registrar/driver and kubelet logs, CSINode registration and socket/host mounts. Correct the specific dependency and observe the original Pod retry. Registration alone does not install a node plugin, provision a volume or prove a successful mount.';
function add(kind,fieldPath,purpose,omitted,emptyValue,invalidValue,evidence,options={}) {
 const nullValue=options.nullValue ?? `Fresh typed null leaves a scalar/struct zero value or a pointer/map/slice nil before defaulting. ${omitted} Patch and apply null depend on the actual client and ownership, not this fresh decode contract.`;
 records.push({kind,fieldPath,purpose,receiver:kind==='DaemonSet'?'Kubernetes DaemonSet API, daemon controller, scheduler and kubelet':'Kubernetes cluster-scoped CSIDriver API and CSI consumers',operationScope:'Actual external Helm selected outputs reach Kubernetes typed create/update after Helm/Argo request construction and ownership handling. Live client/server versions, permissions, admission, gates and existing state remain inputs.',omitted,nullValue,emptyValue,invalidValue,changeImpact:options.changeImpact ?? (kind==='DaemonSet'?dsChange:'Mutable capability changes affect later CSI consumer decisions; attachRequired and volumeLifecycleModes are immutable. Registration does not update a running driver binary.'),crossFieldConditions:options.crossFieldConditions ?? [],cases:[{name:'omitted-at-create',condition:`${fieldPath} omitted in a present parent`,sourceOutcome:omitted},{name:'fresh-null',condition:'null before defaulting in fresh typed decode',sourceOutcome:nullValue},{name:'empty',condition:'explicit empty/zero value',sourceOutcome:emptyValue},{name:'invalid',condition:'invalid value or combination',sourceOutcome:invalidValue}],evidence,qualificationLimits:['Pinned source contract, not API/deployment/live evidence.',kind==='DaemonSet'?dsRecovery:csiRecovery,'General unused upstream alternatives remain in the linked Kubernetes reference; a newly selected field requires an authored contract.'],...options});
}
add('DaemonSet','$','Run a node-local service on eligible nodes.','No request body cannot create a DaemonSet.','{} lacks required identity, selector and containers.','Invalid object, selector/template or strategy rejects the request.',[appsValidation,specValidation,...preparation]);
add('DaemonSet','$.spec','Select node-local desired state.','Defaults cannot repair absent selector and containers.','{} fails selector/template validation.','Selector mismatch, invalid template, strategy or negative timing/history rejects.',[specValidation,dsDefaults],{crossFieldConditions:['restartPolicy must be Always; activeDeadlineSeconds is forbidden.','There is no replicas field: desired count follows eligible nodes.']});
for(const path of ['$.spec.selector','$.spec.selector.matchLabels','$.spec.selector.matchLabels[<exact-key>]']) add('DaemonSet',path,'Bind controller ownership to template labels.','Missing selection cannot supply a valid nonempty selector.','An empty selector is rejected; an empty individual label value can be valid and selects equality to empty.','Invalid labels, selector/template mismatch or a changed selector on update rejects.',[appsValidation,specValidation],{nullValue:path.endsWith('[<exact-key>]')?'A null string map item leaves the key with an empty value; it is an equality requirement, not key removal.':'A fresh null selector becomes nil, and null matchLabels becomes nil; the complete selector must remain nonempty and match template labels.',crossFieldConditions:['Selector is immutable; template labels must continue to match.']});
add('DaemonSet','$.spec.minReadySeconds','Wait for continuous Pod readiness before availability.','Nonpointer scalar is zero.','Zero is accepted and adds no minimum wait.','Negative value rejects.',[specValidation]);
add('DaemonSet','$.spec.revisionHistoryLimit','Bound old ControllerRevision history.','Nil defaults to 10.','Explicit zero is valid; it does not select 10.','Negative values reject.',[dsDefaults,specValidation],{nullValue:'Fresh null pointer is nil and defaults to 10.'});
for(const path of ['$.spec.updateStrategy','$.spec.updateStrategy.type']) add('DaemonSet',path,'Choose replacement during template updates.','Empty strategy/type defaults to RollingUpdate.','Empty type defaults to RollingUpdate; OnDelete does not automatically roll old Pods.','Only RollingUpdate and OnDelete accepted; RollingUpdate requires valid budgets.',[dsDefaults,specValidation,source('pkg/controller/daemon/daemon_controller.go','918-932','OnDelete performs no rollingUpdate call; RollingUpdate runs its update path.')]);
add('DaemonSet','$.spec.updateStrategy.rollingUpdate','Bound concurrent node service disruption.','For RollingUpdate nil gets maxUnavailable 1 and maxSurge 0.','{} gets the nil-pointer budget defaults.','Exactly one budget must be nonzero; negative or percentages above 100 reject.',[dsDefaults,specValidation],{nullValue:'Fresh null becomes nil; RollingUpdate creates the default budget object.'});
for(const [field,def] of [['maxUnavailable',1],['maxSurge',0]]) add('DaemonSet',`$.spec.updateStrategy.rollingUpdate.${field}`,`Set ${field} rollout budget.`,`Nil pointer defaults to ${def} for RollingUpdate.`,'Explicit 0 is retained; it requires the other budget to be nonzero.','Invalid integer/percentage, negative value, percentage above 100, both zero or both nonzero rejects.',[dsDefaults,specValidation],{nullValue:`Fresh null pointer defaults to ${def} for RollingUpdate.`,crossFieldConditions:['DaemonSet budgets differ from Deployment: both nonzero is forbidden.']});
const selectedTemplatePaths = [
 "$.spec.template",
 "$.spec.template.spec",
 "$.spec.template.spec.affinity",
 "$.spec.template.spec.affinity.nodeAffinity",
 "$.spec.template.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution",
 "$.spec.template.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms",
 "$.spec.template.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[]",
 "$.spec.template.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchExpressions",
 "$.spec.template.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchExpressions[]",
 "$.spec.template.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchExpressions[].key",
 "$.spec.template.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchExpressions[].operator",
 "$.spec.template.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchExpressions[].values",
 "$.spec.template.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchExpressions[].values[]",
 "$.spec.template.spec.affinity.podAffinity",
 "$.spec.template.spec.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution",
 "$.spec.template.spec.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[]",
 "$.spec.template.spec.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector",
 "$.spec.template.spec.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector.matchLabels",
 "$.spec.template.spec.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector.matchLabels[\"*\"]",
 "$.spec.template.spec.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[].topologyKey",
 "$.spec.template.spec.affinity.podAntiAffinity",
 "$.spec.template.spec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution",
 "$.spec.template.spec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[]",
 "$.spec.template.spec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector",
 "$.spec.template.spec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector.matchLabels",
 "$.spec.template.spec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector.matchLabels[\"*\"]",
 "$.spec.template.spec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[].topologyKey",
 "$.spec.template.spec.automountServiceAccountToken",
 "$.spec.template.spec.containers",
 "$.spec.template.spec.containers[]",
 "$.spec.template.spec.containers[].args",
 "$.spec.template.spec.containers[].args[]",
 "$.spec.template.spec.containers[].command",
 "$.spec.template.spec.containers[].command[]",
 "$.spec.template.spec.containers[].env",
 "$.spec.template.spec.containers[].env[]",
 "$.spec.template.spec.containers[].env[].name",
 "$.spec.template.spec.containers[].env[].value",
 "$.spec.template.spec.containers[].env[].valueFrom",
 "$.spec.template.spec.containers[].env[].valueFrom.fieldRef",
 "$.spec.template.spec.containers[].env[].valueFrom.fieldRef.apiVersion",
 "$.spec.template.spec.containers[].env[].valueFrom.fieldRef.fieldPath",
 "$.spec.template.spec.containers[].env[].valueFrom.resourceFieldRef",
 "$.spec.template.spec.containers[].env[].valueFrom.resourceFieldRef.divisor",
 "$.spec.template.spec.containers[].env[].valueFrom.resourceFieldRef.resource",
 "$.spec.template.spec.containers[].image",
 "$.spec.template.spec.containers[].imagePullPolicy",
 "$.spec.template.spec.containers[].lifecycle",
 "$.spec.template.spec.containers[].lifecycle.postStart",
 "$.spec.template.spec.containers[].lifecycle.postStart.exec",
 "$.spec.template.spec.containers[].lifecycle.postStart.exec.command",
 "$.spec.template.spec.containers[].lifecycle.postStart.exec.command[]",
 "$.spec.template.spec.containers[].lifecycle.preStop",
 "$.spec.template.spec.containers[].lifecycle.preStop.exec",
 "$.spec.template.spec.containers[].lifecycle.preStop.exec.command",
 "$.spec.template.spec.containers[].lifecycle.preStop.exec.command[]",
 "$.spec.template.spec.containers[].livenessProbe",
 "$.spec.template.spec.containers[].livenessProbe.failureThreshold",
 "$.spec.template.spec.containers[].livenessProbe.httpGet",
 "$.spec.template.spec.containers[].livenessProbe.httpGet.host",
 "$.spec.template.spec.containers[].livenessProbe.httpGet.httpHeaders",
 "$.spec.template.spec.containers[].livenessProbe.httpGet.httpHeaders[]",
 "$.spec.template.spec.containers[].livenessProbe.httpGet.httpHeaders[].name",
 "$.spec.template.spec.containers[].livenessProbe.httpGet.httpHeaders[].value",
 "$.spec.template.spec.containers[].livenessProbe.httpGet.path",
 "$.spec.template.spec.containers[].livenessProbe.httpGet.port",
 "$.spec.template.spec.containers[].livenessProbe.httpGet.scheme",
 "$.spec.template.spec.containers[].livenessProbe.initialDelaySeconds",
 "$.spec.template.spec.containers[].livenessProbe.periodSeconds",
 "$.spec.template.spec.containers[].livenessProbe.successThreshold",
 "$.spec.template.spec.containers[].livenessProbe.timeoutSeconds",
 "$.spec.template.spec.containers[].name",
 "$.spec.template.spec.containers[].ports",
 "$.spec.template.spec.containers[].ports[]",
 "$.spec.template.spec.containers[].ports[].containerPort",
 "$.spec.template.spec.containers[].ports[].hostPort",
 "$.spec.template.spec.containers[].ports[].name",
 "$.spec.template.spec.containers[].ports[].protocol",
 "$.spec.template.spec.containers[].readinessProbe",
 "$.spec.template.spec.containers[].readinessProbe.failureThreshold",
 "$.spec.template.spec.containers[].readinessProbe.httpGet",
 "$.spec.template.spec.containers[].readinessProbe.httpGet.host",
 "$.spec.template.spec.containers[].readinessProbe.httpGet.httpHeaders",
 "$.spec.template.spec.containers[].readinessProbe.httpGet.httpHeaders[]",
 "$.spec.template.spec.containers[].readinessProbe.httpGet.httpHeaders[].name",
 "$.spec.template.spec.containers[].readinessProbe.httpGet.httpHeaders[].value",
 "$.spec.template.spec.containers[].readinessProbe.httpGet.path",
 "$.spec.template.spec.containers[].readinessProbe.httpGet.port",
 "$.spec.template.spec.containers[].readinessProbe.httpGet.scheme",
 "$.spec.template.spec.containers[].readinessProbe.initialDelaySeconds",
 "$.spec.template.spec.containers[].readinessProbe.periodSeconds",
 "$.spec.template.spec.containers[].readinessProbe.successThreshold",
 "$.spec.template.spec.containers[].readinessProbe.timeoutSeconds",
 "$.spec.template.spec.containers[].resources",
 "$.spec.template.spec.containers[].resources.limits",
 "$.spec.template.spec.containers[].resources.limits[\"*\"]",
 "$.spec.template.spec.containers[].resources.requests",
 "$.spec.template.spec.containers[].resources.requests[\"*\"]",
 "$.spec.template.spec.containers[].securityContext",
 "$.spec.template.spec.containers[].securityContext.allowPrivilegeEscalation",
 "$.spec.template.spec.containers[].securityContext.capabilities",
 "$.spec.template.spec.containers[].securityContext.capabilities.add",
 "$.spec.template.spec.containers[].securityContext.capabilities.add[]",
 "$.spec.template.spec.containers[].securityContext.capabilities.drop",
 "$.spec.template.spec.containers[].securityContext.capabilities.drop[]",
 "$.spec.template.spec.containers[].securityContext.privileged",
 "$.spec.template.spec.containers[].securityContext.readOnlyRootFilesystem",
 "$.spec.template.spec.containers[].securityContext.runAsGroup",
 "$.spec.template.spec.containers[].securityContext.runAsNonRoot",
 "$.spec.template.spec.containers[].securityContext.runAsUser",
 "$.spec.template.spec.containers[].securityContext.seLinuxOptions",
 "$.spec.template.spec.containers[].securityContext.seLinuxOptions.level",
 "$.spec.template.spec.containers[].securityContext.seLinuxOptions.type",
 "$.spec.template.spec.containers[].securityContext.seccompProfile",
 "$.spec.template.spec.containers[].securityContext.seccompProfile.type",
 "$.spec.template.spec.containers[].startupProbe",
 "$.spec.template.spec.containers[].startupProbe.failureThreshold",
 "$.spec.template.spec.containers[].startupProbe.httpGet",
 "$.spec.template.spec.containers[].startupProbe.httpGet.host",
 "$.spec.template.spec.containers[].startupProbe.httpGet.httpHeaders",
 "$.spec.template.spec.containers[].startupProbe.httpGet.httpHeaders[]",
 "$.spec.template.spec.containers[].startupProbe.httpGet.httpHeaders[].name",
 "$.spec.template.spec.containers[].startupProbe.httpGet.httpHeaders[].value",
 "$.spec.template.spec.containers[].startupProbe.httpGet.path",
 "$.spec.template.spec.containers[].startupProbe.httpGet.port",
 "$.spec.template.spec.containers[].startupProbe.httpGet.scheme",
 "$.spec.template.spec.containers[].startupProbe.initialDelaySeconds",
 "$.spec.template.spec.containers[].startupProbe.periodSeconds",
 "$.spec.template.spec.containers[].startupProbe.successThreshold",
 "$.spec.template.spec.containers[].startupProbe.timeoutSeconds",
 "$.spec.template.spec.containers[].terminationMessagePolicy",
 "$.spec.template.spec.containers[].volumeMounts",
 "$.spec.template.spec.containers[].volumeMounts[]",
 "$.spec.template.spec.containers[].volumeMounts[].mountPath",
 "$.spec.template.spec.containers[].volumeMounts[].mountPropagation",
 "$.spec.template.spec.containers[].volumeMounts[].name",
 "$.spec.template.spec.containers[].volumeMounts[].readOnly",
 "$.spec.template.spec.dnsPolicy",
 "$.spec.template.spec.enableServiceLinks",
 "$.spec.template.spec.hostIPC",
 "$.spec.template.spec.hostNetwork",
 "$.spec.template.spec.hostPID",
 "$.spec.template.spec.hostUsers",
 "$.spec.template.spec.initContainers",
 "$.spec.template.spec.initContainers[]",
 "$.spec.template.spec.initContainers[].args",
 "$.spec.template.spec.initContainers[].args[]",
 "$.spec.template.spec.initContainers[].command",
 "$.spec.template.spec.initContainers[].command[]",
 "$.spec.template.spec.initContainers[].env",
 "$.spec.template.spec.initContainers[].env[]",
 "$.spec.template.spec.initContainers[].env[].name",
 "$.spec.template.spec.initContainers[].env[].value",
 "$.spec.template.spec.initContainers[].env[].valueFrom",
 "$.spec.template.spec.initContainers[].env[].valueFrom.configMapKeyRef",
 "$.spec.template.spec.initContainers[].env[].valueFrom.configMapKeyRef.key",
 "$.spec.template.spec.initContainers[].env[].valueFrom.configMapKeyRef.name",
 "$.spec.template.spec.initContainers[].env[].valueFrom.configMapKeyRef.optional",
 "$.spec.template.spec.initContainers[].env[].valueFrom.fieldRef",
 "$.spec.template.spec.initContainers[].env[].valueFrom.fieldRef.apiVersion",
 "$.spec.template.spec.initContainers[].env[].valueFrom.fieldRef.fieldPath",
 "$.spec.template.spec.initContainers[].image",
 "$.spec.template.spec.initContainers[].imagePullPolicy",
 "$.spec.template.spec.initContainers[].name",
 "$.spec.template.spec.initContainers[].resources",
 "$.spec.template.spec.initContainers[].resources.limits",
 "$.spec.template.spec.initContainers[].resources.limits[\"*\"]",
 "$.spec.template.spec.initContainers[].resources.requests",
 "$.spec.template.spec.initContainers[].resources.requests[\"*\"]",
 "$.spec.template.spec.initContainers[].securityContext",
 "$.spec.template.spec.initContainers[].securityContext.capabilities",
 "$.spec.template.spec.initContainers[].securityContext.capabilities.add",
 "$.spec.template.spec.initContainers[].securityContext.capabilities.add[]",
 "$.spec.template.spec.initContainers[].securityContext.capabilities.drop",
 "$.spec.template.spec.initContainers[].securityContext.capabilities.drop[]",
 "$.spec.template.spec.initContainers[].securityContext.privileged",
 "$.spec.template.spec.initContainers[].securityContext.runAsGroup",
 "$.spec.template.spec.initContainers[].securityContext.runAsUser",
 "$.spec.template.spec.initContainers[].securityContext.seLinuxOptions",
 "$.spec.template.spec.initContainers[].securityContext.seLinuxOptions.level",
 "$.spec.template.spec.initContainers[].securityContext.seLinuxOptions.type",
 "$.spec.template.spec.initContainers[].terminationMessagePolicy",
 "$.spec.template.spec.initContainers[].volumeMounts",
 "$.spec.template.spec.initContainers[].volumeMounts[]",
 "$.spec.template.spec.initContainers[].volumeMounts[].mountPath",
 "$.spec.template.spec.initContainers[].volumeMounts[].mountPropagation",
 "$.spec.template.spec.initContainers[].volumeMounts[].name",
 "$.spec.template.spec.nodeSelector",
 "$.spec.template.spec.nodeSelector[\"*\"]",
 "$.spec.template.spec.priorityClassName",
 "$.spec.template.spec.restartPolicy",
 "$.spec.template.spec.securityContext",
 "$.spec.template.spec.securityContext.appArmorProfile",
 "$.spec.template.spec.securityContext.appArmorProfile.type",
 "$.spec.template.spec.securityContext.fsGroup",
 "$.spec.template.spec.securityContext.fsGroupChangePolicy",
 "$.spec.template.spec.securityContext.runAsGroup",
 "$.spec.template.spec.securityContext.runAsNonRoot",
 "$.spec.template.spec.securityContext.runAsUser",
 "$.spec.template.spec.securityContext.seccompProfile",
 "$.spec.template.spec.securityContext.seccompProfile.type",
 "$.spec.template.spec.securityContext.windowsOptions",
 "$.spec.template.spec.securityContext.windowsOptions.hostProcess",
 "$.spec.template.spec.securityContext.windowsOptions.runAsUserName",
 "$.spec.template.spec.serviceAccountName",
 "$.spec.template.spec.terminationGracePeriodSeconds",
 "$.spec.template.spec.tolerations",
 "$.spec.template.spec.tolerations[]",
 "$.spec.template.spec.tolerations[].effect",
 "$.spec.template.spec.tolerations[].key",
 "$.spec.template.spec.tolerations[].operator",
 "$.spec.template.spec.volumes",
 "$.spec.template.spec.volumes[]",
 "$.spec.template.spec.volumes[].configMap",
 "$.spec.template.spec.volumes[].configMap.defaultMode",
 "$.spec.template.spec.volumes[].configMap.items",
 "$.spec.template.spec.volumes[].configMap.items[]",
 "$.spec.template.spec.volumes[].configMap.items[].key",
 "$.spec.template.spec.volumes[].configMap.items[].path",
 "$.spec.template.spec.volumes[].configMap.name",
 "$.spec.template.spec.volumes[].emptyDir",
 "$.spec.template.spec.volumes[].hostPath",
 "$.spec.template.spec.volumes[].hostPath.path",
 "$.spec.template.spec.volumes[].hostPath.type",
 "$.spec.template.spec.volumes[].name",
 "$.spec.template.spec.volumes[].projected",
 "$.spec.template.spec.volumes[].projected.defaultMode",
 "$.spec.template.spec.volumes[].projected.sources",
 "$.spec.template.spec.volumes[].projected.sources[]",
 "$.spec.template.spec.volumes[].projected.sources[].secret",
 "$.spec.template.spec.volumes[].projected.sources[].secret.items",
 "$.spec.template.spec.volumes[].projected.sources[].secret.items[]",
 "$.spec.template.spec.volumes[].projected.sources[].secret.items[].key",
 "$.spec.template.spec.volumes[].projected.sources[].secret.items[].path",
 "$.spec.template.spec.volumes[].projected.sources[].secret.name",
 "$.spec.template.spec.volumes[].projected.sources[].secret.optional",
 "$.spec.template.spec.volumes[].projected.sources[].serviceAccountToken",
 "$.spec.template.spec.volumes[].projected.sources[].serviceAccountToken.audience",
 "$.spec.template.spec.volumes[].projected.sources[].serviceAccountToken.expirationSeconds",
 "$.spec.template.spec.volumes[].projected.sources[].serviceAccountToken.path",
 "$.spec.template.spec.volumes[].secret",
 "$.spec.template.spec.volumes[].secret.secretName"
];
// Same generated template visitor: Deployment starts at 373, DaemonSet at 46.
// Remove Deployment strategy/controller evidence and supply the actual DaemonSet route.
function qualifyTemplate(record) {
 const result=structuredClone(record);
 const rewrite = text => text.replaceAll('Deployment','DaemonSet').replaceAll('new ReplicaSets and their new Pods','new DaemonSet Pods').replaceAll('ReplicaSet/Pod','DaemonSet/Pod');
 for(const key of ['purpose','omitted','nullValue','emptyValue','invalidValue']) result[key]=rewrite(result[key]);
 result.kind='DaemonSet'; result.receiver='Kubernetes DaemonSet template validation; then daemon controller, scheduler and named Pod consumer';
 result.operationScope='Actual external Helm DaemonSet selected outputs; API template defaulting and later created-Pod defaulting are distinct.';
 result.changeImpact=dsChange;
 result.cases=result.cases.map(c=>Object.fromEntries(Object.entries(c).map(([k,v])=>[k,typeof v==='string'?rewrite(v):v])));
 result.crossFieldConditions=result.crossFieldConditions.map(rewrite);
 result.qualificationLimits=result.qualificationLimits.map(rewrite).filter(t=>!t.includes('ReplicaSet'));
 result.qualificationLimits.push(dsRecovery,'Checked applicability: DaemonSet uses the same template PodSpec visitor and PodTemplate validator, with Always/no-activeDeadline restrictions, disabled-template preparation, added tolerations and node affinity. Pod-create-only request-from-limit/hostNetwork defaults occur later.');
 result.evidence=result.evidence.filter(e=>!e.url.includes('/pkg/registry/apps/deployment/')&&!e.url.includes('/pkg/controller/deployment/')&&!e.url.includes('/pkg/apis/apps/v1/defaults.go'));
 result.evidence=result.evidence.map(e=>{
  if(e.url.includes('/pkg/apis/apps/v1/zz_generated.defaults.go')) {
   const match=e.url.match(/#L(\d+)-L(\d+)/);
   if(match && Number(match[1])>=373 && Number(match[2])<=691) return {...e,url:e.url.replace(/#L\d+-L\d+/,`#L${Number(match[1])-327}-L${Number(match[2])-327}`),claim:rewrite(e.claim)};
  }
  return {...e,claim:rewrite(e.claim)};
 });
 result.evidence.push(specValidation,...preparation);
 return result;
}
for(const path of selectedTemplatePaths) {
 const record=deploymentTemplates.find(r=>r.fieldPath===normalize(path));
 if(!record) throw Error(`NODE_WORKLOAD_TEMPLATE_REUSE_GAP: ${path}`);
 records.push(qualifyTemplate(record));
}
for(const path of ['$.spec.template.metadata','$.spec.template.metadata.labels','$.spec.template.metadata.labels[<exact-key>]','$.spec.template.metadata.annotations','$.spec.template.metadata.annotations[<exact-key>]']) add('DaemonSet',path,'Supply labels and annotations copied to new daemon Pods.','No authored entries are supplied; selector-required labels must still be present.','Empty maps add no entries; a valid key can have empty string value.','Invalid label/annotation keys or label values, annotation size limit or selector mismatch rejects template validation.',[specValidation,source('pkg/controller/daemon/util/daemonset_util.go','107-120','Template is deep-copied and controller labels are added.')],{nullValue:path.endsWith('[<exact-key>]')?'A null string map element becomes an empty value with its key retained; it is not omission.':'A null map becomes nil; null template metadata leaves a zero struct. This does not remove root metadata.',crossFieldConditions:['Template metadata is distinct from root ObjectMeta and affects new Pods.']});
const storageDefaults=source('pkg/apis/storage/v1/defaults.go','43-71','CSIDriver defaults attachRequired true, podInfoOnMount/storageCapacity/requiresRepublish false, fsGroupPolicy ReadWriteOnceWithFSType and empty lifecycle modes Persistent.');
const storageValidation=source('pkg/apis/storage/validation/validation.go','427-584','CSIDriver validation checks capabilities, token audience uniqueness/expiry and immutable attach/lifecycle settings.');
const storagePreparation=source('pkg/registry/storage/csidriver/strategy.go','46-148','CSIDriver is cluster-scoped; disabled optional fields are dropped; spec changes increment generation on update; unconditional update and create-on-update are disallowed.');
const csiPlugin=source('pkg/volume/csi/csi_plugin.go','856-960','CSI consumers look up driver name; missing registration defaults to attach, no Pod info; getCSIDriver errors remain separate.');
const csiGroupDelegation=source('pkg/volume/csi/csi_mounter.go','249-264','VOLUME_MOUNT_GROUP delegates fsGroup through NodePublishVolume.');
const csiMount=source('pkg/volume/csi/csi_mounter.go','469-564','Mount checks fsGroup policy and volume lifecycle mode; missing driver supports Persistent only, not ephemeral.');
add('CSIDriver','$','Register a cluster-scoped CSI capability contract.','No request body cannot register a driver.','{} lacks valid metadata name.','Invalid driver identity/spec rejects; access needs cluster CSIDriver write permission.',[storageValidation,storagePreparation]);
add('CSIDriver','$.spec','Declare capabilities consumed by attach, mount and scheduling paths.','Zero spec receives defaults; registration still needs a valid driver name.','{} receives capability defaults.','Invalid capability, token request or immutable update rejects.',[storageDefaults,storageValidation,storagePreparation],{crossFieldConditions:['The object name must match the actual driver name used by CSI volume sources and the running plugin.','This declaration does not install the running driver, create a StorageClass or PVC, or demonstrate provisioning.']});
for(const [field,def,purpose,consumer] of [['attachRequired',true,'Choose whether attach/detach processing is required.',csiPlugin],['podInfoOnMount',false,'Include Pod identity attributes in NodePublishVolume.',csiPlugin],['storageCapacity',false,'Select storage capacity tracking for delayed volume binding.',source('staging/src/k8s.io/api/storage/v1/types.go','348-366','StorageCapacity is consumed for scheduling with delayed binding and CSIStorageCapacity information.')],['requiresRepublish',false,'Ask kubelet to repeat NodePublishVolume for already mounted volumes.',source('pkg/volume/csi/csi_plugin.go','457-471','RequiresRemount looks up RequiresRepublish and returns it; missing registration is false.')]]) add('CSIDriver',`$.spec.${field}`,purpose,`Nil defaults to ${def}.`,`Explicit false/true is retained; it does not select an omission default.`,'Wrong JSON type rejects decode; attachRequired changes on update reject as immutable.',[storageDefaults,storageValidation,consumer],{nullValue:`Fresh null pointer defaults to ${def}.`,crossFieldConditions:field==='storageCapacity'?['true alone supplies no CSIStorageCapacity records or driver capacity publisher. The actual selected outputs omit it and default false.']:field==='attachRequired'?['Actual SMB/SPIFFE registration sets false. This avoids attach processing but does not prove node plugin health.']:[]});
add('CSIDriver','$.spec.fsGroupPolicy','Select permission handling for mounted volumes.','Nil defaults to ReadWriteOnceWithFSType.','Empty string is retained and rejected; None intentionally disables kubelet permission modification.','Only ReadWriteOnceWithFSType, File and None accepted.',[storageDefaults,storageValidation,csiMount,csiGroupDelegation],{nullValue:'Fresh null pointer defaults to ReadWriteOnceWithFSType.',crossFieldConditions:['ReadWriteOnceWithFSType requires filesystem type and eligible access mode; read-only or absent Pod fsGroup skips permission change. A driver advertising VOLUME_MOUNT_GROUP receives group handling itself; policy does not prove ownership changes occurred.']});
for(const path of ['$.spec.volumeLifecycleModes','$.spec.volumeLifecycleModes[]']) add('CSIDriver',path,'Declare persistent and/or inline ephemeral volume support.','Absent or zero-length list defaults to [Persistent].','[] defaults to [Persistent]; an empty string item is rejected.','Only Persistent or Ephemeral accepted; lifecycle modes are immutable on update.',[storageDefaults,storageValidation,csiMount,csiGroupDelegation],{nullValue:path.endsWith('[]')?'A null string item is retained as empty string and rejected; a one-item empty list does not select the zero-length default.':'Null list defaults to [Persistent].',crossFieldConditions:['Actual SPIFFE selects Ephemeral; actual SMB selects Persistent and Ephemeral. Registration advertises support, but driver implementation and its mount prerequisites must match.']});
for(const [path,omitted,empty,invalid] of [
 ['$.spec.tokenRequests','No tokens are requested for CSI publishing.','[] requests no tokens.','Duplicate audience (including multiple empty audiences) or expiry outside 600 through 2^32 seconds rejects.'],
 ['$.spec.tokenRequests[]','Absent item makes no request.','{} requests the API-server audience with unspecified expiration.','Invalid expiry or duplicate audience rejects.'],
 ['$.spec.tokenRequests[].audience','Empty audience requests API-server default audiences.','Empty string is permitted at most once.','Duplicate audiences reject; nonstring JSON rejects decode.'],
 ['$.spec.tokenRequests[].expirationSeconds','Nil leaves expiration to the TokenRequest API default.','Explicit zero is rejected; it is not omission.','Value below 600 or above 2^32 rejects.']
]) add('CSIDriver',path,'Explain omitted service-account token delivery and audience/expiry constraints.',omitted,empty,invalid,[storageValidation,source('pkg/volume/csi/csi_mounter.go','357-425','CSI mount requests Pod-bound service account tokens for each audience and returns token attributes or secrets; fetch errors fail preparation.')],{crossFieldConditions:['Actual selected registrations omit tokenRequests, so this capability sends no requested service-account tokens. Registration is not a grant to obtain arbitrary tokens.','requiresRepublish can refresh token delivery; token expiry is a requested duration, not proof of the actual expiration returned by the API server.']});
const driverEvidence=[
 {url:'https://github.com/kubernetes-csi/csi-driver-smb/blob/1bd5463f965be7b173ff1e7fc3c9a3c29972539c/charts/v1.20.0/csi-driver-smb/templates/csi-smb-driver.yaml#L1-L17',claim:'Authenticated chart v1.20.0 selects attachRequired false, podInfoOnMount true, Persistent and conditional Ephemeral.'},
 {url:'https://github.com/kubernetes-csi/csi-driver-smb/blob/1bd5463f965be7b173ff1e7fc3c9a3c29972539c/pkg/smb/nodeserver.go#L45-L106',claim:'SMB NodePublishVolume validates capability/id/target, routes ephemeral requests, checks mount state and performs bind mount; accepted registration is not mount proof.'},
 {url:'https://github.com/spiffe/spiffe-csi/blob/e3a9167497349be5dae0e696a9dd16afae32e330/pkg/driver/driver.go#L84-L139',claim:'SPIFFE v0.2.7 requires ephemeral=true, readOnly=true, valid capability/id/target and binds the configured Workload API directory; mount failure is separate.'},
 {url:'https://github.com/spiffe/spiffe-csi/blob/e3a9167497349be5dae0e696a9dd16afae32e330/README.md#L47-L86',claim:'The driver requires hostPath access and documents registrar/socket, mount and unmount dependency diagnosis.'}
];
const actualCSISelection='Authenticated SMB chart v1.20.0 advertises Persistent and conditional Ephemeral (enableInlineVolume defaults true), attachRequired=false and podInfoOnMount=true. SPIRE chart embeds SPIFFE CSI chart 0.1.0 with appVersion 0.2.7 and selects Ephemeral only, attachRequired=false, podInfoOnMount=true and fsGroupPolicy=None. The SPIFFE consumer rejects requests without readOnly=true or csi.storage.k8s.io/ephemeral=true; it needs the configured Workload API socket directory and kubelet registrar host mounts. SMB additionally needs its actual share, credentials and mount dependencies. These release source mappings are not image provenance or proof that a running binary matches them.';
const gates='At effective Kubernetes v1.35, CSIServiceAccountTokenSecrets and MutableCSINodeAllocatableCount default true (Beta); SELinuxMountReadWriteOncePod defaults true (Beta since 1.28). Actual selected registrations omit serviceAccountTokenInSecrets, nodeAllocatableUpdatePeriodSeconds and seLinuxMount; strategy drops their fresh values if the respective gate is disabled, and preserves old nonnil values on update. Inspect actual API-server/kubelet effective versions and gates before changing those omitted capabilities; the defaults do not prove the cluster selection. Selected attach, Pod-info, lifecycle, fsGroup, storageCapacity, tokenRequests and republish behavior above does not acquire an invented new feature gate.';
for(const record of records.filter(r=>r.kind==='CSIDriver')) {
 record.evidence.push(...driverEvidence,source('pkg/features/kube_features.go','1181-1183','CSIServiceAccountTokenSecrets defaults true at effective v1.35.'),source('pkg/features/kube_features.go','1537-1541','MutableCSINodeAllocatableCount defaults true at effective v1.35.'),source('pkg/features/kube_features.go','1743-1747','SELinuxMountReadWriteOncePod defaults true since v1.28.'),storagePreparation);
 record.crossFieldConditions.push(actualCSISelection, 'SPIFFE NodePublishVolume returns gRPC InvalidArgument for missing id/target/capability, an unsupported access-mode/capability, readOnly=false or non-ephemeral request. Creating the target directory or binding the socket directory can return Internal. Its host bind mount is writable, while the required CSI readOnly flag instructs kubelet to expose it read-only in the workload. Check the actual failed request and host mount before retrying; registration cannot correct these request/runtime errors.');
 record.qualificationLimits.push(gates);
}
export const receiverContracts=Object.freeze(records.map(Object.freeze));
export function nodeWorkloadsReceiverContracts(apiVersion,kind,exactBoundaries) {
 if(apiVersions[kind]!==apiVersion) return [];
 return exactBoundaries.filter(b=>!rootBoundary(typeof b==='string'?b:b.fieldPath)).map(b=>{
  const fieldPath=typeof b==='string'?b:b.fieldPath;
  const record=receiverContracts.find(r=>r.kind===kind && r.fieldPath===normalize(fieldPath));
  if(!record) throw Error(`NODE_WORKLOADS_RECEIVER_GAP: ${apiVersion}/${kind}:${fieldPath}`);
  return {...record,fieldPath,authoritySelector:{apiVersion,kind,fieldPath}};
 });
}
