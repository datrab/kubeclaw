// These authored paths were enumerated with docs-api-schema-authorities.mjs.
// The inventory resolves all schema nodes in its selected repository root.
// New schema paths require a new authored receiver contract; no fallback is used.
const revision = '66452049f3d692768c39c797b21b793dce80314e';
const apiVersion = 'admissionregistration.k8s.io/v1';
const source = (file, lines, claim) => ({
  url: `https://github.com/kubernetes/kubernetes/blob/${revision}/${file}#L${lines.replace('-', '-L')}`,
  claim,
});
const validationFile = 'pkg/apis/admissionregistration/validation/validation.go';
const typesFile = 'staging/src/k8s.io/api/admissionregistration/v1/types.go';
const defaultsFile = 'pkg/apis/admissionregistration/v1/defaults.go';
const runtimeDirectory = 'staging/src/k8s.io/apiserver/pkg/admission/plugin/';
const v = (lines, claim) => source(validationFile, lines, claim);
const t = (lines, claim) => source(typesFile, lines, claim);
const runtime = (file, lines, claim) => source(`${runtimeDirectory}${file}`, lines, claim);
const c = (name, condition, sourceOutcome) => ({ name, condition, sourceOutcome });
const semantics = (purpose, omitted, emptyValue, invalidValue, crossFieldConditions, cases, evidence, qualificationLimits = []) =>
  ({ purpose, omitted, emptyValue, invalidValue, crossFieldConditions, cases, evidence, qualificationLimits });

const environment = 'CEL means Common Expression Language. Validation expressions use object, oldObject, request, namespaceObject and authorizer; params is declared only with paramKind. CREATE has null oldObject; DELETE has null object. namespaceObject is null for cluster-scoped requests. Composition exposes earlier variables as variables.<name>. Guard null and absent properties before access. Each policy/binding/parameter validation evaluation starts with 10000000 CEL cost units; message expressions use its remaining budget. Audit expressions receive a separate 10000000-unit budget. Match conditions receive 2500000 units. These are work budgets, not response-time guarantees.';
const updateEnvironment = 'Create checks use the NewExpressions environment. Update reuses the StoredExpressions environment for unchanged expression strings found in the old policy. Runtime compiles persisted expressions in StoredExpressions. This compatibility rule does not bypass checks on changed expressions.';
const behaviorLimits = [
  'These outcomes are derived from Kubernetes v1.35.0 source at the linked commit. No Go receiver test or live admission request was run for this contract.',
  'A server can reject a request at authentication, authorization, another admission plugin or storage. This contract describes this receiver only.',
  'Omission, null and empty values below describe a complete object decoded into a fresh typed API value, followed by defaulting and validation. JSON merge patch, strategic merge patch and server-side apply can retain, remove or conflict on fields before this boundary; null is not a general reset command.',
  'The broker Helm template renders its policy and binding only when busterNamespaceBroker.enabled is true and agentRole is buster; it rejects Kubernetes versions below 1.30. scripts/deploy.sh delegates the fence to that Helm release. my-values/infra/buster-namespace-fence.yaml is a separate raw baseline with UPDATE and ownership-label rules. Its presence does not prove that those rules are selected or active. Confirm the actual applied objects and their field managers before changing them.',
  'Policy and binding changes affect later admission evaluations after informer refresh. They do not revalidate already stored resources. No refresh completion, active server version, enabled plugin, field ownership or cluster protection was observed here.',
];

function policyRoot() {
  return semantics('Define the rules that the API server evaluates for requests selected by bindings.',
    'A missing spec decodes to its zero-value structure and fails: matchConstraints is required and validations or auditAnnotations must contain an item.',
    '{} fails the same complete-policy checks. A policy without a binding does not enforce its rules.',
    'Defaulting precedes create validation. Missing matchConstraints, empty resourceRules, invalid children or both empty validations and auditAnnotations reject the policy.',
    ['Bindings select this policy by name and narrow its matchConstraints. Policies and bindings are cluster-scoped.', 'Main-resource create clears status and sets generation to 1. Main-resource update retains old status and increments generation when spec changes. Status update retains old spec.', updateEnvironment],
    [c('audit-only-policy', 'auditAnnotations has a valid item and validations is empty', 'The policy can pass receiver validation. Audit expressions still evaluate; their errors are not the same as a false validation.'), c('empty-policy', 'validations and auditAnnotations are both empty', 'Both fields receive required-field errors.'), c('update', 'a valid spec changes', 'The update strategy increments generation; the policy source recompiles after its informer sees the change.')],
    [v('772-829', 'Complete policy validation and lazy composition compiler.'), source('pkg/registry/admissionregistration/validatingadmissionpolicy/strategy.go', '55-93', 'Create/update/status ownership and generation.'), source('pkg/registry/admissionregistration/validatingadmissionpolicy/strategy.go', '160-169', 'Status operations retain the old spec.'), runtime('policy/generic/policy_source.go', '151-207', 'Informer changes trigger policy refresh.')]);
}

function bindingRoot() {
  return semantics('Connect a named policy to selected requests, optional parameter resources and enforcement actions.',
    'A missing spec becomes a zero-value spec; empty policyName and validationActions reject it.',
    '{} is rejected because policyName and at least one validation action are required.',
    'Invalid policyName, parameter selection, match criteria or action combinations reject create and update.',
    ['The policy and binding match criteria intersect. A binding cannot expand its policy scope.', 'A policy with no paramKind ignores the binding paramRef during evaluation, but the binding create/update receiver still validates a supplied paramRef.', 'Binding create and changed parameter references can require parameter read permission. The binding is cluster-scoped.'],
    [c('no-policy', 'policyName names no observed policy', 'The policy source does not create a hook for that name; this binding does not evaluate a rule.'), c('valid-update', 'the complete new binding passes validation and authorization', 'Spec changes increment generation; later informer refresh changes admission selection.')],
    [v('1170-1236', 'Binding receiver validates all supplied children.'), source('pkg/registry/admissionregistration/validatingadmissionpolicybinding/strategy.go', '60-93', 'Binding scope, generation and authorization on create/update.'), runtime('policy/generic/policy_source.go', '270-320', 'Bindings are grouped by policy name and missing policies are skipped.')]);
}

const assertionOutcomeCondition = 'the assertion has no individual evaluation error, no overall message-filter ErrInternal or ErrOutOfBudget preempts its result, and no overall audit-filter error replaces the decisions';
const supersedingFilterErrors = 'An overall message-filter ErrInternal or ErrOutOfBudget is handled before assertion truth when that assertion has no individual evaluation error. An overall audit-filter error replaces all computed assertion decisions with one error decision. Ignore maps these errors to ActionAdmit, even after a false assertion; Fail maps them to ActionDeny for binding action enforcement. Other policy/parameter evaluations and admission components remain separate.';
const filterErrorCases = () => [
  c('message-filter-preemption', 'the assertion has no individual evaluation error and the overall message filter reports ErrInternal or ErrOutOfBudget', 'Do not use the true or false assertion result. Create an error decision: Ignore gives ActionAdmit; Fail gives ActionDeny for binding actions. A later overall audit-filter error can replace the returned decisions.'),
  c('audit-filter-replacement', 'the overall audit filter reports an error after assertion decisions were computed', 'Discard those assertion decisions and return one error decision. Ignore gives ActionAdmit even after a false assertion; Fail gives ActionDeny for binding actions. These actions apply to the replacement error, not the discarded assertions.'),
];
const filterErrorEvidence = () => [
  runtime('policy/validating/validator.go', '121-155', 'An overall message-filter internal/budget error preempts assertion truth.'),
  runtime('policy/validating/validator.go', '189-206', 'An overall audit-filter error replaces computed assertion decisions.'),
  runtime('policy/validating/validator.go', '60-72', 'Error decisions admit with Ignore and deny with Fail.'),
  runtime('policy/validating/dispatcher.go', '226-250', 'Only returned ActionDeny decisions receive binding actions.'),
];

function failurePolicy() {
  return semantics('Select how evaluation failures are handled; a false validation is a separate outcome.',
    'A nil failurePolicy defaults to Fail before validation.',
    'An explicit empty string is not nil and is rejected. Accepted values are Fail and Ignore.',
    'A value other than Fail or Ignore is rejected by receiver validation.',
    ['A false assertion is processed by binding validationActions even with Ignore only when no overall message-filter internal/budget error preempts it and no overall audit-filter error replaces the decisions.', 'With Ignore, an ordinary CEL error produces an ActionAdmit decision; with Fail, an ActionDeny decision reaches binding validationActions if it remains in the returned result.', supersedingFilterErrors, 'The dispatcher handles configuration errors and audit-annotation errors separately. Do not infer that Audit or Warn can neutralize every Fail error.'],
    [...filterErrorCases(), c('false-with-ignore', `failurePolicy is Ignore, a validation evaluates false, and ${assertionOutcomeCondition}`, 'The validator returns ActionDeny; the binding maps that decision through Deny, Warn and Audit.'), c('evaluation-error', 'validation CEL evaluation reports an individual error', 'Initially Ignore yields ActionAdmit and Fail yields ActionDeny. A later overall audit-filter error can replace the decisions; only the returned ActionDeny decisions receive binding actions.'), c('configuration-error', 'a matched policy/binding has a configuration error', 'Ignore discards that error. Fail appends a denied decision directly, without consulting validationActions.'), c('audit-expression-error', 'an individual audit value result has an error and failurePolicy is Fail', 'The dispatcher adds a direct denied decision; Audit-only or Warn-only actions do not prevent this denial.')],
    [...filterErrorEvidence(), source(defaultsFile, '98-103', 'Nil failurePolicy defaults to Fail.'), v('783-788', 'Failure policy validation.'), runtime('policy/validating/validator.go', '60-72', 'Evaluation and audit error actions.'), runtime('policy/validating/validator.go', '140-155', 'False validation and evaluation errors are distinct.'), runtime('policy/validating/dispatcher.go', '76-116', 'Configuration errors apply failurePolicy directly.'), runtime('policy/validating/dispatcher.go', '257-278', 'Audit annotation errors directly append a denial.')], ['The v1 type description says Fail failures use binding actions. The dispatcher branches above are narrower implementation evidence and show exceptions.']);
}

