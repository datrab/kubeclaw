// Source-derived admission-policy status contracts. No API or controller run is reported.
const revision = '66452049f3d692768c39c797b21b793dce80314e';
const source = (path, start, end, claim) => ({
  url: `https://github.com/kubernetes/kubernetes/blob/${revision}/${path}#L${start}-L${end}`, claim,
});
const strategy = (start, end, claim) => source('pkg/registry/admissionregistration/validatingadmissionpolicy/strategy.go', start, end, claim);
const validate = (start, end, claim) => source('pkg/apis/admissionregistration/validation/validation.go', start, end, claim);
const metaValidate = (start, end, claim) => source('staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/validation/validation.go', start, end, claim);
const types = (start, end, claim) => source('staging/src/k8s.io/api/admissionregistration/v1/types.go', start, end, claim);
const metaTypes = (start, end, claim) => source('staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go', start, end, claim);
const controller = (start, end, claim) => source('pkg/controller/validatingadmissionpolicystatus/controller.go', start, end, claim);
const checker = (start, end, claim) => source('staging/src/k8s.io/apiserver/pkg/admission/plugin/policy/validating/typechecking.go', start, end, claim);
const applyEvidence = [
  source('cmd/kube-apiserver/app/config.go',79,84,'The Kubernetes server passes its generated OpenAPI definitions to control-plane generic configuration.'),
  source('pkg/controlplane/apiserver/config.go',175,181,'Control-plane configuration wraps the generated definitions for feature enablement and supplies them to its OpenAPI v3 configuration.'),
  source('staging/src/k8s.io/apiserver/pkg/server/config.go',523,530,'The OpenAPI v3 configuration stores the definition provider and builds its definitions with component schema references.'),
  source('staging/src/k8s.io/apiserver/pkg/util/openapi/enablement.go',34,53,'The provider wrapper returns generated definitions after restoring disabled enum features.'),
  source('staging/src/k8s.io/apiserver/pkg/util/openapi/enablement.go',56,82,'Disabled enum restoration removes enum descriptions and enum values, without changing list relationship extensions.'),
  source('pkg/generated/openapi/zz_generated.openapi.go',140,147,'The generated definition map includes the v1 TypeChecking, policy and policy status models.'),
  source('staging/src/k8s.io/apiserver/pkg/server/genericapiserver.go',1034,1064,'The generic server builds resource OpenAPI models and creates a type converter without preserving unknown fields; configuration and construction errors are returned.'),
  source('staging/src/k8s.io/apiserver/pkg/server/genericapiserver.go',791,804,'Resource installation assigns the supplied converter to the API group version before installing REST endpoints.'),
  source('staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal/typeconverter.go',45,71,'The converter constructs a typed parser from OpenAPI models, selects by group/version/kind and decodes structured or unstructured objects.'),
  source('vendor/k8s.io/kube-openapi/pkg/schemaconv/openapi.go',225,258,'List conversion uses declared relationship and map keys to construct the structured merge list schema.'),
  source('vendor/k8s.io/kube-openapi/pkg/schemaconv/smd.go',269,288,'Atomic list extensions become atomic merge lists; map lists become associative lists with their declared keys.'),
  source('pkg/registry/admissionregistration/validatingadmissionpolicy/storage/storage.go',75,80,'The status store selects the status update and reset-field strategies.'),
  source('pkg/registry/admissionregistration/validatingadmissionpolicy/storage/storage.go',107,119,'The status REST endpoint delegates reset-field discovery and updates to its store.'),
  strategy(173,188,'The v1 status reset set excludes spec and metadata from field ownership.'),
  source('staging/src/k8s.io/apiserver/pkg/endpoints/installer.go',702,725,'Endpoint installation turns reset fields into exclude filters and installs the default manager with the group converters, version and subresource.'),
  source('staging/src/k8s.io/apimachinery/pkg/util/managedfields/fieldmanager.go',34,43,'The public factory creates the structured merge manager with reset filters and wraps it in the default manager chain.'),
  source('staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal/structuredmerge.go',43,59,'The structured merge updater receives reset filters as its IgnoreFilter.'),
  source('staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal/versioncheck.go',46,51,'The outer manager rejects an apply object with a different full group/version/kind.'),
  source('staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal/lastappliedmanager.go',59,65,'Client-side apply migration only continues for the kubectl manager after delegation; other names return its result.'),
  source('staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal/lastappliedupdater.go',47,68,'The last-applied annotation is synchronized only for the kubectl manager when that annotation exists.'),
  source('staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal/skipnonapplied.go',75,92,'An empty managed set is initialized by an update under before-first-apply before the named apply is delegated.'),
  source('staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal/capmanagers.go',58,61,'The manager cap wrapper delegates Apply directly; its update-manager cap is not run here.'),
  source('staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal/managedfieldsupdater.go',69,81,'A changed apply sets the manager timestamp. An unchanged apply uses a deep copy of the live object and removes its old encoded managed fields before later encoding.'),
  source('staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal/stripmeta.go',35,53,'The metadata wrapper defines API identity and server metadata paths that are excluded from ownership.'),
  source('staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal/stripmeta.go',66,88,'After apply, the metadata wrapper removes its excluded paths from this manager set and deletes an empty set.'),
  source('staging/src/k8s.io/client-go/applyconfigurations/admissionregistration/v1/typechecking.go',26,47,'The warning slice has JSON omitempty; the builder starts empty and appends only supplied warning entries.'),
  source('staging/src/k8s.io/client-go/applyconfigurations/admissionregistration/v1/validatingadmissionpolicystatus.go',29,58,'The status apply builder uses pointers for observed generation and typeChecking; conditions are an omitempty slice.'),
  source('staging/src/k8s.io/client-go/util/apply/apply.go',34,49,'The default apply request uses JSON serialization and the YAML apply patch media type. Both named CBOR client gates select CBOR instead; marshal errors are returned.'),
  source('staging/src/k8s.io/client-go/gentype/type.go',322,348,'ApplyStatus constructs the apply request, selects the status subresource and passes patch options; request errors are returned.'),
  source('staging/src/k8s.io/apiserver/pkg/endpoints/handlers/patch.go',500,517,'The apply handler decodes the patch and passes the named field manager and force option to FieldManager.Apply.'),
  source('staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal/fieldmanager.go',57,74,'Default field management wraps the underlying manager, including manager identity and metadata handling, with the group version and subresource.'),
  source('staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal/fieldmanager.go',181,208,'Apply decodes stored managed fields, delegates to the manager chain, translates conflicts and encodes the resulting managed fields.'),
  source('staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal/buildmanagerinfo.go',54,74,'Apply prepares a manager entry with name, operation, version and subresource, then delegates identifier construction.'),
  source('staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal/managedfields.go',134,158,'Identifier construction removes fields, time and, for Apply, API version. Apply identity remains stable when its API version changes.'),
  source('staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal/structuredmerge.go',120,158,'Structured apply checks version and patch managedFields, converts live and patch objects to typed values and invokes the merge updater.'),
  source('staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal/structuredmerge.go',162,181,'A changed merged value is converted back, defaulted and converted to the internal version; conversion errors are returned.'),
  source('vendor/sigs.k8s.io/structured-merge-diff/v6/merge/update.go',209,249,'Apply computes the new field set, filters ignored fields, prunes against the previous set and checks changes with the force option.'),
  source('vendor/sigs.k8s.io/structured-merge-diff/v6/merge/update.go',252,279,'Pruning requires a previous owned set and conversion to its version; a missing version retains the merged object. Owned and dangling items are restored before conversion back.'),
  source('vendor/sigs.k8s.io/structured-merge-diff/v6/merge/update.go',282,308,'Pruning restores items claimed by another manager or the current new configuration, grouped by API version.'),
  source('vendor/sigs.k8s.io/structured-merge-diff/v6/merge/update.go',131,157,'Conflicts intersect another manager set with modified or added fields. Without force they fail; with force conflicting ownership is removed from the other manager.'),
];
const applyConditions = [
  'The status endpoint excludes spec and metadata from the apply ownership set. Its update strategy also restores the old spec and status lifecycle metadata. This status write is not a route to change policy settings.',
  'The controller manager name is validatingadmissionpolicy-status, so the kubectl-only client-side apply migration and last-applied annotation update do not run for it. If stored managed fields are empty, the wrapper first records the existing fields under before-first-apply. It can return an initialization error before apply.',
  'Server-side apply merges a declared configuration with the stored object and tracks a set of owned fields. The Apply manager identifier includes its name, Apply operation and status subresource. Identifier construction removes API version for Apply. The owned VersionedSet separately retains its API version for field conversion; the name alone does not identify the full manager entry.',
  'In the default JSON request route, an empty computed warning result leaves expressionWarnings nil in the apply builder. The omitempty tag omits that field; the request does not send expressionWarnings: []. The controller also omits conditions.',
  'At the typed merge boundary, an omitted field or item previously owned by this manager is a pruning candidate. Another current owner can retain it. A first apply without a previous owned set does not prune omitted stored items. Schema granularity, ignored fields, conversion and restored dangling items affect the result.',
  'Force true permits transfer of conflicting ownership for modified or added fields. It does not mean that all omitted warnings or conditions are deleted. Inspect the stored value and managed fields before a corrective write; repeated retries do not establish a different ownership result.',
];
const applyCases = [
  {name:'Empty computed warnings in the default JSON route',condition:'The controller computes no warnings; the two CBOR client gates do not both select CBOR.',sourceOutcome:'WithExpressionWarnings appends no entries. JSON omitempty omits expressionWarnings; typeChecking remains a present pointer to an empty object. This request shape alone does not prove removal of stored warnings.'},
  {name:'First apply omits a stored field',condition:'The merge updater has no previous owned set for this complete manager identifier and the new configuration omits an existing field.',sourceOutcome:'The prune function returns the merged value unchanged because lastSet is nil or empty. This omission is not an unconditional delete.'},
  {name:'Omitted item has another owner',condition:'At the typed merge boundary an item is absent from this manager\'s new configuration but another current manager owns it, and required conversions succeed.',sourceOutcome:'The prune route restores items claimed by current managed sets. Inspect schema granularity and the resulting object; Force true does not remove this ownership solely because the item was omitted.'},
  {name:'Forced conflicting change',condition:'A supplied modified or added field intersects another manager\'s owned set and the merge updater receives force true.',sourceOutcome:'The updater does not return the non-force conflict error and subtracts the conflicting field set from the other manager. Other validation and conversion errors can still fail the write.'},
];
const commonEvidence = [
  source('staging/src/k8s.io/apimachinery/pkg/runtime/serializer/json/json.go',267,304,'The typed JSON serializer invokes the pinned decoder; strict decoding also reports duplicate and unknown fields.'),
  source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go',950,1003,'Null clears pointers and collections; it leaves ordinary scalar and value-struct receivers unchanged. These cases start with a fresh typed object.'),
  source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go',535,560,'Array tokens require an array or slice receiver; wrong token types cannot populate a string or struct.'),
  source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go',568,625,'Array iteration retains value items, including the zero struct reached by a null item.'),
  source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go',697,732,'Object decoding selects struct fields and rejects incompatible target kinds.'),
  source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go',1028,1105,'String and number decoding check the receiving type and integer range instead of coercing incompatible values.'),
  strategy(59,80,'Normal create clears status and initializes generation; normal update restores old status and increments generation for a changed spec.'),
  strategy(154,168,'The status strategy invokes the status validator, restores the old spec and resets lifecycle metadata. It does not increment generation.'),
  validate(1246,1267,'Status validation checks type-checking warnings and conditions. It does not validate the top-level observedGeneration number.'),
  types(158,195,'Status uses an int64 observed generation, a TypeChecking pointer, a condition slice and typed string warning members.'),
  controller(147,168,'Reconciliation skips a generation already observed; otherwise it type-checks the cached policy and applies observedGeneration and typeChecking with its named field manager and Force true.'),
  controller(124,144,'Not-found policies are ignored. Other lookup or reconciliation errors are logged and requeued through the rate limiter.'),
  controller(55,74,'Run waits for the event-handler synchronization predicate before starting workers; failed synchronization returns. Cancellation triggers queue shutdown and waits for workers.'),
  controller(79,98,'The controller installs its default rate-limited queue, enqueues add/update events and uses the event-handler registration synchronization predicate.'),
  controller(117,144,'Workers stop when the queue shuts down, finish each item, forget successful items and rate-limit returned errors without checking an attempt cap.'),
  source('staging/src/k8s.io/client-go/util/workqueue/default_rate_limiters.go',48,56,'The default limiter combines a 5ms-base, 1000s-cap per-item exponential limiter with a shared 10qps, burst100 bucket.'),
  source('staging/src/k8s.io/client-go/util/workqueue/default_rate_limiters.go',116,149,'Each failed retry increases the per-item count; exponential delay is capped and Forget deletes the count.'),
  source('staging/src/k8s.io/client-go/util/workqueue/default_rate_limiters.go',222,232,'The combined limiter selects the greatest child delay.'),
  source('staging/src/k8s.io/client-go/util/workqueue/default_rate_limiters.go',255,259,'The combined limiter forgets each child state.'),
];
const baseConditions = [
  'Normal create discards authored status. Normal update preserves stored status. These field outcomes describe a typed status-subresource update with the immediate parent present.',
  'Omission in a fresh typed replacement and omission in an apply or merge patch are different operations. Do not use these replacement cases to infer removal of a field owned by another manager.',
  'The status controller skips type checking when metadata.generation is less than or equal to status.observedGeneration. It uses an informer snapshot and can publish observations of an earlier generation.',
  'The warning producer checks validation expressions and their nonempty messageExpression fields. It first compiles the policy variables into each checked expression environment. This warning list is not an execution result for a resource request or proof that a binding enforces the policy.',
  'Type checking can skip resource kinds after mapper or schema-resolution failures. A parameter schema failure leaves no parameter declaration. Compiler-construction failures also skip that kind. An observed generation and empty warnings therefore do not prove that every matching kind was checked. Inspect controller logs, discovery and schema availability before relying on these diagnostics.',
  'Workers start only after the registered policy event handler reports synchronization. Failed synchronization returns before workers start. Cancellation shuts down the queue and waits for workers. Ready queue items can still reach synchronous type checking until the queue is empty; the worker does not check cancellation before that call. TypeChecker.Check has no context parameter. ApplyStatus receives the cancelled context, so this path does not establish a successful write. Delayed additions stop at shutdown. Run has no timeout for its worker wait. Add and update events enqueue policy names. A missing policy and successful reconciliation are forgotten; returned lookup or apply errors are retried.',
  'Returned errors use per-item exponential retry delay with a 5ms base and 1000s cap, combined with a shared 10qps bucket with burst100. The greater child delay applies. This is a delay cap, not a retry-count cap; this worker does not check a maximum attempt count. Success clears retry state. Inspect persistent errors and their causes rather than treating repeated attempts as recovery.',
];
const records = [];
function add(path, shape, purpose, omitted, emptyValue, invalidValue, evidence, options = {}) {
  const nullValue = shape === 'pointer'
    ? `Null clears this pointer. ${omitted}`
    : shape === 'list'
      ? `Null clears this slice. ${omitted}`
      : shape === 'time'
        ? 'The Time custom decoder makes JSON null the zero time. The condition validator rejects that zero transition time.'
        : `Null leaves this ordinary ${shape} receiver at its fresh zero value. ${omitted}`;
  const record = {
    kind:'ValidatingAdmissionPolicy',fieldPath:path,purpose,
    receiver:`Kubernetes admissionregistration.k8s.io/v1 ValidatingAdmissionPolicy status ${shape} receiver; hand-written status validator and the separately named status controller.`,
    operationScope:'Fresh typed JSON status-subresource update; ordinary create/update have the different status preparation rules stated below. Source-derived controller publication is separate from executed validation.',
    omitted,nullValue,emptyValue,invalidValue,
    changeImpact:options.changeImpact ?? 'Changes reported policy observations through the status endpoint. It does not change the policy spec, binding, or outcome of a resource request.',
    crossFieldConditions:[...baseConditions,...applyConditions,...(options.conditions ?? [])],
    cases:[
      {name:'Omitted field in fresh replacement',condition:'The immediate parent exists and this field is omitted from a fresh typed status update.',sourceOutcome:omitted},
      {name:'Explicit JSON null',condition:'The immediate parent exists and this field is JSON null in a fresh typed status update.',sourceOutcome:nullValue},
      {name:'Explicit empty value',condition:'The immediate parent exists and the receiver-specific empty representation described below is supplied.',sourceOutcome:emptyValue},
      ...applyCases,...(options.cases ?? []),
    ],
    evidence:[...commonEvidence,...applyEvidence,...evidence,checker(104,138,'The warning producer constructs indexed field references for validation and message-expression diagnostics.')],
    qualificationLimits:[
      'These are pinned-source expectations. No API request, CEL evaluation, controller process, informer synchronization or live status update was executed.',
      'Actual controller selection, discovery schemas, permissions and server apply ownership determine whether a status write succeeds. On controller errors inspect its logs and access before changing the policy; retries do not prove recovery.',
      'The source route describes the pinned Kubernetes server. It does not establish the version, served models or managed fields of a running server. Before a corrective status write, inspect its discovery information, current status and manager entries. A successful merge calculation alone does not prove that authorization, admission, storage or response delivery succeeded.',
    ],
  };
  records.push(record);
}
add('$.status','struct','Reports the policy generation checked and its diagnostic observations.',
  'The fresh status value is zero: observedGeneration is 0, typeChecking is nil and conditions is nil. The hand-written status validator accepts that empty status.',
  '{} is the zero status and is accepted by the hand-written status validator.',
  'Wrong JSON types fail decoding. Present invalid warnings or conditions fail the status validator.',[],{
    cases:[{name:'Normal create ignores authored status',condition:'A normal policy create supplies status, including a large observedGeneration.',sourceOutcome:'PrepareForCreate replaces it with an empty status and sets metadata.generation to 1.'}],
  });
