# Cluster invoker policy — proposed ownership and acceptance before implementation

Private design only. No code, runtime or integration change. This builds on the live cleanup-disposition V2 generation; successful retain and failed-preparation ownership oracles remain mandatory. Source feedback is required before the private implementation begins.

## One component owner

All selected operator policy is required, explicitly written in `buster-engine.config.json` under `settings.clusterInvokers`. No schema defaults, environment override, optional decoder value, constructor numeric fallback or generated runtime-file replacement is permitted. Typed validators and both chart consumers must enforce the same required fields/types/bounds/coherence. Runtime operation inputs, capability grants and deployment bindings retain separate authority; the configuration does not grant access.

| Proposed section | Required authored values / units | Existing author to remove |
|---|---|---|
| shared | kubectlExecutable; leaseApiGroup; leaseApiVersion | Runtime JSON generation, BUSTER_LEASE_API_GROUP/VERSION fallback, duplicate invoker copies |
| kubernetesFixture access | allowedNamespacePrefixes; registryRepositoryPrefixes; allowedSecretReferences; allowedStorageClasses; allowDefaultStorageClass; runnerServiceAccount; credentialReaderServiceAccount | Entrypoint constants/ENV, optional arrays, constructor agent-buster/agent-nova subjects |
| kubernetesFixture quotas | maximumManifestBytes=1048576; maximumResources=64; maximumPersistentVolumeClaimBytes=10737418240; maximumPersistentVolumeTotalBytes=21474836480; maximumRetentionSeconds=604800; maximumExecutionMs=900000 | Entrypoint-generated policy; preserve current safe-integer and PVC-total constraints |
| kubernetesFixture execution | pollIntervalMs=1000; shortCommandTimeoutMs=15000; commandOutputManifestMultiplier=2; diagnosticCodeUnits=4096 | Constructor fallback; every short-command call; implicit output multiplication and diagnostic truncation |
| kubernetesFixture manifest | maximumNodes=100000; maximumDepth=64; maximumAliases=1000; maximumFlattenVisits=100000; maximumFlattenPending=100000 | YAML listener/expanded graph and flatten literals; parser/graph share the SAME node/depth policy, not new independent defaults |
| tailscaleExposure access | allowedNamespacePrefixes; allowedHostSuffixes | Entrypoint-authored test/.ts.net lists |
| tailscaleExposure execution | maximumExecutionMs=900000; pollIntervalMs=1000; shortCommandTimeoutMs=15000; maximumCommandOutputBytes=1048576 | Entrypoint, constructor fallback, auth/patch/rollback and output literals |

Canonical values preserve today's effective profile. The multiplier explicitly preserves current Kube coupling to manifest bytes rather than silently creating an independent quota. Validate multiplication as a safe integer before effects. Poll bounds remain Kube50..10000 and Tail10..maximumExecutionMs. Runtime timers remain timer-safe; strict timer-ceiling validation replacing silent Kube clamping must be recorded as a deliberate configuration tightening, never called unchanged behavior. Other positive safe-integer constraints remain; do not invent tighter selected maxima without source justification.

## Shared deployment binding — no second author

- Installation namespace stays a required deployment binding from the projected namespace, not a second literal in the component and not a fallback to a default namespace. Service-account subject strings derive from this binding plus explicit component service-account names. This preserves same-installation identities; cross-namespace direct-constructor identities need an explicit decision before constraining that API.
- Registry endpoint/auth/transport stays the existing validated registry-client contract. `registryRepositoryPrefixes: ["kubeclaw"]` selects repositories relative to that one endpoint; a single resolver produces actual prefixes. Never copy registry credentials into component policy or create another endpoint default. SecurityScan's separate old allowlist remains a declared future owner, not implicitly migrated.
- Lease group/version and kubectl belong to the shared component section, supplied to both invokers. The existing kubernetesRuntimeSecurity consumer also reads BUSTER_LEASE_API_GROUP today: remove that competing shared author by forwarding the SAME validated shared endpoint/path while leaving its unrelated budgets explicitly open. Reject legacy group/version ENV by presence, including empty/equal values.
- Runtime JSON may retain separately validated installation/registry bindings for other current consumers, but its kubernetesFixture/tailscaleExposure policy sections are retired and rejected by property presence. Do not retain them as a cache that can override the captured component snapshot. Legacy BUSTER_ALLOWED_SOURCE_SECRETS is rejected, not translated.
- KUBECONFIG and Kubernetes service host/port remain credential/transport inputs to kubectl; they are neither policy defaults nor authorization to widen grants. HOME/PATH behavior is retained and documented.