function paramKind(path) {
  const child = path.split('.').at(-1);
  const detail = child === 'apiVersion' ? 'apiVersion must be nonempty. Its optional group must be a DNS1123 subdomain, and its version a nonempty DNS1035 label. A core version such as v1 needs no slash.'
    : child === 'kind' ? 'kind must be nonempty and, after conversion to lowercase for checking, satisfy DNS1035 label syntax. Mixed case is accepted.'
      : 'A present paramKind requires nonempty apiVersion and kind. Its type can be namespaced or cluster-scoped.';
  return semantics('Declare the API type of parameter objects available as params in CEL.',
    path === '$.spec.paramKind' ? 'No parameter type is declared. CEL params is unavailable; a supplied binding paramRef is ignored during evaluation.' : 'An omitted child is an empty string and rejects a present paramKind.',
    path === '$.spec.paramKind' ? '{} is rejected because apiVersion and kind are empty.' : 'An empty string is rejected. ' + detail,
    detail,
    ['Successful syntax validation does not prove that the kind is registered, resolvable or that its parameter informer is synchronized.', 'Creating a policy with paramKind, or changing its type, requires get permission on all objects of the resolved kind across namespaces, unless the escalation bypass applies. Failed resolution broadens the required authorization attributes.', 'A binding without paramRef evaluates once with null params, even if paramKind exists.', updateEnvironment],
    [c('unknown-kind', 'paramKind cannot be resolved for a matched policy', 'A policy configuration error is subject to failurePolicy; syntax-valid creation does not establish runtime usability.'), c('no-binding-reference', 'paramKind exists and paramRef is absent', 'CollectParams returns one nil parameter; CEL must guard params == null.'), c('unchanged-kind-update', 'new and old paramKind are equal', 'The policy authorization helper skips the extra parameter-read check; ordinary API authorization still applies.')],
    [v('832-865', 'Parameter type syntax.'), source('pkg/registry/admissionregistration/validatingadmissionpolicy/authz.go', '31-105', 'Parameter-type read authorization and unchanged update bypass.'), runtime('policy/generic/policy_dispatcher.go', '263-333', 'Parameter type readiness and null parameter branches.'), t('213-220', 'Declared parameter type and absent binding reference.')]);
}

function paramRef(path) {
  const key = path.split('.').at(-1);
  const details = {
    paramRef: ['Select a named parameter or parameters that match a label selector.', 'Absent paramRef evaluates once with null params when the policy has paramKind. Without paramKind, any reference is ignored during evaluation.', '{} is rejected: specify name or selector and parameterNotFoundAction.', 'name and selector are mutually exclusive; one is required. parameterNotFoundAction must be Allow or Deny.'],
    name: ['Select one parameter object by exact resource name.', 'An absent name is empty; selector must then be present.', 'An empty name selects no named object and requires selector.', 'Names are checked as path segments; slash, percent, dot and dot-dot restrictions apply. A nonempty name with selector is forbidden.'],
    namespace: ['Select the namespace searched for a namespaced parameter type.', 'An absent namespace is empty: use the admission request namespace for a namespaced type.', 'An empty string uses the request namespace. Cluster-scoped admission then fails unless an explicit parameter namespace is supplied.', 'The API validator does not validate namespace syntax here. For cluster-scoped parameter types a nonempty namespace is a runtime configuration error.'],
    parameterNotFoundAction: ['Control the zero-parameter result after a valid parameter lookup.', 'A present paramRef without parameterNotFoundAction is rejected; no default is supplied.', 'An empty string is rejected as required.', 'Only Allow and Deny are accepted.'],
  };
  const [purpose, omitted, empty, invalid] = details[key];
  return semantics(purpose, omitted, empty, invalid,
    ['A supplied reference is validated at create/update even when the named policy is absent or has no paramKind.', 'Name selection requires get permission; selector selection requires list permission on the parameter resource. Empty namespace requests cross-namespace permission in the authorization attributes.', 'An unchanged comparable paramRef and unchanged policyName skip the extra update authorization check. A selector pointer is part of that comparison; do not assume semantic selector equality proves the bypass.'],
    [c('no-parameter-type', 'the policy has no paramKind', 'CollectParams ignores paramRef and returns one nil parameter.'), c('namespaced-lookup', 'paramKind is namespaced and namespace is empty', 'Use the admission namespace. If that namespace is empty, return a configuration error.'), c('cluster-parameter', 'paramKind is cluster-scoped and namespace is nonempty', 'Return a configuration error.'), c('lookup-not-ready', 'the parameter informer has not synchronized', 'Wait up to one second for its initial synchronization, then return a configuration error if it remains unsynchronized.'), c('zero-Allow', 'lookup succeeds but selects zero parameters and parameterNotFoundAction is Allow', 'Return zero evaluations; this binding does not deny for missing parameters.'), c('zero-Deny', 'lookup succeeds but selects zero parameters and parameterNotFoundAction is Deny', 'Return a configuration error. Ignore discards it; Fail directly denies in the validating dispatcher.'), c('many-parameters', 'selector returns more than one parameter', 'Evaluate the policy for every selected parameter. A Deny action on any failed evaluation denies the request.')],
    [v('1198-1236', 'Reference syntax and exclusivity, no namespace grammar check.'), runtime('policy/generic/policy_dispatcher.go', '263-395', 'Parameter lookup, scope, synchronization and missing-parameter behavior.'), source('pkg/registry/admissionregistration/validatingadmissionpolicybinding/authz.go', '31-137', 'Create/update parameter-reference authorization.'), runtime('policy/validating/dispatcher.go', '156-225', 'Evaluate every selected parameter.')]);
}

function actions() {
  return semantics('Choose how the binding reports or denies a false validation.',
    'An omitted list is empty and is rejected. No default action is supplied.',
    '[] is rejected; at least one action is required. An empty-string item is unsupported.',
    'Only Deny, Warn and Audit are accepted. Duplicates and the Deny plus Warn combination are rejected. Deny plus Audit and Warn plus Audit are accepted.',
    ['Order does not affect the declared action set.', 'A returned false-assertion denial uses the binding actions even with Ignore. Overall message/audit-filter errors can instead preempt or replace that assertion result.', supersedingFilterErrors, 'Other policies and admission components can still deny a Warn-only or Audit-only request.', 'Policy configuration errors and Fail individual audit-expression errors can directly deny before action mapping.'],
    [...filterErrorCases(), c('Deny', `a validation is false, actions includes Deny, and ${assertionOutcomeCondition}`, 'Append a denied decision and reject the request.'), c('Warn', `a validation is false, actions includes Warn, and ${assertionOutcomeCondition}`, 'Add an HTTP warning through the server warning mechanism; this action alone does not deny.'), c('Audit', `a validation is false, actions includes Audit, and ${assertionOutcomeCondition}`, 'Publish a validation.policy.admission.k8s.io/validation_failure annotation with message, policy, binding, expressionIndex and validationActions.'), c('combined-actions', 'a returned ActionDeny decision exists and the configured action set is either [Deny, Audit] or [Warn, Audit]', 'Perform both configured actions.'), c('invalid-combination', 'actions contains both Deny and Warn', 'Reject the binding.')],
    [...filterErrorEvidence(), v('919-944', 'Action validation and forbidden combinations.'), runtime('policy/validating/dispatcher.go', '226-252', 'Runtime action mapping.'), runtime('policy/validating/dispatcher.go', '311-328', 'Audit failure payload.'), t('498-535', 'Warning and audit action contract.')]);
}

function matchResources(kind, path) {
  const policy = kind === 'ValidatingAdmissionPolicy';
  return semantics('Select requests by namespace labels, object labels, resource rules and exclusions.',
    policy ? 'Omitted matchConstraints is nil and rejects the policy.' : 'Omitted matchResources adds no binding filter; every request selected by the policy remains eligible.',
    policy ? '{} receives default empty selectors and Equivalent matching, but is rejected because policy resourceRules is empty.' : '{} receives default empty selectors and Equivalent matching. Empty binding resourceRules does not constrain the resource.',
    'Reject unsupported matchPolicy, invalid label selectors or invalid rule items. A valid binding can only narrow its policy.',
    ['The selectors and resource rule result must all match. Exclusions take precedence over inclusions.', 'The policy requires a nonempty resourceRules list for type information. Binding resourceRules can be empty.', 'Policies cannot protect policy and binding resources themselves; this preserves an API recovery path.'],
    [c('exclude-wins', 'a request matches both an inclusion and exclusion', 'The matcher skips this policy or binding.'), c('binding-intersection', 'a request matches binding filters but not policy filters', 'The policy does not evaluate for that request.'), c('empty-binding-rule-list', 'this is a binding and resourceRules is absent or empty', 'Other selectors and exclusion rules still apply; the empty inclusion list adds no resource restriction.')],
    [source(defaultsFile, '106-119', 'MatchResources defaults.'), v('793-801', 'Policy-specific nonempty resourceRules requirement.'), v('886-916', 'Common match criteria validation.'), runtime('policy/matching/matching.go', '74-132', 'Selector conjunction and exclusion precedence.'), runtime('policy/generic/policy_matcher.go', '61-98', 'Policy required constraints and optional binding constraints.'), t('222-228', 'Policies cannot match policy/binding resources.'), runtime('policy/generic/plugin.go', '43-50', 'Admission-policy resources are excluded.'), runtime('policy/generic/plugin.go', '200-220', 'Runtime exclusion ignores version and preserves the recovery path.')]);
}

function matchPolicy() {
  return semantics('Choose exact API matching or matching through equivalent resource versions.',
    'Nil matchPolicy defaults to Equivalent.', 'An explicit empty string is rejected; Exact and Equivalent are accepted.',
    'Reject any value other than Exact or Equivalent.',
    ['Equivalent matching uses the server equivalent-resource mapper and can convert the admission object to the matched kind. It does not make an unavailable API version served.', 'An unknown equivalent kind produces a configuration error; failurePolicy then applies.'],
    [c('Exact', 'the request does not match an exact rule and matchPolicy is Exact', 'No equivalent-resource search is made.'), c('Equivalent', 'no exact rule matches and matchPolicy is Equivalent', 'Search equivalent resources; a match supplies the matched resource and kind for evaluation.')],
    [source(defaultsFile, '106-111', 'Default Equivalent.'), v('891-895', 'Supported match policies.'), runtime('policy/matching/matching.go', '151-194', 'Equivalent resource matching and unknown-kind error.')]);
}