add('$.status.observedGeneration','int64','Identifies the policy generation reported as checked by the status controller.',
  'The fresh integer is 0. The hand-written status validator imposes no bound on this top-level field.',
  '0 remains 0; it is distinct from the condition item observedGeneration field.',
  'A fractional number, incompatible token or int64 overflow fails decoding. Negative values are not rejected by the named status validator.',[],{
    conditions:['A manually written value at or above metadata.generation causes this controller to skip checking. Do not author this server observation as a deployment setting. Restarting the controller does not bypass its generation comparison.'],
    cases:[{name:'Premature observed generation',condition:'The stored policy has generation 5 and status.observedGeneration 6.',sourceOutcome:'This reconciliation returns before type checking or ApplyStatus.'},{name:'Top-level negative generation',condition:'A typed status update has observedGeneration -1 and otherwise valid empty status.',sourceOutcome:'The hand-written status validator does not inspect this integer; the condition-item nonnegative rule does not apply here.'}],
  });
const conditionEvidence=[metaValidate(290,363,'Condition validation rejects duplicate types and checks type, status, nonnegative observed generation, nonzero transition time, reason grammar and byte lengths.'),metaTypes(1589,1635,'Condition fields are ordinary strings, int64, a Time value and the named condition-status type.'),metaTypes(1511,1519,'The declared condition status literals are True, False and Unknown.')];
const conditionLimit='The pinned status controller ApplyStatus payload supplies observedGeneration and typeChecking, not conditions. A condition is not automatically populated or maintained by that producer.';
add('$.status.conditions','list','Contains typed observations supplied through the status endpoint.',
  'The fresh slice is nil and contains no conditions. The condition validator accepts it.',
  '[] contains no conditions and is accepted. An entry {} is not an empty list and fails required condition checks.',
  'Wrong collection tokens, invalid condition members or repeated type strings are rejected.',conditionEvidence,{conditions:[conditionLimit],cases:[{name:'Duplicate condition type',condition:'Two otherwise valid condition entries have the same type string.',sourceOutcome:'ValidateConditions reports the second type as a duplicate.'}]});
