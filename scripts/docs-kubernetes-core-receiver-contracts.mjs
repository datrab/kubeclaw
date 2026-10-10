/** Authored core/v1 receiving contracts. Schema authority supplies boundary enumeration
 * only. These source-derived outcomes require independent review and do not report
 * an executed API request, controller reconciliation or storage-driver operation. */
import { apiResourceFieldBoundaries } from './docs-api-schema-authorities.mjs';
const revision = '66452049f3d692768c39c797b21b793dce80314e';
const source = (path, lines, claim) => ({url:`https://github.com/kubernetes/kubernetes/blob/${revision}/${path}#L${String(lines).replace('-', '-L')}`,claim});
const v = (lines, claim) => source('pkg/apis/core/validation/validation.go',lines,claim);
const d = (lines, claim) => source('pkg/apis/core/v1/defaults.go',lines,claim);
const om = (lines, claim) => source('staging/src/k8s.io/apimachinery/pkg/api/validation/objectmeta.go',lines,claim);
const mv = (lines, claim) => source('staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/validation/validation.go',lines,claim);
const pu = (lines, claim) => source('pkg/api/persistentvolumeclaim/util.go',lines,claim);
const alloc = (lines, claim) => source('pkg/registry/core/service/storage/alloc.go',lines,claim);
const kinds = ['ConfigMap','Namespace','PersistentVolumeClaim','Service'];
const strategyNames = {ConfigMap:'configmap',Namespace:'namespace',PersistentVolumeClaim:'persistentvolumeclaim',Service:'service'};
const routes = {
 ConfigMap:[source('pkg/registry/core/configmap/strategy.go','51-88','ConfigMap is namespace scoped and routes typed create/update to ConfigMap validation; it has no status reset or generation increment.')],
 Namespace:[source('pkg/registry/core/namespace/strategy.go','51-102','Namespace is cluster scoped; create sets Active and inserts the kubernetes spec finalizer; ordinary update preserves spec.finalizers and status.'),source('pkg/registry/core/namespace/strategy.go','168-214','Status updates retain spec; finalize updates retain status and validate spec finalizers.')],
 PersistentVolumeClaim:[source('pkg/registry/core/persistentvolumeclaim/strategy.go','67-86','Create clears status, drops disabled fields and normalizes compatible data sources before PVC validation.'),source('pkg/registry/core/persistentvolumeclaim/strategy.go','102-134','Ordinary update preserves old status and normalizes data sources before update validation.'),source('pkg/registry/core/persistentvolumeclaim/strategy.go','156-169','Status updates retain old spec and drop disabled status fields before status validation.')],
 Service:[source('pkg/registry/core/service/strategy.go','70-94','Create clears status; ordinary update preserves status and drops disabled/type-dependent fields.'),source('pkg/registry/core/service/strategy.go','150-166','The status strategy retains spec and validates the status route.')]
};
const decoder = [source('staging/src/k8s.io/apimachinery/pkg/runtime/serializer/json/json.go','267-304','The typed JSON serializer dispatches to preserving case-sensitive JSON decode; strict decode additionally reports unknown and duplicate fields.'),source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go','950-1004','Custom UnmarshalJSON receives a token first; otherwise null clears pointers/maps/slices and does not change ordinary scalar or value-struct targets.'),source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go','1028-1105','Scalar decode rejects incompatible token kinds and invalid or overflowing integer values.'),source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go','535-625','Slice decoding retains each supplied element and decodes it into its typed target; a null item is not removal.'),source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go','765-773','Map decoding allocates or resets a typed zero-value element.'),source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go','831-895','Map values are typed-decoded and inserted under their supplied key, including null-derived zero values.')];
const records = new Map();
const definitions = new Map();
function define(kind,path,purpose,omitted,emptyValue,invalidValue,evidence,options={}) {
 const key=`${kind}:${path}`;
 if(definitions.has(key))throw Error(`duplicate authored definition ${key}`);
 definitions.set(key,{purpose,omitted,emptyValue,invalidValue,...options,evidence:[...evidence,...(options.evidence??[])]});
}
const all=(path,...args)=>{for(const k of kinds)define(k,path,...args);};
const scope='Kubernetes v1.35.0 core/v1 fresh typed JSON create; ordinary typed update and named status/finalize subresources where stated. Decoding precedes defaults, preparation and validation. Omission and null below describe a present immediate parent at that typed boundary; they are not patch instructions.';
const limits=['Pinned source expectations are not a performed API request, live authorization check, admission chain, persistence check or controller/runtime test. The operator must inspect the stored object and relevant dependencies before relying on the result.', 'Apply and GitOps first construct a patch or resulting object. Ownership, current state and patch type determine whether an omitted field is retained or deleted; these typed create statements do not determine that winner. Read the actual object and managedFields before a retry. An interrupted request requires an object read before repeating an external effect.'];
const recovery='Read the stored object after the request, especially after an interrupted response. Correct the named validation or dependency failure, then retry with current resourceVersion and field ownership. A stored intent does not prove that its consumer has converged.';
for(const k of kinds){
 const vf=k==='ConfigMap'?v('7758-7785','ConfigMap validation checks object metadata, key bags, overlap and total decoded bytes.'):k==='Namespace'?v('8168-8174','Namespace create validates cluster-scoped metadata and each spec finalizer.'):k==='PersistentVolumeClaim'?v('2397-2400','PVC validation checks namespace-scoped metadata and claim spec.'):v('6924-6936','Service create checks metadata with the feature-selected Service name rule and validates the spec.');
 define(k,'$',`Create or update one ${k} API object.`, 'No HTTP object is supplied by absence of a request body; a typed zero object is a separate case.', k==='ConfigMap'?'{} has no identity; with valid metadata an empty ConfigMap is accepted.':k==='Namespace'?'{} has no identity; with valid metadata preparation supplies Active and the kubernetes finalizer.':k==='PersistentVolumeClaim'?'{} lacks identity, access modes and a positive storage request.': '{} lacks identity and required ports after defaulting to ClusterIP.', 'Invalid identity, incompatible JSON tokens or resource-specific invalid combinations reject the request before persistence.',[vf],{changeImpact:`Creation stores ${k} intent. Deletion and controller effects depend on its finalizers and consumers. ${recovery}`});
}
all('$.apiVersion','Select the receiving API group and version.','A serializer with the endpoint/default GVK can supply a missing version; this is distinct from unstructured client discovery.','The empty string follows missing-version serializer handling.','An incompatible supplied version/kind cannot be treated as arbitrary data; the endpoint serializer selects and converts a known object.',[source('staging/src/k8s.io/apimachinery/pkg/runtime/serializer/json/json.go','138-215','Decode interprets TypeMeta, applies supplied/default kind/version and chooses a registered typed target.')],{changeImpact:'Use the API version served by the endpoint and supported by the client; changing TypeMeta does not convert an unknown object by itself.'});
all('$.kind','Select the receiving resource type.','A provided typed target or default GVK can supply a missing kind; clients must still address the correct resource endpoint.','Empty kind follows serializer inference, not a resource-specific spec default.','An unknown or mismatched registered type fails serializer selection or endpoint handling.',[source('staging/src/k8s.io/apimachinery/pkg/runtime/serializer/json/json.go','138-215','TypeMeta interpretation and typed target selection precede decode.')],{changeImpact:'Address the correct resource endpoint; changing kind is not a supported mutation of an existing resource.'});
all('$.metadata','Supply identity, concurrency and lifecycle metadata.','The zero metadata lacks a name unless name generation occurs; namespace is resolved from request scope.','{} needs a name or generateName; the server supplies system metadata.','Invalid name/scope, labels, annotations, owner references, finalizers or managed fields reject metadata validation.',[om('182-202','Create requires a generated or explicit name and runs shared metadata checks.'),om('247-271','Shared metadata validates scope, nonnegative generation, labels, annotations, ownership, finalizers and managed fields.')]);
for(const k of kinds){
 const grammar=k==='Namespace'?'DNS label':k==='Service'?'DNS-1035 label, or DNS-1123 label when RelaxedServiceNameValidation is enabled':'DNS-1123 subdomain';
 define(k,'$.metadata.name',`Name the ${k} in its API scope.`, 'Empty name requires generateName and server name generation; without either, create fails.', 'An empty string is invalid after name generation.',`The name must satisfy the ${grammar} rule. Existing-object name changes are rejected.`,[om('182-202','Create checks the supplied/generated name through its resource name function.'),om('330-335','Update treats name, namespace and UID as immutable.'),...(k==='Service'?[v('6924-6936','Service create chooses relaxed name validation from the feature gate.')]:[v(k==='Namespace'?'8168-8174':k==='ConfigMap'?'7758-7762':'2397-2400','Resource validation selects its specific name function.')])],{changeImpact:'Rename requires a separately created object and migration of its consumers; an update cannot rename this object.'});
 define(k,'$.metadata.namespace','Match object scope to the request namespace.',k==='Namespace'?'The cluster-scoped request requires an empty namespace.':'The request namespace fills an empty object namespace before validation.',k==='Namespace'?'Empty is required.':'Empty is filled from a namespaced request; absence of request scope is an error.',k==='Namespace'?'A nonempty namespace is forbidden for this cluster-scoped resource.':'A conflicting object/request namespace is rejected; a namespace must satisfy its name rule.',[source('staging/src/k8s.io/apiserver/pkg/registry/rest/create.go','112-118','BeforeCreate enforces object namespace against request and strategy scope.'),om('250-263','Shared metadata requires namespaced scope or forbids namespace on cluster-scoped objects.'),om('330-335','Namespace is immutable on update.')],{changeImpact:'Moving an object across namespaces requires a separately created object and consumer changes.'});
}
all('$.metadata.generateName','Request server-generated object identity when name is absent.','No name generation occurs; supply name.','An empty string requests no generated name.','The prefix is checked by the resource name validator; the generated name must also validate.',[om('185-201','Nonempty generateName is validated; final name is required.'),source('staging/src/k8s.io/apiserver/pkg/registry/rest/create.go','106-110','BeforeCreate requires name generation to have finished.')],{changeImpact:'A new generated name creates a distinct object; use the returned name for later reads and consumer references.'});
for(const path of ['$.metadata.labels','$.metadata.labels[<exact-key>]'])all(path,'Attach label selection data.',path.endsWith(']')?'An absent key contributes no label.':'No authored labels are supplied.','An empty map contributes no labels; an empty string value at a present valid key is allowed.','Invalid qualified keys or label values reject validation. Non-string map tokens fail typed decode.',[mv('113-120','ValidateLabels checks each key and value.')],{crossFieldConditions:['For Namespace, defaulting and canonicalization set kubernetes.io/metadata.name to the namespace name, overwriting an authored value.'],evidence:[d('326-338','Namespace defaulting adds the metadata-name label.'),source('pkg/registry/core/namespace/strategy.go','117-144','Canonicalize also sets this label after generated name becomes available.')]});
for(const path of ['$.metadata.annotations','$.metadata.annotations[<exact-key>]'])all(path,'Store annotation key/value data for named consumers.',path.endsWith(']')?'No entry is supplied for this key.':'No annotation entries are supplied.','Empty map is permitted; empty string is a retained annotation value.','Annotation keys are checked as lowercased qualified names; total original key plus value bytes must not exceed 262144.',[om('44-67','Annotation key validation and aggregate size count apply.')],{crossFieldConditions:['Service topology-mode and deprecated topology-hints annotations must agree when both are present. Service source-range annotation is used only when spec.loadBalancerSourceRanges is empty.'],evidence:[v('6576-6584','Service topology annotation equality check.'),v('6722-6749','Service source-range annotation fallback and validation.')]});
for(const path of ['$.metadata.finalizers','$.metadata.finalizers[]'])all(path,'Delay final object removal until named cleanup finishes.',path.endsWith('[]')?'Removing this element removes its cleanup requirement.':'No metadata finalizer is authored.','An empty list contains no metadata cleanup requirement; an empty string item is invalid.','Create validates qualified finalizer names and rejects simultaneous orphan and foreground-deletion finalizers. Update forbids adding finalizers after deletion starts.',[om('111-128','Finalizer name validation and deletion-time additions check.'),om('275-292','Create rejects conflicting propagation finalizers.'),om('315-318','Update forbids new finalizers during deletion.')],{changeImpact:'Removing a finalizer can permit deletion before external cleanup completes. Diagnose the named cleanup owner and retained data before removal.'});
for(const path of ['$.metadata.ownerReferences','$.metadata.ownerReferences[]'])all(path,'Record ownership used by garbage collection.',path.endsWith('[]')?'No owner is contributed by an absent item.':'No owner references are authored.','An empty list is allowed; {} or null retained item has empty apiVersion, kind, name and UID and fails ownership validation.','Each reference requires version, kind, name and UID; v1 Event ownership is banned and at most one reference can have controller true.',[om('69-110','Owner validation requires identity and restricts the controlling reference.')],{changeImpact:'Changing owner references changes garbage-collection intent. This validator does not resolve the owner object or prove cleanup has run.',qualificationLimits:['Available-source documentation gap: exact garbage-collector graph, cross-namespace owner handling, propagation admission and blockOwnerDeletion authorization are not qualified in this module; the documentation owner must add their immutable consumers before relying on those effects.']});
for(const [field,omit,empty,invalid] of [
 ['apiVersion','The empty scalar is rejected.','Empty string is rejected.','A version parsed from apiVersion must be nonempty.'],['kind','The empty scalar is rejected.','Empty string is rejected.','Kind must be nonempty; v1 Event owners are banned.'],['name','The empty scalar is rejected.','Empty string is rejected.','Name must be nonempty; owner existence is not checked here.'],['uid','The empty UID scalar is rejected.','Empty string is rejected.','UID must be nonempty; this validator does not compare it with a live owner.'],['controller','The nil pointer does not designate a controller.','False is accepted and does not designate a controller.','More than one true controller reference is rejected.'],['blockOwnerDeletion','The nil pointer contributes no true blocking request.','False is retained.','Typed non-boolean values fail decoding; owner-reference validation adds no boolean value restriction.']])all(`$.metadata.ownerReferences[].${field}`,`Set owner-reference ${field}.`,omit,empty,invalid,[om('69-110','Owner-reference validation checks identity and a single controller.')],{changeImpact:'Changes owner-reference metadata; garbage-collection and admission behavior require the separate owner-consumer proof.',qualificationLimits:['Available-source documentation gap: downstream owner graph and owner-reference permission enforcement require additional immutable source qualification.']});