function selector(path) {
  const parameter = path.includes('.paramRef.selector');
  const namespace = path.includes('.namespaceSelector');
  const root = /(?:namespaceSelector|objectSelector|paramRef\.selector)$/u.test(path);
  const key = path.split('.').at(-1).replace(/\[\]$/u, '');
  const suffix = path.match(/\.(matchLabels(?:\["\*"\])?|matchExpressions(?:\[\])?(?:\.(?:key|operator|values)(?:\[\])?)?)$/u)?.[1];
  let purpose, omitted, empty, invalid;
  if (root) {
    purpose = parameter ? 'Select parameter objects by their labels.' : namespace ? 'Filter requests by the labels of their namespace.' : 'Filter requests by labels on the old or new object.';
    omitted = parameter ? 'No selector is present; a nonempty paramRef.name is required.' : 'Nil selector defaults to {}; it matches every label set.';
    empty = parameter ? '{} selects every parameter of paramKind in the selected parameter scope.' : '{} adds no label restriction.';
    invalid = 'Reject invalid label keys, label values, operators or operator/value combinations.';
  } else if (suffix?.startsWith('matchLabels')) {
    purpose = 'Require exact equality for each label key and string value.';
    omitted = 'An absent map adds no equality requirements.';
    empty = 'An empty map adds no requirements. An empty string is a valid label value and matches only that value for its key.';
    invalid = 'Keys must be qualified label names; values use Kubernetes label syntax and a maximum of 63 characters. Values must be strings.';
  } else if (key === 'key') {
    purpose = 'Name the label tested by this selector requirement.'; omitted = 'An omitted key is empty and rejects the requirement.'; empty = 'An empty key is rejected.'; invalid = 'Use a qualified label key: an optional DNS subdomain prefix and a name no longer than 63 characters.';
  } else if (key === 'operator') {
    purpose = 'Choose In, NotIn, Exists or DoesNotExist for the paired label key.'; omitted = 'An omitted operator is empty and rejected.'; empty = 'An empty operator is rejected.'; invalid = 'Only In, NotIn, Exists and DoesNotExist are accepted; In/NotIn require values and Exists/DoesNotExist forbid them.';
  } else if (key === 'values') {
    purpose = 'Supply the allowed or excluded label values for one requirement.'; omitted = 'Omitted values is valid only with Exists or DoesNotExist.'; empty = '[] is valid with Exists/DoesNotExist and rejected with In/NotIn. An empty-string item is a valid label value.'; invalid = 'Reject invalid label values; In/NotIn require at least one value, and Exists/DoesNotExist require zero values.';
  } else {
    purpose = 'Add label requirements whose results must all hold.'; omitted = 'An absent matchExpressions list adds no requirements.'; empty = path.endsWith('[]') ? '{} is rejected: key and operator are empty.' : '[] adds no requirements.'; invalid = 'Every item needs a valid key and operator, plus values consistent with that operator.';
  }
  return semantics(purpose, omitted, empty, invalid,
    ['matchLabels and matchExpressions are combined with logical AND.', parameter ? 'name and selector cannot both be set. More than one selected parameter causes separate policy evaluations.' : namespace ? 'For a Namespace request, test the Namespace object labels. For another cluster-scoped resource the namespace selector does not exclude it.' : 'Either old or new object matching is enough. A null object or an object without label metadata does not match a nonempty object selector. End users can change labels; this is unsuitable as an unconditional security boundary.'],
    [c('In', 'the key exists and its value is in values', 'The requirement matches.'), c('NotIn', 'the key is absent or its value is not in values', 'The requirement matches.'), c('Exists', 'the key exists and values is empty', 'The requirement matches.'), c('DoesNotExist', 'the key is absent and values is empty', 'The requirement matches.'), c('empty-selector', 'selector is {}', parameter ? 'Select every parameter in the selected scope.' : 'Do not restrict the label set.')],
    [source('staging/src/k8s.io/apimachinery/pkg/util/validation/validation.go', '31-36', 'Qualified-name validation aliases the label-key helper.'), source('staging/src/k8s.io/apimachinery/pkg/util/validation/validation.go', '145-153', 'Label value length and validation alias the content helpers.'), source('staging/src/k8s.io/apimachinery/pkg/api/validate/content/kube.go', '23-94', 'Actual label key/value grammar, optional prefix validation, and 63-byte name/value limits.'), source('staging/src/k8s.io/apimachinery/pkg/api/validate/content/dns.go', '23-69', 'Label prefix DNS subdomain grammar and length declaration.'), source('staging/src/k8s.io/apimachinery/pkg/api/validate/content/dns.go', '84-101', 'Actual label-prefix DNS subdomain validation body.'), source('staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/validation/validation.go', '60-103', 'Strict selector validation.'), source('staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/validation/validation.go', '109-124', 'Label key and value validation.'), source('staging/src/k8s.io/apimachinery/pkg/labels/selector.go', '236-283', 'Runtime selector operators.'), ...(parameter ? [v('1212-1223', 'Parameter selector and name exclusivity.')] : [runtime(`webhook/predicates/${namespace ? 'namespace' : 'object'}/matcher.go`, namespace ? '103-136' : '35-60', 'Namespace or old/new object matching.')])]);
}

function rules(kind, path) {
  const exclude = path.includes('.excludeResourceRules');
  const policyInclude = kind === 'ValidatingAdmissionPolicy' && !exclude;
  const field = path.split('.').at(-1).replace(/\[\]$/u, '');
  const listRoot = /\.(?:excludeResourceRules|resourceRules)$/u.test(path);
  const item = /\.(?:excludeResourceRules|resourceRules)\[\]$/u.test(path);
  const table = {
    apiGroups: ['Select API groups; the empty string denotes the core group.', 'A retained rule requires at least one API group.', '[] is rejected, but [""] is valid for the core API.', 'A wildcard * cannot occur alongside another group. The validator does not impose a group-name grammar here.'],
    apiVersions: ['Select API versions used for matching and type information.', 'A retained rule requires at least one API version.', '[] and an empty-string item are rejected.', 'A wildcard * cannot occur alongside another version. Nonempty version strings are not checked for served-version availability by this validator.'],
    operations: ['Select CREATE, UPDATE, DELETE, CONNECT or every operation with *.', 'A retained rule requires at least one operation.', '[] and an empty-string item are rejected.', 'Only CREATE, UPDATE, DELETE, CONNECT and * are accepted. * must be the only item.'],
    resources: ['Select resources and optional subresources.', 'A retained rule requires at least one resource.', '[] and an empty-string item are rejected.', 'Use resources, resources/subresources, *, resource/*, */subresource or */*. */* cannot coexist with another resource. The declared rule contract also forbids * with a plain resource. The implementation tracks only the last entry without a slash for that check; ["pods", "*"] passes that branch, while ["*", "pods"] fails. Covered subresource entries are rejected only when the covering wildcard was seen earlier. The validator does not enforce a complete resource-name grammar.'],
    resourceNames: ['Limit this rule to exact request resource names.', 'An absent list matches every request name.', '[] imposes no name restriction. The path-segment validator permits an empty-string item; it can only match an empty request name.', 'Duplicate names and invalid path segments are rejected. Generated-name CREATE can have an empty name at this matching boundary; do not infer a generated-name match.'],
    scope: ['Limit this rule to cluster-scoped or namespaced resources.', 'Nil scope defaults to *.', 'An empty string is unsupported; *, Cluster and Namespaced are accepted.', 'Reject any value other than *, Cluster or Namespaced.'],
  };
  const values = listRoot ? ['Combine resource rule alternatives; any matching rule is enough.', policyInclude ? 'A policy requires at least one resourceRule.' : exclude ? 'No requests are excluded by this list.' : 'Empty binding resourceRules adds no resource filter.', policyInclude ? '[] rejects the policy.' : exclude ? '[] excludes no requests.' : '[] adds no binding resource restriction.', 'Each retained rule needs nonempty apiGroups, apiVersions, resources and operations.']
    : item ? ['Define one resource and operation matching alternative.', 'Removing an item removes that alternative; the enclosing policy inclusion list must remain nonempty.', '{} is rejected because its required matching lists are empty.', 'All rule child constraints apply to each item.'] : table[field];
  if (!values) throw new Error(`Unassigned admission rule ${path}`);
  return semantics(...values,
    ['All fields in one rule must match together; alternatives within a list are ORed.', 'Exclusion rules take precedence over inclusion rules in both policy and binding criteria.', 'Policy matching supplies CEL type-check candidates. Broad wildcards can reduce static type checking; runtime matching still applies.'],
    [c('core-group', 'apiGroups contains an empty string', 'Accept the core API group; do not treat it as missing.'), c('wildcard-operation', 'operations contains * with another item', 'Reject the rule.'), c('plain-wildcard-order', 'resources is ["pods", "*"]', 'The final * resets the implementation flag, so the plain-resource conflict check does not reject this order. ["*", "pods"] is rejected. Preserve the stricter declared contract.'), c('wildcard-resource-order', 'resources contains pods/status before pods/*', 'The validator does not reject this pair through the earlier-wildcard check. Reversing these items produces an error; */* conflicts are checked across the whole list.'), c('no-resource-name', 'resourceNames is omitted or []', 'A matched rule does not restrict request names.'), c('exclusion-match', 'this is an exclusion and the request matches it', 'Skip the policy or binding before checking inclusion rules.')],
    [v('60-173', 'Resource/group/version/scope checks, including wildcard-order behavior.'), v('537-553', 'Required and supported operations.'), v('947-961', 'Resource-name path segments and duplicates.'), source(defaultsFile, '83-88', 'Rule scope defaults to *.'), runtime('policy/matching/matching.go', '87-110', 'Exclusions precede inclusions.'), runtime('policy/matching/matching.go', '124-194', 'Rule alternatives, names and equivalent versions.'), runtime('policy/validating/typechecking.go', '336-369', 'Wildcard groups/versions/resources are excluded from type-check candidates.')]);
}