add('$.status.conditions[]','struct','Carries one condition and the generation and transition information that justify it.',
  'Removing this entry removes one condition. A retained zero entry has empty type, status and reason and zero transition time, so it fails validation.',
  '{} fails the required type, status, transition time and reason checks; an empty message and zero observedGeneration are allowed.',
  'Invalid member values or a type duplicating another entry are rejected.',conditionEvidence,{conditions:[conditionLimit]});
for(const [field,purpose,omitted,empty,invalid,extra] of [
  ['observedGeneration','Records the generation underlying this particular condition.','The fresh integer is 0 and passes the nonnegative check.','0 is allowed.','A negative value fails condition validation; incompatible tokens, fractional values and int64 overflow fail decoding.',[]],
  ['message','Explains this condition for an operator.','The fresh empty string is accepted by the hand-written validator.','An empty string is accepted.','More than 32768 UTF-8 bytes fails the Go string-length check; incompatible JSON tokens fail decoding.',[]],
  ['reason','Names the reason for this condition.','The fresh empty reason is rejected as required.','An empty string is rejected.','The reason must start with an ASCII letter, contain only ASCII letters, digits, underscores, commas and colons, and end in an ASCII letter, digit or underscore. More than 1024 bytes is rejected.',[]],
  ['status','States whether the named condition holds.','The fresh empty status is rejected.','An empty string is rejected.','Only the exact strings True, False and Unknown pass the named validator; lowercase variants are rejected.',[]],
  ['type','Names the condition and distinguishes it from other entries.','The fresh empty type fails label-key validation.','An empty string is rejected.','A type failing label-key syntax or duplicating another entry is rejected.',[
    metaValidate(104,111,'Condition type validation delegates to the qualified-name validator.'),
    source('staging/src/k8s.io/apimachinery/pkg/util/validation/validation.go',31,36,'The qualified-name compatibility alias selects content.IsLabelKey.'),
    source('staging/src/k8s.io/apimachinery/pkg/api/validate/content/kube.go',24,72,'The actual label-key validator checks the optional DNS prefix, name grammar, nonempty parts and name length.'),
    source('staging/src/k8s.io/apimachinery/pkg/api/validate/content/dns.go',23,69,'DNS prefix grammar and length constants.'),
    source('staging/src/k8s.io/apimachinery/pkg/api/validate/content/dns.go',84,101,'The actual DNS subdomain validator checks prefix length and grammar.'),
  ]],
])add(`$.status.conditions[].${field}`,field==='observedGeneration'?'int64':'string',purpose,omitted,empty,invalid,[...conditionEvidence,...extra],{conditions:[conditionLimit]});
add('$.status.conditions[].lastTransitionTime','time','Records when this condition changed state.',
  'The fresh zero Time fails the required nonzero transition-time check.',
  'The JSON empty string fails RFC3339 parsing; it does not become an accepted timestamp.',
  'Non-string tokens or malformed RFC3339 strings fail the Time decoder. JSON null decodes to zero time, which fails condition validation.',[
    ...conditionEvidence,source('staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/time.go',99,119,'Time decoding handles null as zero and parses other JSON strings as RFC3339, returning parse errors.'),
  ],{conditions:[conditionLimit],cases:[{name:'Typed null transition time',condition:'An otherwise valid condition supplies lastTransitionTime null.',sourceOutcome:'Time becomes zero; ValidateCondition rejects it as required.'}]});