for(const path of ['$.metadata.managedFields','$.metadata.managedFields[]'])all(path,'Record field ownership metadata used by apply/update.',path.endsWith('[]')?'An absent entry records no manager.':'No authored ownership entries are supplied; server field management can produce them.','An empty list is valid metadata; a retained {} item fails because operation is neither Apply nor Update.','Operations must be Apply or Update; nonempty fieldsType must be FieldsV1; manager must be printable and at most 128 bytes; subresource at most 256 bytes.',[mv('209-228','Manager validation checks byte length and printable characters.'),mv('267-288','ManagedFields entry validation checks operation, fieldsType, manager and subresource.')],{changeImpact:'Do not edit ownership records as a substitute for the intended apply operation. Read actual manager and subresource ownership before resolving a conflict.',qualificationLimits:['Available-source documentation gap: server field-manager normalization, conflict computation and reset-field transfer are not reproduced by metadata validation. A valid entry is not proof that its authored ownership survives the request.']});
for(const [field,omitted,empty,invalid] of [
 ['operation','Empty operation is invalid for a retained entry.','Empty string is rejected.','Only Apply and Update are accepted.'],['fieldsType','Empty fieldsType is permitted by metadata validation.','Empty string is permitted.','A nonempty value other than FieldsV1 is rejected.'],['manager','Empty manager is permitted by this metadata validator.','Empty string is permitted.','More than 128 bytes or nonprintable characters are rejected.'],['subresource','Empty means no named subresource in the entry.','Empty string is permitted.','More than 256 bytes is rejected.'],['apiVersion','Empty remains; this metadata validator does not restrict this child.','Empty string has no child-specific validation error.','The shown metadata validator imposes no apiVersion grammar; field management remains separate.'],['fieldsV1','The pointer remains nil; no field set is authored here.','{} is an empty field-set representation.','The custom field-set decoder and later field manager are separate from this metadata validator.'],['time','The pointer remains nil.','An empty time string fails RFC3339 parsing through the Time custom decoder.','A malformed nonempty RFC3339 timestamp fails the custom Time decoder.']])all(`$.metadata.managedFields[].${field}`,`Record managed-field ${field}.`,omitted,empty,invalid,[mv('267-288','The metadata entry validator checks only operation, fieldsType, manager and subresource.'),...(field==='time'?[source('staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/time.go','99-119','Time custom JSON decoding treats null as zero and parses all supplied strings, including empty strings, as RFC3339.')]:[])],{changeImpact:'Changing ownership metadata does not itself prove an apply ownership change.',qualificationLimits:['Available-source documentation gap: the server field manager consumes and can rewrite this metadata; its complete field-set behavior requires separate source qualification.']});
for(const [field,omitted,empty,invalid] of [
 ['generation','Zero remains; these core strategies do not initialize Deployment-style generation.','Zero is allowed.','Negative create generation or a decrease on update is rejected.'],['resourceVersion','Create has no authored version; storage assigns it. On an unconditional typed update these strategies can admit an empty version after store completion.','Empty is not a concurrency precondition; the store can supply current version for unconditional updates.','A stale nonempty version conflicts against current storage state; metadata validation requires a version after store completion.'],['uid','Storage create fills a new UID.','An empty UID is filled for create.','UID changes are rejected on update.'],['creationTimestamp','Storage create fills creation time.','Zero time is replaced on create.','Creation timestamp changes are rejected on update; malformed timestamps fail custom decode.'],['deletionTimestamp','No deletion timestamp is requested.','Zero time means no effective timestamp.','Ordinary update cannot change the stored deletion timestamp.'],['deletionGracePeriodSeconds','The pointer stays nil.','Zero is a present grace value; delete processing is a separate request boundary.','Ordinary update cannot change this lifecycle value.'],['selfLink','The deprecated scalar stays empty.','Empty is retained.','The shown ObjectMeta validator imposes no value-specific selfLink restriction.']])all(`$.metadata.${field}`,`Record server lifecycle or concurrency field ${field}.`,omitted,empty,invalid,[om('265-271','Create metadata checks generation and child validators.'),om('320-340','Update requires resourceVersion, nondecreasing generation and immutable lifecycle identity.')],{changeImpact:'Use the server-returned lifecycle fields for observation and concurrency. Do not infer successful deletion or cleanup from a manually authored field.',qualificationLimits:['Available-source documentation gap: generic store lifecycle initialization, delete grace calculation and storage concurrency need their complete source ranges before these expectations are accepted.']});