function validations(path) {
  const field = path.split('.').at(-1);
  const table = {
    validations: ['Apply boolean CEL assertions to each selected request and parameter.', 'Empty validations is accepted only if auditAnnotations contains at least one valid item.', '[] is accepted only for an audit-annotation policy.', 'Reject a retained item with an empty expression, compilation error or invalid message/reason.'],
    'validations[]': ['Define a boolean assertion and optional failure details.', 'Removing an item removes that assertion; validations and auditAnnotations cannot both become empty.', '{} is rejected because expression is empty.', 'The expression must compile as bool. Optional message fields and reason have separate checks.'],
    expression: ['Test one admission condition. Without a superseding overall message/audit-filter error, true satisfies it and false invokes binding actions.', 'An omitted expression is empty and rejected.', 'An empty or whitespace-only expression is rejected.', 'Syntax/type errors and non-bool result types reject create/update. Runtime property/null/cost errors use failurePolicy.'],
    message: ['Supply a static message when this assertion fails.', 'No static message is supplied; use messageExpression if usable, otherwise the runtime failed-expression fallback.', 'An empty string is accepted as absent. A nonempty whitespace-only string is rejected.', 'A trimmed static message containing CR or LF is rejected. The validator does not enforce the type-comment requirement for message when expression is multiline.'],
    messageExpression: ['Compute the failure message as a CEL string.', 'No dynamic message is used.', 'An empty string is accepted as absent; a nonempty whitespace-only string is rejected.', 'The expression must compile as string; authorizer is unavailable. Runtime internal/cost errors can create a policy error; other unusable results fall back to the static message or failed-expression text.'],
    reason: ['Choose the machine-readable reason and HTTP status for a false assertion.', 'An absent pointer causes the runtime reason Invalid.', 'An explicit empty string is rejected.', 'The implementation accepts Forbidden, Invalid and RequestEntityTooLarge. Unauthorized, though listed by the v1 type description, is rejected.'],
  };
  const values = table[field];
  return semantics(...values,
    [environment, updateEnvironment, supersedingFilterErrors, 'The admission compiler uses dynamic object types. Separate controller type checking reports warnings for selected resource schemas and does not change enforcement; its warnings are not proof that every wildcard or alternative was checked.', 'Validation and message expressions share composed variables. Message expressions have no authorizer; do not expose information through the response message without an appropriate policy.'],
    [...filterErrorCases(), c('true', `the expression evaluates true and ${assertionOutcomeCondition}`, 'Return ActionAdmit for this assertion. Other assertion decisions, individual audit errors and admission components can still affect the request.'), c('false', `the expression evaluates false and ${assertionOutcomeCondition}`, 'Apply binding validationActions even if failurePolicy is Ignore.'), c('multiline-without-message', 'expression contains a line break, message is absent and the expression otherwise compiles', 'The validator tests trimmed message for line breaks in both branches; it does not test expression here. Therefore no required-message error is produced by this branch.'), c('dynamic-message-fallback', 'a false assertion reaches message selection without a superseding overall message/audit-filter error, and its individual message result is null, has an ordinary evaluation error, or is blank, over 5120 bytes or contains LF after TrimSpace', 'Use trimmed static message if present; otherwise emit failed expression: followed by the trimmed expression.'), c('dynamic-edge-LF', 'a false assertion reaches message selection, the successful individual message result is \"\\nhello\\n\", and no overall message/audit-filter error supersedes it', 'TrimSpace produces hello before LF and size checks. Use hello as the dynamic failure message.'), c('dynamic-raw-long-trimmed-short', 'a false assertion reaches message selection, its successfully evaluated dynamic string exceeds 5120 bytes only because of surrounding whitespace, its trimmed content is nonempty and at most 5120 bytes with no LF, and no overall message/audit-filter error supersedes it', 'The size check uses the trimmed content, so this string is usable as the dynamic failure message.'), c('static-edge-linebreak', 'a static message has CR or LF only at its edges, and its trimmed content is nonempty with no internal line break', 'The validator checks the trimmed message and accepts this branch. If the static message is selected for a false assertion and no overall message/audit-filter error supersedes that result, runtime emits the trimmed static message.'), c('dynamic-internal-CR', 'a dynamic message contains an internal CR but no LF and otherwise passes the size/nonblank checks', 'The runtime message check tests LF only; it does not reject this CR through that branch, unlike the static-message validator.'), c('dynamic-message-budget', 'the assertion has no individual evaluation error and the overall message filter reports ErrInternal or ErrOutOfBudget', 'Preempt assertion truth with an error decision: Ignore gives ActionAdmit; Fail gives ActionDeny for binding actions. This is separate from an individual message error that falls back.'), c('reason-Unauthorized', 'reason is Unauthorized', 'Reject the policy, despite the v1 type comment listing this reason.')],
    [...filterErrorEvidence(), source('staging/src/k8s.io/apiserver/pkg/apis/cel/config.go', '42-44', 'Evaluated dynamic failure messages have a 5 * 1024 byte limit.'), v('1164-1167', 'Static message checks use the actual CR/LF regexp.'), v('1034-1061', 'Assertion/message validation and multiline implementation discrepancy.'), v('509-513', 'Implementation-supported reasons.'), v('1087-1125', 'CEL environment and authorizer options.'), runtime('policy/validating/interface.go', '38-47', 'Boolean assertion result type.'), runtime('policy/validating/validator.go', '131-202', 'False/error decisions and exact message fallbacks.'), runtime('policy/validating/typechecking.go', '108-175', 'Type-check warnings and schema-resolution limits.'), t('349-381', 'Published static/dynamic message and reason descriptions.')]);
}

function variables(path) {
  const field = path.split('.').at(-1);
  const values = field === 'name' ? ['Name a composed CEL value exposed as variables.<name>.', 'An absent name is empty and rejected.', 'Empty or whitespace-only names are rejected.', 'Names must match [_a-zA-Z][_a-zA-Z0-9]* and not be a CEL reserved word. The v1 contract requires unique names; this validator has no duplicate-name check.']
    : field === 'expression' ? ['Compute a composed value when another expression first uses it.', 'An absent expression is empty and rejected.', 'Empty or whitespace-only expressions are rejected.', 'Compile errors reject the variable. References to a later variable or cyclic references cannot use a not-yet-declared field.']
      : ['Define composed values in dependency order for other policy expressions.', 'An absent list defines no composed values.', path.endsWith('[]') ? '{} is rejected because name and expression are empty.' : '[] defines no composed values.', 'Every item needs a valid name and a nonempty compilable expression. Preserve unique names and dependency order required by the v1 contract.'];
  return semantics(...values,
    [environment, 'Variable create checks use NewExpressions. On update, a variable expression uses StoredExpressions only if its exact string equals an old validation expression; old variable expressions are not collected by findValidatingPolicyPreexistingExpressions. Runtime compiles persisted variables in StoredExpressions.', 'Variable compilation occurs in list order; earlier declarations are available to later ones. Values are evaluated lazily. The runtime compiler stores compiled variables by name; a later duplicate overwrites the earlier entry.', 'The v1 contract excludes variables from matchConditions. Create validation uses a stateless compiler for those conditions. Runtime compilePolicy instead gives matchConditions the composition compiler; do not rely on this runtime discrepancy to author a policy that create validation rejects.'],
    [c('earlier-reference', 'a variable expression references an earlier valid variable', 'Its declaration is available during compilation.'), c('later-reference', 'a variable references a field only declared later', 'Compilation cannot resolve that field at this point and rejects the expression.'), c('duplicate-name', 'two independently compilable variables have the same valid name', 'validateVariable does not reject duplication. CompileAndStoreVariable overwrites that name in CompiledVariables; this conflicts with the v1 unique-name contract.'), c('unused-value', 'no expression accesses the variable', 'The lazy runtime value is not evaluated, although its definition is compiled.'), c('match-condition-variable', 'a new matchCondition refers to variables', 'Stateless create validation does not declare variables. Runtime compilation of a persisted policy uses composition; this is an implementation discrepancy, not a supported create bypass.')],
    [v('999-1031', 'Variable validation and ordered compilation.'), v('309-324', 'The old expression set includes validations, messages, match conditions and audit values, not variables.'), v('1329-1347', 'Identifier regexp and actual reserved-word set.'), runtime('cel/composition.go', '93-111', 'Ordered storage and duplicate overwrite.'), runtime('cel/composition.go', '172-189', 'Lazy map creation and callback binding.'), runtime('cel/composition.go', '208-231', 'Variable runtime errors and cost accounting.'), runtime('policy/validating/plugin.go', '113-140', 'Runtime composition compiler for match conditions.'), t('277-295', 'Declared dependency order and match-condition exclusion.')]);
}

function matchConditions(path) {
  const field = path.split('.').at(-1);
  const values = field === 'name' ? ['Identify this condition for merge and diagnostic output.', 'An absent name is rejected.', 'An empty name is rejected.', 'Use a qualified name; duplicate nonempty names in the list are rejected.']
    : field === 'expression' ? ['Filter a selected request with a boolean CEL condition before assertions.', 'An absent expression is rejected.', 'An empty or whitespace-only expression is rejected.', 'Create/update compilation requires bool and the available stateless environment. Syntax, type or undeclared-variable errors reject it.']
      : ['Require boolean preconditions before policy assertions are evaluated.', 'An absent list imposes no preconditions.', path.endsWith('[]') ? '{} is rejected because name and expression are empty.' : '[] imposes no preconditions.', 'At most 64 conditions are accepted; each needs a unique qualified name and nonempty boolean expression.'];
  return semantics(...values,
    ['Create validation declares object, oldObject, request, namespaceObject and authorizer; params is available when paramKind exists. It does not declare composed variables.', 'The matcher supplies nil namespaceObject at runtime. Do not use namespaceObject as if it held the request namespace here.', 'Unchanged matchConditions with unchanged paramKind skip match-condition validation on update. Changed conditions use NewExpressions unless their expression string already occurred in the old policy.', 'Conditions run after policy/binding resource matching and once per selected parameter. Any false result skips this evaluation; errors with no false result use failurePolicy.'],
    [c('any-false', 'at least one condition evaluates false', 'Skip the evaluation, including when another condition reports an individual evaluation error.'), c('all-true', 'all conditions evaluate true', 'Proceed to assertions and audit expressions.'), c('error-Fail', 'an individual evaluation error occurs, no condition is false, and failurePolicy is Fail', 'Return an error decision; the validator passes it to binding actions.'), c('error-Ignore', 'an error occurs and failurePolicy is Ignore', 'Skip this evaluation.'), c('filter-error', 'the condition evaluator returns an overall internal/budget error', 'Fail returns an error before iterating individual results; Ignore skips. The false-before-error rule cannot be inferred for unavailable results.')],
    [v('964-996', 'Condition count, names and expressions.'), v('620-629', 'Unchanged update bypass.'), v('1100-1113', 'Stateless compiler options.'), runtime('webhook/matchconditions/matcher.go', '80-144', 'Runtime nil namespace, false/error ordering and filter errors.'), runtime('policy/validating/validator.go', '94-115', 'Match-condition outcomes enter validator decisions.')]);
}