## Actual consumer route and migration boundary

Capture the central component once in production; validate before mkdir, executable lookup, process start or command hooks. The real production decoder/factory receives this immutable policy and explicit deployment bindings, supplies both normal and prepared/recovery service routes, and retains capability route gating. Direct invoker constructors require all effective options; direct callers/tests author complete profiles, no helper inserts absent values. Relative executable resolution must use the component file directory, not the retired runtime JSON directory; existing absolute canonical path remains unchanged and migration documentation must explain relative-path movement.

Both canonical schema and the shared physical Helm template own validation; symlink aliases remain links. Both charts must deliver the same selected profiles. Entrypoint, production-capability-sources/cluster-options, capability factory, settings/runtime/readiness/preparation/parser/flatten consumers and all direct fixtures are in scope. Original modules, assertions and deadlines must remain; source-only changes to live-cluster test modules cannot be reported as executed cluster proofs.

## Acceptance criteria

CI1 — Full field/authority map: schema, TS, canonical values, Helm and every actual consumer have one exact mapping; required/missing/null/wrongtype/out-of-range/incoherent profiles reject. Retired runtime keys and ENV reject even equal/empty; disabled capability does not make malformed selected component policy acceptable.

CI2 — Actual production decoder/factory: two explicit profiles reach both real invokers, subject/namespace and registry reference bindings preserve identity; captured policy is unaffected by subsequent file/array/object mutation. Missing/invalid policy rejects before filesystem/process/execute effects, including custom execute seams. Grants continue to deny unauthorized calls independently.

CI3 — Actual consumer effects: low/high command output through real local child; short timeout/poll behavior through real invoker commands; diagnostic code-unit truncation; held-fd byte budget, resource count, YAML nodes/depth/aliases/flatten budgets and PVC arithmetic with genuine manifests. External Kubernetes/Tailnet API may be a clearly declared command boundary; no native/cluster acceptance. Tests must distinguish setup errors from intended limits with successful controls and exact diagnostics.

CI4 — Both-chart parity and old-author mutants: exact values plus required/coherence negatives on Kubeclaw AND Prism. Private nonalias copies before writes. Mutants restore poll/short/output/parser/default/legacy-author decisions at real consumers; require baseline pass plus relevant assertion failure. No fake semantic mutant for an unreachable branch.

CI5/DOC — Preserve all affected original suites/cleanup/retry/security oracles and deadlines; scoped types/canonical lint; before/after source+tool binding and drift. Document keys, units, binding/relative-path migration, secret references versus values, forbidden old inputs, resource-limit coverage and open boundaries. No overall CONFIG or D17 completion claim.

## Explicit remaining owners / questions for source feedback

Provider request-schema defaults and immutable historical invocation semantics stay separate. Foundation process identity capture250ms stays separate. RuntimeSecurity and SecurityScan unrelated policies, general runtime JSON and other components are not closed. DNS/port/image syntax and Kubernetes default object semantics remain protocol/request interpretation; defensive text/list/quantity ceilings need separate explicit classification, not an inferred D17 exemption.

Two decisions need confirmation before code: (1) shared binding-forwarding to RuntimeSecurity is necessary to remove its lease ENV alias without centralizing its unrelated budgets; (2) choose service-account names scoped to installation namespace for normal production while preserving direct constructor full-subject API, or explicitly authorize a broader required subject-binding shape. No hidden fallback resolves either question.

## Agreed source-review decisions (V2)

Root and independent reviewer confirmed both ownership decisions: RuntimeSecurity receives the same shared endpoint/path without moving its unrelated budgets; normal production uses explicit service-account names plus the actual projected namespace, while direct constructors require explicit full namespace/account subjects and preserve cross-namespace capability. No fallback is permitted.

Entrypoint validation must happen before the existing runtime-config-root helper/lock, mktemp, registry configuration writes, state/chown/kubeconfig writes and BuildKit spawn. CI2 must execute the genuine entrypoint with malformed or presence-only legacy inputs and observe absence of those effects. A later constructor failure is insufficient.

Relative kubectl resolution is against the same captured physical component-generation path returned by the one component load. Do not re-resolve a mutable SWARM_CONFIG symlink later, and do not use runtime JSON directory provenance. Capture metadata and selected settings together. These are implementation requirements, not unresolved questions or claims of completed tests.