const cmEvidence=[v('7758-7785','ConfigMap keys are validated; overlapping data/binaryData keys are rejected and decoded value bytes are summed against MaxSecretSize.'),v('7790-7809','An old immutable ConfigMap cannot unset immutable or change either data map.')];
const cmConsumer=[source('pkg/volume/configmap/configmap.go','263-299','Volume payload creation converts text values to bytes, preserves binary bytes and fails a missing selected key unless optional.')];
for(const bag of ['data','binaryData']){
 define('ConfigMap',`$.${bag}`,`Store the ${bag==='data'?'text':'binary'} configuration key bag.`, 'No entries are supplied in this bag. An otherwise valid empty ConfigMap is accepted.', '{} supplies no entries and contributes zero value bytes.', 'Invalid keys, an overlapping key in the other bag or total decoded value bytes above 1048576 reject validation.',[...cmEvidence,...cmConsumer],{crossFieldConditions:['data and binaryData keys cannot overlap. Combined text bytes and decoded binary bytes must not exceed 1048576.','Once immutable is true, even nil versus an empty map can fail the deep-equality update check.'],changeImpact:'A permitted mutable data update changes the API object. Volume payload creation reads these values; it does not prove that mounted files or process environment have refreshed.',qualificationLimits:['Available-source documentation gap: ConfigMap manager cache/watch behavior, atomic-writer publication, environment reread and subPath refresh behavior require their own immutable consumer proof. Existing process environment does not follow from this payload routine.']});
 define('ConfigMap',`$.${bag}[<exact-key>]`,`Store one ${bag==='data'?'text value':'base64-encoded byte value'} under its exact key.`, 'An absent key stores no entry; selected nonoptional volume key then fails payload construction.',bag==='data'?'An empty string stores an empty text value under a present key.':'An empty base64 string decodes to zero bytes and stores an empty byte value under a present key.',`The key must pass ConfigMap key grammar; overlap and aggregate size checks also apply. ${bag==='data'?'Non-string scalar tokens fail typed string decoding.':'A string with invalid base64 fails byte-slice decoding; a numeric JSON array follows the Go byte-slice array decoder and is not proof of a valid YAML/client input.'}`,[...cmEvidence,...cmConsumer,...(bag==='binaryData'?[source('vendor/sigs.k8s.io/json/internal/golang/encoding/json/decode.go','1038-1050','A string decoded into a byte slice is base64-decoded; malformed base64 is returned as an error.')]:[])],{crossFieldConditions:['The exact key stays present after typed null; null is not a delete instruction.'],changeImpact:'Changing one retained entry changes payload bytes for subsequent consumers. Check the effective object and the selected key before recreating or refreshing a consumer.'});
}
define('ConfigMap','$.immutable','Prevent subsequent changes to either configuration data bag.','Nil is not immutable.','False is mutable; true permanently locks the data bags for this object.','Once the old value is true, update cannot set false or nil, or change data/binaryData.',cmEvidence,{changeImpact:'A locked ConfigMap requires a new object for changed payload. Update consumer references and verify the new content before retiring the old object; metadata can still change.'});
const nsEvidence=[v('8168-8193','Namespace spec finalizers require qualified names or recognized standard legacy finalizer names.'),source('pkg/registry/core/namespace/strategy.go','63-94','Create ensures the kubernetes finalizer; normal updates preserve finalizers and status.'),source('pkg/registry/core/namespace/strategy.go','189-214','Finalize route validates finalizers and preserves status.')];
const namespaceDeletionSource=(lines,claim)=>source('pkg/controller/namespace/deletion/namespaced_resources_deleter.go',lines,claim);
const namespaceWorkerSource=(lines,claim)=>source('pkg/controller/namespace/namespace_controller.go',lines,claim);
const namespaceDeletionConditions=[
 'Namespace spec.finalizers differs from metadata.finalizers. Create inserts kubernetes into spec.finalizers. Ordinary update preserves spec.finalizers and status; the finalize endpoint preserves stored status and can change this list.',
 'The deletion controller reads the current Namespace. Without deletionTimestamp it does no cleanup. Otherwise it sets the phase to Terminating. If spec.finalizers is already empty, it returns without deleting content.',
 'Discovery selects resources that support delete. Discovery and group-version errors are collected while deletion continues for the available resources. These errors prevent the finalizer-removal step for that attempt.',
 'For each selected resource, the controller first tries background collection deletion. If that operation is unsupported, it lists and deletes individual objects with background propagation. It then lists again to check remaining objects. Unsupported listing skips this check; it is not an empty-list result.',
 'With OrderedNamespaceDeletion enabled and Pods in discovery, the controller processes Pods first. If Pods remain, it delays deletion of other resources. Without that condition, it iterates the discovered resources without this Pod-first barrier.',
 'For nonterminal Pods, the controller estimates the maximum supplied terminationGracePeriodSeconds. The estimate becomes zero when that duration has elapsed since Namespace deletion. Remaining objects with finalizers and no remaining grace estimate cause a 15-second estimate. An estimate is a retry input, not a completion deadline. Remaining objects without finalizers or a grace estimate cause an error.',
 'After error-free cleanup with no positive estimate, the controller removes only its configured spec finalizer token through Finalize. It preserves other tokens and removes duplicate remaining tokens through a set. Other finalizers can keep the Namespace present. A conflict causes a fresh read and retry; a changed Namespace UID stops that retry.',
 'The worker clears queue retry state after success. ResourcesRemainingError schedules another attempt after integer estimate/2 + 1 seconds. Other returned errors use the rate-limited queue. This worker has no attempt-count stop. Inspect discovery, deletion errors, remaining objects and their finalizers before a corrective change. Restore failed access or the responsible cleanup controller; removing a token does not perform its cleanup.',
];
const namespaceDeletionCases=[
 {name:'No deletion requested',condition:'The current Namespace has no deletionTimestamp.',sourceOutcome:'Delete returns without deleting content or removing a spec finalizer.'},
 {name:'Finalizers cleared before cleanup',condition:'The deleting Namespace already has empty spec.finalizers.',sourceOutcome:'The deleter returns before deleteAllContent. Empty finalizers do not prove that this controller deleted its content.'},
 {name:'Partial discovery failure',condition:'Discovery returns some deletable resources and an error.',sourceOutcome:'The controller attempts available resources, returns the collected error and does not reach its finalizer-removal step in that attempt.'},
 {name:'Collection deletion unsupported',condition:'Collection deletion is unsupported but listing works.',sourceOutcome:'The controller lists and deletes each object with background propagation, then lists again to inspect what remains.'},
 {name:'Listing unsupported',condition:'The operation cache or API reports listing unsupported.',sourceOutcome:'The controller cannot enumerate or verify that collection. It follows the unsupported-operation path; this is not proof that no objects exist.'},
 {name:'Ordered Pods remain',condition:'OrderedNamespaceDeletion is enabled, Pods are discoverable and the Pod pass reports remaining Pods.',sourceOutcome:'The controller returns before deleting other resource types; its error or positive estimate determines the worker retry route.'},
 {name:'Other finalizer remains',condition:'Cleanup permits Finalize but the Namespace has another spec finalizer token.',sourceOutcome:'Finalize removes only the configured token and retains the other token. This does not establish Namespace deletion or external cleanup.'},
 {name:'Namespace recreated during conflict',condition:'Finalize or phase update conflicts and the fresh read has a different UID.',sourceOutcome:'The conflict loop returns an error rather than modifying the new Namespace lifetime.'},
];
const namespaceDeletionEvidence=[
 namespaceDeletionSource('102-133','Delete reads current Namespace, ignores absent deletionTimestamp, updates its phase and stops if spec.finalizers is empty.'),
 namespaceDeletionSource('136-155','Errors or positive estimates prevent the finalizer step; otherwise Delete calls Finalize and treats NotFound as completion of its API operation.'),
 namespaceDeletionSource('247-265','Conflict retry reloads the Namespace and stops if its UID changes.'),
 namespaceDeletionSource('269-305','Phase update sets Terminating; finalization removes only the configured token and deduplicates retained spec finalizers.'),
 namespaceDeletionSource('315-342','Collection deletion uses background propagation; unsupported or NotFound responses select the fallback route.'),
 namespaceDeletionSource('355-376','Listing checks cached operation support and treats MethodNotSupported or NotFound as unsupported, not an empty successful list.'),
 namespaceDeletionSource('380-397','Fallback lists and deletes individual objects with background propagation; unsupported listing skips individual deletion.'),
 namespaceDeletionSource('429-456','The resource pass tries collection deletion, falls back to individual deletion and lists again; unsupported listing returns its estimate without an empty-list check.'),
 namespaceDeletionSource('460-490','Remaining objects contribute finalizer counts; a positive grace estimate is retained, finalizers receive the default estimate, and unexpected remaining objects cause an error.'),
 namespaceDeletionSource('208-212','The default remaining-finalizer estimate is 15 seconds.'),
 namespaceDeletionSource('511-525','Discovery and group-version errors are collected while resources with the delete verb are selected.'),
 namespaceDeletionSource('533-562','OrderedNamespaceDeletion processes Pods first and returns before other resources if Pods remain.'),
 namespaceDeletionSource('565-607','Other resource deletions continue after individual errors; totals update conditions and the collected errors are returned.'),
 namespaceDeletionSource('614-627','Pod grace estimation errors propagate; elapsed time since Namespace deletion clears the estimate.'),
 namespaceDeletionSource('631-656','The Pod estimate requires a usable client and successful list, excludes terminal Pods and takes the maximum supplied termination grace period.'),
 namespaceWorkerSource('143-166','The worker forgets successful work, schedules remaining-resource estimates after estimate/2+1 seconds and rate-limits other errors without an attempt-count guard.'),
];
for(const p of ['$.spec','$.spec.finalizers','$.spec.finalizers[]'])define('Namespace',p,p==='$.spec'?'Set namespace finalization intent.':p.endsWith('[]')?'Add one namespace cleanup finalizer.':'List namespace cleanup finalizers.',p.endsWith('[]')?'No item is contributed by absence; create still ensures kubernetes.':'Create inserts kubernetes if it is not present.','{} spec or [] list receives kubernetes on create. A retained empty string finalizer is invalid.','A retained finalizer must be a qualified name or recognized standard legacy name. Ordinary update cannot alter this list; use the finalize subresource.',nsEvidence,{changeImpact:'A finalize update can release the namespace for removal. Inspect remaining namespaced content and its cleanup failures before removing a finalizer.',qualificationLimits:['The deletion controller processes the resources returned by discovery and the operations it can use. Unsupported listing cannot establish that a collection is empty. Namespace absence does not prove external storage cleanup or application recovery.'],crossFieldConditions:namespaceDeletionConditions,cases:namespaceDeletionCases,evidence:namespaceDeletionEvidence});
const pvcEvidence=[v('2462-2530','PVC spec requires access modes and positive storage; checks selector, class, mode and data-source combinations.'),v('2539-2621','PVC update compares spec after bounded volumeName/class/bound-request exceptions; volumeMode is immutable and shrinking is restricted.')];
const pvcConditions=['A claim needs at least one access mode and a positive resources.requests.storage value.','The ordinary endpoint preserves stored status; bound status determines the allowed request-size and volume-attributes exceptions.','PVC spec is immutable except the exact update branches for one-time volumeName, storage-class upgrades, bound storage requests and volume attributes. A change permitted by API validation is not proof that storage expansion or data population succeeds.'];
const pvcLimits=['The pinned core controller can select/bind or start provision operations, but the selected StorageClass, external provisioner, snapshot/clone/populator, ReferenceGrant authority, CSI driver, attach/mount, filesystem resize and application recovery are separate consumers. Their exact deployed versions and state are not established here. Available-source documentation gaps must be resolved for the selected storage route; a valid or Bound PVC does not prove healthy data or successful backup/restore.'];
define('PersistentVolumeClaim','$.spec','Request a persistent volume and optional data population.','The zero spec is rejected for no access mode and no storage request.','{} is rejected for those requirements.','Invalid mode, access-mode combination, selector, storage quantity or data-source combination rejects the spec.',pvcEvidence,{crossFieldConditions:pvcConditions,qualificationLimits:pvcLimits,changeImpact:'Accepted claims enter the volume-binding/provisioning workflow. Most spec changes are forbidden after create. Observe phase, events, selected PV and driver state before retry or migration.'});
for(const p of ['$.spec.accessModes','$.spec.accessModes[]'])define('PersistentVolumeClaim',p,'Request supported volume access modes.',p.endsWith('[]')?'An absent item contributes no mode; the list must remain nonempty.':'No modes is rejected.','[] is invalid for the required list. A retained empty string is unsupported.','Only ReadWriteOnce, ReadOnlyMany, ReadWriteMany and ReadWriteOncePod are supported. ReadWriteOncePod cannot be combined with other supported modes.',[v('2464-2491','Access-mode presence, supported values and ReadWriteOncePod exclusion are validated.')],{crossFieldConditions:pvcConditions,qualificationLimits:pvcLimits,changeImpact:'Access-mode changes fail immutable-spec update comparison; selecting a mode does not prove driver enforcement.'});
for(const [field,omitted,empty,invalid,evidence] of [
 ['volumeMode','Nil defaults to Filesystem.','A present empty string is not nil and is rejected.','Only Filesystem and Block are supported; volumeMode is immutable on update.',[d('299-304','PVC spec defaults a nil volumeMode to Filesystem.'),v('2508-2510','Supplied volumeMode must be supported.'),v('2600-2602','VolumeMode is immutable on update.')]],
 ['volumeName','Empty leaves volume selection to the binding controller.','Empty is accepted for an unbound claim.','The spec validator adds no volumeName grammar; update can set it while old volumeName is empty, then immutable-spec comparison restricts changes.',[v('2546-2551','The one-time empty-old-volumeName exception permits binding.'),v('2462-2530','Spec validation does not add a volumeName grammar.')]],
 ['storageClassName','Nil can be filled by DefaultStorageClass admission; admission leaves it nil if no default class exists.','A present empty string requests no class and is not defaulted.','Nonempty class names must validate; changing class is limited to the recorded upgrade exceptions.',[v('2501-2507','A nonempty pointed class name is validated.'),v('2553-2571','Update allows bounded annotation/nil class upgrades.'),source('plugin/pkg/admission/storage/storageclass/setdefault/admission.go','80-119','DefaultStorageClass admission skips an already specified class and otherwise selects a default class or leaves the claim unchanged.')]],
 ['volumeAttributesClassName','Nil requests no class; when the feature is disabled an unused field is dropped.','Empty is permitted on create by the shown conditional check; removal/empty update is forbidden after a class has successfully been applied.','Nonempty class names are validated when enabled; update is forbidden with the gate disabled and has applied-class removal restrictions.',[pu('37-44','Disabled volume attributes are dropped unless already in use.'),v('2523-2528','Enabled nonempty class names are validated.'),v('2604-2621','Class update gate and applied-class removal checks.')]]
])define('PersistentVolumeClaim',`$.spec.${field}`,`Set claim ${field}.`,omitted,empty,invalid,evidence,{crossFieldConditions:pvcConditions,qualificationLimits:pvcLimits,changeImpact:'Check the old claim and exact permitted update branch. A replacement claim needs a separately verified data migration; an API update is not proof of driver completion.'});
for(const p of ['$.spec.resources','$.spec.resources.requests','$.spec.resources.requests[<exact-key>]','$.spec.resources.limits','$.spec.resources.limits[<exact-key>]']){
 const request=p.includes('.requests');const item=p.endsWith(']');
 define('PersistentVolumeClaim',p,request?'Set requested storage Quantity values.':p==='$.spec.resources'?'Set claim volume resource requirements.':'Record claim resource limits.',request||p==='$.spec.resources'?'Without requests.storage the required positive storage check fails.':item?'An absent limit key adds no limit.':'No limit map is supplied; the shown claim spec validator does not require one.',item?'An empty Quantity string is rejected by Quantity.UnmarshalJSON. JSON number 0 is a zero Quantity; requests.storage then fails positivity.':'{} resources or requests omits required storage; {} limits contributes no limits.',request||p==='$.spec.resources'?'requests.storage must be a positive, valid storage Quantity. Other request/limit keys are not iterated by this PVC spec validator; do not import Pod resource validation. Invalid Quantity syntax still fails its custom decoder.':'The shown PVC spec validator does not iterate limits keys or compare limits with requests. Invalid Quantity syntax still fails typed decoding.',[v('2493-2500','The spec validator looks up requests.storage and validates its positive resource quantity.'),source('staging/src/k8s.io/apimachinery/pkg/api/resource/quantity.go','730-751','Quantity.UnmarshalJSON treats null as zero, unquotes strings and parses the quantity.')],{crossFieldConditions:[...pvcConditions,'Bound storage request increase is excluded from immutable comparison. Decrease is forbidden unless recovery is enabled and the new size remains above status.capacity; this is not volume shrinking.'],changeImpact:'Changing a bound storage request can request expansion. Confirm StorageClass and driver expansion support and observe controller/node resize state; do not infer a smaller filesystem from an allowed recovery decrease.',qualificationLimits:pvcLimits});
}
const selectorEvidence=[mv('59-101','LabelSelector requires valid label map, expression key and operator/value combinations.'),source('staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/helpers.go','34-74','Nil selector converts to Nothing; an empty present selector converts to Everything and requirements are ANDed.')];
for(const [p,omitted,empty,invalid] of [
 ['$.spec.selector','Nil supplies no explicit selector to the claim binding matcher.','{} contributes no restrictive selector requirements.','Invalid label keys, values or operator/value combinations fail the selected validation options.'],
 ['$.spec.selector.matchLabels','No equality requirements are added.','{} adds no requirements.','Invalid label keys/values or non-string tokens fail.'],
 ['$.spec.selector.matchLabels[<exact-key>]','No equality requirement for this key is added.','Empty string is a valid label value and requires that exact empty value.','A malformed label key or value fails.'],
 ['$.spec.selector.matchExpressions','No expression requirements are added.','[] adds no requirements.','Each retained item must have valid key, operator and values.'],
 ['$.spec.selector.matchExpressions[]','No expression is added by an absent item.','{} has empty key/operator and is rejected.','Invalid key, unsupported operator or incorrect value count fails.'],
 ['$.spec.selector.matchExpressions[].key','Empty key is rejected.','Empty string is rejected.','Key must be a qualified label name.'],
 ['$.spec.selector.matchExpressions[].operator','Empty operator is rejected.','Empty string is rejected.','Only In, NotIn, Exists and DoesNotExist are accepted.'],
 ['$.spec.selector.matchExpressions[].values','Empty values is accepted for Exists/DoesNotExist and rejected for In/NotIn.','[] has the same operator-dependent result.','In/NotIn require nonempty values; Exists/DoesNotExist require zero values.'],
 ['$.spec.selector.matchExpressions[].values[]','An absent item contributes no comparison value; In/NotIn still need at least one.','Empty string is a valid label value and counts as a comparison element.','Malformed label values fail unless the old-selector compatibility option permits them.']
])define('PersistentVolumeClaim',p,'Restrict candidate PVs by their labels.',omitted,empty,invalid,[...selectorEvidence,v('2466-2472','PVC passes its compatibility option to selector validation.')],{crossFieldConditions:['Requirements are ANDed. A nonnil selector can block dynamic provisioning even when it is {}.','The old claim can permit invalid label values in selector expressions; this is not a blanket bypass for keys, operators or matchLabels.'],changeImpact:'Selector changes fail immutable-spec update comparison. Check existing PV labels and binding events instead of assuming a valid selector finds a volume.',qualificationLimits:pvcLimits});
for(const ref of ['dataSource','dataSourceRef']){
 const path=`$.spec.${ref}`;const ev=[v(ref==='dataSource'?'2404-2429':'2432-2458','Data source validation requires name/kind, core-group PVC kind or valid nonempty API group; dataSourceRef also validates nonempty namespace.'),v('2512-2522','Cross-namespace reference excludes dataSource; otherwise both present references must agree.'),pu('37-60','Disabled data-source reference and cross-namespace fields are dropped unless already in use.'),pu('76-98','Legacy unsupported dataSource can be silently dropped before normalization.'),pu('162-189','Enabled normalization copies a missing local source counterpart, but does not copy a cross-namespace reference to dataSource.')];
 define('PersistentVolumeClaim',path,'Identify the source used to populate the requested volume.','No source is selected by this pointer; normalization can copy a present local counterpart when AnyVolumeDataSource is enabled.','{} is not an accepted retained source: name/kind are missing. Legacy unsupported dataSource can instead be dropped before validation.','A retained source requires nonempty name/kind and valid API group. Core group requires kind PersistentVolumeClaim. dataSource and local dataSourceRef must agree; cross-namespace dataSourceRef forbids dataSource.',ev,{crossFieldConditions:['Prepare drops disabled fields first, then applies legacy compatibility, then normalizes source counterparts. Evaluate the resulting spec, not the authored JSON alone.','When no old source is in use and dataSourceRef is absent, legacy dataSource supports only core PersistentVolumeClaim and snapshot.storage.k8s.io VolumeSnapshot; other kinds are dropped.'],changeImpact:'Source fields participate in immutable-spec validation. API acceptance does not resolve or authorize a source or prove data population.',qualificationLimits:pvcLimits});
 for(const child of ref==='dataSource'?['apiGroup','kind','name']:['apiGroup','kind','name','namespace'])define('PersistentVolumeClaim',`${path}.${child}`,`Set population source ${child}.`,child==='apiGroup'?'Nil denotes the core group, whose permitted kind is PersistentVolumeClaim.':child==='namespace'?'Nil denotes a local source and permits counterpart normalization.':'The empty scalar is rejected if this reference survives preparation.',child==='apiGroup'?'Present empty string denotes core group and requires PersistentVolumeClaim.':child==='namespace'?'Present empty string is treated as local for validation and normalization.':'Empty string is rejected if the reference survives preparation.',child==='apiGroup'?'Nonempty API group must be a DNS subdomain except the named old-object compatibility option.':child==='namespace'?'A nonempty namespace must validate; it excludes dataSource and depends on CrossNamespaceVolumeDataSource handling.':'A nonempty kind/name is required; these checks do not prove target existence or supported population.',ev,{crossFieldConditions:['The parent reference can be dropped or copied before this child reaches validation; see parent preparation order.'],changeImpact:'A retained child change is a data-source spec change and is subject to immutable-spec update checks.',qualificationLimits:pvcLimits});
}
const svcEvidence=[v('6570-6777','Service validation checks its type-dependent ports, selector, affinity, IP fields and traffic policies.'),d('106-163','Service defaulting supplies affinity/type/protocol/targetPort and applicable traffic policies/node-port allocation/ipMode.')];
const svcConditions=['ClusterIP is the default type. ExternalName requires a DNS name and empty clusterIPs/ipFamilies/ipFamilyPolicy.','Normal create clears status and normal update preserves stored status. Status writes use the status subresource and retain spec.','A successful Service write does not prove EndpointSlices, kube-proxy rules, external-address routing, DNS or a load balancer have converged.'];
const svcLimits=['The installed EndpointSlice controller, kube-proxy mode, cluster DNS and load-balancer controller/implementation must be checked for the target cluster. Available-source documentation gaps: exact consumer routing, health checks, address announcement, class selection, affinity enforcement and traffic-distribution behavior require their immutable consumer sources; no network probe or live load-balancer acceptance is proved.'];
define('Service','$.spec','Describe service addressing, backend selection and traffic policy.','Zero spec defaults to ClusterIP/None but lacks required ports.','{} is invalid for required ports except a declared headless or ExternalName route.','Invalid ports, type, IP-family combinations, selector or type-dependent fields reject validation.',svcEvidence,{crossFieldConditions:svcConditions,qualificationLimits:svcLimits});
for(const [field,omitted,empty,invalid,evidence] of [
 ['type','The empty scalar defaults to ClusterIP.','Empty string defaults to ClusterIP.','Only ClusterIP, NodePort, LoadBalancer and ExternalName are accepted.',[v('6676-6691','Type is required/supported and ClusterIP forbids nonzero node ports.')]],
 ['externalName','The empty scalar is invalid when type is ExternalName.','Empty string is invalid for ExternalName; otherwise this validator does not use it.','For ExternalName, trim one trailing dot then require a nonempty DNS subdomain.',[v('6601-6621','ExternalName requires empty IP fields and validates its CNAME.')]],
 ['externalTrafficPolicy','For externally accessible Services the empty scalar defaults to Cluster; otherwise it stays empty.','Empty string follows that default; without an accessible route the empty value is permitted.','Only Cluster or Local is accepted when externally accessible; nonempty is invalid for inaccessible Services.',[v('6824-6841','External policy scope and supported values are checked.')]],
 ['internalTrafficPolicy','Nil defaults to Cluster for ClusterIP, NodePort and LoadBalancer.','A present empty string is unsupported and rejected.','Only Cluster and Local are supported; nil is required to be filled for the three internal service types. Historical validation does not forbid a supported present value on other types.',[v('6875-6892','Internal policy nil/type and supported-value checks.')]],
 ['allocateLoadBalancerNodePorts','Nil defaults to true only for LoadBalancer.','False is retained and requests no automatic LB node-port allocation.','A nonnil value is forbidden on other service types; explicit nodePort remains a separate allocation request.',[v('6758-6765','Field must be nil on non-LB and nonnil on LB.'),alloc('973-981','NodePort or LB with allocation enabled requests automatic node-port allocation.')]],
 ['loadBalancerClass','Nil supplies no explicit class.','A present empty string fails qualified-name validation.','Only LoadBalancer can set this; class cannot change while both old and new type remain LoadBalancer.',[v('9219-9247','Class scope, grammar and immutability are validated.')]],
 ['loadBalancerIP','The scalar remains empty.','Empty supplies no requested load-balancer IP.','The shown Service validator has no independent loadBalancerIP format check. Its consumer interpretation is not proved by API acceptance.',[v('6570-6777','Service validation does not add a loadBalancerIP check.')]],
 ['publishNotReadyAddresses','The scalar remains false.','False is retained; true is stored as endpoint-publication intent.','Non-boolean JSON fails typed decode; Service validator adds no value-level restriction.',[v('6570-6777','Service validation adds no independent check to publishNotReadyAddresses.')]],
 ['trafficDistribution','Nil requests no distribution preference. Disabled unused field is dropped by the strategy.','Present empty string is unsupported if the field survives preparation.','PreferClose is accepted; PreferSameZone/PreferSameNode additionally require PreferSameTrafficDistribution. Unknown values fail.',[source('pkg/registry/core/service/strategy.go','128-135','ServiceTrafficDistribution disabled/old-use rule drops the field.'),v('6896-6921','Feature-selected supported trafficDistribution values are checked.')]]
])define('Service',`$.spec.${field}`,`Set Service ${field}.`,omitted,empty,invalid,[...svcEvidence,...evidence],{crossFieldConditions:svcConditions,qualificationLimits:svcLimits,changeImpact:'A permitted change updates stored Service intent; a type transition can drop fields that belong to the old type. Inspect the resulting spec and dependent endpoints/routing before relying on or reversing the change.',evidence:[source('pkg/registry/core/service/strategy.go','248-308','Type transitions clear old dependent fields only when the new submitted value is unchanged from the old value.')]});
const ipEvidence=[v('8964-9067','Cluster IP/family validation requires matching first ClusterIP, supported distinct families, at most two addresses and one address per family.'),alloc('104-188','Storage initializes policy/family fields from service and cluster configuration.'),alloc('340-451','Storage allocates or reserves cluster addresses and returns Invalid on missing allocator/out-of-range/conflict.'),v('9099-9187','Update validation permits bounded stack upgrades/downgrades and forbids changing retained cluster addresses/families.')];
for(const [p,omitted,empty,invalid] of [
 ['$.spec.clusterIP','Empty requests allocation for an IP-bearing Service; ExternalName has no cluster allocation.','Empty requests allocation; None selects the headless route.','Supplied non-None address must agree with clusterIPs[0] and satisfy IP/allocation constraints; retained address changes are restricted.'],
 ['$.spec.clusterIPs','An empty slice permits storage to allocate addresses according to policy/families.','[] permits allocation for IP-bearing types; [None] is valid only as a sole headless address.','At most two valid addresses, one of each family; primary must equal clusterIP. None must be the first and only value; ExternalName forbids entries.'],
 ['$.spec.clusterIPs[]','An absent item contributes no address; storage may allocate missing family addresses.','Empty string as a retained item is not the collection allocation sentinel and fails IP validation.','Each retained address must validate and agree with its family; duplicate-family pairs and misplaced None fail.'],
 ['$.spec.ipFamilies','Storage derives unspecified families from existing state, supplied addresses and configured service allocators.','[] requests no explicit family choice; storage fills the applicable family.','Only IPv4/IPv6, no duplicates; address position must agree with family. Cluster configuration must provide the requested family.'],
 ['$.spec.ipFamilies[]','No family item is contributed; enclosing policy can still drive allocation.','Empty string as a retained family is unsupported.','Only IPv4 or IPv6 is supported, without duplicates.'],
 ['$.spec.ipFamilyPolicy','Storage initializes nil policy from old state or SingleStack, with declared headless/dual-stack exceptions.','Present empty string is unsupported.','Only SingleStack, PreferDualStack or RequireDualStack is supported; requested dual-stack capability depends on configured family allocators.']
])define('Service',p,'Set the allocated cluster address and IP-family relationship.',omitted,empty,invalid,ipEvidence,{crossFieldConditions:[...svcConditions,'The storage allocator runs in a transaction with IP and port reservations. Failures revert uncommitted allocations. Cluster capability and current allocation state determine which explicit requests succeed.'],changeImpact:'Inspect returned clusterIP/clusterIPs/ipFamilies/policy before routing traffic. Retained addresses and primary family are immutable except named ExternalName and stack-transition branches. On allocation conflict, choose a free configured address or omit the request and retry after reading current state.',qualificationLimits:svcLimits,evidence:[alloc('65-101','Create allocations initialize families then reserve cluster IPs and ports; failure reverses the transaction.')]});
for(const [bag,invalid,evidence] of [
 ['externalIPs','Each new address must validate and must not be a prohibited endpoint address; old values receive the precise legacy compatibility check.',[v('6650-6671','New external IPs use legacy-field and endpoint address checks.')]],
 ['loadBalancerSourceRanges','Only LoadBalancer can supply a nonempty list; trim surrounding whitespace then validate each CIDR, with old-value compatibility.',[v('6714-6754','Explicit source ranges take precedence over the annotation fallback and require LB type.')]]
])for(const p of [`$.spec.${bag}`,`$.spec.${bag}[]`])define('Service',p,bag==='externalIPs'?'Request additional externally routed addresses.':'Restrict load-balancer source ranges.',p.endsWith('[]')?'No value is contributed by absence of an item.':bag==='externalIPs'?'No external addresses are authored.':'No explicit ranges are authored; the source-range annotation can be the fallback.',p.endsWith('[]')?'Empty string as a retained item fails the selected IP/CIDR validator.':'[] supplies no entries; it does not establish routing or firewall enforcement.',invalid,evidence,{crossFieldConditions:svcConditions,qualificationLimits:svcLimits,changeImpact:'Changes stored external-address or filtering intent. Validate external routing and permitted/denied requests before assuming reachability or isolation.'});
for(const p of ['$.spec.selector','$.spec.selector[<exact-key>]'])define('Service',p,'Select backend Pods by exact label equality.',p.endsWith(']')?'Removing this key removes one equality condition.':'Nil supplies no automatic Pod selector.',p.endsWith(']')?'An empty string is a valid label value and retains an equality condition.':'{} contributes no equality condition at API validation; whether an empty selector creates endpoints must be checked in the EndpointSlice consumer.','Invalid label keys or values or incompatible typed string tokens fail.',[v('6629-6631','A nonnil Service selector map is validated as labels.'),mv('113-120','Labels validate each key and value.')],{crossFieldConditions:svcConditions,qualificationLimits:svcLimits,changeImpact:'Selector changes request a different backend set. Verify EndpointSlices and readiness before assuming the old backend has stopped receiving traffic.'});
const portEvidence=[v('6780-6820','Service port validation requires numeric port, supported protocol, valid targetPort and optional qualified appProtocol; names are required for multiple ports and must be unique.'),d('131-140','Each port gets TCP when empty and targetPort is copied from port when integer zero or string empty.'),v('6694-6712','Duplicate nonzero node-port/protocol and service-port/protocol pairs are rejected.')];
for(const p of ['$.spec.ports','$.spec.ports[]'])define('Service',p,'Describe service ports and their backend port mapping.',p.endsWith('[]')?'No port is contributed by absence of an item.':'The empty list fails unless headless or ExternalName.',p.endsWith('[]')?'{} or retained null becomes a zero ServicePort; defaulting TCP/targetPort does not repair missing port.':'[] is permitted only for headless or ExternalName; other types require at least one port.','Invalid numbers/protocol/names/target ports or duplicate port/protocol pairs reject the request.',portEvidence,{crossFieldConditions:[...svcConditions,'More than one port requires a nonempty unique name on every port.'],qualificationLimits:svcLimits});
for(const [field,omitted,empty,invalid] of [
 ['name','Empty is allowed for a single port but rejected for multiple ports.','Same single/multiple-port rule applies.','Nonempty names must be DNS-1123 labels and unique in the service.'],
 ['port','Scalar zero remains and fails port validation.','Zero is rejected.','Numeric port must be 1 through 65535.'],
 ['protocol','Empty defaults to TCP.','Empty string defaults to TCP.','Only TCP, UDP and SCTP are accepted.'],
 ['targetPort','Fresh IntOrString integer zero defaults to the Service port.','Integer 0 and empty string both default to the Service port.','Nonzero integer must be a valid port; nonempty string must be a valid named port. Incompatible custom-decoder tokens fail.'],
 ['appProtocol','Nil supplies no application protocol identifier.','Present empty string fails qualified-name validation.','A supplied value must be a qualified name.'],
 ['nodePort','Zero requests automatic allocation for NodePort or an allocation-enabled LB; otherwise no automatic node port.','Zero follows automatic-allocation selection; it is not a retained assigned port.','ClusterIP forbids nonzero nodePort; explicit reservations must fit the configured allocator and be free. Duplicate protocol/nodePort pairs fail.']
])define('Service',`$.spec.ports[].${field}`,`Set Service port ${field}.`,omitted,empty,invalid,[...portEvidence,...(field==='nodePort'?[alloc('517-566','NodePort allocation honors explicit requested ports, reuses matching requested ports and automatically allocates selected zero values.'),alloc('973-981','Automatic allocation is selected for NodePort or LB with allocation enabled.')]:[]),...(field==='targetPort'?[source('staging/src/k8s.io/apimachinery/pkg/util/intstr/intstr.go','87-95','IntOrString custom decoder chooses string for quoted tokens and otherwise decodes an int32.')]:[])],{crossFieldConditions:svcConditions,qualificationLimits:svcLimits,changeImpact:'Changing a mapping or allocated port changes stored traffic intent. Observe endpoints and dataplane before assuming the new port is available; check actual allocations after interruption.'});
define('Service','$.spec.healthCheckNodePort','Reserve a node port for a Local load-balancer health check.','Storage allocates zero when type LoadBalancer and externalTrafficPolicy Local require health checks.','Zero requests applicable allocation, otherwise it must stay zero.','Nonzero is forbidden unless LB/Local; an applicable assigned port must be 1 through 65535, available in the allocator, and cannot change while old/new both require it.',[v('6842-6870','Health-check port scope, required value, range and update immutability are checked.'),alloc('571-588','Health check node-port allocator handles explicit or automatically selected port.')],{crossFieldConditions:svcConditions,qualificationLimits:svcLimits,changeImpact:'Changing to or from the LB/Local route changes health-check allocation. Verify actual controller/node health-check reachability before assuming a load balancer routes traffic.'});
define('Service','$.spec.sessionAffinity','Select client-IP affinity intent.','Empty defaults to None.','Empty string defaults to None.','Only None and ClientIP are supported.',[d('107-121','Affinity defaulting removes config for None and constructs missing ClientIP config.'),v('6634-6647','Affinity must be supported and its config must agree.')],{crossFieldConditions:svcConditions,qualificationLimits:svcLimits});
for(const p of ['$.spec.sessionAffinityConfig','$.spec.sessionAffinityConfig.clientIP','$.spec.sessionAffinityConfig.clientIP.timeoutSeconds'])define('Service',p,'Configure the client-IP affinity timeout.','For ClientIP, a missing pointer at any of these three levels reconstructs the config with timeout 10800. For None, defaulting removes the whole config.','{} at either object level receives 10800 for ClientIP. A present numeric zero timeout is not missing and is rejected.','After defaulting, ClientIP requires nonnil config/clientIP/timeout, with timeout greater than zero and at most 86400.',[d('107-121','Missing ClientIP pointers reconstruct the config; None discards it.'),v('3395-3422','Affinity timeout is required and must be >0 and <=MaxClientIPServiceAffinitySeconds.')],{crossFieldConditions:['This default applies only when sessionAffinity is ClientIP. None clears supplied config before validation.'],qualificationLimits:svcLimits,changeImpact:'Changes stored affinity intent. Verify the selected dataplane implementation and actual repeated requests before assuming stickiness or its expiry.'});
// Status is an observed-state write boundary, distinct from create/ordinary update.
for(const k of ['Namespace','PersistentVolumeClaim','Service']){
 const statusEvidence=k==='Namespace'?[v('8202-8214','Namespace status update restricts phase to Active without deletion time or Terminating with deletion time.')]:k==='PersistentVolumeClaim'?[v('2673-2721','PVC status update validates metadata/version, capacity and feature-selected allocation quantities/statuses.')]:[v('6962-6965','Service status update validates metadata and load-balancer status; it does not call generic Condition validation.')];
 const clear=k==='Namespace'?'Create replaces all authored status with phase Active.':'Create clears authored status.';
 const conditions = [clear,'Ordinary update retains the complete old status. A status-subresource update retains old spec and then applies its status validator.','Status absence or an empty status object in a full status update is not a patch instruction; read the resulting object and effective defaults.'];
 define(k,'$.status','Record observed state on the status subresource.',`${clear} A fresh empty status update has no authored observations; resource-specific rules still apply.`,`${clear} On status update {} supplies zero observations before defaults.`,k==='Namespace'?'Phase must agree with whether deletionTimestamp is set.':k==='PersistentVolumeClaim'?'Invalid capacity/allocation quantities or feature-selected allocation statuses reject status update.':'Invalid load-balancer address/mode/hostname combinations reject status update.',statusEvidence,{crossFieldConditions:conditions,changeImpact:'A status write changes the recorded observation; it does not drive a spec transition or prove consumer completion.',qualificationLimits:k==='PersistentVolumeClaim'?pvcLimits:k==='Service'?svcLimits:[]});
 for(const p of ['$.status.conditions','$.status.conditions[]',...['lastTransitionTime','message','reason','status','type',...(k==='Namespace'?[]:k==='Service'?['observedGeneration']:['lastProbeTime'])].map(x=>`$.status.conditions[].${x}`)]){
  const item=p.endsWith('[]');const list=p.endsWith('.conditions');const time=/Time$/.test(p);
  define(k,p,'Record an observed condition from the status writer.',`${clear} At a status update, ${list?'no conditions are supplied':item?'an absent item records no condition':'the child has its declared zero or nil value'}.`,`${clear} ${list?'[] records no conditions':item?'{} supplies a zero condition item':time?'An empty string fails Time RFC3339 parsing':'An empty scalar is retained by this status validator'}.`,time?'Malformed nonempty or empty RFC3339 strings fail Time custom decoding.': 'The shown resource status validator does not call Condition validation and does not independently constrain this condition child; typed token/type errors still fail decoding.',[...statusEvidence,...(time?[source('staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/time.go','99-119','Time null becomes zero; other tokens must decode to a string accepted by RFC3339 parsing.')]:[])],{crossFieldConditions:conditions,changeImpact:'A condition records an observation and can be overwritten by its status writer. Inspect spec, events and actual consumer state before deciding recovery.',qualificationLimits:['Available-source documentation gap: complete condition producers, their reason transitions and event/retry decisions require consumer-specific qualification. The absence of a validator restriction is not permission to forge successful status.']});
 }
}
define('Namespace','$.status.phase','Record namespace lifecycle phase.','Create sets Active; NamespaceStatus defaulting also sets an empty phase to Active.','Empty phase defaults to Active. Status validation then requires Active without deletionTimestamp and Terminating with deletionTimestamp.','Any phase inconsistent with deletionTimestamp is rejected on status update.',[d('341-345','Empty NamespaceStatus phase defaults to Active.'),v('8202-8214','Namespace phase is constrained by deletionTimestamp.')],{crossFieldConditions:['Ordinary update preserves old status; finalize changes finalizers while preserving status.'],changeImpact:'Phase is lifecycle observation. Investigate content/finalizers before force finalization; changing phase cannot delete remaining content.'});
const namespaceConditionSource=(lines,claim)=>source('pkg/controller/namespace/deletion/status_condition_utils.go',lines,claim);
const namespaceStatusConditions=[
 'The namespace deletion controller maintains NamespaceDeletionDiscoveryFailure, NamespaceDeletionGroupVersionParsingFailure, NamespaceDeletionContentFailure, NamespaceContentRemaining and NamespaceFinalizersRemaining. True means the named failure or remaining-content condition is present; False is the successful variant for that condition. False is not a general Namespace-deleted result.',
 'Discovery failures use reason DiscoveryFailed; group-version parsing failures use GroupVersionParsingFailed. Content deletion errors are collected, sorted and reported with ContentDeletionFailed. Remaining-resource and remaining-finalizer messages include sorted counts with reasons SomeResourcesRemain and SomeFinalizersRemain.',
 'For the five owned condition types, an attempt without a newly produced failure uses False and the matching reason ResourcesDiscovered, ParsedGroupVersions, ContentDeleted, ContentRemoved or ContentHasNoFinalizers. The controller updates the first stored condition of each type. It retains other types and does not remove duplicate entries.',
 'A newly inserted condition receives the current transition time. An existing condition receives a new lastTransitionTime only if its Status changes. A Reason or Message change with the same Status preserves the old time. If Status, Reason and Message are unchanged, the updater does not change that condition.',
 'The normal full-resource pass supplies remaining-content totals before updating conditions. The OrderedNamespaceDeletion early return for remaining Pods calls the updater before it supplies those totals. That early return can therefore produce False content/finalizer conditions while Pods still remain. Check the actual Pod list and retry observations; these conditions alone do not prove an empty Namespace.',
 'Changed condition content triggers UpdateStatus. Errors from these condition writes are logged but not added to the deletion error aggregate. A failed condition write alone does not stop a subsequent finalizer-removal step. This differs from the earlier Terminating phase update: an error there returns before content deletion.',
 'These status fields describe controller observations. They do not authorize changing a finalizer or prove external-data cleanup. Read current conditions, content, finalizers and controller errors before correcting a failure; a stale condition can remain after a failed status write.',
];
const namespaceStatusEvidence=[
 source('staging/src/k8s.io/api/core/v1/types.go','7061-7070','The public Namespace condition type strings include NamespaceDeletionGroupVersionParsingFailure, which differs from its Go constant name.'),
 namespaceConditionSource('45-68','The deletion updater owns five condition types and defines their successful messages and reasons.'),
 namespaceConditionSource('70-99','Group-version and discovery errors produce True conditions with distinct reasons and error messages.'),
 namespaceConditionSource('101-140','Remaining-resource and finalizer totals produce True conditions with sorted count messages and distinct reasons.'),
 namespaceConditionSource('142-173','Deletion errors are collected and sorted into a True ContentDeletionFailed condition.'),
 namespaceConditionSource('175-201','The updater appends missing owned types or changes status/reason/message; it changes an existing transition time only when Status changes.'),
 namespaceConditionSource('204-221','The successful variant has False status; getCondition selects the first matching entry.'),
 namespaceDeletionSource('553-562','The remaining-Pod early return updates conditions without first calling ProcessContentTotals and logs status-write errors.'),
 namespaceDeletionSource('591-605','The full resource pass supplies totals, logs condition-write errors and returns only the collected deletion/discovery errors.'),
 namespaceDeletionSource('117-122','An error from the earlier phase update stops Delete before content cleanup.'),
];
const namespaceStatusCases=[
 {name:'Reason changes without status transition',condition:'The first existing owned condition keeps its Status but receives a different Reason or Message.',sourceOutcome:'The updater changes Reason/Message and preserves lastTransitionTime; the controller attempts a status write.'},
 {name:'Failure status clears',condition:'A previously True owned condition has no newly produced failure in this attempt.',sourceOutcome:'The updater selects the False successful variant and changes lastTransitionTime because Status changed.'},
 {name:'Ordered Pod pass returns early',condition:'OrderedNamespaceDeletion is enabled and the Pod pass reports remaining Pods.',sourceOutcome:'The updater runs before content totals are supplied. Content/finalizer conditions can be False despite the remaining Pods; inspect the actual objects rather than infer emptiness.'},
 {name:'Condition publication fails',condition:'A condition UpdateStatus call fails after the resource deletion pass.',sourceOutcome:'The failure is logged and not added to the deletion aggregate. It can leave stale conditions and does not by itself block the later finalizer step.'},
 {name:'Duplicate and other condition types',condition:'Stored status has duplicate entries for an owned type and an unrelated condition type.',sourceOutcome:'The updater changes only the first matching owned entry and preserves the duplicate and unrelated entry; it is not a condition-list cleanup validator.'},
];
for(const [key,def] of definitions){
 if(!key.startsWith('Namespace:$.status'))continue;
 def.crossFieldConditions=[...(def.crossFieldConditions??[]),...namespaceStatusConditions];
 def.evidence.push(...namespaceStatusEvidence);
 def.cases=[...(def.cases??[]),...namespaceStatusCases];
 def.qualificationLimits=(def.qualificationLimits??[]).filter(x=>!x.includes('complete condition producers'));
}
const pvcStatus=[v('2673-2721','PVC status validator checks metadata/version, spec accessModes, capacity, and option-selected allocated resources/status values.'),pu('101-118','Disabled allocation and volume-attributes status fields are dropped unless already used by old state.')];
for(const [p,omitted,empty,invalid] of [
 ['$.status.phase','PVC object defaulting sets empty to Pending, but create strategy then clears status. On read/default and status requests the empty phase can receive Pending.','Empty phase receives Pending during object defaulting; it is not a Bound observation.','The shown PVC status validator imposes no phase enum check.'],
 ['$.status.accessModes','No observed modes are authored.','[] has no observed mode entries.','The shown status validator checks spec.accessModes, not status.accessModes, and adds no status enum restriction.'],
 ['$.status.accessModes[]','No mode is contributed by an absent item.','Empty string item is retained by this status validator.','The shown status validator adds no status.accessModes element restriction.'],
 ['$.status.capacity','No observed capacity entries are authored.','{} records no observed capacity.','Every supplied capacity Quantity passes validateBasicResource; negative Quantity.Value is rejected.'],
 ['$.status.capacity[<exact-key>]','No observed capacity for the absent key.','Empty Quantity string fails custom decode; numeric zero is accepted by the basic nonnegative check.','Invalid Quantity syntax or negative Quantity.Value is rejected; this loop does not validate capacity key grammar.'],
 ['$.status.allocatedResources','No allocated amounts are authored; feature-disabled unused map is dropped.','{} records no allocated amounts.','When recovery validation is enabled, resource keys and nonnegative valid storage quantities are checked.'],
 ['$.status.allocatedResources[<exact-key>]','No allocation for an absent key.','Empty Quantity string fails custom decode; numeric zero passes basic nonnegative storage quantity checks.','Under recovery validation, keys must be qualified; native keys other than storage are rejected, and negative/invalid quantities fail.'],
 ['$.status.allocatedResourceStatuses','No allocation states are authored; disabled unused map is dropped.','{} records no allocation state.','When recovery validation is enabled, keys and supported resize-state strings are checked.'],
 ['$.status.allocatedResourceStatuses[<exact-key>]','No state for an absent key.','Empty string is unsupported when recovery validation runs.','Recovery validation permits ControllerResizeInProgress, ControllerResizeInfeasible, NodeResizePending, NodeResizeInProgress and NodeResizeInfeasible, with qualified keys and only storage as a native key.'],
 ['$.status.currentVolumeAttributesClassName','Nil reports no applied class; disabled unused field is dropped.','A present empty string remains unless feature preparation drops it; no child-specific check appears here.','The shown PVC status validator adds no class-name validation to this observation.'],
 ['$.status.modifyVolumeStatus','Nil reports no volume modification observation; disabled unused field is dropped.','{} records a zero modification object if retained.','The shown PVC status validator adds no modification-object value restriction.'],
 ['$.status.modifyVolumeStatus.status','Empty scalar reports no named modification status.','Empty string is retained by this validator.','The shown status validator adds no modification-status enum check.'],
 ['$.status.modifyVolumeStatus.targetVolumeAttributesClassName','Empty scalar names no target class.','Empty string is retained by this validator.','The shown status validator adds no target class grammar check.']
])define('PersistentVolumeClaim',p,'Record PVC binding, allocation or volume modification observation.',omitted,empty,invalid,[...pvcStatus,...(p==='$.status.phase'?[d('294-298','Empty PVC phase defaults to Pending before create preparation clears status.')]:[])],{crossFieldConditions:['Create clears status and ordinary update retains old status. The status subresource retains spec.','Feature gates and old-object use determine whether allocation or volume-attributes observation survives preparation.'],changeImpact:'A status observation can change independently of authored spec and is not a completed driver action. Check actual PV, controller events and node/driver state before recovery.',qualificationLimits:pvcLimits});
const lbEvidence=[v('8653-8708','LB status allows nonempty ingress only for LoadBalancer; validates IP, conditional mode and hostname, and does not iterate ingress port statuses.')];
for(const [p,omitted,empty,invalid] of [
 ['$.status.loadBalancer','No LB observation is authored.','{} records no ingress observations.','Nonempty ingress is permitted only with spec.type LoadBalancer; address/mode/hostname checks apply.'],
 ['$.status.loadBalancer.ingress','No ingress addresses are authored.','[] records no ingress observations.','Nonempty list requires LoadBalancer; each item receives address/mode/hostname checks.'],
 ['$.status.loadBalancer.ingress[]','No ingress is contributed by absence of an item.','{} is accepted by this validator for LoadBalancer: IP and hostname may both be empty.','Nonempty invalid IP/hostname or an incompatible ipMode fails.'],
 ['$.status.loadBalancer.ingress[].ip','Empty reports no IP.','Empty string is permitted; a nonnil ipMode is then forbidden.','Supplied IP must pass the legacy IP validator; old addresses can receive compatibility treatment.'],
 ['$.status.loadBalancer.ingress[].hostname','Empty reports no hostname.','Empty string is permitted.','Nonempty must be DNS-1123 subdomain and must not parse as an IP address.'],
 ['$.status.loadBalancer.ingress[].ipMode','Nil defaults to VIP when type LoadBalancer and IP is nonempty. With no IP it stays nil.','Present empty string is unsupported; it does not receive the nil-pointer default.','Only VIP and Proxy are accepted when IP is present. A mode without IP is forbidden.'],
 ['$.status.loadBalancer.ingress[].ports','No per-port observation is authored.','[] records no port observations.','This Service LB status validator does not iterate or validate the ports collection.'],
 ['$.status.loadBalancer.ingress[].ports[]','No port observation is contributed by absence.','{} is retained by this validator as a zero port-status object.','This Service status validator adds no port-status item check.'],
 ['$.status.loadBalancer.ingress[].ports[].port','Scalar zero remains as an observation.','Zero is retained by this validator.','No port-number range check is called for this status child; incompatible/overflow integer JSON fails decoding.'],
 ['$.status.loadBalancer.ingress[].ports[].protocol','Empty scalar remains.','Empty string is retained by this validator.','No protocol enum validation is called for this status child.'],
 ['$.status.loadBalancer.ingress[].ports[].error','Nil reports no error string.','Present empty string is retained.','No error grammar check is called for this status child.']
])define('Service',p,'Record load-balancer address or port observations.',omitted,empty,invalid,[...lbEvidence,...(p.endsWith('.ipMode')?[d('153-161','Service defaulting inserts VIP for nil mode on an ingress IP when type is LoadBalancer.')]:[])],{crossFieldConditions:['Create clears all authored status; ordinary update retains the old status. Only a status-subresource write can submit these observations while retaining spec.','A port observation being API-valid is not proof that an external address or port is serving traffic.'],changeImpact:'Observe status as controller-produced information and test the actual external endpoint. An accepted status write does not create or configure a load balancer.',qualificationLimits:svcLimits});

