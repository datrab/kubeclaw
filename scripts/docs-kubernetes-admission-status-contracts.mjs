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
const commonEvidence = [
  source('staging/src/k8s.io/apimachinery/pkg/runtime/serializer/json/json.go',267,304,'The typed JSON serializer invokes the pinned decoder; strict decoding also reports duplicate and unknown fields.'),
  source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go',950,1003,'Null clears pointers and collections; it leaves ordinary scalar and value-struct receivers unchanged. These cases start with a fresh typed object.'),
  source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go',535,560,'Array tokens require an array or slice receiver; wrong token types cannot populate a string or struct.'),
  source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go',568,625,'Array iteration retains value items, including the zero struct reached by a null item.'),
  source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go',697,732,'Object decoding selects the struct or map receiver and rejects incompatible target kinds.'),
  source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go',1028,1105,'String and number decoding check the receiving type and integer range instead of coercing incompatible values.'),
  strategy(59,80,'Normal create clears status and initializes generation; normal update restores old status and increments generation for a changed spec.'),
  strategy(154,168,'The status strategy invokes the status validator, restores the old spec and resets lifecycle metadata. It does not increment generation.'),
  validate(1246,1267,'Status validation checks type-checking warnings and conditions. It does not validate the top-level observedGeneration number.'),
  types(158,195,'Status uses an int64 observed generation, a TypeChecking pointer, a condition slice and typed string warning members.'),
  controller(147,168,'Reconciliation skips a generation already observed; otherwise it type-checks the cached policy and applies observedGeneration and typeChecking with its named field manager and Force true.'),
  controller(124,144,'Not-found policies are ignored. Other lookup or reconciliation errors are logged and requeued through the rate limiter.'),
];
const baseConditions = [
  'Normal create discards authored status. Normal update preserves stored status. These field outcomes describe a typed status-subresource update with the immediate parent present.',
  'Omission in a fresh typed replacement and omission in an apply or merge patch are different operations. Do not use these replacement cases to infer removal of a field owned by another manager.',
  'The status controller skips type checking when metadata.generation is less than or equal to status.observedGeneration. It uses an informer snapshot and can publish observations of an earlier generation.',
  'The controller checks validation expressions and their nonempty messageExpression fields. This warning list is not an execution result for a resource request or proof that a binding enforces the policy.',
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
    crossFieldConditions:[...baseConditions,...(options.conditions ?? [])],
    cases:[
      {name:'Omitted field in fresh replacement',condition:'The immediate parent exists and this field is omitted from a fresh typed status update.',sourceOutcome:omitted},
      {name:'Explicit JSON null',condition:'The immediate parent exists and this field is JSON null in a fresh typed status update.',sourceOutcome:nullValue},
      {name:'Explicit empty value',condition:'The immediate parent exists and the receiver-specific empty representation described below is supplied.',sourceOutcome:emptyValue},
      ...(options.cases ?? []),
    ],
    evidence:[...commonEvidence,...evidence,checker(104,138,'The warning producer checks only validation and message expressions and constructs indexed field references.')],
    qualificationLimits:[
      'These are pinned-source expectations. No API request, CEL evaluation, controller process, informer synchronization or live status update was executed.',
      'Actual controller selection, discovery schemas, permissions and server apply ownership determine whether a status write succeeds. On controller errors inspect its logs and access before changing the policy; retries do not prove recovery.',
      'Available-source documentation gap: the complete server-side apply field-ownership and omission route for this status producer still requires separate qualification. The named Force option is an input, not proof that every omitted warning or condition is removed.',
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
    conditions:['The producer calls WithExpressionWarnings for its computed entries. Do not infer from an empty computed result that the serialized apply request includes an explicit empty list, or that values owned by another writer disappear.'],
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
export const receiverContracts=Object.freeze(records.map(record=>Object.freeze(record)));