const warningEvidence=[validate(1263,1298,'Nil typeChecking and empty warning lists are accepted. Each present warning needs nonempty warning text and a trimmed nonempty, syntactically parsed JSONPath fieldRef.'),checker(93,101,'The diagnostic formatter emits a GVK-prefixed type-checking error or issue message.')];
add('$.status.typeChecking','pointer','Reports that type-checking diagnostic information is present.',
  'The pointer is nil; the status validator accepts absence. Absence does not establish that the controller checked the current generation.',
  '{} is a present TypeChecking value with no warning entries and passes the hand-written status validator.',
  'Wrong JSON types or invalid present warning entries fail decoding or validation.',warningEvidence);
add('$.status.typeChecking.expressionWarnings','list','Lists diagnostics produced for validation and message expressions.',
  'The fresh slice is nil and contains no warning entries. The warning validator accepts it.',
  '[] is accepted. A retained {} item fails its required fieldRef and warning checks.',
  'Wrong JSON collection types or invalid present warning entries are rejected.',warningEvidence,{
    conditions:['The producer calls WithExpressionWarnings for its computed entries. Do not infer from an empty computed result that the serialized apply request includes an explicit empty list, or that values owned by another writer disappear.','The generated v1 OpenAPI model declares this warning list atomic. It does not declare separate ownership keys for individual warning entries.'],
  });