for(const k of kinds){
 const range={ConfigMap:'37-58',Namespace:'60-91',PersistentVolumeClaim:'41-71',Service:'87-113'}[k];
 routes[k].push(source(`pkg/registry/core/${strategyNames[k]}/storage/storage.go`,range,'NewREST creates the actual typed resource store and wires its create/update and available status/finalize strategies.'));
}
routes.Service.push(source('pkg/registry/core/service/storage/storage.go','127-139','The Service store connects allocation begin-create/update hooks and release-after-delete hooks, including status deletion release.'));

for(const k of kinds){
 const root=definitions.get(`${k}:$`);
 root.crossFieldConditions=[...(root.crossFieldConditions??[]),k==='Service'?'The normal Service strategy allows create-on-update when the target is missing; the object must still pass create validation and allocation.':'The normal strategy forbids creating this missing resource through an ordinary update.', 'These normal resource strategies allow unconditional update: absent resourceVersion can be filled from storage rather than establish a compare-and-swap precondition. Supply the observed resourceVersion to protect a conditional update.'];
 const createRange={ConfigMap:'74-76',Namespace:'133-135',PersistentVolumeClaim:'96-98',Service:'104-106'}[k];
 const unconditionalRange={ConfigMap:'96-98',Namespace:'148-150',PersistentVolumeClaim:'133-135',Service:'118-120'}[k];
 root.evidence.push(source(`pkg/registry/core/${strategyNames[k]}/strategy.go`,createRange,'The normal resource strategy selects whether a missing target may be created through update.'),source(`pkg/registry/core/${strategyNames[k]}/strategy.go`,unconditionalRange,'The normal resource strategy permits unconditional update.'));
}