function auditAnnotations(path) {
  const field = path.split('.').at(-1);
  const values = field === 'key' ? ['Name an annotation published as <policy-name>/<key>.', 'An absent key is empty and rejected.', 'An empty key is rejected.', 'The combined policy name/key must be a qualified name. Duplicate keys reject the policy. This validator checks the concrete metadata.name at its receiving boundary. Name generation before that boundary is a separate create operation; this condition is not a ban on authored generateName.']
    : field === 'valueExpression' ? ['Compute an audit value as a CEL string or null.', 'An absent expression is empty and rejected.', 'Empty or whitespace-only expressions are rejected. An evaluated null or blank string omits the annotation.', 'The trimmed expression must be at most 5120 bytes and compile to string or null. Evaluation errors use failurePolicy.']
      : ['Produce request audit annotations in addition to, or instead of, assertions.', 'An absent list is valid only if validations contains at least one item.', path.endsWith('[]') ? '{} is rejected because key and valueExpression are empty.' : '[] is valid only if validations is nonempty.', 'At most 20 annotations are accepted; keys must be unique, and each expression must be valid.'];
  return semantics(...values,
    [environment, updateEnvironment, 'Audit expression creation/runtime compilation declares authorizer, but runtime audit evaluation does not supply an authorizer binding. An expression that uses it can therefore fail at runtime; do not assume compile acceptance proves an available authorizer.', 'Unique values from matching bindings and parameters are collected and joined with comma-space. Each result is truncated to 10240 bytes before collection; the joined annotation can exceed that per-result limit.', 'With Fail, individual audit expression errors append a direct denial independently of binding validationActions. Overall audit-filter errors instead replace all computed assertion decisions with one error decision for binding action mapping; Ignore can therefore admit this evaluation even after a false assertion. Ignore omits failed annotation results. Audit storage and another component using the same key remain separate boundaries.'],
    [c('null-result', 'valueExpression evaluates null', 'Do not publish this result.'), c('blank-result', 'valueExpression evaluates a string that is blank after trimming', 'Do not publish this result.'), c('long-result', 'a nonempty evaluated string exceeds 10240 bytes', 'Truncate that result before collecting it.'), c('distinct-values', 'multiple evaluations produce different nonempty values', 'Deduplicate and join the values; publish under policyName/key.'), c('individual-error', 'one audit expression result contains an error', 'Ignore excludes it; Fail adds a direct denied decision.'), c('filter-error', 'the audit evaluator reports an overall error', 'Replace all already computed assertion decisions with one policy error decision. Ignore returns ActionAdmit even after a false assertion; Fail returns ActionDeny for binding actions, unlike an individual audit error.'), c('authorizer', 'valueExpression uses authorizer', 'Compilation enables the declaration, but the runtime audit filter receives only parameters; evaluate this as a source-visible availability discrepancy.')],
    [v('753-759', 'Audit count limit is 20 and the trimmed audit expression limit is 5 * 1024 bytes.'), v('815-828', 'Count and key uniqueness.'), v('1128-1162', 'Combined key, expression size/type and authorizer declaration.'), source('staging/src/k8s.io/apiserver/pkg/registry/rest/create.go', '108-129', 'BeforeCreate requires a generated concrete name before strategy validation.'), runtime('policy/validating/interface.go', '52-61', 'String or null result type.'), runtime('policy/validating/validator.go', '194-249', 'Audit runtime binding, result and error behavior.'), runtime('cel/activation.go', '44-55', 'No authorizer value is created without a supplied binding.'), runtime('cel/activation.go', '88-105', 'Unavailable authorizer name returns no resolved value.'), runtime('policy/validating/dispatcher.go', '257-278', 'Per-result truncation and direct error denial.'), runtime('policy/validating/dispatcher.go', '330-374', 'Value collection and publication.')]);
}

function authored(kind, path) {
  if (path === '$.spec') return kind === 'ValidatingAdmissionPolicy' ? policyRoot() : bindingRoot();
  if (path.includes('.paramKind')) return paramKind(path);
  if (path.endsWith('.failurePolicy')) return failurePolicy();
  if (path.includes('.validationActions')) return actions();
  if (path.endsWith('.policyName')) return semantics('Name the cluster-scoped policy this binding activates.', 'Omitted policyName is empty and rejected.', 'An empty string is rejected.', 'Use a DNS subdomain policy name. Existence is not required by syntax validation.', ['Parameter-reference authorization can require broader permissions when this policy cannot be fetched or its parameter type cannot be resolved.'], [c('missing-policy', 'no policy exists with this name', 'The policy source skips this binding name; it creates no evaluation hook.'), c('retarget', 'policyName changes', 'Later policy refresh attaches the binding to the new policy. A supplied paramRef requires the changed-reference authorization check.')], [v('1184-1195', 'Name syntax and child checks.'), runtime('policy/generic/policy_source.go', '270-320', 'Missing policy names are skipped.'), source('pkg/registry/admissionregistration/validatingadmissionpolicybinding/authz.go', '43-62', 'Retargeting participates in authorization.')]);
  if (path.includes('.namespaceSelector') || path.includes('.objectSelector') || path.includes('.paramRef.selector')) return selector(path);
  if (path.includes('.paramRef')) return paramRef(path);
  if (path.includes('.resourceRules') || path.includes('.excludeResourceRules')) return rules(kind, path);
  if (path.endsWith('.matchPolicy')) return matchPolicy();
  if (path === '$.spec.matchConstraints' || path === '$.spec.matchResources') return matchResources(kind, path);
  if (path.includes('.validations')) return validations(path);
  if (path.includes('.variables')) return variables(path);
  if (path.includes('.matchConditions')) return matchConditions(path);
  if (path.includes('.auditAnnotations')) return auditAnnotations(path);
  throw new Error(`Admission receiver explanation missing: ${kind} ${path}`);
}

