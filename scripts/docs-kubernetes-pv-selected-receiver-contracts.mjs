/** Selected existing-PV retirement PATCH only; no PV creation contract. */
const revision = '66452049f3d692768c39c797b21b793dce80314e';
const productRevision = '8ef721ea0f41e4666a50740caa0616819306e97e';
const source = (path, lines, claim) => ({
  url: `https://github.com/kubernetes/kubernetes/blob/${revision}/${path}#L${String(lines).replace('-', '-L')}`, claim,
});
const producer = (lines, claim) => ({
  url: `https://github.com/datrab/kubeclaw/blob/${productRevision}/scripts/remove-qdrant.sh#L${String(lines).replace('-', '-L')}`, claim,
});
const patch = (lines, claim) => source('vendor/gopkg.in/evanphx/json-patch.v4/patch.go', lines, claim);
const handler = (lines, claim) => source('staging/src/k8s.io/apiserver/pkg/endpoints/handlers/patch.go', lines, claim);
const controller = (lines, claim) => source('pkg/controller/volume/persistentvolume/pv_controller.go', lines, claim);
const types = (lines, claim) => source('staging/src/k8s.io/api/core/v1/types.go', lines, claim);
const paths = ['$', '$.spec', '$.spec.claimRef', '$.spec.claimRef.name', '$.spec.claimRef.namespace', '$.spec.claimRef.uid', '$.spec.persistentVolumeReclaimPolicy'];
const operationScope = 'scripts/remove-qdrant.sh updates an existing PersistentVolume (PV), the cluster-wide record of a storage volume. A PersistentVolumeClaim (PVC) is a namespaced request to use that volume; claimRef records the referenced claim. Its UID identifies one lifetime of that claim. The script sends a core/v1 PATCH request with content type application/json-patch+json. JSON Patch is an ordered array of operations on the current object. Three test operations act as guards: each compares the current claimRef namespace, name or UID with the captured value. The final add operation sets persistentVolumeReclaimPolicy to Delete. The API server first converts its existing PV object to JSON; this conversion can omit empty fields, including empty strings and a missing claim reference. The cases below describe that JSON at the time the patch runs. They do not assert that malformed PVs can be stored. After applying the patch, the server converts the complete JSON result to a PV object with declared field types. Server admission rules can change or reject the update, and update validation checks the complete object. This request is not a new PV or a replacement spec; the absent, null and empty cases are not defaults for PV creation.';
const recovery = 'After an uncertain response, stop and read the current PV and PVC identities, claimRef, reclaim policy, deletion state and controller events before another write. Preserve the original inventory and storage handle, the identifier used to locate the backing volume. A failed response or wait timeout does not establish whether the policy was stored, the PVC was deleted or storage deletion started. The storage owner must inspect the storage component responsible for volume creation or deletion (the provisioner) and the backing storage system (the backend) before a retry or recovery.';
const conditions = [
  'Run the retirement procedure only after the required export and retention decision. The script requires --delete-data, KUBE_CONTEXT, python3, helm and kubectl. The authenticated operator needs cluster-scoped PV get/list/watch/patch and namespaced PVC get/list/watch/delete access, plus workload/Secret deletion and dependent-workload/release-record observation rights. Verify the complete permissions with the owning authority through the retirement procedure; the kubeclaw namespace does not limit PV authority.',
  'The script inventories kubeclaw PVCs with either of the two known Qdrant storage names or the selected Qdrant labels. Each selected PVC supplies its metadata name, UID and spec.volumeName. No bound volume name means no PV patch and no PV wait for that claim.',
  'Cilium policy deletion runs only when the script discovery pipeline succeeds and finds its API. A failed discovery inside the if condition can skip that deletion, continue later PV/PVC writes and still return exit zero. Review captured stderr and read back named policy and original storage identities after invocation; keep cleanup unresolved and stop further operator writes until the owners reconcile the result.',
  'Before uninstalling the Qdrant Helm release, the script reads each named PV and compares all three claimRef values. It then uninstalls that Helm release and removes the named remaining resources before sending each guarded PV patch. An earlier failure can leave some retirement steps complete. The later API tests check the reference again on the object used by the patch.',
  'The test operations do not change claimRef. They must all succeed before add runs. The script does not test the PV metadata UID, resourceVersion (the API object version) or prior reclaim policy. Matching claimRef protects the selected PVC reference, not every concurrent PV change or every object with a reused PV name. The later PVC deletion uses the captured name without a UID precondition. Keep the retirement window free of replacement or rebinding and stop if current identities differ.',
  'JSON Patch add replaces an existing object member or adds an absent member under an existing parent. It does not create a missing spec parent. The selected operation always writes Delete, including when the prior policy is absent, null or empty; omission of a patch operation would retain the prior member at patch application.',
  'A stored Delete policy is destructive intent. The script next deletes the selected PVC and waits up to 180 seconds for its deletion, then waits up to 180 seconds for PV API deletion. PVC protection can delay removal of a claim that is still in use. PV finalizers are object entries that delay API removal until required cleanup completes. A storage driver connects Kubernetes to the backing storage system. These protections, server admission rules, controller availability, storage-driver deletion support and access to the backing storage system (the backend) can delay or prevent completion. The patch response alone proves no controller or backend result.',
  'The PV controller repeatedly compares current state with the requested state; this is reconciliation. No claim reference (nil in the controller), a reference with an empty UID, and a reference to an existing matching claim take different paths. A PV is released from its bound claim when that claim is gone or its lifetime no longer matches. The controller can then mark the PV Released and begin the action selected by its reclaim policy. Delete schedules storage deletion separately from the patch. If an annotation marks the volume as migrated, deletion responsibility has moved from a storage plugin inside Kubernetes to a separate provisioner, the storage component responsible for creating or deleting backing volumes. The PV controller leaves deletion to that provisioner.',
  'When a storage plugin inside Kubernetes handles deletion, the PV controller reads the current PV and rechecks whether it is released before calling the plugin. Plugin errors can record VolumeFailedDelete or a volume-in-use event. The controller retries deletion during later reconciliation. If a separate storage component handles deletion, that component remains responsible for its backend. Successful backend deletion can precede a failure to remove the finalizer or PV API object. Do not force-remove finalizers to hide this uncertainty.',
  'Neither PV API absence nor the script completion message independently proves that all backend files, snapshots, replicas, exports or backups are erased. Verify the selected driver and backend with the storage owner. Changing the policy back cannot recover data already removed.',
  'The producer comment states that PVC deletion alone can leave retained PVs and data. Inference: guarded Delete connects explicit data retirement to the selected claim lifetime. It adds an irreversible storage effect and depends on the component that deletes storage; reassess it if storage ownership or retention requirements change.',
  recovery,
];
const evidence = [
  producer('6-14', 'The script requires explicit data deletion and context selection and checks its three tools.'),
  producer('18-43', 'Selected PVC names or labels supply name, UID and volumeName; each named PV must match the captured namespace/name/UID before the Helm release is uninstalled.'),
  producer('46-55', 'The script uninstalls the Qdrant Helm release and removes named workload/access resources before the later PV patch loop.'),
  producer('57-77', 'The producer sends three ordered test guards followed by add Delete, then deletes the PVC by name and waits for PV API deletion.'),
  handler('323-340', 'The JSON patch mechanism encodes the current object, applies the patch and decodes the complete result into a typed object.'),
  handler('372-378', 'JSON patch updates the record of which client manages fields and returns NotFound rather than creating a missing target.'),
  handler('403-417', 'Malformed patch decoding returns BadRequest; JSON patch application failure returns HTTP 422 before producing an update object.'),
  handler('691-705', 'The server applies the patch, runs admission rules that can change it and removes duplicate owner references before the API storage update.'),
  patch('342-381', 'Following a nested JSON path requires an existing parent object or array that the library can read.'),
  patch('383-395', 'Object-member add assigns the member even when it already exists.'),
  patch('524-541', 'Add rejects a missing parent and assigns the supplied value to the selected member.'),
  patch('182-198', 'Scalar test equality compares compact JSON values without converting incompatible values to strings.'),
  patch('653-702', 'Test resolves its target and compares JSON values; a missing target cannot satisfy these non-null selected string expectations.'),
  patch('807-838', 'Operations execute in array order and the first error returns no patched result.'),
  source('pkg/registry/core/persistentvolume/strategy.go', '49-51', 'PersistentVolume is cluster scoped.'),
  source('pkg/registry/core/persistentvolume/strategy.go', '92-94', 'PV update cannot create a missing volume.'),
  source('pkg/registry/core/persistentvolume/strategy.go', '96-110', 'Update preparation preserves old status and drops disabled spec fields; validation checks the complete new PV and update constraints.'),
  source('pkg/apis/core/validation/validation.go', '2015-2025', 'For the selected complete PV spec, validation checks membership in the supported policy set when the policy is nonempty.'),
  source('pkg/apis/core/validation/validation.go', '1942-1945', 'The supported reclaim-policy set includes Delete.'),
  source('pkg/apis/core/validation/validation.go', '2262-2306', 'PV update validates metadata and spec and keeps volume source and volume mode immutable under the shown update rules.'),
  controller('576-602', 'No claim reference (nil) and an empty UID take unused or reserved paths rather than deletion after claim release.'),
  controller('642-689', 'Reconciliation checks a different claim UID against the API, treats a missing old claim as released and invokes reclamation.'),
  controller('1178-1215', 'The migration annotation transfers deletion responsibility to a separate provisioner; Delete schedules a separate deletion operation for other volumes.'),
  controller('1321-1389', 'Deletion rereads the PV and checks release; errors, external deletion, retry and a later PV API deletion failure are separate outcomes.'),
  controller('1392-1437', 'The deletion release check requires a nonnil claimRef and nonempty UID and checks the matching claim and its bound PV.'),
  controller('1495-1540', 'A storage plugin inside Kubernetes performs backend deletion; a separate storage component handles external deletion. Finalizer removal can fail after storage deletion.'),
];
const limits = [
  'These are pinned source expectations for Kubernetes v1.35.0 and the selected producer. No live API request, authorization check, admission-rule execution, controller reconciliation, storage-driver operation, storage erasure or recovery has been executed as evidence here.',
  'The published API schema describes complete PV field shapes. It does not turn this partial JSON Patch into a CREATE body, add unselected required siblings, or establish the stored cluster state. Full PV provisioning choices remain in the upstream reference.',
  'The target cluster can have different admission rules, controller settings, enabled Kubernetes features or storage drivers. The operator and storage owner must check the served version, live identities, finalizers and actual backend before destructive retirement. This contract does not select or qualify a particular former Qdrant PV driver.',
  'The recorded wait is a client observation limit. It is not a storage deletion deadline or a promise of data recovery. A driver-specific deletion and audit check is required before reporting backend erasure.',
];
const definitions = {
  '$': {
    purpose: 'Set the existing volume selected from a former Qdrant PVC to Delete after checking its claim reference. This permits storage deletion after the bound claim is released.',
    omitted: 'No PATCH request means no policy change. A missing named PV returns NotFound; JSON Patch does not create it.',
    nullValue: 'A null PV target cannot satisfy the nested selected guards. JSON null as the operation-array body is not the four-operation retirement request and supplies no selected Delete operation.',
    emptyValue: 'An empty operation array supplies no Delete operation. An empty current object lacks the nested guard paths and fails. An object body {} is not the required JSON Patch array.',
    invalidValue: 'Malformed JSON or an incompatible operation-array shape fails patch decoding. A guard failure returns HTTP 422 from patch application. Conversion to declared PV field types, admission rules and complete-PV update checks can reject a result after the guards pass.',
    changeImpact: `The patch changes only the requested policy member before admission rules and API-server update preparation run. The script uninstalls the Qdrant Helm release and removes the named resources before it sends the patch. It then deletes the PVC. The PV controller handles the resulting release of the bound volume and storage deletion separately; storage deletion is not guaranteed. ${recovery}`,
    evidence: [types('366-385', 'The PV resource has TypeMeta, ObjectMeta, spec and status; this is the existing target, not the JSON Patch request body.')],
  },
  '$.spec': {
    purpose: 'Traverse the stored volume specification to reach its claim reference and reclaim policy.',
    omitted: 'The producer does not replace or supply spec. If the current spec is absent, the first nested guard fails; the patch does not create that parent object.',
    nullValue: 'A null current spec supplies no child container and fails the selected guard traversal. The producer submits no null spec mutation.',
    emptyValue: 'A current spec of {} lacks claimRef and fails the guards. The producer submits no empty replacement spec.',
    invalidValue: 'A scalar, array or incompatible parent shape cannot supply the selected claimRef paths and policy object member. Any complete result must still pass PV spec update validation.',
    changeImpact: 'The policy add retains unmentioned spec members at patch application. It does not reset the volume source, capacity or binding reference. API-server update preparation, admission rules and validation remain separate stages.',
    evidence: [types('373-377', 'PV spec is an object member with declared field types; it describes the already stored volume.'), types('397-413', 'The stored spec contains claimRef and persistentVolumeReclaimPolicy.')],
  },
  '$.spec.claimRef': {
    purpose: 'Use the current bound-claim reference as the ownership condition for the selected retirement patch.',
    omitted: 'No claimRef is written by the producer. A missing current reference fails the namespace guard rather than creating a new binding.',
    nullValue: 'A null current claimRef fails nested guard traversal; the selected patch does not clear the reference.',
    emptyValue: '{} lacks namespace, name and UID and fails the guards. Empty or omitted claimRef is not authorization to erase an unclaimed volume.',
    invalidValue: 'A wrong parent shape or a differing child fails the selected patch. These tests compare actual JSON values; they do not use the rules for creating an ObjectReference to establish ownership.',
    changeImpact: 'All three matching children permit the later policy add. The reference itself stays unchanged at patch application; the PV controller checks later binding and release through reconciliation.',
    evidence: [types('397-406', 'claimRef is an optional reference to an ObjectReference object; it records the binding to a claim.'), types('7390-7407', 'ObjectReference declares namespace, name and UID as optional string fields.')],
  },
  '$.spec.persistentVolumeReclaimPolicy': {
    purpose: 'Set Delete on the selected existing PV so claim retirement can request deletion of its backing storage.',
    omitted: 'The actual patch always includes add Delete. An absent current policy member is added after all guards pass; leaving out this operation would make no policy assignment at patch application.',
    nullValue: 'A null current policy member is overwritten with the string Delete after the guards pass. The producer supplies no null policy value; null is not a selected request to erase this field or its backend.',
    emptyValue: 'An empty current policy string is overwritten with Delete. An empty submitted add value is not produced by this retirement command and must not be treated as Delete.',
    invalidValue: 'A missing or invalid spec parent prevents add. The selected nonempty string Delete is a supported reclaim policy; a different unsupported nonempty string fails complete-PV validation. A successful guard does not bypass conversion to declared PV field types, admission rules or update validation.',
    changeImpact: `An existing Retain or other policy is replaced by Delete without testing its prior value. Data deletion can start after claim release and cannot be reversed by restoring policy. ${recovery}`,
    evidence: [types('408-413', 'The policy is a typed string member on PV spec.'), types('450-463', 'Delete requests removal of the Kubernetes PV after claim release and requires a volume plugin that supports deletion. The shared controller evidence describes backend deletion; this declaration does not prove driver completion.')],
  },
};
for (const [field, expected, lines, detail] of [
  ['namespace', 'the exact string kubeclaw', '7390-7393', 'The controller locates the claim inside this namespace.'],
  ['name', 'the captured selected PVC metadata.name', '7394-7397', 'The controller locates the claim by this name.'],
  ['uid', 'the captured selected PVC metadata.uid', '7398-7401', 'The UID identifies the PVC lifetime. A same-name replacement claim is a different lifetime.'],
]) {
  definitions[`$.spec.claimRef.${field}`] = {
    purpose: `Test current claimRef.${field} against ${expected} before allowing the policy add. ${detail}`,
    omitted: `The producer always supplies this test, not a field assignment. An absent current member cannot match the selected nonempty string and fails the patch. No missing value is defaulted from request scope.`,
    nullValue: 'A null current member does not equal the selected non-null string and fails the guard. The producer does not submit a null expectation or clear this member.',
    emptyValue: 'An empty current string cannot match the captured valid PVC identity or kubeclaw namespace and fails. When the API server converts the existing PV to JSON, empty string fields can be absent; that absence also fails the selected expectation.',
    invalidValue: `A different string or incompatible JSON value fails JSON-value comparison; it is not converted to the expected string. Passing the other two tests does not compensate for this failure.`,
    changeImpact: `This operation makes no binding change. All three tests must pass on the current object used by the patch before Delete can be assigned. ${detail} ${recovery}`,
    evidence: [types(lines, `ObjectReference declares ${field} as an optional string field; its omitempty JSON tag means an empty value can be omitted during conversion to JSON.`)],
  };
}
export const receiverContracts = paths.map(fieldPath => {
  const definition = definitions[fieldPath];
  return {
    kind: 'PersistentVolume', fieldPath,
    authoritySelector: {apiVersion: 'v1', kind: 'PersistentVolume', fieldPath},
    receiver: 'The Kubernetes API server applies the patch through its bundled JSON Patch library, checks the resulting PV update and stores it. The PV controller then handles claim release and the selected storage-deletion action.',
    operationScope, ...definition,
    crossFieldConditions: [...conditions],
    cases: [
      {name: 'omitted-operation-or-target-member', condition: 'The request or selected operation is omitted, or its current target member is absent, as distinguished below.', sourceOutcome: definition.omitted},
      {name: 'current-null-versus-submitted-null', condition: 'The current target boundary is null; the producer still sends its fixed non-null guards and Delete string.', sourceOutcome: definition.nullValue},
      {name: 'current-empty-versus-empty-patch', condition: 'The current boundary has the stated empty value, or an empty operation array is supplied at the root.', sourceOutcome: definition.emptyValue},
      {name: 'invalid-value-or-failed-precondition', condition: 'The stated malformed shape, incompatible value or ownership mismatch reaches the selected receiving stage.', sourceOutcome: definition.invalidValue},
      {name: 'accepted-intent-versus-reclamation', condition: 'The policy update is stored but PVC/PV deletion or the backend effect is pending, failed or uncertain.', sourceOutcome: definition.changeImpact},
      {name: 'uncertain-result-safe-stop', condition: 'The patch response, PVC delete or PV deletion wait is interrupted or times out.', sourceOutcome: recovery},
    ],
    evidence: [...evidence, ...definition.evidence],
    qualificationLimits: [...limits],
    readerReferences: [{label: 'Retire the former Qdrant installation and check storage ownership and deletion', target: '../use/maintenance.md#retire-the-former-qdrant-installation'}],
  };
});