// Additional direct consumers, with narrow source-derived scope.
const pv = (lines,claim)=>source('pkg/controller/volume/persistentvolume/pv_controller.go',lines,claim);
for(const [key,def] of definitions){
 const [kind,path]=[key.slice(0,key.indexOf(':')),key.slice(key.indexOf(':')+1)];
 if(kind==='PersistentVolumeClaim'&&(path==='$.spec'||path.startsWith('$.spec.'))){
  def.crossFieldConditions=[...(def.crossFieldConditions??[]),'The pinned PV controller first searches a matching PV. If none exists, it can assign a default class, wait for delayed binding, start provisioning for a nonempty class, or record FailedBinding and retain Pending. Binding writes PV identity/status before PVC volumeName/annotations and Bound status; it stops on the first write error, so a partial result must be read before retry.'];
  def.evidence.push(pv('1576-1604','Provisioning is skipped when disabled; plugin lookup failures record ProvisioningFailed and retry on later unbound sync; the UID-named operation dispatches internal or external provisioning.'),pv('1841-1858','External provisioning writes the selected provisioner annotation or returns its API error, then emits ExternalProvisioning while waiting for the external provisioner.'),pv('331-389','Unbound claim matching, default-class assignment, delayed binding, provisioning and Pending branches.'),pv('1095-1127','Binding saves volume reference/status, then claim reference/status and stops on the first error.'));
  def.evidence.push(source('staging/src/k8s.io/component-helpers/storage/volume/pv_helpers.go','206-242','Matching converts a present selector and checks capacity, volume mode and enabled volume-attributes class.'),source('staging/src/k8s.io/component-helpers/storage/volume/pv_helpers.go','287-323','Unbound candidates must be Available, satisfy labels/class/node affinity, and support the requested access modes.'));
 }
 if(kind==='PersistentVolumeClaim'&&path.startsWith('$.status')){
  def.crossFieldConditions=[...(def.crossFieldConditions??[]),'The pinned binding controller resets accessModes/capacity/current class without a volume; with a volume it copies modes, updates capacity on the phase transition with pre-resize handling, and sets current volume-attributes class only during Pending-to-Bound when enabled. Later resize writers are separate.'];
  def.evidence.push(pv('784-824','Claim status helper sets phase, resets no-volume observations or copies volume modes and checks capacity.'),pv('827-858','Phase-transition capacity and one-time initial volume-attributes observation handling.'));
 }
 if(kind==='PersistentVolumeClaim'&&(path==='$.spec'||path==='$.spec.volumeName'||path==='$.status.phase')){
  def.crossFieldConditions=[...(def.crossFieldConditions??[]),'Kubelet resolves the claim in the Pod namespace and requires Bound phase and a nonempty volumeName. It retrieves that PV and requires a nonnil claimRef with the exact claim UID. Passing these checks creates the PV volume spec; it does not prove attach/mount or successful filesystem access.'];
  def.evidence.push(source('pkg/kubelet/volumemanager/populator/desired_state_of_world_populator.go','523-557','Kubelet claim lookup rejects missing claim, non-Bound state or empty volumeName.'),source('pkg/kubelet/volumemanager/populator/desired_state_of_world_populator.go','562-588','PV lookup requires claimRef and exact claim UID before constructing a persistent-volume spec.'));
 }
 if(kind==='ConfigMap'&&(path.startsWith('$.data')||path.startsWith('$.binaryData'))){
  def.crossFieldConditions=[...(def.crossFieldConditions??[]),'The ConfigMap volume plugin fetches the named object in the Pod namespace. Only optional NotFound becomes an empty object; other fetch failures fail setup. Payload is published by AtomicWriter; failure invokes deferred volume cleanup and success marks setup complete.'];
  def.evidence.push(source('pkg/volume/configmap/configmap.go','189-215','Namespace-local ConfigMap fetch, optional NotFound handling and payload failure propagation.'),source('pkg/volume/configmap/configmap.go','225-259','Deferred failed-setup cleanup and atomic-writer payload/permission application.'));
 }
 if(kind==='Namespace'&&(path==='$.spec'||path.startsWith('$.spec.finalizers')||path==='$.status'||path==='$.status.phase')){
  def.crossFieldConditions=[...(def.crossFieldConditions??[]),'Namespace deletion reads fresh state, requires a deletion timestamp and updates Terminating. With a nonempty spec.finalizers list it attempts discovered deletable content. A deletion/discovery error or positive estimate stops its finalizer step. Otherwise it removes only its configured token through Finalize. Unsupported listing can bypass content verification; this path does not prove every collection is empty. Conflict retries reload the namespace and stop if UID changes; this loop has no numeric retry cap in this function.'];
  def.evidence.push(source('pkg/controller/namespace/deletion/namespaced_resources_deleter.go','102-145','Deletion requires current deletion state and calls finalization only after no error or positive estimate remains.'),source('pkg/controller/namespace/deletion/namespaced_resources_deleter.go','247-301','Conflict retry reloads and protects UID; lifecycle update sets Terminating and finalize removes only its token.'),source('pkg/controller/namespace/deletion/namespaced_resources_deleter.go','429-480','Deletion tries collection then item fallback, lists remaining content and estimates finalizer/grace waits.'));
  def.qualificationLimits=(def.qualificationLimits??[]).filter(x=>!x.includes('complete discovery/delete/list sequence'));
  def.qualificationLimits.push('The namespace deleter source establishes API cleanup sequencing, not successful cleanup in a target namespace or removal of external data. Discovery/authorization/backend errors and other finalizers can retain Terminating; inspect content and conditions rather than remove a finalizer to hide the error.');
 }
 if(path==='$.metadata.resourceVersion'){
  def.evidence.push(source('staging/src/k8s.io/apiserver/pkg/registry/generic/registry/store.go','662-667','Empty version selects unconditional update only when the strategy permits it.'),source('staging/src/k8s.io/apiserver/pkg/registry/generic/registry/store.go','717-739','Unconditional update fills current storage version; conditional update requires a version and rejects stale values with Conflict.'));
 }
 if(['$.metadata.uid','$.metadata.creationTimestamp','$.metadata.generateName'].includes(path)){
  def.evidence.push(source('staging/src/k8s.io/apiserver/pkg/registry/generic/registry/store.go','477-488','Create fills system metadata then generates name only when generateName is supplied and name absent.'),source('staging/src/k8s.io/apiserver/pkg/registry/rest/meta.go','38-42','System initialization sets current creation time and a fresh UUID.'));
 }
 if(kind==='PersistentVolumeClaim'&&path.startsWith('$.spec.accessModes'))def.evidence.push(v('1936-1940','Supported access-mode set contains ReadWriteOnce, ReadOnlyMany, ReadWriteMany and ReadWriteOncePod.'));
 if(kind==='Service'&&path.startsWith('$.spec.sessionAffinityConfig'))def.evidence.push(source('pkg/apis/core/types.go','4845-4850','Default affinity timeout is 10800 seconds and maximum affinity timeout is 86400 seconds.'));
 if(kind==='ConfigMap'&&(path.startsWith('$.data')||path.startsWith('$.binaryData')))def.evidence.push(source('staging/src/k8s.io/api/core/v1/types.go','7908','MaxSecretSize is 1*1024*1024 bytes for the aggregate ConfigMap validation check.'));
 if(path==='$.metadata.creationTimestamp')def.emptyValue='An empty RFC3339 string fails the Time decoder. JSON null produces zero time at typed decode, then create assigns current server time.';
 if(path==='$.metadata.deletionTimestamp')def.emptyValue='An empty RFC3339 string fails Time decoding. Null leaves the optional pointer nil; it does not request deletion.';
 if(path==='$.metadata.managedFields[].fieldsV1'){
  def.invalidValue='FieldsV1.UnmarshalJSON preserves any non-null raw JSON token; it does not validate the ownership trie here. Later field management must interpret that value; malformed field-set structure is a separate receiving boundary.';
  def.evidence.push(source('staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/helpers.go','295-304','FieldsV1 custom decoder copies any non-null JSON bytes without field-set validation.'));
 }
 if(['$.metadata.resourceVersion','$.metadata.uid','$.metadata.creationTimestamp','$.metadata.generateName'].includes(path))def.qualificationLimits=(def.qualificationLimits??[]).filter(x=>!x.includes('generic store lifecycle initialization'));
}