const pointer = (path) => /\.(?:paramKind|paramRef|matchConstraints|matchResources|namespaceSelector|objectSelector|selector|failurePolicy|matchPolicy|scope|reason|parameterNotFoundAction)$/u.test(path);
const routeEvidence = [
  { url: 'https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/scripts/deploy.sh#L1222', claim: 'Deployment delegates the namespace fence to the broker Helm release.' },
  { url: 'https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/charts/kubeclaw/templates/buster-namespace-fence.yaml#L1-L43', claim: 'Broker/role/version conditions, generated policy identity, CREATE/DELETE selection and Fail/Deny binding.' },
  { url: 'https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/my-values/infra/buster-namespace-fence.yaml#L15-L44', claim: 'Separate raw baseline includes UPDATE and an old-ownership check.' },
  { url: 'https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/my-values/infra/buster-namespace-fence.yaml#L79-L110', claim: 'Raw baseline adds a separate ownership-label policy and binding; file existence does not prove selection.' },
];
const decoderEvidence = source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go', '991-1004', 'JSON null clears pointers/maps/slices and has no effect on other value types.');
// Static receiver declarations, checked against pinned Go fields and element types.
// This table is operational decode evidence; it contains no schema nodes.
const receiverDeclarationGroups = [
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "148", "ValidatingAdmissionPolicySpec", ["ValidatingAdmissionPolicy $.spec"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "218", "*ParamKind", ["ValidatingAdmissionPolicy $.spec.paramKind"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "301", "string", ["ValidatingAdmissionPolicy $.spec.paramKind.apiVersion"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "305", "string", ["ValidatingAdmissionPolicy $.spec.paramKind.kind"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "225", "*MatchResources", ["ValidatingAdmissionPolicy $.spec.matchConstraints"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "644", "*metav1.LabelSelector", ["ValidatingAdmissionPolicy $.spec.matchConstraints.namespaceSelector", "ValidatingAdmissionPolicyBinding $.spec.matchResources.namespaceSelector"]],
  ["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go", "1277", "map[string]string", ["ValidatingAdmissionPolicy $.spec.matchConstraints.namespaceSelector.matchLabels", "ValidatingAdmissionPolicy $.spec.matchConstraints.objectSelector.matchLabels", "ValidatingAdmissionPolicyBinding $.spec.paramRef.selector.matchLabels", "ValidatingAdmissionPolicyBinding $.spec.matchResources.namespaceSelector.matchLabels", "ValidatingAdmissionPolicyBinding $.spec.matchResources.objectSelector.matchLabels"]],
  ["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go", "1277", "string", ["ValidatingAdmissionPolicy $.spec.matchConstraints.namespaceSelector.matchLabels[<exact-key>]", "ValidatingAdmissionPolicy $.spec.matchConstraints.objectSelector.matchLabels[<exact-key>]", "ValidatingAdmissionPolicyBinding $.spec.paramRef.selector.matchLabels[<exact-key>]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.namespaceSelector.matchLabels[<exact-key>]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.objectSelector.matchLabels[<exact-key>]"]],
  ["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go", "1281", "[]LabelSelectorRequirement", ["ValidatingAdmissionPolicy $.spec.matchConstraints.namespaceSelector.matchExpressions", "ValidatingAdmissionPolicy $.spec.matchConstraints.objectSelector.matchExpressions", "ValidatingAdmissionPolicyBinding $.spec.paramRef.selector.matchExpressions", "ValidatingAdmissionPolicyBinding $.spec.matchResources.namespaceSelector.matchExpressions", "ValidatingAdmissionPolicyBinding $.spec.matchResources.objectSelector.matchExpressions"]],
  ["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go", "1281", "LabelSelectorRequirement", ["ValidatingAdmissionPolicy $.spec.matchConstraints.namespaceSelector.matchExpressions[]", "ValidatingAdmissionPolicy $.spec.matchConstraints.objectSelector.matchExpressions[]", "ValidatingAdmissionPolicyBinding $.spec.paramRef.selector.matchExpressions[]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.namespaceSelector.matchExpressions[]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.objectSelector.matchExpressions[]"]],
  ["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go", "1288", "string", ["ValidatingAdmissionPolicy $.spec.matchConstraints.namespaceSelector.matchExpressions[].key", "ValidatingAdmissionPolicy $.spec.matchConstraints.objectSelector.matchExpressions[].key", "ValidatingAdmissionPolicyBinding $.spec.paramRef.selector.matchExpressions[].key", "ValidatingAdmissionPolicyBinding $.spec.matchResources.namespaceSelector.matchExpressions[].key", "ValidatingAdmissionPolicyBinding $.spec.matchResources.objectSelector.matchExpressions[].key"]],
  ["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go", "1291", "LabelSelectorOperator", ["ValidatingAdmissionPolicy $.spec.matchConstraints.namespaceSelector.matchExpressions[].operator", "ValidatingAdmissionPolicy $.spec.matchConstraints.objectSelector.matchExpressions[].operator", "ValidatingAdmissionPolicyBinding $.spec.paramRef.selector.matchExpressions[].operator", "ValidatingAdmissionPolicyBinding $.spec.matchResources.namespaceSelector.matchExpressions[].operator", "ValidatingAdmissionPolicyBinding $.spec.matchResources.objectSelector.matchExpressions[].operator"]],
  ["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go", "1298", "[]string", ["ValidatingAdmissionPolicy $.spec.matchConstraints.namespaceSelector.matchExpressions[].values", "ValidatingAdmissionPolicy $.spec.matchConstraints.objectSelector.matchExpressions[].values", "ValidatingAdmissionPolicyBinding $.spec.paramRef.selector.matchExpressions[].values", "ValidatingAdmissionPolicyBinding $.spec.matchResources.namespaceSelector.matchExpressions[].values", "ValidatingAdmissionPolicyBinding $.spec.matchResources.objectSelector.matchExpressions[].values"]],
  ["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go", "1298", "string", ["ValidatingAdmissionPolicy $.spec.matchConstraints.namespaceSelector.matchExpressions[].values[]", "ValidatingAdmissionPolicy $.spec.matchConstraints.objectSelector.matchExpressions[].values[]", "ValidatingAdmissionPolicyBinding $.spec.paramRef.selector.matchExpressions[].values[]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.namespaceSelector.matchExpressions[].values[]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.objectSelector.matchExpressions[].values[]"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "657", "*metav1.LabelSelector", ["ValidatingAdmissionPolicy $.spec.matchConstraints.objectSelector", "ValidatingAdmissionPolicyBinding $.spec.matchResources.objectSelector"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "662", "[]NamedRuleWithOperations", ["ValidatingAdmissionPolicy $.spec.matchConstraints.resourceRules", "ValidatingAdmissionPolicyBinding $.spec.matchResources.resourceRules"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "662", "NamedRuleWithOperations", ["ValidatingAdmissionPolicy $.spec.matchConstraints.resourceRules[]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.resourceRules[]"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "710", "[]string", ["ValidatingAdmissionPolicy $.spec.matchConstraints.resourceRules[].resourceNames", "ValidatingAdmissionPolicy $.spec.matchConstraints.excludeResourceRules[].resourceNames", "ValidatingAdmissionPolicyBinding $.spec.matchResources.resourceRules[].resourceNames", "ValidatingAdmissionPolicyBinding $.spec.matchResources.excludeResourceRules[].resourceNames"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "710", "string", ["ValidatingAdmissionPolicy $.spec.matchConstraints.resourceRules[].resourceNames[]", "ValidatingAdmissionPolicy $.spec.matchConstraints.excludeResourceRules[].resourceNames[]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.resourceRules[].resourceNames[]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.excludeResourceRules[].resourceNames[]"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "1124", "[]OperationType", ["ValidatingAdmissionPolicy $.spec.matchConstraints.resourceRules[].operations", "ValidatingAdmissionPolicy $.spec.matchConstraints.excludeResourceRules[].operations", "ValidatingAdmissionPolicyBinding $.spec.matchResources.resourceRules[].operations", "ValidatingAdmissionPolicyBinding $.spec.matchResources.excludeResourceRules[].operations"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "1124", "OperationType", ["ValidatingAdmissionPolicy $.spec.matchConstraints.resourceRules[].operations[]", "ValidatingAdmissionPolicy $.spec.matchConstraints.excludeResourceRules[].operations[]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.resourceRules[].operations[]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.excludeResourceRules[].operations[]"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "30", "[]string", ["ValidatingAdmissionPolicy $.spec.matchConstraints.resourceRules[].apiGroups", "ValidatingAdmissionPolicy $.spec.matchConstraints.excludeResourceRules[].apiGroups", "ValidatingAdmissionPolicyBinding $.spec.matchResources.resourceRules[].apiGroups", "ValidatingAdmissionPolicyBinding $.spec.matchResources.excludeResourceRules[].apiGroups"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "30", "string", ["ValidatingAdmissionPolicy $.spec.matchConstraints.resourceRules[].apiGroups[]", "ValidatingAdmissionPolicy $.spec.matchConstraints.excludeResourceRules[].apiGroups[]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.resourceRules[].apiGroups[]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.excludeResourceRules[].apiGroups[]"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "36", "[]string", ["ValidatingAdmissionPolicy $.spec.matchConstraints.resourceRules[].apiVersions", "ValidatingAdmissionPolicy $.spec.matchConstraints.excludeResourceRules[].apiVersions", "ValidatingAdmissionPolicyBinding $.spec.matchResources.resourceRules[].apiVersions", "ValidatingAdmissionPolicyBinding $.spec.matchResources.excludeResourceRules[].apiVersions"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "36", "string", ["ValidatingAdmissionPolicy $.spec.matchConstraints.resourceRules[].apiVersions[]", "ValidatingAdmissionPolicy $.spec.matchConstraints.excludeResourceRules[].apiVersions[]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.resourceRules[].apiVersions[]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.excludeResourceRules[].apiVersions[]"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "54", "[]string", ["ValidatingAdmissionPolicy $.spec.matchConstraints.resourceRules[].resources", "ValidatingAdmissionPolicy $.spec.matchConstraints.excludeResourceRules[].resources", "ValidatingAdmissionPolicyBinding $.spec.matchResources.resourceRules[].resources", "ValidatingAdmissionPolicyBinding $.spec.matchResources.excludeResourceRules[].resources"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "54", "string", ["ValidatingAdmissionPolicy $.spec.matchConstraints.resourceRules[].resources[]", "ValidatingAdmissionPolicy $.spec.matchConstraints.excludeResourceRules[].resources[]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.resourceRules[].resources[]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.excludeResourceRules[].resources[]"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "66", "*ScopeType", ["ValidatingAdmissionPolicy $.spec.matchConstraints.resourceRules[].scope", "ValidatingAdmissionPolicy $.spec.matchConstraints.excludeResourceRules[].scope", "ValidatingAdmissionPolicyBinding $.spec.matchResources.resourceRules[].scope", "ValidatingAdmissionPolicyBinding $.spec.matchResources.excludeResourceRules[].scope"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "667", "[]NamedRuleWithOperations", ["ValidatingAdmissionPolicy $.spec.matchConstraints.excludeResourceRules", "ValidatingAdmissionPolicyBinding $.spec.matchResources.excludeResourceRules"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "667", "NamedRuleWithOperations", ["ValidatingAdmissionPolicy $.spec.matchConstraints.excludeResourceRules[]", "ValidatingAdmissionPolicyBinding $.spec.matchResources.excludeResourceRules[]"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "683", "*MatchPolicyType", ["ValidatingAdmissionPolicy $.spec.matchConstraints.matchPolicy", "ValidatingAdmissionPolicyBinding $.spec.matchResources.matchPolicy"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "232", "[]Validation", ["ValidatingAdmissionPolicy $.spec.validations"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "232", "Validation", ["ValidatingAdmissionPolicy $.spec.validations[]"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "351", "string", ["ValidatingAdmissionPolicy $.spec.validations[].expression"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "360", "string", ["ValidatingAdmissionPolicy $.spec.validations[].message"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "368", "*metav1.StatusReason", ["ValidatingAdmissionPolicy $.spec.validations[].reason"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "380", "string", ["ValidatingAdmissionPolicy $.spec.validations[].messageExpression"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "248", "*FailurePolicyType", ["ValidatingAdmissionPolicy $.spec.failurePolicy"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "256", "[]AuditAnnotation", ["ValidatingAdmissionPolicy $.spec.auditAnnotations"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "256", "AuditAnnotation", ["ValidatingAdmissionPolicy $.spec.auditAnnotations[]"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "413", "string", ["ValidatingAdmissionPolicy $.spec.auditAnnotations[].key"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "430", "string", ["ValidatingAdmissionPolicy $.spec.auditAnnotations[].valueExpression"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "278", "[]MatchCondition", ["ValidatingAdmissionPolicy $.spec.matchConditions"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "278", "MatchCondition", ["ValidatingAdmissionPolicy $.spec.matchConditions[]"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "1221", "string", ["ValidatingAdmissionPolicy $.spec.matchConditions[].name"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "1236", "string", ["ValidatingAdmissionPolicy $.spec.matchConditions[].expression"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "292", "[]Variable", ["ValidatingAdmissionPolicy $.spec.variables"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "292", "Variable", ["ValidatingAdmissionPolicy $.spec.variables[]"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "389", "string", ["ValidatingAdmissionPolicy $.spec.variables[].name"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "393", "string", ["ValidatingAdmissionPolicy $.spec.variables[].expression"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "455", "ValidatingAdmissionPolicyBindingSpec", ["ValidatingAdmissionPolicyBinding $.spec"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "477", "string", ["ValidatingAdmissionPolicyBinding $.spec.policyName"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "484", "*ParamRef", ["ValidatingAdmissionPolicyBinding $.spec.paramRef"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "550", "string", ["ValidatingAdmissionPolicyBinding $.spec.paramRef.name"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "568", "string", ["ValidatingAdmissionPolicyBinding $.spec.paramRef.namespace"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "580", "*metav1.LabelSelector", ["ValidatingAdmissionPolicyBinding $.spec.paramRef.selector"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "592", "*ParameterNotFoundActionType", ["ValidatingAdmissionPolicyBinding $.spec.paramRef.parameterNotFoundAction"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "492", "*MatchResources", ["ValidatingAdmissionPolicyBinding $.spec.matchResources"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "534", "[]ValidationAction", ["ValidatingAdmissionPolicyBinding $.spec.validationActions"]],
  ["staging/src/k8s.io/api/admissionregistration/v1/types.go", "534", "ValidationAction", ["ValidatingAdmissionPolicyBinding $.spec.validationActions[]"]],
];
const receiverDeclarations = new Map(receiverDeclarationGroups.flatMap(([file, lines, goType, keys]) => keys.map(key => [key, { file, lines, goType }])));
const decoderFile = 'vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go';
function typedDecodeEvidence(kind, fieldPath) {
  const declared = receiverDeclarations.get(`${kind} ${fieldPath.replace('["*"]', '[<exact-key>]')}`);
  if (!declared) throw new Error(`Receiver declaration missing: ${kind} ${fieldPath}`);
  return [
    source(declared.file, declared.lines, `Receiver Go declaration supplies ${declared.goType}${fieldPath.endsWith('[]') || fieldPath.endsWith('["*"]') ? ' as the retained element type' : ''}.`),
    source(decoderFile, '383-420', 'Value dispatch sends array, object and literal tokens to the corresponding typed decoder.'),
    source(decoderFile, '448-524', 'Pointer traversal allocates non-null targets and stops at a settable pointer for null.'),
    source(decoderFile, '535-560', 'Array tokens require an array or slice target; incompatible kinds record UnmarshalTypeError.'),
    source(decoderFile, '660-682', 'Object decoding accepts string-key maps and allocates nil maps.'),
    source(decoderFile, '697-732', 'Object decoding accepts structs and rejects incompatible target kinds.'),
    source(decoderFile, '1011-1026', 'Boolean tokens reject these non-boolean receiver kinds.'),
    source(decoderFile, '1028-1063', 'String tokens set string kinds; other receiver kinds reject them, including non-byte slices.'),
    source(decoderFile, '1065-1083', 'Number tokens reject these receiver kinds; their named string types are not json.Number.'),
    source(decoderFile, '174-197', 'The top-level decoder returns recorded type errors; partially filled objects are not successful decode results.'),
    ...(fieldPath.includes('[]') || /\.(?:validations|auditAnnotations|variables|matchConditions|validationActions|resourceRules|excludeResourceRules|apiGroups|apiVersions|operations|resources|resourceNames|matchExpressions|values)$/u.test(fieldPath) ? [source(decoderFile, '568-625', 'Array iteration grows slices, decodes each retained element and finalizes its length; null elements are not removed by this branch.')] : []),
    ...(fieldPath.includes('.matchLabels') ? [source(decoderFile, '765-776', 'Map decoding uses a fresh or zeroed element temporary for each key.'), source(decoderFile, '849-857', 'Map value decoding is followed by a write-back branch.'), source(decoderFile, '893-895', 'The decoded temporary is inserted for the retained key, including its zero string after null.')] : []),
  ];
}

const namedStringEvidence = [t('71-71', 'ScopeType has string kind.'), t('85-85', 'FailurePolicyType has string kind.'), t('96-96', 'ParameterNotFoundActionType has string kind.'), t('108-108', 'MatchPolicyType has string kind.'), t('688-688', 'ValidationAction has string kind.'), t('1132-1132', 'OperationType has string kind.'), source('staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go', '839-839', 'StatusReason has string kind.'), source('staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go', '1302-1302', 'LabelSelectorOperator has string kind.')];

function supplementalReceiverEvidence(fieldPath) {
  const evidence = [];
  if (fieldPath === '$.spec.paramRef.name' || /\.resourceNames(?:\[\])?$/u.test(fieldPath)) {
    evidence.push(source('staging/src/k8s.io/apimachinery/pkg/api/validation/path/name.go', '24-48', 'Path-segment names reject exact dot/dot-dot and slash/percent substrings; this helper accepts an empty string.'), source('staging/src/k8s.io/apimachinery/pkg/api/validation/path/name.go', '61-68', 'ValidatePathSegmentName with prefix false calls the actual complete-name checker.'));
  }
  if (fieldPath.includes('.resourceRules') || fieldPath.includes('.excludeResourceRules')) {
    evidence.push(v('496-502', 'The supported operation set contains wildcard, CREATE, UPDATE, DELETE and CONNECT.'), v('528-535', 'hasWildcardOperation detects OperationAll before the caller rejects a wildcard combined with other items.'), t('73-81', 'Scope literals are Cluster, Namespaced and wildcard.'), t('1134-1141', 'Operation literals are wildcard, CREATE, UPDATE, DELETE and CONNECT.'));
  }
  if (fieldPath.endsWith('.failurePolicy')) evidence.push(v('474-477', 'The supported failure policy set contains Ignore and Fail.'), t('87-93', 'Failure-policy literal values are Ignore and Fail.'));
  if (fieldPath.endsWith('.matchPolicy')) evidence.push(v('479-482', 'The supported match policy set contains Exact and Equivalent.'), t('110-116', 'Match-policy literal values are Exact and Equivalent.'));
  if (fieldPath.endsWith('.parameterNotFoundAction')) evidence.push(t('98-104', 'Parameter-not-found action literals are Allow and Deny.'));
  if (fieldPath.includes('.variables')) evidence.push(source('staging/src/k8s.io/apiserver/pkg/cel/lazy/lazy.go', '48-60', 'NewMapValue creates empty caches; Append stores each callback without evaluating it.'), source('staging/src/k8s.io/apiserver/pkg/cel/lazy/lazy.go', '116-149', 'Find and Get resolve a field on access; resolveField invokes its callback once and caches the result.'));
  return evidence;
}

function record(kind, fieldPath) {
  const meaning = authored(kind, fieldPath);
  // These are receiver Go decode categories, not schema type assertions.
  const collection = /\.(?:validations|auditAnnotations|variables|matchConditions|validationActions|resourceRules|excludeResourceRules|apiGroups|apiVersions|operations|resources|resourceNames|matchExpressions|values)$/u.test(fieldPath);
  const map = fieldPath.endsWith('.matchLabels');
  const struct = fieldPath === '$.spec' || /\.(?:validations|auditAnnotations|variables|matchConditions|resourceRules|excludeResourceRules|matchExpressions)\[\]$/u.test(fieldPath);
  const nullValue = pointer(fieldPath)
    ? `On fresh typed decode, null produces a nil pointer. ${meaning.omitted} This is a decoder/defaulting outcome, not an OpenAPI nullable permission.`
    : collection || map
      ? `On fresh typed decode, null gives a nil ${collection ? 'slice' : 'map'}; the receiver observes an empty collection. ${meaning.omitted} Retained parent/item requirements still apply.`
      : `JSON null has no effect on this nonpointer ${struct ? 'struct' : 'value'} during typed decode. In a fresh object it retains the zero value. ${fieldPath !== '$.spec' ? meaning.emptyValue : meaning.omitted} This does not prove null is accepted by schema validation or a patch/apply client.`;
  const strategy = kind === 'ValidatingAdmissionPolicy' ? 'validatingadmissionpolicy' : 'validatingadmissionpolicybinding';
  return {
    kind, fieldPath, ...meaning,
    invalidValue: `${meaning.invalidValue} A wrong JSON type fails typed decoding before this field validation; null has the separate decoder behavior stated here.`,
    receiver: `Kubernetes ${apiVersion} ${kind} create/update validation, then the ValidatingAdmissionPolicy admission plugin for later matched requests.`,
    operationScope: 'Cluster-scoped policy/binding POST create and version-checked update; supported patch/apply first constructs the complete desired object. Runtime CREATE, UPDATE, DELETE or CONNECT selection depends on the rule operations. A rejected policy update does not replace the stored policy. Correct its named receiver error, retain the authorized owner and retry the intended update after checking current resourceVersion.',
    nullValue,
    changeImpact: 'A valid spec change increments generation and updates later policy matching/evaluation after informer refresh. Changing this field can widen, narrow or alter admission decisions; inspect every matching binding and parameter before the change. It creates no workload rollout and does not repair earlier stored resources. Recovery uses an authorized, version-checked change to the owning policy/binding; confirm the observed spec and effective requests before treating the recovery as complete.',
    authoritySelector: { apiVersion, kind, fieldPath },
    evidence: [...meaning.evidence, ...supplementalReceiverEvidence(fieldPath), ...(fieldPath.includes('.paramKind') || fieldPath.endsWith('.policyName') ? [source('staging/src/k8s.io/apimachinery/pkg/util/validation/validation.go', '155-207', 'Actual DNS1123 label/subdomain grammar and checks.'), source('staging/src/k8s.io/apimachinery/pkg/util/validation/validation.go', '222-241', 'Actual DNS1035 label grammar and checks.')] : []), ...(fieldPath.includes('.matchConditions') || fieldPath.endsWith('.auditAnnotations.key') || fieldPath.endsWith('.auditAnnotations[].key') ? [source('staging/src/k8s.io/apimachinery/pkg/util/validation/validation.go', '31-36', 'Qualified-name helper delegates to content label-key validation.'), source('staging/src/k8s.io/apimachinery/pkg/api/validate/content/kube.go', '23-72', 'Actual qualified-name syntax and name-part limit.'), source('staging/src/k8s.io/apimachinery/pkg/api/validate/content/dns.go', '23-69', 'Qualified-name prefix grammar and limit.'), source('staging/src/k8s.io/apimachinery/pkg/api/validate/content/dns.go', '84-101', 'Actual qualified-name prefix check.')] : []), ...routeEvidence, decoderEvidence, ...typedDecodeEvidence(kind, fieldPath), ...namedStringEvidence, ...(fieldPath.includes('.validations') || fieldPath.includes('.variables') || fieldPath.includes('.matchConditions') || fieldPath.includes('.auditAnnotations') ? [source('staging/src/k8s.io/apiserver/pkg/apis/cel/config.go', '24-31', 'Configured assertion/audit and match-condition runtime budgets.'), runtime('policy/validating/dispatcher.go', '212-224', 'Each selected parameter evaluation receives the configured runtime budget.'), runtime('policy/validating/validator.go', '104-122', 'Messages use the remaining assertion budget.'), runtime('policy/validating/validator.go', '195-196', 'Audit expressions receive a separate budget.'), runtime('webhook/matchconditions/matcher.go', '80-85', 'Match conditions use their distinct runtime budget.')] : []), source('staging/src/k8s.io/apimachinery/pkg/runtime/serializer/json/json.go', '268-302', 'Typed serializer selects case-sensitive normal or strict JSON decoding.'), source('vendor/sigs.k8s.io/json/json.go', '60-68', 'The serializer helper delegates to the vendored JSON decoder.'), source('pkg/apis/admissionregistration/v1/zz_generated.defaults.go', kind === 'ValidatingAdmissionPolicy' ? '81-94' : '96-108', 'Typed defaulting visits this spec and every retained inclusion/exclusion rule.'), source(`pkg/registry/admissionregistration/${strategy}/strategy.go`, kind === 'ValidatingAdmissionPolicy' ? '67-80' : '71-81', 'Spec updates increment generation.'), source(`pkg/registry/admissionregistration/${strategy}/strategy.go`, kind === 'ValidatingAdmissionPolicy' ? '104-129' : '104-130', 'Version-checked update, no PUT create, and receiver authorization.'), runtime('policy/generic/policy_source.go', '172-207', 'Policy/binding informer events request refresh.')],
    qualificationLimits: [...meaning.qualificationLimits, ...behaviorLimits],
  };
}

const authoredPaths = {
  "ValidatingAdmissionPolicy": [
    "$.spec",
    "$.spec.auditAnnotations",
    "$.spec.auditAnnotations[]",
    "$.spec.auditAnnotations[].key",
    "$.spec.auditAnnotations[].valueExpression",
    "$.spec.failurePolicy",
    "$.spec.matchConditions",
    "$.spec.matchConditions[]",
    "$.spec.matchConditions[].expression",
    "$.spec.matchConditions[].name",
    "$.spec.matchConstraints",
    "$.spec.matchConstraints.excludeResourceRules",
    "$.spec.matchConstraints.excludeResourceRules[]",
    "$.spec.matchConstraints.excludeResourceRules[].apiGroups",
    "$.spec.matchConstraints.excludeResourceRules[].apiGroups[]",
    "$.spec.matchConstraints.excludeResourceRules[].apiVersions",
    "$.spec.matchConstraints.excludeResourceRules[].apiVersions[]",
    "$.spec.matchConstraints.excludeResourceRules[].operations",
    "$.spec.matchConstraints.excludeResourceRules[].operations[]",
    "$.spec.matchConstraints.excludeResourceRules[].resourceNames",
    "$.spec.matchConstraints.excludeResourceRules[].resourceNames[]",
    "$.spec.matchConstraints.excludeResourceRules[].resources",
    "$.spec.matchConstraints.excludeResourceRules[].resources[]",
    "$.spec.matchConstraints.excludeResourceRules[].scope",
    "$.spec.matchConstraints.matchPolicy",
    "$.spec.matchConstraints.namespaceSelector",
    "$.spec.matchConstraints.namespaceSelector.matchExpressions",
    "$.spec.matchConstraints.namespaceSelector.matchExpressions[]",
    "$.spec.matchConstraints.namespaceSelector.matchExpressions[].key",
    "$.spec.matchConstraints.namespaceSelector.matchExpressions[].operator",
    "$.spec.matchConstraints.namespaceSelector.matchExpressions[].values",
    "$.spec.matchConstraints.namespaceSelector.matchExpressions[].values[]",
    "$.spec.matchConstraints.namespaceSelector.matchLabels",
    "$.spec.matchConstraints.namespaceSelector.matchLabels[\"*\"]",
    "$.spec.matchConstraints.objectSelector",
    "$.spec.matchConstraints.objectSelector.matchExpressions",
    "$.spec.matchConstraints.objectSelector.matchExpressions[]",
    "$.spec.matchConstraints.objectSelector.matchExpressions[].key",
    "$.spec.matchConstraints.objectSelector.matchExpressions[].operator",
    "$.spec.matchConstraints.objectSelector.matchExpressions[].values",
    "$.spec.matchConstraints.objectSelector.matchExpressions[].values[]",
    "$.spec.matchConstraints.objectSelector.matchLabels",
    "$.spec.matchConstraints.objectSelector.matchLabels[\"*\"]",
    "$.spec.matchConstraints.resourceRules",
    "$.spec.matchConstraints.resourceRules[]",
    "$.spec.matchConstraints.resourceRules[].apiGroups",
    "$.spec.matchConstraints.resourceRules[].apiGroups[]",
    "$.spec.matchConstraints.resourceRules[].apiVersions",
    "$.spec.matchConstraints.resourceRules[].apiVersions[]",
    "$.spec.matchConstraints.resourceRules[].operations",
    "$.spec.matchConstraints.resourceRules[].operations[]",
    "$.spec.matchConstraints.resourceRules[].resourceNames",
    "$.spec.matchConstraints.resourceRules[].resourceNames[]",
    "$.spec.matchConstraints.resourceRules[].resources",
    "$.spec.matchConstraints.resourceRules[].resources[]",
    "$.spec.matchConstraints.resourceRules[].scope",
    "$.spec.paramKind",
    "$.spec.paramKind.apiVersion",
    "$.spec.paramKind.kind",
    "$.spec.validations",
    "$.spec.validations[]",
    "$.spec.validations[].expression",
    "$.spec.validations[].message",
    "$.spec.validations[].messageExpression",
    "$.spec.validations[].reason",
    "$.spec.variables",
    "$.spec.variables[]",
    "$.spec.variables[].expression",
    "$.spec.variables[].name"
  ],
  "ValidatingAdmissionPolicyBinding": [
    "$.spec",
    "$.spec.matchResources",
    "$.spec.matchResources.excludeResourceRules",
    "$.spec.matchResources.excludeResourceRules[]",
    "$.spec.matchResources.excludeResourceRules[].apiGroups",
    "$.spec.matchResources.excludeResourceRules[].apiGroups[]",
    "$.spec.matchResources.excludeResourceRules[].apiVersions",
    "$.spec.matchResources.excludeResourceRules[].apiVersions[]",
    "$.spec.matchResources.excludeResourceRules[].operations",
    "$.spec.matchResources.excludeResourceRules[].operations[]",
    "$.spec.matchResources.excludeResourceRules[].resourceNames",
    "$.spec.matchResources.excludeResourceRules[].resourceNames[]",
    "$.spec.matchResources.excludeResourceRules[].resources",
    "$.spec.matchResources.excludeResourceRules[].resources[]",
    "$.spec.matchResources.excludeResourceRules[].scope",
    "$.spec.matchResources.matchPolicy",
    "$.spec.matchResources.namespaceSelector",
    "$.spec.matchResources.namespaceSelector.matchExpressions",
    "$.spec.matchResources.namespaceSelector.matchExpressions[]",
    "$.spec.matchResources.namespaceSelector.matchExpressions[].key",
    "$.spec.matchResources.namespaceSelector.matchExpressions[].operator",
    "$.spec.matchResources.namespaceSelector.matchExpressions[].values",
    "$.spec.matchResources.namespaceSelector.matchExpressions[].values[]",
    "$.spec.matchResources.namespaceSelector.matchLabels",
    "$.spec.matchResources.namespaceSelector.matchLabels[\"*\"]",
    "$.spec.matchResources.objectSelector",
    "$.spec.matchResources.objectSelector.matchExpressions",
    "$.spec.matchResources.objectSelector.matchExpressions[]",
    "$.spec.matchResources.objectSelector.matchExpressions[].key",
    "$.spec.matchResources.objectSelector.matchExpressions[].operator",
    "$.spec.matchResources.objectSelector.matchExpressions[].values",
    "$.spec.matchResources.objectSelector.matchExpressions[].values[]",
    "$.spec.matchResources.objectSelector.matchLabels",
    "$.spec.matchResources.objectSelector.matchLabels[\"*\"]",
    "$.spec.matchResources.resourceRules",
    "$.spec.matchResources.resourceRules[]",
    "$.spec.matchResources.resourceRules[].apiGroups",
    "$.spec.matchResources.resourceRules[].apiGroups[]",
    "$.spec.matchResources.resourceRules[].apiVersions",
    "$.spec.matchResources.resourceRules[].apiVersions[]",
    "$.spec.matchResources.resourceRules[].operations",
    "$.spec.matchResources.resourceRules[].operations[]",
    "$.spec.matchResources.resourceRules[].resourceNames",
    "$.spec.matchResources.resourceRules[].resourceNames[]",
    "$.spec.matchResources.resourceRules[].resources",
    "$.spec.matchResources.resourceRules[].resources[]",
    "$.spec.matchResources.resourceRules[].scope",
    "$.spec.paramRef",
    "$.spec.paramRef.name",
    "$.spec.paramRef.namespace",
    "$.spec.paramRef.parameterNotFoundAction",
    "$.spec.paramRef.selector",
    "$.spec.paramRef.selector.matchExpressions",
    "$.spec.paramRef.selector.matchExpressions[]",
    "$.spec.paramRef.selector.matchExpressions[].key",
    "$.spec.paramRef.selector.matchExpressions[].operator",
    "$.spec.paramRef.selector.matchExpressions[].values",
    "$.spec.paramRef.selector.matchExpressions[].values[]",
    "$.spec.paramRef.selector.matchLabels",
    "$.spec.paramRef.selector.matchLabels[\"*\"]",
    "$.spec.policyName",
    "$.spec.validationActions",
    "$.spec.validationActions[]"
  ]
};

export const receiverContracts = Object.entries(authoredPaths).flatMap(([kind, paths]) =>
  paths.map((fieldPath) => ({ ...record(kind, fieldPath), ...(fieldPath.includes('["*"]') ? { matcherAlias: fieldPath, fieldPath: fieldPath.replace('["*"]', '[<exact-key>]'), authoritySelector: { apiVersion, kind, fieldPath } } : {}) })));