add('$.status.typeChecking.expressionWarnings[]','struct','Associates one diagnostic message with an expression field.',
  'Removing the item removes one supplied diagnostic. A retained zero item has empty strings and fails both required-field checks.',
  '{} fails the nonempty warning and fieldRef checks.',
  'Wrong member types, an empty warning, or a blank or syntactically invalid fieldRef is rejected.',warningEvidence);
add('$.status.typeChecking.expressionWarnings[].fieldRef','string','Identifies the expression described by this diagnostic.',
  'The fresh empty string fails the required fieldRef check.',
  'An empty or whitespace-only string is rejected after local trimming.',
  'Wrong JSON types fail decoding; syntactically invalid JSONPath text is rejected. This validator parses but does not resolve the path against this policy.',warningEvidence,{
    conditions:['Trimming occurs in the validator local variable; it does not rewrite the stored string. The controller constructs indexed spec.validations expression or messageExpression paths.'],
    cases:[{name:'Syntactic reference without lookup',condition:'The string metadata.name is supplied with nonempty warning text.',sourceOutcome:'The fieldRef parser can accept its syntax; the validator performs no lookup requiring a validation-expression path.'}],
  });
add('$.status.typeChecking.expressionWarnings[].warning','string','Provides the diagnostic text for the referenced expression.',
  'The fresh empty string is rejected as required.',
  'An empty string is rejected; whitespace-only text is nonempty and is not trimmed by this validator.',
  'Wrong JSON types fail decoding. The shown warning validator imposes no warning-text length bound beyond requiring nonempty text.',warningEvidence);
