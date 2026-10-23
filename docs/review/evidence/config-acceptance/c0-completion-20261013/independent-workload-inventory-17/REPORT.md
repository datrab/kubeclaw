# Independent workload inventory review 17

Reviewer: `/root/workload_inventory_independent_17`, fresh bounded review, no implementation responsibility. Source HEAD `263277b0014de5f056c019307c40dc83f0201ef5`; tree and exact input SHA256 identities: `input-identities.json`. Reviewed package bytes are frozen in `reviewed-package/`, with `frozen-identities.json`. Instructions read: GOAL-START.md and OPENCLAW-CONFIG-GOAL.md. Scope: batch-25's 23 workload source clauses and directly relevant current Chart/Prism/trust productive readers. This is not full C0, implementation or native acceptance.

## Verdict

**Changes required at bounded definition scope.** Two material inventory definition errors below. Source/expression integrity and original candidate conservation pass. No receipt or global acceptance is issued; all implementation results remain not-run. No author/canonical/source/schema/test files were edited. Only this independent review directory was written.

## Actual checks and conservation

`checks.json` independently compares all six manifest pins, prior batch-24 queue pin, exact 23 expected IDs, original candidate bodies against delivery/candidate-dispositions.json, canonical body digests, and every source/reader whole-file digest plus line expression. All comparisons pass. Byte/expression pins prove identity, not a correct reader classification.

All 23 expected IDs are retained verbatim as bodies and IDs: SRC-d0207096e9428f6e, SRC-b499bd9d6e0c96f9, SRC-4cc5161d3c1135b5, SRC-61a34b698eb6c0ba, SRC-77d139d0c914f975, SRC-d8463fffaf86f4d5, SRC-a07d8875fd4a1cb8, SRC-6a63ef0194be3ef9, SRC-c2377b06eb763ea8, SRC-1b55a3e1ee1d1fd2, SRC-b13789ea3a017a85, SRC-26a9686365abe960, SRC-24af8635b20cbc86, SRC-6700eefd43e4dff9, SRC-ff3203dbf7f11afe, SRC-b1bd21e3a1c1ee3c, SRC-4c30d386ef699815, SRC-4c6b76f7a12d287c, SRC-f5efb3dafa1d8815, SRC-336010687eecb339, SRC-031d2d94167393f9, SRC-d5fada1a98f4c4af, SRC-d0c844cef43e11dc.

`commands.json` records bounded independent reads and their raw stdout/stderr. No full repository snapshot or broad test suite was used. The targeted SPIFFE_ENDPOINT_SOCKET search returns no application reader in skills/prism or skills/worker/core (rg exit1, no matches); this is a bounded absence observation, not a claim about external processes. Package generation/define.py was read, not executed, because it overwrites author evidence.

## Material findings

### W17-001 — Annotation envelope still attributed to SPIFFE enable author

Candidate SRC-61a34b698eb6c0ba, source-field-definitions.json field `proposedAuthorOrGeneratedRef`, points to `.../workerTrust/enabled`. Actual workloads.yaml:34 is an OR including each of the fixed three roles independently of that flag; thus within the loop at line13 the annotation envelope is unconditional. Its prose correctly says so, but its explicit proposed author field still contradicts this and could drive an erroneous authority/migration join.

Correction: classify the envelope as generated from the fixed role set, not authored by workerTrust/enabled. Keep distinct provenance for swarm-config checksum (36–37), worker native role/policy (39–41), Control product checksum (43–44), and SPIFFE control/worker checksum (46–47). Changing the flag does not remove the annotation envelope or those independently applicable annotations. Preserve original candidate body and ID.

### W17-002 — Current author declarations mislabeled as actual reader, and wrong pull-policy field

Candidate SRC-4c6b76f7a12d287c's actualReaderRef points to values.yaml:27, a Control resource author/default declaration, not the reader and not the Studio/worker resource read. Actual role-generic Chart consumption is workloads.yaml:138.

Candidate SRC-336010687eecb339's actualReaderRef points to values.yaml:82 (`envoy:`), an author section marker, not image consumption. Actual direct proxy image reader/projection is workloads.yaml:166.

Candidate SRC-031d2d94167393f9's actualReaderRef points to workloads.yaml:166 (image), whereas pullPolicy consumption is workloads.yaml:167.