// Go declaration table transcribed from the pinned primary types; no schema prose is receiver evidence.
const declarations = {
 "ConfigMap": {
  "$": [
   "ConfigMap",
   "staging/src/k8s.io/api/core/v1/types.go",
   8016
  ],
  "$.kind": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   49
  ],
  "$.apiVersion": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   56
  ],
  "$.metadata": [
   "metav1.ObjectMeta",
   "staging/src/k8s.io/api/core/v1/types.go",
   8021
  ],
  "$.metadata.name": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   119
  ],
  "$.metadata.generateName": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   134
  ],
  "$.metadata.namespace": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   145
  ],
  "$.metadata.selfLink": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   149
  ],
  "$.metadata.uid": [
   "types.UID",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   159
  ],
  "$.metadata.resourceVersion": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   172
  ],
  "$.metadata.generation": [
   "int64",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   177
  ],
  "$.metadata.creationTimestamp": [
   "Time",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   188
  ],
  "$.metadata.deletionTimestamp": [
   "*Time",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   209
  ],
  "$.metadata.deletionGracePeriodSeconds": [
   "*int64",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   216
  ],
  "$.metadata.labels": [
   "map[string]string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   223
  ],
  "$.metadata.labels[<exact-key>]": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   223
  ],
  "$.metadata.annotations": [
   "map[string]string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   230
  ],
  "$.metadata.annotations[<exact-key>]": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   230
  ],
  "$.metadata.ownerReferences": [
   "[]OwnerReference",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   241
  ],
  "$.metadata.ownerReferences[]": [
   "OwnerReference",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   241
  ],
  "$.metadata.ownerReferences[].apiVersion": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   297
  ],
  "$.metadata.ownerReferences[].kind": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   300
  ],
  "$.metadata.ownerReferences[].name": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   303
  ],
  "$.metadata.ownerReferences[].uid": [
   "types.UID",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   306
  ],
  "$.metadata.ownerReferences[].controller": [
   "*bool",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   309
  ],
  "$.metadata.ownerReferences[].blockOwnerDeletion": [
   "*bool",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   319
  ],
  "$.metadata.finalizers": [
   "[]string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   259
  ],
  "$.metadata.finalizers[]": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   259
  ],
  "$.metadata.managedFields": [
   "[]ManagedFieldsEntry",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   275
  ],
  "$.metadata.managedFields[]": [
   "ManagedFieldsEntry",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   275
  ],
  "$.metadata.managedFields[].manager": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1342
  ],
  "$.metadata.managedFields[].operation": [
   "ManagedFieldsOperationType",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1345
  ],
  "$.metadata.managedFields[].apiVersion": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1350
  ],
  "$.metadata.managedFields[].time": [
   "*Time",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1357
  ],
  "$.metadata.managedFields[].fieldsType": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1364
  ],
  "$.metadata.managedFields[].fieldsV1": [
   "*FieldsV1",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1367
  ],
  "$.metadata.managedFields[].subresource": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1376
  ],
  "$.immutable": [
   "*bool",
   "staging/src/k8s.io/api/core/v1/types.go",
   8028
  ],
  "$.data": [
   "map[string]string",
   "staging/src/k8s.io/api/core/v1/types.go",
   8036
  ],
  "$.data[<exact-key>]": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   8036
  ],
  "$.binaryData": [
   "map[string][]byte",
   "staging/src/k8s.io/api/core/v1/types.go",
   8046
  ],
  "$.binaryData[<exact-key>]": [
   "[]byte",
   "staging/src/k8s.io/api/core/v1/types.go",
   8046
  ]
 },
 "Namespace": {
  "$": [
   "Namespace",
   "staging/src/k8s.io/api/core/v1/types.go",
   7098
  ],
  "$.kind": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   49
  ],
  "$.apiVersion": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   56
  ],
  "$.metadata": [
   "metav1.ObjectMeta",
   "staging/src/k8s.io/api/core/v1/types.go",
   7103
  ],
  "$.metadata.name": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   119
  ],
  "$.metadata.generateName": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   134
  ],
  "$.metadata.namespace": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   145
  ],
  "$.metadata.selfLink": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   149
  ],
  "$.metadata.uid": [
   "types.UID",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   159
  ],
  "$.metadata.resourceVersion": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   172
  ],
  "$.metadata.generation": [
   "int64",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   177
  ],
  "$.metadata.creationTimestamp": [
   "Time",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   188
  ],
  "$.metadata.deletionTimestamp": [
   "*Time",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   209
  ],
  "$.metadata.deletionGracePeriodSeconds": [
   "*int64",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   216
  ],
  "$.metadata.labels": [
   "map[string]string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   223
  ],
  "$.metadata.labels[<exact-key>]": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   223
  ],
  "$.metadata.annotations": [
   "map[string]string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   230
  ],
  "$.metadata.annotations[<exact-key>]": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   230
  ],
  "$.metadata.ownerReferences": [
   "[]OwnerReference",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   241
  ],
  "$.metadata.ownerReferences[]": [
   "OwnerReference",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   241
  ],
  "$.metadata.ownerReferences[].apiVersion": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   297
  ],
  "$.metadata.ownerReferences[].kind": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   300
  ],
  "$.metadata.ownerReferences[].name": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   303
  ],
  "$.metadata.ownerReferences[].uid": [
   "types.UID",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   306
  ],
  "$.metadata.ownerReferences[].controller": [
   "*bool",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   309
  ],
  "$.metadata.ownerReferences[].blockOwnerDeletion": [
   "*bool",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   319
  ],
  "$.metadata.finalizers": [
   "[]string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   259
  ],
  "$.metadata.finalizers[]": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   259
  ],
  "$.metadata.managedFields": [
   "[]ManagedFieldsEntry",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   275
  ],
  "$.metadata.managedFields[]": [
   "ManagedFieldsEntry",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   275
  ],
  "$.metadata.managedFields[].manager": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1342
  ],
  "$.metadata.managedFields[].operation": [
   "ManagedFieldsOperationType",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1345
  ],
  "$.metadata.managedFields[].apiVersion": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1350
  ],
  "$.metadata.managedFields[].time": [
   "*Time",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1357
  ],
  "$.metadata.managedFields[].fieldsType": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1364
  ],
  "$.metadata.managedFields[].fieldsV1": [
   "*FieldsV1",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1367
  ],
  "$.metadata.managedFields[].subresource": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1376
  ],
  "$.spec": [
   "NamespaceSpec",
   "staging/src/k8s.io/api/core/v1/types.go",
   7108
  ],
  "$.spec.finalizers": [
   "[]FinalizerName",
   "staging/src/k8s.io/api/core/v1/types.go",
   7021
  ],
  "$.spec.finalizers[]": [
   "FinalizerName",
   "staging/src/k8s.io/api/core/v1/types.go",
   7021
  ],
  "$.status": [
   "NamespaceStatus",
   "staging/src/k8s.io/api/core/v1/types.go",
   7113
  ],
  "$.status.phase": [
   "NamespacePhase",
   "staging/src/k8s.io/api/core/v1/types.go",
   7029
  ],
  "$.status.conditions": [
   "[]NamespaceCondition",
   "staging/src/k8s.io/api/core/v1/types.go",
   7037
  ],
  "$.status.conditions[]": [
   "NamespaceCondition",
   "staging/src/k8s.io/api/core/v1/types.go",
   7037
  ],
  "$.status.conditions[].type": [
   "NamespaceConditionType",
   "staging/src/k8s.io/api/core/v1/types.go",
   7076
  ],
  "$.status.conditions[].status": [
   "ConditionStatus",
   "staging/src/k8s.io/api/core/v1/types.go",
   7078
  ],
  "$.status.conditions[].lastTransitionTime": [
   "metav1.Time",
   "staging/src/k8s.io/api/core/v1/types.go",
   7081
  ],
  "$.status.conditions[].reason": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   7084
  ],
  "$.status.conditions[].message": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   7087
  ]
 },
 "PersistentVolumeClaim": {
  "$": [
   "PersistentVolumeClaim",
   "staging/src/k8s.io/api/core/v1/types.go",
   516
  ],
  "$.kind": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   49
  ],
  "$.apiVersion": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   56
  ],
  "$.metadata": [
   "metav1.ObjectMeta",
   "staging/src/k8s.io/api/core/v1/types.go",
   521
  ],
  "$.metadata.name": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   119
  ],
  "$.metadata.generateName": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   134
  ],
  "$.metadata.namespace": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   145
  ],
  "$.metadata.selfLink": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   149
  ],
  "$.metadata.uid": [
   "types.UID",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   159
  ],
  "$.metadata.resourceVersion": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   172
  ],
  "$.metadata.generation": [
   "int64",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   177
  ],
  "$.metadata.creationTimestamp": [
   "Time",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   188
  ],
  "$.metadata.deletionTimestamp": [
   "*Time",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   209
  ],
  "$.metadata.deletionGracePeriodSeconds": [
   "*int64",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   216
  ],
  "$.metadata.labels": [
   "map[string]string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   223
  ],
  "$.metadata.labels[<exact-key>]": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   223
  ],
  "$.metadata.annotations": [
   "map[string]string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   230
  ],
  "$.metadata.annotations[<exact-key>]": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   230
  ],
  "$.metadata.ownerReferences": [
   "[]OwnerReference",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   241
  ],
  "$.metadata.ownerReferences[]": [
   "OwnerReference",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   241
  ],
  "$.metadata.ownerReferences[].apiVersion": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   297
  ],
  "$.metadata.ownerReferences[].kind": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   300
  ],
  "$.metadata.ownerReferences[].name": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   303
  ],
  "$.metadata.ownerReferences[].uid": [
   "types.UID",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   306
  ],
  "$.metadata.ownerReferences[].controller": [
   "*bool",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   309
  ],
  "$.metadata.ownerReferences[].blockOwnerDeletion": [
   "*bool",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   319
  ],
  "$.metadata.finalizers": [
   "[]string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   259
  ],
  "$.metadata.finalizers[]": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   259
  ],
  "$.metadata.managedFields": [
   "[]ManagedFieldsEntry",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   275
  ],
  "$.metadata.managedFields[]": [
   "ManagedFieldsEntry",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   275
  ],
  "$.metadata.managedFields[].manager": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1342
  ],
  "$.metadata.managedFields[].operation": [
   "ManagedFieldsOperationType",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1345
  ],
  "$.metadata.managedFields[].apiVersion": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1350
  ],
  "$.metadata.managedFields[].time": [
   "*Time",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1357
  ],
  "$.metadata.managedFields[].fieldsType": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1364
  ],
  "$.metadata.managedFields[].fieldsV1": [
   "*FieldsV1",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1367
  ],
  "$.metadata.managedFields[].subresource": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1376
  ],
  "$.spec": [
   "PersistentVolumeClaimSpec",
   "staging/src/k8s.io/api/core/v1/types.go",
   526
  ],
  "$.spec.accessModes": [
   "[]PersistentVolumeAccessMode",
   "staging/src/k8s.io/api/core/v1/types.go",
   557
  ],
  "$.spec.accessModes[]": [
   "PersistentVolumeAccessMode",
   "staging/src/k8s.io/api/core/v1/types.go",
   557
  ],
  "$.spec.selector": [
   "*metav1.LabelSelector",
   "staging/src/k8s.io/api/core/v1/types.go",
   560
  ],
  "$.spec.selector.matchLabels": [
   "map[string]string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1277
  ],
  "$.spec.selector.matchLabels[<exact-key>]": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1277
  ],
  "$.spec.selector.matchExpressions": [
   "[]LabelSelectorRequirement",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1281
  ],
  "$.spec.selector.matchExpressions[]": [
   "LabelSelectorRequirement",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1281
  ],
  "$.spec.selector.matchExpressions[].key": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1288
  ],
  "$.spec.selector.matchExpressions[].operator": [
   "LabelSelectorOperator",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1291
  ],
  "$.spec.selector.matchExpressions[].values": [
   "[]string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1298
  ],
  "$.spec.selector.matchExpressions[].values[]": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1298
  ],
  "$.spec.resources": [
   "VolumeResourceRequirements",
   "staging/src/k8s.io/api/core/v1/types.go",
   567
  ],
  "$.spec.resources.limits": [
   "ResourceList",
   "staging/src/k8s.io/api/core/v1/types.go",
   2864
  ],
  "$.spec.resources.limits[<exact-key>]": [
   "resource.Quantity",
   "staging/src/k8s.io/api/core/v1/types.go",
   2864
  ],
  "$.spec.resources.requests": [
   "ResourceList",
   "staging/src/k8s.io/api/core/v1/types.go",
   2870
  ],
  "$.spec.resources.requests[<exact-key>]": [
   "resource.Quantity",
   "staging/src/k8s.io/api/core/v1/types.go",
   2870
  ],
  "$.spec.volumeName": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   570
  ],
  "$.spec.storageClassName": [
   "*string",
   "staging/src/k8s.io/api/core/v1/types.go",
   574
  ],
  "$.spec.volumeMode": [
   "*PersistentVolumeMode",
   "staging/src/k8s.io/api/core/v1/types.go",
   578
  ],
  "$.spec.dataSource": [
   "*TypedLocalObjectReference",
   "staging/src/k8s.io/api/core/v1/types.go",
   588
  ],
  "$.spec.dataSource.apiGroup": [
   "*string",
   "staging/src/k8s.io/api/core/v1/types.go",
   7471
  ],
  "$.spec.dataSource.kind": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   7473
  ],
  "$.spec.dataSource.name": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   7475
  ],
  "$.spec.dataSourceRef": [
   "*TypedObjectReference",
   "staging/src/k8s.io/api/core/v1/types.go",
   613
  ],
  "$.spec.dataSourceRef.apiGroup": [
   "*string",
   "staging/src/k8s.io/api/core/v1/types.go",
   635
  ],
  "$.spec.dataSourceRef.kind": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   637
  ],
  "$.spec.dataSourceRef.name": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   639
  ],
  "$.spec.dataSourceRef.namespace": [
   "*string",
   "staging/src/k8s.io/api/core/v1/types.go",
   645
  ],
  "$.spec.volumeAttributesClassName": [
   "*string",
   "staging/src/k8s.io/api/core/v1/types.go",
   626
  ],
  "$.status": [
   "PersistentVolumeClaimStatus",
   "staging/src/k8s.io/api/core/v1/types.go",
   532
  ],
  "$.status.phase": [
   "PersistentVolumeClaimPhase",
   "staging/src/k8s.io/api/core/v1/types.go",
   763
  ],
  "$.status.accessModes": [
   "[]PersistentVolumeAccessMode",
   "staging/src/k8s.io/api/core/v1/types.go",
   768
  ],
  "$.status.accessModes[]": [
   "PersistentVolumeAccessMode",
   "staging/src/k8s.io/api/core/v1/types.go",
   768
  ],
  "$.status.capacity": [
   "ResourceList",
   "staging/src/k8s.io/api/core/v1/types.go",
   771
  ],
  "$.status.capacity[<exact-key>]": [
   "resource.Quantity",
   "staging/src/k8s.io/api/core/v1/types.go",
   771
  ],
  "$.status.conditions": [
   "[]PersistentVolumeClaimCondition",
   "staging/src/k8s.io/api/core/v1/types.go",
   779
  ],
  "$.status.conditions[]": [
   "PersistentVolumeClaimCondition",
   "staging/src/k8s.io/api/core/v1/types.go",
   779
  ],
  "$.status.conditions[].type": [
   "PersistentVolumeClaimConditionType",
   "staging/src/k8s.io/api/core/v1/types.go",
   738
  ],
  "$.status.conditions[].status": [
   "ConditionStatus",
   "staging/src/k8s.io/api/core/v1/types.go",
   742
  ],
  "$.status.conditions[].lastProbeTime": [
   "metav1.Time",
   "staging/src/k8s.io/api/core/v1/types.go",
   745
  ],
  "$.status.conditions[].lastTransitionTime": [
   "metav1.Time",
   "staging/src/k8s.io/api/core/v1/types.go",
   748
  ],
  "$.status.conditions[].reason": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   753
  ],
  "$.status.conditions[].message": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   756
  ],
  "$.status.allocatedResources": [
   "ResourceList",
   "staging/src/k8s.io/api/core/v1/types.go",
   801
  ],
  "$.status.allocatedResources[<exact-key>]": [
   "resource.Quantity",
   "staging/src/k8s.io/api/core/v1/types.go",
   801
  ],
  "$.status.allocatedResourceStatuses": [
   "map[ResourceName]ClaimResourceStatus",
   "staging/src/k8s.io/api/core/v1/types.go",
   841
  ],
  "$.status.allocatedResourceStatuses[<exact-key>]": [
   "ClaimResourceStatus",
   "staging/src/k8s.io/api/core/v1/types.go",
   841
  ],
  "$.status.currentVolumeAttributesClassName": [
   "*string",
   "staging/src/k8s.io/api/core/v1/types.go",
   846
  ],
  "$.status.modifyVolumeStatus": [
   "*ModifyVolumeStatus",
   "staging/src/k8s.io/api/core/v1/types.go",
   851
  ],
  "$.status.modifyVolumeStatus.targetVolumeAttributesClassName": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   720
  ],
  "$.status.modifyVolumeStatus.status": [
   "PersistentVolumeClaimModifyVolumeStatus",
   "staging/src/k8s.io/api/core/v1/types.go",
   731
  ]
 },
 "Service": {
  "$": [
   "Service",
   "staging/src/k8s.io/api/core/v1/types.go",
   6234
  ],
  "$.kind": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   49
  ],
  "$.apiVersion": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   56
  ],
  "$.metadata": [
   "metav1.ObjectMeta",
   "staging/src/k8s.io/api/core/v1/types.go",
   6239
  ],
  "$.metadata.name": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   119
  ],
  "$.metadata.generateName": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   134
  ],
  "$.metadata.namespace": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   145
  ],
  "$.metadata.selfLink": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   149
  ],
  "$.metadata.uid": [
   "types.UID",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   159
  ],
  "$.metadata.resourceVersion": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   172
  ],
  "$.metadata.generation": [
   "int64",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   177
  ],
  "$.metadata.creationTimestamp": [
   "Time",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   188
  ],
  "$.metadata.deletionTimestamp": [
   "*Time",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   209
  ],
  "$.metadata.deletionGracePeriodSeconds": [
   "*int64",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   216
  ],
  "$.metadata.labels": [
   "map[string]string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   223
  ],
  "$.metadata.labels[<exact-key>]": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   223
  ],
  "$.metadata.annotations": [
   "map[string]string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   230
  ],
  "$.metadata.annotations[<exact-key>]": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   230
  ],
  "$.metadata.ownerReferences": [
   "[]OwnerReference",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   241
  ],
  "$.metadata.ownerReferences[]": [
   "OwnerReference",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   241
  ],
  "$.metadata.ownerReferences[].apiVersion": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   297
  ],
  "$.metadata.ownerReferences[].kind": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   300
  ],
  "$.metadata.ownerReferences[].name": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   303
  ],
  "$.metadata.ownerReferences[].uid": [
   "types.UID",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   306
  ],
  "$.metadata.ownerReferences[].controller": [
   "*bool",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   309
  ],
  "$.metadata.ownerReferences[].blockOwnerDeletion": [
   "*bool",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   319
  ],
  "$.metadata.finalizers": [
   "[]string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   259
  ],
  "$.metadata.finalizers[]": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   259
  ],
  "$.metadata.managedFields": [
   "[]ManagedFieldsEntry",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   275
  ],
  "$.metadata.managedFields[]": [
   "ManagedFieldsEntry",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   275
  ],
  "$.metadata.managedFields[].manager": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1342
  ],
  "$.metadata.managedFields[].operation": [
   "ManagedFieldsOperationType",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1345
  ],
  "$.metadata.managedFields[].apiVersion": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1350
  ],
  "$.metadata.managedFields[].time": [
   "*Time",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1357
  ],
  "$.metadata.managedFields[].fieldsType": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1364
  ],
  "$.metadata.managedFields[].fieldsV1": [
   "*FieldsV1",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1367
  ],
  "$.metadata.managedFields[].subresource": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1376
  ],
  "$.spec": [
   "ServiceSpec",
   "staging/src/k8s.io/api/core/v1/types.go",
   6244
  ],
  "$.spec.ports": [
   "[]ServicePort",
   "staging/src/k8s.io/api/core/v1/types.go",
   5924
  ],
  "$.spec.ports[]": [
   "ServicePort",
   "staging/src/k8s.io/api/core/v1/types.go",
   5924
  ],
  "$.spec.ports[].name": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   6173
  ],
  "$.spec.ports[].protocol": [
   "Protocol",
   "staging/src/k8s.io/api/core/v1/types.go",
   6179
  ],
  "$.spec.ports[].appProtocol": [
   "*string",
   "staging/src/k8s.io/api/core/v1/types.go",
   6197
  ],
  "$.spec.ports[].port": [
   "int32",
   "staging/src/k8s.io/api/core/v1/types.go",
   6200
  ],
  "$.spec.ports[].targetPort": [
   "intstr.IntOrString",
   "staging/src/k8s.io/api/core/v1/types.go",
   6211
  ],
  "$.spec.ports[].nodePort": [
   "int32",
   "staging/src/k8s.io/api/core/v1/types.go",
   6223
  ],
  "$.spec.selector": [
   "map[string]string",
   "staging/src/k8s.io/api/core/v1/types.go",
   5934
  ],
  "$.spec.selector[<exact-key>]": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   5934
  ],
  "$.spec.clusterIP": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   5952
  ],
  "$.spec.clusterIPs": [
   "[]string",
   "staging/src/k8s.io/api/core/v1/types.go",
   5979
  ],
  "$.spec.clusterIPs[]": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   5979
  ],
  "$.spec.type": [
   "ServiceType",
   "staging/src/k8s.io/api/core/v1/types.go",
   5998
  ],
  "$.spec.externalIPs": [
   "[]string",
   "staging/src/k8s.io/api/core/v1/types.go",
   6007
  ],
  "$.spec.externalIPs[]": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   6007
  ],
  "$.spec.sessionAffinity": [
   "ServiceAffinity",
   "staging/src/k8s.io/api/core/v1/types.go",
   6015
  ],
  "$.spec.loadBalancerIP": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   6025
  ],
  "$.spec.loadBalancerSourceRanges": [
   "[]string",
   "staging/src/k8s.io/api/core/v1/types.go",
   6033
  ],
  "$.spec.loadBalancerSourceRanges[]": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   6033
  ],
  "$.spec.externalName": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   6040
  ],
  "$.spec.externalTrafficPolicy": [
   "ServiceExternalTrafficPolicy",
   "staging/src/k8s.io/api/core/v1/types.go",
   6056
  ],
  "$.spec.healthCheckNodePort": [
   "int32",
   "staging/src/k8s.io/api/core/v1/types.go",
   6069
  ],
  "$.spec.publishNotReadyAddresses": [
   "bool",
   "staging/src/k8s.io/api/core/v1/types.go",
   6080
  ],
  "$.spec.sessionAffinityConfig": [
   "*SessionAffinityConfig",
   "staging/src/k8s.io/api/core/v1/types.go",
   6084
  ],
  "$.spec.sessionAffinityConfig.clientIP": [
   "*ClientIPConfig",
   "staging/src/k8s.io/api/core/v1/types.go",
   5699
  ],
  "$.spec.sessionAffinityConfig.clientIP.timeoutSeconds": [
   "*int32",
   "staging/src/k8s.io/api/core/v1/types.go",
   5708
  ],
  "$.spec.ipFamilies": [
   "[]IPFamily",
   "staging/src/k8s.io/api/core/v1/types.go",
   6110
  ],
  "$.spec.ipFamilies[]": [
   "IPFamily",
   "staging/src/k8s.io/api/core/v1/types.go",
   6110
  ],
  "$.spec.ipFamilyPolicy": [
   "*IPFamilyPolicy",
   "staging/src/k8s.io/api/core/v1/types.go",
   6121
  ],
  "$.spec.allocateLoadBalancerNodePorts": [
   "*bool",
   "staging/src/k8s.io/api/core/v1/types.go",
   6131
  ],
  "$.spec.loadBalancerClass": [
   "*string",
   "staging/src/k8s.io/api/core/v1/types.go",
   6144
  ],
  "$.spec.internalTrafficPolicy": [
   "*ServiceInternalTrafficPolicy",
   "staging/src/k8s.io/api/core/v1/types.go",
   6153
  ],
  "$.spec.trafficDistribution": [
   "*string",
   "staging/src/k8s.io/api/core/v1/types.go",
   6162
  ],
  "$.status": [
   "ServiceStatus",
   "staging/src/k8s.io/api/core/v1/types.go",
   6251
  ],
  "$.status.loadBalancer": [
   "LoadBalancerStatus",
   "staging/src/k8s.io/api/core/v1/types.go",
   5823
  ],
  "$.status.loadBalancer.ingress": [
   "[]LoadBalancerIngress",
   "staging/src/k8s.io/api/core/v1/types.go",
   5839
  ],
  "$.status.loadBalancer.ingress[]": [
   "LoadBalancerIngress",
   "staging/src/k8s.io/api/core/v1/types.go",
   5839
  ],
  "$.status.loadBalancer.ingress[].ip": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   5848
  ],
  "$.status.loadBalancer.ingress[].hostname": [
   "string",
   "staging/src/k8s.io/api/core/v1/types.go",
   5853
  ],
  "$.status.loadBalancer.ingress[].ipMode": [
   "*LoadBalancerIPMode",
   "staging/src/k8s.io/api/core/v1/types.go",
   5862
  ],
  "$.status.loadBalancer.ingress[].ports": [
   "[]PortStatus",
   "staging/src/k8s.io/api/core/v1/types.go",
   5868
  ],
  "$.status.loadBalancer.ingress[].ports[]": [
   "PortStatus",
   "staging/src/k8s.io/api/core/v1/types.go",
   5868
  ],
  "$.status.loadBalancer.ingress[].ports[].port": [
   "int32",
   "staging/src/k8s.io/api/core/v1/types.go",
   8405
  ],
  "$.status.loadBalancer.ingress[].ports[].protocol": [
   "Protocol",
   "staging/src/k8s.io/api/core/v1/types.go",
   8408
  ],
  "$.status.loadBalancer.ingress[].ports[].error": [
   "*string",
   "staging/src/k8s.io/api/core/v1/types.go",
   8421
  ],
  "$.status.conditions": [
   "[]metav1.Condition",
   "staging/src/k8s.io/api/core/v1/types.go",
   5830
  ],
  "$.status.conditions[]": [
   "metav1.Condition",
   "staging/src/k8s.io/api/core/v1/types.go",
   5830
  ],
  "$.status.conditions[].type": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1599
  ],
  "$.status.conditions[].status": [
   "ConditionStatus",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1604
  ],
  "$.status.conditions[].observedGeneration": [
   "int64",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1610
  ],
  "$.status.conditions[].lastTransitionTime": [
   "Time",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1617
  ],
  "$.status.conditions[].reason": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1628
  ],
  "$.status.conditions[].message": [
   "string",
   "staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",
   1634
  ]
 }
};
function normalize(path){return path.replaceAll('["*"]','[<exact-key>]');}
function freshNull(type,def,path){
 if(type.startsWith('*'))return `JSON null leaves the optional ${type} pointer nil on a fresh typed object. ${def.omitted}`;
 if(type==='resource.Quantity')return `The Quantity custom decoder accepts JSON null and produces zero Quantity. The retained exact-key entry remains present. ${def.emptyValue}`;
 if(type==='intstr.IntOrString')return `The custom IntOrString decoder takes the integer branch for JSON null; fresh IntVal stays zero. Service defaulting then copies the service port into targetPort.`;
 if(type==='metav1.Time'||type==='Time')return `The Time custom decoder accepts null and resets its value to zero time. An empty string is different: RFC3339 parsing rejects it. ${def.omitted}`;
 if(type.startsWith('map[')||type.endsWith('ResourceList'))return `JSON null makes this map nil on fresh typed decode. ${def.omitted}`;
 if(type.startsWith('[]'))return `JSON null makes this slice nil on fresh typed decode. ${path.endsWith('[<exact-key>]')?`The enclosing map keeps this exact key with a nil byte-slice value. ${def.emptyValue}`:def.omitted}`;
 if(type==='bool')return `JSON null does not change the fresh non-pointer Boolean; it remains false. ${def.omitted}`;
 if(type==='string'||['Protocol','IPFamily','PersistentVolumeAccessMode','PersistentVolumeClaimPhase','PersistentVolumeClaimConditionType','ResourceStatus','NamespacePhase','NamespaceConditionType','FinalizerName','ConditionStatus','LoadBalancerIPMode','ServiceType','ServiceAffinity','ServiceExternalTrafficPolicy','ServiceInternalTrafficPolicy','IPFamilyPolicy','types.UID','ManagedFieldsOperationType'].includes(type))return `JSON null leaves the fresh scalar string at "". ${path.endsWith('[<exact-key>]')?'The exact map entry is retained with that empty string. ':path.endsWith('[]')?'The retained scalar list item remains an empty string; it is not an empty list or removed item. ':''}${def.emptyValue}`;
 if(['int64','int32'].includes(type))return `JSON null leaves the fresh non-pointer integer at 0. ${def.emptyValue}`;
 return `JSON null leaves this fresh value struct at its zero value, equivalent to an empty object before defaults and preparation. ${def.omitted}`;
}
for(const kind of kinds){
 for(const boundary of apiResourceFieldBoundaries('v1',kind)){
  const fieldPath=normalize(boundary.fieldPath);const key=`${kind}:${fieldPath}`;const def=definitions.get(key);
  if(!def)throw Error(`CORE_RECEIVER_AUTHORING_GAP: ${key}`);
  const declaration=declarations[kind][fieldPath];if(!declaration)throw Error(`CORE_GO_DECLARATION_GAP: ${key}`);
  const [type,file,line]=declaration;const nullValue=def.nullValue??freshNull(type,def,fieldPath);
  const evidence=[...def.evidence,...(def.evidence??[]),source(file,line,`The ${kind} receiving boundary ${fieldPath} declares Go type ${type}; this determines fresh typed scalar/item/map/pointer decoding.`),...decoder,...routes[kind]];
  if(type==='resource.Quantity')evidence.push(source('staging/src/k8s.io/apimachinery/pkg/api/resource/quantity.go','730-751','Quantity custom decoding accepts null as zero and parses quoted/unquoted quantity tokens; an empty string is not valid quantity syntax.'));
  if(['metav1.Time','*metav1.Time','Time','*Time'].includes(type))evidence.push(source('staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/time.go','99-119','An addressable Time value uses custom decoding: null becomes zero time; all strings, including empty, must parse as RFC3339. A nil optional pointer is preserved for null by pointer dispatch.'));
  const changeImpact=def.changeImpact??`A permitted update changes this stored ${kind} field subject to the stated strategy and cross-field checks. ${recovery}`;
  records.set(key,{kind,fieldPath,purpose:def.purpose,receiver:`Kubernetes core/v1 typed decoder, ${kind} defaults/preparation/validation and the explicitly named consumer`,operationScope:scope,omitted:def.omitted,nullValue,emptyValue:def.emptyValue,invalidValue:def.invalidValue,changeImpact,crossFieldConditions:def.crossFieldConditions??[],cases:[{name:'omitted-at-fresh-create',condition:`${fieldPath} is absent within a present immediate parent in a fresh typed ${kind}.`,sourceOutcome:def.omitted},{name:'explicit-null-at-typed-boundary',condition:`${fieldPath} is JSON null within a present parent; this is not a patch deletion token.`,sourceOutcome:nullValue},{name:'explicit-empty-or-zero',condition:'The exact empty or zero value described for this boundary is supplied.',sourceOutcome:def.emptyValue},{name:'invalid-value-or-combination',condition:'The stated invalid token, value or cross-field condition reaches its receiving decoder or validator.',sourceOutcome:def.invalidValue},{name:'change-and-recovery',condition:'An operator updates, restores or retries this field.',sourceOutcome:changeImpact},...(def.cases??[])],evidence:[...new Map(evidence.map(e=>[`${e.url}:${e.claim}`,e])).values()],qualificationLimits:[...limits,...(def.qualificationLimits??[])]});
 }
}
// A complete export is an authoring result, not documentation acceptance.
for (const record of records.values()) {
 if (record.kind === 'ConfigMap' && (record.fieldPath === '$' || record.fieldPath === '$.immutable'
   || record.fieldPath.startsWith('$.data') || record.fieldPath.startsWith('$.binaryData'))) {
  record.readerReferences = [{label:'ConfigMap consumption: cache, directory mounts, subPath and environment variables',
   target:'configuration-change-impact.md#configmap-consumption'}];
 }
 if (record.kind === 'ConfigMap' && ['$.data','$.binaryData'].includes(record.fieldPath)) {
  record.crossFieldConditions.push('A mutable API update does not itself refresh a container. The selected Kubelet manager can use direct GET, a TTL cache or a watch cache. Volume setup and application reads are separate steps; no fixed end-to-end refresh deadline is established.',
   'A Linux subPath mount binds the opened, resolved file. Inference from this mount path: replacing the parent volume symbolic link does not retarget the existing bind mount. Recreate the consumer mount through its workload procedure when new content is required.');
  record.cases.push(
   {name:'cache-refresh-retains-old-object',condition:'The TTL-cache manager has a previous object and its refresh returns an error other than NotFound.',sourceOutcome:'The cache can return the previous object and its stored result. A successful read is not proof that the latest API edit arrived. Inspect the API object and the actual consumer value before relying on it.'},
   {name:'watch-initial-sync-fails',condition:'The watch-cache item does not synchronize within its one-second initial read wait.',sourceOutcome:'The manager returns a synchronization error. This is an initial-read limit, not a deadline for delivering every configuration edit.'},
   {name:'volume-error-after-publication',condition:'The atomic writer has published a changed payload, then visible-link creation, obsolete-link removal or old-directory cleanup fails.',sourceOutcome:'The writer returns an error without restoring the previous published directory. Inspect actual mounted files and Kubelet errors before retrying or claiming a rollback.'});
  record.evidence.push(
   source('pkg/kubelet/kubelet.go','650-669','Kubelet selects the ConfigMap manager from the configured change-detection strategy.'),
   source('pkg/kubelet/util/manager/cache_based_manager.go','176-205','Cache refresh retains its prior stored result on a non-NotFound fetch error; successful non-older results and NotFound update it.'),
   source('pkg/kubelet/util/manager/watch_based_manager.go','310-337','Watch-cache reads wait for initial synchronization and return synchronization, lookup or NotFound errors.'),
   source('pkg/volume/util/atomic_writer.go','213-244','Linux publication renames the new data link; Windows removes the old link before creating its replacement. Publication errors propagate.'),
   source('pkg/volume/util/atomic_writer.go','247-264','Visible-link and old-content cleanup can return errors after the data link has been published.'),
   source('pkg/volume/util/subpath/subpath_linux.go','175-226','Linux subPath resolves symbolic links, opens the selected file and bind-mounts its file descriptor.'));
 }
 if (record.kind === 'ConfigMap' && record.fieldPath === '$.data') {
  record.cases.push({name:'environment-captured-at-container-creation',condition:'A container obtains data through envFrom.configMapRef or env.valueFrom.configMapKeyRef, then the API object changes.',sourceOutcome:'Kubelet constructs the environment for a new container; this path does not rewrite a running container environment. Optional missing objects or keys can be skipped; other fetch errors stop construction. Recreate the container through its workload procedure and inspect application behavior.'});
  record.evidence.push(source('pkg/kubelet/kubelet_pods.go','774-802','ConfigMap envFrom reads Data and skips only optional NotFound objects; other fetch failures stop construction.'),
   source('pkg/kubelet/kubelet_pods.go','867-893','A selected ConfigMap environment key is read from Data; a missing key is skipped only when optional.'),
   source('pkg/kubelet/kuberuntime/kuberuntime_container.go','396-405','Container configuration receives the constructed environment key/value entries.'));
 }
 if (record.kind === 'ConfigMap' && record.fieldPath === '$.binaryData') {
  record.cases.push({name:'binary-data-is-not-an-environment-source',condition:'The selected entry exists only in binaryData and a container uses a ConfigMap environment reference.',sourceOutcome:'ConfigMap environment construction reads Data, not BinaryData. The binary entry does not supply that environment value; use the documented file consumer or an appropriate text entry.'});
  record.evidence.push(source('pkg/kubelet/kubelet_pods.go','774-802','ConfigMap envFrom iterates Data rather than BinaryData.'),
   source('pkg/kubelet/kubelet_pods.go','867-893','A selected ConfigMap environment key is looked up in Data rather than BinaryData.'));
 }
}
export const receiverContracts=[...records.values()];