const selectionCondition = 'For the controller-produced observedGeneration and typeChecking fields, type selection counts nonempty mapper results separately for each usable resource rule. maxTypesToCheck is 10. A duplicate result increases the count even when the kind is already in the set. When one rule reaches 10 results, selection returns the entire accumulated set, including earlier rules, and skips remaining candidates. This is not a policy-wide limit of ten distinct kinds. These selection rules do not populate conditions.';
const diagnosticCondition = 'For controller-produced warnings, compiling variables first does not produce a separate variable-field diagnostic list. CompileAndStoreVariables discards each returned result while storing it and declaring its field. A failed variable compile with no output type declares a dynamic type. CheckExpression appends only the later target expression error; Check indexes it to the validation expression or messageExpression. The type-checking compiler does not enforce the expected output type or initialize a program. Empty warnings do not establish that every variable compiled, the target returns the required type, or evaluation succeeds. These diagnostic rules do not populate conditions.';
const selectionEvidence = [
  checker(45,45,'The type-selection counter threshold maxTypesToCheck is 10.'),
  checker(272,289,'Type selection resets the nonempty mapper-result counter for each usable resource rule.'),
  checker(312,323,'Each nonempty mapper result increments the counter, including duplicate kinds; reaching 10 returns the entire accumulated kind set.'),
];
const cancellationEvidence = [
  controller(59,74,'Cancellation reaches deferred queue shutdown and worker wait; this Run supplies no timeout for that wait.'),
  controller(112,133,'An active worker takes ready items and reconciles them without a preceding context cancellation check.'),
  checker(104,109,'TypeChecker.Check receives the policy without a context parameter.'),
  source('staging/src/k8s.io/client-go/util/workqueue/queue.go',265,283,'Get returns ready items after shutdown and returns the shutdown signal only when the ready queue is empty.'),
  source('staging/src/k8s.io/client-go/util/workqueue/queue.go',304,319,'ShutDown rejects new additions and wakes workers; ready queued items remain available to workers.'),
  source('staging/src/k8s.io/client-go/util/workqueue/delaying_queue.go',240,266,'Delayed queue shutdown stops its waiting loop and heartbeat; AddAfter rejects additions when shutdown has begun.'),
  source('staging/src/k8s.io/client-go/util/workqueue/rate_limiting_queue.go',136,140,'AddRateLimited delegates retry scheduling to the delayed queue AddAfter operation.'),
];
const diagnosticEvidence = [
  source('staging/src/k8s.io/apiserver/pkg/admission/plugin/cel/composition.go',89,99,'Variable compilation discards each standalone return while recording its result and declaring its output type.'),
  source('staging/src/k8s.io/apiserver/pkg/admission/plugin/cel/composition.go',126,128,'A variable field is declared from the compiled output type through convertCelTypeToDeclType.'),
  source('staging/src/k8s.io/apiserver/pkg/admission/plugin/cel/composition.go',236,239,'A nil compiled variable output type becomes a dynamic declaration type.'),
  checker(214,223,'After storing variables, CheckExpression appends only errors returned by the target expression compilation.'),
  checker(453,483,'The type-checking compiler compiles the target and records its output type without enforcing the expected return type or initializing a program.'),
];
const selectionCases = [
  {name:'One rule reaches ten mapper results',condition:'A usable resource rule resolves ten nonempty mapper results; later candidates or rules remain.',sourceOutcome:'The tenth result triggers an early return of the sorted accumulated kind set. Remaining candidates and rules are not selected by this call; selected kinds still need schema resolution before expression checking.'},
  {name:'Repeated resolved kinds reach the counter threshold',condition:'One usable rule resolves the same nonempty kind ten times.',sourceOutcome:'Each result increments the rule counter, but the set stores that kind once. Selection returns at the tenth result; the rule need not add ten distinct kinds.'},
  {name:'Earlier rule kinds survive the selection return',condition:'An earlier usable rule adds nine distinct kinds without reaching ten results. A later rule resolves ten other distinct nonempty kinds.',sourceOutcome:'The later rule resets its own counter, then returns the whole accumulated set at ten results. All nineteen distinct kinds remain selected; there is no global ten-distinct-kind cap.'},
];
const cancellationCase = {name:'Cancellation with ready queued policy work',condition:'Workers have started. The controller context is cancelled while a ready policy name remains queued; lookup succeeds and its generation requires checking.',sourceOutcome:'Queue shutdown still permits an active worker to take the ready item. Synchronous TypeChecker.Check can run without a cancellation check or context parameter. ApplyStatus receives the cancelled context; successful publication is not established. Delayed retry additions stop, and Run waits for workers without a timeout here.'};
const diagnosticCases = [
  {name:'Standalone variable compilation fails',condition:'A selected kind has a schema and compiler. A policy variable compile returns an error with no output type, but the subsequent target expression compiles without an error.',sourceOutcome:'Composition stores the failed result and declares the variable with a dynamic type. The standalone return is discarded. CheckExpression appends no diagnostic for that variable failure or for this successful target compile; empty warnings do not prove that the variable compiled.'},
  {name:'Target compilation fails after variable compilation',condition:'After variables are stored, the target validation expression or nonempty messageExpression returns a compilation error, including an error involving a variable dependency.',sourceOutcome:'CheckExpression appends the target error for this kind. Check indexes the warning to spec.validations[i].expression or spec.validations[i].messageExpression. It does not append a separate spec.variables[i] diagnostic or establish that every failed dependency produces a target error.'},
  {name:'Target compiles with an undesired return type',condition:'A selected kind has a schema and compiler. The target expression compiles without issues, but its output type differs from the type required for the validation or message expression.',sourceOutcome:'The type-checking compiler records the output type and returns no error solely for that mismatch. It initializes no program. This kind contributes no warning for the undesired return type; no evaluation or policy enforcement result is established.'},
];
for(const record of records) {
  record.evidence.push(...cancellationEvidence);
  record.evidence.push(checker(141,175,'Context construction skips resource kinds whose schemas cannot be resolved, can omit the parameter declaration and retains policy variables.'),checker(198,226,'Each resolved kind compiles policy variables before the target expression; compiler-construction failures skip the kind.'),checker(266,284,'Type selection skips rules without usable concrete group, version or resource entries.'),checker(299,323,'Mapper resolution retries after at most one refresh per policy and can skip failures; collecting the maximum count returns early.'),checker(336,368,'Wildcard groups or versions yield no candidates for that rule; wildcard and subresource entries are skipped in resource extraction.'));
  if(['$.status','$.status.observedGeneration','$.status.typeChecking','$.status.typeChecking.expressionWarnings'].includes(record.fieldPath)) {
    record.cases.push(
      {name:'Unavailable resource schema',condition:'The controller generation guard permits checking, but all selected resource kind schemas fail resolution.',sourceOutcome:'Context construction skips every failed kind. No per-kind expression result is produced. The controller can still submit observedGeneration with empty computed warnings; those observations do not certify complete type coverage.'},
      {name:'Variable dependencies during checking',condition:'A selected kind has a resolved schema and a validation expression uses a policy variable.',sourceOutcome:'CheckExpression first compiles the supplied variable declarations into the composition environment, then compiles the validation expression in StoredExpressions. Diagnostics are still indexed to that validation or message expression.'},
      {name:'Compiler construction fails for a kind',condition:'A kind has a resolved schema, but constructing its expression compiler returns an error.',sourceOutcome:'CheckExpression reports the internal error and continues to the next kind without appending an expression diagnostic for the failed construction. Other kinds may still produce diagnostics.'},
      {name:'Parameter schema cannot be resolved',condition:'Context construction cannot resolve the declared parameter schema.',sourceOutcome:'The context has a nil parameter declaration. Non-schema-not-found errors are logged. Subsequent expression checking sets HasParams false; absence of warnings does not certify the missing parameter type.'},
      {name:'Rule has only skipped resources',condition:'A match rule has concrete groups and versions but its resource entries contain only wildcard or subresource strings.',sourceOutcome:'Resource extraction skips those entries. The rule contributes no kind to this type check; this does not mean that admission request matching rejects the rule.'},
      {name:'Same Apply manager changes API version',condition:'The manager name, Apply operation and status subresource stay the same while the Apply API version changes.',sourceOutcome:'BuildManagerIdentifier clears APIVersion for Apply, so this version change alone does not create a new identity. Pruning can still use the prior VersionedSet API version and its conversion rules; this is not automatically a first apply.'},
      {name:'Controller synchronization does not complete',condition:'The registered policy event-handler synchronization wait returns false.',sourceOutcome:'Run returns before it starts workers; its deferred cleanup shuts down the queue. No type-check or status publication is established by this run.'},
      {name:'Repeated returned apply error',condition:'ApplyStatus repeatedly returns an error while the controller and queue remain active.',sourceOutcome:'The worker logs each returned error and calls AddRateLimited without an attempt-count check. Per-item delay can reach its cap; the combined limiter can select a greater bucket delay. No successful status write or recovery is established.'},
      {name:'Diagnostics skipped then generation observed',condition:'A check produces no diagnostics after skipping candidate kinds, the status apply succeeds, and a later informer observation has observedGeneration at least metadata.generation.',sourceOutcome:'The later reconciliation returns at the generation guard before another check. An empty diagnostic result is not an automatic retry trigger for the skipped kinds.'},
    );
  }
  if(['$.status','$.status.observedGeneration','$.status.typeChecking','$.status.typeChecking.expressionWarnings'].includes(record.fieldPath)) {
    record.evidence.push(...selectionEvidence);
    record.crossFieldConditions.push(selectionCondition);
    record.cases.push(...selectionCases,cancellationCase);
    record.qualificationLimits.push('For these controller observations, the selection threshold counts mapper results per rule, not distinct kinds for the policy. Cancellation can leave ready work in progress; this Run does not bound its worker wait or establish publication with a cancelled context.');
  }
  if(['$.status','$.status.observedGeneration','$.status.typeChecking'].includes(record.fieldPath) || record.fieldPath.startsWith('$.status.typeChecking.expressionWarnings')) {
    record.evidence.push(...diagnosticEvidence);
    record.crossFieldConditions.push(diagnosticCondition);
    record.cases.push(...diagnosticCases);
    record.qualificationLimits.push('These producer diagnostics report target expression compile errors. They do not provide a complete standalone variable report, enforce the expected target return type, initialize a program, or prove evaluation and admission enforcement. A failed variable can have a dynamic declaration; its failure is not necessarily a target compile error.');
  }
  if(record.fieldPath.startsWith('$.status.typeChecking.expressionWarnings')) {
    record.evidence.push(source('pkg/generated/openapi/zz_generated.openapi.go',2372,2384,'The generated v1 TypeChecking model declares expressionWarnings with list type atomic.'));
  }
  if(record.fieldPath.startsWith('$.status.conditions')) {
    record.crossFieldConditions.push('The generated v1 OpenAPI model declares conditions as a map list keyed by type. This schema distinguishes entries by condition type; it is not the atomic warning-list schema.');
    record.evidence.push(source('pkg/generated/openapi/zz_generated.openapi.go',2797,2806,'The generated v1 status model declares conditions as a map list keyed by type.'));
  }
}
export const receiverContracts=Object.freeze(records.map(record=>Object.freeze(record)));