Correction: pin those actual read/projection expressions as actualReaderRef, retain values.yaml as separately named current-author evidence if needed, and name Kubernetes/kubelet as downstream native consumers requiring future proof. The deployment renderer is a real current reader; native execution must not be inferred from it. Preserve original candidate bodies and IDs.

## Source distinctions verified

- Ordinary role images: three fixed role lookups at14, imageRef call78; helper requires repository and sha256 lowercase64 digest and emits repository@digest. Envoy166 instead directly emits repository:tag@digest; no helper validation is performed at that expression. Proposed immutable receipts are target authority, not shipped loader paths.
- Control replicas guard3 and worker/native guard7 currently force exactly1 (with Helm int coercion); Studio22 has no equivalent local guard. The proposed strict typed nonnegative Studio domain is future definition, not current validated enforcement.
- Resources138 are per-role pod resources sourced from role values; they are not workerAttemptEnvelope grants or host-native pool capacity. The described quantity/relation/capacity validation is a future/native gate, not established by current toYaml.
- Worker trust labels31, checksum46, ENV125, sidecar164 and CSI volumes206 apply to Control/worker when enabled, not Studio. Shared-secret91 and dispatch-secret108 invert that branch. Database ENV for Control/worker remains separately emitted; Control session/ingress/ingestion credentials remain required by loadControlServerConfig. Worker reader only requires database in HMAC mode, which does not negate the Chart Secret dependency.
- Socket ENV126 is a projection of selected socketPath, not a proven current Prism application socket read. Actual SDS pipe path is in configmap-worker-trust.yaml67/179 (runner220 separately). Proxy mount is workloads187, not an application socket mount.
- Nova/agent identities are generated from declared domain/namespace/SA; Control/worker/test-runner use fixed role SA and Release namespace. Actual Control trust loader reads required peers; dispatch-route101 admits exact Nova, agent and optional test-runner identities. These transport principals do not independently create actors or expand task grants.
- Worker composition worker.ts13/22–25 selects loaded auth mode before server creation. worker-service.ts56 passes headers plus socket.remoteAddress to worker-core/worker/trust.ts43. That function requires loopback remote address and checks a single forwarded URI against exact allowed identities. It does not inspect a native TLS certificate. Envoy configuration requires client certificate, SAN matching, SDS and SANITIZE_SET (Control20–48, worker147–168). Application header acceptance and real proxy/certificate/SDS behavior are separate proofs.
- Existing startup composition captures config (Control loadControlCompositionConfig and worker runNativePrismWorker); the package's common activation/recovery text is proposed closure, not proof of durable module-generation binding already implemented.

## Precise unclosed gates (not additional general validator work)

1. Whole selected root/component schema/profile joins and exact setting/requirement/case links for these23 retained IDs. Proposed config/pipeline.config.json author references are not shipped; refs/domains must be checked against the actual selected full schema, including separate checksum/image/native/Secret provenance.
2. Complete typed role-specific A/B fixtures: exact three-role membership, guarded Control/worker replica invariants, explicit Studio replicas, ordinary and Envoy digest/tag/fetch policy distinction, individual role request/limit quantities, mode-specific routes/credentials, exact identity/domain/namespace/SA and socket/mount/driver relations. Do not invent provider identities or treat different actors as mere alternate deployment values.
3. Concrete future executable source/oracles at real Chart projection and actual reader boundaries; strict type/enum/quantity rejection, false/true mode preservation, annotation envelope independent of SPIFFE, resources separate from task grants, startup generation and recovery contracts. These future cases remain not-run; no native effect can be credited to text/hash checks.
4. Authentic external image and Envoy compatibility, installed CSI driver/version/node registration, SPIRE SA registrations and trust bundles, genuine SDS/socket availability, Kubernetes scheduling/resource/image-cache/Secret facts. Real positive/negative native checks must distinguish spoofed header/nonloopback rejection from certificate/SAN sanitization/SDS failure. Declared csi.spiffe.io or a generated principal is not evidence of installation/authority.
5. Material definition corrections W17-001/002 require fresh bounded recheck. This review does not close queued source slices (_swarm-config.tpl/configmap-gateway.yaml), global C0-A–E, execution module bindings, complete implementation package, or live/native acceptance.

Per-gate: bounded identity/conservation passed; bounded semantic source definition changes-required; schema/profile/future case completeness open; native provider/runtime proof not-run/externally unestablished; C0-A/B/C partial only, C0-D/E not accepted. No C1–C6 permission inferred.
