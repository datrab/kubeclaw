/** Selected batch/apps/policy workload boundaries. Publication still needs independent review. */
import {receiverContracts as podChildren} from './docs-kubernetes-apps-receiver-contracts.mjs';
import {receiverContracts as core} from './docs-kubernetes-core-receiver-contracts.mjs';
const revision='66452049f3d692768c39c797b21b793dce80314e';
const source=(file,lines,claim)=>({url:`https://github.com/kubernetes/kubernetes/blob/${revision}/${file}#L${String(lines).replace('-','-L')}`,claim});
const bv=(lines,claim)=>source('pkg/apis/batch/validation/validation.go',lines,claim);
const av=(lines,claim)=>source('pkg/apis/apps/validation/validation.go',lines,claim);
const bd=(lines,claim)=>source('pkg/apis/batch/v1/defaults.go',lines,claim);
const ad=(lines,claim)=>source('pkg/apis/apps/v1/defaults.go',lines,claim);
const kinds=['Job','CronJob','StatefulSet','PodDisruptionBudget'];
const strategies={Job:['batch/job','94-208'],CronJob:['batch/cronjob','87-116'],StatefulSet:['apps/statefulset','72-134'],PodDisruptionBudget:['policy/poddisruptionbudget','65-96']};
const parentEvidence=kind=>[source(`pkg/registry/${strategies[kind][0]}/strategy.go`,strategies[kind][1],`${kind} normal create clears status; normal update preserves stored status and applies its own preparation and validation.`)];
const jobChange='An existing Job template is immutable except the exact suspended-Job scheduling/resource allowances selected by its strategy and feature gates. The selected unsuspended migration/probe/storage Jobs remain subject to Job template immutability. Inspect completion and external effects before recreating a Job; recreation can repeat its command.';
const stateChange='An accepted StatefulSet template change affects replacement Pods through its update strategy; it does not edit all existing Pods immediately. Ordinal identity and generated PVC names persist across Pod replacement. Inspect rollout, actual mounted claims and application recovery before removing Pods or storage.';
const cronChange='Changing a CronJob template affects subsequently constructed Jobs. Existing Jobs and their Pods keep their own spec; suspension does not cancel existing Jobs. Inspect scheduled/active Jobs and external effects before retrying a backup.';
const effect=kind=>kind==='Job'?jobChange:kind==='CronJob'?cronChange:kind==='StatefulSet'?stateChange:'An accepted PDB update changes subsequent eviction budget decisions. It does not make an application ready or prevent every deletion, node failure or controller rollout.';
const records=new Map();
function add(kind,fieldPath,purpose,omitted,emptyValue,invalidValue,evidence,extra={}){
 const leaf=fieldPath.split('.').at(-1);
 const pointerFields=new Set(['backoffLimit','parallelism','completions','completionMode','suspend','activeDeadlineSeconds','manualSelector','timeZone','startingDeadlineSeconds','successfulJobsHistoryLimit','failedJobsHistoryLimit','replicas','revisionHistoryLimit','selector','rollingUpdate','partition','persistentVolumeClaimRetentionPolicy','ordinals','minAvailable','unhealthyPodEvictionPolicy']);
 const nullValue=extra.nullValue??(fieldPath==='$'?'A null request does not supply a valid object body.':`Fresh typed JSON null ${pointerFields.has(leaf)?'leaves this optional pointer nil':leaf==='matchLabels'||leaf==='annotations'||leaf==='labels'||leaf==='volumeClaimTemplates'?'leaves this map/list nil':'leaves this ordinary value at its zero value'}. ${omitted} This is not a patch deletion rule.`);
 if(kind==='CronJob'&&fieldPath.startsWith('$.spec.jobTemplate.spec.')&&!fieldPath.includes('.template.'))omitted='CronJob stores a nested JobSpec without running SetDefaults_Job. On a subsequent child Job create: '+omitted;
 const record={kind,fieldPath,purpose,receiver:`Kubernetes ${kind} typed API and its named controller/eviction boundary`,operationScope:`Actual supported Prism/ops-pod rendered output and API-probe script objects reach the normal ${kind} create/update endpoint after the selected Helm/Argo/kubectl request construction. Client merge, ownership, admission and live state precede these typed outcomes.`,omitted,nullValue,emptyValue,invalidValue,changeImpact:extra.changeImpact??effect(kind),crossFieldConditions:extra.crossFieldConditions??[],cases:[{name:'omitted-at-create',condition:'Immediate object/item parent exists in the fresh typed request.',sourceOutcome:omitted},{name:'explicit-null',condition:'JSON null reaches the typed boundary after request construction.',sourceOutcome:nullValue},{name:'explicit-empty-or-zero',condition:'The stated empty/zero value is supplied.',sourceOutcome:emptyValue},{name:'invalid-value-or-combination',condition:'The stated invalid condition reaches validation.',sourceOutcome:invalidValue},{name:'update-and-recovery',condition:'A stored field change is requested.',sourceOutcome:extra.changeImpact??effect(kind)}],evidence:[...evidence,...parentEvidence(kind),source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go','950-1004','Fresh typed null clears pointer/map/slice values and leaves ordinary scalar/struct values unchanged unless a custom decoder applies.')],qualificationLimits:['Pinned source behavior is not cluster execution evidence. API acceptance does not establish scheduling, image execution, storage availability or application correctness.','Omission is evaluated within a present immediate object/item. A missing ancestor does not instantiate every child.'],...extra};
 const key=`${kind}:${fieldPath}`; if(records.has(key))throw Error(`duplicate ${key}`); records.set(key,record);
}
for(const kind of kinds){
 add(kind,'$',`Submit one ${kind} object.`,'A missing request cannot create an object.','An empty object lacks required identity and valid selected spec.','Invalid typed body, identity or spec rejects the request.',parentEvidence(kind));
 add(kind,'$.spec',`Set ${kind} desired behavior.`,kind==='PodDisruptionBudget'?'Zero spec has no selected budget or selector; it does not protect the intended Prism workloads.':'Defaults alone cannot supply the selected valid workload template and required parent content.','The zero spec follows the same defaults and parent checks.','The selected spec must pass its own kind validator.',[kind==='StatefulSet'?av('127-234','StatefulSet spec validates its selector, template, policy and PVC specs.'):kind==='PodDisruptionBudget'?source('pkg/apis/policy/validation/validation.go','47-86','PDB validates budget exclusivity, percentages, selector and eviction policy.'):bv(kind==='Job'?'170-293':'782-819','Batch validates the actual kind-specific spec.')]);
}
for(const kind of ['Job','CronJob']){
 const p=kind==='Job'?'$.spec':'$.spec.jobTemplate.spec';
 for(const [field,om,empty,invalid] of [
 ['backoffLimit','Nil defaults to 6 when backoffLimitPerIndex is absent; a present per-index limit selects MaxInt32.','Explicit zero is retained and requests no failure retry budget.','Negative values are rejected.'],
 ['parallelism','Nil defaults to 1.','Zero is retained; no new work Pods are requested by this count.','Negative values are rejected.'],
 ['completions','When both completions and parallelism are absent on a Job, both default to 1. With explicit parallelism, nil completions stays nil.','Zero is retained.','Negative values or incompatible indexed combinations are rejected.'],
 ['completionMode','Nil defaults to NonIndexed on Job defaulting.','An explicit empty mode is not a supported completion mode.','Modes outside NonIndexed/Indexed are rejected.'],
 ['suspend','Nil defaults to false on Job defaulting.','False permits normal controller scheduling; true suspends it.','A token that cannot decode to boolean fails typed decoding.'],
 ['activeDeadlineSeconds','Nil supplies no Job execution deadline.','Zero is rejected.','Nonpositive values are rejected.'],
 ['manualSelector','Nil defaults to false on Job defaulting; CronJob nested spec stays nil until child Job defaulting.','False permits child Job automatic selector generation.','CronJob forbids true; an actual Job manual selector must satisfy generated-label/selector requirements.']
 ])add(kind,`${p}.${field}`,`Configure Job ${field}.`,om,empty,invalid,[bd('34-74','Job defaults depend on sibling values.'),bv('170-293','Job validates counts, combinations and Pod template.'),...(kind==='CronJob'?[bv('888-900','CronJob JobTemplate forbids selector and true manualSelector.')]:[])]);
 const template=`${p}.template`;
 add(kind,template,'Define the Pod template of the selected Job.','Zero template lacks required containers.','Empty template remains invalid.','Pod template validation applies; restart must be Never or OnFailure, with Never required for podFailurePolicy.',[bv('276-291','Job template requires finite restart policy.'),bv('623-679','Job update checks template immutability with explicit allowances.')]);
 add(kind,`${template}.spec`,'Set the spec copied into Job Pods.','PodSpec defaults do not repair missing containers or Job-incompatible restart Always.','Empty spec is rejected.','Invalid PodSpec or Job restart restriction rejects the template.',[bv('276-291','Job applies PodTemplate validation and finite restart policy.')]);
 add(kind,`${template}.spec.restartPolicy`,'Choose finite Job container restart behavior.','PodSpec defaults to Always, which Job validation rejects. Specify Never or OnFailure.','Empty defaults to Always and is rejected.','Always and every unsupported value are rejected; podFailurePolicy requires Never.',[source('pkg/apis/core/v1/defaults.go','211-232','Empty Pod restart policy defaults to Always.'),bv('276-291','Job only accepts Never/OnFailure.')],{nullValue:'Fresh null leaves the restart-policy scalar empty; PodSpec defaulting selects Always, which the Job validator rejects.'});
}
add('Job','$.spec.selector','Associate generated Job Pods with this Job.','With manualSelector false, prepare-for-create supplies controller UID labels and matching selector.','An authored empty selector does not exempt generated-label validation.','A mismatching selector or invalid automatic labels rejects creation; selector updates are immutable.',[source('pkg/registry/batch/job/strategy.go','221-282','Job prepare generates labels and selector.'),bv('112-188','Job validates generated selector and labels.'),bv('623-638','Selector is immutable.')]);
add('CronJob','$.spec.jobTemplate','Describe subsequently scheduled Jobs.','Zero template lacks valid Pod containers/restart policy.','Empty template fails the same checks.','Non-nil selector or true manualSelector is forbidden.',[bv('888-900','JobTemplate validates Job content without a manual selector.'),source('pkg/controller/cronjob/utils.go','243-273','Controller copies JobTemplate spec into a new named Job with owner, labels and annotations.')]);
add('CronJob','$.spec.jobTemplate.spec','Set spec for subsequently constructed Jobs.','Nested JobSpec does not run SetDefaults_Job until a child Job is created; it still must pass CronJob template validation.','Zero nested spec lacks valid container/restart content.','Selector must be nil and manualSelector nil/false.',[bv('888-900','Nested validation differs from ordinary Job create.'),source('pkg/apis/batch/v1/zz_generated.defaults.go','32-180','Generated CronJob default traversal defaults Pod children; Job-specific defaults apply to a Job object.')]);
for(const [field,om,empty,invalid] of [
 ['schedule','Empty schedule is required and rejected.','Empty is rejected.','An invalid cron schedule or unsupported TZ/CRON_TZ embedding is rejected.'],
 ['concurrencyPolicy','Empty defaults to Allow.','Empty also defaults to Allow; selected Prism uses Forbid.','Values outside Allow/Forbid/Replace are rejected.'],
 ['successfulJobsHistoryLimit','Nil defaults to 3.','Zero is retained and requests no successful Job history.','Negative values are rejected.'],
 ['failedJobsHistoryLimit','Nil defaults to 1.','Zero is retained and requests no failed Job history.','Negative values are rejected.'],
 ['suspend','Nil defaults to false.','False allows scheduling; true stops future scheduling without cancelling existing Jobs.','A non-boolean token fails decode.'],
 ['startingDeadlineSeconds','No bounded late-start window is supplied.','Zero is retained.','Negative values are rejected.'],
 ['timeZone','Nil uses the controller local time-zone interpretation.','An explicit empty string is rejected.','Unknown/invalid zones and Local are rejected.']
])add('CronJob',`$.spec.${field}`,`Set CronJob ${field}.`,om,empty,invalid,[bd('76-89','CronJob defaults concurrency/suspend/history.'),bv('782-883','CronJob validates schedule, deadlines, zone, history and concurrency.')]);
for(const [field,om,empty,invalid] of [
 ['replicas','Nil defaults to 1.','Zero is retained and scales desired Pods to zero.','Negative values are rejected.'],
 ['revisionHistoryLimit','Nil defaults to 10.','Zero is retained.','Negative values are rejected.'],
 ['minReadySeconds','The scalar remains zero.','Zero requires no additional stable-ready interval.','Negative values are rejected.'],
 ['serviceName','The string remains empty; creation validation does not require nonempty serviceName.','Empty is API-valid but supplies no selected service subdomain.','A nonempty invalid DNS label is rejected on creation; changing serviceName is forbidden.'],
 ['podManagementPolicy','Empty defaults to OrderedReady.','Empty follows the same default.','Only OrderedReady/Parallel are accepted; policy is immutable.'],
 ['updateStrategy','Empty type defaults to RollingUpdate and creates its rollingUpdate object.','Empty object follows this default.','Unsupported strategy or rollingUpdate with OnDelete is rejected.'],
 ['updateStrategy.type','Empty defaults to RollingUpdate.','Empty follows the same default. Explicit RollingUpdate with no rollingUpdate object does not construct that object in this default function.','Only RollingUpdate/OnDelete are accepted.'],
 ['updateStrategy.rollingUpdate','Constructed when type was empty; an explicitly selected RollingUpdate with nil rollingUpdate remains nil.','A present object gets partition 0 and gate-selected maxUnavailable default.','OnDelete forbids this object; invalid partition/limit rejects it.'],
 ['updateStrategy.rollingUpdate.partition','A present rollingUpdate object gets nil partition default 0.','Zero permits updates across all selected ordinals.','Negative partition is rejected.'],
 ['persistentVolumeClaimRetentionPolicy','Nil becomes an object with Retain for whenDeleted and whenScaled.','Empty object defaults both actions to Retain.','Only Retain/Delete are accepted. Retention does not replace PV reclaim policy or guarantee recoverability.'],
 ['persistentVolumeClaimRetentionPolicy.whenDeleted','Empty defaults to Retain.','Empty follows the same default.','Only Retain/Delete are accepted.'],
 ['persistentVolumeClaimRetentionPolicy.whenScaled','Empty defaults to Retain.','Empty follows the same default.','Only Retain/Delete are accepted.'],
 ['ordinals','Nil uses ordinal start zero.','Empty object has start zero.','Negative start is rejected.'],
 ['ordinals.start','Absent scalar remains zero.','Zero is retained.','Negative start is rejected.']
])add('StatefulSet',`$.spec.${field}`,`Configure StatefulSet ${field}.`,om,empty,invalid,[ad('101-147','StatefulSet defaults differ from Deployment rollout defaults.'),av('127-268','StatefulSet validates spec and limits mutable fields.'),source('pkg/controller/statefulset/stateful_set_utils.go','88-120','StatefulSet start ordinal defaults to zero.')],{changeImpact:['serviceName','podManagementPolicy'].includes(field)?'Changing this stored StatefulSet spec field is forbidden. Recreating a set changes its API identity; inspect existing ordinal Pods, PVCs and owners before any replacement.':stateChange});
for(const path of ['$.spec.selector','$.spec.selector.matchLabels','$.spec.selector.matchLabels[<exact-key>]'])add('StatefulSet',path,'Select this set’s Pods.','Missing selector is rejected; an omitted equality key adds no equality requirement.','The complete selector cannot be empty. A label equality value can be empty when its key is valid.','Invalid labels, empty selector or template mismatch reject creation. Selector changes are forbidden.',[av('174-218','StatefulSet requires valid nonempty selector matching template.'),av('238-268','Selector is outside mutable-field allowlist.')],{changeImpact:'Changing the StatefulSet selector is forbidden.'});
add('StatefulSet','$.spec.template','Define ordinal Pods.','The zero template lacks required containers and selector-matching labels.','Empty template fails these checks.','Pod template must match selector; restart must Always and activeDeadlineSeconds must be absent.',[av('58-79','StatefulSet validates selector match, Pod template and Always.'),av('193-223','Controller overwrites hostname/subdomain and installs template PVC volumes for validation.')]);
add('StatefulSet','$.spec.template.spec','Set spec copied into ordinal Pods.','PodSpec defaults supply restart Always, DNS ClusterFirst, grace 30 and scheduler; containers remain required.','Empty still lacks containers.','Invalid PodSpec, non-Always restart or nonnil activeDeadlineSeconds rejects the set.',[source('pkg/apis/core/v1/defaults.go','211-232','PodSpec defaults selected omissions.'),av('58-79','StatefulSet requires Always.'),av('218-223','StatefulSet forbids template activeDeadlineSeconds.')]);
add('StatefulSet','$.spec.template.spec.restartPolicy','Keep ordinal service Pods running.','Empty defaults to Always.','Empty defaults to Always.','Every policy other than Always is rejected.',[source('pkg/apis/core/v1/defaults.go','211-232','PodSpec restart default.'),av('58-79','StatefulSet finite-restart policy is rejected.')]);
for(const path of ['$.spec.volumeClaimTemplates','$.spec.volumeClaimTemplates[]'])add('StatefulSet',path,'Create one persistent claim per template and Pod ordinal.','No template claims are generated.','Empty list supplies no template claim; an empty item has invalid PVC spec.','PVC template specs must validate; volumeClaimTemplates cannot be changed on an existing set.',[av('117-124','Creation validates each PVC spec.'),av('238-268','PVC templates are immutable.'),source('pkg/controller/statefulset/stateful_set_utils.go','386-433','Claims are deep copied, named per ordinal and selected as Pod volumes.')],{changeImpact:'The controller creates named claims for new ordinal Pods; Pod replacement reuses the names. A template edit is forbidden on update. Inspect retention and PV reclaim before deleting any claim.'});
for(const r of core.filter(r=>r.kind==='PersistentVolumeClaim'&&new Set(['$.spec','$.spec.accessModes','$.spec.accessModes[]','$.spec.resources','$.spec.resources.requests','$.spec.resources.requests[<exact-key>]','$.spec.storageClassName','$.spec.volumeMode']).has(r.fieldPath))){
 const path=r.fieldPath.replace('$.spec','$.spec.volumeClaimTemplates[].spec');
 add('StatefulSet',path,r.purpose,'This is a stored PVC template, not a top-level admitted PVC. The controller deep-copies it into an ordinal PVC; subsequent child PVC creation reaches these PVC defaults/admission/binding outcomes: '+r.omitted,r.emptyValue,r.invalidValue,[...r.evidence,av('117-124','StatefulSet create validates each PVC spec; this is not ordinary PVC metadata admission.')],{nullValue:r.nullValue,changeImpact:'This template field cannot be updated on a stored StatefulSet. The generated PVC is a distinct API object with its own admission, immutable/bound-claim checks, storage-class defaults and storage controller. Changing its request does not resize a volume through editing this template.',crossFieldConditions:[...(r.crossFieldConditions??[]),'PVC creation and binding occur later; selected cluster StorageClass, provisioner, permissions and volume state remain execution dependencies.']});
}
for(const [path,om,empty,invalid] of [
 ['$.spec.selector','Nil selector selects no Pods.','In policy/v1 an empty selector selects all Pods in the namespace.','Invalid label grammar/operator combinations are rejected.'],
 ['$.spec.selector.matchLabels','An omitted map adds no equality requirements.','Empty map adds no requirements; the whole empty selector matches all namespace Pods.','Invalid label keys/values are rejected.'],
 ['$.spec.selector.matchLabels[<exact-key>]','Omitted key adds no requirement.','Empty equality value is accepted with a valid key.','Invalid key/value is rejected.'],
 ['$.spec.minAvailable','Nil provides no minimum; selected Prism explicitly sets 1.','Integer zero is retained.','Negative/invalid integer or percentage, percentage above 100%, or simultaneous maxUnavailable is rejected.'],
 ['$.spec.unhealthyPodEvictionPolicy','Nil uses IfHealthyBudget behavior; there is no stored default pointer here.','An explicit empty string is unsupported and rejected.','Only IfHealthyBudget/AlwaysAllow are accepted.']
])add('PodDisruptionBudget',path,'Control the selected voluntary Pod eviction budget.',om,empty,invalid,[source('pkg/apis/policy/validation/validation.go','47-86','PDB validates selector, budget and eviction policy.'),source('pkg/registry/core/pod/storage/eviction.go','231-258','Eviction treats nil policy as IfHealthyBudget and checks current Ready state.'),source('staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/helpers.go','36-74','Nil LabelSelector becomes Nothing; empty object becomes Everything.')],{crossFieldConditions:['Prism selects app-labelled worker/studio Pods and minAvailable 1. Budget counts use Pod Ready and controller observation; this is not proof of application readiness or an availability guarantee.']});
// Reuse only child-level Pod facts; discard Deployment request, rollout and case prose.
// Parent construction, validation and mutability are explicitly supplied above.
const selectedPodChildPaths=new Set([
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
 "$.spec.template.spec.containers[].env[].valueFrom.secretKeyRef",
 "$.spec.template.spec.containers[].env[].valueFrom.secretKeyRef.key",
 "$.spec.template.spec.containers[].env[].valueFrom.secretKeyRef.name",
 "$.spec.template.spec.containers[].image",
 "$.spec.template.spec.containers[].imagePullPolicy",
 "$.spec.template.spec.containers[].livenessProbe",
 "$.spec.template.spec.containers[].livenessProbe.exec",
 "$.spec.template.spec.containers[].livenessProbe.exec.command",
 "$.spec.template.spec.containers[].livenessProbe.exec.command[]",
 "$.spec.template.spec.containers[].livenessProbe.failureThreshold",
 "$.spec.template.spec.containers[].livenessProbe.initialDelaySeconds",
 "$.spec.template.spec.containers[].livenessProbe.periodSeconds",
 "$.spec.template.spec.containers[].livenessProbe.successThreshold",
 "$.spec.template.spec.containers[].livenessProbe.timeoutSeconds",
 "$.spec.template.spec.containers[].name",
 "$.spec.template.spec.containers[].readinessProbe",
 "$.spec.template.spec.containers[].readinessProbe.exec",
 "$.spec.template.spec.containers[].readinessProbe.exec.command",
 "$.spec.template.spec.containers[].readinessProbe.exec.command[]",
 "$.spec.template.spec.containers[].readinessProbe.failureThreshold",
 "$.spec.template.spec.containers[].readinessProbe.initialDelaySeconds",
 "$.spec.template.spec.containers[].readinessProbe.periodSeconds",
 "$.spec.template.spec.containers[].readinessProbe.successThreshold",
 "$.spec.template.spec.containers[].readinessProbe.timeoutSeconds",
 "$.spec.template.spec.containers[].resources",
 "$.spec.template.spec.containers[].resources.limits",
 "$.spec.template.spec.containers[].resources.limits[<exact-key>]",
 "$.spec.template.spec.containers[].resources.requests",
 "$.spec.template.spec.containers[].resources.requests[<exact-key>]",
 "$.spec.template.spec.containers[].securityContext",
 "$.spec.template.spec.containers[].securityContext.allowPrivilegeEscalation",
 "$.spec.template.spec.containers[].securityContext.capabilities",
 "$.spec.template.spec.containers[].securityContext.capabilities.drop",
 "$.spec.template.spec.containers[].securityContext.capabilities.drop[]",
 "$.spec.template.spec.containers[].securityContext.readOnlyRootFilesystem",
 "$.spec.template.spec.containers[].startupProbe.failureThreshold",
 "$.spec.template.spec.containers[].startupProbe.periodSeconds",
 "$.spec.template.spec.containers[].startupProbe.successThreshold",
 "$.spec.template.spec.containers[].startupProbe.timeoutSeconds",
 "$.spec.template.spec.containers[].volumeMounts",
 "$.spec.template.spec.containers[].volumeMounts[]",
 "$.spec.template.spec.containers[].volumeMounts[].mountPath",
 "$.spec.template.spec.containers[].volumeMounts[].name",
 "$.spec.template.spec.containers[].volumeMounts[].readOnly",
 "$.spec.template.spec.containers[].volumeMounts[].subPath",
 "$.spec.template.spec.dnsPolicy",
 "$.spec.template.spec.imagePullSecrets",
 "$.spec.template.spec.imagePullSecrets[]",
 "$.spec.template.spec.imagePullSecrets[].name",
 "$.spec.template.spec.initContainers",
 "$.spec.template.spec.initContainers[]",
 "$.spec.template.spec.initContainers[].command",
 "$.spec.template.spec.initContainers[].command[]",
 "$.spec.template.spec.initContainers[].env",
 "$.spec.template.spec.initContainers[].env[]",
 "$.spec.template.spec.initContainers[].env[].name",
 "$.spec.template.spec.initContainers[].env[].valueFrom",
 "$.spec.template.spec.initContainers[].env[].valueFrom.secretKeyRef",
 "$.spec.template.spec.initContainers[].env[].valueFrom.secretKeyRef.key",
 "$.spec.template.spec.initContainers[].env[].valueFrom.secretKeyRef.name",
 "$.spec.template.spec.initContainers[].image",
 "$.spec.template.spec.initContainers[].imagePullPolicy",
 "$.spec.template.spec.initContainers[].livenessProbe.failureThreshold",
 "$.spec.template.spec.initContainers[].livenessProbe.periodSeconds",
 "$.spec.template.spec.initContainers[].livenessProbe.successThreshold",
 "$.spec.template.spec.initContainers[].livenessProbe.timeoutSeconds",
 "$.spec.template.spec.initContainers[].name",
 "$.spec.template.spec.initContainers[].readinessProbe.failureThreshold",
 "$.spec.template.spec.initContainers[].readinessProbe.periodSeconds",
 "$.spec.template.spec.initContainers[].readinessProbe.successThreshold",
 "$.spec.template.spec.initContainers[].readinessProbe.timeoutSeconds",
 "$.spec.template.spec.initContainers[].resources",
 "$.spec.template.spec.initContainers[].resources.limits",
 "$.spec.template.spec.initContainers[].resources.limits[<exact-key>]",
 "$.spec.template.spec.initContainers[].resources.requests",
 "$.spec.template.spec.initContainers[].resources.requests[<exact-key>]",
 "$.spec.template.spec.initContainers[].securityContext",
 "$.spec.template.spec.initContainers[].securityContext.allowPrivilegeEscalation",
 "$.spec.template.spec.initContainers[].securityContext.capabilities",
 "$.spec.template.spec.initContainers[].securityContext.capabilities.drop",
 "$.spec.template.spec.initContainers[].securityContext.capabilities.drop[]",
 "$.spec.template.spec.initContainers[].securityContext.readOnlyRootFilesystem",
 "$.spec.template.spec.initContainers[].startupProbe.failureThreshold",
 "$.spec.template.spec.initContainers[].startupProbe.periodSeconds",
 "$.spec.template.spec.initContainers[].startupProbe.successThreshold",
 "$.spec.template.spec.initContainers[].startupProbe.timeoutSeconds",
 "$.spec.template.spec.initContainers[].volumeMounts",
 "$.spec.template.spec.initContainers[].volumeMounts[]",
 "$.spec.template.spec.initContainers[].volumeMounts[].mountPath",
 "$.spec.template.spec.initContainers[].volumeMounts[].name",
 "$.spec.template.spec.restartPolicy",
 "$.spec.template.spec.schedulerName",
 "$.spec.template.spec.securityContext",
 "$.spec.template.spec.securityContext.fsGroup",
 "$.spec.template.spec.securityContext.fsGroupChangePolicy",
 "$.spec.template.spec.securityContext.runAsGroup",
 "$.spec.template.spec.securityContext.runAsNonRoot",
 "$.spec.template.spec.securityContext.runAsUser",
 "$.spec.template.spec.securityContext.seccompProfile",
 "$.spec.template.spec.securityContext.seccompProfile.type",
 "$.spec.template.spec.serviceAccountName",
 "$.spec.template.spec.terminationGracePeriodSeconds",
 "$.spec.template.spec.volumes",
 "$.spec.template.spec.volumes[]",
 "$.spec.template.spec.volumes[].configMap",
 "$.spec.template.spec.volumes[].configMap.defaultMode",
 "$.spec.template.spec.volumes[].configMap.name",
 "$.spec.template.spec.volumes[].downwardAPI.defaultMode",
 "$.spec.template.spec.volumes[].emptyDir",
 "$.spec.template.spec.volumes[].emptyDir.sizeLimit",
 "$.spec.template.spec.volumes[].name",
 "$.spec.template.spec.volumes[].persistentVolumeClaim",
 "$.spec.template.spec.volumes[].persistentVolumeClaim.claimName",
 "$.spec.template.spec.volumes[].persistentVolumeClaim.readOnly",
 "$.spec.template.spec.volumes[].projected",
 "$.spec.template.spec.volumes[].projected.defaultMode",
 "$.spec.template.spec.volumes[].projected.sources",
 "$.spec.template.spec.volumes[].projected.sources[]",
 "$.spec.template.spec.volumes[].projected.sources[].configMap",
 "$.spec.template.spec.volumes[].projected.sources[].configMap.items",
 "$.spec.template.spec.volumes[].projected.sources[].configMap.items[]",
 "$.spec.template.spec.volumes[].projected.sources[].configMap.items[].key",
 "$.spec.template.spec.volumes[].projected.sources[].configMap.items[].path",
 "$.spec.template.spec.volumes[].projected.sources[].configMap.name",
 "$.spec.template.spec.volumes[].projected.sources[].downwardAPI",
 "$.spec.template.spec.volumes[].projected.sources[].downwardAPI.items",
 "$.spec.template.spec.volumes[].projected.sources[].downwardAPI.items[]",
 "$.spec.template.spec.volumes[].projected.sources[].downwardAPI.items[].fieldRef",
 "$.spec.template.spec.volumes[].projected.sources[].downwardAPI.items[].fieldRef.fieldPath",
 "$.spec.template.spec.volumes[].projected.sources[].downwardAPI.items[].path",
 "$.spec.template.spec.volumes[].projected.sources[].serviceAccountToken",
 "$.spec.template.spec.volumes[].projected.sources[].serviceAccountToken.expirationSeconds",
 "$.spec.template.spec.volumes[].projected.sources[].serviceAccountToken.path",
 "$.spec.template.spec.volumes[].secret",
 "$.spec.template.spec.volumes[].secret.defaultMode",
 "$.spec.template.spec.volumes[].secret.secretName"
]);
// Additional selected paths emitted by API probe and PostgreSQL recovery scripts.
for(const suffix of ['affinity', 'affinity.nodeAffinity', 'affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution', 'affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms', 'affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[]', 'affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchFields', 'affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchFields[]', 'affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchFields[].key', 'affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchFields[].operator', 'affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchFields[].values', 'affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchFields[].values[]', 'containers[].envFrom', 'containers[].envFrom[]', 'containers[].envFrom[].configMapRef', 'containers[].envFrom[].configMapRef.name', 'containers[].env[].valueFrom.secretKeyRef.optional', 'containers[].securityContext.runAsUser', 'containers[].securityContext.runAsGroup', 'containers[].securityContext.runAsNonRoot', 'containers[].securityContext.seccompProfile', 'containers[].securityContext.seccompProfile.type'])selectedPodChildPaths.add('$.spec.template.spec.'+suffix);
const contextual=/Deployment|ReplicaSet|deployment\/|structured-merge|strategicpatch|merge\/update|fieldmanager|kubectl|gitops-engine/;
const neutral=t=>t?.replaceAll('Deployment template','Pod template').replaceAll('Deployment','Pod template');
for(const kind of ['Job','CronJob','StatefulSet']){
 const prefix=kind==='CronJob'?'$.spec.jobTemplate.spec.template':'$.spec.template';
 for(const r of podChildren){
  if(!selectedPodChildPaths.has(r.fieldPath)||!r.fieldPath.startsWith('$.spec.template.spec.')||['$.spec.template.spec.restartPolicy','$.spec.template.spec.activeDeadlineSeconds'].includes(r.fieldPath))continue;
  const ev=r.evidence.filter(e=>!contextual.test(`${e.url} ${e.claim}`));
  if(!ev.length)continue;
  const fieldPath=r.fieldPath.replace('$.spec.template',prefix);
  add(kind,fieldPath,neutral(r.purpose),neutral(r.omitted),neutral(r.emptyValue),neutral(r.invalidValue),ev,{nullValue:neutral(r.nullValue),crossFieldConditions:(r.crossFieldConditions??[]).filter(t=>!contextual.test(t)).map(neutral),qualificationLimits:['These common child facts use the named Pod validator/default/runtime consumers. The actual kind supplies its parent restrictions, update strategy and request ownership. The actual workload parent rows govern construction and permitted updates.','The Pod API create after controller construction and admission is a separate defaulting/validation boundary.']});
 }
 for(const path of [prefix+'.metadata',prefix+'.metadata.labels',prefix+'.metadata.labels[<exact-key>]',prefix+'.metadata.annotations',prefix+'.metadata.annotations[<exact-key>]'])add(kind,path,'Attach metadata copied to newly constructed Pods.','Absent labels/annotations contribute no entries; selector matching still applies.','Empty maps contribute no entries; empty label value is legal with a valid key.','Pod-template label/annotation validation applies; selector mismatch rejects the workload.',[source('pkg/apis/core/validation/validation.go','7066-7080','PodTemplate validates labels and annotations, not all ordinary ObjectMeta fields.'),source('pkg/controller/controller_utils.go','562-599','GetPodFromTemplate copies template labels, annotations, finalizers and Pod spec.'),...(kind==='StatefulSet'?[source('pkg/controller/statefulset/stateful_set_utils.go','435-458','StatefulSet assigns Pod ordinal identity and service subdomain.')]:[source('pkg/controller/job/job_controller.go','1770-1810','Job controller passes its selected Pod template to CreatePodsWithGenerateName.')])]);
}
for(const path of ['$.spec.volumeClaimTemplates[].metadata','$.spec.volumeClaimTemplates[].metadata.name','$.spec.volumeClaimTemplates[].metadata.annotations','$.spec.volumeClaimTemplates[].metadata.annotations[<exact-key>]'])add('StatefulSet',path,'Supply metadata for a generated ordinal PVC.','No selected name/annotation is supplied by this boundary.','Empty claim template name cannot establish the intended volume/claim identity.','Template spec validation is separate from later ordinary PVC metadata validation; generated PVC create can reject metadata.',[av('117-124','StatefulSet validates PVC template specs.'),source('pkg/controller/statefulset/stateful_set_utils.go','386-407','PVC deep copy preserves template metadata, assigns claim name/namespace and selector labels.')],{changeImpact:'PVC template metadata is within immutable volumeClaimTemplates. Generated claims have their own API identity; annotations copied to them are not a Helm/Argo operation on the StatefulSet.'});
for(const kind of ['Job','CronJob'])add(kind,kind==='Job'?'$.spec.podReplacementPolicy':'$.spec.jobTemplate.spec.podReplacementPolicy','Set when replacement Job Pods may be created.','With JobPodReplacementPolicy enabled, child Job defaulting selects TerminatingOrFailed without podFailurePolicy and Failed with it. CronJob nested defaulting does not run SetDefaults_Job.','An explicit empty policy is unsupported.','Only Failed/TerminatingOrFailed are accepted; podFailurePolicy requires Failed.',[bd('60-69','Job replacement default depends on podFailurePolicy and the gate.'),bv('229-274','Job validates replacement policy and related conditions.')]);
export const receiverContracts=[...records.values()];
