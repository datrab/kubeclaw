# BusterNamespaceLease Field Reference

Status: implemented schema and controller behavior; disabled by default
Audience: platform operators, fixture authors and Buster developers
Owner: buster
Evidence: charts/kubeclaw/templates/buster-namespace-lease-crd.yaml; charts/kubeclaw/values.yaml; cmd/buster-namespace-controller; scripts/docs-buster-lease-receiver-contracts.mjs
Applies to: namespaced BusterNamespaceLease requests and controller-owned status
Last verified: 2026-10-20; local schema and receiver checks, not deployed admission

Use this reference to author a lease or interpret its observed state. Start with
[the controller lifecycle and access guide](../understand/buster-namespace-controller.md)
for provisioning, credentials, retained previews and cleanup. This page lists
all **150 owned schema boundaries**, including container objects and array items.
It does not expand standard Kubernetes [ObjectMeta](https://kubernetes.io/docs/reference/kubernetes-api/common-definitions/object-meta/).

Source authorities: [owned CRD schema](https://github.com/datrab/kubeclaw/blob/a3ab5519a0267022291b128ddb91de832889efe3/charts/kubeclaw/templates/buster-namespace-lease-crd.yaml),
[shipped chart settings](https://github.com/datrab/kubeclaw/blob/a3ab5519a0267022291b128ddb91de832889efe3/charts/kubeclaw/values.yaml)
and [controller receivers](https://github.com/datrab/kubeclaw/tree/a3ab5519a0267022291b128ddb91de832889efe3/cmd/buster-namespace-controller).

## Select the installed contract

The shipped chart defaults are API group `kubeclaw.forgestack.ai`, version
`v1alpha1`, allowed prefixes `["test"]`, initial TTL
`7200` seconds and maximum TTL `86400` seconds. These are **chart defaults,
not universal CRD defaults**. The CRD template renders the configured group/version,
`spec.namespacePrefix` enum and `spec.ttlSeconds.maximum`. The controller receives
its separate allowed-prefix, default-TTL and maximum-TTL environment configuration.
Inspect the installed CRD and controller together when values are overridden;
a table value from the shipped chart does not override operator policy.

No owned field declares a CRD schema `default`. In particular, omitting
`ttlSeconds` selects the controller's configured initial TTL; it does not insert
7200 into the stored spec. Omitting `namespacePrefix` is schema-permitted, but
the normalized requested namespace must still match a controller-allowed prefix.
An explicit prefix, when supplied, must be in the **rendered** enum.

## Read the tables safely

- Paths start at `$`; `[]` is one array item, not an extra authored field.
- **Required** means required when the immediate containing object exists.
  The root schema itself does not require `spec`; an absent spec still cannot
  provision a namespace. `apiVersion` and `kind` must match the served endpoint,
  independently of the owned schema's required-member lists.
- **Optional; no default** means no schema value is inserted. An absent parent
  has no children. An absent status value is no observation, not a successful result.
- A nonnullable `null` is not an empty string/object/array or a default value.
  Server structural pruning and required/CEL validation decide removal or rejection.
  Explicit nullable boundaries are marked in the constraints column. Merge-patch
  `null` removes a member; use [operation-specific update rules](api-object-updates.md).
- Empty objects must satisfy their required children and CEL rules. Empty arrays
  must satisfy `minItems`; empty strings must satisfy their patterns, enums and
  length limits. Zero and false are explicit values and must satisfy their constraints.
- Unlisted constraints are not invented limits. Patterns, enums, formats, ranges,
  list semantics and collection bounds below come from the owned schema.

## Write ownership and changes

**Spec:** authors request desired resources; controller policy still validates exact
ServiceAccount/mode pairs, source Secrets and TTL. All declared spec fields except
`purpose` and `exposure` are immutable, including optional-field presence. Create
and validate a new lease to change them; do not patch around an accepted digest.
The accepted spec digest excludes purpose/exposure. Before readiness these two
members can change preview intent; after readiness the committed exposureSpec owns
routing. `cleanupPolicy: retain` does not disable expiry.

**Status:** only the authorized controller/readiness/product writers establish
observations. Ordinary create clears supplied status and ordinary update preserves
stored status; the enabled `/status` subresource is separate. A shape-valid status
patch does not authenticate readiness or a human decision. Writers reread UID,
generation, deletion state, resourceVersion, owners and prior history before
conditional writes. Do not manually edit status, remove finalizers or rewrite
retained history to recover a run.

**Access and credentials:** only operator-allowed subject/mode pairs receive grants;
exact duplicates collapse in the controller. The deployed deployer ClusterRole can
read namespace Secrets; dedicated reader grants do not subtract those rights.
Generated credentials use exactly username/password. Existing mode requires keys
and a deployer to populate the dedicated Secret. All workload-capable access
subjects must be readers, and a dedicated Secret cannot reuse a copied Secret name.
Creation intent precedes generated Secret creation; missing/replaced Secrets after
intent are unresolved provenance, not permission to rotate credentials.

**Readiness and product decisions:** commit through their authenticated endpoints.
Readiness verifies current namespace/ingress/Secret identities and recent observation,
then hands routing to retained exposureSpec. An unresolved exposureMutation blocks
commit and has no automatic timeout takeover. Historical readiness v1 retains for
604800 seconds; v2 requires explicit bounded retentionSeconds. Changed replay is
rejected. Signed human accept preserves expiry; extend must link the exact previous
deadline. Receipt identity and history cannot be removed or rewritten; list-map
order is not extension chronology. Reread uncertain commit results before retry.

**Conditions and security:** namespace phase Ready is independent of credential and
exposure readiness. Condition keys are type, not array positions; the implementation
writes the current transition timestamp when constructing a condition rather than
preserving it solely because truth is unchanged. Runtime security requires verified
image/manifest inputs and reports bounded observations, explicit truncation or
Unavailable, not proof of universal safety.

## Identity and root

| Field | Type | Required / omission | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `$` | object | Resource object | — | Namespaced lease resource connecting a bounded request to controller observations. |
| `$.apiVersion` | string | Exact endpoint identity | — | Configured served API group/version used to select the lease endpoint. |
| `$.kind` | string | Exact endpoint identity | — | BusterNamespaceLease resource identity. |
| `$.metadata` | object | Standard ObjectMeta; valid name/scope required | — | Standard Kubernetes ObjectMeta handled by the API server, with lease identity and fencing annotations. |

## Request: spec

| Field | Type | Required / omission | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `$.spec` | object | Optional; no default | — | Desired bounded namespace request. |
| `$.spec.cleanupPolicy` | string | Required | enum=`["delete","retain"]` | Fixture release policy; TTL still bounds the namespace lifetime. |
| `$.spec.manifestDigest` | string | Optional; no default | pattern=`^sha256:[a-f0-9]{64}$` | Digest of the tested manifest, bound to readiness and runtime security. |
| `$.spec.namespaceName` | string | Required | pattern=`^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$` | Requested namespace name, normalized by the controller before ownership checks. |
| `$.spec.namespacePrefix` | string | Omission is permitted by the schema; actual normalized namespace must still satisfy controller allowed-prefix checks. | enum=`["test"]` (shipped chart; rendered enum follows operator values) | Requested namespace prefix from the configured allowed list. |
| `$.spec.project` | string | Optional; no default | — | Immutable project trace value written by the fixture and included in the accepted spec digest; the controller does not use it for namespace ownership labels. |
| `$.spec.purpose` | string | Omission uses pretest in exposure selection; final-preview is needed for preview creation before readiness. | enum=`["pretest","gate","final-preview"]` | Selects pretest, gate or final-preview behavior; only final-preview requests exposure before retained readiness. |
| `$.spec.runId` | string | Optional; no default | — | Immutable spec trace value written by the fixture and included in the accepted spec digest; the controller does not use it for namespace labels or compare it with readiness runId. |
| `$.spec.secretsToCopy` | array | Omission copies no source Secrets; it does not select all operator-approved names. | — | Names of operator-approved source Secrets copied into the leased namespace. |
| `$.spec.secretsToCopy[]` | string | No item | pattern=`^[A-Za-z0-9._-]+$` | Names one operator-approved source Secret to copy into the leased namespace. |
| `$.spec.serviceName` | string | Optional; no default | pattern=`^[a-z0-9]([-a-z0-9]*[a-z0-9])?$` | Service identity used for internal URL or preview routing. |
| `$.spec.servicePort` | integer | Omission uses exposure.servicePort then 80 for an internal URL, but Buster E2E egress policy requires a declared valid servicePort. | minimum=`1`; maximum=`65535` | Service port used for internal URL or preview routing. |
| `$.spec.serviceTargetPort` | integer | Omission falls back to servicePort in the Buster E2E egress policy; differing target and service ports are both allowed TCP destination ports. | minimum=`1`; maximum=`65535` | Workload target port selected for the lease-scoped Buster E2E egress policy; the controller does not create the workload Service from this value. |
| `$.spec.ttlSeconds` | integer | When omitted, the controller uses configured defaultTTL (shipped 7200 seconds). This is a runtime fallback, not a CRD schema default. | minimum=`60`; maximum=`86400` (maximum is rendered operator value) | Initial lifetime from Kubernetes lease creation, subject to operator default and maximum. |
| `$.spec.verifiedImage` | string | Optional; no default | maxLength=`2048`; pattern=`^[A-Za-z0-9.-]+(:[0-9]{1,5})?/[a-z0-9]+([._/-][a-z0-9]+)*@sha256:[a-f0-9]{64}$` | Digest-pinned tested image used by runtime security and readiness verification. |

## Access grants

| Field | Type | Required / omission | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `$.spec.access` | array | Although schema-optional, omission enters the legacy no-new-work branch; it does not grant default access. | minItems=`1`; maxItems=`8`; x-kubernetes-list-type=`atomic` | Atomic list of requested ServiceAccount access grants. |
| `$.spec.access[]` | object | No item | — | Requests one ServiceAccount access grant; the containing list has atomic update semantics. |
| `$.spec.access[].mode` | string | Required | enum=`["deployer","tester"]` | Access role or credential source mode, selected by its containing contract. |
| `$.spec.access[].subject` | string | Required | pattern=`^[a-z0-9]([-a-z0-9]*[a-z0-9])?/[a-z0-9]([-a-z0-9]*[a-z0-9])?$` | Namespace/ServiceAccount identity for an access grant. |

## Dedicated credentials

| Field | Type | Required / omission | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `$.spec.testCredentials` | object | Omission requests no dedicated credentials; controller returns credentialsRef null and credentialsAvailable false. | — | Dedicated deliverable credential request and reader grants. |
| `$.spec.testCredentials.keys` | array | Generated mode defaults missing keys to username/password; existing mode requires at least one deliverable key by CEL and controller validation. | maxItems=`16`; x-kubernetes-list-type=`set` | Set of deliverable Secret keys; generated mode permits exactly username and password. |
| `$.spec.testCredentials.keys[]` | string | No item | pattern=`^[A-Za-z0-9._-]+$` | Names one deliverable Secret key; generated mode requires the containing set to select exactly username and password. |
| `$.spec.testCredentials.mode` | string | Required | enum=`["generate","existing"]` | Access role or credential source mode, selected by its containing contract. |
| `$.spec.testCredentials.readers` | array | Required | minItems=`1`; maxItems=`8`; x-kubernetes-list-type=`set` | Set of ServiceAccount subjects allowed to read the dedicated credential Secret. |
| `$.spec.testCredentials.readers[]` | string | No item | pattern=`^[a-z0-9]([-a-z0-9]*[a-z0-9])?/[a-z0-9]([-a-z0-9]*[a-z0-9])?$` | Names one ServiceAccount subject allowed to read the dedicated credential Secret. |
| `$.spec.testCredentials.secretName` | string | Required | pattern=`^[a-z0-9]([-a-z0-9]*[a-z0-9])?$` | Exact dedicated credential Secret name. |

## Preview request

| Field | Type | Required / omission | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `$.spec.exposure` | object | Omission gives provider off; no preview is created unless retained readiness supplies a committed route. | — | Desired preview routing input before readiness ownership transfers. |
| `$.spec.exposure.hostname` | string | Omission derives namespaceName-serviceName and normalizes it to a DNS label. | pattern=`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` | Preview hostname selected for the ingress. |
| `$.spec.exposure.path` | string | Omission selects / in the controller. An explicit empty string fails the served CRD pattern; the controller empty-string branch is a defensive fallback for absent or legacy data, not an admitted empty-value default. | maxLength=`1024`; pattern=`^/(?:[^/?#\r\n][^?#\r\n]*)?$` | HTTP route path, defaulting to / in the controller. |
| `$.spec.exposure.provider` | string | Omission selects off before readiness; retained readiness selects its exposureSpec. | enum=`["off","tailscale-ingress"]` | Selects disabled exposure or Tailscale ingress. |
| `$.spec.exposure.serviceName` | string | Omission falls back to spec.serviceName, then app; the result is normalized to a DNS label. | — | Service identity used for internal URL or preview routing. |
| `$.spec.exposure.servicePort` | integer | Omission uses 80 in previewExposureSpec; spec.servicePort does not override this preview port. | minimum=`1`; maximum=`65535` | Service port used for internal URL or preview routing. |

## Controller status

| Field | Type | Required / omission | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `$.status` | object | Optional; no default | — | Controller-owned observed state, written through the status subresource. |
| `$.status.createdAt` | string | Optional; no default | format=`date-time` | Lease metadata.creationTimestamp converted to UTC; current UTC time is the fallback if timestamp parsing fails. This is not a namespace preparation measurement. |
| `$.status.credentialsAvailable` | boolean | Optional; no default | — | Whether the requested credential keys are present and valid. |
| `$.status.credentialsRef` | string | Optional; no default | nullable=`true` | Reference to the dedicated deliverable Secret; never the credential bytes. |
| `$.status.expiresAt` | string | Optional; no default | — | Deadline stored for the containing lease, readiness or product decision. |
| `$.status.exposureGeneration` | integer | Optional; no default | format=`int64`; minimum=`0` | Generation bound to the exposure intent or committed readiness. |
| `$.status.exposureHostname` | string | Optional; no default | nullable=`true` | Observed hostname for the preview. |
| `$.status.exposureOwner` | string | Optional; no default | — | Current owner identifier used to fence preview operations. |
| `$.status.exposurePhase` | string | Optional; no default | — | Observed preview state, independent of namespace phase. |
| `$.status.internalUrl` | string | Optional; no default | nullable=`true` | Calculated cluster-local Service URL; this string does not prove endpoint reachability. |
| `$.status.message` | string | Optional; no default | — | Controller explanation for the containing observation. |
| `$.status.namespaceName` | string | Optional; no default | — | Requested namespace name, normalized by the controller before ownership checks. |
| `$.status.phase` | string | Optional; no default | — | Controller observation phase for the containing lifecycle or security snapshot. |
| `$.status.previewUrl` | string | Optional; no default | nullable=`true` | Observed ingress URL; readiness verifies the live route separately. |
| `$.status.specDigest` | string | Optional; no default | pattern=`^sha256:[a-f0-9]{64}$` | Accepted spec digest excluding purpose and exposure. |

## Exposure reservation

| Field | Type | Required / omission | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `$.status.exposureMutation` | object | Optional; no default | nullable=`true` | Persisted in-flight exposure reservation that blocks readiness commitment. |
| `$.status.exposureMutation.id` | string | Required | pattern=`^[a-f0-9]{48}$` | Identifier of an exposure reservation or runtime security finding. |
| `$.status.exposureMutation.startedAt` | string | Required | format=`date-time` | Start time of the exposure reservation; no automatic timeout takeover is established. |

## Generated credential intent

| Field | Type | Required / omission | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `$.status.generatedCredentialIntent` | object | Optional; no default | — | Pre-creation credential digest and identity, persisted before Secret creation. |
| `$.status.generatedCredentialIntent.credentialDigest` | string | Required | pattern=`^sha256:[a-f0-9]{64}$` | Digest binding exact generated credential content without publishing bytes. |
| `$.status.generatedCredentialIntent.leaseUID` | string | Required | minLength=`1` | Kubernetes lease UID binding this status record to one resource incarnation. |
| `$.status.generatedCredentialIntent.namespace` | string | Required | minLength=`1` | Namespace bound to generated credentials or committed readiness. |
| `$.status.generatedCredentialIntent.secretName` | string | Required | minLength=`1` | Exact dedicated credential Secret name. |

## Generated credential provenance

| Field | Type | Required / omission | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `$.status.generatedCredentials` | object | Optional; no default | — | Verified provenance of the actual immutable generated Secret. |
| `$.status.generatedCredentials.credentialDigest` | string | Required | pattern=`^sha256:[a-f0-9]{64}$` | Digest binding exact generated credential content without publishing bytes. |
| `$.status.generatedCredentials.leaseUID` | string | Required | minLength=`1` | Kubernetes lease UID binding this status record to one resource incarnation. |
| `$.status.generatedCredentials.namespace` | string | Required | minLength=`1` | Namespace bound to generated credentials or committed readiness. |
| `$.status.generatedCredentials.schemaVersion` | string | Required | enum=`["generated-demo-credential-source.v1"]` | Version discriminator of the containing persisted contract. |
| `$.status.generatedCredentials.secretName` | string | Required | minLength=`1` | Exact dedicated credential Secret name. |
| `$.status.generatedCredentials.secretResourceVersion` | string | Required | minLength=`1` | Observed resource version of the generated Secret. |
| `$.status.generatedCredentials.secretUID` | string | Required | minLength=`1` | UID of the actual immutable generated credential Secret. |

## Committed readiness

| Field | Type | Required / omission | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `$.status.demoReadiness` | object | Optional; no default | — | Committed verified demo handoff and retention record. |
| `$.status.demoReadiness.candidateDigest` | string | Optional; no default | pattern=`^sha256:[a-f0-9]{64}$` | Digest of the tested candidate. |
| `$.status.demoReadiness.credentialDigest` | string | Optional; no default | pattern=`^sha256:[a-f0-9]{64}$` | Digest binding exact generated credential content without publishing bytes. |
| `$.status.demoReadiness.decisionDigest` | string | Optional; no default | pattern=`^sha256:[a-f0-9]{64}$` | Digest of the test-gate decision. |
| `$.status.demoReadiness.expiresAt` | string | Required | format=`date-time` | Deadline stored for the containing lease, readiness or product decision. |
| `$.status.demoReadiness.exposureGeneration` | integer | Required | format=`int64`; minimum=`1` | Generation bound to the exposure intent or committed readiness. |
| `$.status.demoReadiness.exposureSpec` | object | Required | — | Snapshot of the verified exposure route retained after ownership transfer. |
| `$.status.demoReadiness.exposureSpec.hostname` | string | Optional; no default | maxLength=`1024` | Preview hostname selected for the ingress. |
| `$.status.demoReadiness.exposureSpec.path` | string | Optional; no default | maxLength=`1024` | HTTP route path, defaulting to / in the controller. |
| `$.status.demoReadiness.exposureSpec.provider` | string | Optional; no default | enum=`["tailscale-ingress"]` | Records the committed Tailscale ingress provider for the verified readiness route. This status field admits only tailscale-ingress; disabled exposure is a spec request choice. |
| `$.status.demoReadiness.exposureSpec.serviceName` | string | Optional; no default | maxLength=`1024` | Service identity used for internal URL or preview routing. |
| `$.status.demoReadiness.exposureSpec.servicePort` | integer | Optional; no default | minimum=`1`; maximum=`65535` | Service port used for internal URL or preview routing. |
| `$.status.demoReadiness.immutableImage` | string | Optional; no default | minLength=`1`; maxLength=`1024` | Tested immutable image in readiness or runtime security. |
| `$.status.demoReadiness.leaseUID` | string | Required | minLength=`1`; maxLength=`1024` | Kubernetes lease UID binding this status record to one resource incarnation. |
| `$.status.demoReadiness.manifestDigest` | string | Optional; no default | pattern=`^sha256:[a-f0-9]{64}$` | Digest of the tested manifest, bound to readiness and runtime security. |
| `$.status.demoReadiness.namespace` | string | Optional; no default | minLength=`1`; maxLength=`253` | Namespace bound to generated credentials or committed readiness. |
| `$.status.demoReadiness.owner` | string | Required | minLength=`1`; maxLength=`1024` | Owner identifier after the readiness handoff. |
| `$.status.demoReadiness.previousOwner` | string | Required | minLength=`1`; maxLength=`1024` | Exposure owner before the readiness handoff. |
| `$.status.demoReadiness.readyAt` | string | Required | format=`date-time` | Controller timestamp at verified readiness commitment. |
| `$.status.demoReadiness.receipt` | object | Required | — | Accepted Discord delivery evidence bound to the readiness handoff. |
| `$.status.demoReadiness.receipt.accepted` | boolean | Required | enum=`[true]` | Required true delivery-acceptance marker. |
| `$.status.demoReadiness.receipt.deliveryId` | string | Required | minLength=`1`; maxLength=`1024` | Delivery identity for replay consistency. |
| `$.status.demoReadiness.receipt.messageId` | string | Required | minLength=`1`; maxLength=`1024` | Discord message identity. |
| `$.status.demoReadiness.receipt.payloadDigest` | string | Required | pattern=`^sha256:[a-f0-9]{64}$` | Digest of the signed decision payload or delivered readiness payload. |
| `$.status.demoReadiness.receipt.schemaVersion` | string | Required | enum=`["discord-delivery-receipt.v1"]` | Version discriminator of the containing persisted contract. |
| `$.status.demoReadiness.receipt.status` | integer | Required | minimum=`200`; maximum=`299` | Condition truth value or successful Discord HTTP status, depending on the parent. |
| `$.status.demoReadiness.receipt.target` | string | Required | minLength=`1`; maxLength=`1024` | Discord delivery destination. |
| `$.status.demoReadiness.requestDigest` | string | Required | pattern=`^sha256:[a-f0-9]{64}$` | Digest used to detect unchanged or changed readiness replay. |
| `$.status.demoReadiness.requestId` | string | Required | minLength=`1`; maxLength=`1024` | Readiness producer request identity. |
| `$.status.demoReadiness.resultDigest` | string | Optional; no default | pattern=`^sha256:[a-f0-9]{64}$` | Digest of the test result or bounded runtime security observation. |
| `$.status.demoReadiness.retentionSeconds` | integer | Historical v1 must omit this field and uses 604800 seconds. v2 requires it; there is no stored-v2 omission default. | format=`int64`; minimum=`1`; maximum=`9223372036` | Explicit v2 post-readiness retention duration; historical v1 omits it. |
| `$.status.demoReadiness.runId` | string | Optional; no default | minLength=`1`; maxLength=`1024` | Run identity supplied by the authenticated readiness request and persisted in committed readiness; it is not copied from spec.runId. |
| `$.status.demoReadiness.schemaVersion` | string | Required | enum=`["demo-readiness.v1","demo-readiness.v2"]` | Version discriminator of the containing persisted contract. |
| `$.status.demoReadiness.secretUID` | string | Optional; no default | minLength=`1`; maxLength=`1024` | UID of the actual immutable generated credential Secret. |
| `$.status.demoReadiness.sourceRevision` | string | Optional; no default | minLength=`1`; maxLength=`1024` | Source revision of the verified candidate. |
| `$.status.demoReadiness.state` | string | Required | enum=`["ready-for-acceptance"]` | Resulting readiness or product-decision state. |
| `$.status.demoReadiness.url` | string | Optional; no default | minLength=`1`; maxLength=`1024` | Verified preview URL recorded at readiness commitment. |

## Human product decisions

| Field | Type | Required / omission | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `$.status.demoProduct` | object | Optional; no default | — | Append-only signed human product-decision history bound to committed readiness. |
| `$.status.demoProduct.decisions` | array | Required | maxItems=`128`; x-kubernetes-list-type=`map`; x-kubernetes-list-map-keys=`["decisionId"]` | List-map of immutable human decision receipts keyed by decisionId. |
| `$.status.demoProduct.decisions[]` | object | No item | — | Records one immutable human decision receipt; its decisionId identifies the entry in the containing list-map. |
| `$.status.demoProduct.decisions[].action` | string | Required | enum=`["accept","extend"]`; maxLength=`6` | Human accept or extend action. |
| `$.status.demoProduct.decisions[].actorId` | string | Required | minLength=`1`; maxLength=`1024` | Allowed human actor identified by the signed decision. |
| `$.status.demoProduct.decisions[].appliedAt` | string | Required | format=`date-time`; maxLength=`35` | Controller timestamp for applying a human decision. |
| `$.status.demoProduct.decisions[].decisionId` | string | Required | minLength=`36`; maxLength=`36`; pattern=`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$` | Stable UUID used for product-decision idempotency. |
| `$.status.demoProduct.decisions[].envelope` | object | Required | — | Signed product envelope preserved as decision evidence. |
| `$.status.demoProduct.decisions[].envelope.payload` | string | Required | maxLength=`10924` | Canonical base64 signed product-decision bytes. |
| `$.status.demoProduct.decisions[].envelope.schemaVersion` | string | Required | enum=`["demo-product-decision-envelope.v1"]`; maxLength=`33` | Version discriminator of the containing persisted contract. |
| `$.status.demoProduct.decisions[].envelope.signature` | string | Required | minLength=`88`; maxLength=`88` | Canonical base64 Ed25519 signature of the product envelope. |
| `$.status.demoProduct.decisions[].expiresAt` | string | Required | format=`date-time`; maxLength=`35` | Deadline stored for the containing lease, readiness or product decision. |
| `$.status.demoProduct.decisions[].generation` | integer | Required | format=`int64`; minimum=`1`; maximum=`9007199254740991` | Lease generation to which the human decision applies. |
| `$.status.demoProduct.decisions[].issuer` | string | Required | minLength=`1`; maxLength=`1024` | Configured issuer of the signed decision. |
| `$.status.demoProduct.decisions[].leaseName` | string | Required | minLength=`1`; maxLength=`1024` | Name of the lease targeted by the decision. |
| `$.status.demoProduct.decisions[].leaseUID` | string | Required | minLength=`1`; maxLength=`1024` | Kubernetes lease UID binding this status record to one resource incarnation. |
| `$.status.demoProduct.decisions[].payloadDigest` | string | Required | pattern=`^sha256:[a-f0-9]{64}$`; maxLength=`71` | Digest of the signed decision payload or delivered readiness payload. |
| `$.status.demoProduct.decisions[].previousExpiry` | string | Required | format=`date-time`; maxLength=`35` | Exact predecessor deadline used to link an extension. |
| `$.status.demoProduct.decisions[].readyDigest` | string | Required | pattern=`^sha256:[a-f0-9]{64}$`; maxLength=`71` | Digest identifying the committed readiness subject. |
| `$.status.demoProduct.decisions[].schemaVersion` | string | Required | enum=`["demo-product-decision-receipt.v1"]`; maxLength=`32` | Version discriminator of the containing persisted contract. |
| `$.status.demoProduct.decisions[].state` | string | Required | enum=`["accepted","extended"]`; maxLength=`8` | Resulting readiness or product-decision state. |
| `$.status.demoProduct.leaseUID` | string | Required | minLength=`1`; maxLength=`1024` | Kubernetes lease UID binding this status record to one resource incarnation. |
| `$.status.demoProduct.readyDigest` | string | Required | pattern=`^sha256:[a-f0-9]{64}$`; maxLength=`71` | Digest identifying the committed readiness subject. |

## Conditions

| Field | Type | Required / omission | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `$.status.conditions` | array | Optional; no default | x-kubernetes-list-type=`map`; x-kubernetes-list-map-keys=`["type"]` | List-map of separate controller conditions keyed by type. |
| `$.status.conditions[]` | object | No item | — | Records one controller condition; its type identifies the entry in the containing list-map. |
| `$.status.conditions[].lastTransitionTime` | string | Required | format=`date-time` | Timestamp written when the controller constructs this condition. |
| `$.status.conditions[].reason` | string | Required | — | Machine-readable explanation for a condition truth value. |
| `$.status.conditions[].status` | string | Required | enum=`["True","False","Unknown"]` | Condition truth value or successful Discord HTTP status, depending on the parent. |
| `$.status.conditions[].type` | string | Required | — | Condition identity used as its list-map key. |

## Runtime security observation

| Field | Type | Required / omission | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `$.status.runtimeSecurity` | object | Optional; no default | — | Bounded observation of live namespace resources against verified inputs. |
| `$.status.runtimeSecurity.findings` | array | Optional; no default | maxItems=`4096` | Bounded runtime security findings; absence is not proof of a clean runtime. |
| `$.status.runtimeSecurity.findings[]` | object | No item | — | Records one bounded runtime security finding; missing entries do not prove a clean runtime. |
| `$.status.runtimeSecurity.findings[].id` | string | Required | maxLength=`256` | Identifier of an exposure reservation or runtime security finding. |
| `$.status.runtimeSecurity.findings[].message` | string | Required | maxLength=`4096` | Controller explanation for the containing observation. |
| `$.status.runtimeSecurity.findings[].resource` | string | Required | maxLength=`512` | Resource identity associated with a finding. |
| `$.status.runtimeSecurity.findings[].severity` | string | Required | enum=`["critical","high","medium","low","info"]` | Severity assigned to a runtime security finding. |
| `$.status.runtimeSecurity.immutableImage` | string | Optional; no default | maxLength=`2048` | Tested immutable image in readiness or runtime security. |
| `$.status.runtimeSecurity.manifestDigest` | string | Optional; no default | pattern=`^sha256:[a-f0-9]{64}$` | Digest of the tested manifest, bound to readiness and runtime security. |
| `$.status.runtimeSecurity.message` | string | Optional; no default | — | Controller explanation for the containing observation. |
| `$.status.runtimeSecurity.observedAt` | string | Optional; no default | format=`date-time` | Timestamp of the runtime security observation. |
| `$.status.runtimeSecurity.omittedFindingCount` | integer | Optional; no default | minimum=`0` | Number of findings excluded from the published bounded list. |
| `$.status.runtimeSecurity.phase` | string | Required | enum=`["Observed","Unavailable"]` | Controller observation phase for the containing lifecycle or security snapshot. |
| `$.status.runtimeSecurity.podCount` | integer | Optional; no default | minimum=`0` | Number of observed Pods. |
| `$.status.runtimeSecurity.resultDigest` | string | Optional; no default | pattern=`^sha256:[a-f0-9]{64}$` | Digest of the test result or bounded runtime security observation. |
| `$.status.runtimeSecurity.serviceCount` | integer | Optional; no default | minimum=`0` | Number of observed Services. |
| `$.status.runtimeSecurity.totalFindingCount` | integer | Optional; no default | minimum=`0` | Full number of findings before truncation. |

## Cross-field and transition validation

These exact CEL rules supplement the per-field constraints. They apply at the
listed containing boundary; `self` is the incoming value and `oldSelf` the
stored value on update. Required fields alone do not replace these rules.

### `$`

- recorded human product decisions cannot be removed.

```cel
!has(oldSelf.status) || !has(oldSelf.status.demoProduct) || (has(self.status) && has(self.status.demoProduct))
```


### `$.spec`

- namespaceName is immutable.

```cel
self.namespaceName == oldSelf.namespaceName
```

- namespacePrefix is immutable.

```cel
has(self.namespacePrefix) == has(oldSelf.namespacePrefix) && (!has(self.namespacePrefix) || self.namespacePrefix == oldSelf.namespacePrefix)
```

- runId is immutable.

```cel
has(self.runId) == has(oldSelf.runId) && (!has(self.runId) || self.runId == oldSelf.runId)
```

- project is immutable.

```cel
has(self.project) == has(oldSelf.project) && (!has(self.project) || self.project == oldSelf.project)
```

- access is immutable.

```cel
has(self.access) == has(oldSelf.access) && (!has(self.access) || self.access == oldSelf.access)
```

- serviceName is immutable.

```cel
has(self.serviceName) == has(oldSelf.serviceName) && (!has(self.serviceName) || self.serviceName == oldSelf.serviceName)
```

- servicePort is immutable.

```cel
has(self.servicePort) == has(oldSelf.servicePort) && (!has(self.servicePort) || self.servicePort == oldSelf.servicePort)
```

- serviceTargetPort is immutable.

```cel
has(self.serviceTargetPort) == has(oldSelf.serviceTargetPort) && (!has(self.serviceTargetPort) || self.serviceTargetPort == oldSelf.serviceTargetPort)
```

- verifiedImage is immutable.

```cel
has(self.verifiedImage) == has(oldSelf.verifiedImage) && (!has(self.verifiedImage) || self.verifiedImage == oldSelf.verifiedImage)
```

- manifestDigest is immutable.

```cel
has(self.manifestDigest) == has(oldSelf.manifestDigest) && (!has(self.manifestDigest) || self.manifestDigest == oldSelf.manifestDigest)
```

- cleanupPolicy is immutable.

```cel
has(self.cleanupPolicy) == has(oldSelf.cleanupPolicy) && (!has(self.cleanupPolicy) || self.cleanupPolicy == oldSelf.cleanupPolicy)
```

- ttlSeconds is immutable.

```cel
has(self.ttlSeconds) == has(oldSelf.ttlSeconds) && (!has(self.ttlSeconds) || self.ttlSeconds == oldSelf.ttlSeconds)
```

- secretsToCopy is immutable.

```cel
has(self.secretsToCopy) == has(oldSelf.secretsToCopy) && (!has(self.secretsToCopy) || self.secretsToCopy == oldSelf.secretsToCopy)
```

- testCredentials is immutable.

```cel
has(self.testCredentials) == has(oldSelf.testCredentials) && (!has(self.testCredentials) || self.testCredentials == oldSelf.testCredentials)
```


### `$.spec.testCredentials`

- generated credentials can only use username and password keys.

```cel
self.mode != 'generate' || !has(self.keys) || (size(self.keys) == 2 && self.keys.exists(k, k == 'username') && self.keys.exists(k, k == 'password'))
```

- existing credentials require at least one key.

```cel
self.mode != 'existing' || (has(self.keys) && size(self.keys) > 0)
```


### `$.status.demoProduct`

- product history remains bound to its committed ready subject.

```cel
self.leaseUID == oldSelf.leaseUID && self.readyDigest == oldSelf.readyDigest
```


### `$.status.demoProduct.decisions`

- human decision history is append-only.

```cel
oldSelf.all(old, self.exists(entry, entry.decisionId == old.decisionId))
```


### `$.status.demoProduct.decisions[]`

- an existing human decision receipt is immutable.

```cel
self == oldSelf
```


### `$.status.demoReadiness`

- v2 readiness requires retentionSeconds; historical v1 has implicit seven days.

```cel
(self.schemaVersion == 'demo-readiness.v1' && !has(self.retentionSeconds)) || (self.schemaVersion == 'demo-readiness.v2' && has(self.retentionSeconds))
```

- committed readiness schema version is immutable.

```cel
self.schemaVersion == oldSelf.schemaVersion
```


## Interpret observations and change a lease

`createdAt` comes from the lease's metadata.creationTimestamp, converted to UTC;
parse failure falls back to current UTC time. It does not measure namespace setup.
The fixture requires a valid returned timestamp and derives its expiry fallback
from it when status.expiresAt is unavailable. `spec.runId` and `spec.project` are
immutable trace values, not namespace ownership labels. Readiness stores its own
producer runId without comparing it to spec.runId.

`serviceName`/`servicePort` can form an internal URL without proving the Service
exists. The controller does not create workload Services from these fields. E2E
egress uses declared valid servicePort and serviceTargetPort (falling back to the
former); when different, both TCP destinations are permitted only toward owned
namespace/labelled target Pods. Preview exposure has its separate port fallback.

Use a new lease for changed immutable authority. Before retiring the old lease,
identify its exact UID, retained readiness and external effects; use the controller
guide's cleanup/finalizer checks. Keep existing credentials and receipt history
intact while diagnosing uncertainty. Neither this reference nor local contract
checks establish the installed API server's admission behavior, effective RBAC,
DNS, Tailscale routing or successful runtime delivery.
