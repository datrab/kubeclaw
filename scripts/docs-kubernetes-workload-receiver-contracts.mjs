/** Selected batch/apps/policy workload boundaries. Publication still needs independent review. */
import {receiverContracts as podChildren} from './docs-kubernetes-apps-receiver-contracts.mjs';
import {yamlFieldPathTokens} from './yaml-field-path.mjs';
import {receiverContracts as core} from './docs-kubernetes-core-receiver-contracts.mjs';
const revision='66452049f3d692768c39c797b21b793dce80314e';
const source=(file,lines,claim)=>({url:`https://github.com/kubernetes/kubernetes/blob/${revision}/${file}#L${String(lines).replace('-','-L')}`,claim});
const bv=(lines,claim)=>source('pkg/apis/batch/validation/validation.go',lines,claim);
const av=(lines,claim)=>source('pkg/apis/apps/validation/validation.go',lines,claim);
const bd=(lines,claim)=>source('pkg/apis/batch/v1/defaults.go',lines,claim);
// The complete function is the smallest scope that proves these calls absent.
const cronTraversal=source('pkg/apis/batch/v1/zz_generated.defaults.go','42-369','The complete SetObjectDefaults_CronJob traversal defaults CronJob, embedded PodSpec and present children; it invokes neither SetDefaults_Job nor SetDefaults_Pod.');
const jobTraversal=source('pkg/apis/batch/v1/zz_generated.defaults.go','378-705','The complete SetObjectDefaults_Job traversal defaults Job, embedded PodSpec and present children; it does not invoke SetDefaults_Pod.');
const ad=(lines,claim)=>source('pkg/apis/apps/v1/defaults.go',lines,claim);
const kinds=['Job','CronJob','StatefulSet','PodDisruptionBudget'];
const strategies={Pod:['core/pod','86-118'],Job:['batch/job','94-208'],CronJob:['batch/cronjob','87-116'],StatefulSet:['apps/statefulset','72-134'],PodDisruptionBudget:['policy/poddisruptionbudget','65-96']};
const updateValidationAuthorities={
 Pod:['141-148','Normal Pod update derives validation options from the new and old specs and metadata, sets ResourceIsPod, and calls ValidatePodUpdate.'],
 Job:['297-305','Normal Job update obtains Job validation options, runs ValidateJob and ValidateJobUpdate, and combines their errors.'],
 CronJob:['143-149','Normal CronJob update derives options from its new and old Pod templates and calls ValidateCronJobUpdate.'],
 StatefulSet:['159-165','Normal StatefulSet update derives options from its new and old Pod templates and calls ValidateStatefulSetUpdate.'],
 PodDisruptionBudget:['112-117','Normal PodDisruptionBudget update uses old-selector compatibility options and validates the new budget.'],
};
const parentEvidence=kind=>[source(`pkg/registry/${strategies[kind][0]}/strategy.go`,strategies[kind][1],`${kind} normal create clears status; normal update preserves stored status and applies its own preparation.`),source(`pkg/registry/${strategies[kind][0]}/strategy.go`,...updateValidationAuthorities[kind])];
const jobChange='An existing Job template is immutable except the exact suspended-Job scheduling/resource allowances selected by its strategy and feature gates. The selected unsuspended migration/probe/storage Jobs remain subject to Job template immutability. Inspect completion and external effects before recreating a Job; recreation can repeat its command.';
const jobController=(lines,claim)=>source('pkg/controller/job/job_controller.go',lines,claim);
const jobScalarChanges={
 manualSelector:'Changing this flag on an existing Job does not generate a new selector or change its existing Pods. Normal update validation still requires a selector matching the template and preserves selector immutability and template restrictions. The generated-label validation bypass for manualSelector true is a create-route rule. Inspect the stored selector, template labels and owned Pods before another write; this flag is not a repair for a mismatched or overly broad selector.',
 completions:'The completion count is immutable for the selected NonIndexed Jobs. An update that changes this count is rejected, independently of Pod template restrictions. Inspect completed work and external results before replacing a Job to use a different count; a replacement can execute the command again.',
 completionMode:'The completion mode is immutable on an existing Job. An update that changes it is rejected, independently of Pod template restrictions. The selected jobs use NonIndexed behavior. Inspect completed work and external results before replacing a Job; replacement can repeat the command.',
 backoffLimit:'An accepted change adjusts the failure limit checked against the existing Job failure and restart history. Lowering it can produce BackoffLimitExceeded at reconciliation; active Pods are then removed as the Job finishes. Raising it does not erase failures or guarantee recovery of an already failed Job. Inspect Job conditions, Pod failures and external command effects before retrying; replacement work can repeat those effects.',
 parallelism:'An accepted change adjusts the desired active Pod count for the existing Job. The count also depends on remaining completions; for a Job without a completion count after a success, the controller keeps its current active count. Lowering parallelism can delete excess active Pods. Raising it can permit more Pods, subject to backoff, termination tracking and other Job constraints. Save required results and inspect in-flight work before reducing the count; deletion does not roll back external effects.',
 suspend:'Changing an unfinished Job to suspend true makes the controller delete active Pods. Changing it to false permits scheduling again and, when the controller records the resumed condition, resets startTime to the current time. The execution deadline is not checked while suspended. Suspension does not undo completed external work or guarantee that a stopped command left a recoverable result. Inspect Job conditions, terminating Pods and command effects before resuming.',
 activeDeadlineSeconds:'An accepted change affects the existing unsuspended Job execution deadline measured from status.startTime. The controller fails the deadline check when elapsed time is greater than or equal to the current value and removes active Pods while finishing the Job. Nil, missing startTime or suspension bypass this deadline check; resuming resets startTime when the resumed condition is recorded. Shortening the value can fail an active Job; increasing it does not guarantee revival of a failed Job. Inspect conditions, Pod termination and external results before recovery.',
};
const jobScalarEvidence=field=>jobScalarChanges[field]?[
 bv('623-634','Job spec update validates the new spec and explicit immutable fields; template restrictions are separate from these scalar controller inputs.'),
 ...(field==='manualSelector'?[source('pkg/registry/batch/job/strategy.go','132-166','Complete Job update preparation preserves status, drops disabled fields and increments generation; it does not generate a selector.'),bv('609-612','Normal Job update calls ValidateJobSpecUpdate.'),bv('170-188','JobSpec validation requires a selector and checks that it matches template labels.')]:[]),
 ...(field==='completions'?[bv('902-906','For a NonIndexed Job, completion-count updates must preserve the old value.')]:[]),
 ...(field==='backoffLimit'||field==='activeDeadlineSeconds'?[jobController('945-974','Current failure counts, restart checks and active deadline can select BackoffLimitExceeded or DeadlineExceeded.'),jobController('999-1004','A finished condition causes removal of active Pods; incomplete removal delays finishing.')]:[]),
 ...(field==='parallelism'?[jobController('1653-1719','Current parallelism and remaining completions determine the desired active count; excess Pods are removed, with deletion taking precedence in this cycle.'),jobController('1722-1739','Terminating Pods and remaining backoff can defer additional Pod creation.')]:[]),
 ...(field==='suspend'?[jobController('1643-1673','A nonnil true suspend value selects deletion of active Pods.'),jobController('1043-1068','Suspend/resume conditions produce events; recording resume resets startTime to now.')]:[]),
 ...(field==='suspend'||field==='activeDeadlineSeconds'?[jobController('1592-1602','Deadline checking skips nil deadline, nil startTime and suspended Jobs; otherwise elapsed time greater than or equal to the allowed duration exceeds it.'),jobController('1054-1068','When recording a resumed condition, the controller resets startTime to measure continuously active execution.')]:[]),
]:[];
const stateChange='An accepted StatefulSet template change affects replacement Pods through its update strategy; it does not edit all existing Pods immediately. Ordinal identity and generated PVC names persist across Pod replacement. Inspect rollout, actual mounted claims and application recovery before removing Pods or storage.';
const stateReplicaChange='An accepted replicas change adjusts the desired ordinal Pod range. The controller creates missing Pods in that range and selects existing Pods outside it for scale-down. Ordered processing can wait for termination, readiness or availability; API acceptance does not guarantee immediate scaling. Zero requests no ordinal replicas but does not prove that all Pods have terminated. Before removing out-of-range Pods, the controller checks and updates claim retention ownership. PVC outcomes depend on retention policy and storage lifecycle; reducing replicas is not a blanket instruction to delete PVCs. Inspect desired/current counts, Pod events, claim owners, retention and application recovery before scaling down. Increasing replicas cannot restore lost external data.';
const stateRetentionChange='An accepted retention policy change affects later reconciliation of generated claim owner references. The helper removes its set/Pod references before applying the current policy and does not add them when an unexpected controller owns the claim. Retain for both actions adds neither reference; Delete on set deletion adds the set reference, and Delete on scale-down can add the out-of-range Pod reference. When both actions select Delete, the Pod range determines which reference is used. These references affect later garbage collection; the policy update is not synchronous PVC deletion and does not replace PV reclaim policy. Read existing claim owner references and retention before scaling or deleting. Correct failed claim updates before relying on the new policy; returning to Retain cannot restore deleted data.';
const stateStrategyChange='An accepted strategy change affects later replacement of Pods whose revision differs from the update revision. OnDelete skips automatic revision replacement; it does not disable scaling. RollingUpdate selects replacement targets from the highest ordinal down to the partition threshold; lowering the partition can expose more targets, while raising it does not restore Pods already removed. A nil rollingUpdate uses threshold zero in the controller. The MaxUnavailableStatefulSet gate selects the availability-budget path; the other path removes one mismatched Pod and waits for unavailable targets. Readiness, termination and controller errors can delay progress. Inspect revisions, Pod availability and application recovery before changing strategy or partition; an accepted update does not prove a successful rollout.';
const cronChange='Changing a CronJob template affects subsequently constructed Jobs. Existing Jobs and their Pods keep their own spec; suspension does not cancel existing Jobs. Inspect scheduled/active Jobs and external effects before retrying a backup.';
const cronConcurrencyChange='At a subsequent scheduled start, Allow permits another Job. Forbid skips that start when status lists an active Job; delayed observation can still allow overlap. Replace fetches and deletes listed active Jobs before constructing the next Job. A fetch or delete failure stops that reconciliation; successful deletion is not rolled back if the next Job cannot be created. Changing the policy does not itself cancel Jobs at the API update. Before selecting Replace or retrying, inspect active Jobs, scheduling events and backup side effects; a new Job can repeat external work.';
const cronController=(lines,claim)=>source('pkg/controller/cronjob/cronjob_controllerv2.go',lines,claim);
const cronHistoryChange=category=>`Changing this limit affects already finished ${category} Jobs observed by the controller. It sorts that category by Job start time and deletes excess Jobs; zero retains none of that finished category. This history limit does not select unfinished Jobs. Cleanup runs before the suspension check. A failed deletion emits FailedDelete; other deletions can still succeed. Save required logs, status and result evidence before lowering the limit. Raising the limit cannot restore deleted Jobs.`;
const cronScheduleChange='When the controller observes a changed schedule or timeZone, it parses the new formatted schedule and queues reconciliation for its next calculated time. A parse error emits UnParseableCronJobSchedule and returns from this update handler without scheduling that reconciliation. This changes future scheduling, not the spec or execution of existing Jobs. Queued old work and later reconciliation still follow suspension, deadline and concurrency checks. Inspect the stored values, lastScheduleTime, active Jobs and scheduling events before expecting a backup at the new time.';
const cronScalarChanges={
 schedule:cronScheduleChange,
 timeZone:cronScheduleChange,
 successfulJobsHistoryLimit:cronHistoryChange('successful'),
 failedJobsHistoryLimit:cronHistoryChange('failed'),
 startingDeadlineSeconds:'Changing this deadline changes whether a missed scheduled start is eligible at a later reconciliation. It does not change an existing Job execution deadline. A start whose scheduled time plus the deadline is before the current controller time is skipped with MissSchedule. Zero supplies no allowance for a late start; it does not guarantee an on-time start. Shortening the deadline can prevent catch-up; lengthening or removing it can permit a missed start, subject to suspension, concurrency and other scheduling checks. Inspect lastScheduleTime, active Jobs, events and completed backup effects before retrying.',
};
const cronScalarEvidence=field=>field==='successfulJobsHistoryLimit'||field==='failedJobsHistoryLimit'?[
 cronController('205-216','Reconciliation cleans up observed finished Jobs before calling syncCronJob.'),
 cronController('682-716','Cleanup separates successful and failed finished Jobs and applies each current history limit to its category.'),
 cronController('718-747','True Complete or Failed conditions identify finished Jobs; excess Jobs are selected after sorting by Job start time.'),
 cronController('749-760','A deletion failure emits FailedDelete and returns false; a successful deletion removes the active reference and emits SuccessfulDelete.'),
 cronController('514-518','Suspension stops new scheduling in syncCronJob, after the earlier cleanup call.'),
]:field==='startingDeadlineSeconds'?[
 cronController('531-563','The controller obtains a missed scheduled time; a scheduled time plus startingDeadlineSeconds before now emits MissSchedule and returns without starting that Job.'),
]:field==='schedule'||field==='timeZone'?[
 cronController('384-413','The update handler compares schedule and timeZone, parses a changed schedule, emits UnParseableCronJobSchedule on error, or queues the next calculated reconciliation.'),
]:[];
const effect=kind=>kind==='Job'?jobChange:kind==='CronJob'?cronChange:kind==='StatefulSet'?stateChange:'An accepted PDB update changes subsequent eviction budget decisions. It does not make an application ready or prevent every deletion, node failure or controller rollout.';
const records=new Map();
function add(kind,fieldPath,purpose,omitted,emptyValue,invalidValue,evidence,extra={}){
 const leaf=fieldPath.split('.').at(-1);
 const pointerFields=new Set(['backoffLimit','parallelism','completions','completionMode','podReplacementPolicy','suspend','activeDeadlineSeconds','manualSelector','timeZone','startingDeadlineSeconds','successfulJobsHistoryLimit','failedJobsHistoryLimit','replicas','revisionHistoryLimit','selector','rollingUpdate','partition','persistentVolumeClaimRetentionPolicy','ordinals','minAvailable','unhealthyPodEvictionPolicy']);
 if(kind==='CronJob'&&fieldPath.startsWith('$.spec.jobTemplate.spec.')&&!fieldPath.startsWith('$.spec.jobTemplate.spec.template')) {
  omitted='CronJob defaulting leaves this nested JobSpec value unchanged; SetDefaults_Job does not run on the stored template. CronJob template validation still applies. When the controller copies this spec and creates a separate child Job, Job defaulting applies: '+omitted;
  evidence=[...evidence,cronTraversal,source('pkg/controller/cronjob/utils.go','244-266','getJobFromTemplate2 deep-copies the stored template spec into a separate child Job.'),source('pkg/controller/cronjob/cronjob_controllerv2.go','604-609','The controller constructs the child Job request, then submits CreateJob.')];
 }
 const selectorMapItem=fieldPath.endsWith('.matchLabels[<exact-key>]');
 const stringMapItem=selectorMapItem||/\.metadata\.(labels|annotations)\[<exact-key>\]$/.test(fieldPath);
 const selectorMapEvidence=stringMapItem?[source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go','754-780','For a map value, object decoding allocates or clears the element before decoding.'),source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go','884-896','Map decoding writes the decoded element with SetMapIndex; a null string member retains its key and empty string value.'),...(selectorMapItem?[source('staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/helpers.go','44-50','Each matchLabels key becomes an Equals requirement with its retained string value.')]:[])]:[];
 const nullValue=extra.nullValue??(stringMapItem?`Fresh typed JSON null for a string map member retains its key with value "". ${selectorMapItem?'That key adds an equality-to-empty requirement':'A metadata entry with an empty string value is contributed'}; it is not an omitted key. This is not a patch deletion rule.`:fieldPath==='$'?'A null request does not supply a valid object body.':`Fresh typed JSON null ${pointerFields.has(leaf)?'leaves this optional pointer nil':leaf==='matchLabels'||leaf==='annotations'||leaf==='labels'||leaf==='volumeClaimTemplates'?'leaves this map/list nil':'leaves this ordinary value at its zero value'}. ${omitted} This is not a patch deletion rule.`);
 const record={kind,fieldPath,purpose,receiver:`Kubernetes ${kind} typed API and its named controller/eviction boundary`,operationScope:`These contracts describe the normal ${kind} create/update boundary when a selected object reaches it. The applicable producer and client operation come from that object source and profile; not every producer emits every kind. Client request construction, merge, ownership, admission and live state precede these typed outcomes. Offline rendering is not evidence of an executed API write.`,omitted,nullValue,emptyValue,invalidValue,changeImpact:extra.changeImpact??effect(kind),crossFieldConditions:extra.crossFieldConditions??[],cases:[{name:'omitted-at-create',condition:'Immediate object/item parent exists in the fresh typed request.',sourceOutcome:omitted},{name:'explicit-null',condition:'JSON null reaches the typed boundary after request construction.',sourceOutcome:nullValue},{name:'explicit-empty-or-zero',condition:'The stated empty/zero value is supplied.',sourceOutcome:emptyValue},{name:'invalid-value-or-combination',condition:'The stated invalid condition reaches validation.',sourceOutcome:invalidValue},{name:'update-and-recovery',condition:'A stored field change is requested.',sourceOutcome:extra.changeImpact??effect(kind)}],evidence:[...evidence,...selectorMapEvidence,...parentEvidence(kind),source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go','950-1004','Fresh typed null clears pointer/map/slice values and leaves ordinary scalar/struct values unchanged unless a custom decoder applies.')],qualificationLimits:['Pinned source behavior is not cluster execution evidence. API acceptance does not establish scheduling, image execution, storage availability or application correctness.','Omission is evaluated within a present immediate object/item. A missing ancestor does not instantiate every child.'],...extra};
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
 ['activeDeadlineSeconds','Nil supplies no Job execution deadline.','Zero is accepted. Once an unsuspended Job has a start time, zero allows no elapsed execution time before the controller deadline check.','Negative values are rejected.'],
 ['manualSelector','Nil defaults to false on Job defaulting; CronJob nested spec stays nil until child Job defaulting.','False permits child Job automatic selector generation.','CronJob forbids true. For an actual Job, manualSelector true skips automatic label/selector generation and generated-label validation; the supplied selector must still be valid and match the Pod template labels.']
 ])add(kind,`${p}.${field}`,`Configure Job ${field}.`,om,empty,invalid,[bd('34-74','Job defaults depend on sibling values.'),...jobScalarEvidence(field),field==='activeDeadlineSeconds'?bv('200-201','JobSpec validates activeDeadlineSeconds as nonnegative.'):bv('170-293','Job validates counts, combinations and Pod template.'),...(field==='activeDeadlineSeconds'?[source('pkg/controller/job/job_controller.go','1592-1602','Deadline checking skips nil deadline, nil start time and suspended Jobs; otherwise elapsed time is compared with the supplied deadline.')]:[]),...(field==='manualSelector'?[bv('101-105','manualSelector true bypasses generated-label validation.'),source('pkg/registry/batch/job/strategy.go','221-224','Selector generation runs only when manualSelector is false.')]:[]),...(kind==='CronJob'?[bv('888-900','CronJob JobTemplate forbids selector and true manualSelector.')]:[])],jobScalarChanges[field]?{changeImpact:kind==='Job'?jobScalarChanges[field]:`${cronChange} The new child Job uses this value: ${jobScalarChanges[field]}`} : {});
 const template=`${p}.template`;
 add(kind,template,'Define the Pod template of the selected Job.','Zero template lacks required containers.','Empty template remains invalid.','Pod template validation applies; restart must be Never or OnFailure, with Never required for podFailurePolicy.',[bv('276-291','Job template requires finite restart policy.'),bv('623-679','Job update checks template immutability with explicit allowances.')]);
 add(kind,`${template}.spec`,'Set the spec copied into Job Pods.','PodSpec defaults do not repair missing containers or Job-incompatible restart Always.','Empty spec is rejected.','Invalid PodSpec or Job restart restriction rejects the template.',[bv('276-291','Job applies PodTemplate validation and finite restart policy.')]);
 add(kind,`${template}.spec.restartPolicy`,'Choose finite Job container restart behavior.','PodSpec defaults to Always, which Job validation rejects. Specify Never or OnFailure.','Empty defaults to Always and is rejected.','Always and every unsupported value are rejected; podFailurePolicy requires Never.',[source('pkg/apis/core/v1/defaults.go','211-232','Empty Pod restart policy defaults to Always.'),bv('276-291','Job only accepts Never/OnFailure.')],{nullValue:'Fresh null leaves the restart-policy scalar empty; PodSpec defaulting selects Always, which the Job validator rejects.'});
}
add('Job','$.spec.selector','Associate generated Job Pods with this Job.','With manualSelector false, prepare-for-create supplies controller UID labels and matching selector.','An authored empty selector does not exempt generated-label validation.','A mismatching selector or invalid automatic labels rejects creation; selector updates are immutable.',[source('pkg/registry/batch/job/strategy.go','221-282','Job prepare generates labels and selector.'),bv('112-188','Job validates generated selector and labels.'),bv('623-638','Selector is immutable.')],{changeImpact:'An update that changes an existing Job selector is rejected as immutable. Changing manualSelector does not regenerate it or bypass selector/template matching. Inspect the stored selector, template labels and owned Pods before retrying. Replacing a Job creates a new identity and can repeat its command; it is not a safe repair without checking completed work and external effects.'});
add('CronJob','$.spec.jobTemplate','Describe subsequently scheduled Jobs.','Zero template lacks valid Pod containers/restart policy.','Empty template fails the same checks.','Non-nil selector or true manualSelector is forbidden.',[bv('888-900','JobTemplate validates Job content without a manual selector.'),source('pkg/controller/cronjob/utils.go','243-273','Controller copies JobTemplate spec into a new named Job with owner, labels and annotations.')]);
add('CronJob','$.spec.jobTemplate.spec','Set spec for subsequently constructed Jobs.','Nested JobSpec does not run SetDefaults_Job until a child Job is created; it still must pass CronJob template validation.','Zero nested spec lacks valid container/restart content.','Selector must be nil and manualSelector nil/false.',[bv('888-900','Nested validation differs from ordinary Job create.'),cronTraversal]);
for(const [field,om,empty,invalid] of [
 ['schedule','Empty schedule is required and rejected.','Empty is rejected.','Invalid schedule parsing is rejected. Create rejects embedded TZ/CRON_TZ. Update permits embedding only when the old schedule contains TZ, and then the timeZone field must be nil.'],
 ['concurrencyPolicy','Empty defaults to Allow.','Empty also defaults to Allow; selected Prism uses Forbid.','Values outside Allow/Forbid/Replace are rejected.'],
 ['successfulJobsHistoryLimit','Nil defaults to 3.','Zero is retained and requests no successful Job history.','Negative values are rejected.'],
 ['failedJobsHistoryLimit','Nil defaults to 1.','Zero is retained and requests no failed Job history.','Negative values are rejected.'],
 ['suspend','Nil defaults to false.','False allows scheduling; true stops future scheduling without cancelling existing Jobs.','A non-boolean token fails decode.'],
 ['startingDeadlineSeconds','No bounded late-start window is supplied.','Zero is retained.','Negative values are rejected.'],
 ['timeZone','Nil uses the controller local time-zone interpretation.','An explicit empty string is rejected on create or when this field changes; an unchanged stored value is not rechecked by the time-zone validator.','On create or a changed timeZone, unknown/invalid zones and Local are rejected. An unchanged old timeZone skips this field validator; schedule and other validation still apply.']
])add('CronJob',`$.spec.${field}`,`Set CronJob ${field}.`,om,empty,invalid,[bd('76-89','CronJob defaults concurrency/suspend/history.'),bv('782-883','CronJob validates schedule, deadlines, zone, history and concurrency.'),...cronScalarEvidence(field),...(field==='concurrencyPolicy'?[source('pkg/controller/cronjob/cronjob_controllerv2.go','573-609','Forbid checks observed active Jobs and can miss overlap; Replace fetches/deletes listed active Jobs before creating the replacement and aborts on fetch/delete errors.'),source('pkg/controller/cronjob/cronjob_controllerv2.go','604-641','After replacement deletions, construction or CreateJob failure returns without restoring the deleted Jobs.')]:field==='schedule'?[bv('788-792','The old schedule selects TZ-embedding compatibility.'),bv('833-846','Schedule parsing and embedded-TZ/timeZone cross-field checks apply.'),source('pkg/controller/cronjob/cronjob_controllerv2.go','766-783','The controller warns UnsupportedSchedule for embedded TZ and returns that schedule; a timeZone field otherwise prefixes a successfully loaded zone.')]:field==='timeZone'?[bv('799-801','Time-zone validation runs at create and when timeZone changes, not for an unchanged old value.')]:[])],{...(field==='concurrencyPolicy'?{changeImpact:cronConcurrencyChange}:cronScalarChanges[field]?{changeImpact:cronScalarChanges[field]}:{}),crossFieldConditions:field==='schedule'||field==='timeZone'?['Update compatibility depends on the actual old schedule and timeZone. A value surviving this field validator is not proof that the controller can interpret it or that the whole update passes. A legacy embedded TZ schedule can pass compatibility validation while the controller emits UnsupportedSchedule. Inspect the stored spec and scheduling events before retrying.']:[]});
for(const [field,om,empty,invalid] of [
 ['replicas','Nil defaults to 1.','Zero is retained and scales desired Pods to zero.','Negative values are rejected.'],
 ['revisionHistoryLimit','Nil defaults to 10.','Zero is retained.','Negative values are accepted with a warning and retain all historical revisions.'],
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
])add('StatefulSet',`$.spec.${field}`,`Configure StatefulSet ${field}.`,om,empty,invalid,[ad('101-147','StatefulSet defaults differ from Deployment rollout defaults.'),av('127-268','StatefulSet validates spec and limits mutable fields.'),...(field.startsWith('persistentVolumeClaimRetentionPolicy')?[source('pkg/controller/statefulset/stateful_set_utils.go','303-348','Claim owner references are reconciled against retention actions, unexpected controllers and the current ordinal range.'),source('pkg/controller/statefulset/stateful_set_control.go','672-685','Before scale-down, claims are checked and updated for retention; errors stop this progress.')]:[]),...(field.startsWith('updateStrategy')?[source('pkg/controller/statefulset/stateful_set_control.go','704-748','OnDelete skips revision replacement; the gate selects a separate path, otherwise partition bounds descending revision replacement with availability waits.'),source('pkg/controller/statefulset/stateful_set_control.go','760-825','The gated path uses partition and an availability budget before deleting revision-mismatched targets.')]:[]),...(field==='replicas'?[source('pkg/controller/statefulset/stateful_set_control.go','594-630','Current replicas defines the ordinal range; missing entries get new Pod objects and out-of-range Pods are sorted for removal.'),source('pkg/controller/statefulset/stateful_set_control.go','440-479','Replica processing checks stale claims, creates missing Pods and can wait for terminating or unready predecessors.'),source('pkg/controller/statefulset/stateful_set_control.go','661-700','Replica processing precedes claim-retention ownership checks and out-of-range Pod removal; blocking or errors return before further progress.'),source('pkg/controller/statefulset/stateful_set_control.go','513-539','Ordered scale-down can wait for termination or availability; otherwise it requests deletion of the selected Pod.')]:[]),...(field==='revisionHistoryLimit'?[source('pkg/registry/apps/statefulset/strategy.go','143-145','Negative revisionHistoryLimit is accepted with a warning and retains all historical revisions.'),source('pkg/controller/statefulset/stateful_set_control.go','173-216','History pruning keeps live revisions and returns without deletion for a negative limit; nonnegative limits remove excess non-live revisions.')]:[]),source('pkg/controller/statefulset/stateful_set_utils.go','88-120','StatefulSet start ordinal defaults to zero.')],{changeImpact:field==='replicas'?stateReplicaChange:field.startsWith('persistentVolumeClaimRetentionPolicy')?stateRetentionChange:field.startsWith('updateStrategy')?stateStrategyChange:field==='revisionHistoryLimit'?'Changing revisionHistoryLimit changes later pruning of non-live ControllerRevisions, not the template in existing Pods. The controller keeps current, update and Pod-referenced live revisions; a negative limit returns without deleting history, while zero can remove all non-live history. Lowering the limit can permanently remove old rollback revisions. Inspect retained revisions before a change and read controller errors after an uncertain request; increasing the limit cannot recover already deleted revisions.':['serviceName','podManagementPolicy'].includes(field)?'Changing this stored StatefulSet spec field is forbidden. Recreating a set changes its API identity; inspect existing ordinal Pods, PVCs and owners before any replacement.':stateChange});
for(const path of ['$.spec.selector','$.spec.selector.matchLabels','$.spec.selector.matchLabels[<exact-key>]'])add('StatefulSet',path,'Select this set’s Pods.','Missing selector is rejected; an omitted equality key adds no equality requirement.','The complete selector cannot be empty. A label equality value can be empty when its key is valid.','Invalid labels, empty selector or template mismatch reject creation. Selector changes are forbidden.',[av('174-218','StatefulSet requires valid nonempty selector matching template.'),av('238-268','Selector is outside mutable-field allowlist.')],{changeImpact:'Changing the StatefulSet selector is forbidden.'});
add('StatefulSet','$.spec.template','Define ordinal Pods.','The zero template lacks required containers and selector-matching labels.','Empty template fails these checks.','Pod template must match selector; restart must Always and activeDeadlineSeconds must be absent.',[av('58-79','StatefulSet checks selector/template labels, PodTemplate validation and annotations.'),av('193-223','StatefulSet validation copies the template, clears hostname/subdomain and substitutes template PVC volumes only for validation; the controller assigns identity later.')]);
add('StatefulSet','$.spec.template.spec','Set spec copied into ordinal Pods.','PodSpec defaults supply restart Always, DNS ClusterFirst, grace 30 and scheduler; containers remain required.','Empty still lacks containers.','Invalid PodSpec, non-Always restart or nonnil activeDeadlineSeconds rejects the set.',[source('pkg/apis/core/v1/defaults.go','211-232','PodSpec defaults selected omissions.'),av('217-219','StatefulSet rejects restart policies other than Always.'),av('218-223','StatefulSet forbids template activeDeadlineSeconds.')]);
add('StatefulSet','$.spec.template.spec.restartPolicy','Keep ordinal service Pods running.','Empty defaults to Always.','Empty defaults to Always.','Every policy other than Always is rejected.',[source('pkg/apis/core/v1/defaults.go','211-232','PodSpec restart default.'),av('217-219','StatefulSet rejects restart policies other than Always.')]);
for(const path of ['$.spec.volumeClaimTemplates','$.spec.volumeClaimTemplates[]']) {
 const item=path.endsWith('[]');
 add('StatefulSet',path,'Create one persistent claim per template and Pod ordinal.',
  item?'No element is supplied at this position. Other retained templates still define claims for their Pod ordinals.':'No template claims are generated.',
  item?'An empty item remains a zero PVC with an invalid spec: accessModes and a storage request are required.':'Empty list supplies no template claims.',
  'PVC template specs must validate; volumeClaimTemplates cannot be changed on an existing set.',
  [av('117-124','Creation validates each retained PVC spec.'),source('pkg/apis/core/validation/validation.go','2462-2497','A zero PVC spec lacks required accessModes and a positive storage request.'),av('238-268','PVC templates are immutable.'),source('pkg/controller/statefulset/stateful_set_utils.go','386-407','Each retained template is deep copied and named per ordinal.')],
  {nullValue:item?'Fresh typed null keeps an array element as a zero PVC struct. Its empty spec fails required accessModes and storage-request validation; null does not remove the element.':'Fresh typed null leaves the template list nil; no template claims are generated. This is not a patch deletion rule.',changeImpact:'The controller creates named claims for new ordinal Pods; Pod replacement reuses the names. A template edit is forbidden on update. Inspect retention and PV reclaim before deleting any claim.'});
}
for(const r of core.filter(r=>r.kind==='PersistentVolumeClaim'&&new Set(['$.spec','$.spec.accessModes','$.spec.accessModes[]','$.spec.resources','$.spec.resources.requests','$.spec.resources.requests[<exact-key>]','$.spec.storageClassName','$.spec.volumeMode']).has(r.fieldPath))){
 const path=r.fieldPath.replace('$.spec','$.spec.volumeClaimTemplates[].spec');
 const stage=r.fieldPath==='$.spec.storageClassName'
  ? 'The stored template does not pass ordinary PVC admission. On subsequent ordinal PVC creation, admission or the binding controller can choose a default StorageClass: '
  : 'StatefulSet typed defaulting already applies PVC and PVCSpec defaults to each present template, including Filesystem for a nil volumeMode, before validating that template spec: ';
 add('StatefulSet',path,r.purpose,stage+r.omitted,r.emptyValue,r.invalidValue,[...r.evidence,source('pkg/apis/apps/v1/zz_generated.defaults.go','1345-1352','The StatefulSet visitor invokes PVC, PVCSpec and ResourceList defaults for each present volume claim template.'),av('117-124','StatefulSet create validates each PVC spec; this is not ordinary PVC metadata admission.')],{nullValue:r.fieldPath==='$.spec.storageClassName'?stage+r.nullValue:r.nullValue,changeImpact:'This template field cannot be updated on a stored StatefulSet. The generated PVC is a distinct API object with its own admission, immutable/bound-claim checks, storage-class defaults and storage controller. Changing its request does not resize a volume through editing this template.',crossFieldConditions:[...(r.crossFieldConditions??[]),'Typed PVC defaults run on the stored template. Ordinary PVC admission, claim creation and binding occur later; selected cluster StorageClass, provisioner, permissions and volume state remain execution dependencies.']});
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
const commonOperationContext=(text,kind,fieldPath)=>text.startsWith('Operation applicability for ')?`Operation applicability for ${kind} ${fieldPath}: identify the actual producer, profile, client operation, options, annotations and stored ownership before evaluating a patch. Typed omission/null cases describe the resulting decoded object within its present parent; they are not outcomes for an authored patch. A missing parent does not instantiate this child. The pinned field and parent constraints determine collection merge behavior, validation and defaults.`:neutral(text);
for(const kind of ['Job','CronJob','StatefulSet']){
 const prefix=kind==='CronJob'?'$.spec.jobTemplate.spec.template':'$.spec.template';
 for(const r of podChildren){
  if(!selectedPodChildPaths.has(r.fieldPath)||!r.fieldPath.startsWith('$.spec.template.spec.')||['$.spec.template.spec.restartPolicy','$.spec.template.spec.activeDeadlineSeconds'].includes(r.fieldPath))continue;
  const ev=r.evidence.filter(e=>!contextual.test(`${e.url} ${e.claim}`));
  if(!ev.length)continue;
  const fieldPath=r.fieldPath.replace('$.spec.template',prefix);
  add(kind,fieldPath,neutral(r.purpose),neutral(r.omitted),neutral(r.emptyValue),neutral(r.invalidValue),ev,{nullValue:neutral(r.nullValue),crossFieldConditions:(r.crossFieldConditions??[]).filter(t=>!contextual.test(t)).map(t=>commonOperationContext(t,kind,fieldPath)),qualificationLimits:['These common child facts use the named Pod validator/default/runtime consumers. The actual kind supplies its parent restrictions, update strategy and request ownership. The actual workload parent rows govern construction and permitted updates.','The Pod API create after controller construction and admission is a separate defaulting/validation boundary.']});
 }
 for(const path of [prefix+'.metadata',prefix+'.metadata.labels',prefix+'.metadata.labels[<exact-key>]',prefix+'.metadata.annotations',prefix+'.metadata.annotations[<exact-key>]'])add(kind,path,'Attach metadata copied to newly constructed Pods.',kind==='CronJob'?'Absent labels/annotations contribute no entries. CronJob template validation forbids a supplied selector; the separate child Job later receives generated controller labels and a selector.':'Absent labels/annotations contribute no entries; selector matching still applies.','Empty maps contribute no entries; empty label value is legal with a valid key.',kind==='CronJob'?'Pod-template label/annotation validation applies. CronJob intake rejects a nonnil selector or manualSelector true; it does not run the ordinary Job selector/template matching check. Separate child Job creation has its own generated-label and selector validation.':'Pod-template label/annotation validation applies; selector mismatch rejects the workload.',[source('pkg/apis/core/validation/validation.go','7066-7080','PodTemplate validates labels and annotations, not all ordinary ObjectMeta fields.'),...(kind==='CronJob'?[bv('889-900','CronJob template validation calls validateJobSpec, forbids a supplied selector and true manualSelector; it does not call ordinary ValidateJobSpec.'),bv('170-188','Ordinary Job validation separately requires a selector and matching Pod-template labels.'),source('pkg/registry/batch/job/strategy.go','221-282','Separate child Job preparation generates controller labels and a selector when manualSelector is false.')]:[]),source('pkg/controller/controller_utils.go','562-599','GetPodFromTemplate copies template labels, annotations, finalizers and Pod spec.'),...(kind==='StatefulSet'?[source('pkg/controller/statefulset/stateful_set_utils.go','435-458','StatefulSet assigns Pod ordinal identity and service subdomain.')]:[source('pkg/controller/job/job_controller.go','1770-1810','Job controller passes its selected Pod template to CreatePodsWithGenerateName.')])]);
}
for(const path of ['$.spec.volumeClaimTemplates[].metadata','$.spec.volumeClaimTemplates[].metadata.name','$.spec.volumeClaimTemplates[].metadata.annotations','$.spec.volumeClaimTemplates[].metadata.annotations[<exact-key>]'])add('StatefulSet',path,'Supply metadata for a generated ordinal PVC.','No selected name/annotation is supplied by this boundary.','Empty claim template name cannot establish the intended volume/claim identity.','Template spec validation is separate from later ordinary PVC metadata validation; generated PVC create can reject metadata.',[av('117-124','StatefulSet validates PVC template specs.'),source('pkg/controller/statefulset/stateful_set_utils.go','386-407','PVC deep copy preserves template metadata, assigns claim name/namespace and selector labels.')],{changeImpact:'PVC template metadata is within immutable volumeClaimTemplates. Generated claims have their own API identity; annotations copied to them are not a Helm/Argo operation on the StatefulSet.'});
for(const kind of ['Job','CronJob'])add(kind,kind==='Job'?'$.spec.podReplacementPolicy':'$.spec.jobTemplate.spec.podReplacementPolicy','Set when replacement Job Pods may be created.','With JobPodReplacementPolicy enabled, child Job defaulting selects TerminatingOrFailed without podFailurePolicy and Failed with it. CronJob nested defaulting does not run SetDefaults_Job.','An explicit empty policy is unsupported.','Only Failed/TerminatingOrFailed are accepted; podFailurePolicy requires Failed.',[bd('60-69','Job replacement default depends on podFailurePolicy and the gate.'),bv('229-274','Job validates replacement policy and related conditions.')]);


// Actual constructor/transform/external-output expansion. Only the selected paths
// below are appended; this is not a generic Kubernetes subtree provider.
const expandedPaths = {
  "StatefulSet": [
    "$.spec.template.metadata.name",
    "$.spec.template.spec.affinity.podAffinity",
    "$.spec.template.spec.affinity.podAntiAffinity",
    "$.spec.template.spec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution",
    "$.spec.template.spec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[]",
    "$.spec.template.spec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm",
    "$.spec.template.spec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector",
    "$.spec.template.spec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector.matchLabels",
    "$.spec.template.spec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector.matchLabels[<exact-key>]",
    "$.spec.template.spec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.topologyKey",
    "$.spec.template.spec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].weight",
    "$.spec.template.spec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution",
    "$.spec.template.spec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[]",
    "$.spec.template.spec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector",
    "$.spec.template.spec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector.matchLabels",
    "$.spec.template.spec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector.matchLabels[<exact-key>]",
    "$.spec.template.spec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[].topologyKey",
    "$.spec.template.spec.containers[].env[].valueFrom.configMapKeyRef",
    "$.spec.template.spec.containers[].env[].valueFrom.configMapKeyRef.key",
    "$.spec.template.spec.containers[].env[].valueFrom.configMapKeyRef.name",
    "$.spec.template.spec.containers[].env[].valueFrom.configMapKeyRef.optional",
    "$.spec.template.spec.containers[].env[].valueFrom.fieldRef",
    "$.spec.template.spec.containers[].env[].valueFrom.fieldRef.fieldPath",
    "$.spec.template.spec.containers[].livenessProbe.httpGet",
    "$.spec.template.spec.containers[].livenessProbe.httpGet.path",
    "$.spec.template.spec.containers[].livenessProbe.httpGet.port",
    "$.spec.template.spec.containers[].ports",
    "$.spec.template.spec.containers[].ports[]",
    "$.spec.template.spec.containers[].ports[].containerPort",
    "$.spec.template.spec.containers[].ports[].name",
    "$.spec.template.spec.containers[].ports[].protocol",
    "$.spec.template.spec.containers[].readinessProbe.httpGet",
    "$.spec.template.spec.containers[].readinessProbe.httpGet.path",
    "$.spec.template.spec.containers[].readinessProbe.httpGet.port",
    "$.spec.template.spec.containers[].securityContext.privileged",
    "$.spec.template.spec.containers[].securityContext.seLinuxOptions",
    "$.spec.template.spec.containers[].workingDir",
    "$.spec.template.spec.enableServiceLinks",
    "$.spec.template.spec.hostIPC",
    "$.spec.template.spec.hostNetwork",
    "$.spec.template.spec.nodeSelector",
    "$.spec.template.spec.nodeSelector[<exact-key>]",
    "$.spec.template.spec.priorityClassName",
    "$.spec.template.spec.securityContext.supplementalGroups",
    "$.spec.template.spec.securityContext.sysctls",
    "$.spec.template.spec.shareProcessNamespace",
    "$.spec.template.spec.volumes[].configMap.items",
    "$.spec.template.spec.volumes[].configMap.items[]",
    "$.spec.template.spec.volumes[].configMap.items[].key",
    "$.spec.template.spec.volumes[].configMap.items[].path",
    "$.spec.template.spec.volumes[].configMap.optional",
    "$.spec.template.spec.volumes[].emptyDir.medium",
    "$.spec.template.spec.volumes[].secret.items",
    "$.spec.template.spec.volumes[].secret.items[]",
    "$.spec.template.spec.volumes[].secret.items[].key",
    "$.spec.template.spec.volumes[].secret.items[].path",
    "$.spec.template.spec.volumes[].secret.optional",
    "$.spec.updateStrategy.rollingUpdate.maxUnavailable",
    "$.spec.volumeClaimTemplates[].apiVersion",
    "$.spec.volumeClaimTemplates[].kind",
    "$.spec.volumeClaimTemplates[].metadata.labels",
    "$.spec.volumeClaimTemplates[].metadata.labels[<exact-key>]"
  ],
  "PodDisruptionBudget": [
    "$.spec.maxUnavailable"
  ],
  "Job": [
    "$.spec.template.metadata.name",
    "$.spec.template.spec.affinity.podAntiAffinity",
    "$.spec.template.spec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution",
    "$.spec.template.spec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[]",
    "$.spec.template.spec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm",
    "$.spec.template.spec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector",
    "$.spec.template.spec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector.matchLabels",
    "$.spec.template.spec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector.matchLabels[<exact-key>]",
    "$.spec.template.spec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.topologyKey",
    "$.spec.template.spec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].weight",
    "$.spec.template.spec.containers[].env[].valueFrom.configMapKeyRef",
    "$.spec.template.spec.containers[].env[].valueFrom.configMapKeyRef.key",
    "$.spec.template.spec.containers[].env[].valueFrom.configMapKeyRef.name",
    "$.spec.template.spec.containers[].livenessProbe.httpGet",
    "$.spec.template.spec.containers[].livenessProbe.httpGet.path",
    "$.spec.template.spec.containers[].livenessProbe.httpGet.port",
    "$.spec.template.spec.containers[].ports",
    "$.spec.template.spec.containers[].ports[]",
    "$.spec.template.spec.containers[].ports[].containerPort",
    "$.spec.template.spec.containers[].readinessProbe.httpGet",
    "$.spec.template.spec.containers[].readinessProbe.httpGet.path",
    "$.spec.template.spec.containers[].readinessProbe.httpGet.port",
    "$.spec.template.spec.initContainers[].args",
    "$.spec.template.spec.initContainers[].args[]",
    "$.spec.template.spec.initContainers[].restartPolicy",
    "$.spec.template.spec.initContainers[].securityContext.runAsGroup",
    "$.spec.template.spec.initContainers[].securityContext.runAsNonRoot",
    "$.spec.template.spec.initContainers[].securityContext.runAsUser",
    "$.spec.template.spec.initContainers[].volumeMounts[].readOnly",
    "$.spec.template.spec.nodeSelector",
    "$.spec.template.spec.nodeSelector[<exact-key>]",
    "$.spec.template.spec.volumes[].csi",
    "$.spec.template.spec.volumes[].csi.driver",
    "$.spec.template.spec.volumes[].csi.readOnly",
    "$.spec.ttlSecondsAfterFinished"
  ],
  "Pod": [
    "$.spec",
    "$.spec.automountServiceAccountToken",
    "$.spec.containers",
    "$.spec.containers[]",
    "$.spec.containers[].args",
    "$.spec.containers[].args[]",
    "$.spec.containers[].command",
    "$.spec.containers[].command[]",
    "$.spec.containers[].env",
    "$.spec.containers[].env[]",
    "$.spec.containers[].env[].name",
    "$.spec.containers[].env[].value",
    "$.spec.containers[].image",
    "$.spec.containers[].imagePullPolicy",
    "$.spec.containers[].name",
    "$.spec.containers[].readinessProbe",
    "$.spec.containers[].readinessProbe.exec",
    "$.spec.containers[].readinessProbe.exec.command",
    "$.spec.containers[].readinessProbe.exec.command[]",
    "$.spec.containers[].readinessProbe.failureThreshold",
    "$.spec.containers[].readinessProbe.initialDelaySeconds",
    "$.spec.containers[].readinessProbe.periodSeconds",
    "$.spec.containers[].readinessProbe.successThreshold",
    "$.spec.containers[].readinessProbe.timeoutSeconds",
    "$.spec.containers[].securityContext",
    "$.spec.containers[].securityContext.allowPrivilegeEscalation",
    "$.spec.containers[].securityContext.appArmorProfile",
    "$.spec.containers[].securityContext.appArmorProfile.type",
    "$.spec.containers[].securityContext.capabilities",
    "$.spec.containers[].securityContext.capabilities.add",
    "$.spec.containers[].securityContext.capabilities.add[]",
    "$.spec.containers[].securityContext.capabilities.drop",
    "$.spec.containers[].securityContext.capabilities.drop[]",
    "$.spec.containers[].securityContext.privileged",
    "$.spec.containers[].volumeMounts",
    "$.spec.containers[].volumeMounts[]",
    "$.spec.containers[].volumeMounts[].mountPath",
    "$.spec.containers[].volumeMounts[].name",
    "$.spec.dnsPolicy",
    "$.spec.imagePullSecrets",
    "$.spec.imagePullSecrets[]",
    "$.spec.imagePullSecrets[].name",
    "$.spec.restartPolicy",
    "$.spec.schedulerName",
    "$.spec.securityContext",
    "$.spec.securityContext.fsGroup",
    "$.spec.securityContext.runAsGroup",
    "$.spec.securityContext.runAsNonRoot",
    "$.spec.securityContext.runAsUser",
    "$.spec.securityContext.seccompProfile",
    "$.spec.securityContext.seccompProfile.type",
    "$.spec.terminationGracePeriodSeconds",
    "$.spec.volumes",
    "$.spec.volumes[]",
    "$.spec.volumes[].emptyDir",
    "$.spec.volumes[].name"
  ]
};
const workloadVersions={Job:'batch/v1',CronJob:'batch/v1',StatefulSet:'apps/v1',PodDisruptionBudget:'policy/v1',Pod:'v1'};
export const delegatedRootContracts=Object.freeze({TypeMeta:'docs-kubernetes-envelope-receiver-contracts.mjs',ObjectMeta:'docs-kubernetes-metadata-receiver-contracts.mjs'});
const isDelegated=path=>/^\$\.(?:metadata(?:\.|\[|$)|apiVersion$|kind$)/.test(path);
const pathMatches=(pattern,exact)=>{
 const expected=yamlFieldPathTokens(pattern.replaceAll('[<exact-key>]','["*"]'));
 const actual=yamlFieldPathTokens(exact.replaceAll('[<exact-key>]','["*"]'));
 return expected.length===actual.length&&expected.every((token,index)=>token==='*'?typeof actual[index]==='string'&&actual[index]!=='[]':token==='[]'?typeof actual[index]==='number'||actual[index]==='[]':token===actual[index]);
};
const normalized=path=>path.replace(/\[(?:"(?:[^"\\]|\\.)*"|'[^']*'|\*)\]/g,'[<exact-key>]').replace(/\[\d+\]/g,'[]');
const podChange='The selected buildkit preflight Pod uses kubectl apply. A stored Pod is subject to normal Pod update validation: selected container image changes can be accepted, but command, environment, probes, volumes and security changes cannot be made by treating it as a mutable workload template. Read the stored UID/spec and events after an uncertain write. Diagnose admission, placement, image or node failure before deleting/recreating this disposable preflight Pod; recreation repeats its command. API acceptance or readiness of this probe does not prove a later production build.';
const recovery=kind=>kind==='Pod'?podChange:kind==='Job'?'Read the Job UID, conditions, active Pods and logs after an uncertain request. Distinguish API rejection from failed child Pod creation, scheduling, image, mount and command failure. Retain result/log evidence before cleanup. Recreating a Job can repeat migration, garbage collection or other external effects; verify previous completion and ownership first.':'Read StatefulSet UID, generation/observedGeneration, ordinal Pods, events and actual claims after an uncertain write. Correct the specific admission, placement, image, mount or application dependency before observing reconciliation. Retain ordinal claim identity and inspect retention/reclaim policy before removing storage.';
const expansionRoute=kind=>kind==='Pod'?[
 source('pkg/apis/core/v1/zz_generated.defaults.go','207-218','A root Pod runs SetDefaults_Pod then SetDefaults_PodSpec and child visitors.'),
 source('pkg/apis/core/v1/defaults.go','165-232','Pod-create-only resource requests, service links and host-network defaults differ from stored PodTemplate defaults.'),
 source('pkg/registry/core/pod/strategy.go','86-118','Actual Pod create initializes Pending/QOS status, drops disabled fields, applies selector/AppArmor preparation and validates with ResourceIsPod true.'),
 source('pkg/registry/core/pod/strategy.go','103-109','Normal Pod update preserves stored status before Pod-specific validation.'),
 source('pkg/apis/core/validation/validation.go','5695-5840','Normal Pod spec updates have a narrow allowlist; they are not workload template replacement.')
]:kind==='Job'?[
 jobTraversal,
 source('pkg/registry/batch/job/strategy.go','94-205','Actual Job prepare generates selector, clears/preserves status and drops disabled template fields; old Job state determines exact mutable scheduling/resource allowances.'),
 bv('276-291','Actual Job template requires Never/OnFailure; podFailurePolicy requires Never.'),
 source('pkg/controller/job/job_controller.go','1789-1818','Job passes the prepared template to CreatePodsWithGenerateName and records failed child creations.'),
 source('pkg/controller/controller_utils.go','562-599','A child Pod deep-copies template spec but copies selected metadata and receives a generated name; Pod create errors are reported.')
]:[
 source('pkg/apis/apps/v1/zz_generated.defaults.go','1027-1038','The StatefulSet visitor begins with StatefulSet and embedded PodSpec defaults, then defaults present volumes and their HostPath/Secret sources.'),
 source('pkg/registry/apps/statefulset/strategy.go','72-134','Actual StatefulSet preparation drops disabled template fields, clears/preserves status and increments generation on spec change.'),
 av('174-268','Actual StatefulSet template must match selector, requires Always/no activeDeadlineSeconds and uses the StatefulSet mutable-field allowlist.'),
 source('pkg/controller/statefulset/stateful_set_utils.go','389-452','StatefulSet supplies ordinal Pod identity, hostname/subdomain and generated PVC volumes, and merges selector labels into ordinal claims.'),
 source('pkg/controller/statefulset/stateful_set_utils.go','517-539','Actual StatefulSet constructor calls GetPodFromTemplate, installs ordinal identity/storage and selects current or updated template revision by partition.')
];
function appendExpanded(kind,fieldPath,facts) {
 const changeImpact=facts.changeImpact??(kind==='Pod'?podChange:effect(kind));
 const record={kind,fieldPath,purpose:facts.purpose,receiver:`Kubernetes ${kind} typed API and the named child/runtime consumer`,
 operationScope:kind==='Pod'?'The actual cmd_buildkit_preflight shell heredoc is submitted by kubectl apply -f -. Apply request construction and stored-object ownership precede the typed Pod create/update boundary. This root Pod is not a stored controller template.':kind==='Job'?'Actual Job chart renders, deployment shell heredocs, API-probe and registry-local renderers select these fields. The selected shell/transform procedures use kubectl apply; chart writes use their selected Helm/Argo request route. Offline construction is not an executed write. These typed create/update outcomes follow request merge/ownership, admission and old Job state.':'Actual local, infrastructure and authenticated external Helm outputs select these fields. Their Helm/Argo client request construction and ownership precede the actual typed create/update and kind-specific preparation. Offline chart rendering is not an executed write; configured admission, gates and old object state remain inputs.',
 omitted:facts.omitted,nullValue:facts.nullValue,emptyValue:facts.emptyValue,invalidValue:facts.invalidValue,changeImpact,
 crossFieldConditions:[...(facts.crossFieldConditions??[]),'The immediate parent/item must exist; omission does not create every descendant. API acceptance is separate from the admission, scheduler, kubelet, driver and application consumer observations.'],
 cases:[{name:'omitted-at-create',condition:'Selected field is absent in a present immediate typed parent/item.',sourceOutcome:facts.omitted},{name:'explicit-null',condition:'Fresh JSON null reaches the present parent before defaulting.',sourceOutcome:facts.nullValue},{name:'explicit-empty-or-zero',condition:'The stated empty or zero value is supplied.',sourceOutcome:facts.emptyValue},{name:'invalid-value-or-combination',condition:'The stated invalid condition survives strategy preparation and reaches validation.',sourceOutcome:facts.invalidValue},{name:'update-and-recovery',condition:'An accepted update or an uncertain request is observed.',sourceOutcome:kind==='Pod'?podChange:changeImpact+' '+recovery(kind)},...(facts.consumerCases??[])],
 evidence:[...facts.evidence,...(kind==='PodDisruptionBudget'?parentEvidence(kind):expansionRoute(kind))],
 qualificationLimits:[...(facts.qualificationLimits??[]),'This bounded reuse preserves field-level default/validator/consumer claims under the actual kind-specific parent and preparation route. Root TypeMeta/ObjectMeta delegate to their common modules; an omitted delegation is a coverage gap. No live request, semantic acceptance, reader exercise or quality review is established.'],authoritySelector:{apiVersion:workloadVersions[kind],kind,fieldPath}};
 const key=`${kind}:${fieldPath}`;if(records.has(key))throw Error(`duplicate ${key}`);records.set(key,record);
}
// Do not copy Deployment ownership/rollout/parent cases into a different kind.
const deploymentContext=/Deployment|ReplicaSet|deployment\/|structured-merge|strategicpatch|merge\/update|fieldmanager|kubectl|gitops-engine|Whole|whole.*coverage|complete.*1389|Operation applicability|registry-local|LiteLLM|registry-mirror|GitOps|Argo|SSA|CSA|managedfields|endpoints\/handlers\/patch/;
const qualifyText=(text,kind)=>{
 const result=text.replaceAll('Deployment template',kind==='Pod'?'Pod request':`${kind} Pod template`).replaceAll('Deployment',kind==='Pod'?'Pod request':`${kind} Pod template`);
 return kind==='Pod'?result.replaceAll('template validation','Pod validation').replaceAll('Container template validation','Container Pod validation').replaceAll('reject the template','reject the Pod').replaceAll('accepted template','accepted Pod'):result;
};
function qualifiedChild(kind,path) {
 const origin=kind==='Pod'?path.replace('$.spec','$.spec.template.spec'):path;
 const r=podChildren.find(r=>normalized(r.fieldPath)===normalized(origin));
 if(!r)throw Error(`EXPANDED_WORKLOAD_UNAUTHORED_CHILD: ${kind} ${path}`);
 const evidence=r.evidence.flatMap(e=>{
  if(e.url.includes('/pkg/apis/apps/v1/zz_generated.defaults.go')){
   const range=e.url.match(/#L(\d+)-L(\d+)$/);
   if(range&&Number(range[1])>=375&&Number(range[2])<=691){
    const offset=kind==='StatefulSet'?654:kind==='Job'?14:-166;
    const file=kind==='Job'?'pkg/apis/batch/v1/zz_generated.defaults.go':kind==='Pod'?'pkg/apis/core/v1/zz_generated.defaults.go':'pkg/apis/apps/v1/zz_generated.defaults.go';
    return [source(file,`${Number(range[1])+offset}-${Number(range[2])+offset}`,qualifyText(e.claim,kind))];
   }
   return [];
  }
  return deploymentContext.test(`${e.url} ${e.claim}`)||e.url.includes('/pkg/apis/apps/')?[]:[e];
 });
 if(!evidence.length)throw Error(`EXPANDED_WORKLOAD_SOURCE_GAP: ${kind} ${path}`);
 return {purpose:qualifyText(r.purpose,kind),omitted:qualifyText(r.omitted,kind),nullValue:qualifyText(r.nullValue,kind),emptyValue:qualifyText(r.emptyValue,kind),invalidValue:qualifyText(r.invalidValue,kind),
 crossFieldConditions:r.crossFieldConditions.filter(t=>!deploymentContext.test(t)).map(t=>qualifyText(t,kind)),
 consumerCases:r.cases.slice(4).filter(c=>!deploymentContext.test(JSON.stringify(c))).map(c=>structuredClone(c)),evidence,
 qualificationLimits:r.qualificationLimits.filter(t=>!deploymentContext.test(t)).map(t=>qualifyText(t,kind))};
}
for(const [kind,paths] of Object.entries(expandedPaths))for(const path of paths){
 if(!path.startsWith(kind==='Pod'?'$.spec.':'$.spec.template.spec.'))continue;
 const facts=qualifiedChild(kind,path);
 // SetDefaults_PodSpec supplies this empty context in a root Pod as well.
 if(kind==='Pod'&&path==='$.spec.automountServiceAccountToken'){
  facts.omitted='The pointer remains nil through typed Pod defaulting. With ServiceAccount admission enabled, a nonnil Pod choice wins, then the ServiceAccount choice, then true; the selected explicit false disables its token automount.';
  facts.evidence.push(source('plugin/pkg/admission/serviceaccount/admission.go','254-265','Automount precedence is Pod pointer, ServiceAccount pointer, then true.'));
 }
 if(kind==='Pod'&&path==='$.spec.containers[].readinessProbe.successThreshold'){
  facts.evidence.push(source('pkg/apis/core/v1/zz_generated.defaults.go','409-410','The root Pod visitor calls SetDefaults_Probe only for a present regular-container readinessProbe.'));
 }
 if(kind==='Pod'&&path==='$.spec.containers[].image'){
  facts.invalidValue='An empty image or leading/trailing whitespace is rejected by actual Pod validation. API acceptance still does not prove registry access, pull credentials, image content or executable availability.';
  facts.evidence.push(source('pkg/apis/core/validation/validation.go','4430-4441','validateContainerOnlyForPod rejects leading/trailing image whitespace.'),source('pkg/apis/core/validation/validation.go','4499-4526','Root Pod metadata/spec validation invokes the Pod-only container validator.'));
 }
 if(kind==='Pod'&&path==='$.spec.securityContext'){
  facts.omitted='Nil is replaced by an empty PodSecurityContext by SetDefaults_PodSpec. No user/group/fsGroup/seccomp choice is invented by that empty object.';
  facts.nullValue='Fresh null leaves the pointer nil; SetDefaults_PodSpec creates an empty PodSecurityContext.';
 }
 appendExpanded(kind,path,facts);
}
for(const kind of ['Job','StatefulSet'])appendExpanded(kind,'$.spec.template.metadata.name',{
 purpose:'Distinguish the stored template name from the generated child Pod identity.',
 omitted:'No template name is supplied; the actual controller supplies child Pod identity.',
 nullValue:'Fresh null leaves this ordinary string empty. It does not clear a stored child Pod name through patch semantics.',
 emptyValue:'An empty template name is not an ordinary Pod create identity error at this stored-template boundary.',
 invalidValue:'ValidatePodTemplateSpec validates template labels, annotations and spec without ordinary ObjectMeta name validation. The controller does not copy this template name as the child Pod name; later child Pod create validates its generated identity.',
 evidence:[source('pkg/apis/core/validation/validation.go','7066-7080','PodTemplate validation does not call ordinary ObjectMeta name validation.'),source('pkg/controller/controller_utils.go','562-584','GetPodFromTemplate supplies GenerateName from parent rather than template metadata.name.'),...(kind==='StatefulSet'?[source('pkg/controller/statefulset/stateful_set_utils.go','435-452','StatefulSet overwrites child name with the ordinal identity.')]:[])]
});
appendExpanded('StatefulSet','$.spec.updateStrategy.rollingUpdate.maxUnavailable',{
 purpose:'Bound unavailable ordinal Pods during the selected rolling update.',
 omitted:'Within a present RollingUpdate object, nil defaults to 1 when MaxUnavailableStatefulSet is enabled. A disabled gate drops a fresh value unless the old StatefulSet already uses it.',
 nullValue:'Fresh null leaves the IntOrString pointer nil and follows the gate-selected default/drop route.',
 emptyValue:'Integer zero and a zero percentage are rejected if the field survives preparation; an empty string is not a valid percentage.',
 invalidValue:'The retained budget must be a positive integer or positive percentage at most 100%; OnDelete forbids the rollingUpdate object.',
 evidence:[ad('114-124','MaxUnavailable defaults to integer 1 only with the gate and a present RollingUpdate object.'),source('pkg/registry/apps/statefulset/strategy.go','83-125','Disabled gate drops maxUnavailable unless old object already uses it.'),av('499-516','StatefulSet rolling budget validates positive IntOrString and at most 100%.'),source('pkg/controller/statefulset/stateful_set_utils.go','682-698','Controller converts percentage budgets with round-down and a minimum of one.'),source('pkg/controller/statefulset/stateful_set_control.go','704-717','OnDelete returns before the controller gate selects the budget update path.'),source('pkg/controller/statefulset/stateful_set_control.go','762-818','Budget update counts unavailable Pods, waits at the limit and deletes eligible old-revision Pods within the remaining budget.')],
 crossFieldConditions:['This StatefulSet budget does not use Deployment maxSurge semantics. Inspect both API-server and controller feature-gate settings; they are separate execution inputs. With the controller gate enabled and RollingUpdate selected, a percentage is rounded down and clamped to at least one. The controller counts unavailable Pods, waits when the budget is exhausted and otherwise deletes eligible old-revision Pods from highest ordinal within the remaining budget and partition. Conversion or deletion errors stop that reconciliation; inspect its events and correct the specific dependency.']
});
for(const path of ['$.spec.volumeClaimTemplates[].apiVersion','$.spec.volumeClaimTemplates[].kind'])appendExpanded('StatefulSet',path,{
 purpose:'Carry selected PVC template type metadata without treating the template as an independent PVC request.',
 omitted:'No nested TypeMeta value is supplied; the StatefulSet validator checks the template PVC spec and the controller later constructs typed ordinal PVCs.',
 nullValue:'Fresh null leaves the ordinary TypeMeta string empty; this is not a separate PVC API endpoint selection.',
 emptyValue:'The StatefulSet nested template validator does not independently require these TypeMeta strings.',
 invalidValue:'These strings do not change the StatefulSet endpoint or the typed PVC spec. ValidateStatefulSetSpec validates PVC template specs, not a new nested API request; child PVC encoding/admission is a later boundary.',
 evidence:[av('117-124','StatefulSet create validates each PVC template spec.'),source('pkg/controller/statefulset/stateful_set_utils.go','389-405','Controller deep-copies typed PVC templates and assigns ordinal name/namespace/selector labels.')],
 changeImpact:'volumeClaimTemplates is immutable on a stored StatefulSet. This nested TypeMeta value does not change an existing claim API identity.'
});
for(const path of ['$.spec.volumeClaimTemplates[].metadata.labels','$.spec.volumeClaimTemplates[].metadata.labels[<exact-key>]'])appendExpanded('StatefulSet',path,{
 purpose:'Copy template labels to ordinal claims and merge the StatefulSet selector equality labels.',
 omitted:'With nil template labels, the generated claim receives selector matchLabels; an omitted key contributes no template label.',
 nullValue:'Fresh null leaves the map nil or an ordinary string map value empty. The controller then merges selector labels; null is not a child PVC patch deletion rule.',
 emptyValue:'An empty map gets selector entries during claim construction. An empty value can be legal under ordinary label validation with a valid key.',
 invalidValue:'StatefulSet create validates PVC specs rather than ordinary PVC ObjectMeta labels. Later generated PVC create can reject invalid label keys/values; selector keys overwrite same-name template label values before that child creation.',
 evidence:[av('117-124','PVC template validation checks spec only.'),source('pkg/controller/statefulset/stateful_set_utils.go','389-405','Ordinal claim construction preserves template metadata then merges selector labels, overwriting colliding keys.')],
 changeImpact:'Claim templates are immutable on the StatefulSet; editing this field cannot relabel an existing claim through a template update. Inspect the generated claim and owner before any separate PVC write.'
});
appendExpanded('Job','$.spec.ttlSecondsAfterFinished',{
 purpose:'Allow the TTL controller to remove finished disposable Jobs and dependent Pods.',
 omitted:'Nil supplies no TTL cleanup request.',nullValue:'Fresh null leaves the optional integer pointer nil; no TTL cleanup is selected.',
 emptyValue:'Explicit zero is retained and makes a finished Job eligible for cleanup without an added TTL delay; deletion remains asynchronous.',
 invalidValue:'Negative TTL is rejected by Job validation; wrong-type JSON fails typed decode.',
 evidence:[bv('206-208','Job TTL must be nonnegative.'),source('pkg/controller/ttlafterfinished/ttlafterfinished_controller.go','206-259','TTL controller rereads the latest finished Job before foreground deletion with its UID precondition.')],
 changeImpact:'Changing TTL changes the controller cleanup deadline for a finished Job; after deletion, lengthening TTL cannot recover its API object or logs. Retain result evidence before short TTL cleanup and read the object after an uncertain update.'
});
appendExpanded('PodDisruptionBudget','$.spec.maxUnavailable',{
 purpose:'Set the selected voluntary eviction unavailability budget.',
 omitted:'Nil supplies no maximum budget; minAvailable can supply the mutually exclusive minimum.',
 nullValue:'Fresh null leaves the IntOrString pointer nil. A separate apply/patch request determines deletion or retained ownership.',
 emptyValue:'Integer zero is retained and requests zero permitted unavailability; an empty string is not a valid percentage.',
 invalidValue:'Negative counts, invalid percentages, percentages above 100% or simultaneous minAvailable are rejected.',
 evidence:[source('pkg/apis/policy/validation/validation.go','50-75','PDB validates mutually exclusive min/max budgets, nonnegative counts and percentages at most 100%.'),source('pkg/controller/disruption/disruption.go','818-840','Disruption controller calculates desired healthy count from maxUnavailable and expected controller scale.')],
 crossFieldConditions:['Budget and Ready observations constrain the eviction API. This field does not prevent every deletion, rollout, node loss or application outage. Controller scale lookup is an execution dependency for a percentage budget.'],
 changeImpact:'An accepted budget update changes later eviction decisions after controller observation. Inspect PDB desiredHealthy/disruptionsAllowed and selected Pod readiness before retrying a denied eviction.'
});
appendExpanded('Pod','$.spec',{
 purpose:'Run the selected disposable rootless BuildKit prerequisite Pod before production build operations.',
 omitted:'Zero PodSpec gets common defaults but has no required containers. Root Pod defaulting also applies request-from-limit, service-link and hostNetwork port rules; it is distinct from a stored template.',
 nullValue:'Fresh null leaves the PodSpec struct at zero and follows root Pod defaulting; missing required containers are still rejected.',
 emptyValue:'An empty PodSpec cannot provide the selected BuildKit container and volumes; defaults do not make it a valid runnable preflight.',
 invalidValue:'ValidatePodCreate checks Pod metadata/spec and Pod-specific combinations with ResourceIsPod true. Configured admission can reject or mutate the Pod; failed scheduling, image, mount or command execution is a later consumer failure.',
 evidence:[source('pkg/apis/core/validation/validation.go','5600-5623','Root Pod create validates actual Pod metadata/spec and Pod-only field combinations.'),source('pkg/apis/core/v1/defaults.go','165-232','Root Pod and common PodSpec defaults are different functions.')],
 crossFieldConditions:['The selected shell preflight uses restartPolicy Never, automountServiceAccountToken false, explicit security settings, image pull identity and emptyDir storage. Its API, scheduling, container-ready and command evidence are separate observations.']
});
appendExpanded('Pod','$.spec.enableServiceLinks',{
 purpose:'Control service-derived environment variables for the root BuildKit preflight Pod.',
 omitted:'Root Pod defaulting changes nil to DefaultEnableServiceLinks (true). This differs from a stored template, which retains nil until child Pod creation.',
 nullValue:'Fresh null leaves the boolean pointer nil; root Pod defaulting supplies true.',
 emptyValue:'Explicit false is retained. Kubelet still includes default-namespace master Services independently of this flag; ordinary Services require the Pod namespace and this flag true.',
 invalidValue:'A non-boolean token fails typed decode. A valid boolean does not prove Service reachability or application connectivity.',
 evidence:[source('pkg/apis/core/v1/defaults.go','201-204','Root Pod defaulting supplies DefaultEnableServiceLinks for nil.'),source('pkg/kubelet/kubelet_pods.go','683-730','Kubelet builds environment entries from assigned ClusterIP Services with exact master-Service and same-namespace flag branches.')],
 crossFieldConditions:['A same-name enabled namespace Service replaces the default-namespace map entry. A nil Service lister supplies no Service variables; a list error fails environment construction. Explicit/imported container environment follows its separate precedence.']
});
appendExpanded('Pod','$.spec.serviceAccountName',{
 purpose:'Identify the namespace-local service account used by the root preflight Pod and its enabled admission checks.',
 omitted:'The typed string remains empty. When ServiceAccount admission is enabled, an empty Pod serviceAccountName becomes default before that account is looked up. Missing account lookup rejects admission even when token automount is false.',
 nullValue:'Fresh null leaves the ordinary string empty; enabled ServiceAccount admission follows the same default-account route.',
 emptyValue:'Empty follows the enabled admission default. A nonempty valid account name selects that namespace-local account; it does not create the account.',
 invalidValue:'Invalid service account name fails PodSpec validation. With ServiceAccount admission enabled, lookup or enforced Secret-reference checks can reject an otherwise valid name.',
 evidence:[source('pkg/apis/core/validation/validation.go','4663-4669','PodSpec validates service account names.'),source('plugin/pkg/admission/serviceaccount/admission.go','146-175','Enabled admission defaults the account, looks it up and conditionally adds token/pull-secret references.')],
 crossFieldConditions:['The selected buildkit preflight explicitly sets automountServiceAccountToken false. This disables token automount under the named plugin; it does not bypass service account lookup or every other admission plugin. Inspect actual admission configuration and stored Pod identity before inferring access.']
});
// The recovery renderer forwards policy.resources without a member allowlist.
// Qualify only its newly selected container-claim boundary, not unused Pod claims.
const cronClaimPrefix='$.spec.jobTemplate.spec.template.spec.containers[].resources.claims';
const cronClaimRoute=[
 {url:'https://github.com/datrab/kubeclaw/blob/07b6a051854233eb63f659b7e9a74f2c2e02741f/scripts/render-postgresql-recovery.mjs#L63-L84',claim:'Recovery CronJob copies policy.resources into its backup container and does not construct PodSpec.resourceClaims.'},
 {url:'https://github.com/datrab/kubeclaw/blob/07b6a051854233eb63f659b7e9a74f2c2e02741f/scripts/render-postgresql-recovery.mjs#L32-L36',claim:'validateStorage requires CPU/memory limits and requests without filtering additional resources members.'},
 cronTraversal,
 source('pkg/registry/batch/cronjob/strategy.go','87-115','CronJob create/update drops disabled template fields using the actual old template; create obtains template validation options.'),
 bv('888-900','CronJob JobTemplate validation calls JobSpec validation and forbids manual selectors.'),
 bv('276-291','JobSpec validation calls PodTemplate validation and restricts restart policy.'),
 source('pkg/apis/core/validation/validation.go','7066-7080','PodTemplate validation calls ValidatePodSpec.'),
 source('pkg/apis/core/validation/validation.go','4637-4643','PodSpec gathers declared claim names and passes them to regular-container validation.'),
 source('pkg/apis/core/validation/validation.go','3908-3913','Common container validation passes its resources and Pod claim names to the resource validator.'),
 source('pkg/apis/core/validation/validation.go','7821-7827','Container resource validation delegates to the common resource-requirements validator.'),
 source('pkg/apis/core/validation/validation.go','7886-7893','Resource-requirements validation calls claim-reference validation.'),
 source('pkg/apis/core/validation/validation.go','7898-7953','Container claim references require Pod claim membership, DNS-label request names and nonoverlapping unique name/request pairs.'),
 source('pkg/api/pod/util.go','1089-1128','A disabled DynamicResourceAllocation gate drops container claims and Pod claims unless the old PodSpec has resourceClaims.'),
 source('pkg/features/kube_features.go','1292-1298','Versioned DynamicResourceAllocation defaults are false at 1.26/1.32, true at 1.34 and locked true at 1.35.'),
 source('pkg/controller/cronjob/utils.go','243-273','CronJob controller deep-copies JobTemplate spec into a separately created child Job.'),
 source('pkg/apis/batch/v1/zz_generated.defaults.go','378-396','Child Job default traversal runs Job defaults and PodSpec defaults.'),
 source('pkg/registry/batch/job/strategy.go','94-129','Child Job create drops disabled template fields and generates its selector.'),
 source('pkg/controller/job/job_controller.go','1789-1818','Job controller requests generated-name child Pods and observes failed creation.'),
 source('pkg/controller/controller_utils.go','562-599','Child Pod construction deep-copies the template spec before the separate Pod create.'),
 source('staging/src/k8s.io/api/core/v1/types.go','2880-2893','Container ResourceClaim names refer to PodSpec entries; empty request selects everything, a named request selects its result.'),
 source('pkg/kubelet/cm/dra/manager.go','479-513','Kubelet resolves matching Pod claim references and uses prepared claim information to collect CDI device IDs; absent claim cache information is an error.'),
 source('pkg/kubelet/cm/dra/claiminfo.go','122-138','CDI selection accepts all devices for empty request and otherwise matches driver request names; driver devices with no request names remain included.')
];
const cronClaimConditions=[
 'The supported PostgreSQL recovery policy.resources object is copied to the backup container by scripts/render-postgresql-recovery.mjs:63-84 after validateStorage checks only required CPU/memory requests and limits at lines 32-36. The default policy omits claims; a configured claims value is forwarded without member filtering. This renderer does not emit PodSpec.resourceClaims, so every retained nonempty claim reference lacks the required Pod claim declaration and is rejected. Do not treat serialization as support for a runnable DRA backup.',
 'DynamicResourceAllocation preparation occurs before validation. With a disabled gate and no old Pod resourceClaims, references are removed. Versioned defaults do not prove the effective cluster gate configuration. With references retained, name identifies a PodSpec.resourceClaims entry, not a namespace ResourceClaim directly and not an RBAC grant. An all-requests entry cannot overlap a specific request for the same claim.',
 'request is a DNS label at this container reference boundary. A request/subrequest string with a slash fails this validator; resource-claim allocation subrequest alternatives do not expand this selected field contract.',
 'An absent resources object or list does not instantiate a claim item. API acceptance does not prove allocation, driver preparation, CDI availability or container execution. Inspect the stored CronJob, child Job/Pod events and actual effective references before retrying; correct the specific validation or consumer failure. A backup retry can repeat external effects.'
];
for(const suffix of ['', '[]', '[].name', '[].request']) {
 const fieldPath=cronClaimPrefix+suffix;
 const list=suffix==='';const item=suffix==='[]';const name=suffix==='[].name';
 const omitted=list?'No container claim references are supplied; no claim or request default is created.':item?'An absent item contributes no reference.':name?'Within a retained item, the name stays empty and is required by reference validation.':'Within a retained item, request stays empty and selects all results of the named claim; the name must still resolve.';
 const emptyValue=list?'An empty list supplies no container claim references.':item?'An empty object has an empty required name and is rejected if retained after gate preparation.':name?'An empty name is rejected if retained after gate preparation.':'An empty request is permitted and selects all results; it cannot overlap another reference to that claim.';
 const invalidValue='If retained after gate preparation, each item requires a nonempty name declared in PodSpec.resourceClaims, an optional DNS-label request and no duplicate or overlapping name/request selection. The recovery renderer supplies no Pod claim declarations, so a nonempty reference list is rejected. Wrong-type JSON fails typed decode.';
 add('CronJob',fieldPath,list?'Select container resource-claim references passed through the recovery policy.':item?'Supply one container reference to a declared Pod resource claim.':name?'Identify a declared Pod resource claim for this container.':'Limit the container reference to results from one named request.',omitted,emptyValue,invalidValue,cronClaimRoute,{
  nullValue:list?'Fresh null decodes the claims slice to nil and supplies no container references.':item?'A null list element becomes a zero ResourceClaim item; its empty required name is rejected if retained after gate preparation.':'Fresh null leaves this ordinary string empty. '+(name?'The retained item lacks its required name.':'Empty request selects all results of the named claim; it does not remove the item.'),
  operationScope:'The supported PostgreSQL recovery renderer forwards policy.resources to its batch/v1 CronJob backup container. These four selected fields describe that public-object forwarding and the actual CronJob to Job to Pod receive path. Rendering is offline evidence; actual request construction, admission, gate configuration and old object state are separate inputs.',
  crossFieldConditions:cronClaimConditions,
  qualificationLimits:['Only the four selected container claim fields are added. No Pod resource-claim declaration, upstream alternative, live allocation, semantic acceptance or global documentation acceptance is established.']
 });
}
// Actual producer replay selects these omitted Container defaults. Reuse only
// the equivalent child contract, and qualify its receiving parent independently.
const selectedDefaultChildren={
 StatefulSet:['containers[].terminationMessagePath','containers[].terminationMessagePolicy'],
 CronJob:['containers[].terminationMessagePath','containers[].terminationMessagePolicy'],
 Job:['containers[].ports[].protocol','containers[].terminationMessagePath','containers[].terminationMessagePolicy','initContainers[].terminationMessagePath','initContainers[].terminationMessagePolicy'],
 Pod:['containers[].terminationMessagePath','containers[].terminationMessagePolicy']
};
for(const [kind,children] of Object.entries(selectedDefaultChildren))for(const child of children){
 const prefix=kind==='Pod'?'$.spec':kind==='CronJob'?'$.spec.jobTemplate.spec.template.spec':'$.spec.template.spec';
 const fieldPath=`${prefix}.${child}`;
 const origin=`$.spec.template.spec.${child}`;
 const facts=qualifiedChild(kind==='CronJob'?'Job':kind,kind==='Pod'?fieldPath:origin);
 // The visitor offsets above do not apply to CronJob's deeper JobTemplate.
 if(kind==='CronJob'){
  facts.evidence=facts.evidence.filter(e=>!e.url.includes('/zz_generated.defaults.go'));
  facts.evidence.push(source('pkg/apis/batch/v1/zz_generated.defaults.go','216-223','CronJob visits each present regular Container and its ports in JobTemplate and defaults an empty port protocol to TCP.'),cronTraversal,
   bv('888-900','CronJob validates its JobTemplate through JobSpec validation and forbids manual selectors.'),
   source('pkg/controller/cronjob/utils.go','243-273','CronJob copies JobTemplate spec into separately created Jobs.'),
   jobTraversal,
   source('pkg/controller/controller_utils.go','562-599','Job child Pod construction copies the template before separate Pod creation.'));
 }
 const policy=child.endsWith('terminationMessagePolicy');
 if(child.includes('terminationMessage')){
  const value=policy?'File':'/dev/termination-log';
  const consumer=podChildren.find(r=>r.fieldPath===origin).cases.find(c=>c.name==='termination-message-file-log-and-total-limits');
  if(consumer)facts.consumerCases.push({...consumer,sourceOutcome:consumer.sourceOutcome.replace('Deployment templates forbid nonempty ephemeral containers; declared regular/init containers still count even when their message is empty.','Declared containers count even when their message is empty; the actual receiving kind validation still constrains which container members can be supplied.')});
  facts.omitted=`Within the present Container item, the empty string defaults to ${value}. No absent Container item is created.`;
  facts.nullValue=`Fresh typed JSON null leaves the ordinary string empty; Container defaulting selects ${value}. This is not a patch deletion rule.`;
  facts.emptyValue=`An explicit empty string defaults to ${value}; a nonempty string is retained before validation.`;
  facts.evidence.push(source('pkg/apis/core/v1/defaults.go','94-99','SetDefaults_Container defaults empty termination path and policy.'),
   source('staging/src/k8s.io/api/core/v1/types.go',policy?'2808-2810':'2896-2897',policy?'File is the termination message read-file policy.':'TerminationMessagePathDefault is /dev/termination-log.'));
 }
 if(kind!=='CronJob'){
  facts.evidence.push(...expansionRoute(kind));
  facts.evidence.push(source(kind==='Pod'?'pkg/apis/core/v1/zz_generated.defaults.go':kind==='Job'?'pkg/apis/batch/v1/zz_generated.defaults.go':'pkg/apis/apps/v1/zz_generated.defaults.go',kind==='Pod'?'372-380':kind==='Job'?(child.startsWith('init')?'478-485':'552-559'):'1192-1199',`${kind} generated visitor defaults the selected Container item and empty port protocol without inventing missing items.`));
 }
 // add() supplies the exact parent strategy and kind-specific change/recovery.
 add(kind,fieldPath,facts.purpose,facts.omitted,facts.emptyValue,facts.invalidValue,facts.evidence,{
  ...(kind==='Pod'?{operationScope:'The actual cmd_buildkit_preflight shell heredoc is submitted by kubectl apply -f -. Request construction and ownership precede typed Pod validation.'}:{}),
  nullValue:facts.nullValue,crossFieldConditions:[...facts.crossFieldConditions,'Only a present Container or ContainerPort item receives this default. Invalid nonempty values are validation inputs, not default predicates.'],
  changeImpact:(kind==='Pod'?podChange:effect(kind))+' '+(kind==='CronJob'?'Read stored CronJob, child Job/Pod events and logs after an uncertain write. Correct admission, placement, image, mount or command failures before retrying; backup retries can repeat external effects.':recovery(kind)),
  qualificationLimits:facts.qualificationLimits,
  cases:[{name:'omitted-at-create',condition:'Present immediate Container or ContainerPort item.',sourceOutcome:facts.omitted},{name:'explicit-null',condition:'Fresh typed JSON null before defaulting.',sourceOutcome:facts.nullValue},{name:'explicit-empty-or-zero',condition:'Explicit empty string before defaulting.',sourceOutcome:facts.emptyValue},{name:'invalid-value-or-combination',condition:'Nonempty value reaches typed validation.',sourceOutcome:facts.invalidValue},...facts.consumerCases,{name:'update-and-recovery',condition:'Stored update or uncertain request.',sourceOutcome:kind==='Pod'?podChange:effect(kind)}]
 });
}
export const receiverContracts=[...records.values()];
export function workloadReceiverContracts(apiVersion,kind,exactBoundaries) {
 if(workloadVersions[kind]!==apiVersion)return [];
 return exactBoundaries.filter(boundary=>!isDelegated(typeof boundary==='string'?boundary:boundary.fieldPath)).map(boundary=>{
  const fieldPath=typeof boundary==='string'?boundary:boundary.fieldPath;
  const record=receiverContracts.find(record=>record.kind===kind&&pathMatches(record.fieldPath,fieldPath));
  if(!record)throw Error(`EXPANDED_WORKLOAD_RECEIVER_GAP: ${apiVersion}/${kind}:${fieldPath}`);
  return {...record,fieldPath,authoritySelector:{apiVersion,kind,fieldPath}};
 });
}
