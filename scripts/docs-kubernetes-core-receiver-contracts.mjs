/** Authored core/v1 receiving contracts. Schema authority supplies boundary enumeration
 * only. These source-derived outcomes require independent review and do not report
 * an executed API request, controller reconciliation or storage-driver operation. */
import { apiResourceFieldBoundaries } from './docs-api-schema-authorities.mjs';
import { kubernetesMetadataMechanisms } from './docs-kubernetes-metadata-receiver-contracts.mjs';
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
 Service:[source('pkg/registry/core/service/strategy.go','70-94','Create clears status; ordinary update preserves status and drops disabled/type-dependent fields.'),source('pkg/registry/core/service/strategy.go','150-168','The status strategy retains spec and calls Service status update validation.')]
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
const scope='Kubernetes v1.35.0 core/v1 fresh complete JSON create/replacement body; named status/finalize and selected Apply/patch differences are stated separately. Decoding precedes defaults, field management, preparation and validation. Omission and null describe a present immediate parent at fresh typed decode; replacement then uses the live object and strategy. They are not patch deletion instructions or controller completion results.';
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
const pvcLimits=['Pinned core binding, CSI attach/mount/resize, and the conditional SMB chart 1.20.0 provisioner/resizer/driver paths below are source expectations. Actual StorageClass/PV driver, image overrides, enabled features, credentials, server data and application recovery must be observed separately; valid or Bound does not prove healthy data or backup/restore.', 'Available-source documentation gap: a selected custom populator, snapshot controller, non-SMB driver or application recovery implementation has no complete receiving contract here. The provisioner handoff and SMB unsupported snapshot path are qualified; another selected implementation must supply its pinned consumer behavior before its effect is relied on. This is not a product-limit waiver.'];
define('PersistentVolumeClaim','$.spec','Request a persistent volume and optional data population.','The zero spec is rejected for no access mode and no storage request.','{} is rejected for those requirements.','Invalid mode, access-mode combination, selector, storage quantity or data-source combination rejects the spec.',pvcEvidence,{crossFieldConditions:pvcConditions,qualificationLimits:pvcLimits,changeImpact:'Accepted claims enter the volume-binding/provisioning workflow. Most spec changes are forbidden after create. Observe phase, events, selected PV and driver state before retry or migration.'});
for(const p of ['$.spec.accessModes','$.spec.accessModes[]'])define('PersistentVolumeClaim',p,'Request supported volume access modes.',p.endsWith('[]')?'An absent item contributes no mode; the list must remain nonempty.':'No modes is rejected.','[] is invalid for the required list. A retained empty string is unsupported.','Only ReadWriteOnce, ReadOnlyMany, ReadWriteMany and ReadWriteOncePod are supported. ReadWriteOncePod cannot be combined with other supported modes.',[v('2464-2491','Access-mode presence, supported values and ReadWriteOncePod exclusion are validated.')],{crossFieldConditions:pvcConditions,qualificationLimits:pvcLimits,changeImpact:'Access-mode changes fail immutable-spec update comparison; selecting a mode does not prove driver enforcement.'});
for(const [field,omitted,empty,invalid,evidence] of [
 ['volumeMode','Nil defaults to Filesystem.','A present empty string is not nil and is rejected.','Only Filesystem and Block are supported; volumeMode is immutable on update.',[d('299-304','PVC spec defaults a nil volumeMode to Filesystem.'),v('2504-2506','Supplied volumeMode must be supported.'),v('2599','VolumeMode is immutable on update.')]],
 ['volumeName','Empty leaves volume selection to the binding controller.','Empty is accepted for an unbound claim.','The spec validator adds no volumeName grammar; update can set it while old volumeName is empty, then immutable-spec comparison restricts changes.',[v('2546-2551','The one-time empty-old-volumeName exception permits binding.'),v('2462-2530','Spec validation does not add a volumeName grammar.')]],
 ['storageClassName','Nil can be filled by DefaultStorageClass admission; admission leaves it nil if no default class exists.','A present empty string requests no class and is not defaulted.','Nonempty class names must validate; changing class is limited to the recorded upgrade exceptions.',[v('2501-2507','A nonempty pointed class name is validated.'),v('2553-2571','Update allows bounded annotation/nil class upgrades.'),source('plugin/pkg/admission/storage/storageclass/setdefault/admission.go','80-119','DefaultStorageClass admission skips an already specified class and otherwise selects a default class or leaves the claim unchanged.')]],
 ['volumeAttributesClassName','Nil requests no class; when the feature is disabled an unused field is dropped.','Empty is permitted on create by the shown conditional check; removal/empty update is forbidden after a class has successfully been applied.','Nonempty class names are validated when enabled; update is forbidden with the gate disabled and has applied-class removal restrictions.',[pu('37-44','Disabled volume attributes are dropped unless already in use.'),v('2523-2528','Enabled nonempty class names are validated.'),v('2604-2621','Class update gate and applied-class removal checks.')]]
])define('PersistentVolumeClaim',`$.spec.${field}`,`Set claim ${field}.`,omitted,empty,invalid,evidence,{crossFieldConditions:pvcConditions,qualificationLimits:pvcLimits,changeImpact:'Check the old claim and exact permitted update branch. A replacement claim needs a separately verified data migration; an API update is not proof of driver completion.'});
for(const p of ['$.spec.resources','$.spec.resources.requests','$.spec.resources.requests[<exact-key>]','$.spec.resources.limits','$.spec.resources.limits[<exact-key>]']){
 const request=p.includes('.requests');const item=p.endsWith(']');
 const omitted=item?(request?'Omitting the exact storage key fails the required requests.storage check. Omitting another request key adds no entry and does not fail that check when positive requests.storage is present.':'An absent limit key adds no limit; limits.storage is not required.'):request||p==='$.spec.resources'?'Without requests.storage the required positive storage check fails.':'No limit map is supplied; the shown claim spec validator does not require one.';
 const empty=item?`An empty Quantity string is rejected by Quantity.UnmarshalJSON. JSON number 0 is a zero Quantity. ${request?'At the exact storage request key, zero fails positivity. At another request key, this spec validator adds no positivity check; positive requests.storage remains required.':'At any limit key, including storage, this spec validator adds no positivity or request/limit comparison check.'}`:request||p==='$.spec.resources'?'{} resources or requests omits required storage.':'{} limits contributes no limits.';
 define('PersistentVolumeClaim',p,request?'Set requested resource Quantity values; storage controls claim size.':p==='$.spec.resources'?'Set claim volume resource requirements.':'Record claim resource limits.',omitted,empty,request||p==='$.spec.resources'?'requests.storage must be a positive, valid storage Quantity. Other request/limit keys are not iterated by this PVC spec validator; do not import Pod resource validation. Invalid Quantity syntax still fails its custom decoder.':'The shown PVC spec validator does not iterate limits keys or compare limits with requests. Invalid Quantity syntax still fails typed decoding.',[v('2490-2497','The spec validator looks up requests.storage and validates its positive resource quantity.'),source('staging/src/k8s.io/apimachinery/pkg/api/resource/quantity.go','730-751','Quantity.UnmarshalJSON treats null as zero, unquotes strings and parses the quantity.')],{crossFieldConditions:[...pvcConditions,'Bound storage request increase is excluded from immutable comparison. Decrease is forbidden unless recovery is enabled and the new size remains above status.capacity; this is not volume shrinking.'],changeImpact:!request&&p!=='$.spec.resources'?'Changing a limit entry remains subject to immutable-spec update comparison. This validator does not turn limits.storage into a size request or enforce it against requests.storage. Read stored requests.storage and the actual driver state before diagnosing capacity.':'Changing the exact storage request on a bound claim can request expansion; a different request key does not request storage expansion and remains subject to immutable-spec comparison. Confirm StorageClass and driver expansion support and observe controller/node resize state; do not infer a smaller filesystem from an allowed recovery decrease.',qualificationLimits:pvcLimits});
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
 const path=`$.spec.${ref}`;const ev=[v(ref==='dataSource'?'2404-2429':'2432-2458',ref==='dataSource'?'Local dataSource validation requires name/kind, core-group PVC kind or valid nonempty API group unless the compatibility option permits that group.':'dataSourceRef validation requires name/kind, core-group PVC kind or valid nonempty API group unless its compatibility option permits that group, and validates a supplied nonempty namespace.'),v('2512-2522','Cross-namespace reference excludes dataSource; otherwise both present references must agree.'),pu('37-60','Disabled data-source reference and cross-namespace fields are dropped unless already in use.'),pu('76-98','Legacy unsupported dataSource can be silently dropped before normalization.'),pu('162-189','Enabled normalization copies a missing local source counterpart, but does not copy a cross-namespace reference to dataSource.')];
 define('PersistentVolumeClaim',path,'Identify the source used to populate the requested volume.','No source is selected by this pointer; normalization can copy a present local counterpart when AnyVolumeDataSource is enabled.','{} is not an accepted retained source: name/kind are missing. Legacy unsupported dataSource can instead be dropped before validation.','A retained source requires nonempty name/kind and valid API group. Core group requires kind PersistentVolumeClaim. dataSource and local dataSourceRef must agree; cross-namespace dataSourceRef forbids dataSource.',ev,{crossFieldConditions:['Prepare drops disabled fields first, then applies legacy compatibility, then normalizes source counterparts. Evaluate the resulting spec, not the authored JSON alone.','When no old source is in use and dataSourceRef is absent, legacy dataSource supports only core PersistentVolumeClaim and snapshot.storage.k8s.io VolumeSnapshot; other kinds are dropped.'],changeImpact:'Source fields participate in immutable-spec validation. API acceptance does not resolve or authorize a source or prove data population.',qualificationLimits:pvcLimits});
 for(const child of ref==='dataSource'?['apiGroup','kind','name']:['apiGroup','kind','name','namespace'])define('PersistentVolumeClaim',`${path}.${child}`,`Set population source ${child}.`,child==='apiGroup'?'Nil denotes the core group, whose permitted kind is PersistentVolumeClaim.':child==='namespace'?'Nil denotes a local source and permits counterpart normalization.':'The empty scalar is rejected if this reference survives preparation.',child==='apiGroup'?'Present empty string denotes core group and requires PersistentVolumeClaim.':child==='namespace'?'Present empty string is treated as local for validation and normalization.':'Empty string is rejected if the reference survives preparation.',child==='apiGroup'?'Nonempty API group must be a DNS subdomain except the named old-object compatibility option.':child==='namespace'?'A nonempty namespace must validate; it excludes dataSource and depends on CrossNamespaceVolumeDataSource handling.':'A nonempty kind/name is required; these checks do not prove target existence or supported population.',ev,{crossFieldConditions:['The parent reference can be dropped or copied before this child reaches validation; see parent preparation order.'],changeImpact:'A retained child change is a data-source spec change and is subject to immutable-spec update checks.',qualificationLimits:pvcLimits});
}
const svcEvidence=[v('6570-6777','Service validation checks its type-dependent ports, selector, affinity, IP fields and traffic policies.'),d('106-163','Service defaulting supplies affinity/type/protocol/targetPort and applicable traffic policies/node-port allocation/ipMode.')];
const svcConditions=['ClusterIP is the default type. ExternalName requires a DNS name and empty clusterIPs/ipFamilies/ipFamilyPolicy.','Normal create clears status and normal update preserves stored status. Status writes use the status subresource and retain spec.','A successful Service write does not prove EndpointSlices, kube-proxy rules, external-address routing, DNS or a load balancer have converged.'];
const svcLimits=['Pinned EndpointSlice, shared kube-proxy selection, named iptables/IPVS/nftables rules, health-check, conditional CoreDNS v1.13.1 and default cloud-controller paths below are source expectations. Actual controller images/features, selected dataplane/DNS, kernel rules and external resources remain separate observations; no network probe or live load-balancer result is proved.', 'For the selected ClusterIP, NodePort and headless producers, the applicable allocator, EndpointSlice, conditional kube-proxy and DNS source mechanisms below are qualified. my-values/infra/cilium-values.yaml keeps kube-proxy (kubeProxyReplacement:false). The cluster networking owner must supply the deployed API allocator ranges/families, kube-proxy version/configuration/mode and DNS image/Corefile/zone before runtime reliance. For an optional LoadBalancer override, that owner must additionally identify the installed default/class controller and provider version/source, address allocation/announcement/routing and filter owners. No provider is selected by these product sources. Stop before trusting external exposure until these inputs and stored class/status/finalizers are inspected. The documentation owner must qualify the supplied immutable provider or replacement/DNS authority and record controller/provider observations plus allowed and denied connectivity evidence before any later acceptance. See service-routing.md.'];
define('Service','$.spec','Describe service addressing, backend selection and traffic policy.','Zero spec defaults to ClusterIP/None but lacks required ports.','{} is invalid for required ports except a declared headless or ExternalName route.','Invalid ports, type, IP-family combinations, selector or type-dependent fields reject validation.',svcEvidence,{crossFieldConditions:svcConditions,qualificationLimits:svcLimits});
for(const [field,omitted,empty,invalid,evidence] of [
 ['type','The empty scalar defaults to ClusterIP.','Empty string defaults to ClusterIP.','Only ClusterIP, NodePort, LoadBalancer and ExternalName are accepted.',[v('6669-6691','Type is required/supported and ClusterIP forbids nonzero node ports.')]],
 ['externalName','The empty scalar is invalid when type is ExternalName.','Empty string is invalid for ExternalName; otherwise this validator does not use it.','For ExternalName, trim one trailing dot then require a nonempty DNS subdomain.',[v('6601-6621','ExternalName requires empty IP fields and validates its CNAME.')]],
 ['externalTrafficPolicy','For externally accessible Services the empty scalar defaults to Cluster; otherwise it stays empty.','Empty string follows that default; without an accessible route the empty value is permitted.','Only Cluster or Local is accepted when externally accessible; nonempty is invalid for inaccessible Services.',[v('6824-6841','External policy scope and supported values are checked.')]],
 ['internalTrafficPolicy','Nil defaults to Cluster for ClusterIP, NodePort and LoadBalancer.','A present empty string is unsupported and rejected.','Only Cluster and Local are supported; nil is required to be filled for the three internal service types. Historical validation does not forbid a supported present value on other types.',[v('6875-6892','Internal policy nil/type and supported-value checks.')]],
 ['allocateLoadBalancerNodePorts','Nil defaults to true only for LoadBalancer.','False is retained and requests no automatic LB node-port allocation.','A nonnil value is forbidden on other service types; explicit nodePort remains a separate allocation request.',[v('6758-6765','Field must be nil on non-LB and nonnil on LB.'),alloc('973-981','NodePort or LB with allocation enabled requests automatic node-port allocation.')]],
 ['loadBalancerClass','Nil supplies no explicit class.','A present empty string fails qualified-name validation.','Only LoadBalancer can set this; class cannot change while both old and new type remain LoadBalancer.',[v('9219-9247','Class scope, grammar and immutability are validated.')]],
 ['loadBalancerIP','The scalar remains empty.','Empty supplies no requested load-balancer IP.','The shown Service validator has no independent loadBalancerIP format check. Its consumer interpretation is not proved by API acceptance.',[v('6570-6777','Service validation does not add a loadBalancerIP check.')]],
 ['publishNotReadyAddresses','The scalar remains false.','False is retained; true is stored as endpoint-publication intent.','Non-boolean JSON fails typed decode; Service validator adds no value-level restriction.',[v('6570-6777','Service validation adds no independent check to publishNotReadyAddresses.')]],
 ['trafficDistribution','Nil requests no distribution preference. Disabled unused field is dropped by the strategy.','Present empty string is unsupported if the field survives preparation.','PreferClose is accepted; PreferSameZone/PreferSameNode additionally require PreferSameTrafficDistribution. Unknown values fail.',[source('pkg/registry/core/service/strategy.go','128-135','ServiceTrafficDistribution disabled/old-use rule drops the field.'),v('6896-6921','Feature-selected supported trafficDistribution values are checked.')]]
])define('Service',`$.spec.${field}`,`Set Service ${field}.`,omitted,empty,invalid,[...svcEvidence,...evidence],{crossFieldConditions:svcConditions,qualificationLimits:svcLimits,changeImpact:'A permitted change updates stored Service intent; a type transition can drop fields that belong to the old type. Inspect the resulting spec and dependent endpoints/routing before relying on or reversing the change.',evidence:[source('pkg/registry/core/service/strategy.go','248-308','Type transitions clear old dependent fields only when the new submitted value is unchanged from the old value.')]});
const ipEvidence=[v('8964-9067','Cluster IP/family validation requires matching first ClusterIP, supported distinct families, at most two addresses and one address per family.'),alloc('104-188','Storage initializes policy/family fields from service and cluster configuration.'),alloc('340-451','With prevalidated family allocators, storage allocates or reserves cluster addresses; allocation/reservation errors return Invalid, while an exhausted automatic allocation returns InternalError.'),alloc('264-281','After the headless-selectorless special case, requested families and RequireDualStack must have configured allocators or return Invalid.'),v('9099-9187','Update validation permits bounded stack upgrades/downgrades and forbids changing retained cluster addresses/families.')];
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
  def.crossFieldConditions=[...(def.crossFieldConditions??[]),'For an unbound claim with empty volumeName, the pinned PV controller searches a matching PV. If none exists, it can assign a default class, wait for delayed binding, start provisioning for a nonempty class, or record FailedBinding and retain Pending. A nonempty volumeName selects the separate named-PV branch. Binding writes PV identity/status before PVC volumeName/annotations and Bound status; it stops on the first write error, so a partial result must be read before retry.'];
  def.evidence.push(pv('1576-1604','Provisioning is skipped when disabled; plugin lookup failures record ProvisioningFailed and retry on later unbound sync; the UID-named operation dispatches internal or external provisioning.'),pv('1841-1858','External provisioning writes the selected provisioner annotation or returns its API error, then emits ExternalProvisioning while waiting for the external provisioner.'),pv('331-389','Unbound claim matching, default-class assignment, delayed binding, provisioning and Pending branches.'),pv('1095-1127','Binding saves volume reference/status, then claim reference/status and stops on the first error.'));
  def.evidence.push(source('staging/src/k8s.io/component-helpers/storage/volume/pv_helpers.go','206-213','Matching converts a present selector and returns conversion errors.'),source('staging/src/k8s.io/component-helpers/storage/volume/pv_helpers.go','230-237','Matching skips insufficient volume capacity or mismatched volume mode.'),source('staging/src/k8s.io/component-helpers/storage/volume/pv_helpers.go','239-249','Enabled volume-attributes matching requires equal effective class names; disabled matching skips PVs with a nonempty class.'),source('staging/src/k8s.io/component-helpers/storage/volume/pv_helpers.go','291-305','Unbound candidates must be Available and satisfy the authored selector and requested storage class; a failed node-affinity result also excludes the candidate.'),source('staging/src/k8s.io/component-helpers/storage/volume/pv_helpers.go','256-266','Node affinity is checked against node labels only when a node is supplied, in the scheduler path.'),source('staging/src/k8s.io/component-helpers/storage/volume/pv_helpers.go','307-313','This helper checks requested access modes only when a node is supplied; this block does not check access modes when node is nil.'));
  if(path==='$.spec'||path==='$.spec.volumeAttributesClassName')def.crossFieldConditions.push('FindMatchingVolume compares effective claim/PV volumeAttributesClassName values after nil becomes empty. With volume-attributes matching enabled it skips unequal classes. With matching disabled it skips any PV with a nonempty class; a valid claim name alone does not establish a matching PV.');
 }
 if(kind==='PersistentVolumeClaim'&&path.startsWith('$.status')){
  def.crossFieldConditions=[...(def.crossFieldConditions??[]),'The pinned binding controller resets accessModes/capacity/current class without a volume; with a volume it copies modes, updates capacity on the phase transition with pre-resize handling, and sets current volume-attributes class only during Pending-to-Bound when enabled. Later resize writers are separate.'];
  def.evidence.push(pv('784-824','Claim status helper sets phase, resets no-volume observations or copies volume modes and checks capacity.'),pv('827-858','Phase-transition capacity and one-time initial volume-attributes observation handling.'));
 }
 if(kind==='PersistentVolumeClaim'&&(path==='$.spec'||path==='$.spec.volumeName'||path==='$.status.phase')){
  def.crossFieldConditions=[...(def.crossFieldConditions??[]),'Kubelet resolves the claim in the Pod namespace and requires Bound phase and a nonempty volumeName. It retrieves that PV and requires a nonnil claimRef with the exact claim UID. Passing these checks creates the PV volume spec; it does not prove attach/mount or successful filesystem access.'];
  def.evidence.push(source('pkg/kubelet/volumemanager/populator/desired_state_of_world_populator.go','523-557','Kubelet claim lookup rejects missing claim, non-Bound state or empty volumeName.'),source('pkg/kubelet/volumemanager/populator/desired_state_of_world_populator.go','562-588','PV lookup requires claimRef and exact claim UID before constructing a persistent-volume spec.'));
 }
 if(kind==='PersistentVolumeClaim'&&(path==='$.spec'||path==='$.spec.volumeName'||path==='$.status.phase'||path.startsWith('$.status.capacity'))){
  def.crossFieldConditions=[...(def.crossFieldConditions??[]),
   'The PV controller selects its previously-bound reconciliation by the bind-completed annotation, not by phase alone. For an unbound claim with explicit volumeName it looks up that named PV rather than falling back to a newly provisioned volume. A missing named PV records Pending. For an unclaimed named PV, deletion state, capacity, storage class, feature-selected attributes class, volume mode and access modes must satisfy the claim; failure emits VolumeMismatch and records Pending. A matching pre-bound claim reference instead completes bind; the helper matches name/namespace and any nonempty reference UID.',
   'If the named PV belongs to another claim, the explicit-selection branch emits FailedBinding. Without the bound-by-controller annotation it records Pending and waits for later sync. With that annotation it returns an invalid-binding error. Lookup, bind and status-write errors propagate, so read both objects after partial progress rather than changing a PV claim reference to force success.',
   'For a claim with bind-completed recorded, an empty volumeName or missing cached PV records Lost with ClaimLost. A PV claimRef UID different from the PVC UID records Lost with ClaimMisbound. Those no-volume status updates clear observed accessModes, capacity and current attributes class when present. Lost is a controller observation of missing or conflicting binding, not an independently checked erasure of server data.',
   'A previously-bound claim whose PV claimRef is nil can be rebound by the controller; a matching claimRef UID also calls bind to finish or repair observations. The controller cannot distinguish a genuinely unbound PV from an older cache view in the nil-reference branch. A bind or API write error can leave partial PV/PVC state. Preserve original UIDs/handle, inspect live references and events, and involve the storage owner before any replacement or recovery; this branch does not migrate or restore data.',
  ];
  def.evidence.push(pv('251-255','The bind-completed annotation selects unbound versus previously-bound claim reconciliation.'),pv('410-426','An explicit named PV lookup can return an error or record Pending when absent.'),pv('433-463','An unclaimed named PV must satisfy the claim; mismatch emits VolumeMismatch/Pending, while a matching pre-bound reference calls bind.'),pv('259-301','Explicit unclaimed-PV checks cover deletion, capacity, classes, volume mode and access modes.'),source('staging/src/k8s.io/component-helpers/storage/volume/pv_helpers.go','159-169','A pre-bound PV reference matches claim name/namespace and its nonempty UID when present.'),pv('464-485','An already claimed explicit PV emits FailedBinding and either records Pending or returns an invalid-binding error according to the controller-binding annotation.'),pv('500-516','A previously-bound claim missing volumeName or its PV records Lost with ClaimLost.'),pv('524-553','Nil PV claimRef can be rebound; equal UID calls bind; a different UID records Lost with ClaimMisbound.'),pv('796-809','A no-volume claim status update clears observed modes, capacity and current volume-attributes class.'));
  if(path==='$.spec.volumeName')def.cases=[...(def.cases??[]),
   {name:'explicit-pv-missing-remains-pending',condition:'An unbound claim has a nonempty volumeName but that named PV is absent from the controller store.',sourceOutcome:'It records Pending and waits for later sync; this branch does not select dynamic provisioning instead. A lookup or status-write error propagates. Inspect the named PV and claim events before changing identity.'},
   {name:'explicit-unclaimed-pv-mismatch',condition:'The named PV has nil claimRef and fails checkVolumeSatisfyClaim.',sourceOutcome:'It emits VolumeMismatch and records Pending rather than binding. Check deletion state, size, storage/attributes classes, volume mode and access modes. Read current PV/PVC state after a status error; fixing a field does not prove restored data.'},
   {name:'explicit-pv-owned-by-other-claim',condition:'The named PV is claimed by another identity.',sourceOutcome:'It emits FailedBinding. A user-selected claim without bound-by-controller records Pending; a claim with that annotation returns an invalid-binding error. Do not overwrite the other claim reference or retry as a data migration.'}];
  if(path==='$.status.phase')def.cases=[...(def.cases??[]),
   {name:'formerly-bound-reference-missing',condition:'A claim with bind-completed recorded has empty volumeName or cannot find that PV in the controller store.',sourceOutcome:'The controller writes Lost with ClaimLost and clears the no-volume observations. A status-write failure propagates. Preserve the original handle and inspect server data before recovery; the event is not a server-erasure check.'},
   {name:'formerly-bound-pv-uid-conflict',condition:'A previously-bound claim finds a PV whose nonnil claimRef UID differs from its PVC UID.',sourceOutcome:'It writes Lost with ClaimMisbound, clears the no-volume observations and reports a status-write error if that write fails. The conflict concerns object lifetimes; do not replace or erase the original data to force a new binding.'},
   {name:'formerly-bound-pv-reference-nil-rebind',condition:'A previously-bound claim finds its named PV with nil claimRef.',sourceOutcome:'It calls bind again because it cannot distinguish lost binding from an older cache view. Read live identities and partial observations after a bind error; automatic rebinding does not restore or validate the volume contents.'}];
  if(path==='$.status.capacity')def.cases=[...(def.cases??[]),{name:'lost-binding-clears-observed-capacity',condition:'A previously-bound reconciliation records Lost with a nil volume argument.',sourceOutcome:'The status helper clears existing capacity, accessModes and current attributes class before its status write. This clears API observations without resizing or deleting server data; an API error means that write may not be stored.'}];
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

// Qualify common mechanisms against these concrete typed REST strategies.
for(const [key,def] of definitions){
 const [kind,path]=[key.slice(0,key.indexOf(':')),key.slice(key.indexOf(':')+1)];
 const attach=(mechanism)=>{def.crossFieldConditions=[...(def.crossFieldConditions??[]),...mechanism.conditions];def.evidence.push(...mechanism.evidence);};
 if(path==='$.metadata'||path.startsWith('$.metadata.ownerReferences')){
  attach(kubernetesMetadataMechanisms.ownership);
  def.crossFieldConditions.push(kind==='Namespace'?'This dependent is cluster scoped. GC cannot resolve a namespaced owner for it.':'This dependent is namespaced. A namespaced owner is looked up in this dependent namespace; cluster-scoped owners are resolved without a namespace.');
  def.qualificationLimits=(def.qualificationLimits??[]).filter(x=>!x.includes('owner graph')&&!x.includes('garbage-collector graph'));
  if(path==='$.metadata.ownerReferences')def.cases=[...(def.cases??[]),
   {name:'owner-name-reused-with-new-uid',condition:'The referenced owner name exists with a different UID.',sourceOutcome:'GC classifies the old reference as dangling; a reused name is a different owner lifetime.'},
   {name:'blocking-reference-permission',condition:'OwnerReferencesPermissionEnforcement is enabled and a new reference requests blockOwnerDeletion:true.',sourceOutcome:'Admission requires update permission on each mapped owner finalizers subresource or the wildcard finalizers grant. Owner mapping or authorization failure can reject the request.'},
   {name:'orphan-dependent-patch-partial-failure',condition:'GC snapshots an orphaned owner graph containing this dependent; some dependent patches succeed and another fails with an error other than NotFound.',sourceOutcome:'It can already have removed the exact owner UID reference from this dependent. It aggregates the failed patches, retains the owner orphan token and rate-limits retry. Strategic patches carry the dependent UID precondition; inspect both lifetimes and surviving owner references before retry or cleanup.'}];
 }
 if(path==='$.metadata'||path.startsWith('$.metadata.managedFields')){
  attach(kubernetesMetadataMechanisms.fieldManagement);
  def.crossFieldConditions.push('These are typed built-ins. Fresh null decodes managedFields to nil; [] remains a nonnil empty slice and [{}] remains one zero entry. Root non-apply field management selects reset for []/[{}], while omission/null falls back to live ownership. With a live UID and empty ownership, the installed skip wrapper skips tracking; reset does not immediately record the replacing manager. On create, the default wrapper tracks with probability 1. '+(kind==='ConfigMap'?'ConfigMap has no status or finalize REST route.':'The supported status'+(kind==='Namespace'?' and finalize':'')+' field-management route selects live ownership instead of request entries.'));
  const strategy=strategyNames[kind];
  const resetRanges={ConfigMap:'51-58',Namespace:'56-64',PersistentVolumeClaim:'55-65',Service:'56-68'};
  def.evidence.push(kind==='ConfigMap'?source('pkg/registry/core/configmap/storage/storage.go','37-58','ConfigMap storage supplies no resource-specific reset-fields strategy or status route.'):source(`pkg/registry/core/${strategy}/strategy.go`,resetRanges[kind],'The concrete root strategy exposes its field-manager reset-field set.'),source('staging/src/k8s.io/apiserver/pkg/endpoints/installer.go','702-723','REST installation constructs the field manager with available strategy reset fields and the selected subresource.'));
  def.qualificationLimits=(def.qualificationLimits??[]).filter(x=>!x.includes('field-manager')&&!x.includes('field manager consumes')&&!x.includes('reset-field transfer'));
  if(path==='$.metadata.managedFields'){
   def.omitted='Fresh decode supplies nil ownership. Root non-apply handling falls back to live ownership; create starts from an empty live object. This does not reset an existing object ownership list.';
   def.nullValue='Fresh JSON null produces nil ownership, like omission. Root non-apply handling falls back to live ownership; null is not the []/[{}] reset sentinel.';
   def.emptyValue='For this typed root non-apply route, [] or exactly [{}] selects empty ownership. An existing live UID then makes the skip wrapper return without tracking this update. Create has default tracking probability 1. '+(kind==='ConfigMap'?'ConfigMap exposes no status or finalize route.':'Its supported subresources use live ownership instead of either sentinel.');
   def.invalidValue='Incompatible typed tokens fail decoding. A syntactically decoded ownership list can fail field-set decoding: non-apply handling falls back to live ownership, while Apply reports invalid live ownership and rejects authored nonnil managedFields. Metadata entry validation applies to the resulting object, not necessarily the original request entries.';
   def.cases=[...(def.cases??[]),{name:'typed-reset-skips-current-replacement-manager',condition:'An ordinary replacement of an existing typed object supplies [] or exactly [{}] in managedFields.',sourceOutcome:'The request selects empty ownership. Because the live object has a UID, the skip wrapper does not track this replacement. A later first Apply initializes before-first-apply ownership before merging its fields.'},{name:'subresource-ignores-authored-ownership',condition:kind==='ConfigMap'?'A client attempts a ConfigMap status or finalize update.':`A ${kind} status${kind==='Namespace'?' or finalize':''} update supplies authored ownership entries.`,sourceOutcome:kind==='ConfigMap'?'ConfigMap storage exposes neither status nor finalize. This is an unsupported resource route; no ConfigMap subresource ownership behavior follows from the generic field-manager mechanism.':'The supported named subresource field manager selects live ownership; its manager identity and reset-field exclusions remain distinct from the root route.'}];
  }else if(path==='$.metadata.managedFields[]'){
   def.emptyValue='{} or retained null is one zero entry at typed decode. If it is the only list entry, root non-apply handling recognizes [{}] as reset before metadata validation. Otherwise failed ownership decoding can fall back to live ownership; direct validation of a retained zero entry rejects its operation.';
  }else if(path.startsWith('$.metadata.managedFields[].')){
   def.invalidValue+=' This is the child decoder/direct metadata check. Non-apply ownership decoding can replace the authored entries with live ownership before validation; Apply uses live entries and rejects nonnil authored managedFields.';
  }
 }
 if(path==='$.metadata'||path.startsWith('$.metadata.deletion')||path.startsWith('$.metadata.finalizers')){
  attach(kubernetesMetadataMechanisms.deletion);
  if(path==='$.metadata.finalizers')def.cases=[...(def.cases??[]),{name:'orphan-owner-token-removal-failed',condition:'GC has completed the concurrent owner-reference removals for the owner graph snapshot, but updating this owner to remove its orphan token fails.',sourceOutcome:'Dependent references can already be removed while the owner token remains. GC rate-limits a retry rather than rolling back those patches; NotFound dependent patches are tolerated. Read owner finalizers and dependent UIDs/references before manual cleanup; token removal does not prove external data cleanup.'}];
  def.crossFieldConditions.push('ConfigMap, PVC and Service use ordinary non-graceful resource strategies: metadata grace does not select a Pod-like termination interval. Namespace has a separate DELETE implementation and two finalizer lists. Its first DELETE checks UID/version, stores Terminating and deletionTimestamp, and returns pending; later removal requires empty spec.finalizers as well as generic metadata-finalizer checks.');
  def.evidence.push(source('pkg/registry/core/namespace/storage/storage.go','146-170','Namespace DELETE fills/checks UID and checks an explicit resource-version precondition.'),source('pkg/registry/core/namespace/storage/storage.go','174-202','First Namespace DELETE stores deletionTimestamp and Terminating under storage preconditions.'),source('pkg/registry/core/namespace/storage/storage.go','247-264','Namespace DELETE returns pending and later delegates only with no spec finalizers; delete-during-update also requires their absence.'));
  def.qualificationLimits=(def.qualificationLimits??[]).filter(x=>!x.includes('generic deletion')&&!x.includes('deletion-grace'));
 }
 if(kind==='Namespace'&&path==='$.metadata.namespace'){
  def.omitted='The cluster-scoped request normalizes metadata.namespace to empty before validation.';
  def.emptyValue='Empty is retained for cluster scope; an authored nonempty namespace is cleared by request-scope normalization.';
  def.invalidValue='Incompatible typed tokens fail decode. The actual cluster-scoped REST helper clears an authored nonempty namespace before validation; direct cluster-scoped metadata validation alone would forbid it.';
  def.evidence.push(source('staging/src/k8s.io/apiserver/pkg/registry/rest/meta.go','45-77','Scope matching clears an authored namespace for a cluster-scoped request; unequal nonempty namespaced scope is rejected.'));
 }
 if(path==='$.metadata.creationTimestamp')def.invalidValue='Malformed RFC3339 fails typed decoding. Create wipes and replaces a valid authored time; replacement restores an existing nonzero stored creation time before immutable validation.';
 if(path==='$.metadata.uid')def.invalidValue='Incompatible typed tokens fail decoding. Create wipes an authored UID and initializes a fresh one. Replacement fills an omitted UID from storage and rejects a different nonempty UID.';
 if(path==='$.metadata.generation')def.crossFieldConditions=[...(def.crossFieldConditions??[]),'BeforeUpdate restores the stored generation before the selected strategy runs; the body cannot select a generation change. These four strategies do not use Deployment-style spec-change generation increments.'];
 if(['$.metadata.uid','$.metadata.creationTimestamp','$.metadata.deletionTimestamp','$.metadata.deletionGracePeriodSeconds','$.metadata.generation'].includes(path))def.evidence.push(source('staging/src/k8s.io/apiserver/pkg/registry/rest/update.go','126-153','BeforeUpdate restores generation, fills omitted UID and preserves stored nonzero creation/deletion times and absent deletion grace before validation.'),source('staging/src/k8s.io/apiserver/pkg/endpoints/handlers/create.go','164-175','Create wipes client system metadata before later storage initialization.'));
}

// Later consumers. A selected route is conditional on its actual component/version.
const externalSource=(repo,rev,path,lines,claim)=>({url:`https://github.com/${repo}/blob/${rev}/${path}#L${String(lines).replace('-', '-L')}`,claim});
const provisioner=(path,lines,claim)=>externalSource('kubernetes-csi/external-provisioner','986812da302189f395030a72c3099dc7302b4899',path,lines,claim);
const provisionerLibrary=(lines,claim)=>provisioner('vendor/sigs.k8s.io/sig-storage-lib-external-provisioner/v13/controller/controller.go',lines,claim);
const resizer=(path,lines,claim)=>externalSource('kubernetes-csi/external-resizer','665104f4a4eb88b48edd185d2b5544a5c850ac17',path,lines,claim);
const smb=(path,lines,claim)=>externalSource('kubernetes-csi/csi-driver-smb','1bd5463f965be7b173ff1e7fc3c9a3c29972539c',path,lines,claim);
const dns=(path,lines,claim)=>externalSource('coredns/coredns','1db4568df6aaacda6ebbce87717156bd855f8103',path,lines,claim);
const qualifies=(def,conditions,evidence)=>{def.crossFieldConditions=[...(def.crossFieldConditions??[]),...conditions];def.evidence.push(...evidence);};
const sourceRouteEvidence=[smb('charts/v1.20.0/csi-driver-smb/values.yaml','1-14','SMB chart 1.20.0 defaults to driver v1.20.0, provisioner v6.0.0 and resizer v2.0.0. Image overrides select another receiving authority.')];
const pvcSourceConditions=[
 'The conditional SMB chart 1.20.0 route below uses its default driver v1.20.0, external-provisioner v6.0.0 and external-resizer v2.0.0. It does not infer that every PVC selects SMB or that these images are deployed. Read the claim class, StorageClass provisioner, PV driver and actual image versions before using this route.',
 'The selected external-provisioner prefers dataSource over dataSourceRef, defaults a local source namespace to the claim namespace and rejects an explicit source namespace when its CrossNamespaceVolumeDataSource gate is off. For another namespace it lists ReferenceGrants there. A grant must permit a core PersistentVolumeClaim from the claim namespace and the target group/kind plus absent, empty or matching target name. Failure stops source resolution; API admission alone does not authorize source access.',
 'This provisioner handles PVC clones and snapshot.storage.k8s.io VolumeSnapshot sources. Another kind produces an IgnoredError and an event saying an external populator is expected; it does not create a populated volume itself. A nonnil claim selector is rejected for dynamic CSI provisioning, even if the core binding controller can match an existing PV with that selector.',
 'When its VolumeAttributesClass feature is enabled, this provisioner requires MODIFY_VOLUME for a nonempty volumeAttributesClassName before CreateVolume. SMB v1.20.0 advertises CREATE_DELETE_VOLUME, SINGLE_NODE_MULTI_WRITER, CLONE_VOLUME and EXPAND_VOLUME, but not MODIFY_VOLUME. On that selected route, the capability check rejects this claim; API acceptance of the name does not establish provisioning or volume modification support.',
 'A clone source must be Bound, not deleting, have class and volume identity, and fit the requested size. Its PV must use the destination class provisioner, have the exact source claim UID/namespace/name, be Bound and have the same Block/Filesystem mode. A snapshot source must not be deleting, must have bound content with matching UID/namespace/name and driver, ReadyToUse true and a snapshot handle. Requested capacity must cover restoreSize when present; enabled mode-conversion protection checks the snapshot-content permission annotation.',
 'SMB v1.20.0 rejects Block capability. Its snapshot RPCs are Unimplemented and its content-copy route rejects a snapshot source; a valid PVC snapshot reference cannot establish snapshot restore on SMB. Its PVC-clone route copies from the source SMB volume. Copy, SMB access and application consistency are separate from core binding.',
 'On the selected SMB clone route, copyFromVolume parses the source handle, uses the first requested capability when present, and mounts source and destination through NodeStageVolume with the same CreateVolume secrets. An invalid source handle returns NotFound; either mount can fail. It then runs external cp -a from the source directory contents to the destination. Copy failure returns Internal with command output and does not undo a partially written destination. The command is not bound to RPC context cancellation, and deferred unmount errors only log warnings. Preserve both handles and inspect destination contents/mounts after a timeout or error; do not replay or delete the destination as if no copy occurred. This route does not quiesce the source application or verify an independently restored reader.',
];
const pvcSourceEvidence=[...sourceRouteEvidence,
 provisioner('pkg/controller/controller.go','1951-1996','The provisioner resolves source precedence/namespace and checks cross-namespace grants.'),
 provisioner('pkg/controller/util.go','12-55','IsGranted matches the source-namespace grant, core claim From identity and target group/kind/optional name; otherwise it returns an access error.'),
 provisioner('pkg/controller/controller.go','589-632','Provisioning selects clone/snapshot capability, leaves other kinds to a populator and rejects a nonnil selector.'),
 provisioner('pkg/controller/controller.go','617-628','An enabled nonempty volumeAttributesClassName sets the modifyVolume requirement before capability checking.'),
 provisioner('pkg/controller/controller.go','451-456','A modifyVolume requirement rejects a driver without MODIFY_VOLUME before CreateVolume.'),
 smb('pkg/smb/smb.go','187-193','The SMB driver capability list does not advertise MODIFY_VOLUME.'),
 provisioner('pkg/controller/controller.go','1065-1089','Clone source lookup requires Bound/non-deleting state, source/destination classes and sufficient destination requested size.'),
 provisioner('pkg/controller/controller.go','1092-1137','Clone PV lookup checks CSI driver, exact claim identity, Bound state and matching volume mode.'),
 provisioner('pkg/controller/controller.go','1154-1186','Snapshot resolution checks non-deleting/bound snapshot, exact content reference identity, driver and readiness.'),
 provisioner('pkg/controller/controller.go','1191-1239','Snapshot restore requires a handle, adequate restore size and permitted mode conversion when that protection is enabled.'),
 smb('pkg/smb/controllerserver.go','326-335','SMB snapshot RPCs return Unimplemented.'),
 smb('pkg/smb/controllerserver.go','419-428','SMB content copy rejects snapshot sources and dispatches volume clones to copyFromVolume.'),
 smb('pkg/smb/controllerserver.go','377-390','SMB clone parsing establishes source/destination paths and selects the first supplied capability.'),
 smb('pkg/smb/controllerserver.go','392-408','Source and destination use the same CreateVolume secrets for internal staging; mount failures return errors and deferred unmount failures only log.'),
 smb('pkg/smb/controllerserver.go','410-417','SMB clone runs external cp -a without a context-bound command and returns copy errors without destination rollback.'),
 smb('pkg/smb/controllerserver.go','339-360','Internal SMB mounts call NodeStageVolume with the base-share source, volume handle, staging path, capability and request secrets.'),
 smb('pkg/smb/controllerserver.go','560-570','SMB capability validation rejects Block volumes.'),
];
const pvcResizeConditions=[
 'When the PVC resize admission plugin is enabled, an increase requires an old Bound claim and the same nonempty old/new class whose StorageClass explicitly sets allowVolumeExpansion:true. Missing class, class lookup failure or a nil/false expansion flag rejects the increase. Core immutable-spec validation and driver support remain separate checks.',
 'The core expand controller requires matching PV claim namespace/UID and acts when the request exceeds observed capacity or a pre-resize annotation exists. A CSI-migrated or external-driver route waits for the external resizer; a core ExpandablePlugin runs its selected operation. Waiting here is not a successful controller expansion.',
 'The selected external-resizer records resize progress before calling the driver, updates PV capacity after a successful RPC, then records either FileSystemResizePending or completed PVC capacity. Failure after the RPC or PV write can leave partial progress. Recovery uses allocatedResources.storage and allocatedResourceStatuses.storage; controller-infeasible states use the slow retry path. Read request, allocation, PV/PVC capacity and events before changing the target.',
 'SMB ControllerExpandVolume validates volume ID and capacity-range presence, then returns the requested capacity without changing the SMB server quota and without requiring node expansion. NodeExpandVolume is Unimplemented. A successful PVC size observation on this route is not proof of increased server space, application capacity or successful data recovery.',
];
const pvcResizeEvidence=[...sourceRouteEvidence,
 source('plugin/pkg/admission/storage/persistentvolume/resize/admission.go','94-130','Enabled resize admission requires old Bound state and matching classes with an explicit allowVolumeExpansion flag.'),
 source('pkg/controller/volume/expand/expand_controller.go','223-237','Expansion checks PV claim namespace/UID and requested/observed size or a pre-resize annotation.'),
 source('pkg/controller/volume/expand/expand_controller.go','245-286','CSI-migrated and external expansion branches wait for an external resizer; an expandable core plugin dispatches expand.'),
 resizer('pkg/controller/controller.go','463-499','Legacy resize records progress, dispatches volume resize and chooses pending filesystem versus completed status; failures emit VolumeResizeFailed.'),
 resizer('pkg/controller/controller.go','505-535','The resizer calls its driver and updates PV capacity before returning successful resized size.'),
 resizer('pkg/controller/expand_and_recover.go','50-100','Recovery reads allocation and resize status to choose the next target.'),
 resizer('pkg/controller/expand_and_recover.go','157-195','Recovery can delay a retry, marks progress and calls the plugin; failures produce warning events.'),
 smb('pkg/smb/controllerserver.go','311-324','SMB controller expansion returns requested bytes after input-presence validation and performs no quota-changing call.'),
 smb('pkg/smb/nodeserver.go','423-427','SMB node expansion is Unimplemented.'),
];
const pvcConditionEvidence=[
 source('pkg/volume/util/resize_util.go','134-165','Core helpers produce Resizing True and controller-progress allocation observations.'),
 source('pkg/volume/util/resize_util.go','185-205','Filesystem waiting produces FileSystemResizePending True and optional NodeResizePending.'),
 source('pkg/volume/util/resize_util.go','216-257','Resize completion records capacity, clears the storage allocation status and removes known resize conditions.'),
 source('pkg/volume/util/resize_util.go','261-320','Node failure helpers produce NodeResizeError True with the concrete error message; infeasible adds NodeResizeInfeasible.'),
 source('pkg/volume/util/resize_util.go','391-429','Resize-condition merge preserves unrelated conditions and, for equal Status, retains the whole old matching condition rather than replacing its message/time.'),
 resizer('pkg/modifycontroller/modify_status.go','36-80','Modification progress/error writes status, target class, ModifyingVolume/ModifyVolumeError conditions and a resource-version-checked claim patch.'),
 resizer('pkg/modifycontroller/modify_status.go','85-123','Modification completion updates PV class before PVC current class, clears modification status/conditions and returns either write error.'),
];
const kubeclawStorageSource=(path,lines,claim)=>externalSource('datrab/kubeclaw','f0e3759e867eb9ac224a047b710f9397c16af22b',path,lines,claim);
const pvcReclaimConditions=[
 'KubeClaw configuration/workspace claims and Prism database/artifact claims default their chart storageClass values to empty. Their templates omit storageClassName for that value, so admission or binding can select a cluster default. An explicitly empty API storageClassName instead requests no class. The registered SMB chart 1.20.0 is a candidate driver, not proof that these claims select it; inspect the stored claim, StorageClass provisioner, PV CSI driver and controller images.',
 'For an omitted claim class, the default-class helper recognizes the exact string true in either stable or beta default annotation. It selects the newest creation timestamp among defaults, breaking equal timestamp ties by ascending class name. No default yields no class; listing or PVC-update errors stop that attempt. The binder can later assign a discovered default to an unclassified claim. Observe the actual stored class and its provisioner rather than selecting SMB from installation alone.',
 'The KubeClaw configuration/workspace PVCs and Prism artifacts/backups PVCs carry Helm keep and Argo Prune=false,Delete=false annotations. Prism database claim-template metadata carries Argo Prune=false,Delete=false. These persistence controls mean ordinary release removal is not the operator-retirement deletion route described here; inspect the rendered object, owner/workload policy and GitOps operation before any explicit retirement.',
 'After a bound claim disappears, the PV controller checks its claim reference and UID, including fallback reads when needed, before recording Released. A different live UID is another claim lifetime. A lookup or phase-write error stops that sync; an existing Failed phase is preserved. PV Retain performs no reclaim operation. Delete dispatches deletion, but an external CSI deleter is left to its provisioner. PVC protection removal alone performs none of these steps.',
 'The selected external-provisioner library reconciles only PVs owned by its provisioner or CSI driver. Its deletion guard requires Released and Delete, with deletionTimestamp/finalizer checks determined by its configured addFinalizer option. It calls the CSI provisioner Delete first, then requests PV deletion and removes its own finalizer when configured. IgnoredError leaves the work to another owner; another error emits VolumeFailedDelete. A PV-delete or finalizer-patch failure after a successful driver call leaves partial progress and can repeat the driver call.',
 'The CSI provisioner Delete uses the PV CSI volume handle, checks driver capabilities, resolves deletion credentials and checks VolumeAttachments when its lister exists. A matching attachment or list error blocks the RPC; no lister adds no attachment check. Missing or unreadable deletion credentials can still allow DeleteVolume with no secrets on the documented branches. The RPC uses the provisioner timeout. Queue retry continues while the configured failed-delete threshold allows it; zero has no threshold stop, and reaching a nonzero threshold stops rate-limited requeue without forgetting the counter. Do not assume an unlimited retry or successful external deletion from an API observation.',
 'SMB v1.20.0 DeleteVolume rejects an empty handle, treats an unparseable handle as already absent, and uses an in-process per-volume lock. With no secrets, or with effective onDelete Retain, it returns success without deleting the subdirectory. With secrets and a non-Retain policy, it mounts the base share, then Archive renames the subdirectory to archived-<subdirectory>; when removeArchivedVolumePath is enabled, it first removes an earlier archive. Other non-Retain policies remove the subdirectory. Mount, archive or removal errors propagate; deferred unmount failure is only logged. Even a no-directory-work success stores the handle in the in-process deletion cache. A later call with secrets can return cached success without new directory work; this is not durable data-recovery evidence.',
 'Before any retry or cleanup change, the storage owner must retain claim/PV UID, volume handle, reclaim policy, effective SMB onDelete/default policy, driver options, non-secret credential-reference identity, events and logs. Check the actual share and archived path through the approved storage process. Do not remove finalizers or delete a retained directory to force convergence. A completed RemoveAll or removal of an earlier archive has no rollback in this implementation. Archive on the same share and a successful DeleteVolume response are not independent backups or application recovery; follow the separately verified recovery procedure or stop before cutover.',
];
const pvcReclaimEvidence=[...sourceRouteEvidence,
 kubeclawStorageSource('charts/kubeclaw/values.yaml','279-289','Configuration/workspace storageClass defaults are empty.'),
 kubeclawStorageSource('charts/kubeclaw/templates/pvc.yaml','14-22','Configuration PVC renders storageClassName only for a nonempty chart value.'),
 kubeclawStorageSource('charts/kubeclaw/templates/pvc.yaml','40-48','Workspace PVC renders storageClassName only for a nonempty chart value.'),
 kubeclawStorageSource('charts/prism/values.yaml','53-63','Prism database/artifact storageClass defaults are empty.'),
 kubeclawStorageSource('charts/prism/templates/postgresql.yaml','62-72','Prism database claim template omits the class when its chart value is empty.'),
 kubeclawStorageSource('charts/prism/templates/workloads.yaml','217-230','Prism artifact claim omits the class when its chart value is empty.'),
 kubeclawStorageSource('gitops/platform/bootstrap/csi-driver-smb.yaml','12-20','The registered SMB Application selects chart 1.20.0, not a class for every claim.'),
 kubeclawStorageSource('charts/kubeclaw/templates/pvc.yaml','8-10','Configuration PVC keeps the resource through Helm and disables Argo pruning/deletion.'),
 kubeclawStorageSource('charts/kubeclaw/templates/pvc.yaml','34-36','Workspace PVC keeps the resource through Helm and disables Argo pruning/deletion.'),
 kubeclawStorageSource('charts/prism/templates/workloads.yaml','220-224','Prism artifact PVC keeps the resource through Helm and disables Argo pruning/deletion.'),
 kubeclawStorageSource('charts/prism/templates/jobs.yaml','63-74','Prism backup PVC keeps the resource, disables Argo pruning/deletion and omits an empty chart class.'),
 source('pkg/volume/util/storageclass.go','40-70','Default-class listing selects newest creation time and ascending name for timestamp ties; no defaults returns nil.'),
 source('pkg/volume/util/storageclass.go','76-85','Stable or beta default annotation is recognized only when its value is exactly true.'),
 source('pkg/controller/volume/persistentvolume/pv_controller.go','967-992','Later class assignment skips classified claims, returns lookup/update errors and assigns an available default to an unclassified claim.'),
 source('plugin/pkg/admission/storage/storageclass/setdefault/admission.go','80-119','DefaultStorageClass skips a specified class, including an explicit empty pointer, and otherwise selects a default if available.'),
 source('pkg/controller/volume/persistentvolume/pv_controller.go','605-630','A missing cached bound claim is checked through lister and API reads before release; non-NotFound errors stop sync.'),
 source('pkg/controller/volume/persistentvolume/pv_controller.go','643-687','UID checks distinguish claim lifetimes; a missing bound claim records Released before reclaim while preserving Failed.'),
 source('pkg/controller/volume/persistentvolume/pv_controller.go','1180-1223','Reclaim dispatches Retain, Recycle and Delete; migrated PVs are left to the external provisioner.'),
 source('pkg/controller/volume/persistentvolume/pv_controller.go','1499-1512','A missing in-tree deleter leaves external deletion to its owner.'),
 provisionerLibrary('1153-1199','PV sync selects the responsible provisioner/driver before deletion reconciliation.'),
 provisionerLibrary('1284-1320','Deletion requires Released/Delete and respects the configured finalizer and deletion guard.'),
 provisionerLibrary('1621-1681','Driver Delete precedes PV deletion and optional finalizer removal; errors and IgnoredError have separate outcomes.'),
 provisionerLibrary('1034-1049','Failed deletion requeue obeys its configured threshold; success forgets the queue counter.'),
 provisioner('pkg/controller/controller.go','1247-1311','CSI Delete resolves the handle and capabilities, obtains secrets, bounds the RPC and checks attachments.'),
 provisioner('pkg/controller/controller.go','1314-1338','Recorded deletion-secret references can yield an empty secret map after a failed fetch; both empty references request no secret.'),
 provisioner('pkg/controller/controller.go','1341-1380','StorageClass fallback can continue without secrets when claim reference, class or credentials are unavailable.'),
 provisioner('pkg/controller/controller.go','1383-1402','A configured VolumeAttachment lister blocks deletion for list errors or matching attachments; nil skips that check.'),
 smb('pkg/smb/controllerserver.go','150-165','SMB deletion validates or treats the handle as absent and locks the volume operation.'),
 smb('pkg/smb/controllerserver.go','185-209','No secrets or Retain bypasses directory work; other policies use a deletion cache and mount the share.'),
 smb('pkg/smb/controllerserver.go','211-234','Archive optionally removes an earlier archive, then renames the source directory; failures propagate.'),
 smb('pkg/smb/controllerserver.go','235-261','Other policies remove the subdirectory; no-action and completion paths return success and cache the handle.'),
];
for(const [key,def] of definitions){
 const kind=key.slice(0,key.indexOf(':')),path=key.slice(key.indexOf(':')+1);
 if(kind==='PersistentVolumeClaim'){
  if(path==='$.spec'||/^\$\.spec\.(dataSource|dataSourceRef|selector|storageClassName|volumeMode|accessModes|volumeAttributesClassName|resources\.requests)/.test(path))qualifies(def,pvcSourceConditions,pvcSourceEvidence);
  if(path==='$.spec.resources'||path.startsWith('$.spec.resources.requests')||path==='$.spec.storageClassName'||path.startsWith('$.status'))qualifies(def,pvcResizeConditions,pvcResizeEvidence);
  if(path==='$.status'||path.startsWith('$.status.conditions')||path.startsWith('$.status.allocated')||path.startsWith('$.status.modifyVolumeStatus')||path==='$.status.currentVolumeAttributesClassName'){
   qualifies(def,['The core resize writer owns Resizing, FileSystemResizePending, ControllerResizeError and NodeResizeError conditions. Its merge leaves unrelated types unchanged and retains the whole old equal-Status condition, including old reason/message/time. Node error messages come from the failed expansion. These helpers do not require a nonempty Reason or lastProbeTime.',
    'The selected external-resizer modification writer keeps conditions unchanged for Pending. Other progress writes ModifyingVolume True with lastProbeTime; an RPC error adds ModifyVolumeError True with gRPC code/message. Completion writes the PV class first, then the PVC current class, clears modifyVolumeStatus and removes both modification condition types. A PVC patch failure after the PV patch leaves a partial observation; inspect both objects.'],pvcConditionEvidence);
   def.qualificationLimits=(def.qualificationLimits??[]).filter(x=>!x.includes('complete condition producers'));
  }
  if(path==='$.spec')def.cases=[...(def.cases??[]),{name:'csi-selector-versus-existing-pv',condition:'A claim with a retained selector has no matching existing PV and enters the selected CSI provisioner.',sourceOutcome:'Dynamic provisioning rejects the nonnil selector; earlier API validity does not establish that a new volume can be created.'},{name:'external-populator-required',condition:'The selected provisioner receives a source kind other than PVC or VolumeSnapshot.',sourceOutcome:'It emits the populator expectation and returns IgnoredError. The selected custom populator, if any, must supply a separate source contract; no population success is inferred.'}];
  if(path==='$.spec.storageClassName')qualifies(def,[pvcReclaimConditions[1]],[source('pkg/volume/util/storageclass.go','40-70','Default-class listing selects newest creation time and ascending name for timestamp ties; no defaults returns nil.'),source('pkg/volume/util/storageclass.go','76-85','Stable or beta default annotation is recognized only when its value is exactly true.'),source('pkg/controller/volume/persistentvolume/pv_controller.go','967-992','Later class assignment skips classified claims, returns lookup/update errors and assigns an available default to an unclassified claim.')]);
  if(path==='$.spec.dataSourceRef')def.cases=[...(def.cases??[]),{name:'cross-namespace-source-denied',condition:'The provisioner feature is enabled, but no source-namespace ReferenceGrant matches the claim From and target To identity.',sourceOutcome:'Source resolution returns the concrete access error before CreateVolume; a core API-accepted reference is not sufficient.'}];
  if(path==='$.status.conditions')def.cases=[...(def.cases??[]),{name:'resize-error-message-with-unchanged-status',condition:'Core MergeResizeConditionOnPVC receives a matching condition type with the same Status and a new error message.',sourceOutcome:'It keeps the old full condition. The newly supplied message/time does not replace it; use current events and driver observations when diagnosing the attempt.'}];
  if(path==='$.spec.resources.requests')def.cases=[...(def.cases??[]),{name:'smb-capacity-is-not-server-quota',condition:'SMB v1.20.0 ControllerExpandVolume receives a nonempty volume ID and capacity range.',sourceOutcome:'It returns the requested capacity without changing SMB quota; this cannot prove increased external storage capacity.'}];
  if(path==='$.spec.volumeAttributesClassName')def.cases=[...(def.cases??[]),{name:'smb-volume-attributes-capability-rejected',condition:'The selected external-provisioner v6.0.0 enables VolumeAttributesClass and receives a nonempty class name for SMB v1.20.0.',sourceOutcome:'It requires MODIFY_VOLUME, which SMB does not advertise, and returns the capability error before CreateVolume. Do not retry this unsupported configuration as a data-recovery operation.'}];
  if(path==='$.spec.dataSource')def.cases=[...(def.cases??[]),{name:'smb-clone-copy-failed-after-partial-write',condition:'The selected SMB PVC-clone route mounts source and destination, then external cp -a fails or the caller loses its RPC response.',sourceOutcome:'A copy error returns Internal without undoing destination writes; a lost response does not stop the non-context-bound copy command. Both mounts use CreateVolume secrets, and deferred unmount failure only logs. Preserve source/destination handles and inspect partial contents and active mounts before a bounded owner-approved retry or replacement; no integrity, backup or rollback proof follows.'}];
  if(path==='$.spec.resources.requests[<exact-key>]')def.cases=[...(def.cases??[]),{name:'non-storage-request-absent-or-zero',condition:'requests.storage is positive and a different request-map key is absent, zero or JSON null on fresh create.',sourceOutcome:'The PVC spec validator checks requests.storage, not that other key. A supplied null retains a zero Quantity entry; that other entry does not fail the storage positivity check. Immutable update rules and typed Quantity syntax remain separate.'}];
  if(path==='$.spec.resources.limits[<exact-key>]')def.cases=[...(def.cases??[]),{name:'limit-zero-is-not-storage-request-zero',condition:'requests.storage is positive and a limit-map key, including storage, is zero or JSON null on fresh create.',sourceOutcome:'The retained zero limit entry does not fail this spec validator: it does not iterate limits or compare them with requests. It does not request storage expansion. Invalid Quantity syntax and immutable update rules remain separate.'}];
  if(path==='$'||path==='$.spec'||path==='$.spec.volumeName'||path==='$.spec.storageClassName'||path==='$.status.phase'||path.startsWith('$.metadata.finalizers')||path==='$.metadata.deletionTimestamp')qualifies(def,pvcReclaimConditions,pvcReclaimEvidence);
  if(path==='$.metadata.finalizers')def.cases=[...(def.cases??[]),
   {name:'pvc-removed-pv-retained',condition:'PVC protection has completed and the bound claim disappears; the actual PV reclaim policy is Retain.',sourceOutcome:'The PV controller records Released after the claim identity checks but performs no reclaim operation. Retain requires the storage owner to decide reuse or recovery; it does not prove backup or data health.'},
   {name:'smb-delete-success-without-directory-deletion',condition:'A Released/Delete CSI PV reaches SMB DeleteVolume with no secrets or effective onDelete Retain.',sourceOutcome:'The driver returns success without deleting the subdirectory. This success also caches the handle; a later call with secrets can be skipped by that cache. The provisioner can then delete the PV and remove its own finalizer. Preserve the handle and inspect server data; API disappearance is not evidence of data erasure.'},
   {name:'smb-archive-or-remove-boundary',condition:'SMB DeleteVolume has secrets and a non-Retain effective policy.',sourceOutcome:'Archive renames into archived-<subdirectory>, optionally deleting an earlier archive first; other policies remove the subdirectory. Failures can leave partial server state. Removed data has no rollback in this driver; stop until independent recovery evidence exists.'},
   {name:'driver-deleted-pv-publication-failed',condition:'The CSI DeleteVolume call succeeds but the subsequent PV DELETE or configured finalizer patch fails.',sourceOutcome:'The library returns the API error and the queue follows its configured failed-delete threshold. Driver work can already be complete and can be called again. Inspect both server state and PV finalizers before retry or manual removal.'}];
 }
}

const endpointConditions=[
 'The pinned EndpointSlice controller skips ExternalName and a nil selector. For a nonnil selector, including {}, it selects Pods in the Service namespace. Core selector validation and actual matching Pods remain distinct: {} can select every Pod in that namespace on this retained typed route.',
 'Endpoint conversion sets Serving from Pod Ready and Terminating from its deletion timestamp. Ready is publishNotReadyAddresses OR (Serving AND NOT Terminating). Publishing not-ready addresses therefore changes downstream ready selection; it is not a Pod-health repair. Service port name/protocol/appProtocol are copied, and targetPort is resolved for each Pod. A missing named target port skips that Service port for that Pod.',
 'Enabled valid trafficDistribution produces zone/node hints only when the topology annotation does not select the older hints path. kube-proxy uses hints only when ready endpoints have the required hints and at least one matches its node/zone; otherwise it falls back. Local traffic policy selects local endpoints separately. A preference is not a guaranteed isolation rule.',
];
const endpointEvidence=[
 source('pkg/controller/endpointslice/endpointslice_controller.go','395-415','EndpointSlice reconciliation skips ExternalName and nil selector, otherwise lists matching Pods in the Service namespace.'),
 source('staging/src/k8s.io/endpointslice/utils.go','38-69','Pod conversion produces Ready/Serving/Terminating conditions and endpoint identity/topology.'),
 source('staging/src/k8s.io/endpointslice/utils.go','76-101','Endpoint ports copy Service name/protocol/appProtocol and skip unresolved target ports.'),
 source('staging/src/k8s.io/endpointslice/utils.go','381-409','FindPort resolves named target ports against regular containers and restartable init containers, or returns the integer target.'),
 source('staging/src/k8s.io/endpointslice/reconciler.go','79-94','Traffic distribution values are considered only with the corresponding reconciler gates.'),
 source('staging/src/k8s.io/endpointslice/reconciler.go','302-348','Topology annotations choose the older hints path ahead of trafficDistribution.'),
 source('pkg/proxy/topology.go','57-81','Cluster endpoint selection prefers ready endpoints with usable hints, then serving terminating fallback if no ready endpoints remain.'),
 source('pkg/proxy/topology.go','99-127','Local endpoint selection uses local ready endpoints, otherwise local serving terminating endpoints.'),
 source('pkg/proxy/topology.go','164-220','Node/zone hints are used only when all ready endpoints carry the needed hints and a matching endpoint exists.'),
];
const proxyConditions=[
 'The pinned kube-proxy ServicePort receiver separates address families, ports, nodePort, session affinity/timeout and internal/external policies. It includes only matching-family external IPs and VIP-mode LoadBalancer ingress IPs; hostname-only or Proxy-mode ingress does not create a VIP rule. appProtocol is copied to EndpointSlice but is not used here to select an application protocol handler.',
 'These dataplane branches apply only to the selected kube-proxy mode. iptables uses recent endpoint rules with the configured ClientIP timeout before random endpoint selection; IPVS uses persistent service flags and that timeout. nftables creates per-endpoint source-IP sets with that timeout, updates them on the endpoint chain and checks them before ordinary endpoint selection. The actual kernel rules, connection tracking and client address seen by the node determine later traffic. An accepted affinity value is not a measured sticky session.',
 'For the iptables route, Local internal/external policy with no usable local endpoint can leave traffic without a local destination even when remote endpoints exist. LoadBalancer source ranges filter VIP traffic through the firewall chain; NodePort traffic is not covered by those VIP source-range rules. For an active registered Service, the health-check handler explicitly writes 200 with nonzero local-ready endpoints and healthy kube-proxy, otherwise 503, with its JSON observations. A missing or nil Service entry instead logs a closed health check and returns before writing that status, body or headers. Check the expected Service identity and response body; an HTTP status alone does not establish healthy service. An external balancer must actually use that health check.',
];
const proxyEvidence=[
 source('pkg/proxy/serviceport.go','175-214','ServicePort extracts addresses/ports/policies/affinity and family-matched source ranges; a zero CIDR means allow any.'),
 source('pkg/proxy/serviceport.go','216-240','ServicePort keeps matching-family VIP ingress IPs and the required health-check node port.'),
 source('pkg/proxy/iptables/proxier.go','938-984','iptables distinguishes Cluster and Local internal/external endpoints and no-local-endpoint cases.'),
 source('pkg/proxy/iptables/proxier.go','1108-1134','VIP source-range handling does not apply to NodePort traffic.'),
 source('pkg/proxy/iptables/proxier.go','1541-1583','iptables emits ClientIP recent-timeout rules before probabilistic endpoint selection.'),
 source('pkg/proxy/ipvs/proxier.go','1043-1047','IPVS sets the persistent flag and configured timeout for ClientIP.'),
 source('pkg/proxy/nftables/proxier.go','1648-1680','nftables constructs per-endpoint source-IP affinity sets with the configured timeout.'),
 source('pkg/proxy/nftables/proxier.go','1719-1727','Endpoint chains update the source-IP affinity set.'),
 source('pkg/proxy/nftables/proxier.go','1857-1879','nftables checks source-IP affinity sets before ordinary endpoint selection.'),
 source('pkg/proxy/healthcheck/service_health.go','225-229','A missing or nil Service health-check entry logs and returns before the status/header/body response path.'),
 source('pkg/proxy/healthcheck/service_health.go','231-243','For an active Service, the handler writes HTTP 200 only for nonzero local endpoints and healthy kube-proxy, otherwise 503.'),
 source('pkg/proxy/healthcheck/service_health.go','244-253','The active-Service health response body names the Service, local endpoint count and kube-proxy health.'),
];
const dnsConditions=[
 'The pinned Kubernetes CoreDNS addon selects CoreDNS v1.13.1. The following DNS results apply to that Kubernetes plugin and its configured zone, cache and options; a different DNS deployment needs its own authority. DNS publication is separate from API address allocation and packet forwarding.',
 'CoreDNS converts EndpointSlices using the service-name label and namespace, retaining ready endpoints (nil Ready is treated as ready). A normal ClusterIP Service returns its cluster addresses. A headless Service or endpoint-specific query returns matching endpoint addresses/ports. ExternalName builds a DNS alias from externalName only for a matching ordinary service query, without port/protocol/endpoint qualifiers; it does not create a proxy destination.',
 'With ignore empty_service enabled, a non-headless/non-ExternalName Service without endpoints can return no service match. In-zone name errors return SERVFAIL before the Kubernetes cache synchronizes, then NXDOMAIN after synchronization unless fallthrough is configured. A DNS answer/cache TTL is not an end-to-end propagation deadline or proof of application reachability.',
];
const dnsEvidence=[
 source('cluster/addons/dns/coredns/coredns.yaml.base','133-140','The pinned addon image selects CoreDNS v1.13.1.'),
 dns('plugin/kubernetes/object/endpoint.go','55-60','EndpointSlice indexing uses service-name label and namespace.'),
 dns('plugin/kubernetes/object/endpoint.go','86-118','DNS endpoint conversion includes ready endpoints and treats nil readiness as ready.'),
 dns('plugin/kubernetes/kubernetes.go','456-483','Optional empty-service handling and ExternalName alias construction use distinct paths.'),
 dns('plugin/kubernetes/kubernetes.go','487-539','Headless/endpoint queries use endpoint addresses; ordinary ClusterIP queries use cluster addresses.'),
 dns('plugin/kubernetes/handler.go','65-76','Name errors can fall through; unsynchronized cache returns SERVFAIL and synchronized missing name returns NXDOMAIN.'),
];
const lbConditions=[
 'The pinned default cloud Service controller handles LoadBalancer only with nil loadBalancerClass; a present class selects another controller. The default controller adds its cleanup finalizer before EnsureLoadBalancer, checks nonnil returned status, then patches the returned loadBalancer observation. A provider ImplementedElsewhere response transfers responsibility and is not provider creation proof.',
 'Cleanup first calls GetLoadBalancer. Only when exists is true does it call EnsureLoadBalancerDeleted; ImplementedElsewhere is ignored on that deletion branch, while other deletion errors stop before finalizer removal. When exists is false or deletion succeeds/is implemented elsewhere, it attempts finalizer removal. Finalizer removal is not evidence of provider resource erasure. A later status patch error can leave provider work complete but observations stale; a non-NotFound error retries. Provider RetryError supplies its delay; other errors use the rate-limited queue. Read provider resources, finalizers and status after an interrupted or partial attempt.',
 'This source qualifies default controller sequencing and the provider interface boundary. Address announcement, assigned hostname/IP, port errors, source-range enforcement and mixed-protocol support are owned by the selected cloud/class implementation. An external address in status cannot by itself prove those effects or authorization.',
];
const lbConsumerEvidence=[
 source('staging/src/k8s.io/cloud-provider/controllers/service/controller.go','862-865','The default controller wants LoadBalancer only when loadBalancerClass is nil.'),
 source('staging/src/k8s.io/cloud-provider/controllers/service/controller.go','374-398','Cleanup checks provider state, calls deletion only when exists is true, tolerates ImplementedElsewhere, and then attempts finalizer removal; this does not prove external erasure.'),
 source('staging/src/k8s.io/cloud-provider/controllers/service/controller.go','403-438','Ensure adds a finalizer before provider work, handles ImplementedElsewhere/nil status and patches returned status with bounded NotFound handling.'),
 source('staging/src/k8s.io/cloud-provider/controllers/service/controller.go','284-304','Provider RetryError uses its requested delay; other errors are rate-limited and success clears retry state.'),
 source('staging/src/k8s.io/cloud-provider/controllers/service/controller.go','977-987','Default status publication patches only the LoadBalancer status and skips unchanged observations.'),
];
for(const [key,def] of definitions){
 const kind=key.slice(0,key.indexOf(':')),path=key.slice(key.indexOf(':')+1);
 if(kind!=='Service')continue;
 if(path.startsWith('$.status.conditions')){
  def.qualificationLimits=(def.qualificationLimits??[]).filter(x=>!x.includes('complete condition producers'));
  def.qualificationLimits.push(...svcLimits);
  qualifies(def,['The default cloud-controller status path changes only status.loadBalancer and leaves status.conditions unchanged. It does not produce a condition transition for these fields. A selected provider/class condition writer must define its type, reason, message, observedGeneration and transition-time rules separately; the status validator is not that writer.'],[source('staging/src/k8s.io/cloud-provider/controllers/service/controller.go','977-987','Default cloud-controller status patch changes only LoadBalancer observations and does not set conditions.')]);
 }
 if(path==='$.spec'||/^\$\.spec\.(selector|ports|type|clusterIP|ipFamilies|publishNotReadyAddresses|trafficDistribution)/.test(path))qualifies(def,endpointConditions,endpointEvidence);
 if(path==='$.spec'||/^\$\.spec\.(type|ports|clusterIP|ipFamilies|externalIPs|sessionAffinity|internalTrafficPolicy|externalTrafficPolicy|healthCheckNodePort|loadBalancerSourceRanges)/.test(path)||path.startsWith('$.status.loadBalancer.ingress'))qualifies(def,proxyConditions,proxyEvidence);
 if(path==='$.spec'||/^\$\.spec\.(type|externalName|clusterIP|ports|publishNotReadyAddresses)/.test(path))qualifies(def,dnsConditions,dnsEvidence);
 if(path==='$.spec'||/^\$\.spec\.(type|loadBalancer|allocateLoadBalancerNodePorts|externalTrafficPolicy|healthCheckNodePort|ports)/.test(path)||path==='$.status'||path.startsWith('$.status.loadBalancer')||path.startsWith('$.status.conditions')||path.startsWith('$.metadata.finalizers'))qualifies(def,lbConditions,lbConsumerEvidence);
 if(path==='$.spec.selector')def.cases=[...(def.cases??[]),{name:'retained-empty-selector-selects-all',condition:'A complete typed Service body retains a nonnil empty selector and the selected EndpointSlice controller handles it.',sourceOutcome:'The nil-selector skip does not apply. The empty selector lists all Pods in the Service namespace; inspect the stored representation and resulting endpoints before relying on this choice.'}];
 if(path==='$.spec.ports')def.cases=[...(def.cases??[]),{name:'named-target-port-unresolved',condition:'A selected Pod lacks the named targetPort with the matching protocol.',sourceOutcome:'Endpoint port construction skips that Service port for that Pod. A valid ServicePort does not prove a backend endpoint port exists.'}];
 if(path==='$.spec.publishNotReadyAddresses')def.cases=[...(def.cases??[]),{name:'unready-pod-published-ready',condition:'publishNotReadyAddresses is true for a Pod selected by the EndpointSlice controller.',sourceOutcome:'Endpoint Ready is true even when the Pod is unready or terminating; Serving/Terminating still record those separate Pod observations.'}];
 if(path==='$.spec.trafficDistribution')def.cases=[...(def.cases??[]),{name:'topology-annotation-precedes-distribution',condition:'The old topology hints annotation is enabled along with a valid enabled trafficDistribution.',sourceOutcome:'The reconciler selects the annotation hint path and does not reconcile the trafficDistribution hints in that pass.'}];
 if(path==='$.spec.externalName')def.cases=[...(def.cases??[]),{name:'dns-alias-without-service-proxy',condition:'The selected CoreDNS plugin receives an ordinary matching query for an ExternalName Service.',sourceOutcome:'It constructs the external DNS alias; the EndpointSlice controller skips the Service and no cluster forwarding destination follows from that alias.'}];
 if(path==='$.spec.healthCheckNodePort')def.cases=[...(def.cases??[]),{name:'closed-service-healthcheck-early-return',condition:'The Service health-check handler receives a request after its Service entry is absent or nil.',sourceOutcome:'It logs the closed health check and returns before writing the active-Service status, body or headers. Do not classify this as the explicit 503 branch or infer readiness from an HTTP status without the expected Service body.'}];
 if(path==='$.spec.sessionAffinityConfig')def.cases=[...(def.cases??[]),{name:'affinity-mode-receiving-boundary',condition:'A ClientIP Service reaches the pinned iptables or IPVS kube-proxy mode.',sourceOutcome:'iptables emits recent rules with the configured timeout; IPVS sets a persistent service with that timeout. Neither source check proves the actual repeated client requests or kernel state.'}];
 if(path==='$.status.loadBalancer')def.cases=[...(def.cases??[]),{name:'provider-completed-status-publication-failed',condition:'Provider EnsureLoadBalancer succeeds but the later non-NotFound status patch fails.',sourceOutcome:'The controller returns an error for retry. Actual provider resources can exist while API status remains stale; inspect both before recovery.'}];
 if(path==='$.status.loadBalancer.ingress[].ipMode')def.cases=[...(def.cases??[]),{name:'proxy-mode-is-not-a-vip-rule',condition:'An ingress IP has ipMode Proxy rather than VIP.',sourceOutcome:'The kube-proxy ServicePort receiver excludes it from LoadBalancer VIP rules; provider forwarding remains a separate implementation.'}];
}

for(const [key,def] of definitions){
 const kind=key.slice(0,key.indexOf(':')),path=key.slice(key.indexOf(':')+1);
 if(path.startsWith('$.metadata.managedFields[].')){
  const route='At direct fresh entry decode/validation, '+def.omitted+' On a complete non-apply request, field management can fall back to live ownership or ignore request entries on a subresource before validation; this child is not an independent ownership instruction.';
  def.omitted=route;
  def.emptyValue='At direct fresh entry decode/validation, '+def.emptyValue+' Non-apply field management can replace authored entries with live ownership before this check; a subresource uses live entries. The effective returned ownership must be read.';
 }
 if(kind==='PersistentVolumeClaim'&&path==='$.spec.resources.requests[<exact-key>]')def.crossFieldConditions.push('The sizing/provisioning/resize consumers above read the exact storage key. These size effects do not apply to a different request-map key. The PVC spec validator still requires requests.storage.');
 if(['$.metadata.generation','$.metadata.selfLink','$.metadata.deletionTimestamp','$.metadata.deletionGracePeriodSeconds'].includes(path)){
  def.qualificationLimits=(def.qualificationLimits??[]).filter(x=>!x.includes('generic store lifecycle initialization'));
  def.evidence.push(source('staging/src/k8s.io/apiserver/pkg/endpoints/handlers/create.go','164-175','Create wipes client system metadata before store initialization.'),source('staging/src/k8s.io/apiserver/pkg/registry/rest/meta.go','29-42','System wiping clears lifecycle fields/selfLink and store initialization supplies creation time/UID.'));
 }
 if(path==='$.metadata.generation')def.invalidValue='Incompatible or overflowing int64 tokens fail typed decode. A retained negative create generation fails common validation; BeforeUpdate replaces authored generation with the stored value before strategy/validation.';
 if(path==='$.metadata.deletionTimestamp')def.invalidValue='Malformed Time fails typed decoding. Create wipes a decoded time. Replacement restores an existing nonzero stored deletion time; a different effective value that survives preparation fails immutable validation. Use DELETE to request deletion.';
 if(path==='$.metadata.deletionGracePeriodSeconds')def.invalidValue='Incompatible or overflowing integer tokens fail typed decode. Create wipes this field. Replacement fills an absent pointer from old grace; a different effective supplied pointer is rejected by immutable validation. DELETE uses its separate DeleteOptions.';
 if(kind==='ConfigMap'&&(path.startsWith('$.data')||path.startsWith('$.binaryData')||path==='$.immutable')){
  qualifies(def,['ConfigMap manager Get performs an API GET for each read. Cache uses a one-minute default TTL with a Node TTL override; first/new Pod references add a cache reference, and removing the last reference drops the item. Watch supplies a local list/watch result and stops watching after observing immutable:true. No manager changes an application environment or guarantees a refresh deadline.',
   'Projected ConfigMap volumes also fetch in the Pod namespace, allow optional NotFound and use ConfigMap MakePayload. Payload contains both text and binary bags for an unfiltered mount; selected absent keys fail unless optional. Publication and application reads remain separate.'],[
   source('pkg/kubelet/configmap/configmap_manager.go','65-67','Get manager performs a direct namespace-local ConfigMap GET.'),
   source('pkg/kubelet/configmap/configmap_manager.go','111-131','Caching ConfigMap manager uses one-minute default TTL and the supplied Node TTL function.'),
   source('pkg/kubelet/util/manager/cache_based_manager.go','132-154','Cache TTL can come from the Node TTL annotation.'),
   source('pkg/kubelet/util/manager/cache_based_manager.go','223-251','Pod registration adds references only for a new Pod or newly referenced objects.'),
   source('pkg/kubelet/util/manager/cache_based_manager.go','117-128','Removing the last reference removes the cache item.'),
   source('pkg/kubelet/util/manager/watch_based_manager.go','338-358','A watch-cache read stops watching after observing an immutable object.'),
   source('pkg/volume/projected/projected.go','286-313','Projected ConfigMap fetch handles optional NotFound and delegates payload construction to ConfigMap MakePayload.'),
   source('pkg/volume/configmap/configmap.go','263-304','Payload projection reads both data bags or named item mappings; missing nonoptional keys fail.'),
  ]);
  def.qualificationLimits=(def.qualificationLimits??[]).filter(x=>!x.includes('ConfigMap manager cache/watch'));
  if(path==='$.immutable')def.cases=[...(def.cases??[]),{name:'immutable-watch-stops',condition:'The watch-based manager observes immutable:true.',sourceOutcome:'It stops watching that cache item. Changed data needs a new ConfigMap lifetime/reference and consumer verification; metadata edit acceptance is not resumed data tracking.'}];
 }
 if(kind==='PersistentVolumeClaim'&&(path==='$.spec'||path==='$.spec.volumeName'||path==='$.spec.accessModes'||path==='$.spec.volumeMode'||path==='$.status.phase'))qualifies(def,[
  'After Bound/PV UID checks, CSI attach/mount is another receiving route. CSIDriver attachRequired:false skips attach; otherwise the controller creates/observes VolumeAttachment and Kubelet checks attachment. NodeStage runs only if the driver advertises STAGE_UNSTAGE_VOLUME; NodePublish receives read-only intent, mode, mount options and secrets. An RPC error can be uncertain, and an error after successful publication can leave the volume mounted.',
  'SMB v1.20.0 NodeStage requires handle, capability, staging target and a source in volume context. It reads source/subDir and claim/PV metadata substitutions, uses a lock keyed by handle plus staging target, and resolves credentials from case-insensitive secret keys with trimmed username/password/domain. Guest mount options bypass username/password options. Persistent staging uses the supplied node-stage secrets; the separately identified ephemeral branch can fetch its configured Secret. Linux can use a Kerberos cache, create the staging directory and add the requested mount group when no gid flag is present; Windows uses its domain/username option path. Credential/cache/directory errors can stop before mounting and can leave local preparation artifacts.',
  'SMB checks the actual staging mount point before work. An already-mounted readable target skips a new SMB mount. An unreadable existing target can be unmounted and still return its read error; inspect the actual target before retry. For a new mount it substitutes subDir metadata and calls Mount with the source, options and sensitive credentials through a 110-second WaitUntilTimeout wrapper. That wrapper returns the mount error or timeout without cancelling its mount goroutine. Inference from that wrapper and the deferred staging-lock release: timeout can leave mount work running after this call releases its lock. A failed staging response is not proof that the share is unmounted; retain handle/target and investigate current mounts and driver work before repeating it.',
  'For SMB v1.20.0, persistent NodePublish binds the staging path to the container target, adding ro when requested. It can return success for an already-mounted target. Access to the actual SMB share, credentials, server data and application read/write checks remain necessary; Bound or successful mount is not a backup/restore proof.',
 ],[source('pkg/volume/csi/csi_plugin.go','858-874','CSI attach can be skipped only through a CSIDriver attachRequired:false result; missing driver or lookup failure follows its explicit path.'),source('pkg/volume/csi/csi_attacher.go','107-132','Attach creates the VolumeAttachment and waits for its observed attachment result.'),source('pkg/volume/csi/csi_attacher.go','353-406','Node staging is conditional on capability and returns RPC errors with finished-operation cleanup.'),source('pkg/volume/csi/csi_mounter.go','300-329','NodePublish receives the resolved volume inputs; RPC errors propagate and a post-publication SELinux check can return uncertain progress.'),smb('pkg/smb/nodeserver.go','137-157','SMB staging validates identity/capability/target and reads context, mount flags, group and secrets.'),smb('pkg/smb/nodeserver.go','159-193','SMB resolves source/subdirectory metadata and holds a handle-plus-target lock.'),smb('pkg/smb/nodeserver.go','195-219','SMB trims credential values, recognizes guest mounts and fetches a Secret only for its ephemeral branch.'),smb('pkg/smb/nodeserver.go','222-261','Platform-specific staging sets Windows credentials or Linux Kerberos/directory/group/domain options.'),smb('pkg/smb/nodeserver.go','267-296','Readable existing staging can skip mounting; a new mount substitutes subDir metadata and returns mount/timeout errors.'),smb('pkg/smb/nodeserver.go','43','The SMB mount wait is configured for 110 seconds.'),smb('pkg/util/util.go','40-57','WaitUntilTimeout returns on its timer or goroutine result; it does not cancel the in-progress mount function.'),smb('pkg/smb/nodeserver.go','463-477','An existing readable mount is accepted; a failed directory read can unmount the target and still return that read error.'),smb('pkg/smb/nodeserver.go','589-610','Kerberos staging can write/chown a cache before a later symlink operation fails.'),smb('pkg/smb/nodeserver.go','75-106','Persistent SMB NodePublish binds the staging path with optional ro, handles an already mounted target and reports mount/cleanup errors.')]);
 if(kind==='PersistentVolumeClaim'&&path==='$.spec.volumeName')def.cases=[...(def.cases??[]),
  {name:'smb-stage-timeout-with-uncertain-mount',condition:'Selected SMB v1.20.0 staging exceeds its 110-second wait.',sourceOutcome:'The wrapper returns a timeout without cancelling the mount goroutine. The deferred handle-plus-target lock is released by the returned staging call, so ongoing mount work and current target state require inspection before retry. NodePublish is a separate step; neither rollback nor an unmounted target is proved.'},
  {name:'smb-stage-existing-target',condition:'The selected SMB stage path is already considered mounted.',sourceOutcome:'A successful directory read permits skipping a new share mount. A read failure can unmount the target and return that same error. Read the current mount and server/application data before deciding recovery; an already-mounted result is not a content-integrity proof.'}];
 if(kind==='PersistentVolumeClaim'&&(path.startsWith('$.metadata.finalizers')||path==='$.metadata.deletionTimestamp'))qualifies(def,[
  'The PVC protection controller removes kubernetes.io/pvc-protection only from a deletion candidate not used by a qualifying scheduled Pod. It first checks the informer, then a live Pod list cached for the current batch. Listing or update errors retain the finalizer and retry; removing protection does not execute PV reclaim or server data deletion.',
 ],[source('pkg/controller/volume/pvcprotection/pvc_protection_controller.go','257-275','Protection checks use before removing its finalizer; an older non-deleting PVC can gain the token.'),source('pkg/controller/volume/pvcprotection/pvc_protection_controller.go','306-326','Protection first uses informer evidence and falls back to a per-batch cached live Pod list.'),source('pkg/controller/volume/pvcprotection/pvc_protection_controller.go','382-395','Protection counts qualifying scheduled Pod claim or matching ephemeral claim references.')]);
 if(kind==='PersistentVolumeClaim'&&path.startsWith('$.status.conditions'))qualifies(def,[
  'The selected external-resizer MergePVCConditions differs from the core resize helper: it changes lastTransitionTime when Reason or Status changes, otherwise preserves it, and initializes a new condition transition from lastProbeTime. Do not apply the core equal-Status rule to this external modification writer.',
 ],[resizer('pkg/util/util.go','93-129','External modification condition merge uses Reason/Status changes to select a new transition time and preserves the old time otherwise.')]);
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
// Each named target is classified from its pinned Go declaration. Unknown names
// must stop authoring; they must not silently inherit value-struct null behavior.
const namedGoTypes = {
 "ClaimResourceStatus": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",681]]},
 "ClientIPConfig": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",5703]]},
 "ConditionStatus": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",3244],["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",1509]]},
 "ConfigMap": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",8016]]},
 "FieldsV1": {"underlying":"struct","declarations":[["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",1399]]},
 "FinalizerName": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",7007]]},
 "IPFamily": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",5874]]},
 "IPFamilyPolicy": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",5887]]},
 "LabelSelectorOperator": {"underlying":"string","declarations":[["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",1302]]},
 "LabelSelectorRequirement": {"underlying":"struct","declarations":[["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",1286]]},
 "LoadBalancerIPMode": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",8425]]},
 "LoadBalancerIngress": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",5844]]},
 "LoadBalancerStatus": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",5834]]},
 "ManagedFieldsEntry": {"underlying":"struct","declarations":[["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",1340]]},
 "ManagedFieldsOperationType": {"underlying":"string","declarations":[["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",1380]]},
 "ModifyVolumeStatus": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",718]]},
 "Namespace": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",7098]]},
 "NamespaceCondition": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",7074]]},
 "NamespaceConditionType": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",7057]]},
 "NamespacePhase": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",7041]]},
 "NamespaceSpec": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",7016]]},
 "NamespaceStatus": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",7025]]},
 "OwnerReference": {"underlying":"struct","declarations":[["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",295]]},
 "PersistentVolumeAccessMode": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",855]]},
 "PersistentVolumeClaim": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",516]]},
 "PersistentVolumeClaimCondition": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",735]]},
 "PersistentVolumeClaimConditionType": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",657]]},
 "PersistentVolumeClaimModifyVolumeStatus": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",704]]},
 "PersistentVolumeClaimPhase": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",889]]},
 "PersistentVolumeClaimSpec": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",552]]},
 "PersistentVolumeClaimStatus": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",760]]},
 "PersistentVolumeMode": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",468]]},
 "PortStatus": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",8403]]},
 "Protocol": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",1241]]},
 "ResourceList": {"underlying":"map[ResourceName]resource.Quantity","declarations":[["staging/src/k8s.io/api/core/v1/types.go",6962]]},
 "ResourceName": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",6934]]},
 "Service": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",6234]]},
 "ServiceAffinity": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",5683]]},
 "ServiceExternalTrafficPolicy": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",5760]]},
 "ServiceInternalTrafficPolicy": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",5738]]},
 "ServicePort": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",6166]]},
 "ServiceSpec": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",5916]]},
 "ServiceStatus": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",5819]]},
 "ServiceType": {"underlying":"string","declarations":[["staging/src/k8s.io/api/core/v1/types.go",5713]]},
 "SessionAffinityConfig": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",5696]]},
 "TypedLocalObjectReference": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",7466]]},
 "TypedObjectReference": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",630]]},
 "VolumeResourceRequirements": {"underlying":"struct","declarations":[["staging/src/k8s.io/api/core/v1/types.go",2860]]},
 "metav1.Condition": {"underlying":"struct","declarations":[["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",1589]]},
 "metav1.LabelSelector": {"underlying":"struct","declarations":[["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",1272]]},
 "metav1.ObjectMeta": {"underlying":"struct","declarations":[["staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go",111]]},
 "types.UID": {"underlying":"string","declarations":[["staging/src/k8s.io/apimachinery/pkg/types/uid.go",22]]},
};
function goTypeShape(type,seen=new Set()) {
 if(type.startsWith('*'))return {kind:'pointer',element:goTypeShape(type.slice(1),seen)};
 if(type.startsWith('[]'))return {kind:'slice',element:goTypeShape(type.slice(2),seen)};
 if(type.startsWith('map[')){
  const end=type.indexOf(']');return {kind:'map',key:goTypeShape(type.slice(4,end),seen),element:goTypeShape(type.slice(end+1),seen)};
 }
 if(['string','bool','int32','int64','byte'].includes(type))return {kind:type==='string'?'string':type==='bool'?'bool':'integer'};
 if(['resource.Quantity','intstr.IntOrString','Time','metav1.Time'].includes(type))return {kind:'custom',type};
 const named=namedGoTypes[type];if(!named)throw Error(`CORE_GO_TYPE_SHAPE_GAP: ${type}`);
 if(seen.has(type))throw Error(`CORE_GO_TYPE_ALIAS_CYCLE: ${type}`);
 if(named.underlying==='struct')return {kind:'struct'};
 const next=new Set(seen);next.add(type);return goTypeShape(named.underlying,next);
}
function goTypeDeclarationEvidence(type,file,seen=new Set()){
 if(type.startsWith('*'))return goTypeDeclarationEvidence(type.slice(1),file,seen);
 if(type.startsWith('[]'))return goTypeDeclarationEvidence(type.slice(2),file,seen);
 if(type.startsWith('map[')){
  const end=type.indexOf(']');return [...goTypeDeclarationEvidence(type.slice(4,end),file,seen),...goTypeDeclarationEvidence(type.slice(end+1),file,seen)];
 }
 const named=namedGoTypes[type];if(!named||seen.has(type))return [];
 const next=new Set(seen);next.add(type);
 const relevant=named.declarations.filter(([path])=>path===file);const declarations=relevant.length?relevant:named.declarations;
 return [...declarations.map(([path,line])=>source(path,line,`Pinned Go type ${type} has underlying ${named.underlying}; named-type and container resolution uses this declaration.`)),...(named.underlying==='struct'?[]:goTypeDeclarationEvidence(named.underlying,file,next))];
}
function normalize(path){return path.replaceAll('["*"]','[<exact-key>]');}
function freshNull(type,def,path){
 const shape=goTypeShape(type);
 if(shape.kind==='pointer')return `JSON null leaves the optional ${type} pointer nil on a fresh typed object. ${def.omitted}`;
 if(type==='resource.Quantity')return `The Quantity custom decoder accepts JSON null and produces zero Quantity. The retained exact-key entry remains present. ${def.emptyValue}`;
 if(type==='intstr.IntOrString')return `The custom IntOrString decoder takes the integer branch for JSON null; fresh IntVal stays zero. Service defaulting then copies the service port into targetPort.`;
 if(type==='metav1.Time'||type==='Time')return `The Time custom decoder accepts null and resets its value to zero time. An empty string is different: RFC3339 parsing rejects it. ${def.omitted}`;
 if(shape.kind==='map')return `JSON null makes this map nil on fresh typed decode. ${def.omitted}`;
 if(shape.kind==='slice')return `JSON null makes this slice nil on fresh typed decode. ${path.endsWith('[<exact-key>]')?`The enclosing map keeps this exact key with a nil byte-slice value. ${def.emptyValue}`:def.omitted}`;
 if(shape.kind==='bool')return `JSON null does not change the fresh non-pointer Boolean; it remains false. ${def.omitted}`;
 if(shape.kind==='string')return `JSON null leaves the fresh scalar string at "". ${path.endsWith('[<exact-key>]')?'The exact map entry is retained with that empty string. ':path.endsWith('[]')?'The retained scalar list item remains an empty string; it is not an empty list or removed item. ':''}${def.emptyValue}`;
 if(shape.kind==='integer')return `JSON null leaves the fresh non-pointer integer at 0. ${def.emptyValue}`;
 if(shape.kind!=='struct')throw Error(`CORE_GO_NULL_CONTRACT_GAP: ${type}`);
 return `JSON null leaves this fresh value struct at its zero value, equivalent to an empty object before defaults and preparation. ${def.omitted}`;
}
for(const kind of kinds){
 for(const boundary of apiResourceFieldBoundaries('v1',kind)){
  const fieldPath=normalize(boundary.fieldPath);const key=`${kind}:${fieldPath}`;const def=definitions.get(key);
  if(!def)throw Error(`CORE_RECEIVER_AUTHORING_GAP: ${key}`);
  const declaration=declarations[kind][fieldPath];if(!declaration)throw Error(`CORE_GO_DECLARATION_GAP: ${key}`);
  const [type,file,line]=declaration;goTypeShape(type);const nullValue=def.nullValue??freshNull(type,def,fieldPath);
  const declarationClaim=type==='resource.Quantity'?`The parent field for ${kind} receiving boundary ${fieldPath} declares ResourceList. Its exact-key element type is established by the ResourceList alias, not by this parent declaration alone.`:`The ${kind} receiving boundary ${fieldPath} declares Go type ${type}; this determines fresh typed scalar/item/map/pointer decoding.`;
  const evidence=[...def.evidence,...(def.evidence??[]),source(file,line,declarationClaim),...goTypeDeclarationEvidence(type,file),...decoder,...routes[kind]];
  if(type==='resource.Quantity')evidence.push(source('staging/src/k8s.io/api/core/v1/types.go','6962','ResourceList is map[ResourceName]resource.Quantity; each retained exact-key value uses Quantity decoding.'),source('staging/src/k8s.io/apimachinery/pkg/api/resource/quantity.go','730-751','Quantity custom decoding accepts null as zero and parses quoted/unquoted quantity tokens; an empty string is not valid quantity syntax.'));
  if(['metav1.Time','*metav1.Time','Time','*Time'].includes(type))evidence.push(source('staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/time.go','99-119','An addressable Time value uses custom decoding: null becomes zero time; all strings, including empty, must parse as RFC3339. A nil optional pointer is preserved for null by pointer dispatch.'));
  const changeImpact=def.changeImpact??`A permitted update changes this stored ${kind} field subject to the stated strategy and cross-field checks. ${recovery}`;
  records.set(key,{kind,fieldPath,purpose:def.purpose,receiver:`Kubernetes core/v1 typed decoder, ${kind} defaults/preparation/validation and the explicitly named consumer`,operationScope:scope,omitted:def.omitted,nullValue,emptyValue:def.emptyValue,invalidValue:def.invalidValue,changeImpact,crossFieldConditions:def.crossFieldConditions??[],cases:[{name:'omitted-at-fresh-create',condition:`${fieldPath} is absent within a present immediate parent in a fresh typed ${kind}.`,sourceOutcome:def.omitted},{name:'explicit-null-at-typed-boundary',condition:`${fieldPath} is JSON null within a present parent; this is not a patch deletion token.`,sourceOutcome:nullValue},{name:'explicit-empty-or-zero',condition:'The exact empty or zero value described for this boundary is supplied.',sourceOutcome:def.emptyValue},{name:'invalid-value-or-combination',condition:'The stated invalid token, value or cross-field condition reaches its receiving decoder or validator.',sourceOutcome:def.invalidValue},{name:'change-and-recovery',condition:'An operator updates, restores or retries this field.',sourceOutcome:changeImpact},...(def.cases??[])],evidence:[...new Map(evidence.map(e=>[`${e.url}:${e.claim}`,e])).values()],qualificationLimits:[...limits,...(def.qualificationLimits??[])]});
 }
}
// A complete export is an authoring result, not documentation acceptance.
for (const record of records.values()) {
 if (record.kind === 'PersistentVolumeClaim' && (record.fieldPath === '$'
   || record.fieldPath === '$.spec' || record.fieldPath === '$.spec.volumeName'
   || record.fieldPath === '$.spec.storageClassName' || record.fieldPath === '$.status.phase'
   || record.fieldPath.startsWith('$.metadata.finalizers') || record.fieldPath === '$.metadata.deletionTimestamp')) {
  record.readerReferences = [{label:'PVC reclamation, selected driver effects and retained-data diagnosis',
   target:'configuration-change-impact.md#pvc-reclamation-and-retained-data'}];
 }
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
for (const record of records.values()) {
 if (record.kind === 'Service') record.readerReferences = [...(record.readerReferences ?? []), {label:'Selected product Service routes, external prerequisites and read-only diagnosis', target:'service-routing.md'}];
}
export const receiverContracts=[...records.values()];
