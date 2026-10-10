/** Receiving contracts for the pinned Cilium 1.20.1 implementation.
 * Declarations identify fields; consumer evidence establishes the named cases.
 * This module retains no schema nodes, filesystem or network dependencies.
 * Importing it does not run admission, controllers, endpoint regeneration or traffic.
 */
const revision = '7d68cfb394f2960e10aa72e76d0d51e66c1b2ebc';
const source = (path, start, end, claim) => ({url:`https://github.com/cilium/cilium/blob/${revision}/${path}#L${start}-L${end}`,claim});
const validate = (start,end,claim) => source('pkg/policy/api/rule_validation.go',start,end,claim);
const translate = (start,end,claim) => source('pkg/policy/utils/parserules.go',start,end,claim);
const decoder = {url:'https://github.com/golang/go/blob/2dc996f71b0ebafb77e64433e58333e049488a3c/src/encoding/json/decode.go#L30-L100',claim:'Ordinary fresh JSON decoding distinguishes nil pointers, slices and maps from explicit empty collections. Null does not assign ordinary primitive values. A custom UnmarshalJSON method can replace these rules.'};
const limits = [
 'Cilium chart version and appVersion are 1.20.1; receiving source is commit 7d68cfb394f2960e10aa72e76d0d51e66c1b2ebc. The vendored client dependency is k8s.io/apimachinery v0.36.3. The separate schema authority is Kubernetes v1.35.0. These pins do not prove a deployed version, identical public API implementation paths or complete version compatibility.',
 'The generic JSON decoder proof is Go 1.26.3 source commit 2dc996f71b0ebafb77e64433e58333e049488a3c. Cilium go.mod declares Go 1.26.0 as the language/toolchain baseline; this reference does not establish the compiler used by a deployed Cilium binary.',
 'Cases describe a fresh typed object with a present immediate parent, followed by the named receiving operation. An omitted ancestor prevents reading this child. JSON merge patch, server-side apply, decode into an existing object and admission mutation have separate omission and null semantics.',
 'CRD structural pruning, defaults, validation and Kubernetes ObjectMeta handling precede agent consumption. A typed decode or Sanitize result is not an API admission result. Schema presence conditions and runtime length conditions are different checks.',
 'No live API admission, operator run, agent import, endpoint regeneration, proxy update, authentication handshake, DNS lookup or traffic exercise was performed. Source-derived cases identify implementation branches, not observed successful execution.'
];
function decoded(type,path) {
 const item=path.endsWith('[]'), member=path.endsWith('[<exact-key>]');
 const pointer=type.startsWith('*'), bare=type.replace(/^\*/, '');
 const collection=bare.startsWith('[]')?'slice':bare.startsWith('map[')?'map':null;
 const scalar=/^(string|bool|u?int(8|16|32|64)?|float(32|64))$/.test(bare);
 const zero=bare==='string'?'the empty string':bare==='bool'?'false':scalar?'zero':collection?'nil':'the zero struct';
 const omitted=item?'No element exists at this position. It does not contribute a zero element.':member?'The exact key has no entry. This differs from a present entry whose value is empty.':`The fresh field remains ${pointer?'nil':zero}. The consumer conditions determine its effect.`;
 const nullValue=(pointer||collection?`Null sets the ${pointer?'pointer':collection} to nil.`:scalar?`Null does not assign this primitive; its fresh value remains ${zero}.`:'Null has no effect on an ordinary struct. A custom decoder named below can change the result.')+(item?' The slice retains this position, with a nil pointer, primitive zero or zero struct as applicable.':member?' The map retains this key and stores its decoded zero value.':'');
 const emptyValue=collection?`A present empty ${collection==='slice'?'[]':'{}'} creates a non-nil ${collection} with zero entries. This is a container value, not an empty item or key.`:pointer?'A present value allocates the pointed-to object. Its empty or zero contents still require the receiving checks.':`The explicit empty or zero value remains ${zero}; it is not an omitted field.`;
 return {omitted,nullValue,emptyValue,invalidValue:'An incompatible JSON type returns a decode error. Custom decoders and the named consumer can add errors. API admission also applies the pinned CRD constraints; source parsing does not override them.'};
}
function family(kind,path,type) {
 const cnp=kind==='CiliumNetworkPolicy';
 const rootFile=`pkg/k8s/apis/cilium.io/v2/${cnp?'cnp':'ccnp'}_types.go`;
 const parse=source(rootFile,cnp?168:84,cnp?222:116,'Parse requires a name, rejects both nil spec fields, sanitizes each rule, translates spec first and each specs item afterwards. It returns on the first invalid rule.');
 const watcher=source('pkg/policy/k8s/cilium_network_policy.go',123,161,'The agent calls Parse before RulesToPolicyEntries and UpdatePolicy; a parse error returns before sending a policy update.');
 const r={receiver:'Cilium typed policy decoder, resource Parse, policy watcher and policy repository',effect:'The field participates in the policy object consumed by Parse. The watcher imports the complete translated rule set under the resource identity; it does not apply an isolated leaf update.',conditions:[],cases:[],evidence:[parse,watcher],extraLimits:[]};
 const add=(name,condition,sourceOutcome)=>r.cases.push({name,condition,sourceOutcome});
 if(path==='$'||path==='$.spec'||path==='$.specs'||path==='$.specs[]') {
  r.effect='Parse appends spec and then every specs rule. Neither field overrides the other. Both nil returns an empty-policy error. A non-nil empty specs list passes that nil check and returns zero rules if spec is nil. A present empty rule fails Sanitize before import.';
  r.conditions.push('A rule must contain at least one ingress, ingressDeny, egress or egressDeny item. A present direction field with [] satisfies a CRD presence alternative but does not satisfy the runtime length check. Cilium has no policyTypes field in these policy types; Kubernetes NetworkPolicy policyTypes defaults must not be applied here.');
  r.evidence.push(validate(33,108,'Rule.Sanitize rejects zero total direction items, requires exactly one non-nil subject selector and sanitizes each direction.'));
  add('zero-direction-rule','All four direction slices have zero length, including explicitly present empty arrays','Sanitize returns the at-least-one-direction error. This is an actual Cilium 1.20.1 product restriction; the Rule comment that an omitted pair has no effect does not override the implementation.');
  add('both-policy-inputs','spec and specs are both non-nil and all rules sanitize','Parse returns spec first and then all specs items. A failure in any item prevents the agent from submitting the resulting object update.');
  add('empty-rule-list','spec is nil and specs is a present empty array after fresh decoding','Parse returns an empty Rules slice without the both-nil error. UpdatePolicy receives zero translated entries; this is not evidence that an API server accepted the request.');
  add('null-rule-item','A specs array contains JSON null','The Rules element type is *Rule. The nil item is retained, and Parse calls rule.Sanitize without a nil guard. This input can panic in the typed path; do not describe it as a sanitized no-op.');
 }
 if(path.startsWith('$.status')) {
  r.receiver='Kubernetes status subresource, informational Cilium operator validator and typed status storage';
  r.effect='Status records observations. The agent watcher ignores an update with unchanged generation before policy import; status is not the desired rule input. The operator validator sanitizes a deep copy and checks configured mutual-auth support and writes the Valid condition through UpdateStatus, which does not bump generation.';
  r.evidence=[source('operator/pkg/networkpolicy/validator.go',85,127,'CNP validation joins sanitizer errors, computes conditions, avoids equal writes and updates the status subresource.'),source('operator/pkg/networkpolicy/validator.go',138,179,'CCNP follows the separate cluster-scoped status client path.'),source('pkg/policy/k8s/cilium_network_policy.go',36,44,'The agent returns early on unchanged generation and equal policy objects.')];
  r.conditions.push('Operator validation is informational and depends on validate-network-policy. A Valid=True condition proves neither agent import nor endpoint enforcement. UpdateStatus errors return to the resource event handler.');
  r.evidence.push(source('operator/pkg/networkpolicy/validator.go',46,59,'The validator registration is disabled when ValidateNetworkPolicy is false.'),source('operator/pkg/networkpolicy/validator.go',190,202,'The informational validator rejects any present allow-rule authentication when MeshAuthEnabled is false.'));
  if(path.includes('.conditions')) {
   r.effect+=' updateCondition finds the first Valid condition, preserves all other conditions, returns unchanged conditions when status and message agree, and preserves lastTransitionTime when only the message changes. It sets no Reason value on a newly constructed Valid condition.';
   r.evidence.push(source('operator/pkg/networkpolicy/validator.go',204,248,'updateCondition constructs and replaces only the Valid condition and maintains transition time.'));
   add('validation-condition','Sanitize returns one or more errors','The operator stores Valid=False and the joined error message. Sanitize and the operator mutual-auth check must both succeed to store Valid=True and the success message; no enforcement revision is inferred.');
  }
  if(path.includes('.derivativePolicies')) {
   r.effect+=' SetDerivedPolicyStatus initializes a nil map and overwrites exactly the named entry with the whole node-status value. An omitted key has no entry; an empty map has no derivative observations. The stored localPolicyRevision and enforcing flag are data, not a request to install or enforce that revision.';
   r.evidence.push(source(rootFile,cnp?156:62,cnp?163:69,'SetDerivedPolicyStatus allocates a nil derivative map and replaces one exact-key node-status value.'),source('pkg/k8s/apis/cilium.io/v2/zz_generated.deepcopy.go',2011,2048,'Generated deep-copy routines preserve node status, copy annotations and each derivative map member.'));
   r.extraLimits.push('The pinned tree exposes the derivative-status setters and retained status data model. A repository-wide call-site search found no production caller of SetDerivedPolicyStatus. The declaration comments describe historical observation meaning, but these contracts do not promise an active controller will populate or refresh derivativePolicies.');
   add('derivative-member-replacement','SetDerivedPolicyStatus is called with an existing key','The setter replaces that key with the supplied complete node-status struct. It leaves other keys intact and does not import a rule.');
  }
  return r;
 }
 if(path==='$.metadata') {
  r.receiver='Kubernetes API ObjectMeta receiving base, Cilium resource identity and agent update filtering';
  r.effect='Cilium embeds metav1.ObjectMeta from its vendored k8s.io/apimachinery v0.36.3. The CRD metadata schema is opaque in the recursive inventory, but standard metadata fields remain API inputs: name/generateName, namespace, UID, resourceVersion, generation, timestamps/deletion grace, labels, annotations, ownerReferences, finalizers and managedFields. Parse requires a name; name, namespace and UID form policy labels and resource identity. The watcher filters generation-only and equality cases.';
  r.evidence.push(source('vendor/k8s.io/apimachinery/pkg/apis/meta/v1/types.go',111,155,'ObjectMeta declares name/generateName and namespace, independent of the CRD metadata property schema.'),source('vendor/k8s.io/apimachinery/pkg/apis/meta/v1/types.go',156,206,'ObjectMeta declares UID, resourceVersion, generation and lifecycle timestamps.'),source('vendor/k8s.io/apimachinery/pkg/apis/meta/v1/types.go',229,279,'ObjectMeta declares labels, annotations, owner references and finalizers.'),source('vendor/k8s.io/apimachinery/pkg/apis/meta/v1/types.go',285,295,'ObjectMeta retains managedFields separately from policy rules.'),source('pkg/k8s/apis/cilium.io/utils/utils.go',60,80,'GetPolicyLabels uses name, namespace, UID and resource kind.'),source('pkg/policy/k8s/cilium_network_policy.go',215,225,'Resource identity distinguishes namespaced CNP from cluster-scoped CCNP.'),source('pkg/k8s/apis/cilium.io/v2/cnp_types.go',63,76,'Object metadata equality compares name/namespace and annotations while ignoring the last-applied annotation.'));
  r.conditions.push('CNP is namespaced; CCNP is cluster-scoped. The server controls generated names, UID, generation and lifecycle metadata, and resourceVersion participates in API concurrency. These server operations remain in the shared Kubernetes metadata reference; an opaque CRD property is not a waiver.');
  r.extraLimits.push('OPEN SHARED METADATA PROOF: This bare schema path does not enumerate the implicit ObjectMeta children. Field-specific create/update/status/delete admission, ownership, concurrency and finalizer cases require the canonical Kubernetes v1.35.0 receiving reference. The v0.36.3 client declarations alone do not prove those server paths or full cross-version compatibility. Owner: configuration documentation maintainer; closure requires exact pinned server evidence and independent review.');
  add('policy-name-required','The typed policy reaches Parse with an empty metadata.name','Parse returns a missing-name error. A possible API generateName flow must first establish an actual generated name; this parse check does not implement that API flow.');
  return r;
 }
 if(path==='$.apiVersion'||path==='$.kind') {
  r.receiver='Kubernetes request envelope and registered Cilium v2 typed resource decoder';
  r.effect='The envelope identifies the cilium.io/v2 resource type for API routing and typed conversion. Cilium Parse reads the already typed object and does not use kind or apiVersion to select policy semantics. API endpoint routing and kind/version validation precede this function.';
  r.conditions.push('A missing or mismatched envelope is not established as API-valid by a typed parse. CNP and CCNP use different scopes and generated clients.');
  r.evidence.push(source('pkg/k8s/apis/cilium.io/v2/register.go',220,225,'The v2 scheme registers CNP and CCNP resource and list types.'));
  return r;
 }
 // Every desired-rule descendant follows the same sanitize/translate/import sequence.
 r.evidence.push(validate(42,108,'Sanitize validates subject and directions before translating a rule.'),translate(12,47,'Ingress allow entries retain subject, direction, labels, default posture, peers, ports, authentication and log.'),source('pkg/policy/repository.go',566,605,'ReplaceByResource removes the old resource rules, inserts replacements, collects affected subjects and bumps the repository revision.'));
 r.evidence.push(source('pkg/policy/cell/policy_importer.go',107,109,'UpdatePolicy queues the update.'),source('pkg/policy/cell/policy_importer.go',239,295,'The importer allocates prefix identities before replacing resource rules and reports a repository revision before endpoint regeneration.'),source('pkg/policy/cell/policy_importer.go',320,340,'After repository updates it triggers endpoint computation/regeneration and prunes stale prefix metadata.'));
 r.evidence.push(source('pkg/policy/cell/policy_importer.go',185,204,'After startup, prefix allocation waits up to 10 seconds; timeout logs a warning and policy import continues.'));
 r.conditions.push('Prefix identity allocation precedes repository replacement. After startup the importer waits up to 10 seconds for IP-cache progress; timeout warns about possible drops and continues, rather than proving safe enforcement or rejecting the policy. Repository DoneChan reports insertion revision before endpoint regeneration.');
 r.conditions.push('Policy import is asynchronous: submitting UpdatePolicy is not proof of endpoint or datapath enforcement. Parse failure stops the new submission. Deletion submits the same resource identity with no rules and clears reference/cache indices.');
 r.evidence.push(source('pkg/policy/k8s/cilium_network_policy.go',73,91,'Delete removes resource rules and clears service and raw-policy caches.'),source('pkg/policy/k8s/cilium_network_policy.go',168,191,'Delete submits a no-rules PolicyUpdate under the resource identity.'));
 if(/\.(ingress|egress)(Deny)?(?:\[\]|$)/.test(path)) {
  const ingress=/\.ingress/.test(path),deny=/\.(ingressDeny|egressDeny)/.test(path);
  r.effect+=` The ${ingress?'ingress':'egress'} direction applies to traffic ${ingress?'entering':'leaving'} the selected subject. Its entries have ${deny?'Deny':'Allow'} verdicts. The opposite direction is evaluated independently; an end-to-end connection can require both source egress and destination ingress permission.`;
  r.evidence.push(translate(deny?(ingress?51:114):(ingress?19:82),deny?(ingress?78:139):(ingress?48:111),'RulesToPolicyEntries selects direction and the explicit allow or deny verdict.'));
  r.conditions.push('For these normal-tier Cilium policies, matching deny rules take precedence over matching allow rules. Deny rules have ports and ICMP fields but no L7 or authentication fields. Effective policy also includes other selecting policies, daemon enforcement mode and host-firewall settings.');
  r.evidence.push(source('pkg/policy/l4.go',314,337,'Per-selector verdict and precedence distinguish Deny, Pass and Allow.'),source('pkg/policy/repository.go',390,448,'Effective rule selection checks daemon mode, host firewall and matching cluster/namespace subjects.'));
  add('empty-direction-vs-item','A direction is [] versus [{}]','[] contributes no direction item and no directional entry. [{}] contributes one entry with empty peers and ports; the L4 constructor expands empty peers to wildcard. That entry can allow all or deny all in its direction, according to its parent allow/deny field.');
  r.evidence.push(source('pkg/policy/l4.go',1028,1037,'An entry with no L3 peers is expanded to wildcard selectors.'));
 }
 if(/\.(fromEndpoints|fromNodes|fromCIDR|fromCIDRSet|fromEntities|fromGroups|toEndpoints|toNodes|toCIDR|toCIDRSet|toEntities|toGroups|toServices|toFQDNs)/.test(path)) {
  r.conditions.push('Each ingress item rejects two nonempty peer families. Each egress item also rejects two nonempty peer families, but generated endpoint/CIDR entries are excluded from its authored-family count. Items in the selected family provide alternatives; selector requirements within one item are combined. Empty families contribute no peers.');
  r.evidence.push(validate(200,216,'IngressCommonRule rejects combined nonempty peer families.'),validate(410,478,'EgressCommonRule validates peers and counts only authored endpoint/CIDR entries.'),translate(148,167,'The translator appends peer selector families to the entry.'));
 }
 if(!path.includes('.toServices') && /(endpointSelector|nodeSelector|fromEndpoints|toEndpoints|fromNodes|toNodes|cidrGroupSelector)/.test(path)) {
  r.effect+=' Label selectors match security identity labels, not arbitrary names or IP strings. Sanitize validates requirements and encodes label-source prefixes; translation adds namespace/cluster scope where applicable. A subject endpointSelector:{} is a present wildcard selector, while omission leaves its embedded selector pointer nil.';
  r.evidence.push(source('pkg/policy/api/selector.go',65,68,'EndpointSelector.UnmarshalJSON allocates a LabelSelector before decoding, including null.'),source('pkg/policy/api/selector.go',221,232,'EndpointSelector.Sanitize validates and normalizes source-prefixed keys.'),source('pkg/labels/validation.go',43,78,'Selector requirements validate operators, key names, value counts and label values.'),source('pkg/k8s/apis/cilium.io/utils/utils.go',113,160,'Endpoint selector translation preserves explicit scope and applies namespace/cluster filters.'),source('pkg/policy/types/selector.go',327,338,'Compiled label selectors report wildcard selection and match identity labels.'));
  r.effect+=' Selector caches share equivalent selector keys, retain user references and react to identity-label updates. Rule replacement collects subjects from old and new rules, allocates new selector references and then releases old references under repository locking.';r.evidence.push(source('pkg/policy/selectorcache.go',541,590,'Selector caches lock updates, reuse keys and retain users.'),source('pkg/policy/selectorcache.go',638,650,'Removal releases users and deletes the last unused selector.'),source('pkg/policy/selectorcache.go',768,807,'Identity updates modify cached identity labels and namespaces under locking.'),source('pkg/policy/repository.go',575,605,'Resource replacement collects affected identities and releases old rule selectors after allocating replacements.'));
  r.conditions.push('In and NotIn require at least one value; Exists and DoesNotExist require zero values. An empty string is a possible label value, not an absent key. Unknown operators and invalid label keys/values fail selector Sanitize.');
  add('subject-selector-presence','The rule has zero or two non-nil subject selector pointers','Sanitize rejects it. A present empty selector is non-nil; EndpointSelector null also allocates an empty selector in the custom decoder, so typed null is not equivalent to omission. Nonnullable CRD admission remains separate.');
  if(/nodeSelector|fromNodes|toNodes/.test(path)) {
   r.conditions.push('nodeSelector is a CCNP host-policy subject. CNP Parse rejects any non-nil nodeSelector. fromNodes/toNodes require enable-node-selector-labels; translated peer node selectors add the reserved remote-node requirement. Effective host policy also requires host-firewall enablement.');
   r.evidence.push(source('pkg/k8s/apis/cilium.io/v2/cnp_types.go',200,217,'Namespaced Parse rejects nodeSelector in spec or specs.'),validate(220,236,'Ingress node peers require the configured feature and selector validation.'),validate(422,436,'Egress node peers require the configured feature and selector validation.'),source('pkg/k8s/apis/cilium.io/utils/utils.go',176,184,'Node peer translation adds the remote-node label and cluster filter.'));
  }
 }
 if(path.includes('.enableDefaultDeny')) {
  r.effect='When enable-non-default-deny-policies is enabled, a nil direction pointer defaults to whether that direction contains allow or deny entries. Explicit false is retained. With the feature disabled, Sanitize replaces both pointers with true. Across selecting rules, any default-deny request enables the direction default posture.';
  r.evidence.push(validate(47,65,'Sanitize defaults direction posture conditionally and overwrites both values when non-default-deny policies are disabled.'),source('pkg/policy/repository.go',417,448,'The repository accumulates default-deny flags from all matching entries.'),source('pkg/policy/repository.go',473,523,'Only non-default-deny rules cause wildcard allow insertion; always-enforce/init identity forces default deny.'));
  add('explicit-false-gate','enableDefaultDeny direction is false','False changes posture only when EnableNonDefaultDenyPolicies is enabled. Otherwise Sanitize forces true. Other matching policies and enforcement mode can still require default deny.');
 }
 if(/\.(fromCIDR|toCIDR|cidrGroup)/.test(path)) {
  r.effect+=' Direct CIDR entries accept an IP or IP/prefix; CIDRSet entries require exactly one prefix, CIDR group name or CIDR group selector. Literal CIDRSet exceptions must be prefixes within the parent address family and prefix. Group-backed entries return from sanitization before the literal exception containment check.';
  r.evidence.push(validate(653,673,'Direct CIDR validation parses prefixes or individual addresses.'),validate(679,736,'CIDRRule requires one source and validates literal prefix and contained exceptions.'),source('pkg/policy/types/selector.go',478,494,'CIDRRule becomes a named/label group selector or a literal CIDR selector with exceptions.'),source('pkg/policy/k8s/cilium_cidr_group.go',39,77,'CIDR group addresses and group labels are parsed for IP-cache metadata.'),source('pkg/policy/k8s/cilium_cidr_group.go',79,137,'CIDR group changes update IP-cache metadata and release stale entries.'));
  add('cidr-group-source-conflict','cidr, cidrGroupRef and cidrGroupSelector are absent or more than one is present','CIDRRule.sanitize returns an error. A present empty cidrGroupSelector is counted as a selector because its embedded pointer is non-nil.');
 }
 if(/\.(fromEntities|toEntities)/.test(path)) {
  r.effect+=' Entity names are looked up in EntitySelectorMapping and converted to security identity selectors. Unknown names fail common-rule sanitization; an empty collection supplies no entity filter.';
  r.evidence.push(validate(247,261,'Ingress entity validation rejects an unknown entity.'),validate(450,456,'Egress entity validation rejects an unknown entity.'),source('pkg/policy/api/entity.go',94,155,'EntitySelectorMapping defines the reserved identity selector sets.'));
 }
 if(path.includes('.toServices')) {
  r.receiver+='; service watcher and ToServices resolver';
  r.effect+=' ToServices resolves matching service selectors/name references against the current service/backend state. Matching services with pod selectors contribute endpoint selectors; other services contribute backend CIDR entries. The agent records service dependencies and re-resolves affected policies after service/backend changes.';
  r.evidence.push(source('pkg/policy/k8s/service.go',183,235,'Service changes select affected cached policies and import the retranslated result.'),source('pkg/policy/k8s/service.go',367,409,'Service selector and name matching allow an empty namespace to match any namespace.'),source('pkg/policy/k8s/service.go',462,490,'The resolver appends generated endpoint/CIDR peers for matched services.'));
  add('service-selector-precedence','A ToServices item has both k8sServiceSelector and k8sService','The service resolver uses the selector branch and does not execute the name-reference else-if branch. An empty namespace matches all service namespaces in either branch.');
  r.evidence.push(source('pkg/policy/types/requirements.go',75,87,'Nil or empty label selectors produce zero requirements.'),source('pkg/policy/types/requirements.go',240,247,'Zero requirements match all labels.'),source('pkg/policy/types/selector.go',280,305,'Service matching constructs a label selector from the configured selector.'));r.conditions.push('An empty service selector has no label requirements and matches services in its selected namespace scope. k8sService:{} has an empty name and cannot match a nonempty service name. A missing selector pointer and a present empty service-selector object are separate branches.');
  r.conditions.push('Service selectors are interpreted by the service matcher; ordinary endpoint-selector Sanitize is not called for the ServiceSelector alias by common-rule sanitization. Do not transfer every endpoint-selector validation claim to this separate consumer. A missing matching service contributes no generated peers.');
 }
 if(/\.(fromGroups|toGroups)/.test(path)) {
  r.receiver+='; operator external group manager and AWS provider';
  r.effect+=' External groups are hashed from JSON into CIDR-group label keys. The operator records resource owners, resolves provider addresses and creates/updates CiliumCIDRGroups; removal of the last owner triggers group deletion. Errors are retained for retry. The agent uses the resulting group-label selector; it does not make an AWS lookup during Parse.';
  r.evidence.push(source('pkg/policy/api/groups.go',51,88,'Hash, label key and GetAsEndpointSelector convert all configured group data to a group identity.'),source('operator/pkg/networkpolicy/external-groups/group_manager.go',162,211,'Group ownership is added and stale references are pruned before triggering synchronization.'),source('operator/pkg/networkpolicy/external-groups/sync.go',61,96,'Synchronization retries failed groups and processes unowned groups for deletion.'),source('operator/pkg/networkpolicy/external-groups/sync.go',124,153,'Provider lookup failures return before updating the CIDRGroup.'));
  add('aws-group-empty-or-union','The AWS group has neither filter family, or has both security-group and label filters','With neither family it makes no filter lookup after AWS configuration initialization and returns no addresses. With both families it appends both lookup results; provider.GetCidrSet deduplicates the final addresses. Region is not read.');r.evidence.push(source('operator/pkg/networkpolicy/external-groups/provider/provider.go',31,49,'Provider dispatch joins addresses and keeps unique addresses after successful provider calls.'));
  r.conditions.push('The external group manager uses a no-op implementation when no group provider is registered. AWS region is deprecated and unused by provider selection; it still participates in the JSON hash, so changing it can change group identity without selecting a different region. The AWS provider returns no addresses when aws is nil. A present aws:{} first initializes AWS configuration and then performs no filtered lookup and returns no addresses; configuration failure can still return an error. Security-group and instance-label results are appended together, rather than intersected across those two provider lookup branches.');
  r.evidence.push(source('operator/pkg/networkpolicy/external-groups/group_manager.go',84,96,'NewGroupManager selects a no-op when no group provider is registered.'),source('operator/pkg/networkpolicy/external-groups/group_manager.go',333,339,'The no-op group manager accepts SetResourceGroups without resolving groups.'),source('pkg/policy/groups/aws/aws.go',28,60,'The AWS provider queries security groups and labels separately, appends results and ignores the API Region field.'),source('pkg/policy/groups/aws/aws.go',65,81,'Security group IDs and names are sent as separate EC2 filters.'),source('pkg/policy/groups/aws/aws.go',119,140,'Each instance-label key/value creates an EC2 tag filter.'),source('operator/pkg/networkpolicy/external-groups/provider/register_aws.go',10,20,'AWS provider registration depends on the ipam_provider_aws build tag.'));
 }
 if(path.includes('.toFQDNs')) {
  r.receiver+='; DNS name manager and identity/IP cache';
  r.effect+=' A DNS-name selector permits peers through identities derived from observed DNS name-to-address data. Sanitize rejects simultaneous nonempty matchName and matchPattern and invalid patterns. ToRegex gives matchName precedence and normalizes the DNS name; the name manager registers selectors, labels matching cached addresses and removes selector state on release.';
  r.evidence.push(source('pkg/policy/api/fqdn.go',99,124,'FQDN selector sanitization and regex conversion validate the input and select literal name or pattern.'),source('pkg/fqdn/namemanager/manager.go',141,180,'RegisterFQDNSelector compiles and records selectors and applies labels to cached matching addresses.'),source('pkg/fqdn/namemanager/manager.go',185,211,'UnregisterFQDNSelector removes it and schedules stale IP-cache label removal.'));
  add('empty-fqdn-item','A typed FQDNSelector has empty matchName and matchPattern','Its sanitizer accepts the empty pattern. ToRegex uses pattern normalization, which makes the empty name a dot and compiles a root-name matcher; it is not an all-name wildcard. CRD name/pattern presence and pattern constraints remain a separate admission boundary.');r.evidence.push(source('pkg/fqdn/matchpattern/matchpattern.go',60,112,'Pattern validation accepts empty strings; sanitization makes names fully qualified and regex conversion adds anchors.'),source('pkg/fqdn/dns/dns.go',43,48,'DNS FQDN normalization lowercases a name and adds a trailing dot, including for an empty input.'));
  r.conditions.push('This selects DNS-derived destination IPs; it does not check the HTTP Host header or guarantee the application uses DNS. Empty/missing name data does not initiate DNS resolution or prove traffic permission. DNS caches, expiry and proxy visibility are runtime inputs.');
 }
 if(path.includes('.toPorts')) {
  r.effect+=' Port rules constrain transport ports, protocols and optional proxy processing. Numeric/named port parsing and feature checks occur before filter construction. Named ports are resolved from endpoint identity metadata; an unresolved name is not a numeric zero wildcard.';
  r.evidence.push(validate(520,592,'Allow port sanitization enforces DNS direction, server-name/TLS/L7 compatibility, port limit, protocol restrictions and listener compatibility.'),validate(595,641,'Deny port and port-protocol sanitization validate limits, names, numbers and protocol.'),source('pkg/policy/l4.go',999,1026,'Filter construction retains named port identity separately from numeric port zero.'));
  r.conditions.push('A PortRule allows at most 40 port entries. A missing/empty ports collection is distinct from a port item with an empty port string. Port protocol omission/empty becomes ANY in typed Sanitize; lowercase protocols normalize in ParseL4Proto, while the CRD enum can reject lowercase before that step. DNS ranges and non-DNS L7 on non-TCP ports are rejected. An empty port string requires EnableExtendedIPProtocols in this sanitizer. A numeric nonzero port is rejected for extended protocols; a numeric zero does not take the empty-string gate branch. The documented feature requirement must not be claimed as a universal protocol rejection performed by this function.');
  r.conditions.push('For numeric nonzero ports, an endPort greater than port expands a range. Zero, equal or lower endPort uses the single-port key branch; the typed sanitizer does not universally reject a lower endPort. Negative or over-65535 values remain CRD range errors before typed consumption. Named-port ranges are not supported.');r.evidence.push(source('pkg/policy/l4.go',718,726,'keysForRange returns a single key for port zero or endPort not greater than port.'));
  r.evidence.push(source('pkg/policy/api/utils.go',66,89,'Protocol validation recognizes the declared set and uppercases typed protocol input; empty maps to ANY.'),source('pkg/policy/l4.go',804,822,'Egress named ports are resolved per identity; unresolved redirects are skipped rather than installed as zero-port wildcards.'));
  add('port-name-or-number','A port string is a service name rather than a number','Sanitize lowercases the service name; filter construction records PortName. A numeric string is parsed as a 16-bit unsigned number. The transport port and protocol are separate inputs.');
 }
 if(path.includes('.rules')) {
  r.effect+=' L7Rules is a HTTP/DNS union. A nil pointer and a present object with zero HTTP/DNS items are empty to IsEmpty; there is no additional L7 filtering from those values. Nonempty rule collections select the proxy parser. When L7 sanitization runs, it counts non-nil protocol collections, including a present empty collection. A nonempty HTTP list plus dns:[] is therefore rejected, although both empty lists make IsEmpty true and skip that sanitizer.';
  r.evidence.push(source('pkg/policy/api/l4.go',318,330,'L7Rules.Len and IsEmpty treat nil and zero total rules as empty.'),validate(483,516,'L7 sanitization rejects mixed protocols and validates HTTP/DNS entries.'),source('pkg/policy/l4.go',1073,1090,'Filter construction selects DNS or HTTP parser from the populated rules.'));
  r.evidence.push(source('pkg/policy/l4.go',1124,1142,'When effective directional default deny is disabled, allow L7 rules gain a wildcard before installation.'),source('pkg/policy/l4.go',473,484,'Incompatible parser types fail merge.'));
  r.conditions.push('L7 proxy must be enabled. Host ingress rejects L7. Host egress permits DNS but rejects HTTP. DNS rules are egress-only, require explicit port entries and reject port ranges. The sanitizer error calls for port 53, but its implementation here checks that the port list is nonempty; it does not compare every numeric port with 53. Empty HTTP/DNS item contents and an empty collection are different boundaries. HTTP:{} is a wildcard HTTP entry. When effective directional default deny is disabled, filter construction adds a protocol wildcard to positive L7 rules; another selecting policy can enable default deny and change this result.');
  r.evidence.push(validate(136,160,'Ingress checks host/L7/ICMP support.'),validate(295,322,'Egress checks proxy and host-specific protocol support.'));
 }
 if(path.includes('.rules.dns')) {
  r.effect+=' DNS proxy rules inspect DNS query names, whereas toFQDNs selects destination identities from name/address observations. DNS Sanitize validates name characters and pattern compilation; it does not reject simultaneous nonempty matchName and matchPattern as FQDNSelector.sanitize does. Empty members are therefore not automatically a valid literal DNS name.';
  r.evidence.push(source('pkg/policy/api/fqdn.go',138,145,'PortRuleDNS.Sanitize checks matchName characters and pattern compilation without an exactly-one test.'),source('pkg/fqdn/dnsproxy/proxy.go',1439,1459,'DNS proxy pattern generation joins each nonempty literal/pattern as alternatives and treats nil/zero DNS list as match-all.'),source('pkg/fqdn/dnsproxy/proxy.go',763,785,'DNS query permission requires endpoint/port state, selected destination identity and query-name regex matching.'),source('pkg/fqdn/dnsproxy/proxy.go',723,746,'Updating DNS rules compiles state under locking, removes restored rules and returns a revert function.'),source('pkg/fqdn/dnsproxy/proxy.go',1001,1029,'Denied or failed DNS checks return an error response before upstream forwarding.'));add('dns-empty-container-vs-item','The DNS collection has zero entries versus one empty PortRuleDNS item','GeneratePattern treats nil or a zero-length DNS list as match-all. A single empty item produces an anchored empty-name alternative and does not match a nonempty normalized query name. Both matchName and matchPattern in an item become alternatives in this proxy consumer.');
 }
 if(path.includes('.rules.http')) {
  r.effect+=' HTTP sanitization compiles nonempty path/method regex and checks header match names, mismatch action and secret name. The Envoy translator uses path/method/host matchers and header conjunctions. Empty path/method/host leaves that specific matcher unconstrained. Header values are exact data, and regex strings must retain their escaping.';
  r.evidence.push(source('pkg/policy/l4.go',487,532,'HTTP with no path/method/host/header constraints is detected as wildcard; wildcard insertion adds an empty HTTP item.'),source('pkg/policy/api/http.go',124,154,'HTTP Sanitize validates regex and HeaderMatches but not ordinary Headers.'),source('pkg/envoy/policy/envoy_l7_rules_translator.go',62,153,'The HTTP rule translator builds path/method/host and ordinary header matchers.'),source('pkg/envoy/policy/envoy_l7_rules_translator.go',155,238,'Header match translation obtains secret values, applies fallback/mismatch actions and chooses inline/SDS matchers.'));
  r.conditions.push('A nonempty resolved Secret value wins over configured Value. If the result is empty, a nonempty Value becomes the inline fallback even when Secret lookup returned no error or selected SDS mode. Without Value, an absent Secret means header presence, while a present SDS Secret remains a Secret reference.');
  r.conditions.push('HeaderMatches items are *HeaderMatch. A null item is retained as nil and Sanitize dereferences m.Name without a nil guard. An absent secret pointer uses the configured Value; a secret lookup error uses Value when nonempty, otherwise produces a failing match. Mismatch actions can allow/log or modify the header rather than reject.');
  add('header-secret-fallback','A HeaderMatch has a Secret reference and the lookup fails','getSecretString returns the nonempty configured Value as fallback. Without that fallback, the translator builds a failing header matcher. This differs from a TLS certificate lookup error, which aborts policy resolution.');
  r.evidence.push(source('pkg/envoy/policy/envoy_l7_rules_translator.go',251,267,'getSecretString chooses Value when no Secret or as fallback after a lookup error.'));
 }
 if(/(terminatingTLS|originatingTLS)/.test(path)) {
  r.receiver+='; certificate manager and L4 proxy filter';
  r.effect+=' Terminating TLS provides the proxy server-side certificate/key; originating TLS supplies trust for the proxy upstream connection. A nil TLS context skips certificate resolution. A present context requires a non-nil Secret with a name. Local certificate files take priority, then configured SDS reference mode, then direct Kubernetes Secret retrieval. Explicit Secret namespace overrides policy namespace. Empty key selectors use ca.crt, tls.crt and tls.key; explicit missing keys return errors.';
  r.evidence.push(source('pkg/crypto/certificatemanager/certificate_manager.go',113,166,'Secret resolution validates reference, overrides namespace and chooses local files, SDS or direct Kubernetes lookup.'),source('pkg/crypto/certificatemanager/certificate_manager.go',172,237,'TLS resolution selects default/explicit data keys and reports absent requested material.'),source('pkg/policy/l4.go',946,990,'getCerts skips nil TLS and checks inline terminating certificate/key or originating CA before constructing the context.'),source('pkg/policy/rule.go',251,266,'Merging conflicting TLS contexts for the same cached selector returns an error.'));
  add('tls-local-precedence','The named local Secret directory can be listed but its content is incomplete','getSecrets stays on the local branch. It does not fetch Kubernetes as fallback for a missing requested key. It can retain successfully read files despite another file read error; it returns the latest read error only when no material was retained and that error is non-nil. TLS key and direction checks then determine success or failure.');
  r.conditions.push('SDS reference mode defers material validation to Envoy; successful typed resolution is not proof that the proxy loaded a Secret. Inline terminating TLS needs public/private material; inline originating TLS needs CA material. TLS merge conflicts prevent computing that policy.');
  add('tls-secret-missing','A present TLS context has no Secret pointer or an empty Secret name','The certificate manager returns a reference error. It does not use an empty context as a default certificate.');
 }
 if(path.includes('.serverNames')) {
  r.effect+=' Nonempty serverNames restricts TLS SNI. Empty members are rejected by port Sanitize. When L7 rules also exist, terminatingTLS must be present. SNI collections merge into a set during policy composition; the resulting traffic still requires TLS and the appropriate proxy/parser.';
  r.evidence.push(validate(526,531,'Port sanitizer rejects empty SNI items and SNI plus nonempty L7 without terminating TLS.'),source('pkg/policy/rule.go',274,299,'Composition merges server-name sets and rejects the resulting SNI/L7 combination without terminating TLS.'),source('pkg/envoy/model.go',376,383,'Envoy policy generation serializes and sorts sanitized SNI patterns.'),source('pkg/envoy/utils.go',33,60,'SNI wildcard patterns are normalized for Envoy.'));
 }
 if(path.includes('.listener')) {
  r.effect+=' A custom listener overrides the filter parser to the CRD listener route and resolves the configured EnvoyConfig resource/name. Priority selects between listener choices; zero uses the configured default. An unavailable listener remains a proxy resource dependency, not permission to bypass policy.';
  r.conditions.push('A CCNP cannot reference a namespaced CiliumEnvoyConfig listener; createL4Filter returns an error. CiliumClusterwideEnvoyConfig clears namespace scope. The filter dereferences Listener.EnvoyConfig, so a present Listener without its required EnvoyConfig cannot be treated as a valid default.');
  r.evidence.push(validate(555,567,'Custom listener is rejected on ingress unless the test gate permits it, and cannot accompany L7 rules.'),source('pkg/policy/l4.go',1088,1148,'Filter construction chooses the custom listener parser and resolves scoped resource/listener names and priority.'));
 }
 if(path.includes('.icmps')) {
  r.effect+=' ICMP fields become port/protocol entries for ICMP or ICMPv6. The family selects the type-name table; omitted family uses IPv4. The custom ICMPField decoder validates names against that table; numeric codes use IntOrString decoding. Sanitize validates the family and at most 40 fields. ICMP cannot be combined with toPorts in the same direction item and requires enable-icmp-rules.';
  r.evidence.push(source('pkg/policy/api/icmp.go',123,153,'Custom ICMPField decoding checks family-specific named type values and assigns decoded fields.'),source('pkg/policy/api/icmp.go',194,219,'ICMP fields translate family and named/numeric type to protocol and port.'),validate(644,651,'ICMP verify validates maximum field count and family.'),translate(177,187,'ICMP entries are translated into PortRules.'));
  r.conditions.push('IntOrString is a custom int/string decoder, not an ordinary object. Omitted/null type remains a nil pointer. ICMPField.UnmarshalJSON calls t.Type.String and then IntValue without a nil guard for nil type. A null/empty ICMP field item can reach this unsafe path; do not claim it is a valid wildcard.');
  r.evidence.push(source('vendor/k8s.io/apimachinery/pkg/util/intstr/intstr.go',86,103,'IntOrString.UnmarshalJSON selects a quoted string or integer decode.'),source('vendor/k8s.io/apimachinery/pkg/util/intstr/intstr.go',106,144,'IntOrString.String handles nil specially; IntValue reads the receiver type and value.'));
 }
 if(path.includes('.authentication')) {
  r.effect+=' Authentication is carried only by allow entries. L4 policy maps required to SPIRE, test-always-fail to the failing test type and other/disabled modes to disabled authentication; CRD enum validation remains responsible for rejecting unsupported authored modes. A nil pointer means no explicit authentication requirement.';
  r.evidence.push(translate(35,46,'Allow ingress retains Authentication.'),translate(98,109,'Allow egress retains Authentication.'),source('pkg/policy/l4.go',275,290,'getAuthType distinguishes nil and required/test-always-fail/disabled modes.'),source('pkg/policy/types/auth.go',9,40,'Authentication type numbers and the explicit bit encode authentication requirements.'),source('pkg/policy/mapstate.go',445,454,'An implicit authentication requirement is upgraded only from a higher auth type with sufficient allow precedence.'));
  r.conditions.push('The informational operator rejects any present authentication object when MeshAuthEnabled is false, including an explicit disabled mode. Implicit requirements can inherit a higher authentication type from a covering rule; an explicit requirement is not replaced by that branch.');r.evidence.push(source('operator/pkg/networkpolicy/validator.go',190,202,'Mutual-auth validation tests pointer presence and MeshAuthEnabled.'));
  r.evidence.push(source('pkg/auth/always_fail_authhandler.go',24,29,'The always-fail handler returns an authentication error.'),source('pkg/auth/mutual_authhandler.go',91,114,'Mutual authentication resolves local identity certificate/trust and dials the remote node with the configured timeout.'),source('pkg/auth/mutual_authhandler.go',126,155,'The handshake verifies the remote identity chain and returns errors rather than a successful auth response.'),source('pkg/auth/mutual_authhandler.go',268,317,'Certificate validation checks trust, leaf/CA structure and the expected identity SAN.'));
  r.evidence.push(source('pkg/auth/mutual_authhandler.go',42,61,'A zero configured listener port omits the mutual-auth handler, and missing certificate provider with a configured port stops process initialization.'));
  r.conditions.push('A policy authentication requirement is not an observed successful identity handshake. Identity credentials, SPIRE configuration and datapath authentication support remain runtime requirements; test-always-fail intentionally fails authentication.');
 }
 if(/\.labels(?:\[\]|\.|$)/.test(path)&&!/Groups|groups|matchLabels/.test(path)) {
  r.effect+=' Rule labels become policy correlation labels. Parse appends authored labels to resource-derived labels from namespace/name/UID/kind and assigns the unspecified source when an authored source is empty, so labels in the policy Rule do not select subject endpoints. Changing metadata identity changes those generated correlation labels.';
  r.evidence.push(source('pkg/k8s/apis/cilium.io/utils/utils.go',399,431,'ParseToCiliumLabels appends resource and normalized authored labels and sorts them.'));
 }
 if(path.endsWith('.description')) {
  r.effect='Description is authored explanatory text. Parse copies it into the translated Rule; RulesToPolicyEntries does not include Description in the internal entry. It does not select subjects, peers or a verdict.';
  r.evidence.push(source('pkg/k8s/apis/cilium.io/utils/utils.go',394,405,'Rule translation preserves Description, default posture and log.'),translate(35,46,'Internal entry construction has no Description field.'));
 }
 if(/\.log(?:\.|$)/.test(path)) {
  r.effect+=' Rule log value is copied into each internal policy entry and provides policy correlation metadata for matching Hubble flows. Empty value contributes no custom policy log text; changing it does not turn an allow verdict into a deny verdict.';
  r.evidence.push(source('pkg/policy/correlation/correlation.go',63,90,'Flow policy correlation reads the matching endpoint key and assigns policy log independently of verdict.'),translate(35,46,'Allow entry carries Log.'),translate(67,76,'Deny entry also carries Log.'),source('pkg/policy/rule.go',61,63,'Rule origin stores sorted correlation labels and the custom log value.'));
 }
 return r;
}
function refine(record,type) {
 const path=record.fieldPath;
 if(type==='EndpointSelector') {
  record.omitted='Omission leaves the embedded LabelSelector pointer nil in a fresh parent. For a subject selector this participates in the exactly-one-selector check; peer and CIDR-group selectors follow their named routes.';
  record.nullValue='EndpointSelector.UnmarshalJSON allocates an empty LabelSelector before decoding null. The embedded pointer is non-nil. This differs from omission and is not proof of nonnullable CRD admission.';
  record.emptyValue='{} allocates a present empty LabelSelector. A subject selector is a wildcard before namespaced policy translation adds namespace scope; a group selector still selects CIDR group labels.';
 }
 if(type==='slimv1.Time') {
  record.nullValue='The Cilium slim Time custom decoder sets the embedded time to its zero value for JSON null.';
  record.emptyValue='An empty string is not an RFC3339 timestamp and returns a time parse error. An empty object fails the string decode. Omission leaves zero time in a fresh parent.';
  record.invalidValue='A non-string, non-null JSON value or a string that does not parse as RFC3339 returns an error from slim Time.UnmarshalJSON.';
  record.evidence.push(source('pkg/k8s/slim/k8s/apis/meta/v1/time.go',101,120,'Time.UnmarshalJSON treats null as zero and otherwise parses an RFC3339 string.'));
 }
 if(/\.labels\[\](?:\.|$)/.test(path)&&!path.includes('.aws')) {
  record.crossFieldConditions.push('The containing Label has a custom JSON decoder. It accepts an object with a nonempty key or a nonempty short label string. A null/empty object item fails the missing-key check; its scalar children do not independently make that item valid.');
  record.evidence.push(source('pkg/labels/labels.go',485,532,'Label.UnmarshalJSON accepts full objects or short strings and rejects objects without a label key.'));
  if(type==='Label') {
   record.nullValue='Label.UnmarshalJSON decodes null into its auxiliary zero struct and then returns a missing-label-key error. It does not retain a valid zero Label item.';
   record.emptyValue='{} returns a missing-label-key error. A nonempty short-form string is another accepted typed representation, but the CRD schema representation must be checked separately.';
  }
 }
 if(/\.icmps\[\]\.fields\[\]$/.test(path)) {
  record.nullValue='The custom ICMPField decoder obtains a nil Type from null, then calls its String/IntValue path. IntValue dereferences nil; this typed input can panic rather than return a valid empty field.';
  record.emptyValue='{} leaves Type nil and reaches the same unsafe custom-decoder path. A valid field must provide its int/string type.';
 }
 if(type==='*intstr.IntOrString') {
  record.emptyValue='An explicit numeric zero or string "0" is a present ICMP type zero. An empty string is a present string type but fails the containing ICMPField name check. {} fails the custom int/string decoder.';
  record.crossFieldConditions.push('Omitted or null type is nil. The containing ICMPField decoder checks the pointer through String and IntValue, and can panic for nil. The generic pointer result is not a successful containing-field decode.');
 }
 if(path==='$') {
  record.omitted='An absent object supplies no resource to the request boundary.';
  record.nullValue='A null request value does not establish a valid Kubernetes resource. Parse requires an actual typed object with name and policy inputs.';
  record.emptyValue='{} has neither a name nor desired rules. Parse returns the missing-name error first. API envelope and metadata validation precede this typed operation.';
 }
 // Keep synthesized fresh-decoder cases consistent with field-specific refinements.
 for(let n=0;n<3;n++) record.cases[n].sourceOutcome=record[['omitted','nullValue','emptyValue'][n]];
}
const aliases = {"MatchLabelsValue": ["string", "pkg/k8s/slim/k8s/apis/meta/v1/types.go", 284], "Rules": ["[]*Rule", "pkg/policy/api/rules.go", 17], "Entity": ["string", "pkg/policy/api/entity.go", 17], "EntitySlice": ["[]Entity", "pkg/policy/api/entity.go", 153], "ServiceSelector": ["EndpointSelector", "pkg/policy/api/service.go", 7], "L4Proto": ["string", "pkg/policy/api/l4.go", 7], "ServerName": ["string", "pkg/policy/api/l4.go", 206], "PortRules": ["[]PortRule", "pkg/policy/api/l4.go", 330], "PortDenyRules": ["[]PortDenyRule", "pkg/policy/api/l4.go", 349], "PortRuleDNS": ["FQDNSelector", "pkg/policy/api/fqdn.go", 128], "PortRulesDNS": ["[]PortRuleDNS", "pkg/policy/api/fqdn.go", 134], "FQDNSelectorSlice": ["[]FQDNSelector", "pkg/policy/api/fqdn.go", 149], "AuthenticationMode": ["string", "pkg/policy/api/rule.go", 11], "CIDR": ["string", "pkg/k8s/apis/cilium.io/v2/cegp_types.go", 48], "CIDRSlice": ["[]CIDR", "pkg/policy/api/cidr.go", 83], "CIDRRuleSlice": ["[]CIDRRule", "pkg/policy/api/cidr.go", 119], "CIDRGroupRef": ["string", "pkg/policy/api/cidr.go", 127], "ICMPRules": ["[]ICMPRule", "pkg/policy/api/icmp.go", 65], "MismatchAction": ["string", "pkg/policy/api/http.go", 15], "PortRulesHTTP": ["[]PortRuleHTTP", "pkg/policy/api/http.go", 115], "LabelArray": ["[]Label", "pkg/labels/array.go", 14], "PolicyConditionType": ["string", "pkg/k8s/apis/cilium.io/v2/cnp_types.go", 250], "LabelSelectorOperator": ["string", "pkg/k8s/slim/k8s/apis/meta/v1/types.go", 306], "ConditionStatus": ["string", "vendor/k8s.io/api/core/v1/types.go", 3252]};
const declarations = [
 [
  "CiliumNetworkPolicy",
  "$",
  "CiliumNetworkPolicy",
  "CiliumNetworkPolicy",
  "Cilium extended network policy object.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  33,
  33
 ],
 [
  "CiliumNetworkPolicy",
  "$.apiVersion",
  "string",
  "string",
  "Kubernetes typed request envelope.",
  "vendor/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
  1402,
  1402
 ],
 [
  "CiliumNetworkPolicy",
  "$.kind",
  "string",
  "string",
  "Kubernetes typed request envelope.",
  "vendor/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
  1239,
  1239
 ],
 [
  "CiliumNetworkPolicy",
  "$.metadata",
  "metav1.ObjectMeta",
  "ObjectMeta",
  "Carries metadata in the typed policy object.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  37,
  38
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec",
  "*api.Rule",
  "*Rule",
  "Spec is the desired Cilium specific rule specification.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.description",
  "string",
  "string",
  "Description is a free form string, it can be used by the creator of the rule to store human readable explanation of the purpose of this rule.",
  "pkg/policy/api/rule.go",
  142,
  143
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress",
  "[]EgressRule",
  "[]EgressRule",
  "Egress is a list of EgressRule which are enforced at egress.",
  "pkg/policy/api/rule.go",
  100,
  101
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[]",
  "EgressRule",
  "EgressRule",
  "Egress is a list of EgressRule which are enforced at egress.",
  "pkg/policy/api/rule.go",
  100,
  101
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].authentication",
  "*Authentication",
  "*Authentication",
  "Authentication is the required authentication type for the allowed traffic, if any.",
  "pkg/policy/api/egress.go",
  180,
  181
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].authentication.mode",
  "AuthenticationMode",
  "string",
  "Mode is the required authentication mode for the allowed traffic, if any.",
  "pkg/policy/api/rule.go",
  25,
  26
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].icmps",
  "ICMPRules",
  "[]ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is allowed to connect to.",
  "pkg/policy/api/egress.go",
  175,
  176
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].icmps[]",
  "ICMPRule",
  "ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is allowed to connect to.",
  "pkg/policy/api/egress.go",
  175,
  176
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].icmps[].fields",
  "[]ICMPField",
  "[]ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].icmps[].fields[]",
  "ICMPField",
  "ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].icmps[].fields[].family",
  "string",
  "string",
  "Family is a IP address version.",
  "pkg/policy/api/icmp.go",
  87,
  88
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].icmps[].fields[].type",
  "*intstr.IntOrString",
  "*intstr.IntOrString",
  "Type is a ICMP-type.",
  "pkg/policy/api/icmp.go",
  107,
  108
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toCIDR",
  "CIDRSlice",
  "[]CIDR",
  "ToCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  48,
  49
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toCIDR[]",
  "CIDR",
  "string",
  "ToCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  48,
  49
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toCIDRSet",
  "CIDRRuleSlice",
  "[]CIDRRule",
  "ToCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections to in addition to connections which are allowed via ToEndpoints, along with a list of subnets contained within their corresponding IP block to which traffic should not be allowed.",
  "pkg/policy/api/egress.go",
  64,
  65
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toCIDRSet[]",
  "CIDRRule",
  "CIDRRule",
  "ToCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections to in addition to connections which are allowed via ToEndpoints, along with a list of subnets contained within their corresponding IP block to which traffic should not be allowed.",
  "pkg/policy/api/egress.go",
  64,
  65
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidr",
  "CIDR",
  "string",
  "CIDR is a CIDR prefix / IP Block.",
  "pkg/policy/api/cidr.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupRef",
  "CIDRGroupRef",
  "string",
  "CIDRGroupRef is a reference to a CiliumCIDRGroup object.",
  "pkg/policy/api/cidr.go",
  36,
  37
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector",
  "EndpointSelector",
  "EndpointSelector",
  "CIDRGroupSelector selects CiliumCIDRGroups by their labels, rather than by name.",
  "pkg/policy/api/cidr.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].except",
  "[]CIDR",
  "[]CIDR",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].except[]",
  "CIDR",
  "string",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toEndpoints",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "ToEndpoints is a list of endpoints identified by an EndpointSelector to which the endpoints subject to the rule are allowed to communicate.",
  "pkg/policy/api/egress.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toEndpoints[]",
  "EndpointSelector",
  "EndpointSelector",
  "ToEndpoints is a list of endpoints identified by an EndpointSelector to which the endpoints subject to the rule are allowed to communicate.",
  "pkg/policy/api/egress.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toEndpoints[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toEndpoints[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toEndpoints[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toEndpoints[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toEndpoints[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toEndpoints[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toEndpoints[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toEndpoints[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toEntities",
  "EntitySlice",
  "[]Entity",
  "ToEntities is a list of special entities to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toEntities[]",
  "Entity",
  "string",
  "ToEntities is a list of special entities to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toFQDNs",
  "FQDNSelectorSlice",
  "[]FQDNSelector",
  "ToFQDN allows whitelisting DNS names in place of IPs.",
  "pkg/policy/api/egress.go",
  165,
  166
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toFQDNs[]",
  "FQDNSelector",
  "FQDNSelector",
  "ToFQDN allows whitelisting DNS names in place of IPs.",
  "pkg/policy/api/egress.go",
  165,
  166
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toFQDNs[].matchName",
  "string",
  "string",
  "MatchName matches literal DNS names.",
  "pkg/policy/api/fqdn.go",
  39,
  40
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toFQDNs[].matchPattern",
  "string",
  "string",
  "MatchPattern allows using wildcards to match DNS names.",
  "pkg/policy/api/fqdn.go",
  64,
  65
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toGroups",
  "[]Groups",
  "[]Groups",
  "ToGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/egress.go",
  93,
  94
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toGroups[]",
  "Groups",
  "Groups",
  "ToGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/egress.go",
  93,
  94
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toGroups[].aws",
  "*AWSGroup",
  "*AWSGroup",
  "Carries aws in the typed policy object.",
  "pkg/policy/api/groups.go",
  22,
  22
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toGroups[].aws.labels",
  "map[string]string",
  "map[string]string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toGroups[].aws.labels[<exact-key>]",
  "string",
  "string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toGroups[].aws.region",
  "string",
  "string",
  "Deprecated: Region is unused.",
  "pkg/policy/api/groups.go",
  45,
  46
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toGroups[].aws.securityGroupsIds",
  "[]string",
  "[]string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toGroups[].aws.securityGroupsIds[]",
  "string",
  "string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toGroups[].aws.securityGroupsNames",
  "[]string",
  "[]string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toGroups[].aws.securityGroupsNames[]",
  "string",
  "string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toNodes",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "ToNodes is a list of nodes identified by an EndpointSelector to which endpoints subject to the rule is allowed to communicate.",
  "pkg/policy/api/egress.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toNodes[]",
  "EndpointSelector",
  "EndpointSelector",
  "ToNodes is a list of nodes identified by an EndpointSelector to which endpoints subject to the rule is allowed to communicate.",
  "pkg/policy/api/egress.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toNodes[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toNodes[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toNodes[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toNodes[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toNodes[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toNodes[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toNodes[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toNodes[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts",
  "PortRules",
  "[]PortRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is allowed to connect to.",
  "pkg/policy/api/egress.go",
  148,
  149
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[]",
  "PortRule",
  "PortRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is allowed to connect to.",
  "pkg/policy/api/egress.go",
  148,
  149
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].listener",
  "*Listener",
  "*Listener",
  "listener specifies the name of a custom Envoy listener to which this traffic should be redirected to.",
  "pkg/policy/api/l4.go",
  249,
  250
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].listener.envoyConfig",
  "*EnvoyConfig",
  "*EnvoyConfig",
  "EnvoyConfig is a reference to the CEC or CCEC resource in which the listener is defined.",
  "pkg/policy/api/l4.go",
  165,
  166
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].listener.envoyConfig.kind",
  "string",
  "string",
  "Kind is the resource type being referred to.",
  "pkg/policy/api/l4.go",
  149,
  150
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].listener.envoyConfig.name",
  "string",
  "string",
  "Name is the resource name of the CiliumEnvoyConfig or CiliumClusterwideEnvoyConfig where the listener is defined in.",
  "pkg/policy/api/l4.go",
  156,
  157
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].listener.name",
  "string",
  "string",
  "Name is the name of the listener.",
  "pkg/policy/api/l4.go",
  171,
  172
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].listener.priority",
  "uint8",
  "uint8",
  "Priority for this Listener that is used when multiple rules would apply different listeners to a policy map entry.",
  "pkg/policy/api/l4.go",
  179,
  180
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].originatingTLS",
  "*TLSContext",
  "*TLSContext",
  "OriginatingTLS is the TLS context for the connections originated by the L7 proxy.",
  "pkg/policy/api/l4.go",
  234,
  235
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].originatingTLS.certificate",
  "string",
  "string",
  "Certificate is the file name or k8s secret item name for the certificate chain.",
  "pkg/policy/api/l4.go",
  129,
  130
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].originatingTLS.privateKey",
  "string",
  "string",
  "PrivateKey is the file name or k8s secret item name for the private key matching the certificate chain.",
  "pkg/policy/api/l4.go",
  136,
  137
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].originatingTLS.secret",
  "*Secret",
  "*Secret",
  "Secret is the secret that contains the certificates and private key for the TLS context.",
  "pkg/policy/api/l4.go",
  115,
  116
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].originatingTLS.secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].originatingTLS.secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].originatingTLS.trustedCA",
  "string",
  "string",
  "TrustedCA is the file name or k8s secret item name for the trusted CA.",
  "pkg/policy/api/l4.go",
  122,
  123
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].ports",
  "[]PortProtocol",
  "[]PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  214,
  215
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].ports[]",
  "PortProtocol",
  "PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  214,
  215
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].ports[].endPort",
  "int32",
  "int32",
  "EndPort can only be an L4 port number.",
  "pkg/policy/api/l4.go",
  53,
  54
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].ports[].port",
  "string",
  "string",
  "Port can be an L4 port number, or a name in the form of \"http\" or \"http-8080\".",
  "pkg/policy/api/l4.go",
  46,
  47
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].ports[].protocol",
  "L4Proto",
  "string",
  "Protocol is the L4 protocol.",
  "pkg/policy/api/l4.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules",
  "*L7Rules",
  "*L7Rules",
  "Rules is a list of additional port level rules which must be met in order for the PortRule to allow the traffic.",
  "pkg/policy/api/l4.go",
  256,
  257
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.dns",
  "PortRulesDNS",
  "[]PortRuleDNS",
  "DNS-specific rules.",
  "pkg/policy/api/l4.go",
  311,
  312
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.dns[]",
  "PortRuleDNS",
  "FQDNSelector",
  "DNS-specific rules.",
  "pkg/policy/api/l4.go",
  311,
  312
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.dns[].matchName",
  "string",
  "string",
  "MatchName matches literal DNS names.",
  "pkg/policy/api/fqdn.go",
  39,
  40
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.dns[].matchPattern",
  "string",
  "string",
  "MatchPattern allows using wildcards to match DNS names.",
  "pkg/policy/api/fqdn.go",
  64,
  65
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http",
  "PortRulesHTTP",
  "[]PortRuleHTTP",
  "HTTP specific rules.",
  "pkg/policy/api/l4.go",
  305,
  306
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[]",
  "PortRuleHTTP",
  "PortRuleHTTP",
  "HTTP specific rules.",
  "pkg/policy/api/l4.go",
  305,
  306
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headerMatches",
  "[]*HeaderMatch",
  "[]*HeaderMatch",
  "HeaderMatches is a list of HTTP headers which must be present and match against the given values.",
  "pkg/policy/api/http.go",
  107,
  108
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headerMatches[]",
  "*HeaderMatch",
  "*HeaderMatch",
  "HeaderMatches is a list of HTTP headers which must be present and match against the given values.",
  "pkg/policy/api/http.go",
  107,
  108
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headerMatches[].mismatch",
  "MismatchAction",
  "string",
  "Mismatch identifies what to do in case there is no match.",
  "pkg/policy/api/http.go",
  34,
  35
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headerMatches[].name",
  "string",
  "string",
  "Name identifies the header.",
  "pkg/policy/api/http.go",
  39,
  40
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headerMatches[].secret",
  "*Secret",
  "*Secret",
  "Secret refers to a secret that contains the value to be matched against.",
  "pkg/policy/api/http.go",
  46,
  47
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headerMatches[].secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headerMatches[].secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headerMatches[].value",
  "string",
  "string",
  "Value matches the exact value of the header.",
  "pkg/policy/api/http.go",
  53,
  54
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headers",
  "[]string",
  "[]string",
  "Headers is a list of HTTP headers which must be present in the request.",
  "pkg/policy/api/http.go",
  100,
  101
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headers[]",
  "string",
  "string",
  "Headers is a list of HTTP headers which must be present in the request.",
  "pkg/policy/api/http.go",
  100,
  101
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].host",
  "string",
  "string",
  "Host is an extended POSIX regex matched against the host header of a request.",
  "pkg/policy/api/http.go",
  93,
  94
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].method",
  "string",
  "string",
  "Method is an extended POSIX regex matched against the method of a request, e.g.",
  "pkg/policy/api/http.go",
  81,
  82
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].path",
  "string",
  "string",
  "Path is an extended POSIX regex matched against the path of a request.",
  "pkg/policy/api/http.go",
  73,
  74
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].serverNames",
  "[]ServerName",
  "[]ServerName",
  "ServerNames is a list of allowed TLS SNI values.",
  "pkg/policy/api/l4.go",
  243,
  244
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].serverNames[]",
  "ServerName",
  "string",
  "ServerNames is a list of allowed TLS SNI values.",
  "pkg/policy/api/l4.go",
  243,
  244
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].terminatingTLS",
  "*TLSContext",
  "*TLSContext",
  "TerminatingTLS is the TLS context for the connection terminated by the L7 proxy.",
  "pkg/policy/api/l4.go",
  224,
  225
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].terminatingTLS.certificate",
  "string",
  "string",
  "Certificate is the file name or k8s secret item name for the certificate chain.",
  "pkg/policy/api/l4.go",
  129,
  130
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].terminatingTLS.privateKey",
  "string",
  "string",
  "PrivateKey is the file name or k8s secret item name for the private key matching the certificate chain.",
  "pkg/policy/api/l4.go",
  136,
  137
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].terminatingTLS.secret",
  "*Secret",
  "*Secret",
  "Secret is the secret that contains the certificates and private key for the TLS context.",
  "pkg/policy/api/l4.go",
  115,
  116
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].terminatingTLS.secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].terminatingTLS.secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toPorts[].terminatingTLS.trustedCA",
  "string",
  "string",
  "TrustedCA is the file name or k8s secret item name for the trusted CA.",
  "pkg/policy/api/l4.go",
  122,
  123
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toRequires",
  "[]string",
  "[]string",
  "Deprecated.",
  "pkg/policy/api/egress.go",
  33,
  34
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toRequires[]",
  "string",
  "string",
  "Deprecated.",
  "pkg/policy/api/egress.go",
  33,
  34
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toServices",
  "[]Service",
  "[]Service",
  "ToServices is a list of services to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  79,
  80
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toServices[]",
  "Service",
  "Service",
  "ToServices is a list of services to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  79,
  80
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toServices[].k8sService",
  "*K8sServiceNamespace",
  "*K8sServiceNamespace",
  "K8sService selects service by name and namespace pair.",
  "pkg/policy/api/service.go",
  16,
  17
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toServices[].k8sService.namespace",
  "string",
  "string",
  "Carries namespace in the typed policy object.",
  "pkg/policy/api/service.go",
  23,
  23
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toServices[].k8sService.serviceName",
  "string",
  "string",
  "Carries serviceName in the typed policy object.",
  "pkg/policy/api/service.go",
  22,
  22
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector",
  "*K8sServiceSelectorNamespace",
  "*K8sServiceSelectorNamespace",
  "K8sServiceSelector selects services by k8s labels and namespace.",
  "pkg/policy/api/service.go",
  14,
  15
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.namespace",
  "string",
  "string",
  "Carries namespace in the typed policy object.",
  "pkg/policy/api/service.go",
  30,
  30
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector",
  "ServiceSelector",
  "EndpointSelector",
  "Carries selector in the typed policy object.",
  "pkg/policy/api/service.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny",
  "[]EgressDenyRule",
  "[]EgressDenyRule",
  "EgressDeny is a list of EgressDenyRule which are enforced at egress.",
  "pkg/policy/api/rule.go",
  108,
  109
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[]",
  "EgressDenyRule",
  "EgressDenyRule",
  "EgressDeny is a list of EgressDenyRule which are enforced at egress.",
  "pkg/policy/api/rule.go",
  108,
  109
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].icmps",
  "ICMPRules",
  "[]ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is not allowed to connect to.",
  "pkg/policy/api/egress.go",
  218,
  219
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].icmps[]",
  "ICMPRule",
  "ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is not allowed to connect to.",
  "pkg/policy/api/egress.go",
  218,
  219
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].icmps[].fields",
  "[]ICMPField",
  "[]ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].icmps[].fields[]",
  "ICMPField",
  "ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].icmps[].fields[].family",
  "string",
  "string",
  "Family is a IP address version.",
  "pkg/policy/api/icmp.go",
  87,
  88
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].icmps[].fields[].type",
  "*intstr.IntOrString",
  "*intstr.IntOrString",
  "Type is a ICMP-type.",
  "pkg/policy/api/icmp.go",
  107,
  108
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toCIDR",
  "CIDRSlice",
  "[]CIDR",
  "ToCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  48,
  49
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toCIDR[]",
  "CIDR",
  "string",
  "ToCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  48,
  49
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet",
  "CIDRRuleSlice",
  "[]CIDRRule",
  "ToCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections to in addition to connections which are allowed via ToEndpoints, along with a list of subnets contained within their corresponding IP block to which traffic should not be allowed.",
  "pkg/policy/api/egress.go",
  64,
  65
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[]",
  "CIDRRule",
  "CIDRRule",
  "ToCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections to in addition to connections which are allowed via ToEndpoints, along with a list of subnets contained within their corresponding IP block to which traffic should not be allowed.",
  "pkg/policy/api/egress.go",
  64,
  65
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidr",
  "CIDR",
  "string",
  "CIDR is a CIDR prefix / IP Block.",
  "pkg/policy/api/cidr.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupRef",
  "CIDRGroupRef",
  "string",
  "CIDRGroupRef is a reference to a CiliumCIDRGroup object.",
  "pkg/policy/api/cidr.go",
  36,
  37
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector",
  "EndpointSelector",
  "EndpointSelector",
  "CIDRGroupSelector selects CiliumCIDRGroups by their labels, rather than by name.",
  "pkg/policy/api/cidr.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].except",
  "[]CIDR",
  "[]CIDR",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].except[]",
  "CIDR",
  "string",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "ToEndpoints is a list of endpoints identified by an EndpointSelector to which the endpoints subject to the rule are allowed to communicate.",
  "pkg/policy/api/egress.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[]",
  "EndpointSelector",
  "EndpointSelector",
  "ToEndpoints is a list of endpoints identified by an EndpointSelector to which the endpoints subject to the rule are allowed to communicate.",
  "pkg/policy/api/egress.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toEntities",
  "EntitySlice",
  "[]Entity",
  "ToEntities is a list of special entities to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toEntities[]",
  "Entity",
  "string",
  "ToEntities is a list of special entities to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toGroups",
  "[]Groups",
  "[]Groups",
  "ToGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/egress.go",
  93,
  94
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toGroups[]",
  "Groups",
  "Groups",
  "ToGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/egress.go",
  93,
  94
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toGroups[].aws",
  "*AWSGroup",
  "*AWSGroup",
  "Carries aws in the typed policy object.",
  "pkg/policy/api/groups.go",
  22,
  22
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toGroups[].aws.labels",
  "map[string]string",
  "map[string]string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toGroups[].aws.labels[<exact-key>]",
  "string",
  "string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toGroups[].aws.region",
  "string",
  "string",
  "Deprecated: Region is unused.",
  "pkg/policy/api/groups.go",
  45,
  46
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toGroups[].aws.securityGroupsIds",
  "[]string",
  "[]string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toGroups[].aws.securityGroupsIds[]",
  "string",
  "string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toGroups[].aws.securityGroupsNames",
  "[]string",
  "[]string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toGroups[].aws.securityGroupsNames[]",
  "string",
  "string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toNodes",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "ToNodes is a list of nodes identified by an EndpointSelector to which endpoints subject to the rule is allowed to communicate.",
  "pkg/policy/api/egress.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toNodes[]",
  "EndpointSelector",
  "EndpointSelector",
  "ToNodes is a list of nodes identified by an EndpointSelector to which endpoints subject to the rule is allowed to communicate.",
  "pkg/policy/api/egress.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toNodes[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toNodes[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toNodes[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toNodes[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toNodes[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toNodes[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toNodes[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toNodes[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toPorts",
  "PortDenyRules",
  "[]PortDenyRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is not allowed to connect to.",
  "pkg/policy/api/egress.go",
  208,
  209
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toPorts[]",
  "PortDenyRule",
  "PortDenyRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is not allowed to connect to.",
  "pkg/policy/api/egress.go",
  208,
  209
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toPorts[].ports",
  "[]PortProtocol",
  "[]PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  284,
  285
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toPorts[].ports[]",
  "PortProtocol",
  "PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  284,
  285
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toPorts[].ports[].endPort",
  "int32",
  "int32",
  "EndPort can only be an L4 port number.",
  "pkg/policy/api/l4.go",
  53,
  54
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toPorts[].ports[].port",
  "string",
  "string",
  "Port can be an L4 port number, or a name in the form of \"http\" or \"http-8080\".",
  "pkg/policy/api/l4.go",
  46,
  47
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toPorts[].ports[].protocol",
  "L4Proto",
  "string",
  "Protocol is the L4 protocol.",
  "pkg/policy/api/l4.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toRequires",
  "[]string",
  "[]string",
  "Deprecated.",
  "pkg/policy/api/egress.go",
  33,
  34
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toRequires[]",
  "string",
  "string",
  "Deprecated.",
  "pkg/policy/api/egress.go",
  33,
  34
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toServices",
  "[]Service",
  "[]Service",
  "ToServices is a list of services to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  79,
  80
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toServices[]",
  "Service",
  "Service",
  "ToServices is a list of services to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  79,
  80
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sService",
  "*K8sServiceNamespace",
  "*K8sServiceNamespace",
  "K8sService selects service by name and namespace pair.",
  "pkg/policy/api/service.go",
  16,
  17
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sService.namespace",
  "string",
  "string",
  "Carries namespace in the typed policy object.",
  "pkg/policy/api/service.go",
  23,
  23
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sService.serviceName",
  "string",
  "string",
  "Carries serviceName in the typed policy object.",
  "pkg/policy/api/service.go",
  22,
  22
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector",
  "*K8sServiceSelectorNamespace",
  "*K8sServiceSelectorNamespace",
  "K8sServiceSelector selects services by k8s labels and namespace.",
  "pkg/policy/api/service.go",
  14,
  15
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.namespace",
  "string",
  "string",
  "Carries namespace in the typed policy object.",
  "pkg/policy/api/service.go",
  30,
  30
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector",
  "ServiceSelector",
  "EndpointSelector",
  "Carries selector in the typed policy object.",
  "pkg/policy/api/service.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.enableDefaultDeny",
  "DefaultDenyConfig",
  "DefaultDenyConfig",
  "EnableDefaultDeny determines whether this policy configures the subject endpoint(s) to have a default deny mode.",
  "pkg/policy/api/rule.go",
  135,
  136
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.enableDefaultDeny.egress",
  "*bool",
  "*bool",
  "Whether or not the endpoint should have a default-deny rule applied to egress traffic.",
  "pkg/policy/api/rule.go",
  41,
  42
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.enableDefaultDeny.ingress",
  "*bool",
  "*bool",
  "Whether or not the endpoint should have a default-deny rule applied to ingress traffic.",
  "pkg/policy/api/rule.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.endpointSelector",
  "EndpointSelector",
  "EndpointSelector",
  "EndpointSelector selects all endpoints which should be subject to this rule.",
  "pkg/policy/api/rule.go",
  73,
  74
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.endpointSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.endpointSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.endpointSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.endpointSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.endpointSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.endpointSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.endpointSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.endpointSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress",
  "[]IngressRule",
  "[]IngressRule",
  "Ingress is a list of IngressRule which are enforced at ingress.",
  "pkg/policy/api/rule.go",
  86,
  87
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[]",
  "IngressRule",
  "IngressRule",
  "Ingress is a list of IngressRule which are enforced at ingress.",
  "pkg/policy/api/rule.go",
  86,
  87
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].authentication",
  "*Authentication",
  "*Authentication",
  "Authentication is the required authentication type for the allowed traffic, if any.",
  "pkg/policy/api/ingress.go",
  160,
  161
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].authentication.mode",
  "AuthenticationMode",
  "string",
  "Mode is the required authentication mode for the allowed traffic, if any.",
  "pkg/policy/api/rule.go",
  25,
  26
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromCIDR",
  "CIDRSlice",
  "[]CIDR",
  "FromCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  50,
  51
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromCIDR[]",
  "CIDR",
  "string",
  "FromCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  50,
  51
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet",
  "CIDRRuleSlice",
  "[]CIDRRule",
  "FromCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from in addition to FromEndpoints, along with a list of subnets contained within their corresponding IP block from which traffic should not be allowed.",
  "pkg/policy/api/ingress.go",
  65,
  66
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[]",
  "CIDRRule",
  "CIDRRule",
  "FromCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from in addition to FromEndpoints, along with a list of subnets contained within their corresponding IP block from which traffic should not be allowed.",
  "pkg/policy/api/ingress.go",
  65,
  66
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidr",
  "CIDR",
  "string",
  "CIDR is a CIDR prefix / IP Block.",
  "pkg/policy/api/cidr.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupRef",
  "CIDRGroupRef",
  "string",
  "CIDRGroupRef is a reference to a CiliumCIDRGroup object.",
  "pkg/policy/api/cidr.go",
  36,
  37
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector",
  "EndpointSelector",
  "EndpointSelector",
  "CIDRGroupSelector selects CiliumCIDRGroups by their labels, rather than by name.",
  "pkg/policy/api/cidr.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].except",
  "[]CIDR",
  "[]CIDR",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].except[]",
  "CIDR",
  "string",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromEndpoints",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "FromEndpoints is a list of endpoints identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  29,
  30
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[]",
  "EndpointSelector",
  "EndpointSelector",
  "FromEndpoints is a list of endpoints identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  29,
  30
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromEntities",
  "EntitySlice",
  "[]Entity",
  "FromEntities is a list of special entities which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  73,
  74
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromEntities[]",
  "Entity",
  "string",
  "FromEntities is a list of special entities which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  73,
  74
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromGroups",
  "[]Groups",
  "[]Groups",
  "FromGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/ingress.go",
  88,
  89
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromGroups[]",
  "Groups",
  "Groups",
  "FromGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/ingress.go",
  88,
  89
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromGroups[].aws",
  "*AWSGroup",
  "*AWSGroup",
  "Carries aws in the typed policy object.",
  "pkg/policy/api/groups.go",
  22,
  22
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromGroups[].aws.labels",
  "map[string]string",
  "map[string]string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromGroups[].aws.labels[<exact-key>]",
  "string",
  "string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromGroups[].aws.region",
  "string",
  "string",
  "Deprecated: Region is unused.",
  "pkg/policy/api/groups.go",
  45,
  46
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromGroups[].aws.securityGroupsIds",
  "[]string",
  "[]string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromGroups[].aws.securityGroupsIds[]",
  "string",
  "string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromGroups[].aws.securityGroupsNames",
  "[]string",
  "[]string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromGroups[].aws.securityGroupsNames[]",
  "string",
  "string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromNodes",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "FromNodes is a list of nodes identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  95,
  96
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromNodes[]",
  "EndpointSelector",
  "EndpointSelector",
  "FromNodes is a list of nodes identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  95,
  96
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromNodes[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromNodes[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromNodes[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromNodes[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromNodes[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromNodes[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromNodes[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromNodes[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromRequires",
  "[]string",
  "[]string",
  "Deprecated.",
  "pkg/policy/api/ingress.go",
  34,
  35
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].fromRequires[]",
  "string",
  "string",
  "Deprecated.",
  "pkg/policy/api/ingress.go",
  34,
  35
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].icmps",
  "ICMPRules",
  "[]ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  155,
  156
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].icmps[]",
  "ICMPRule",
  "ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  155,
  156
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].icmps[].fields",
  "[]ICMPField",
  "[]ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].icmps[].fields[]",
  "ICMPField",
  "ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].icmps[].fields[].family",
  "string",
  "string",
  "Family is a IP address version.",
  "pkg/policy/api/icmp.go",
  87,
  88
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].icmps[].fields[].type",
  "*intstr.IntOrString",
  "*intstr.IntOrString",
  "Type is a ICMP-type.",
  "pkg/policy/api/icmp.go",
  107,
  108
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts",
  "PortRules",
  "[]PortRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  144,
  145
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[]",
  "PortRule",
  "PortRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  144,
  145
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].listener",
  "*Listener",
  "*Listener",
  "listener specifies the name of a custom Envoy listener to which this traffic should be redirected to.",
  "pkg/policy/api/l4.go",
  249,
  250
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].listener.envoyConfig",
  "*EnvoyConfig",
  "*EnvoyConfig",
  "EnvoyConfig is a reference to the CEC or CCEC resource in which the listener is defined.",
  "pkg/policy/api/l4.go",
  165,
  166
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].listener.envoyConfig.kind",
  "string",
  "string",
  "Kind is the resource type being referred to.",
  "pkg/policy/api/l4.go",
  149,
  150
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].listener.envoyConfig.name",
  "string",
  "string",
  "Name is the resource name of the CiliumEnvoyConfig or CiliumClusterwideEnvoyConfig where the listener is defined in.",
  "pkg/policy/api/l4.go",
  156,
  157
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].listener.name",
  "string",
  "string",
  "Name is the name of the listener.",
  "pkg/policy/api/l4.go",
  171,
  172
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].listener.priority",
  "uint8",
  "uint8",
  "Priority for this Listener that is used when multiple rules would apply different listeners to a policy map entry.",
  "pkg/policy/api/l4.go",
  179,
  180
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].originatingTLS",
  "*TLSContext",
  "*TLSContext",
  "OriginatingTLS is the TLS context for the connections originated by the L7 proxy.",
  "pkg/policy/api/l4.go",
  234,
  235
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].originatingTLS.certificate",
  "string",
  "string",
  "Certificate is the file name or k8s secret item name for the certificate chain.",
  "pkg/policy/api/l4.go",
  129,
  130
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].originatingTLS.privateKey",
  "string",
  "string",
  "PrivateKey is the file name or k8s secret item name for the private key matching the certificate chain.",
  "pkg/policy/api/l4.go",
  136,
  137
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].originatingTLS.secret",
  "*Secret",
  "*Secret",
  "Secret is the secret that contains the certificates and private key for the TLS context.",
  "pkg/policy/api/l4.go",
  115,
  116
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].originatingTLS.secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].originatingTLS.secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].originatingTLS.trustedCA",
  "string",
  "string",
  "TrustedCA is the file name or k8s secret item name for the trusted CA.",
  "pkg/policy/api/l4.go",
  122,
  123
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].ports",
  "[]PortProtocol",
  "[]PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  214,
  215
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].ports[]",
  "PortProtocol",
  "PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  214,
  215
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].ports[].endPort",
  "int32",
  "int32",
  "EndPort can only be an L4 port number.",
  "pkg/policy/api/l4.go",
  53,
  54
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].ports[].port",
  "string",
  "string",
  "Port can be an L4 port number, or a name in the form of \"http\" or \"http-8080\".",
  "pkg/policy/api/l4.go",
  46,
  47
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].ports[].protocol",
  "L4Proto",
  "string",
  "Protocol is the L4 protocol.",
  "pkg/policy/api/l4.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules",
  "*L7Rules",
  "*L7Rules",
  "Rules is a list of additional port level rules which must be met in order for the PortRule to allow the traffic.",
  "pkg/policy/api/l4.go",
  256,
  257
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.dns",
  "PortRulesDNS",
  "[]PortRuleDNS",
  "DNS-specific rules.",
  "pkg/policy/api/l4.go",
  311,
  312
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.dns[]",
  "PortRuleDNS",
  "FQDNSelector",
  "DNS-specific rules.",
  "pkg/policy/api/l4.go",
  311,
  312
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.dns[].matchName",
  "string",
  "string",
  "MatchName matches literal DNS names.",
  "pkg/policy/api/fqdn.go",
  39,
  40
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.dns[].matchPattern",
  "string",
  "string",
  "MatchPattern allows using wildcards to match DNS names.",
  "pkg/policy/api/fqdn.go",
  64,
  65
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http",
  "PortRulesHTTP",
  "[]PortRuleHTTP",
  "HTTP specific rules.",
  "pkg/policy/api/l4.go",
  305,
  306
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[]",
  "PortRuleHTTP",
  "PortRuleHTTP",
  "HTTP specific rules.",
  "pkg/policy/api/l4.go",
  305,
  306
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headerMatches",
  "[]*HeaderMatch",
  "[]*HeaderMatch",
  "HeaderMatches is a list of HTTP headers which must be present and match against the given values.",
  "pkg/policy/api/http.go",
  107,
  108
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headerMatches[]",
  "*HeaderMatch",
  "*HeaderMatch",
  "HeaderMatches is a list of HTTP headers which must be present and match against the given values.",
  "pkg/policy/api/http.go",
  107,
  108
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headerMatches[].mismatch",
  "MismatchAction",
  "string",
  "Mismatch identifies what to do in case there is no match.",
  "pkg/policy/api/http.go",
  34,
  35
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headerMatches[].name",
  "string",
  "string",
  "Name identifies the header.",
  "pkg/policy/api/http.go",
  39,
  40
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headerMatches[].secret",
  "*Secret",
  "*Secret",
  "Secret refers to a secret that contains the value to be matched against.",
  "pkg/policy/api/http.go",
  46,
  47
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headerMatches[].secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headerMatches[].secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headerMatches[].value",
  "string",
  "string",
  "Value matches the exact value of the header.",
  "pkg/policy/api/http.go",
  53,
  54
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headers",
  "[]string",
  "[]string",
  "Headers is a list of HTTP headers which must be present in the request.",
  "pkg/policy/api/http.go",
  100,
  101
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headers[]",
  "string",
  "string",
  "Headers is a list of HTTP headers which must be present in the request.",
  "pkg/policy/api/http.go",
  100,
  101
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].host",
  "string",
  "string",
  "Host is an extended POSIX regex matched against the host header of a request.",
  "pkg/policy/api/http.go",
  93,
  94
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].method",
  "string",
  "string",
  "Method is an extended POSIX regex matched against the method of a request, e.g.",
  "pkg/policy/api/http.go",
  81,
  82
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].path",
  "string",
  "string",
  "Path is an extended POSIX regex matched against the path of a request.",
  "pkg/policy/api/http.go",
  73,
  74
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].serverNames",
  "[]ServerName",
  "[]ServerName",
  "ServerNames is a list of allowed TLS SNI values.",
  "pkg/policy/api/l4.go",
  243,
  244
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].serverNames[]",
  "ServerName",
  "string",
  "ServerNames is a list of allowed TLS SNI values.",
  "pkg/policy/api/l4.go",
  243,
  244
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].terminatingTLS",
  "*TLSContext",
  "*TLSContext",
  "TerminatingTLS is the TLS context for the connection terminated by the L7 proxy.",
  "pkg/policy/api/l4.go",
  224,
  225
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].terminatingTLS.certificate",
  "string",
  "string",
  "Certificate is the file name or k8s secret item name for the certificate chain.",
  "pkg/policy/api/l4.go",
  129,
  130
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].terminatingTLS.privateKey",
  "string",
  "string",
  "PrivateKey is the file name or k8s secret item name for the private key matching the certificate chain.",
  "pkg/policy/api/l4.go",
  136,
  137
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].terminatingTLS.secret",
  "*Secret",
  "*Secret",
  "Secret is the secret that contains the certificates and private key for the TLS context.",
  "pkg/policy/api/l4.go",
  115,
  116
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].terminatingTLS.secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].terminatingTLS.secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingress[].toPorts[].terminatingTLS.trustedCA",
  "string",
  "string",
  "TrustedCA is the file name or k8s secret item name for the trusted CA.",
  "pkg/policy/api/l4.go",
  122,
  123
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny",
  "[]IngressDenyRule",
  "[]IngressDenyRule",
  "IngressDeny is a list of IngressDenyRule which are enforced at ingress.",
  "pkg/policy/api/rule.go",
  94,
  95
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[]",
  "IngressDenyRule",
  "IngressDenyRule",
  "IngressDeny is a list of IngressDenyRule which are enforced at ingress.",
  "pkg/policy/api/rule.go",
  94,
  95
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDR",
  "CIDRSlice",
  "[]CIDR",
  "FromCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  50,
  51
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDR[]",
  "CIDR",
  "string",
  "FromCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  50,
  51
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet",
  "CIDRRuleSlice",
  "[]CIDRRule",
  "FromCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from in addition to FromEndpoints, along with a list of subnets contained within their corresponding IP block from which traffic should not be allowed.",
  "pkg/policy/api/ingress.go",
  65,
  66
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[]",
  "CIDRRule",
  "CIDRRule",
  "FromCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from in addition to FromEndpoints, along with a list of subnets contained within their corresponding IP block from which traffic should not be allowed.",
  "pkg/policy/api/ingress.go",
  65,
  66
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidr",
  "CIDR",
  "string",
  "CIDR is a CIDR prefix / IP Block.",
  "pkg/policy/api/cidr.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupRef",
  "CIDRGroupRef",
  "string",
  "CIDRGroupRef is a reference to a CiliumCIDRGroup object.",
  "pkg/policy/api/cidr.go",
  36,
  37
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector",
  "EndpointSelector",
  "EndpointSelector",
  "CIDRGroupSelector selects CiliumCIDRGroups by their labels, rather than by name.",
  "pkg/policy/api/cidr.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].except",
  "[]CIDR",
  "[]CIDR",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].except[]",
  "CIDR",
  "string",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "FromEndpoints is a list of endpoints identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  29,
  30
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[]",
  "EndpointSelector",
  "EndpointSelector",
  "FromEndpoints is a list of endpoints identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  29,
  30
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromEntities",
  "EntitySlice",
  "[]Entity",
  "FromEntities is a list of special entities which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  73,
  74
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromEntities[]",
  "Entity",
  "string",
  "FromEntities is a list of special entities which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  73,
  74
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups",
  "[]Groups",
  "[]Groups",
  "FromGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/ingress.go",
  88,
  89
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[]",
  "Groups",
  "Groups",
  "FromGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/ingress.go",
  88,
  89
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[].aws",
  "*AWSGroup",
  "*AWSGroup",
  "Carries aws in the typed policy object.",
  "pkg/policy/api/groups.go",
  22,
  22
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[].aws.labels",
  "map[string]string",
  "map[string]string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[].aws.labels[<exact-key>]",
  "string",
  "string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[].aws.region",
  "string",
  "string",
  "Deprecated: Region is unused.",
  "pkg/policy/api/groups.go",
  45,
  46
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[].aws.securityGroupsIds",
  "[]string",
  "[]string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[].aws.securityGroupsIds[]",
  "string",
  "string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[].aws.securityGroupsNames",
  "[]string",
  "[]string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[].aws.securityGroupsNames[]",
  "string",
  "string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "FromNodes is a list of nodes identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  95,
  96
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[]",
  "EndpointSelector",
  "EndpointSelector",
  "FromNodes is a list of nodes identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  95,
  96
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromRequires",
  "[]string",
  "[]string",
  "Deprecated.",
  "pkg/policy/api/ingress.go",
  34,
  35
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].fromRequires[]",
  "string",
  "string",
  "Deprecated.",
  "pkg/policy/api/ingress.go",
  34,
  35
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].icmps",
  "ICMPRules",
  "[]ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is not allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  199,
  200
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].icmps[]",
  "ICMPRule",
  "ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is not allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  199,
  200
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].icmps[].fields",
  "[]ICMPField",
  "[]ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].icmps[].fields[]",
  "ICMPField",
  "ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].icmps[].fields[].family",
  "string",
  "string",
  "Family is a IP address version.",
  "pkg/policy/api/icmp.go",
  87,
  88
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].icmps[].fields[].type",
  "*intstr.IntOrString",
  "*intstr.IntOrString",
  "Type is a ICMP-type.",
  "pkg/policy/api/icmp.go",
  107,
  108
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].toPorts",
  "PortDenyRules",
  "[]PortDenyRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is not allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  188,
  189
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].toPorts[]",
  "PortDenyRule",
  "PortDenyRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is not allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  188,
  189
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].toPorts[].ports",
  "[]PortProtocol",
  "[]PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  284,
  285
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].toPorts[].ports[]",
  "PortProtocol",
  "PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  284,
  285
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].toPorts[].ports[].endPort",
  "int32",
  "int32",
  "EndPort can only be an L4 port number.",
  "pkg/policy/api/l4.go",
  53,
  54
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].toPorts[].ports[].port",
  "string",
  "string",
  "Port can be an L4 port number, or a name in the form of \"http\" or \"http-8080\".",
  "pkg/policy/api/l4.go",
  46,
  47
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.ingressDeny[].toPorts[].ports[].protocol",
  "L4Proto",
  "string",
  "Protocol is the L4 protocol.",
  "pkg/policy/api/l4.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.labels",
  "labels.LabelArray",
  "[]Label",
  "Labels is a list of optional strings which can be used to re-identify the rule or to store metadata.",
  "pkg/policy/api/rule.go",
  116,
  117
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.labels[]",
  "Label",
  "Label",
  "Labels is a list of optional strings which can be used to re-identify the rule or to store metadata.",
  "pkg/policy/api/rule.go",
  116,
  117
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.labels[].key",
  "string",
  "string",
  "Carries key in the typed policy object.",
  "pkg/labels/labels.go",
  209,
  209
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.labels[].source",
  "string",
  "string",
  "Source can be one of the above values (e.g.: LabelSourceK8s).",
  "pkg/labels/labels.go",
  213,
  214
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.labels[].value",
  "string",
  "string",
  "Carries value in the typed policy object.",
  "pkg/labels/labels.go",
  210,
  210
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.log",
  "LogConfig",
  "LogConfig",
  "Log specifies custom policy-specific Hubble logging configuration.",
  "pkg/policy/api/rule.go",
  147,
  148
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.log.value",
  "string",
  "string",
  "Value is a free-form string that is included in Hubble flows that match this policy.",
  "pkg/policy/api/rule.go",
  51,
  52
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.nodeSelector",
  "EndpointSelector",
  "EndpointSelector",
  "NodeSelector selects all nodes which should be subject to this rule.",
  "pkg/policy/api/rule.go",
  80,
  81
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.nodeSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.nodeSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.nodeSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.nodeSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.nodeSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.nodeSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.nodeSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.spec.nodeSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs",
  "api.Rules",
  "[]*Rule",
  "Specs is a list of desired Cilium specific rule specification.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  47,
  48
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[]",
  "*Rule",
  "*Rule",
  "Specs is a list of desired Cilium specific rule specification.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  47,
  48
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].description",
  "string",
  "string",
  "Description is a free form string, it can be used by the creator of the rule to store human readable explanation of the purpose of this rule.",
  "pkg/policy/api/rule.go",
  142,
  143
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress",
  "[]EgressRule",
  "[]EgressRule",
  "Egress is a list of EgressRule which are enforced at egress.",
  "pkg/policy/api/rule.go",
  100,
  101
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[]",
  "EgressRule",
  "EgressRule",
  "Egress is a list of EgressRule which are enforced at egress.",
  "pkg/policy/api/rule.go",
  100,
  101
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].authentication",
  "*Authentication",
  "*Authentication",
  "Authentication is the required authentication type for the allowed traffic, if any.",
  "pkg/policy/api/egress.go",
  180,
  181
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].authentication.mode",
  "AuthenticationMode",
  "string",
  "Mode is the required authentication mode for the allowed traffic, if any.",
  "pkg/policy/api/rule.go",
  25,
  26
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].icmps",
  "ICMPRules",
  "[]ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is allowed to connect to.",
  "pkg/policy/api/egress.go",
  175,
  176
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].icmps[]",
  "ICMPRule",
  "ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is allowed to connect to.",
  "pkg/policy/api/egress.go",
  175,
  176
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].icmps[].fields",
  "[]ICMPField",
  "[]ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].icmps[].fields[]",
  "ICMPField",
  "ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].icmps[].fields[].family",
  "string",
  "string",
  "Family is a IP address version.",
  "pkg/policy/api/icmp.go",
  87,
  88
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].icmps[].fields[].type",
  "*intstr.IntOrString",
  "*intstr.IntOrString",
  "Type is a ICMP-type.",
  "pkg/policy/api/icmp.go",
  107,
  108
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toCIDR",
  "CIDRSlice",
  "[]CIDR",
  "ToCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  48,
  49
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toCIDR[]",
  "CIDR",
  "string",
  "ToCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  48,
  49
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toCIDRSet",
  "CIDRRuleSlice",
  "[]CIDRRule",
  "ToCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections to in addition to connections which are allowed via ToEndpoints, along with a list of subnets contained within their corresponding IP block to which traffic should not be allowed.",
  "pkg/policy/api/egress.go",
  64,
  65
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[]",
  "CIDRRule",
  "CIDRRule",
  "ToCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections to in addition to connections which are allowed via ToEndpoints, along with a list of subnets contained within their corresponding IP block to which traffic should not be allowed.",
  "pkg/policy/api/egress.go",
  64,
  65
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidr",
  "CIDR",
  "string",
  "CIDR is a CIDR prefix / IP Block.",
  "pkg/policy/api/cidr.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupRef",
  "CIDRGroupRef",
  "string",
  "CIDRGroupRef is a reference to a CiliumCIDRGroup object.",
  "pkg/policy/api/cidr.go",
  36,
  37
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector",
  "EndpointSelector",
  "EndpointSelector",
  "CIDRGroupSelector selects CiliumCIDRGroups by their labels, rather than by name.",
  "pkg/policy/api/cidr.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].except",
  "[]CIDR",
  "[]CIDR",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].except[]",
  "CIDR",
  "string",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toEndpoints",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "ToEndpoints is a list of endpoints identified by an EndpointSelector to which the endpoints subject to the rule are allowed to communicate.",
  "pkg/policy/api/egress.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toEndpoints[]",
  "EndpointSelector",
  "EndpointSelector",
  "ToEndpoints is a list of endpoints identified by an EndpointSelector to which the endpoints subject to the rule are allowed to communicate.",
  "pkg/policy/api/egress.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toEndpoints[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toEndpoints[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toEndpoints[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toEndpoints[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toEndpoints[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toEndpoints[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toEndpoints[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toEndpoints[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toEntities",
  "EntitySlice",
  "[]Entity",
  "ToEntities is a list of special entities to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toEntities[]",
  "Entity",
  "string",
  "ToEntities is a list of special entities to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toFQDNs",
  "FQDNSelectorSlice",
  "[]FQDNSelector",
  "ToFQDN allows whitelisting DNS names in place of IPs.",
  "pkg/policy/api/egress.go",
  165,
  166
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toFQDNs[]",
  "FQDNSelector",
  "FQDNSelector",
  "ToFQDN allows whitelisting DNS names in place of IPs.",
  "pkg/policy/api/egress.go",
  165,
  166
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toFQDNs[].matchName",
  "string",
  "string",
  "MatchName matches literal DNS names.",
  "pkg/policy/api/fqdn.go",
  39,
  40
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toFQDNs[].matchPattern",
  "string",
  "string",
  "MatchPattern allows using wildcards to match DNS names.",
  "pkg/policy/api/fqdn.go",
  64,
  65
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toGroups",
  "[]Groups",
  "[]Groups",
  "ToGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/egress.go",
  93,
  94
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toGroups[]",
  "Groups",
  "Groups",
  "ToGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/egress.go",
  93,
  94
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toGroups[].aws",
  "*AWSGroup",
  "*AWSGroup",
  "Carries aws in the typed policy object.",
  "pkg/policy/api/groups.go",
  22,
  22
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toGroups[].aws.labels",
  "map[string]string",
  "map[string]string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toGroups[].aws.labels[<exact-key>]",
  "string",
  "string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toGroups[].aws.region",
  "string",
  "string",
  "Deprecated: Region is unused.",
  "pkg/policy/api/groups.go",
  45,
  46
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toGroups[].aws.securityGroupsIds",
  "[]string",
  "[]string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toGroups[].aws.securityGroupsIds[]",
  "string",
  "string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toGroups[].aws.securityGroupsNames",
  "[]string",
  "[]string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toGroups[].aws.securityGroupsNames[]",
  "string",
  "string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toNodes",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "ToNodes is a list of nodes identified by an EndpointSelector to which endpoints subject to the rule is allowed to communicate.",
  "pkg/policy/api/egress.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toNodes[]",
  "EndpointSelector",
  "EndpointSelector",
  "ToNodes is a list of nodes identified by an EndpointSelector to which endpoints subject to the rule is allowed to communicate.",
  "pkg/policy/api/egress.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toNodes[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toNodes[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toNodes[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toNodes[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toNodes[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toNodes[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toNodes[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toNodes[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts",
  "PortRules",
  "[]PortRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is allowed to connect to.",
  "pkg/policy/api/egress.go",
  148,
  149
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[]",
  "PortRule",
  "PortRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is allowed to connect to.",
  "pkg/policy/api/egress.go",
  148,
  149
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].listener",
  "*Listener",
  "*Listener",
  "listener specifies the name of a custom Envoy listener to which this traffic should be redirected to.",
  "pkg/policy/api/l4.go",
  249,
  250
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].listener.envoyConfig",
  "*EnvoyConfig",
  "*EnvoyConfig",
  "EnvoyConfig is a reference to the CEC or CCEC resource in which the listener is defined.",
  "pkg/policy/api/l4.go",
  165,
  166
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].listener.envoyConfig.kind",
  "string",
  "string",
  "Kind is the resource type being referred to.",
  "pkg/policy/api/l4.go",
  149,
  150
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].listener.envoyConfig.name",
  "string",
  "string",
  "Name is the resource name of the CiliumEnvoyConfig or CiliumClusterwideEnvoyConfig where the listener is defined in.",
  "pkg/policy/api/l4.go",
  156,
  157
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].listener.name",
  "string",
  "string",
  "Name is the name of the listener.",
  "pkg/policy/api/l4.go",
  171,
  172
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].listener.priority",
  "uint8",
  "uint8",
  "Priority for this Listener that is used when multiple rules would apply different listeners to a policy map entry.",
  "pkg/policy/api/l4.go",
  179,
  180
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].originatingTLS",
  "*TLSContext",
  "*TLSContext",
  "OriginatingTLS is the TLS context for the connections originated by the L7 proxy.",
  "pkg/policy/api/l4.go",
  234,
  235
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].originatingTLS.certificate",
  "string",
  "string",
  "Certificate is the file name or k8s secret item name for the certificate chain.",
  "pkg/policy/api/l4.go",
  129,
  130
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].originatingTLS.privateKey",
  "string",
  "string",
  "PrivateKey is the file name or k8s secret item name for the private key matching the certificate chain.",
  "pkg/policy/api/l4.go",
  136,
  137
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].originatingTLS.secret",
  "*Secret",
  "*Secret",
  "Secret is the secret that contains the certificates and private key for the TLS context.",
  "pkg/policy/api/l4.go",
  115,
  116
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].originatingTLS.secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].originatingTLS.secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].originatingTLS.trustedCA",
  "string",
  "string",
  "TrustedCA is the file name or k8s secret item name for the trusted CA.",
  "pkg/policy/api/l4.go",
  122,
  123
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].ports",
  "[]PortProtocol",
  "[]PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  214,
  215
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].ports[]",
  "PortProtocol",
  "PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  214,
  215
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].ports[].endPort",
  "int32",
  "int32",
  "EndPort can only be an L4 port number.",
  "pkg/policy/api/l4.go",
  53,
  54
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].ports[].port",
  "string",
  "string",
  "Port can be an L4 port number, or a name in the form of \"http\" or \"http-8080\".",
  "pkg/policy/api/l4.go",
  46,
  47
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].ports[].protocol",
  "L4Proto",
  "string",
  "Protocol is the L4 protocol.",
  "pkg/policy/api/l4.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules",
  "*L7Rules",
  "*L7Rules",
  "Rules is a list of additional port level rules which must be met in order for the PortRule to allow the traffic.",
  "pkg/policy/api/l4.go",
  256,
  257
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.dns",
  "PortRulesDNS",
  "[]PortRuleDNS",
  "DNS-specific rules.",
  "pkg/policy/api/l4.go",
  311,
  312
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.dns[]",
  "PortRuleDNS",
  "FQDNSelector",
  "DNS-specific rules.",
  "pkg/policy/api/l4.go",
  311,
  312
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.dns[].matchName",
  "string",
  "string",
  "MatchName matches literal DNS names.",
  "pkg/policy/api/fqdn.go",
  39,
  40
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.dns[].matchPattern",
  "string",
  "string",
  "MatchPattern allows using wildcards to match DNS names.",
  "pkg/policy/api/fqdn.go",
  64,
  65
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http",
  "PortRulesHTTP",
  "[]PortRuleHTTP",
  "HTTP specific rules.",
  "pkg/policy/api/l4.go",
  305,
  306
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[]",
  "PortRuleHTTP",
  "PortRuleHTTP",
  "HTTP specific rules.",
  "pkg/policy/api/l4.go",
  305,
  306
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headerMatches",
  "[]*HeaderMatch",
  "[]*HeaderMatch",
  "HeaderMatches is a list of HTTP headers which must be present and match against the given values.",
  "pkg/policy/api/http.go",
  107,
  108
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headerMatches[]",
  "*HeaderMatch",
  "*HeaderMatch",
  "HeaderMatches is a list of HTTP headers which must be present and match against the given values.",
  "pkg/policy/api/http.go",
  107,
  108
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headerMatches[].mismatch",
  "MismatchAction",
  "string",
  "Mismatch identifies what to do in case there is no match.",
  "pkg/policy/api/http.go",
  34,
  35
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headerMatches[].name",
  "string",
  "string",
  "Name identifies the header.",
  "pkg/policy/api/http.go",
  39,
  40
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headerMatches[].secret",
  "*Secret",
  "*Secret",
  "Secret refers to a secret that contains the value to be matched against.",
  "pkg/policy/api/http.go",
  46,
  47
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headerMatches[].secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headerMatches[].secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headerMatches[].value",
  "string",
  "string",
  "Value matches the exact value of the header.",
  "pkg/policy/api/http.go",
  53,
  54
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headers",
  "[]string",
  "[]string",
  "Headers is a list of HTTP headers which must be present in the request.",
  "pkg/policy/api/http.go",
  100,
  101
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headers[]",
  "string",
  "string",
  "Headers is a list of HTTP headers which must be present in the request.",
  "pkg/policy/api/http.go",
  100,
  101
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].host",
  "string",
  "string",
  "Host is an extended POSIX regex matched against the host header of a request.",
  "pkg/policy/api/http.go",
  93,
  94
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].method",
  "string",
  "string",
  "Method is an extended POSIX regex matched against the method of a request, e.g.",
  "pkg/policy/api/http.go",
  81,
  82
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].path",
  "string",
  "string",
  "Path is an extended POSIX regex matched against the path of a request.",
  "pkg/policy/api/http.go",
  73,
  74
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].serverNames",
  "[]ServerName",
  "[]ServerName",
  "ServerNames is a list of allowed TLS SNI values.",
  "pkg/policy/api/l4.go",
  243,
  244
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].serverNames[]",
  "ServerName",
  "string",
  "ServerNames is a list of allowed TLS SNI values.",
  "pkg/policy/api/l4.go",
  243,
  244
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].terminatingTLS",
  "*TLSContext",
  "*TLSContext",
  "TerminatingTLS is the TLS context for the connection terminated by the L7 proxy.",
  "pkg/policy/api/l4.go",
  224,
  225
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].terminatingTLS.certificate",
  "string",
  "string",
  "Certificate is the file name or k8s secret item name for the certificate chain.",
  "pkg/policy/api/l4.go",
  129,
  130
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].terminatingTLS.privateKey",
  "string",
  "string",
  "PrivateKey is the file name or k8s secret item name for the private key matching the certificate chain.",
  "pkg/policy/api/l4.go",
  136,
  137
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].terminatingTLS.secret",
  "*Secret",
  "*Secret",
  "Secret is the secret that contains the certificates and private key for the TLS context.",
  "pkg/policy/api/l4.go",
  115,
  116
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].terminatingTLS.secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].terminatingTLS.secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toPorts[].terminatingTLS.trustedCA",
  "string",
  "string",
  "TrustedCA is the file name or k8s secret item name for the trusted CA.",
  "pkg/policy/api/l4.go",
  122,
  123
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toRequires",
  "[]string",
  "[]string",
  "Deprecated.",
  "pkg/policy/api/egress.go",
  33,
  34
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toRequires[]",
  "string",
  "string",
  "Deprecated.",
  "pkg/policy/api/egress.go",
  33,
  34
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toServices",
  "[]Service",
  "[]Service",
  "ToServices is a list of services to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  79,
  80
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toServices[]",
  "Service",
  "Service",
  "ToServices is a list of services to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  79,
  80
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sService",
  "*K8sServiceNamespace",
  "*K8sServiceNamespace",
  "K8sService selects service by name and namespace pair.",
  "pkg/policy/api/service.go",
  16,
  17
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sService.namespace",
  "string",
  "string",
  "Carries namespace in the typed policy object.",
  "pkg/policy/api/service.go",
  23,
  23
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sService.serviceName",
  "string",
  "string",
  "Carries serviceName in the typed policy object.",
  "pkg/policy/api/service.go",
  22,
  22
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector",
  "*K8sServiceSelectorNamespace",
  "*K8sServiceSelectorNamespace",
  "K8sServiceSelector selects services by k8s labels and namespace.",
  "pkg/policy/api/service.go",
  14,
  15
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.namespace",
  "string",
  "string",
  "Carries namespace in the typed policy object.",
  "pkg/policy/api/service.go",
  30,
  30
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector",
  "ServiceSelector",
  "EndpointSelector",
  "Carries selector in the typed policy object.",
  "pkg/policy/api/service.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny",
  "[]EgressDenyRule",
  "[]EgressDenyRule",
  "EgressDeny is a list of EgressDenyRule which are enforced at egress.",
  "pkg/policy/api/rule.go",
  108,
  109
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[]",
  "EgressDenyRule",
  "EgressDenyRule",
  "EgressDeny is a list of EgressDenyRule which are enforced at egress.",
  "pkg/policy/api/rule.go",
  108,
  109
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].icmps",
  "ICMPRules",
  "[]ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is not allowed to connect to.",
  "pkg/policy/api/egress.go",
  218,
  219
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].icmps[]",
  "ICMPRule",
  "ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is not allowed to connect to.",
  "pkg/policy/api/egress.go",
  218,
  219
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].icmps[].fields",
  "[]ICMPField",
  "[]ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].icmps[].fields[]",
  "ICMPField",
  "ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].icmps[].fields[].family",
  "string",
  "string",
  "Family is a IP address version.",
  "pkg/policy/api/icmp.go",
  87,
  88
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].icmps[].fields[].type",
  "*intstr.IntOrString",
  "*intstr.IntOrString",
  "Type is a ICMP-type.",
  "pkg/policy/api/icmp.go",
  107,
  108
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toCIDR",
  "CIDRSlice",
  "[]CIDR",
  "ToCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  48,
  49
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toCIDR[]",
  "CIDR",
  "string",
  "ToCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  48,
  49
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet",
  "CIDRRuleSlice",
  "[]CIDRRule",
  "ToCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections to in addition to connections which are allowed via ToEndpoints, along with a list of subnets contained within their corresponding IP block to which traffic should not be allowed.",
  "pkg/policy/api/egress.go",
  64,
  65
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[]",
  "CIDRRule",
  "CIDRRule",
  "ToCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections to in addition to connections which are allowed via ToEndpoints, along with a list of subnets contained within their corresponding IP block to which traffic should not be allowed.",
  "pkg/policy/api/egress.go",
  64,
  65
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidr",
  "CIDR",
  "string",
  "CIDR is a CIDR prefix / IP Block.",
  "pkg/policy/api/cidr.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupRef",
  "CIDRGroupRef",
  "string",
  "CIDRGroupRef is a reference to a CiliumCIDRGroup object.",
  "pkg/policy/api/cidr.go",
  36,
  37
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector",
  "EndpointSelector",
  "EndpointSelector",
  "CIDRGroupSelector selects CiliumCIDRGroups by their labels, rather than by name.",
  "pkg/policy/api/cidr.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].except",
  "[]CIDR",
  "[]CIDR",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].except[]",
  "CIDR",
  "string",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "ToEndpoints is a list of endpoints identified by an EndpointSelector to which the endpoints subject to the rule are allowed to communicate.",
  "pkg/policy/api/egress.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[]",
  "EndpointSelector",
  "EndpointSelector",
  "ToEndpoints is a list of endpoints identified by an EndpointSelector to which the endpoints subject to the rule are allowed to communicate.",
  "pkg/policy/api/egress.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toEntities",
  "EntitySlice",
  "[]Entity",
  "ToEntities is a list of special entities to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toEntities[]",
  "Entity",
  "string",
  "ToEntities is a list of special entities to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toGroups",
  "[]Groups",
  "[]Groups",
  "ToGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/egress.go",
  93,
  94
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[]",
  "Groups",
  "Groups",
  "ToGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/egress.go",
  93,
  94
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[].aws",
  "*AWSGroup",
  "*AWSGroup",
  "Carries aws in the typed policy object.",
  "pkg/policy/api/groups.go",
  22,
  22
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[].aws.labels",
  "map[string]string",
  "map[string]string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[].aws.labels[<exact-key>]",
  "string",
  "string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[].aws.region",
  "string",
  "string",
  "Deprecated: Region is unused.",
  "pkg/policy/api/groups.go",
  45,
  46
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[].aws.securityGroupsIds",
  "[]string",
  "[]string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[].aws.securityGroupsIds[]",
  "string",
  "string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[].aws.securityGroupsNames",
  "[]string",
  "[]string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[].aws.securityGroupsNames[]",
  "string",
  "string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toNodes",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "ToNodes is a list of nodes identified by an EndpointSelector to which endpoints subject to the rule is allowed to communicate.",
  "pkg/policy/api/egress.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[]",
  "EndpointSelector",
  "EndpointSelector",
  "ToNodes is a list of nodes identified by an EndpointSelector to which endpoints subject to the rule is allowed to communicate.",
  "pkg/policy/api/egress.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toPorts",
  "PortDenyRules",
  "[]PortDenyRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is not allowed to connect to.",
  "pkg/policy/api/egress.go",
  208,
  209
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toPorts[]",
  "PortDenyRule",
  "PortDenyRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is not allowed to connect to.",
  "pkg/policy/api/egress.go",
  208,
  209
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toPorts[].ports",
  "[]PortProtocol",
  "[]PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  284,
  285
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toPorts[].ports[]",
  "PortProtocol",
  "PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  284,
  285
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toPorts[].ports[].endPort",
  "int32",
  "int32",
  "EndPort can only be an L4 port number.",
  "pkg/policy/api/l4.go",
  53,
  54
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toPorts[].ports[].port",
  "string",
  "string",
  "Port can be an L4 port number, or a name in the form of \"http\" or \"http-8080\".",
  "pkg/policy/api/l4.go",
  46,
  47
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toPorts[].ports[].protocol",
  "L4Proto",
  "string",
  "Protocol is the L4 protocol.",
  "pkg/policy/api/l4.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toRequires",
  "[]string",
  "[]string",
  "Deprecated.",
  "pkg/policy/api/egress.go",
  33,
  34
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toRequires[]",
  "string",
  "string",
  "Deprecated.",
  "pkg/policy/api/egress.go",
  33,
  34
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toServices",
  "[]Service",
  "[]Service",
  "ToServices is a list of services to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  79,
  80
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toServices[]",
  "Service",
  "Service",
  "ToServices is a list of services to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  79,
  80
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sService",
  "*K8sServiceNamespace",
  "*K8sServiceNamespace",
  "K8sService selects service by name and namespace pair.",
  "pkg/policy/api/service.go",
  16,
  17
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sService.namespace",
  "string",
  "string",
  "Carries namespace in the typed policy object.",
  "pkg/policy/api/service.go",
  23,
  23
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sService.serviceName",
  "string",
  "string",
  "Carries serviceName in the typed policy object.",
  "pkg/policy/api/service.go",
  22,
  22
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector",
  "*K8sServiceSelectorNamespace",
  "*K8sServiceSelectorNamespace",
  "K8sServiceSelector selects services by k8s labels and namespace.",
  "pkg/policy/api/service.go",
  14,
  15
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.namespace",
  "string",
  "string",
  "Carries namespace in the typed policy object.",
  "pkg/policy/api/service.go",
  30,
  30
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector",
  "ServiceSelector",
  "EndpointSelector",
  "Carries selector in the typed policy object.",
  "pkg/policy/api/service.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].enableDefaultDeny",
  "DefaultDenyConfig",
  "DefaultDenyConfig",
  "EnableDefaultDeny determines whether this policy configures the subject endpoint(s) to have a default deny mode.",
  "pkg/policy/api/rule.go",
  135,
  136
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].enableDefaultDeny.egress",
  "*bool",
  "*bool",
  "Whether or not the endpoint should have a default-deny rule applied to egress traffic.",
  "pkg/policy/api/rule.go",
  41,
  42
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].enableDefaultDeny.ingress",
  "*bool",
  "*bool",
  "Whether or not the endpoint should have a default-deny rule applied to ingress traffic.",
  "pkg/policy/api/rule.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].endpointSelector",
  "EndpointSelector",
  "EndpointSelector",
  "EndpointSelector selects all endpoints which should be subject to this rule.",
  "pkg/policy/api/rule.go",
  73,
  74
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].endpointSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].endpointSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].endpointSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].endpointSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].endpointSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].endpointSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].endpointSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].endpointSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress",
  "[]IngressRule",
  "[]IngressRule",
  "Ingress is a list of IngressRule which are enforced at ingress.",
  "pkg/policy/api/rule.go",
  86,
  87
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[]",
  "IngressRule",
  "IngressRule",
  "Ingress is a list of IngressRule which are enforced at ingress.",
  "pkg/policy/api/rule.go",
  86,
  87
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].authentication",
  "*Authentication",
  "*Authentication",
  "Authentication is the required authentication type for the allowed traffic, if any.",
  "pkg/policy/api/ingress.go",
  160,
  161
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].authentication.mode",
  "AuthenticationMode",
  "string",
  "Mode is the required authentication mode for the allowed traffic, if any.",
  "pkg/policy/api/rule.go",
  25,
  26
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromCIDR",
  "CIDRSlice",
  "[]CIDR",
  "FromCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  50,
  51
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromCIDR[]",
  "CIDR",
  "string",
  "FromCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  50,
  51
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet",
  "CIDRRuleSlice",
  "[]CIDRRule",
  "FromCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from in addition to FromEndpoints, along with a list of subnets contained within their corresponding IP block from which traffic should not be allowed.",
  "pkg/policy/api/ingress.go",
  65,
  66
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[]",
  "CIDRRule",
  "CIDRRule",
  "FromCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from in addition to FromEndpoints, along with a list of subnets contained within their corresponding IP block from which traffic should not be allowed.",
  "pkg/policy/api/ingress.go",
  65,
  66
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidr",
  "CIDR",
  "string",
  "CIDR is a CIDR prefix / IP Block.",
  "pkg/policy/api/cidr.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupRef",
  "CIDRGroupRef",
  "string",
  "CIDRGroupRef is a reference to a CiliumCIDRGroup object.",
  "pkg/policy/api/cidr.go",
  36,
  37
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector",
  "EndpointSelector",
  "EndpointSelector",
  "CIDRGroupSelector selects CiliumCIDRGroups by their labels, rather than by name.",
  "pkg/policy/api/cidr.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].except",
  "[]CIDR",
  "[]CIDR",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].except[]",
  "CIDR",
  "string",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "FromEndpoints is a list of endpoints identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  29,
  30
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[]",
  "EndpointSelector",
  "EndpointSelector",
  "FromEndpoints is a list of endpoints identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  29,
  30
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromEntities",
  "EntitySlice",
  "[]Entity",
  "FromEntities is a list of special entities which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  73,
  74
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromEntities[]",
  "Entity",
  "string",
  "FromEntities is a list of special entities which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  73,
  74
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromGroups",
  "[]Groups",
  "[]Groups",
  "FromGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/ingress.go",
  88,
  89
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromGroups[]",
  "Groups",
  "Groups",
  "FromGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/ingress.go",
  88,
  89
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromGroups[].aws",
  "*AWSGroup",
  "*AWSGroup",
  "Carries aws in the typed policy object.",
  "pkg/policy/api/groups.go",
  22,
  22
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromGroups[].aws.labels",
  "map[string]string",
  "map[string]string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromGroups[].aws.labels[<exact-key>]",
  "string",
  "string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromGroups[].aws.region",
  "string",
  "string",
  "Deprecated: Region is unused.",
  "pkg/policy/api/groups.go",
  45,
  46
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromGroups[].aws.securityGroupsIds",
  "[]string",
  "[]string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromGroups[].aws.securityGroupsIds[]",
  "string",
  "string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromGroups[].aws.securityGroupsNames",
  "[]string",
  "[]string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromGroups[].aws.securityGroupsNames[]",
  "string",
  "string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromNodes",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "FromNodes is a list of nodes identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  95,
  96
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromNodes[]",
  "EndpointSelector",
  "EndpointSelector",
  "FromNodes is a list of nodes identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  95,
  96
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromNodes[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromNodes[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromNodes[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromNodes[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromNodes[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromNodes[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromNodes[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromNodes[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromRequires",
  "[]string",
  "[]string",
  "Deprecated.",
  "pkg/policy/api/ingress.go",
  34,
  35
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].fromRequires[]",
  "string",
  "string",
  "Deprecated.",
  "pkg/policy/api/ingress.go",
  34,
  35
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].icmps",
  "ICMPRules",
  "[]ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  155,
  156
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].icmps[]",
  "ICMPRule",
  "ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  155,
  156
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].icmps[].fields",
  "[]ICMPField",
  "[]ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].icmps[].fields[]",
  "ICMPField",
  "ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].icmps[].fields[].family",
  "string",
  "string",
  "Family is a IP address version.",
  "pkg/policy/api/icmp.go",
  87,
  88
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].icmps[].fields[].type",
  "*intstr.IntOrString",
  "*intstr.IntOrString",
  "Type is a ICMP-type.",
  "pkg/policy/api/icmp.go",
  107,
  108
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts",
  "PortRules",
  "[]PortRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  144,
  145
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[]",
  "PortRule",
  "PortRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  144,
  145
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].listener",
  "*Listener",
  "*Listener",
  "listener specifies the name of a custom Envoy listener to which this traffic should be redirected to.",
  "pkg/policy/api/l4.go",
  249,
  250
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].listener.envoyConfig",
  "*EnvoyConfig",
  "*EnvoyConfig",
  "EnvoyConfig is a reference to the CEC or CCEC resource in which the listener is defined.",
  "pkg/policy/api/l4.go",
  165,
  166
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].listener.envoyConfig.kind",
  "string",
  "string",
  "Kind is the resource type being referred to.",
  "pkg/policy/api/l4.go",
  149,
  150
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].listener.envoyConfig.name",
  "string",
  "string",
  "Name is the resource name of the CiliumEnvoyConfig or CiliumClusterwideEnvoyConfig where the listener is defined in.",
  "pkg/policy/api/l4.go",
  156,
  157
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].listener.name",
  "string",
  "string",
  "Name is the name of the listener.",
  "pkg/policy/api/l4.go",
  171,
  172
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].listener.priority",
  "uint8",
  "uint8",
  "Priority for this Listener that is used when multiple rules would apply different listeners to a policy map entry.",
  "pkg/policy/api/l4.go",
  179,
  180
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].originatingTLS",
  "*TLSContext",
  "*TLSContext",
  "OriginatingTLS is the TLS context for the connections originated by the L7 proxy.",
  "pkg/policy/api/l4.go",
  234,
  235
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].originatingTLS.certificate",
  "string",
  "string",
  "Certificate is the file name or k8s secret item name for the certificate chain.",
  "pkg/policy/api/l4.go",
  129,
  130
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].originatingTLS.privateKey",
  "string",
  "string",
  "PrivateKey is the file name or k8s secret item name for the private key matching the certificate chain.",
  "pkg/policy/api/l4.go",
  136,
  137
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].originatingTLS.secret",
  "*Secret",
  "*Secret",
  "Secret is the secret that contains the certificates and private key for the TLS context.",
  "pkg/policy/api/l4.go",
  115,
  116
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].originatingTLS.secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].originatingTLS.secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].originatingTLS.trustedCA",
  "string",
  "string",
  "TrustedCA is the file name or k8s secret item name for the trusted CA.",
  "pkg/policy/api/l4.go",
  122,
  123
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].ports",
  "[]PortProtocol",
  "[]PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  214,
  215
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].ports[]",
  "PortProtocol",
  "PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  214,
  215
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].ports[].endPort",
  "int32",
  "int32",
  "EndPort can only be an L4 port number.",
  "pkg/policy/api/l4.go",
  53,
  54
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].ports[].port",
  "string",
  "string",
  "Port can be an L4 port number, or a name in the form of \"http\" or \"http-8080\".",
  "pkg/policy/api/l4.go",
  46,
  47
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].ports[].protocol",
  "L4Proto",
  "string",
  "Protocol is the L4 protocol.",
  "pkg/policy/api/l4.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules",
  "*L7Rules",
  "*L7Rules",
  "Rules is a list of additional port level rules which must be met in order for the PortRule to allow the traffic.",
  "pkg/policy/api/l4.go",
  256,
  257
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.dns",
  "PortRulesDNS",
  "[]PortRuleDNS",
  "DNS-specific rules.",
  "pkg/policy/api/l4.go",
  311,
  312
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.dns[]",
  "PortRuleDNS",
  "FQDNSelector",
  "DNS-specific rules.",
  "pkg/policy/api/l4.go",
  311,
  312
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.dns[].matchName",
  "string",
  "string",
  "MatchName matches literal DNS names.",
  "pkg/policy/api/fqdn.go",
  39,
  40
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.dns[].matchPattern",
  "string",
  "string",
  "MatchPattern allows using wildcards to match DNS names.",
  "pkg/policy/api/fqdn.go",
  64,
  65
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http",
  "PortRulesHTTP",
  "[]PortRuleHTTP",
  "HTTP specific rules.",
  "pkg/policy/api/l4.go",
  305,
  306
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[]",
  "PortRuleHTTP",
  "PortRuleHTTP",
  "HTTP specific rules.",
  "pkg/policy/api/l4.go",
  305,
  306
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headerMatches",
  "[]*HeaderMatch",
  "[]*HeaderMatch",
  "HeaderMatches is a list of HTTP headers which must be present and match against the given values.",
  "pkg/policy/api/http.go",
  107,
  108
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headerMatches[]",
  "*HeaderMatch",
  "*HeaderMatch",
  "HeaderMatches is a list of HTTP headers which must be present and match against the given values.",
  "pkg/policy/api/http.go",
  107,
  108
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headerMatches[].mismatch",
  "MismatchAction",
  "string",
  "Mismatch identifies what to do in case there is no match.",
  "pkg/policy/api/http.go",
  34,
  35
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headerMatches[].name",
  "string",
  "string",
  "Name identifies the header.",
  "pkg/policy/api/http.go",
  39,
  40
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headerMatches[].secret",
  "*Secret",
  "*Secret",
  "Secret refers to a secret that contains the value to be matched against.",
  "pkg/policy/api/http.go",
  46,
  47
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headerMatches[].secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headerMatches[].secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headerMatches[].value",
  "string",
  "string",
  "Value matches the exact value of the header.",
  "pkg/policy/api/http.go",
  53,
  54
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headers",
  "[]string",
  "[]string",
  "Headers is a list of HTTP headers which must be present in the request.",
  "pkg/policy/api/http.go",
  100,
  101
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headers[]",
  "string",
  "string",
  "Headers is a list of HTTP headers which must be present in the request.",
  "pkg/policy/api/http.go",
  100,
  101
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].host",
  "string",
  "string",
  "Host is an extended POSIX regex matched against the host header of a request.",
  "pkg/policy/api/http.go",
  93,
  94
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].method",
  "string",
  "string",
  "Method is an extended POSIX regex matched against the method of a request, e.g.",
  "pkg/policy/api/http.go",
  81,
  82
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].path",
  "string",
  "string",
  "Path is an extended POSIX regex matched against the path of a request.",
  "pkg/policy/api/http.go",
  73,
  74
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].serverNames",
  "[]ServerName",
  "[]ServerName",
  "ServerNames is a list of allowed TLS SNI values.",
  "pkg/policy/api/l4.go",
  243,
  244
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].serverNames[]",
  "ServerName",
  "string",
  "ServerNames is a list of allowed TLS SNI values.",
  "pkg/policy/api/l4.go",
  243,
  244
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].terminatingTLS",
  "*TLSContext",
  "*TLSContext",
  "TerminatingTLS is the TLS context for the connection terminated by the L7 proxy.",
  "pkg/policy/api/l4.go",
  224,
  225
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].terminatingTLS.certificate",
  "string",
  "string",
  "Certificate is the file name or k8s secret item name for the certificate chain.",
  "pkg/policy/api/l4.go",
  129,
  130
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].terminatingTLS.privateKey",
  "string",
  "string",
  "PrivateKey is the file name or k8s secret item name for the private key matching the certificate chain.",
  "pkg/policy/api/l4.go",
  136,
  137
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].terminatingTLS.secret",
  "*Secret",
  "*Secret",
  "Secret is the secret that contains the certificates and private key for the TLS context.",
  "pkg/policy/api/l4.go",
  115,
  116
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].terminatingTLS.secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].terminatingTLS.secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingress[].toPorts[].terminatingTLS.trustedCA",
  "string",
  "string",
  "TrustedCA is the file name or k8s secret item name for the trusted CA.",
  "pkg/policy/api/l4.go",
  122,
  123
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny",
  "[]IngressDenyRule",
  "[]IngressDenyRule",
  "IngressDeny is a list of IngressDenyRule which are enforced at ingress.",
  "pkg/policy/api/rule.go",
  94,
  95
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[]",
  "IngressDenyRule",
  "IngressDenyRule",
  "IngressDeny is a list of IngressDenyRule which are enforced at ingress.",
  "pkg/policy/api/rule.go",
  94,
  95
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDR",
  "CIDRSlice",
  "[]CIDR",
  "FromCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  50,
  51
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDR[]",
  "CIDR",
  "string",
  "FromCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  50,
  51
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet",
  "CIDRRuleSlice",
  "[]CIDRRule",
  "FromCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from in addition to FromEndpoints, along with a list of subnets contained within their corresponding IP block from which traffic should not be allowed.",
  "pkg/policy/api/ingress.go",
  65,
  66
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[]",
  "CIDRRule",
  "CIDRRule",
  "FromCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from in addition to FromEndpoints, along with a list of subnets contained within their corresponding IP block from which traffic should not be allowed.",
  "pkg/policy/api/ingress.go",
  65,
  66
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidr",
  "CIDR",
  "string",
  "CIDR is a CIDR prefix / IP Block.",
  "pkg/policy/api/cidr.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupRef",
  "CIDRGroupRef",
  "string",
  "CIDRGroupRef is a reference to a CiliumCIDRGroup object.",
  "pkg/policy/api/cidr.go",
  36,
  37
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector",
  "EndpointSelector",
  "EndpointSelector",
  "CIDRGroupSelector selects CiliumCIDRGroups by their labels, rather than by name.",
  "pkg/policy/api/cidr.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].except",
  "[]CIDR",
  "[]CIDR",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].except[]",
  "CIDR",
  "string",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "FromEndpoints is a list of endpoints identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  29,
  30
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[]",
  "EndpointSelector",
  "EndpointSelector",
  "FromEndpoints is a list of endpoints identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  29,
  30
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromEntities",
  "EntitySlice",
  "[]Entity",
  "FromEntities is a list of special entities which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  73,
  74
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromEntities[]",
  "Entity",
  "string",
  "FromEntities is a list of special entities which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  73,
  74
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups",
  "[]Groups",
  "[]Groups",
  "FromGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/ingress.go",
  88,
  89
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[]",
  "Groups",
  "Groups",
  "FromGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/ingress.go",
  88,
  89
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[].aws",
  "*AWSGroup",
  "*AWSGroup",
  "Carries aws in the typed policy object.",
  "pkg/policy/api/groups.go",
  22,
  22
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[].aws.labels",
  "map[string]string",
  "map[string]string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[].aws.labels[<exact-key>]",
  "string",
  "string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[].aws.region",
  "string",
  "string",
  "Deprecated: Region is unused.",
  "pkg/policy/api/groups.go",
  45,
  46
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[].aws.securityGroupsIds",
  "[]string",
  "[]string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[].aws.securityGroupsIds[]",
  "string",
  "string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[].aws.securityGroupsNames",
  "[]string",
  "[]string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[].aws.securityGroupsNames[]",
  "string",
  "string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "FromNodes is a list of nodes identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  95,
  96
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[]",
  "EndpointSelector",
  "EndpointSelector",
  "FromNodes is a list of nodes identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  95,
  96
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromRequires",
  "[]string",
  "[]string",
  "Deprecated.",
  "pkg/policy/api/ingress.go",
  34,
  35
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].fromRequires[]",
  "string",
  "string",
  "Deprecated.",
  "pkg/policy/api/ingress.go",
  34,
  35
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].icmps",
  "ICMPRules",
  "[]ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is not allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  199,
  200
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].icmps[]",
  "ICMPRule",
  "ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is not allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  199,
  200
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].icmps[].fields",
  "[]ICMPField",
  "[]ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].icmps[].fields[]",
  "ICMPField",
  "ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].icmps[].fields[].family",
  "string",
  "string",
  "Family is a IP address version.",
  "pkg/policy/api/icmp.go",
  87,
  88
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].icmps[].fields[].type",
  "*intstr.IntOrString",
  "*intstr.IntOrString",
  "Type is a ICMP-type.",
  "pkg/policy/api/icmp.go",
  107,
  108
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].toPorts",
  "PortDenyRules",
  "[]PortDenyRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is not allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  188,
  189
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].toPorts[]",
  "PortDenyRule",
  "PortDenyRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is not allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  188,
  189
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].toPorts[].ports",
  "[]PortProtocol",
  "[]PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  284,
  285
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].toPorts[].ports[]",
  "PortProtocol",
  "PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  284,
  285
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].toPorts[].ports[].endPort",
  "int32",
  "int32",
  "EndPort can only be an L4 port number.",
  "pkg/policy/api/l4.go",
  53,
  54
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].toPorts[].ports[].port",
  "string",
  "string",
  "Port can be an L4 port number, or a name in the form of \"http\" or \"http-8080\".",
  "pkg/policy/api/l4.go",
  46,
  47
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].ingressDeny[].toPorts[].ports[].protocol",
  "L4Proto",
  "string",
  "Protocol is the L4 protocol.",
  "pkg/policy/api/l4.go",
  72,
  73
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].labels",
  "labels.LabelArray",
  "[]Label",
  "Labels is a list of optional strings which can be used to re-identify the rule or to store metadata.",
  "pkg/policy/api/rule.go",
  116,
  117
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].labels[]",
  "Label",
  "Label",
  "Labels is a list of optional strings which can be used to re-identify the rule or to store metadata.",
  "pkg/policy/api/rule.go",
  116,
  117
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].labels[].key",
  "string",
  "string",
  "Carries key in the typed policy object.",
  "pkg/labels/labels.go",
  209,
  209
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].labels[].source",
  "string",
  "string",
  "Source can be one of the above values (e.g.: LabelSourceK8s).",
  "pkg/labels/labels.go",
  213,
  214
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].labels[].value",
  "string",
  "string",
  "Carries value in the typed policy object.",
  "pkg/labels/labels.go",
  210,
  210
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].log",
  "LogConfig",
  "LogConfig",
  "Log specifies custom policy-specific Hubble logging configuration.",
  "pkg/policy/api/rule.go",
  147,
  148
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].log.value",
  "string",
  "string",
  "Value is a free-form string that is included in Hubble flows that match this policy.",
  "pkg/policy/api/rule.go",
  51,
  52
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].nodeSelector",
  "EndpointSelector",
  "EndpointSelector",
  "NodeSelector selects all nodes which should be subject to this rule.",
  "pkg/policy/api/rule.go",
  80,
  81
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].nodeSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].nodeSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].nodeSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].nodeSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].nodeSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].nodeSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].nodeSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.specs[].nodeSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumNetworkPolicy",
  "$.status",
  "CiliumNetworkPolicyStatus",
  "CiliumNetworkPolicyStatus",
  "Status is the status of the Cilium policy rule .",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  53,
  54
 ],
 [
  "CiliumNetworkPolicy",
  "$.status.conditions",
  "[]NetworkPolicyCondition",
  "[]NetworkPolicyCondition",
  "Carries conditions in the typed policy object.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  92,
  93
 ],
 [
  "CiliumNetworkPolicy",
  "$.status.conditions[]",
  "NetworkPolicyCondition",
  "NetworkPolicyCondition",
  "Carries conditions[] in the typed policy object.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  92,
  93
 ],
 [
  "CiliumNetworkPolicy",
  "$.status.conditions[].lastTransitionTime",
  "slimv1.Time",
  "Time",
  "The last time the condition transitioned from one status to another.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  264,
  265
 ],
 [
  "CiliumNetworkPolicy",
  "$.status.conditions[].message",
  "string",
  "string",
  "A human readable message indicating details about the transition.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  270,
  271
 ],
 [
  "CiliumNetworkPolicy",
  "$.status.conditions[].reason",
  "string",
  "string",
  "The reason for the condition's last transition.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  267,
  268
 ],
 [
  "CiliumNetworkPolicy",
  "$.status.conditions[].status",
  "v1.ConditionStatus",
  "string",
  "The status of the condition, one of True, False, or Unknown.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  261,
  262
 ],
 [
  "CiliumNetworkPolicy",
  "$.status.conditions[].type",
  "PolicyConditionType",
  "string",
  "The type of the policy condition.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  258,
  259
 ],
 [
  "CiliumNetworkPolicy",
  "$.status.derivativePolicies",
  "map[string]CiliumNetworkPolicyNodeStatus",
  "map[string]CiliumNetworkPolicyNodeStatus",
  "DerivativePolicies is the status of all policies derived from the Cilium policy .",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  85,
  86
 ],
 [
  "CiliumNetworkPolicy",
  "$.status.derivativePolicies[<exact-key>]",
  "CiliumNetworkPolicyNodeStatus",
  "CiliumNetworkPolicyNodeStatus",
  "DerivativePolicies is the status of all policies derived from the Cilium policy .",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  85,
  86
 ],
 [
  "CiliumNetworkPolicy",
  "$.status.derivativePolicies[<exact-key>].annotations",
  "map[string]string",
  "map[string]string",
  "Annotations corresponds to the Annotations in the ObjectMeta of the CNP that have been realized on the node for CNP.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  138,
  139
 ],
 [
  "CiliumNetworkPolicy",
  "$.status.derivativePolicies[<exact-key>].annotations[<exact-key>]",
  "string",
  "string",
  "Annotations corresponds to the Annotations in the ObjectMeta of the CNP that have been realized on the node for CNP.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  138,
  139
 ],
 [
  "CiliumNetworkPolicy",
  "$.status.derivativePolicies[<exact-key>].enforcing",
  "bool",
  "bool",
  "Enforcing is set to true once all endpoints present at the time the policy has been imported are enforcing this policy.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  128,
  129
 ],
 [
  "CiliumNetworkPolicy",
  "$.status.derivativePolicies[<exact-key>].error",
  "string",
  "string",
  "Error describes any error that occurred when parsing or importing the policy, or realizing the policy for the endpoints to which it applies on the node.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  111,
  112
 ],
 [
  "CiliumNetworkPolicy",
  "$.status.derivativePolicies[<exact-key>].lastUpdated",
  "slimv1.Time",
  "Time",
  "LastUpdated contains the last time this status was updated .",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  116,
  117
 ],
 [
  "CiliumNetworkPolicy",
  "$.status.derivativePolicies[<exact-key>].localPolicyRevision",
  "uint64",
  "uint64",
  "Revision is the policy revision of the repository which first implemented this policy.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  122,
  123
 ],
 [
  "CiliumNetworkPolicy",
  "$.status.derivativePolicies[<exact-key>].ok",
  "bool",
  "bool",
  "OK is true when the policy has been parsed and imported successfully into the in-memory policy repository on the node.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  104,
  105
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$",
  "CiliumClusterwideNetworkPolicy",
  "CiliumClusterwideNetworkPolicy",
  "Cilium extended network policy object.",
  "pkg/k8s/apis/cilium.io/v2/ccnp_types.go",
  29,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.apiVersion",
  "string",
  "string",
  "Kubernetes typed request envelope.",
  "vendor/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
  1402,
  1402
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.kind",
  "string",
  "string",
  "Kubernetes typed request envelope.",
  "vendor/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
  1239,
  1239
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.metadata",
  "metav1.ObjectMeta",
  "ObjectMeta",
  "Carries metadata in the typed policy object.",
  "pkg/k8s/apis/cilium.io/v2/ccnp_types.go",
  33,
  34
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec",
  "*api.Rule",
  "*Rule",
  "Spec is the desired Cilium specific rule specification.",
  "pkg/k8s/apis/cilium.io/v2/ccnp_types.go",
  38,
  39
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.description",
  "string",
  "string",
  "Description is a free form string, it can be used by the creator of the rule to store human readable explanation of the purpose of this rule.",
  "pkg/policy/api/rule.go",
  142,
  143
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress",
  "[]EgressRule",
  "[]EgressRule",
  "Egress is a list of EgressRule which are enforced at egress.",
  "pkg/policy/api/rule.go",
  100,
  101
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[]",
  "EgressRule",
  "EgressRule",
  "Egress is a list of EgressRule which are enforced at egress.",
  "pkg/policy/api/rule.go",
  100,
  101
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].authentication",
  "*Authentication",
  "*Authentication",
  "Authentication is the required authentication type for the allowed traffic, if any.",
  "pkg/policy/api/egress.go",
  180,
  181
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].authentication.mode",
  "AuthenticationMode",
  "string",
  "Mode is the required authentication mode for the allowed traffic, if any.",
  "pkg/policy/api/rule.go",
  25,
  26
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].icmps",
  "ICMPRules",
  "[]ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is allowed to connect to.",
  "pkg/policy/api/egress.go",
  175,
  176
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].icmps[]",
  "ICMPRule",
  "ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is allowed to connect to.",
  "pkg/policy/api/egress.go",
  175,
  176
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].icmps[].fields",
  "[]ICMPField",
  "[]ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].icmps[].fields[]",
  "ICMPField",
  "ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].icmps[].fields[].family",
  "string",
  "string",
  "Family is a IP address version.",
  "pkg/policy/api/icmp.go",
  87,
  88
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].icmps[].fields[].type",
  "*intstr.IntOrString",
  "*intstr.IntOrString",
  "Type is a ICMP-type.",
  "pkg/policy/api/icmp.go",
  107,
  108
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toCIDR",
  "CIDRSlice",
  "[]CIDR",
  "ToCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  48,
  49
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toCIDR[]",
  "CIDR",
  "string",
  "ToCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  48,
  49
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toCIDRSet",
  "CIDRRuleSlice",
  "[]CIDRRule",
  "ToCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections to in addition to connections which are allowed via ToEndpoints, along with a list of subnets contained within their corresponding IP block to which traffic should not be allowed.",
  "pkg/policy/api/egress.go",
  64,
  65
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toCIDRSet[]",
  "CIDRRule",
  "CIDRRule",
  "ToCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections to in addition to connections which are allowed via ToEndpoints, along with a list of subnets contained within their corresponding IP block to which traffic should not be allowed.",
  "pkg/policy/api/egress.go",
  64,
  65
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidr",
  "CIDR",
  "string",
  "CIDR is a CIDR prefix / IP Block.",
  "pkg/policy/api/cidr.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupRef",
  "CIDRGroupRef",
  "string",
  "CIDRGroupRef is a reference to a CiliumCIDRGroup object.",
  "pkg/policy/api/cidr.go",
  36,
  37
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector",
  "EndpointSelector",
  "EndpointSelector",
  "CIDRGroupSelector selects CiliumCIDRGroups by their labels, rather than by name.",
  "pkg/policy/api/cidr.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].cidrGroupSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].except",
  "[]CIDR",
  "[]CIDR",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toCIDRSet[].except[]",
  "CIDR",
  "string",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toEndpoints",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "ToEndpoints is a list of endpoints identified by an EndpointSelector to which the endpoints subject to the rule are allowed to communicate.",
  "pkg/policy/api/egress.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toEndpoints[]",
  "EndpointSelector",
  "EndpointSelector",
  "ToEndpoints is a list of endpoints identified by an EndpointSelector to which the endpoints subject to the rule are allowed to communicate.",
  "pkg/policy/api/egress.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toEndpoints[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toEndpoints[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toEndpoints[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toEndpoints[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toEndpoints[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toEndpoints[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toEndpoints[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toEndpoints[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toEntities",
  "EntitySlice",
  "[]Entity",
  "ToEntities is a list of special entities to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toEntities[]",
  "Entity",
  "string",
  "ToEntities is a list of special entities to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toFQDNs",
  "FQDNSelectorSlice",
  "[]FQDNSelector",
  "ToFQDN allows whitelisting DNS names in place of IPs.",
  "pkg/policy/api/egress.go",
  165,
  166
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toFQDNs[]",
  "FQDNSelector",
  "FQDNSelector",
  "ToFQDN allows whitelisting DNS names in place of IPs.",
  "pkg/policy/api/egress.go",
  165,
  166
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toFQDNs[].matchName",
  "string",
  "string",
  "MatchName matches literal DNS names.",
  "pkg/policy/api/fqdn.go",
  39,
  40
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toFQDNs[].matchPattern",
  "string",
  "string",
  "MatchPattern allows using wildcards to match DNS names.",
  "pkg/policy/api/fqdn.go",
  64,
  65
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toGroups",
  "[]Groups",
  "[]Groups",
  "ToGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/egress.go",
  93,
  94
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toGroups[]",
  "Groups",
  "Groups",
  "ToGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/egress.go",
  93,
  94
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toGroups[].aws",
  "*AWSGroup",
  "*AWSGroup",
  "Carries aws in the typed policy object.",
  "pkg/policy/api/groups.go",
  22,
  22
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toGroups[].aws.labels",
  "map[string]string",
  "map[string]string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toGroups[].aws.labels[<exact-key>]",
  "string",
  "string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toGroups[].aws.region",
  "string",
  "string",
  "Deprecated: Region is unused.",
  "pkg/policy/api/groups.go",
  45,
  46
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toGroups[].aws.securityGroupsIds",
  "[]string",
  "[]string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toGroups[].aws.securityGroupsIds[]",
  "string",
  "string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toGroups[].aws.securityGroupsNames",
  "[]string",
  "[]string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toGroups[].aws.securityGroupsNames[]",
  "string",
  "string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toNodes",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "ToNodes is a list of nodes identified by an EndpointSelector to which endpoints subject to the rule is allowed to communicate.",
  "pkg/policy/api/egress.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toNodes[]",
  "EndpointSelector",
  "EndpointSelector",
  "ToNodes is a list of nodes identified by an EndpointSelector to which endpoints subject to the rule is allowed to communicate.",
  "pkg/policy/api/egress.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toNodes[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toNodes[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toNodes[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toNodes[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toNodes[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toNodes[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toNodes[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toNodes[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts",
  "PortRules",
  "[]PortRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is allowed to connect to.",
  "pkg/policy/api/egress.go",
  148,
  149
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[]",
  "PortRule",
  "PortRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is allowed to connect to.",
  "pkg/policy/api/egress.go",
  148,
  149
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].listener",
  "*Listener",
  "*Listener",
  "listener specifies the name of a custom Envoy listener to which this traffic should be redirected to.",
  "pkg/policy/api/l4.go",
  249,
  250
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].listener.envoyConfig",
  "*EnvoyConfig",
  "*EnvoyConfig",
  "EnvoyConfig is a reference to the CEC or CCEC resource in which the listener is defined.",
  "pkg/policy/api/l4.go",
  165,
  166
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].listener.envoyConfig.kind",
  "string",
  "string",
  "Kind is the resource type being referred to.",
  "pkg/policy/api/l4.go",
  149,
  150
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].listener.envoyConfig.name",
  "string",
  "string",
  "Name is the resource name of the CiliumEnvoyConfig or CiliumClusterwideEnvoyConfig where the listener is defined in.",
  "pkg/policy/api/l4.go",
  156,
  157
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].listener.name",
  "string",
  "string",
  "Name is the name of the listener.",
  "pkg/policy/api/l4.go",
  171,
  172
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].listener.priority",
  "uint8",
  "uint8",
  "Priority for this Listener that is used when multiple rules would apply different listeners to a policy map entry.",
  "pkg/policy/api/l4.go",
  179,
  180
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].originatingTLS",
  "*TLSContext",
  "*TLSContext",
  "OriginatingTLS is the TLS context for the connections originated by the L7 proxy.",
  "pkg/policy/api/l4.go",
  234,
  235
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].originatingTLS.certificate",
  "string",
  "string",
  "Certificate is the file name or k8s secret item name for the certificate chain.",
  "pkg/policy/api/l4.go",
  129,
  130
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].originatingTLS.privateKey",
  "string",
  "string",
  "PrivateKey is the file name or k8s secret item name for the private key matching the certificate chain.",
  "pkg/policy/api/l4.go",
  136,
  137
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].originatingTLS.secret",
  "*Secret",
  "*Secret",
  "Secret is the secret that contains the certificates and private key for the TLS context.",
  "pkg/policy/api/l4.go",
  115,
  116
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].originatingTLS.secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].originatingTLS.secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].originatingTLS.trustedCA",
  "string",
  "string",
  "TrustedCA is the file name or k8s secret item name for the trusted CA.",
  "pkg/policy/api/l4.go",
  122,
  123
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].ports",
  "[]PortProtocol",
  "[]PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  214,
  215
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].ports[]",
  "PortProtocol",
  "PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  214,
  215
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].ports[].endPort",
  "int32",
  "int32",
  "EndPort can only be an L4 port number.",
  "pkg/policy/api/l4.go",
  53,
  54
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].ports[].port",
  "string",
  "string",
  "Port can be an L4 port number, or a name in the form of \"http\" or \"http-8080\".",
  "pkg/policy/api/l4.go",
  46,
  47
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].ports[].protocol",
  "L4Proto",
  "string",
  "Protocol is the L4 protocol.",
  "pkg/policy/api/l4.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules",
  "*L7Rules",
  "*L7Rules",
  "Rules is a list of additional port level rules which must be met in order for the PortRule to allow the traffic.",
  "pkg/policy/api/l4.go",
  256,
  257
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.dns",
  "PortRulesDNS",
  "[]PortRuleDNS",
  "DNS-specific rules.",
  "pkg/policy/api/l4.go",
  311,
  312
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.dns[]",
  "PortRuleDNS",
  "FQDNSelector",
  "DNS-specific rules.",
  "pkg/policy/api/l4.go",
  311,
  312
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.dns[].matchName",
  "string",
  "string",
  "MatchName matches literal DNS names.",
  "pkg/policy/api/fqdn.go",
  39,
  40
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.dns[].matchPattern",
  "string",
  "string",
  "MatchPattern allows using wildcards to match DNS names.",
  "pkg/policy/api/fqdn.go",
  64,
  65
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http",
  "PortRulesHTTP",
  "[]PortRuleHTTP",
  "HTTP specific rules.",
  "pkg/policy/api/l4.go",
  305,
  306
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[]",
  "PortRuleHTTP",
  "PortRuleHTTP",
  "HTTP specific rules.",
  "pkg/policy/api/l4.go",
  305,
  306
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headerMatches",
  "[]*HeaderMatch",
  "[]*HeaderMatch",
  "HeaderMatches is a list of HTTP headers which must be present and match against the given values.",
  "pkg/policy/api/http.go",
  107,
  108
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headerMatches[]",
  "*HeaderMatch",
  "*HeaderMatch",
  "HeaderMatches is a list of HTTP headers which must be present and match against the given values.",
  "pkg/policy/api/http.go",
  107,
  108
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headerMatches[].mismatch",
  "MismatchAction",
  "string",
  "Mismatch identifies what to do in case there is no match.",
  "pkg/policy/api/http.go",
  34,
  35
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headerMatches[].name",
  "string",
  "string",
  "Name identifies the header.",
  "pkg/policy/api/http.go",
  39,
  40
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headerMatches[].secret",
  "*Secret",
  "*Secret",
  "Secret refers to a secret that contains the value to be matched against.",
  "pkg/policy/api/http.go",
  46,
  47
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headerMatches[].secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headerMatches[].secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headerMatches[].value",
  "string",
  "string",
  "Value matches the exact value of the header.",
  "pkg/policy/api/http.go",
  53,
  54
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headers",
  "[]string",
  "[]string",
  "Headers is a list of HTTP headers which must be present in the request.",
  "pkg/policy/api/http.go",
  100,
  101
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].headers[]",
  "string",
  "string",
  "Headers is a list of HTTP headers which must be present in the request.",
  "pkg/policy/api/http.go",
  100,
  101
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].host",
  "string",
  "string",
  "Host is an extended POSIX regex matched against the host header of a request.",
  "pkg/policy/api/http.go",
  93,
  94
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].method",
  "string",
  "string",
  "Method is an extended POSIX regex matched against the method of a request, e.g.",
  "pkg/policy/api/http.go",
  81,
  82
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].rules.http[].path",
  "string",
  "string",
  "Path is an extended POSIX regex matched against the path of a request.",
  "pkg/policy/api/http.go",
  73,
  74
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].serverNames",
  "[]ServerName",
  "[]ServerName",
  "ServerNames is a list of allowed TLS SNI values.",
  "pkg/policy/api/l4.go",
  243,
  244
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].serverNames[]",
  "ServerName",
  "string",
  "ServerNames is a list of allowed TLS SNI values.",
  "pkg/policy/api/l4.go",
  243,
  244
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].terminatingTLS",
  "*TLSContext",
  "*TLSContext",
  "TerminatingTLS is the TLS context for the connection terminated by the L7 proxy.",
  "pkg/policy/api/l4.go",
  224,
  225
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].terminatingTLS.certificate",
  "string",
  "string",
  "Certificate is the file name or k8s secret item name for the certificate chain.",
  "pkg/policy/api/l4.go",
  129,
  130
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].terminatingTLS.privateKey",
  "string",
  "string",
  "PrivateKey is the file name or k8s secret item name for the private key matching the certificate chain.",
  "pkg/policy/api/l4.go",
  136,
  137
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].terminatingTLS.secret",
  "*Secret",
  "*Secret",
  "Secret is the secret that contains the certificates and private key for the TLS context.",
  "pkg/policy/api/l4.go",
  115,
  116
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].terminatingTLS.secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].terminatingTLS.secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toPorts[].terminatingTLS.trustedCA",
  "string",
  "string",
  "TrustedCA is the file name or k8s secret item name for the trusted CA.",
  "pkg/policy/api/l4.go",
  122,
  123
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toRequires",
  "[]string",
  "[]string",
  "Deprecated.",
  "pkg/policy/api/egress.go",
  33,
  34
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toRequires[]",
  "string",
  "string",
  "Deprecated.",
  "pkg/policy/api/egress.go",
  33,
  34
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toServices",
  "[]Service",
  "[]Service",
  "ToServices is a list of services to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  79,
  80
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toServices[]",
  "Service",
  "Service",
  "ToServices is a list of services to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  79,
  80
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toServices[].k8sService",
  "*K8sServiceNamespace",
  "*K8sServiceNamespace",
  "K8sService selects service by name and namespace pair.",
  "pkg/policy/api/service.go",
  16,
  17
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toServices[].k8sService.namespace",
  "string",
  "string",
  "Carries namespace in the typed policy object.",
  "pkg/policy/api/service.go",
  23,
  23
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toServices[].k8sService.serviceName",
  "string",
  "string",
  "Carries serviceName in the typed policy object.",
  "pkg/policy/api/service.go",
  22,
  22
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector",
  "*K8sServiceSelectorNamespace",
  "*K8sServiceSelectorNamespace",
  "K8sServiceSelector selects services by k8s labels and namespace.",
  "pkg/policy/api/service.go",
  14,
  15
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.namespace",
  "string",
  "string",
  "Carries namespace in the typed policy object.",
  "pkg/policy/api/service.go",
  30,
  30
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector",
  "ServiceSelector",
  "EndpointSelector",
  "Carries selector in the typed policy object.",
  "pkg/policy/api/service.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egress[].toServices[].k8sServiceSelector.selector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny",
  "[]EgressDenyRule",
  "[]EgressDenyRule",
  "EgressDeny is a list of EgressDenyRule which are enforced at egress.",
  "pkg/policy/api/rule.go",
  108,
  109
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[]",
  "EgressDenyRule",
  "EgressDenyRule",
  "EgressDeny is a list of EgressDenyRule which are enforced at egress.",
  "pkg/policy/api/rule.go",
  108,
  109
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].icmps",
  "ICMPRules",
  "[]ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is not allowed to connect to.",
  "pkg/policy/api/egress.go",
  218,
  219
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].icmps[]",
  "ICMPRule",
  "ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is not allowed to connect to.",
  "pkg/policy/api/egress.go",
  218,
  219
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].icmps[].fields",
  "[]ICMPField",
  "[]ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].icmps[].fields[]",
  "ICMPField",
  "ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].icmps[].fields[].family",
  "string",
  "string",
  "Family is a IP address version.",
  "pkg/policy/api/icmp.go",
  87,
  88
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].icmps[].fields[].type",
  "*intstr.IntOrString",
  "*intstr.IntOrString",
  "Type is a ICMP-type.",
  "pkg/policy/api/icmp.go",
  107,
  108
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toCIDR",
  "CIDRSlice",
  "[]CIDR",
  "ToCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  48,
  49
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toCIDR[]",
  "CIDR",
  "string",
  "ToCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  48,
  49
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet",
  "CIDRRuleSlice",
  "[]CIDRRule",
  "ToCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections to in addition to connections which are allowed via ToEndpoints, along with a list of subnets contained within their corresponding IP block to which traffic should not be allowed.",
  "pkg/policy/api/egress.go",
  64,
  65
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[]",
  "CIDRRule",
  "CIDRRule",
  "ToCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections to in addition to connections which are allowed via ToEndpoints, along with a list of subnets contained within their corresponding IP block to which traffic should not be allowed.",
  "pkg/policy/api/egress.go",
  64,
  65
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidr",
  "CIDR",
  "string",
  "CIDR is a CIDR prefix / IP Block.",
  "pkg/policy/api/cidr.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupRef",
  "CIDRGroupRef",
  "string",
  "CIDRGroupRef is a reference to a CiliumCIDRGroup object.",
  "pkg/policy/api/cidr.go",
  36,
  37
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector",
  "EndpointSelector",
  "EndpointSelector",
  "CIDRGroupSelector selects CiliumCIDRGroups by their labels, rather than by name.",
  "pkg/policy/api/cidr.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].cidrGroupSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].except",
  "[]CIDR",
  "[]CIDR",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toCIDRSet[].except[]",
  "CIDR",
  "string",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "ToEndpoints is a list of endpoints identified by an EndpointSelector to which the endpoints subject to the rule are allowed to communicate.",
  "pkg/policy/api/egress.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[]",
  "EndpointSelector",
  "EndpointSelector",
  "ToEndpoints is a list of endpoints identified by an EndpointSelector to which the endpoints subject to the rule are allowed to communicate.",
  "pkg/policy/api/egress.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toEndpoints[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toEntities",
  "EntitySlice",
  "[]Entity",
  "ToEntities is a list of special entities to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toEntities[]",
  "Entity",
  "string",
  "ToEntities is a list of special entities to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toGroups",
  "[]Groups",
  "[]Groups",
  "ToGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/egress.go",
  93,
  94
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toGroups[]",
  "Groups",
  "Groups",
  "ToGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/egress.go",
  93,
  94
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toGroups[].aws",
  "*AWSGroup",
  "*AWSGroup",
  "Carries aws in the typed policy object.",
  "pkg/policy/api/groups.go",
  22,
  22
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toGroups[].aws.labels",
  "map[string]string",
  "map[string]string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toGroups[].aws.labels[<exact-key>]",
  "string",
  "string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toGroups[].aws.region",
  "string",
  "string",
  "Deprecated: Region is unused.",
  "pkg/policy/api/groups.go",
  45,
  46
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toGroups[].aws.securityGroupsIds",
  "[]string",
  "[]string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toGroups[].aws.securityGroupsIds[]",
  "string",
  "string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toGroups[].aws.securityGroupsNames",
  "[]string",
  "[]string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toGroups[].aws.securityGroupsNames[]",
  "string",
  "string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toNodes",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "ToNodes is a list of nodes identified by an EndpointSelector to which endpoints subject to the rule is allowed to communicate.",
  "pkg/policy/api/egress.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toNodes[]",
  "EndpointSelector",
  "EndpointSelector",
  "ToNodes is a list of nodes identified by an EndpointSelector to which endpoints subject to the rule is allowed to communicate.",
  "pkg/policy/api/egress.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toNodes[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toNodes[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toNodes[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toNodes[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toNodes[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toNodes[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toNodes[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toNodes[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toPorts",
  "PortDenyRules",
  "[]PortDenyRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is not allowed to connect to.",
  "pkg/policy/api/egress.go",
  208,
  209
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toPorts[]",
  "PortDenyRule",
  "PortDenyRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is not allowed to connect to.",
  "pkg/policy/api/egress.go",
  208,
  209
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toPorts[].ports",
  "[]PortProtocol",
  "[]PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  284,
  285
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toPorts[].ports[]",
  "PortProtocol",
  "PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  284,
  285
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toPorts[].ports[].endPort",
  "int32",
  "int32",
  "EndPort can only be an L4 port number.",
  "pkg/policy/api/l4.go",
  53,
  54
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toPorts[].ports[].port",
  "string",
  "string",
  "Port can be an L4 port number, or a name in the form of \"http\" or \"http-8080\".",
  "pkg/policy/api/l4.go",
  46,
  47
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toPorts[].ports[].protocol",
  "L4Proto",
  "string",
  "Protocol is the L4 protocol.",
  "pkg/policy/api/l4.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toRequires",
  "[]string",
  "[]string",
  "Deprecated.",
  "pkg/policy/api/egress.go",
  33,
  34
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toRequires[]",
  "string",
  "string",
  "Deprecated.",
  "pkg/policy/api/egress.go",
  33,
  34
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toServices",
  "[]Service",
  "[]Service",
  "ToServices is a list of services to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  79,
  80
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toServices[]",
  "Service",
  "Service",
  "ToServices is a list of services to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  79,
  80
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sService",
  "*K8sServiceNamespace",
  "*K8sServiceNamespace",
  "K8sService selects service by name and namespace pair.",
  "pkg/policy/api/service.go",
  16,
  17
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sService.namespace",
  "string",
  "string",
  "Carries namespace in the typed policy object.",
  "pkg/policy/api/service.go",
  23,
  23
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sService.serviceName",
  "string",
  "string",
  "Carries serviceName in the typed policy object.",
  "pkg/policy/api/service.go",
  22,
  22
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector",
  "*K8sServiceSelectorNamespace",
  "*K8sServiceSelectorNamespace",
  "K8sServiceSelector selects services by k8s labels and namespace.",
  "pkg/policy/api/service.go",
  14,
  15
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.namespace",
  "string",
  "string",
  "Carries namespace in the typed policy object.",
  "pkg/policy/api/service.go",
  30,
  30
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector",
  "ServiceSelector",
  "EndpointSelector",
  "Carries selector in the typed policy object.",
  "pkg/policy/api/service.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.egressDeny[].toServices[].k8sServiceSelector.selector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.enableDefaultDeny",
  "DefaultDenyConfig",
  "DefaultDenyConfig",
  "EnableDefaultDeny determines whether this policy configures the subject endpoint(s) to have a default deny mode.",
  "pkg/policy/api/rule.go",
  135,
  136
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.enableDefaultDeny.egress",
  "*bool",
  "*bool",
  "Whether or not the endpoint should have a default-deny rule applied to egress traffic.",
  "pkg/policy/api/rule.go",
  41,
  42
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.enableDefaultDeny.ingress",
  "*bool",
  "*bool",
  "Whether or not the endpoint should have a default-deny rule applied to ingress traffic.",
  "pkg/policy/api/rule.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.endpointSelector",
  "EndpointSelector",
  "EndpointSelector",
  "EndpointSelector selects all endpoints which should be subject to this rule.",
  "pkg/policy/api/rule.go",
  73,
  74
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.endpointSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.endpointSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.endpointSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.endpointSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.endpointSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.endpointSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.endpointSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.endpointSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress",
  "[]IngressRule",
  "[]IngressRule",
  "Ingress is a list of IngressRule which are enforced at ingress.",
  "pkg/policy/api/rule.go",
  86,
  87
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[]",
  "IngressRule",
  "IngressRule",
  "Ingress is a list of IngressRule which are enforced at ingress.",
  "pkg/policy/api/rule.go",
  86,
  87
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].authentication",
  "*Authentication",
  "*Authentication",
  "Authentication is the required authentication type for the allowed traffic, if any.",
  "pkg/policy/api/ingress.go",
  160,
  161
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].authentication.mode",
  "AuthenticationMode",
  "string",
  "Mode is the required authentication mode for the allowed traffic, if any.",
  "pkg/policy/api/rule.go",
  25,
  26
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromCIDR",
  "CIDRSlice",
  "[]CIDR",
  "FromCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  50,
  51
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromCIDR[]",
  "CIDR",
  "string",
  "FromCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  50,
  51
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet",
  "CIDRRuleSlice",
  "[]CIDRRule",
  "FromCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from in addition to FromEndpoints, along with a list of subnets contained within their corresponding IP block from which traffic should not be allowed.",
  "pkg/policy/api/ingress.go",
  65,
  66
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[]",
  "CIDRRule",
  "CIDRRule",
  "FromCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from in addition to FromEndpoints, along with a list of subnets contained within their corresponding IP block from which traffic should not be allowed.",
  "pkg/policy/api/ingress.go",
  65,
  66
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidr",
  "CIDR",
  "string",
  "CIDR is a CIDR prefix / IP Block.",
  "pkg/policy/api/cidr.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupRef",
  "CIDRGroupRef",
  "string",
  "CIDRGroupRef is a reference to a CiliumCIDRGroup object.",
  "pkg/policy/api/cidr.go",
  36,
  37
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector",
  "EndpointSelector",
  "EndpointSelector",
  "CIDRGroupSelector selects CiliumCIDRGroups by their labels, rather than by name.",
  "pkg/policy/api/cidr.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].cidrGroupSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].except",
  "[]CIDR",
  "[]CIDR",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromCIDRSet[].except[]",
  "CIDR",
  "string",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromEndpoints",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "FromEndpoints is a list of endpoints identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  29,
  30
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[]",
  "EndpointSelector",
  "EndpointSelector",
  "FromEndpoints is a list of endpoints identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  29,
  30
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromEndpoints[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromEntities",
  "EntitySlice",
  "[]Entity",
  "FromEntities is a list of special entities which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  73,
  74
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromEntities[]",
  "Entity",
  "string",
  "FromEntities is a list of special entities which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  73,
  74
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromGroups",
  "[]Groups",
  "[]Groups",
  "FromGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/ingress.go",
  88,
  89
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromGroups[]",
  "Groups",
  "Groups",
  "FromGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/ingress.go",
  88,
  89
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromGroups[].aws",
  "*AWSGroup",
  "*AWSGroup",
  "Carries aws in the typed policy object.",
  "pkg/policy/api/groups.go",
  22,
  22
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromGroups[].aws.labels",
  "map[string]string",
  "map[string]string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromGroups[].aws.labels[<exact-key>]",
  "string",
  "string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromGroups[].aws.region",
  "string",
  "string",
  "Deprecated: Region is unused.",
  "pkg/policy/api/groups.go",
  45,
  46
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromGroups[].aws.securityGroupsIds",
  "[]string",
  "[]string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromGroups[].aws.securityGroupsIds[]",
  "string",
  "string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromGroups[].aws.securityGroupsNames",
  "[]string",
  "[]string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromGroups[].aws.securityGroupsNames[]",
  "string",
  "string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromNodes",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "FromNodes is a list of nodes identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  95,
  96
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromNodes[]",
  "EndpointSelector",
  "EndpointSelector",
  "FromNodes is a list of nodes identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  95,
  96
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromNodes[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromNodes[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromNodes[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromNodes[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromNodes[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromNodes[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromNodes[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromNodes[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromRequires",
  "[]string",
  "[]string",
  "Deprecated.",
  "pkg/policy/api/ingress.go",
  34,
  35
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].fromRequires[]",
  "string",
  "string",
  "Deprecated.",
  "pkg/policy/api/ingress.go",
  34,
  35
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].icmps",
  "ICMPRules",
  "[]ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  155,
  156
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].icmps[]",
  "ICMPRule",
  "ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  155,
  156
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].icmps[].fields",
  "[]ICMPField",
  "[]ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].icmps[].fields[]",
  "ICMPField",
  "ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].icmps[].fields[].family",
  "string",
  "string",
  "Family is a IP address version.",
  "pkg/policy/api/icmp.go",
  87,
  88
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].icmps[].fields[].type",
  "*intstr.IntOrString",
  "*intstr.IntOrString",
  "Type is a ICMP-type.",
  "pkg/policy/api/icmp.go",
  107,
  108
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts",
  "PortRules",
  "[]PortRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  144,
  145
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[]",
  "PortRule",
  "PortRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  144,
  145
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].listener",
  "*Listener",
  "*Listener",
  "listener specifies the name of a custom Envoy listener to which this traffic should be redirected to.",
  "pkg/policy/api/l4.go",
  249,
  250
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].listener.envoyConfig",
  "*EnvoyConfig",
  "*EnvoyConfig",
  "EnvoyConfig is a reference to the CEC or CCEC resource in which the listener is defined.",
  "pkg/policy/api/l4.go",
  165,
  166
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].listener.envoyConfig.kind",
  "string",
  "string",
  "Kind is the resource type being referred to.",
  "pkg/policy/api/l4.go",
  149,
  150
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].listener.envoyConfig.name",
  "string",
  "string",
  "Name is the resource name of the CiliumEnvoyConfig or CiliumClusterwideEnvoyConfig where the listener is defined in.",
  "pkg/policy/api/l4.go",
  156,
  157
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].listener.name",
  "string",
  "string",
  "Name is the name of the listener.",
  "pkg/policy/api/l4.go",
  171,
  172
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].listener.priority",
  "uint8",
  "uint8",
  "Priority for this Listener that is used when multiple rules would apply different listeners to a policy map entry.",
  "pkg/policy/api/l4.go",
  179,
  180
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].originatingTLS",
  "*TLSContext",
  "*TLSContext",
  "OriginatingTLS is the TLS context for the connections originated by the L7 proxy.",
  "pkg/policy/api/l4.go",
  234,
  235
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].originatingTLS.certificate",
  "string",
  "string",
  "Certificate is the file name or k8s secret item name for the certificate chain.",
  "pkg/policy/api/l4.go",
  129,
  130
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].originatingTLS.privateKey",
  "string",
  "string",
  "PrivateKey is the file name or k8s secret item name for the private key matching the certificate chain.",
  "pkg/policy/api/l4.go",
  136,
  137
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].originatingTLS.secret",
  "*Secret",
  "*Secret",
  "Secret is the secret that contains the certificates and private key for the TLS context.",
  "pkg/policy/api/l4.go",
  115,
  116
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].originatingTLS.secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].originatingTLS.secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].originatingTLS.trustedCA",
  "string",
  "string",
  "TrustedCA is the file name or k8s secret item name for the trusted CA.",
  "pkg/policy/api/l4.go",
  122,
  123
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].ports",
  "[]PortProtocol",
  "[]PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  214,
  215
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].ports[]",
  "PortProtocol",
  "PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  214,
  215
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].ports[].endPort",
  "int32",
  "int32",
  "EndPort can only be an L4 port number.",
  "pkg/policy/api/l4.go",
  53,
  54
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].ports[].port",
  "string",
  "string",
  "Port can be an L4 port number, or a name in the form of \"http\" or \"http-8080\".",
  "pkg/policy/api/l4.go",
  46,
  47
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].ports[].protocol",
  "L4Proto",
  "string",
  "Protocol is the L4 protocol.",
  "pkg/policy/api/l4.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules",
  "*L7Rules",
  "*L7Rules",
  "Rules is a list of additional port level rules which must be met in order for the PortRule to allow the traffic.",
  "pkg/policy/api/l4.go",
  256,
  257
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.dns",
  "PortRulesDNS",
  "[]PortRuleDNS",
  "DNS-specific rules.",
  "pkg/policy/api/l4.go",
  311,
  312
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.dns[]",
  "PortRuleDNS",
  "FQDNSelector",
  "DNS-specific rules.",
  "pkg/policy/api/l4.go",
  311,
  312
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.dns[].matchName",
  "string",
  "string",
  "MatchName matches literal DNS names.",
  "pkg/policy/api/fqdn.go",
  39,
  40
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.dns[].matchPattern",
  "string",
  "string",
  "MatchPattern allows using wildcards to match DNS names.",
  "pkg/policy/api/fqdn.go",
  64,
  65
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http",
  "PortRulesHTTP",
  "[]PortRuleHTTP",
  "HTTP specific rules.",
  "pkg/policy/api/l4.go",
  305,
  306
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[]",
  "PortRuleHTTP",
  "PortRuleHTTP",
  "HTTP specific rules.",
  "pkg/policy/api/l4.go",
  305,
  306
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headerMatches",
  "[]*HeaderMatch",
  "[]*HeaderMatch",
  "HeaderMatches is a list of HTTP headers which must be present and match against the given values.",
  "pkg/policy/api/http.go",
  107,
  108
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headerMatches[]",
  "*HeaderMatch",
  "*HeaderMatch",
  "HeaderMatches is a list of HTTP headers which must be present and match against the given values.",
  "pkg/policy/api/http.go",
  107,
  108
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headerMatches[].mismatch",
  "MismatchAction",
  "string",
  "Mismatch identifies what to do in case there is no match.",
  "pkg/policy/api/http.go",
  34,
  35
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headerMatches[].name",
  "string",
  "string",
  "Name identifies the header.",
  "pkg/policy/api/http.go",
  39,
  40
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headerMatches[].secret",
  "*Secret",
  "*Secret",
  "Secret refers to a secret that contains the value to be matched against.",
  "pkg/policy/api/http.go",
  46,
  47
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headerMatches[].secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headerMatches[].secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headerMatches[].value",
  "string",
  "string",
  "Value matches the exact value of the header.",
  "pkg/policy/api/http.go",
  53,
  54
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headers",
  "[]string",
  "[]string",
  "Headers is a list of HTTP headers which must be present in the request.",
  "pkg/policy/api/http.go",
  100,
  101
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].headers[]",
  "string",
  "string",
  "Headers is a list of HTTP headers which must be present in the request.",
  "pkg/policy/api/http.go",
  100,
  101
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].host",
  "string",
  "string",
  "Host is an extended POSIX regex matched against the host header of a request.",
  "pkg/policy/api/http.go",
  93,
  94
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].method",
  "string",
  "string",
  "Method is an extended POSIX regex matched against the method of a request, e.g.",
  "pkg/policy/api/http.go",
  81,
  82
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].rules.http[].path",
  "string",
  "string",
  "Path is an extended POSIX regex matched against the path of a request.",
  "pkg/policy/api/http.go",
  73,
  74
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].serverNames",
  "[]ServerName",
  "[]ServerName",
  "ServerNames is a list of allowed TLS SNI values.",
  "pkg/policy/api/l4.go",
  243,
  244
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].serverNames[]",
  "ServerName",
  "string",
  "ServerNames is a list of allowed TLS SNI values.",
  "pkg/policy/api/l4.go",
  243,
  244
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].terminatingTLS",
  "*TLSContext",
  "*TLSContext",
  "TerminatingTLS is the TLS context for the connection terminated by the L7 proxy.",
  "pkg/policy/api/l4.go",
  224,
  225
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].terminatingTLS.certificate",
  "string",
  "string",
  "Certificate is the file name or k8s secret item name for the certificate chain.",
  "pkg/policy/api/l4.go",
  129,
  130
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].terminatingTLS.privateKey",
  "string",
  "string",
  "PrivateKey is the file name or k8s secret item name for the private key matching the certificate chain.",
  "pkg/policy/api/l4.go",
  136,
  137
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].terminatingTLS.secret",
  "*Secret",
  "*Secret",
  "Secret is the secret that contains the certificates and private key for the TLS context.",
  "pkg/policy/api/l4.go",
  115,
  116
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].terminatingTLS.secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].terminatingTLS.secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingress[].toPorts[].terminatingTLS.trustedCA",
  "string",
  "string",
  "TrustedCA is the file name or k8s secret item name for the trusted CA.",
  "pkg/policy/api/l4.go",
  122,
  123
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny",
  "[]IngressDenyRule",
  "[]IngressDenyRule",
  "IngressDeny is a list of IngressDenyRule which are enforced at ingress.",
  "pkg/policy/api/rule.go",
  94,
  95
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[]",
  "IngressDenyRule",
  "IngressDenyRule",
  "IngressDeny is a list of IngressDenyRule which are enforced at ingress.",
  "pkg/policy/api/rule.go",
  94,
  95
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDR",
  "CIDRSlice",
  "[]CIDR",
  "FromCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  50,
  51
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDR[]",
  "CIDR",
  "string",
  "FromCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  50,
  51
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet",
  "CIDRRuleSlice",
  "[]CIDRRule",
  "FromCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from in addition to FromEndpoints, along with a list of subnets contained within their corresponding IP block from which traffic should not be allowed.",
  "pkg/policy/api/ingress.go",
  65,
  66
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[]",
  "CIDRRule",
  "CIDRRule",
  "FromCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from in addition to FromEndpoints, along with a list of subnets contained within their corresponding IP block from which traffic should not be allowed.",
  "pkg/policy/api/ingress.go",
  65,
  66
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidr",
  "CIDR",
  "string",
  "CIDR is a CIDR prefix / IP Block.",
  "pkg/policy/api/cidr.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupRef",
  "CIDRGroupRef",
  "string",
  "CIDRGroupRef is a reference to a CiliumCIDRGroup object.",
  "pkg/policy/api/cidr.go",
  36,
  37
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector",
  "EndpointSelector",
  "EndpointSelector",
  "CIDRGroupSelector selects CiliumCIDRGroups by their labels, rather than by name.",
  "pkg/policy/api/cidr.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].except",
  "[]CIDR",
  "[]CIDR",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromCIDRSet[].except[]",
  "CIDR",
  "string",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "FromEndpoints is a list of endpoints identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  29,
  30
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[]",
  "EndpointSelector",
  "EndpointSelector",
  "FromEndpoints is a list of endpoints identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  29,
  30
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromEndpoints[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromEntities",
  "EntitySlice",
  "[]Entity",
  "FromEntities is a list of special entities which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  73,
  74
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromEntities[]",
  "Entity",
  "string",
  "FromEntities is a list of special entities which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  73,
  74
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups",
  "[]Groups",
  "[]Groups",
  "FromGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/ingress.go",
  88,
  89
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[]",
  "Groups",
  "Groups",
  "FromGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/ingress.go",
  88,
  89
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[].aws",
  "*AWSGroup",
  "*AWSGroup",
  "Carries aws in the typed policy object.",
  "pkg/policy/api/groups.go",
  22,
  22
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[].aws.labels",
  "map[string]string",
  "map[string]string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[].aws.labels[<exact-key>]",
  "string",
  "string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[].aws.region",
  "string",
  "string",
  "Deprecated: Region is unused.",
  "pkg/policy/api/groups.go",
  45,
  46
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[].aws.securityGroupsIds",
  "[]string",
  "[]string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[].aws.securityGroupsIds[]",
  "string",
  "string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[].aws.securityGroupsNames",
  "[]string",
  "[]string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromGroups[].aws.securityGroupsNames[]",
  "string",
  "string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "FromNodes is a list of nodes identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  95,
  96
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[]",
  "EndpointSelector",
  "EndpointSelector",
  "FromNodes is a list of nodes identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  95,
  96
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromNodes[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromRequires",
  "[]string",
  "[]string",
  "Deprecated.",
  "pkg/policy/api/ingress.go",
  34,
  35
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].fromRequires[]",
  "string",
  "string",
  "Deprecated.",
  "pkg/policy/api/ingress.go",
  34,
  35
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].icmps",
  "ICMPRules",
  "[]ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is not allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  199,
  200
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].icmps[]",
  "ICMPRule",
  "ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is not allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  199,
  200
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].icmps[].fields",
  "[]ICMPField",
  "[]ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].icmps[].fields[]",
  "ICMPField",
  "ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].icmps[].fields[].family",
  "string",
  "string",
  "Family is a IP address version.",
  "pkg/policy/api/icmp.go",
  87,
  88
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].icmps[].fields[].type",
  "*intstr.IntOrString",
  "*intstr.IntOrString",
  "Type is a ICMP-type.",
  "pkg/policy/api/icmp.go",
  107,
  108
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].toPorts",
  "PortDenyRules",
  "[]PortDenyRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is not allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  188,
  189
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].toPorts[]",
  "PortDenyRule",
  "PortDenyRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is not allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  188,
  189
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].toPorts[].ports",
  "[]PortProtocol",
  "[]PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  284,
  285
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].toPorts[].ports[]",
  "PortProtocol",
  "PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  284,
  285
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].toPorts[].ports[].endPort",
  "int32",
  "int32",
  "EndPort can only be an L4 port number.",
  "pkg/policy/api/l4.go",
  53,
  54
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].toPorts[].ports[].port",
  "string",
  "string",
  "Port can be an L4 port number, or a name in the form of \"http\" or \"http-8080\".",
  "pkg/policy/api/l4.go",
  46,
  47
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.ingressDeny[].toPorts[].ports[].protocol",
  "L4Proto",
  "string",
  "Protocol is the L4 protocol.",
  "pkg/policy/api/l4.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.labels",
  "labels.LabelArray",
  "[]Label",
  "Labels is a list of optional strings which can be used to re-identify the rule or to store metadata.",
  "pkg/policy/api/rule.go",
  116,
  117
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.labels[]",
  "Label",
  "Label",
  "Labels is a list of optional strings which can be used to re-identify the rule or to store metadata.",
  "pkg/policy/api/rule.go",
  116,
  117
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.labels[].key",
  "string",
  "string",
  "Carries key in the typed policy object.",
  "pkg/labels/labels.go",
  209,
  209
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.labels[].source",
  "string",
  "string",
  "Source can be one of the above values (e.g.: LabelSourceK8s).",
  "pkg/labels/labels.go",
  213,
  214
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.labels[].value",
  "string",
  "string",
  "Carries value in the typed policy object.",
  "pkg/labels/labels.go",
  210,
  210
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.log",
  "LogConfig",
  "LogConfig",
  "Log specifies custom policy-specific Hubble logging configuration.",
  "pkg/policy/api/rule.go",
  147,
  148
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.log.value",
  "string",
  "string",
  "Value is a free-form string that is included in Hubble flows that match this policy.",
  "pkg/policy/api/rule.go",
  51,
  52
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.nodeSelector",
  "EndpointSelector",
  "EndpointSelector",
  "NodeSelector selects all nodes which should be subject to this rule.",
  "pkg/policy/api/rule.go",
  80,
  81
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.nodeSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.nodeSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.nodeSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.nodeSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.nodeSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.nodeSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.nodeSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.spec.nodeSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs",
  "api.Rules",
  "[]*Rule",
  "Specs is a list of desired Cilium specific rule specification.",
  "pkg/k8s/apis/cilium.io/v2/ccnp_types.go",
  43,
  44
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[]",
  "*Rule",
  "*Rule",
  "Specs is a list of desired Cilium specific rule specification.",
  "pkg/k8s/apis/cilium.io/v2/ccnp_types.go",
  43,
  44
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].description",
  "string",
  "string",
  "Description is a free form string, it can be used by the creator of the rule to store human readable explanation of the purpose of this rule.",
  "pkg/policy/api/rule.go",
  142,
  143
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress",
  "[]EgressRule",
  "[]EgressRule",
  "Egress is a list of EgressRule which are enforced at egress.",
  "pkg/policy/api/rule.go",
  100,
  101
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[]",
  "EgressRule",
  "EgressRule",
  "Egress is a list of EgressRule which are enforced at egress.",
  "pkg/policy/api/rule.go",
  100,
  101
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].authentication",
  "*Authentication",
  "*Authentication",
  "Authentication is the required authentication type for the allowed traffic, if any.",
  "pkg/policy/api/egress.go",
  180,
  181
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].authentication.mode",
  "AuthenticationMode",
  "string",
  "Mode is the required authentication mode for the allowed traffic, if any.",
  "pkg/policy/api/rule.go",
  25,
  26
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].icmps",
  "ICMPRules",
  "[]ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is allowed to connect to.",
  "pkg/policy/api/egress.go",
  175,
  176
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].icmps[]",
  "ICMPRule",
  "ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is allowed to connect to.",
  "pkg/policy/api/egress.go",
  175,
  176
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].icmps[].fields",
  "[]ICMPField",
  "[]ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].icmps[].fields[]",
  "ICMPField",
  "ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].icmps[].fields[].family",
  "string",
  "string",
  "Family is a IP address version.",
  "pkg/policy/api/icmp.go",
  87,
  88
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].icmps[].fields[].type",
  "*intstr.IntOrString",
  "*intstr.IntOrString",
  "Type is a ICMP-type.",
  "pkg/policy/api/icmp.go",
  107,
  108
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toCIDR",
  "CIDRSlice",
  "[]CIDR",
  "ToCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  48,
  49
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toCIDR[]",
  "CIDR",
  "string",
  "ToCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  48,
  49
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toCIDRSet",
  "CIDRRuleSlice",
  "[]CIDRRule",
  "ToCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections to in addition to connections which are allowed via ToEndpoints, along with a list of subnets contained within their corresponding IP block to which traffic should not be allowed.",
  "pkg/policy/api/egress.go",
  64,
  65
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[]",
  "CIDRRule",
  "CIDRRule",
  "ToCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections to in addition to connections which are allowed via ToEndpoints, along with a list of subnets contained within their corresponding IP block to which traffic should not be allowed.",
  "pkg/policy/api/egress.go",
  64,
  65
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidr",
  "CIDR",
  "string",
  "CIDR is a CIDR prefix / IP Block.",
  "pkg/policy/api/cidr.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupRef",
  "CIDRGroupRef",
  "string",
  "CIDRGroupRef is a reference to a CiliumCIDRGroup object.",
  "pkg/policy/api/cidr.go",
  36,
  37
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector",
  "EndpointSelector",
  "EndpointSelector",
  "CIDRGroupSelector selects CiliumCIDRGroups by their labels, rather than by name.",
  "pkg/policy/api/cidr.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].cidrGroupSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].except",
  "[]CIDR",
  "[]CIDR",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toCIDRSet[].except[]",
  "CIDR",
  "string",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toEndpoints",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "ToEndpoints is a list of endpoints identified by an EndpointSelector to which the endpoints subject to the rule are allowed to communicate.",
  "pkg/policy/api/egress.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toEndpoints[]",
  "EndpointSelector",
  "EndpointSelector",
  "ToEndpoints is a list of endpoints identified by an EndpointSelector to which the endpoints subject to the rule are allowed to communicate.",
  "pkg/policy/api/egress.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toEndpoints[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toEndpoints[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toEndpoints[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toEndpoints[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toEndpoints[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toEndpoints[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toEndpoints[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toEndpoints[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toEntities",
  "EntitySlice",
  "[]Entity",
  "ToEntities is a list of special entities to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toEntities[]",
  "Entity",
  "string",
  "ToEntities is a list of special entities to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toFQDNs",
  "FQDNSelectorSlice",
  "[]FQDNSelector",
  "ToFQDN allows whitelisting DNS names in place of IPs.",
  "pkg/policy/api/egress.go",
  165,
  166
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toFQDNs[]",
  "FQDNSelector",
  "FQDNSelector",
  "ToFQDN allows whitelisting DNS names in place of IPs.",
  "pkg/policy/api/egress.go",
  165,
  166
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toFQDNs[].matchName",
  "string",
  "string",
  "MatchName matches literal DNS names.",
  "pkg/policy/api/fqdn.go",
  39,
  40
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toFQDNs[].matchPattern",
  "string",
  "string",
  "MatchPattern allows using wildcards to match DNS names.",
  "pkg/policy/api/fqdn.go",
  64,
  65
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toGroups",
  "[]Groups",
  "[]Groups",
  "ToGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/egress.go",
  93,
  94
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toGroups[]",
  "Groups",
  "Groups",
  "ToGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/egress.go",
  93,
  94
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toGroups[].aws",
  "*AWSGroup",
  "*AWSGroup",
  "Carries aws in the typed policy object.",
  "pkg/policy/api/groups.go",
  22,
  22
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toGroups[].aws.labels",
  "map[string]string",
  "map[string]string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toGroups[].aws.labels[<exact-key>]",
  "string",
  "string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toGroups[].aws.region",
  "string",
  "string",
  "Deprecated: Region is unused.",
  "pkg/policy/api/groups.go",
  45,
  46
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toGroups[].aws.securityGroupsIds",
  "[]string",
  "[]string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toGroups[].aws.securityGroupsIds[]",
  "string",
  "string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toGroups[].aws.securityGroupsNames",
  "[]string",
  "[]string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toGroups[].aws.securityGroupsNames[]",
  "string",
  "string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toNodes",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "ToNodes is a list of nodes identified by an EndpointSelector to which endpoints subject to the rule is allowed to communicate.",
  "pkg/policy/api/egress.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toNodes[]",
  "EndpointSelector",
  "EndpointSelector",
  "ToNodes is a list of nodes identified by an EndpointSelector to which endpoints subject to the rule is allowed to communicate.",
  "pkg/policy/api/egress.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toNodes[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toNodes[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toNodes[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toNodes[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toNodes[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toNodes[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toNodes[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toNodes[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts",
  "PortRules",
  "[]PortRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is allowed to connect to.",
  "pkg/policy/api/egress.go",
  148,
  149
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[]",
  "PortRule",
  "PortRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is allowed to connect to.",
  "pkg/policy/api/egress.go",
  148,
  149
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].listener",
  "*Listener",
  "*Listener",
  "listener specifies the name of a custom Envoy listener to which this traffic should be redirected to.",
  "pkg/policy/api/l4.go",
  249,
  250
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].listener.envoyConfig",
  "*EnvoyConfig",
  "*EnvoyConfig",
  "EnvoyConfig is a reference to the CEC or CCEC resource in which the listener is defined.",
  "pkg/policy/api/l4.go",
  165,
  166
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].listener.envoyConfig.kind",
  "string",
  "string",
  "Kind is the resource type being referred to.",
  "pkg/policy/api/l4.go",
  149,
  150
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].listener.envoyConfig.name",
  "string",
  "string",
  "Name is the resource name of the CiliumEnvoyConfig or CiliumClusterwideEnvoyConfig where the listener is defined in.",
  "pkg/policy/api/l4.go",
  156,
  157
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].listener.name",
  "string",
  "string",
  "Name is the name of the listener.",
  "pkg/policy/api/l4.go",
  171,
  172
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].listener.priority",
  "uint8",
  "uint8",
  "Priority for this Listener that is used when multiple rules would apply different listeners to a policy map entry.",
  "pkg/policy/api/l4.go",
  179,
  180
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].originatingTLS",
  "*TLSContext",
  "*TLSContext",
  "OriginatingTLS is the TLS context for the connections originated by the L7 proxy.",
  "pkg/policy/api/l4.go",
  234,
  235
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].originatingTLS.certificate",
  "string",
  "string",
  "Certificate is the file name or k8s secret item name for the certificate chain.",
  "pkg/policy/api/l4.go",
  129,
  130
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].originatingTLS.privateKey",
  "string",
  "string",
  "PrivateKey is the file name or k8s secret item name for the private key matching the certificate chain.",
  "pkg/policy/api/l4.go",
  136,
  137
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].originatingTLS.secret",
  "*Secret",
  "*Secret",
  "Secret is the secret that contains the certificates and private key for the TLS context.",
  "pkg/policy/api/l4.go",
  115,
  116
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].originatingTLS.secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].originatingTLS.secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].originatingTLS.trustedCA",
  "string",
  "string",
  "TrustedCA is the file name or k8s secret item name for the trusted CA.",
  "pkg/policy/api/l4.go",
  122,
  123
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].ports",
  "[]PortProtocol",
  "[]PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  214,
  215
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].ports[]",
  "PortProtocol",
  "PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  214,
  215
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].ports[].endPort",
  "int32",
  "int32",
  "EndPort can only be an L4 port number.",
  "pkg/policy/api/l4.go",
  53,
  54
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].ports[].port",
  "string",
  "string",
  "Port can be an L4 port number, or a name in the form of \"http\" or \"http-8080\".",
  "pkg/policy/api/l4.go",
  46,
  47
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].ports[].protocol",
  "L4Proto",
  "string",
  "Protocol is the L4 protocol.",
  "pkg/policy/api/l4.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules",
  "*L7Rules",
  "*L7Rules",
  "Rules is a list of additional port level rules which must be met in order for the PortRule to allow the traffic.",
  "pkg/policy/api/l4.go",
  256,
  257
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.dns",
  "PortRulesDNS",
  "[]PortRuleDNS",
  "DNS-specific rules.",
  "pkg/policy/api/l4.go",
  311,
  312
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.dns[]",
  "PortRuleDNS",
  "FQDNSelector",
  "DNS-specific rules.",
  "pkg/policy/api/l4.go",
  311,
  312
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.dns[].matchName",
  "string",
  "string",
  "MatchName matches literal DNS names.",
  "pkg/policy/api/fqdn.go",
  39,
  40
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.dns[].matchPattern",
  "string",
  "string",
  "MatchPattern allows using wildcards to match DNS names.",
  "pkg/policy/api/fqdn.go",
  64,
  65
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http",
  "PortRulesHTTP",
  "[]PortRuleHTTP",
  "HTTP specific rules.",
  "pkg/policy/api/l4.go",
  305,
  306
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[]",
  "PortRuleHTTP",
  "PortRuleHTTP",
  "HTTP specific rules.",
  "pkg/policy/api/l4.go",
  305,
  306
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headerMatches",
  "[]*HeaderMatch",
  "[]*HeaderMatch",
  "HeaderMatches is a list of HTTP headers which must be present and match against the given values.",
  "pkg/policy/api/http.go",
  107,
  108
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headerMatches[]",
  "*HeaderMatch",
  "*HeaderMatch",
  "HeaderMatches is a list of HTTP headers which must be present and match against the given values.",
  "pkg/policy/api/http.go",
  107,
  108
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headerMatches[].mismatch",
  "MismatchAction",
  "string",
  "Mismatch identifies what to do in case there is no match.",
  "pkg/policy/api/http.go",
  34,
  35
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headerMatches[].name",
  "string",
  "string",
  "Name identifies the header.",
  "pkg/policy/api/http.go",
  39,
  40
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headerMatches[].secret",
  "*Secret",
  "*Secret",
  "Secret refers to a secret that contains the value to be matched against.",
  "pkg/policy/api/http.go",
  46,
  47
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headerMatches[].secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headerMatches[].secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headerMatches[].value",
  "string",
  "string",
  "Value matches the exact value of the header.",
  "pkg/policy/api/http.go",
  53,
  54
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headers",
  "[]string",
  "[]string",
  "Headers is a list of HTTP headers which must be present in the request.",
  "pkg/policy/api/http.go",
  100,
  101
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].headers[]",
  "string",
  "string",
  "Headers is a list of HTTP headers which must be present in the request.",
  "pkg/policy/api/http.go",
  100,
  101
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].host",
  "string",
  "string",
  "Host is an extended POSIX regex matched against the host header of a request.",
  "pkg/policy/api/http.go",
  93,
  94
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].method",
  "string",
  "string",
  "Method is an extended POSIX regex matched against the method of a request, e.g.",
  "pkg/policy/api/http.go",
  81,
  82
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].rules.http[].path",
  "string",
  "string",
  "Path is an extended POSIX regex matched against the path of a request.",
  "pkg/policy/api/http.go",
  73,
  74
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].serverNames",
  "[]ServerName",
  "[]ServerName",
  "ServerNames is a list of allowed TLS SNI values.",
  "pkg/policy/api/l4.go",
  243,
  244
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].serverNames[]",
  "ServerName",
  "string",
  "ServerNames is a list of allowed TLS SNI values.",
  "pkg/policy/api/l4.go",
  243,
  244
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].terminatingTLS",
  "*TLSContext",
  "*TLSContext",
  "TerminatingTLS is the TLS context for the connection terminated by the L7 proxy.",
  "pkg/policy/api/l4.go",
  224,
  225
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].terminatingTLS.certificate",
  "string",
  "string",
  "Certificate is the file name or k8s secret item name for the certificate chain.",
  "pkg/policy/api/l4.go",
  129,
  130
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].terminatingTLS.privateKey",
  "string",
  "string",
  "PrivateKey is the file name or k8s secret item name for the private key matching the certificate chain.",
  "pkg/policy/api/l4.go",
  136,
  137
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].terminatingTLS.secret",
  "*Secret",
  "*Secret",
  "Secret is the secret that contains the certificates and private key for the TLS context.",
  "pkg/policy/api/l4.go",
  115,
  116
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].terminatingTLS.secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].terminatingTLS.secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toPorts[].terminatingTLS.trustedCA",
  "string",
  "string",
  "TrustedCA is the file name or k8s secret item name for the trusted CA.",
  "pkg/policy/api/l4.go",
  122,
  123
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toRequires",
  "[]string",
  "[]string",
  "Deprecated.",
  "pkg/policy/api/egress.go",
  33,
  34
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toRequires[]",
  "string",
  "string",
  "Deprecated.",
  "pkg/policy/api/egress.go",
  33,
  34
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toServices",
  "[]Service",
  "[]Service",
  "ToServices is a list of services to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  79,
  80
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toServices[]",
  "Service",
  "Service",
  "ToServices is a list of services to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  79,
  80
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sService",
  "*K8sServiceNamespace",
  "*K8sServiceNamespace",
  "K8sService selects service by name and namespace pair.",
  "pkg/policy/api/service.go",
  16,
  17
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sService.namespace",
  "string",
  "string",
  "Carries namespace in the typed policy object.",
  "pkg/policy/api/service.go",
  23,
  23
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sService.serviceName",
  "string",
  "string",
  "Carries serviceName in the typed policy object.",
  "pkg/policy/api/service.go",
  22,
  22
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector",
  "*K8sServiceSelectorNamespace",
  "*K8sServiceSelectorNamespace",
  "K8sServiceSelector selects services by k8s labels and namespace.",
  "pkg/policy/api/service.go",
  14,
  15
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.namespace",
  "string",
  "string",
  "Carries namespace in the typed policy object.",
  "pkg/policy/api/service.go",
  30,
  30
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector",
  "ServiceSelector",
  "EndpointSelector",
  "Carries selector in the typed policy object.",
  "pkg/policy/api/service.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egress[].toServices[].k8sServiceSelector.selector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny",
  "[]EgressDenyRule",
  "[]EgressDenyRule",
  "EgressDeny is a list of EgressDenyRule which are enforced at egress.",
  "pkg/policy/api/rule.go",
  108,
  109
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[]",
  "EgressDenyRule",
  "EgressDenyRule",
  "EgressDeny is a list of EgressDenyRule which are enforced at egress.",
  "pkg/policy/api/rule.go",
  108,
  109
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].icmps",
  "ICMPRules",
  "[]ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is not allowed to connect to.",
  "pkg/policy/api/egress.go",
  218,
  219
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].icmps[]",
  "ICMPRule",
  "ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is not allowed to connect to.",
  "pkg/policy/api/egress.go",
  218,
  219
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].icmps[].fields",
  "[]ICMPField",
  "[]ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].icmps[].fields[]",
  "ICMPField",
  "ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].icmps[].fields[].family",
  "string",
  "string",
  "Family is a IP address version.",
  "pkg/policy/api/icmp.go",
  87,
  88
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].icmps[].fields[].type",
  "*intstr.IntOrString",
  "*intstr.IntOrString",
  "Type is a ICMP-type.",
  "pkg/policy/api/icmp.go",
  107,
  108
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toCIDR",
  "CIDRSlice",
  "[]CIDR",
  "ToCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  48,
  49
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toCIDR[]",
  "CIDR",
  "string",
  "ToCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  48,
  49
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet",
  "CIDRRuleSlice",
  "[]CIDRRule",
  "ToCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections to in addition to connections which are allowed via ToEndpoints, along with a list of subnets contained within their corresponding IP block to which traffic should not be allowed.",
  "pkg/policy/api/egress.go",
  64,
  65
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[]",
  "CIDRRule",
  "CIDRRule",
  "ToCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to initiate connections to in addition to connections which are allowed via ToEndpoints, along with a list of subnets contained within their corresponding IP block to which traffic should not be allowed.",
  "pkg/policy/api/egress.go",
  64,
  65
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidr",
  "CIDR",
  "string",
  "CIDR is a CIDR prefix / IP Block.",
  "pkg/policy/api/cidr.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupRef",
  "CIDRGroupRef",
  "string",
  "CIDRGroupRef is a reference to a CiliumCIDRGroup object.",
  "pkg/policy/api/cidr.go",
  36,
  37
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector",
  "EndpointSelector",
  "EndpointSelector",
  "CIDRGroupSelector selects CiliumCIDRGroups by their labels, rather than by name.",
  "pkg/policy/api/cidr.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].cidrGroupSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].except",
  "[]CIDR",
  "[]CIDR",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toCIDRSet[].except[]",
  "CIDR",
  "string",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "ToEndpoints is a list of endpoints identified by an EndpointSelector to which the endpoints subject to the rule are allowed to communicate.",
  "pkg/policy/api/egress.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[]",
  "EndpointSelector",
  "EndpointSelector",
  "ToEndpoints is a list of endpoints identified by an EndpointSelector to which the endpoints subject to the rule are allowed to communicate.",
  "pkg/policy/api/egress.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toEndpoints[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toEntities",
  "EntitySlice",
  "[]Entity",
  "ToEntities is a list of special entities to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toEntities[]",
  "Entity",
  "string",
  "ToEntities is a list of special entities to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toGroups",
  "[]Groups",
  "[]Groups",
  "ToGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/egress.go",
  93,
  94
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[]",
  "Groups",
  "Groups",
  "ToGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/egress.go",
  93,
  94
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[].aws",
  "*AWSGroup",
  "*AWSGroup",
  "Carries aws in the typed policy object.",
  "pkg/policy/api/groups.go",
  22,
  22
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[].aws.labels",
  "map[string]string",
  "map[string]string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[].aws.labels[<exact-key>]",
  "string",
  "string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[].aws.region",
  "string",
  "string",
  "Deprecated: Region is unused.",
  "pkg/policy/api/groups.go",
  45,
  46
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[].aws.securityGroupsIds",
  "[]string",
  "[]string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[].aws.securityGroupsIds[]",
  "string",
  "string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[].aws.securityGroupsNames",
  "[]string",
  "[]string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toGroups[].aws.securityGroupsNames[]",
  "string",
  "string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toNodes",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "ToNodes is a list of nodes identified by an EndpointSelector to which endpoints subject to the rule is allowed to communicate.",
  "pkg/policy/api/egress.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[]",
  "EndpointSelector",
  "EndpointSelector",
  "ToNodes is a list of nodes identified by an EndpointSelector to which endpoints subject to the rule is allowed to communicate.",
  "pkg/policy/api/egress.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toNodes[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toPorts",
  "PortDenyRules",
  "[]PortDenyRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is not allowed to connect to.",
  "pkg/policy/api/egress.go",
  208,
  209
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toPorts[]",
  "PortDenyRule",
  "PortDenyRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is not allowed to connect to.",
  "pkg/policy/api/egress.go",
  208,
  209
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toPorts[].ports",
  "[]PortProtocol",
  "[]PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  284,
  285
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toPorts[].ports[]",
  "PortProtocol",
  "PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  284,
  285
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toPorts[].ports[].endPort",
  "int32",
  "int32",
  "EndPort can only be an L4 port number.",
  "pkg/policy/api/l4.go",
  53,
  54
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toPorts[].ports[].port",
  "string",
  "string",
  "Port can be an L4 port number, or a name in the form of \"http\" or \"http-8080\".",
  "pkg/policy/api/l4.go",
  46,
  47
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toPorts[].ports[].protocol",
  "L4Proto",
  "string",
  "Protocol is the L4 protocol.",
  "pkg/policy/api/l4.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toRequires",
  "[]string",
  "[]string",
  "Deprecated.",
  "pkg/policy/api/egress.go",
  33,
  34
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toRequires[]",
  "string",
  "string",
  "Deprecated.",
  "pkg/policy/api/egress.go",
  33,
  34
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toServices",
  "[]Service",
  "[]Service",
  "ToServices is a list of services to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  79,
  80
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toServices[]",
  "Service",
  "Service",
  "ToServices is a list of services to which the endpoint subject to the rule is allowed to initiate connections.",
  "pkg/policy/api/egress.go",
  79,
  80
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sService",
  "*K8sServiceNamespace",
  "*K8sServiceNamespace",
  "K8sService selects service by name and namespace pair.",
  "pkg/policy/api/service.go",
  16,
  17
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sService.namespace",
  "string",
  "string",
  "Carries namespace in the typed policy object.",
  "pkg/policy/api/service.go",
  23,
  23
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sService.serviceName",
  "string",
  "string",
  "Carries serviceName in the typed policy object.",
  "pkg/policy/api/service.go",
  22,
  22
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector",
  "*K8sServiceSelectorNamespace",
  "*K8sServiceSelectorNamespace",
  "K8sServiceSelector selects services by k8s labels and namespace.",
  "pkg/policy/api/service.go",
  14,
  15
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.namespace",
  "string",
  "string",
  "Carries namespace in the typed policy object.",
  "pkg/policy/api/service.go",
  30,
  30
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector",
  "ServiceSelector",
  "EndpointSelector",
  "Carries selector in the typed policy object.",
  "pkg/policy/api/service.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].egressDeny[].toServices[].k8sServiceSelector.selector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].enableDefaultDeny",
  "DefaultDenyConfig",
  "DefaultDenyConfig",
  "EnableDefaultDeny determines whether this policy configures the subject endpoint(s) to have a default deny mode.",
  "pkg/policy/api/rule.go",
  135,
  136
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].enableDefaultDeny.egress",
  "*bool",
  "*bool",
  "Whether or not the endpoint should have a default-deny rule applied to egress traffic.",
  "pkg/policy/api/rule.go",
  41,
  42
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].enableDefaultDeny.ingress",
  "*bool",
  "*bool",
  "Whether or not the endpoint should have a default-deny rule applied to ingress traffic.",
  "pkg/policy/api/rule.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].endpointSelector",
  "EndpointSelector",
  "EndpointSelector",
  "EndpointSelector selects all endpoints which should be subject to this rule.",
  "pkg/policy/api/rule.go",
  73,
  74
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].endpointSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].endpointSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].endpointSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].endpointSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].endpointSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].endpointSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].endpointSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].endpointSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress",
  "[]IngressRule",
  "[]IngressRule",
  "Ingress is a list of IngressRule which are enforced at ingress.",
  "pkg/policy/api/rule.go",
  86,
  87
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[]",
  "IngressRule",
  "IngressRule",
  "Ingress is a list of IngressRule which are enforced at ingress.",
  "pkg/policy/api/rule.go",
  86,
  87
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].authentication",
  "*Authentication",
  "*Authentication",
  "Authentication is the required authentication type for the allowed traffic, if any.",
  "pkg/policy/api/ingress.go",
  160,
  161
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].authentication.mode",
  "AuthenticationMode",
  "string",
  "Mode is the required authentication mode for the allowed traffic, if any.",
  "pkg/policy/api/rule.go",
  25,
  26
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromCIDR",
  "CIDRSlice",
  "[]CIDR",
  "FromCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  50,
  51
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromCIDR[]",
  "CIDR",
  "string",
  "FromCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  50,
  51
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet",
  "CIDRRuleSlice",
  "[]CIDRRule",
  "FromCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from in addition to FromEndpoints, along with a list of subnets contained within their corresponding IP block from which traffic should not be allowed.",
  "pkg/policy/api/ingress.go",
  65,
  66
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[]",
  "CIDRRule",
  "CIDRRule",
  "FromCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from in addition to FromEndpoints, along with a list of subnets contained within their corresponding IP block from which traffic should not be allowed.",
  "pkg/policy/api/ingress.go",
  65,
  66
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidr",
  "CIDR",
  "string",
  "CIDR is a CIDR prefix / IP Block.",
  "pkg/policy/api/cidr.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupRef",
  "CIDRGroupRef",
  "string",
  "CIDRGroupRef is a reference to a CiliumCIDRGroup object.",
  "pkg/policy/api/cidr.go",
  36,
  37
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector",
  "EndpointSelector",
  "EndpointSelector",
  "CIDRGroupSelector selects CiliumCIDRGroups by their labels, rather than by name.",
  "pkg/policy/api/cidr.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].cidrGroupSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].except",
  "[]CIDR",
  "[]CIDR",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromCIDRSet[].except[]",
  "CIDR",
  "string",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "FromEndpoints is a list of endpoints identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  29,
  30
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[]",
  "EndpointSelector",
  "EndpointSelector",
  "FromEndpoints is a list of endpoints identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  29,
  30
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromEndpoints[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromEntities",
  "EntitySlice",
  "[]Entity",
  "FromEntities is a list of special entities which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  73,
  74
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromEntities[]",
  "Entity",
  "string",
  "FromEntities is a list of special entities which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  73,
  74
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromGroups",
  "[]Groups",
  "[]Groups",
  "FromGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/ingress.go",
  88,
  89
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromGroups[]",
  "Groups",
  "Groups",
  "FromGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/ingress.go",
  88,
  89
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromGroups[].aws",
  "*AWSGroup",
  "*AWSGroup",
  "Carries aws in the typed policy object.",
  "pkg/policy/api/groups.go",
  22,
  22
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromGroups[].aws.labels",
  "map[string]string",
  "map[string]string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromGroups[].aws.labels[<exact-key>]",
  "string",
  "string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromGroups[].aws.region",
  "string",
  "string",
  "Deprecated: Region is unused.",
  "pkg/policy/api/groups.go",
  45,
  46
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromGroups[].aws.securityGroupsIds",
  "[]string",
  "[]string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromGroups[].aws.securityGroupsIds[]",
  "string",
  "string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromGroups[].aws.securityGroupsNames",
  "[]string",
  "[]string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromGroups[].aws.securityGroupsNames[]",
  "string",
  "string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromNodes",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "FromNodes is a list of nodes identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  95,
  96
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromNodes[]",
  "EndpointSelector",
  "EndpointSelector",
  "FromNodes is a list of nodes identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  95,
  96
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromNodes[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromNodes[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromNodes[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromNodes[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromNodes[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromNodes[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromNodes[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromNodes[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromRequires",
  "[]string",
  "[]string",
  "Deprecated.",
  "pkg/policy/api/ingress.go",
  34,
  35
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].fromRequires[]",
  "string",
  "string",
  "Deprecated.",
  "pkg/policy/api/ingress.go",
  34,
  35
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].icmps",
  "ICMPRules",
  "[]ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  155,
  156
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].icmps[]",
  "ICMPRule",
  "ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  155,
  156
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].icmps[].fields",
  "[]ICMPField",
  "[]ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].icmps[].fields[]",
  "ICMPField",
  "ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].icmps[].fields[].family",
  "string",
  "string",
  "Family is a IP address version.",
  "pkg/policy/api/icmp.go",
  87,
  88
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].icmps[].fields[].type",
  "*intstr.IntOrString",
  "*intstr.IntOrString",
  "Type is a ICMP-type.",
  "pkg/policy/api/icmp.go",
  107,
  108
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts",
  "PortRules",
  "[]PortRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  144,
  145
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[]",
  "PortRule",
  "PortRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  144,
  145
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].listener",
  "*Listener",
  "*Listener",
  "listener specifies the name of a custom Envoy listener to which this traffic should be redirected to.",
  "pkg/policy/api/l4.go",
  249,
  250
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].listener.envoyConfig",
  "*EnvoyConfig",
  "*EnvoyConfig",
  "EnvoyConfig is a reference to the CEC or CCEC resource in which the listener is defined.",
  "pkg/policy/api/l4.go",
  165,
  166
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].listener.envoyConfig.kind",
  "string",
  "string",
  "Kind is the resource type being referred to.",
  "pkg/policy/api/l4.go",
  149,
  150
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].listener.envoyConfig.name",
  "string",
  "string",
  "Name is the resource name of the CiliumEnvoyConfig or CiliumClusterwideEnvoyConfig where the listener is defined in.",
  "pkg/policy/api/l4.go",
  156,
  157
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].listener.name",
  "string",
  "string",
  "Name is the name of the listener.",
  "pkg/policy/api/l4.go",
  171,
  172
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].listener.priority",
  "uint8",
  "uint8",
  "Priority for this Listener that is used when multiple rules would apply different listeners to a policy map entry.",
  "pkg/policy/api/l4.go",
  179,
  180
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].originatingTLS",
  "*TLSContext",
  "*TLSContext",
  "OriginatingTLS is the TLS context for the connections originated by the L7 proxy.",
  "pkg/policy/api/l4.go",
  234,
  235
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].originatingTLS.certificate",
  "string",
  "string",
  "Certificate is the file name or k8s secret item name for the certificate chain.",
  "pkg/policy/api/l4.go",
  129,
  130
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].originatingTLS.privateKey",
  "string",
  "string",
  "PrivateKey is the file name or k8s secret item name for the private key matching the certificate chain.",
  "pkg/policy/api/l4.go",
  136,
  137
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].originatingTLS.secret",
  "*Secret",
  "*Secret",
  "Secret is the secret that contains the certificates and private key for the TLS context.",
  "pkg/policy/api/l4.go",
  115,
  116
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].originatingTLS.secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].originatingTLS.secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].originatingTLS.trustedCA",
  "string",
  "string",
  "TrustedCA is the file name or k8s secret item name for the trusted CA.",
  "pkg/policy/api/l4.go",
  122,
  123
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].ports",
  "[]PortProtocol",
  "[]PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  214,
  215
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].ports[]",
  "PortProtocol",
  "PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  214,
  215
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].ports[].endPort",
  "int32",
  "int32",
  "EndPort can only be an L4 port number.",
  "pkg/policy/api/l4.go",
  53,
  54
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].ports[].port",
  "string",
  "string",
  "Port can be an L4 port number, or a name in the form of \"http\" or \"http-8080\".",
  "pkg/policy/api/l4.go",
  46,
  47
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].ports[].protocol",
  "L4Proto",
  "string",
  "Protocol is the L4 protocol.",
  "pkg/policy/api/l4.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules",
  "*L7Rules",
  "*L7Rules",
  "Rules is a list of additional port level rules which must be met in order for the PortRule to allow the traffic.",
  "pkg/policy/api/l4.go",
  256,
  257
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.dns",
  "PortRulesDNS",
  "[]PortRuleDNS",
  "DNS-specific rules.",
  "pkg/policy/api/l4.go",
  311,
  312
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.dns[]",
  "PortRuleDNS",
  "FQDNSelector",
  "DNS-specific rules.",
  "pkg/policy/api/l4.go",
  311,
  312
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.dns[].matchName",
  "string",
  "string",
  "MatchName matches literal DNS names.",
  "pkg/policy/api/fqdn.go",
  39,
  40
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.dns[].matchPattern",
  "string",
  "string",
  "MatchPattern allows using wildcards to match DNS names.",
  "pkg/policy/api/fqdn.go",
  64,
  65
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http",
  "PortRulesHTTP",
  "[]PortRuleHTTP",
  "HTTP specific rules.",
  "pkg/policy/api/l4.go",
  305,
  306
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[]",
  "PortRuleHTTP",
  "PortRuleHTTP",
  "HTTP specific rules.",
  "pkg/policy/api/l4.go",
  305,
  306
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headerMatches",
  "[]*HeaderMatch",
  "[]*HeaderMatch",
  "HeaderMatches is a list of HTTP headers which must be present and match against the given values.",
  "pkg/policy/api/http.go",
  107,
  108
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headerMatches[]",
  "*HeaderMatch",
  "*HeaderMatch",
  "HeaderMatches is a list of HTTP headers which must be present and match against the given values.",
  "pkg/policy/api/http.go",
  107,
  108
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headerMatches[].mismatch",
  "MismatchAction",
  "string",
  "Mismatch identifies what to do in case there is no match.",
  "pkg/policy/api/http.go",
  34,
  35
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headerMatches[].name",
  "string",
  "string",
  "Name identifies the header.",
  "pkg/policy/api/http.go",
  39,
  40
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headerMatches[].secret",
  "*Secret",
  "*Secret",
  "Secret refers to a secret that contains the value to be matched against.",
  "pkg/policy/api/http.go",
  46,
  47
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headerMatches[].secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headerMatches[].secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headerMatches[].value",
  "string",
  "string",
  "Value matches the exact value of the header.",
  "pkg/policy/api/http.go",
  53,
  54
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headers",
  "[]string",
  "[]string",
  "Headers is a list of HTTP headers which must be present in the request.",
  "pkg/policy/api/http.go",
  100,
  101
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].headers[]",
  "string",
  "string",
  "Headers is a list of HTTP headers which must be present in the request.",
  "pkg/policy/api/http.go",
  100,
  101
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].host",
  "string",
  "string",
  "Host is an extended POSIX regex matched against the host header of a request.",
  "pkg/policy/api/http.go",
  93,
  94
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].method",
  "string",
  "string",
  "Method is an extended POSIX regex matched against the method of a request, e.g.",
  "pkg/policy/api/http.go",
  81,
  82
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].rules.http[].path",
  "string",
  "string",
  "Path is an extended POSIX regex matched against the path of a request.",
  "pkg/policy/api/http.go",
  73,
  74
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].serverNames",
  "[]ServerName",
  "[]ServerName",
  "ServerNames is a list of allowed TLS SNI values.",
  "pkg/policy/api/l4.go",
  243,
  244
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].serverNames[]",
  "ServerName",
  "string",
  "ServerNames is a list of allowed TLS SNI values.",
  "pkg/policy/api/l4.go",
  243,
  244
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].terminatingTLS",
  "*TLSContext",
  "*TLSContext",
  "TerminatingTLS is the TLS context for the connection terminated by the L7 proxy.",
  "pkg/policy/api/l4.go",
  224,
  225
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].terminatingTLS.certificate",
  "string",
  "string",
  "Certificate is the file name or k8s secret item name for the certificate chain.",
  "pkg/policy/api/l4.go",
  129,
  130
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].terminatingTLS.privateKey",
  "string",
  "string",
  "PrivateKey is the file name or k8s secret item name for the private key matching the certificate chain.",
  "pkg/policy/api/l4.go",
  136,
  137
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].terminatingTLS.secret",
  "*Secret",
  "*Secret",
  "Secret is the secret that contains the certificates and private key for the TLS context.",
  "pkg/policy/api/l4.go",
  115,
  116
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].terminatingTLS.secret.name",
  "string",
  "string",
  "Name is the name of the secret.",
  "pkg/policy/api/l4.go",
  99,
  100
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].terminatingTLS.secret.namespace",
  "string",
  "string",
  "Namespace is the namespace in which the secret exists.",
  "pkg/policy/api/l4.go",
  94,
  95
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingress[].toPorts[].terminatingTLS.trustedCA",
  "string",
  "string",
  "TrustedCA is the file name or k8s secret item name for the trusted CA.",
  "pkg/policy/api/l4.go",
  122,
  123
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny",
  "[]IngressDenyRule",
  "[]IngressDenyRule",
  "IngressDeny is a list of IngressDenyRule which are enforced at ingress.",
  "pkg/policy/api/rule.go",
  94,
  95
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[]",
  "IngressDenyRule",
  "IngressDenyRule",
  "IngressDeny is a list of IngressDenyRule which are enforced at ingress.",
  "pkg/policy/api/rule.go",
  94,
  95
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDR",
  "CIDRSlice",
  "[]CIDR",
  "FromCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  50,
  51
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDR[]",
  "CIDR",
  "string",
  "FromCIDR is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  50,
  51
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet",
  "CIDRRuleSlice",
  "[]CIDRRule",
  "FromCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from in addition to FromEndpoints, along with a list of subnets contained within their corresponding IP block from which traffic should not be allowed.",
  "pkg/policy/api/ingress.go",
  65,
  66
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[]",
  "CIDRRule",
  "CIDRRule",
  "FromCIDRSet is a list of IP blocks which the endpoint subject to the rule is allowed to receive connections from in addition to FromEndpoints, along with a list of subnets contained within their corresponding IP block from which traffic should not be allowed.",
  "pkg/policy/api/ingress.go",
  65,
  66
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidr",
  "CIDR",
  "string",
  "CIDR is a CIDR prefix / IP Block.",
  "pkg/policy/api/cidr.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupRef",
  "CIDRGroupRef",
  "string",
  "CIDRGroupRef is a reference to a CiliumCIDRGroup object.",
  "pkg/policy/api/cidr.go",
  36,
  37
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector",
  "EndpointSelector",
  "EndpointSelector",
  "CIDRGroupSelector selects CiliumCIDRGroups by their labels, rather than by name.",
  "pkg/policy/api/cidr.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].cidrGroupSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].except",
  "[]CIDR",
  "[]CIDR",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromCIDRSet[].except[]",
  "CIDR",
  "string",
  "ExceptCIDRs is a list of IP blocks which the endpoint subject to the rule is not allowed to initiate connections to.",
  "pkg/policy/api/cidr.go",
  52,
  53
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "FromEndpoints is a list of endpoints identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  29,
  30
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[]",
  "EndpointSelector",
  "EndpointSelector",
  "FromEndpoints is a list of endpoints identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  29,
  30
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromEndpoints[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromEntities",
  "EntitySlice",
  "[]Entity",
  "FromEntities is a list of special entities which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  73,
  74
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromEntities[]",
  "Entity",
  "string",
  "FromEntities is a list of special entities which the endpoint subject to the rule is allowed to receive connections from.",
  "pkg/policy/api/ingress.go",
  73,
  74
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups",
  "[]Groups",
  "[]Groups",
  "FromGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/ingress.go",
  88,
  89
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[]",
  "Groups",
  "Groups",
  "FromGroups allows policies to reference CIDRs provided by external integrations.",
  "pkg/policy/api/ingress.go",
  88,
  89
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[].aws",
  "*AWSGroup",
  "*AWSGroup",
  "Carries aws in the typed policy object.",
  "pkg/policy/api/groups.go",
  22,
  22
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[].aws.labels",
  "map[string]string",
  "map[string]string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[].aws.labels[<exact-key>]",
  "string",
  "string",
  "Labels selects AWS ENIs by labels.",
  "pkg/policy/api/groups.go",
  28,
  29
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[].aws.region",
  "string",
  "string",
  "Deprecated: Region is unused.",
  "pkg/policy/api/groups.go",
  45,
  46
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[].aws.securityGroupsIds",
  "[]string",
  "[]string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[].aws.securityGroupsIds[]",
  "string",
  "string",
  "SecurityGroupsIds selects VPC SecurityGroups by IDs.",
  "pkg/policy/api/groups.go",
  35,
  36
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[].aws.securityGroupsNames",
  "[]string",
  "[]string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromGroups[].aws.securityGroupsNames[]",
  "string",
  "string",
  "SecurityGroupsNames selects VPC SecurityGroups by name.",
  "pkg/policy/api/groups.go",
  42,
  43
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes",
  "[]EndpointSelector",
  "[]EndpointSelector",
  "FromNodes is a list of nodes identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  95,
  96
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[]",
  "EndpointSelector",
  "EndpointSelector",
  "FromNodes is a list of nodes identified by an EndpointSelector which are allowed to communicate with the endpoint subject to the rule.",
  "pkg/policy/api/ingress.go",
  95,
  96
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[].matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[].matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[].matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[].matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[].matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[].matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[].matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromNodes[].matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromRequires",
  "[]string",
  "[]string",
  "Deprecated.",
  "pkg/policy/api/ingress.go",
  34,
  35
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].fromRequires[]",
  "string",
  "string",
  "Deprecated.",
  "pkg/policy/api/ingress.go",
  34,
  35
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].icmps",
  "ICMPRules",
  "[]ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is not allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  199,
  200
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].icmps[]",
  "ICMPRule",
  "ICMPRule",
  "ICMPs is a list of ICMP rule identified by type number which the endpoint subject to the rule is not allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  199,
  200
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].icmps[].fields",
  "[]ICMPField",
  "[]ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].icmps[].fields[]",
  "ICMPField",
  "ICMPField",
  "Fields is a list of ICMP fields.",
  "pkg/policy/api/icmp.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].icmps[].fields[].family",
  "string",
  "string",
  "Family is a IP address version.",
  "pkg/policy/api/icmp.go",
  87,
  88
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].icmps[].fields[].type",
  "*intstr.IntOrString",
  "*intstr.IntOrString",
  "Type is a ICMP-type.",
  "pkg/policy/api/icmp.go",
  107,
  108
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].toPorts",
  "PortDenyRules",
  "[]PortDenyRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is not allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  188,
  189
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].toPorts[]",
  "PortDenyRule",
  "PortDenyRule",
  "ToPorts is a list of destination ports identified by port number and protocol which the endpoint subject to the rule is not allowed to receive connections on.",
  "pkg/policy/api/ingress.go",
  188,
  189
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].toPorts[].ports",
  "[]PortProtocol",
  "[]PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  284,
  285
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].toPorts[].ports[]",
  "PortProtocol",
  "PortProtocol",
  "Ports is a list of L4 port/protocol .",
  "pkg/policy/api/l4.go",
  284,
  285
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].toPorts[].ports[].endPort",
  "int32",
  "int32",
  "EndPort can only be an L4 port number.",
  "pkg/policy/api/l4.go",
  53,
  54
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].toPorts[].ports[].port",
  "string",
  "string",
  "Port can be an L4 port number, or a name in the form of \"http\" or \"http-8080\".",
  "pkg/policy/api/l4.go",
  46,
  47
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].ingressDeny[].toPorts[].ports[].protocol",
  "L4Proto",
  "string",
  "Protocol is the L4 protocol.",
  "pkg/policy/api/l4.go",
  72,
  73
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].labels",
  "labels.LabelArray",
  "[]Label",
  "Labels is a list of optional strings which can be used to re-identify the rule or to store metadata.",
  "pkg/policy/api/rule.go",
  116,
  117
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].labels[]",
  "Label",
  "Label",
  "Labels is a list of optional strings which can be used to re-identify the rule or to store metadata.",
  "pkg/policy/api/rule.go",
  116,
  117
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].labels[].key",
  "string",
  "string",
  "Carries key in the typed policy object.",
  "pkg/labels/labels.go",
  209,
  209
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].labels[].source",
  "string",
  "string",
  "Source can be one of the above values (e.g.: LabelSourceK8s).",
  "pkg/labels/labels.go",
  213,
  214
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].labels[].value",
  "string",
  "string",
  "Carries value in the typed policy object.",
  "pkg/labels/labels.go",
  210,
  210
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].log",
  "LogConfig",
  "LogConfig",
  "Log specifies custom policy-specific Hubble logging configuration.",
  "pkg/policy/api/rule.go",
  147,
  148
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].log.value",
  "string",
  "string",
  "Value is a free-form string that is included in Hubble flows that match this policy.",
  "pkg/policy/api/rule.go",
  51,
  52
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].nodeSelector",
  "EndpointSelector",
  "EndpointSelector",
  "NodeSelector selects all nodes which should be subject to this rule.",
  "pkg/policy/api/rule.go",
  80,
  81
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].nodeSelector.matchExpressions",
  "[]LabelSelectorRequirement",
  "[]LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].nodeSelector.matchExpressions[]",
  "LabelSelectorRequirement",
  "LabelSelectorRequirement",
  "matchExpressions is a list of label selector requirements.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  276,
  277
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].nodeSelector.matchExpressions[].key",
  "string",
  "string",
  "key is the label key that the selector applies to.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  289,
  290
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].nodeSelector.matchExpressions[].operator",
  "LabelSelectorOperator",
  "string",
  "operator represents a key's relationship to a set of values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  294,
  295
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].nodeSelector.matchExpressions[].values",
  "[]string",
  "[]string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].nodeSelector.matchExpressions[].values[]",
  "string",
  "string",
  "values is an array of string values.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  301,
  302
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].nodeSelector.matchLabels",
  "map[string]MatchLabelsValue",
  "map[string]MatchLabelsValue",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.specs[].nodeSelector.matchLabels[<exact-key>]",
  "MatchLabelsValue",
  "string",
  "matchLabels is a map of {key,value} pairs.",
  "pkg/k8s/slim/k8s/apis/meta/v1/types.go",
  272,
  273
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.status",
  "CiliumNetworkPolicyStatus",
  "CiliumNetworkPolicyStatus",
  "Status is the status of the Cilium policy rule.",
  "pkg/k8s/apis/cilium.io/v2/ccnp_types.go",
  52,
  53
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.status.conditions",
  "[]NetworkPolicyCondition",
  "[]NetworkPolicyCondition",
  "Carries conditions in the typed policy object.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  92,
  93
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.status.conditions[]",
  "NetworkPolicyCondition",
  "NetworkPolicyCondition",
  "Carries conditions[] in the typed policy object.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  92,
  93
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.status.conditions[].lastTransitionTime",
  "slimv1.Time",
  "Time",
  "The last time the condition transitioned from one status to another.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  264,
  265
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.status.conditions[].message",
  "string",
  "string",
  "A human readable message indicating details about the transition.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  270,
  271
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.status.conditions[].reason",
  "string",
  "string",
  "The reason for the condition's last transition.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  267,
  268
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.status.conditions[].status",
  "v1.ConditionStatus",
  "string",
  "The status of the condition, one of True, False, or Unknown.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  261,
  262
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.status.conditions[].type",
  "PolicyConditionType",
  "string",
  "The type of the policy condition.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  258,
  259
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.status.derivativePolicies",
  "map[string]CiliumNetworkPolicyNodeStatus",
  "map[string]CiliumNetworkPolicyNodeStatus",
  "DerivativePolicies is the status of all policies derived from the Cilium policy .",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  85,
  86
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.status.derivativePolicies[<exact-key>]",
  "CiliumNetworkPolicyNodeStatus",
  "CiliumNetworkPolicyNodeStatus",
  "DerivativePolicies is the status of all policies derived from the Cilium policy .",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  85,
  86
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.status.derivativePolicies[<exact-key>].annotations",
  "map[string]string",
  "map[string]string",
  "Annotations corresponds to the Annotations in the ObjectMeta of the CNP that have been realized on the node for CNP.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  138,
  139
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.status.derivativePolicies[<exact-key>].annotations[<exact-key>]",
  "string",
  "string",
  "Annotations corresponds to the Annotations in the ObjectMeta of the CNP that have been realized on the node for CNP.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  138,
  139
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.status.derivativePolicies[<exact-key>].enforcing",
  "bool",
  "bool",
  "Enforcing is set to true once all endpoints present at the time the policy has been imported are enforcing this policy.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  128,
  129
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.status.derivativePolicies[<exact-key>].error",
  "string",
  "string",
  "Error describes any error that occurred when parsing or importing the policy, or realizing the policy for the endpoints to which it applies on the node.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  111,
  112
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.status.derivativePolicies[<exact-key>].lastUpdated",
  "slimv1.Time",
  "Time",
  "LastUpdated contains the last time this status was updated .",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  116,
  117
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.status.derivativePolicies[<exact-key>].localPolicyRevision",
  "uint64",
  "uint64",
  "Revision is the policy revision of the repository which first implemented this policy.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  122,
  123
 ],
 [
  "CiliumClusterwideNetworkPolicy",
  "$.status.derivativePolicies[<exact-key>].ok",
  "bool",
  "bool",
  "OK is true when the policy has been parsed and imported successfully into the in-memory policy repository on the node.",
  "pkg/k8s/apis/cilium.io/v2/cnp_types.go",
  104,
  105
 ]
];
export const receiverContracts = declarations.map(([kind,fieldPath,type,underlyingType,purpose,sourcePath,start,end])=> {
 const decode=decoded(underlyingType,fieldPath),route=family(kind,fieldPath,type);
 const record={kind,fieldPath,purpose,receiver:route.receiver,
  operationScope:'Cilium 1.20.1 fresh typed decoding and the specifically cited parser, operator, agent, repository, selector, DNS, service or proxy receiving function. API-server admission/defaulting and live enforcement are separate boundaries.',
  ...decode,changeImpact:route.effect,crossFieldConditions:route.conditions,
  cases:[{name:'omitted-in-present-parent',condition:`${fieldPath} is absent from a present immediate parent in a fresh object`,sourceOutcome:decode.omitted},{name:'null-in-present-parent',condition:`${fieldPath} is JSON null within a present immediate parent`,sourceOutcome:decode.nullValue},{name:'empty-in-present-parent',condition:`${fieldPath} is a present empty collection/object or primitive zero`,sourceOutcome:decode.emptyValue},...route.cases],
  evidence:[source(sourcePath,start,end,'The pinned receiving Go declaration establishes this field and its type; it does not by itself prove admission or runtime outcomes.'),decoder,...route.evidence],qualificationLimits:[...limits,...route.extraLimits]};
 if(fieldPath.endsWith('[<exact-key>]')) record.evidence.push({url:'https://github.com/golang/go/blob/2dc996f71b0ebafb77e64433e58333e049488a3c/src/encoding/json/decode.go#L690-L696',claim:'Each map value starts as a zero temporary value before decoding.'},{url:'https://github.com/golang/go/blob/2dc996f71b0ebafb77e64433e58333e049488a3c/src/encoding/json/decode.go#L809-L813',claim:'The decoded map element is written back under the exact key, including a zero primitive for null.'});
 const aliasName=type.replace(/^\*/, '').split('.').at(-1);
 const seenAliases=new Set();let alias=aliasName;while(aliases[alias]&&!seenAliases.has(alias)){seenAliases.add(alias);const [underlying,file,line]=aliases[alias];record.evidence.push(source(file,line,line,'The Go alias '+alias+' declares underlying type '+underlying+'. Its declaration establishes value representation; custom methods are checked separately.'));alias=underlying.replace(/^\*/, '').split('.').at(-1);}
 refine(record,type);
 return record;
});
