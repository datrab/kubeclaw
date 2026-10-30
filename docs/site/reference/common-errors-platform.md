# Ops and platform services — error catalogue

Status: generated source-backed reference
Audience: operator, developer, maintainer
Owner: documentation automation
Evidence: docs/config/common-error-catalogue.json; scripts/docs-common-error-catalogue.mjs
Applies to: current workspace-owned diagnostic families; source-bound descriptions, not execution evidence
Last verified: generation checks the declared source digests

<!-- BEGIN GENERATED: common error catalogue -->

[All component families](common-errors.md) · [Diagnostic routing](errors.md)

Search for the exact diagnostic or constructor. Each entry distinguishes its identity from effects and recovery; source links are representative, not a complete call graph.

## Families

- [Uncoded SystemExit text from `kube/discover/setup_secrets`; optional empty-credential detail from two selected environment-variable tuples](#go-python-ops-bootstrap)
- [Uncoded RuntimeError/OS/subprocess exception; child return status preserved, timeout maps to124; status phases are not codes](#go-python-ops-supervisor)
- [JSON-RPC error/result.isError → uncoded SystemExit; separate typed `KUBERNETES_RESPONSE_TOO_LARGE` and uncoded local/status+path transport errors](#go-python-ops-verify-and-kube-client)
- [Uncoded local errors and errors.Is ownership sentinel; apiError.statusCode+open message; Failed/ReconcileFailed status and logs](#go-python-controller-startup-and-reconcile)
- [Uncoded credential/provenance/exposure errors; pending availability and runtime findings remain data](#go-python-controller-credentials-exposure-and-rbac)
- [Owned `DEMO_READY_`&#42; error messages → handler HTTP status/text via exact readyErrorCode allowlist; unknown error → `DEMO_READY_EVIDENCE_UNAVAILABLE`](#go-python-controller-ready)
- [Owned `DEMO_PRODUCT_`&#42; message errors; handler retains exact `DEMO_PRODUCT_` prefix or maps other errors to `EVIDENCE_UNAVAILABLE`](#go-python-controller-product)
- [Local fixed errors.New policy/identity/runtime/selection/sandbox messages; forwarded OS/JSON/stub.Run errors explicitly open](#go-python-native-nri)
- [kubectl upstream CheckErr dispatch; Hubble cmd.Execute err.Error→stderr+exit1](#go-python-upstream-cli-frontdoors)
- [Local uncoded strict decoder/validator/digest errors, named-field detail parameters and forwarded JSON/canonicalizer error](#go-python-observability-go-contract)
- [Generated Go `error/reason_code` fields of string, nullable or json.RawMessage type](#go-python-telemetry-go-declarations)
- [Uncoded SystemExit/RuntimeError/assertion and propagated Python/subprocess failures; collected failure flag→exit1](#go-python-python-maintenance-reads-and-checks)
- [Uncoded ValueError/RuntimeError/SystemExit through actual guards, require helper and subprocess failures](#go-python-python-maintenance-mutations)
- [Error.code = `KUBERNETES_RESPONSE_TOO_LARGE`](#go-python-ops-kubernetes-response-too-large)
- [phase/controlSocketReady/pairingVerified:false and child return status](#go-python-ops-supervisor-process-state)
- [apiError{statusCode,message}; Error() returns message from upstream API JSON.message/raw body/HTTP fallback](#go-python-controller-api-error-forwarding)
- [Lease phase/conditions and runtime:&lt;resource&gt;:&lt;finding&gt; id/severity/message](#go-python-controller-structured-state-and-findings)
- [readConfiguration OS/JSON errors; stub.New/run client.Run returned error](#go-python-nri-open-forwarded-errors)
- [Selected Go build/render, root-only install/activation/failed-launch repair guards and child nonzero exits](#go-python-nri-owned-build-install-activation)
- [lua:application-health:condition-degraded](#lua-application-health-condition-degraded)
- [lua:application-health:operation-degraded](#lua-application-health-operation-degraded)
- [lua:application-health:observed-health](#lua-application-health-observed-health)
- [lua:application-health:strict-selected-revision](#lua-application-health-strict-selected-revision)

<a id="go-python-ops-bootstrap"></a>

## Uncoded SystemExit text from `kube/discover/setup_secrets`; optional empty-credential detail from two selected environment-variable tuples

**Representation:** code-absent

**Identity / construction:** Uncoded SystemExit text from `kube/discover/setup_secrets`. optional empty-credential detail from two selected environment-variable tuples

**Trigger:** Subprocess nonzero, missing endpoint/source Secret, invalid discovered endpoint set, empty selected credential file or unsupported dispatcher arguments.

**Effect:** discover reads Kubernetes. secrets can create bearer, copy pull Secret, and apply optional token Secrets in sequence. Failure after an earlier apply does not mean no Secret exists or rollback occurred. Existing bearer/pull Secrets are retained. optional supplied files can still be applied.

**Retry boundary:** Keep context/namespace/object and first diagnostic without Secret contents. inspect current objects and exact failing prerequisite before resuming. Do not blindly regenerate bearer, echo kubectl stderr or infer atomic deployment/cleanup.

**Safe next action:** Keep context/namespace/object and first diagnostic without Secret contents. inspect current objects and exact failing prerequisite before resuming. Do not blindly regenerate bearer, echo kubectl stderr or infer atomic deployment/cleanup.

**Retained evidence:** Earlier applied Secret/Namespace may remain. keep selected context/namespace and object identity, first non-secret diagnostic, partial state. never reproduce credential values.

**Consumer / translation:** deploy-ops-pod deploy calls discover into owned temporary JSON, validates the complete render, creates Namespace, calls secrets, then Helm upgrade. render does not invoke bootstrap discovery/secrets. it requires supplied discovery values. Shell set-e stops following commands on a failure. its trap removes only its own temporary directory.

**Owning / consuming source:**

- [ops/pod/bootstrap.py:15](../../../ops/pod/bootstrap.py#L15)
- [scripts/deploy-ops-pod.sh:9](../../../scripts/deploy-ops-pod.sh#L9)

<a id="go-python-ops-supervisor"></a>

## Uncoded RuntimeError/OS/subprocess exception; child return status preserved, timeout maps to124; status phases are not codes

**Representation:** code-absent

**Identity / construction:** Uncoded RuntimeError/OS/subprocess exception. child return status preserved, timeout maps to124. status phases are not codes

**Trigger:** Missing/unreadable/short bearer, Git/Popen/file failure, missing login/socket readiness or direct child timeout/exit.

**Effect:** Seeds config only if absent, mutates global Git helper, reads bearer, writes temp-then-replace status, and starts/stops Codex child. Login failures loop after5s. app-server exit/socket failure loops after10s after terminate/wait/kill cleanup. SIGTERM sets stop and terminates direct child. This is not general descendant/remote relay termination proof.

**Retry boundary:** Keep persisted HOME and current child/control/status identity. Distinguish waiting-for-login from crash/startup failure. Do not turn local socket readiness or supervisor process state into enrollment/pairing/relay/API success.

**Safe next action:** Keep persisted HOME and current child/control/status identity. Distinguish waiting-for-login from crash/startup failure. Do not turn local socket readiness or supervisor process state into enrollment/pairing/relay/API success.

**Retained evidence:** Keep persisted HOME/config/workspace and original child/control/status identity. status files and child effects may remain. pairingVerified stays false.

**Consumer / translation:** Image CMD runs Python supervisor through tini. Chart supplies persisted HOME/workspace and bearer mount. readiness probe reads status.phase, not successful pairing.

**Owning / consuming source:**

- [ops/pod/supervisor.py:21](../../../ops/pod/supervisor.py#L21)
- [ops/pod/Dockerfile:76](../../../ops/pod/Dockerfile#L76)
- [charts/ops-pod/templates/workload.yaml:1](../../../charts/ops-pod/templates/workload.yaml#L1)

<a id="go-python-ops-verify-and-kube-client"></a>

## JSON-RPC error/result.isError → uncoded SystemExit; separate typed `KUBERNETES_RESPONSE_TOO_LARGE` and uncoded local/status+path transport errors

**Representation:** code-absent

**Identity / construction:** JSON-RPC error/result.isError → uncoded SystemExit. separate typed `KUBERNETES_RESPONSE_TOO_LARGE` and uncoded local/status+path transport errors

**Trigger:** Actual MCP error response, failed verification assertion/permission check. Kubernetes invalid origin/path/token/JSON, response ceiling, timeout or non2xx response.

**Effect:** Verification performs actual MCP/Kubernetes reads and conditional auth-can-i commands. does not exec a target workload command. Credential files and network failures remain real external dependencies.

**Retry boundary:** Preserve service/route/status/namespace and code separately from human text. Narrow oversized read. do not relax transport ceiling or treat generic failure as successful denial. No general mutation retry or pairing success follows.

**Safe next action:** Preserve service/route/status/namespace and code separately from human text. Narrow oversized read. do not relax transport ceiling or treat generic failure as successful denial. No general mutation retry or pairing success follows.

**Retained evidence:** Keep service/route/status/query/namespace/continuation and original code/cause. do not expose bearer or infer successful denial from401/transport failure.

**Consumer / translation:** createKubeList retries only `KUBERNETES_RESPONSE_TOO_LARGE`, halves pageSize until1/deadline, retains selector/continuation, and does not count failed attempts as pages. All other errors propagate. Returned partial/continuation is not a completed global list.

**Owning / consuming source:**

- [ops/pod/verify.py:8](../../../ops/pod/verify.py#L8)
- [tools/ops-mcp/src/kubernetes.mjs:7](../../../tools/ops-mcp/src/kubernetes.mjs#L7)
- [scripts/deploy-ops-pod.sh:47](../../../scripts/deploy-ops-pod.sh#L47)

<a id="go-python-controller-startup-and-reconcile"></a>

## Uncoded local errors and errors.Is ownership sentinel; apiError.statusCode+open message; Failed/ReconcileFailed status and logs

**Representation:** code-absent

**Identity / construction:** Uncoded local errors and errors.Is ownership sentinel. apiError.statusCode+open message. Failed/ReconcileFailed status and logs

**Trigger:** Actual startup prerequisites, validation/ownership/CAS rejection, Kubernetes request/response failure or reconciliation exception at named phase.

**Effect:** Provisioning can patch lease, Namespace, quotas/network policies/RBAC/Secrets/exposure before a later failure. No transaction rollback. Cleanup fences state, verifies owner labels/leaseUID and CAS identities. delete wait may time out. Deletion reconciler may remove its finalizer after ownership-mismatch sentinel without deleting another owner's Namespace. Namespace/resource findings remain in the record data, not constructor exceptions.

**Retry boundary:** Retain leaseUID/generation/resourceVersion, namespace, status, partial effects and first API error. Polling is controller reconciliation, not authorization to replay the original external job or remove retained state. Correct owning input/authority. never bypass ownership/CAS guards or claim HTTP timeout means no mutation.

**Safe next action:** Retain leaseUID/generation/resourceVersion, namespace, status, partial effects and first API error. Polling is controller reconciliation, not authorization to replay the original external job or remove retained state. Correct owning input/authority. never bypass ownership/CAS guards or claim HTTP timeout means no mutation.

**Retained evidence:** Keep leaseUID/generation/resourceVersion, target namespace, status/conditions/log detail and partial Namespace/RBAC/Secret/exposure writes. no transaction or universal reset.

**Consumer / translation:** newController/startReadinessServer errors panic in main. reconcileAll list error logs controller loop failed and main polls again. Each lease error logs its original text, attempts Failed status with ReconcileFailed condition and logs status-patch failure separately. Rejected/Expired/Deleting/Ready/conditions are structured lifecycle state, not universal error codes. 404 is absence only at named callers. createOrPatch retries PATCH only after typed409. other errors return.

**Owning / consuming source:**

- [cmd/buster-namespace-controller/main.go:98](../../../cmd/buster-namespace-controller/main.go#L98)
- [charts/kubeclaw/templates/buster-namespace-controller.yaml:1](../../../charts/kubeclaw/templates/buster-namespace-controller.yaml#L1)
- [docker/Dockerfile.namespace-controller:1](../../../docker/Dockerfile.namespace-controller#L1)

<a id="go-python-controller-credentials-exposure-and-rbac"></a>

## Uncoded credential/provenance/exposure errors; pending availability and runtime findings remain data

**Representation:** code-absent

**Identity / construction:** Uncoded credential/provenance/exposure errors. pending availability and runtime findings remain data

**Trigger:** Invalid credential mode/key/readers, mismatched immutable Secret/intent/proof, unresolved creation, current exposure ownership/lineage/CAS or API failure.

**Effect:** Credential access may exist before Secret failure. Generated credentials commit intent before creating immutable Secret. missing Secret with prior intent/proof becomes unresolved creation, not permission to create different credentials. Existing-mode placeholder is a successful pending state. Exposure mutation has CAS reservation and may leave Reconciling/claim after API failure. Ready admission rejects unresolved mutation.

**Retry boundary:** Keep actual intent/digest/SecretUID/lease and exposure claim. Inspect the dedicated owner and original mutation. do not recreate missing committed credentials, widen grants, reset claims or delete an ingress from a similar name.

**Safe next action:** Keep actual intent/digest/SecretUID/lease and exposure claim. Inspect the dedicated owner and original mutation. do not recreate missing committed credentials, widen grants, reset claims or delete an ingress from a similar name.

**Retained evidence:** Keep generatedCredentialIntent/generatedCredentials digest/SecretUID and original exposure claim/lease. partial RBAC/Secret/Ingress state can remain.

**Consumer / translation:** Exact owned error/return/status consumer selectors attached. no generic retry or global code meaning.

**Owning / consuming source:**

- [cmd/buster-namespace-controller/demo-credentials.go:15](../../../cmd/buster-namespace-controller/demo-credentials.go#L15)
- [cmd/buster-namespace-controller/exposure-generation.go:21](../../../cmd/buster-namespace-controller/exposure-generation.go#L21)
- [cmd/buster-namespace-controller/main.go:337](../../../cmd/buster-namespace-controller/main.go#L337)

<a id="go-python-controller-ready"></a>

## Owned `DEMO_READY_`&#42; error messages → handler HTTP status/text via exact readyErrorCode allowlist; unknown error → `DEMO_READY_EVIDENCE_UNAVAILABLE`

**Representation:** upstream-translation

**Identity / construction:** Owned `DEMO_READY_`&#42; error messages → handler HTTP status/text via exact readyErrorCode allowlist. unknown error → `DEMO_READY_EVIDENCE_UNAVAILABLE`

**Trigger:** Exact admission/request/identity/source/retention/receipt/current-state conditions. post-patch/readback error can produce `COMMIT_UNCERTAIN`.

**Effect:** Commit may patch durable demoReadiness and exposure owner. Typed API409 becomes `VERSION_CONFLICT`. other patch failure, readback failure or mismatch is `COMMIT_UNCERTAIN`. Status/read replay verifies original request digest/current lease, retained credentials/exposure and expiry. Stored schema v1 has the named implicit retention only. v2 requires its explicit value.

**Retry boundary:** Reconcile original requestId/digest/leaseUID and status after uncertain commit. do not issue new readiness identity or assume no state changed. Fix malformed input/auth before retry. preserve expired/changed/retention boundaries. Ready-for-acceptance is not product/human acceptance.

**Safe next action:** Reconcile original requestId/digest/leaseUID and status after uncertain commit. do not issue new readiness identity or assume no state changed. Fix malformed input/auth before retry. preserve expired/changed/retention boundaries. Ready-for-acceptance is not product/human acceptance.

**Retained evidence:** Keep original requestId/wireDigest/leaseUID/resourceVersion, demoReadiness/exposure/credential proof and first diagnostic. no fresh identity after uncertain commit.

**Consumer / translation:** Exact owned error/return/status consumer selectors attached. no generic retry or global code meaning.

**Owning / consuming source:**

- [cmd/buster-namespace-controller/demo-readiness.go:66](../../../cmd/buster-namespace-controller/demo-readiness.go#L66)
- [cmd/buster-namespace-controller/demo-readiness-sources.go:10](../../../cmd/buster-namespace-controller/demo-readiness-sources.go#L10)
- [cmd/buster-namespace-controller/demo-retention.go:14](../../../cmd/buster-namespace-controller/demo-retention.go#L14)

<a id="go-python-controller-product"></a>

## Owned `DEMO_PRODUCT_`&#42; message errors; handler retains exact `DEMO_PRODUCT_` prefix or maps other errors to `EVIDENCE_UNAVAILABLE`

**Representation:** upstream-translation

**Identity / construction:** Owned `DEMO_PRODUCT_`&#42; message errors. handler retains exact `DEMO_PRODUCT_` prefix or maps other errors to `EVIDENCE_UNAVAILABLE`

**Trigger:** Signature/schema/time/actor/subject/replay/history/extension/admission checks and version-CAS/readback failures at actual product step.

**Effect:** Decision verification binds signed bytes/actor/issuer/domain/lease and original ready identity. Existing exact decisionId+digest returns receipt. changed payload fails. Commit uses expectedRevision CAS then readback/receipt equality. 409 API conflict is `VERSION_CONFLICT`. other patch/readback uncertainty is `COMMIT_UNCERTAIN`. A status lookup not found is different from no attempted commit. Acceptance/extension updates durable product decisions and expiry. no generic rollback promised.

**Retry boundary:** Keep original decisionId/payloadDigest/envelope/leaseUID/readyDigest and read original status before any new attempt. Preserve history limit, expiry and subject-change stop. Do not forge acceptance or clear retained decision history to make retry succeed.

**Safe next action:** Keep original decisionId/payloadDigest/envelope/leaseUID/readyDigest and read original status before any new attempt. Preserve history limit, expiry and subject-change stop. Do not forge acceptance or clear retained decision history to make retry succeed.

**Retained evidence:** Keep signed envelope/decisionId/payloadDigest/leaseUID/readyDigest and committed decisions/expiry. uncertain commit requires status against original identity.

**Consumer / translation:** Exact owned error/return/status consumer selectors attached. no generic retry or global code meaning.

**Owning / consuming source:**

- [cmd/buster-namespace-controller/demo-product.go:58](../../../cmd/buster-namespace-controller/demo-product.go#L58)
- [cmd/buster-namespace-controller/demo-readiness.go:125](../../../cmd/buster-namespace-controller/demo-readiness.go#L125)
- [cmd/buster-namespace-controller/demo-readiness-lifecycle.go:1](../../../cmd/buster-namespace-controller/demo-readiness-lifecycle.go#L1)

<a id="go-python-native-nri"></a>

## Local fixed errors.New policy/identity/runtime/selection/sandbox messages; forwarded OS/JSON/stub.Run errors explicitly open

**Representation:** literal

**Identity / construction:** Local fixed errors.New policy/identity/runtime/selection/sandbox messages. forwarded OS/JSON/stub.Run errors explicitly open

**Trigger:** Actual root/policy trust/schema/role/runtime/plugin identity and callback annotation/container/sandbox conditions in complete local main.

**Effect:** ReadConfiguration does not mutate policy. Runtime callback returns adjustment removing cgroup namespace only after exact selected role/container/sandbox binding. Unselected roles/containers can return nil success, not a failure or proof all workloads were constrained. SDK Configure/CreateContainer errors are callback results. exact external lifecycle failure remains external.

**Retry boundary:** Keep selected binary/policy/version/role/sandbox identity. Correct owned rejection before admission. do not restart services, clear pools or reinterpret arbitrary SDK failure as one fixed NRI code. Host activation/upstream SDK consumers require their own closure before any stronger claim.

**Safe next action:** Keep selected binary/policy/version/role/sandbox identity. Correct owned rejection before admission. do not restart services, clear pools or reinterpret arbitrary SDK failure as one fixed NRI code. Host activation/upstream SDK consumers require their own closure before any stronger claim.

**Retained evidence:** Keep selected binary/policy/version/role/sandbox and first error. no generic service restart/state removal. External SDK vocabulary/callback delivery remains open.

**Consumer / translation:** Exact owned error/return/status consumer selectors attached. no generic retry or global code meaning.

**Owning / consuming source:**

- [tools/native-worker-nri/main.go:37](../../../tools/native-worker-nri/main.go#L37)
- [scripts/install-native-worker-pools-stage.sh:6](../../../scripts/install-native-worker-pools-stage.sh#L6)
- [scripts/activate-native-worker-ax41.sh:22](../../../scripts/activate-native-worker-ax41.sh#L22)

<a id="go-python-upstream-cli-frontdoors"></a>

## kubectl upstream CheckErr dispatch; Hubble cmd.Execute err.Error→stderr+exit1

**Representation:** forwarded-error

**Identity / construction:** kubectl upstream CheckErr dispatch. Hubble cmd.Execute err.Error→stderr+exit1

**Trigger:** Selected upstream CLI execution returns an error. exact upstream/remote error vocabulary is not locally closed.

**Effect:** Upstream command flags and call sites determine effects, not the frontdoor. Error output does not prove a command was read-only or never accepted remotely.

**Retry boundary:** Retain selected CLI/version/subcommand/target and original error. defer recovery to exact upstream/operation authority. No invented per-prefix retry or whole upstream catalogue.

**Safe next action:** Retain selected CLI/version/subcommand/target and original error. defer recovery to exact upstream/operation authority. No invented per-prefix retry or whole upstream catalogue.

**Retained evidence:** Keep selected CLI/version/subcommand/target and complete first cause. The frontdoor alone cannot establish prior side effects, retry or clean remote state.

**Consumer / translation:** Exact owned error/return/status consumer selectors attached. no generic retry or global code meaning.

**Owning / consuming source:**

- [ops/pod/kubectl-build/main.go:19](../../../ops/pod/kubectl-build/main.go#L19)
- [tools/ops-mcp/hubble/main.go:6](../../../tools/ops-mcp/hubble/main.go#L6)
- [ops/pod/Dockerfile:27](../../../ops/pod/Dockerfile#L27)

<a id="go-python-observability-go-contract"></a>

## Local uncoded strict decoder/validator/digest errors, named-field detail parameters and forwarded JSON/canonicalizer error

**Representation:** code-absent

**Identity / construction:** Local uncoded strict decoder/validator/digest errors, named-field detail parameters and forwarded JSON/canonicalizer error

**Trigger:** Invalid canonical wire/UTF8/required-nullable fields, identifier/range/time/set attribution or digest inconsistency at actual decoder/validator.

**Effect:** Local data validation/hashing only in these functions. external caller chooses whether prior effects occurred. No generic store reset/replay/recovery or live delivery.

**Retry boundary:** Keep immutable record/closure and original parse/validation cause. correct exact contract input, do not rewrite evidence to conceal digest mismatch. External canonicalizer message remains open.

**Safe next action:** Keep immutable record/closure and original parse/validation cause. correct exact contract input, do not rewrite evidence to conceal digest mismatch. External canonicalizer message remains open.

**Retained evidence:** Preserve immutable record/closure bytes/digest, cause and owning caller state. no evidence rewrite, arbitrary replay, global reset or live-delivery inference.

**Consumer / translation:** Decode&#42; runs strict decode+required fields+local validator. ValidateCompleteness binds required/admitted/missing sets, gaps/attribution and state causes. Fixturecheck consumes these results and panics for actual errors or unexpected acceptance. fixture assertion text is not a product runtime code.

**Owning / consuming source:**

- [contracts/pipeline-observability/v1/go/types.go:23](../../../contracts/pipeline-observability/v1/go/types.go#L23)
- [contracts/pipeline-observability/v1/go/fixturecheck/main.go:12](../../../contracts/pipeline-observability/v1/go/fixturecheck/main.go#L12)

<a id="go-python-telemetry-go-declarations"></a>

## Generated Go `error/reason_code` fields of string, nullable or json.RawMessage type

**Representation:** declaration-not-emission

**Identity / construction:** Generated Go `error/reason_code` fields of string, nullable or json.RawMessage type

**Trigger:** No runtime constructor/throw/exit in these type-only parents. field availability declares a carrier, not a failure occurrence.

**Effect:** The exact diagnostic is propagated or recorded at its actual owned boundary. no universal operation effect is inferred.

**Retry boundary:** Do not generate active error meaning from a field name or promote retained schema availability to runtime emission/consumer guarantees. Actual serialized producers/consumers belong in their distinct language owner scope.

**Safe next action:** Do not generate active error meaning from a field name or promote retained schema availability to runtime emission/consumer guarantees. Actual serialized producers/consumers belong in their distinct language owner scope.

**Retained evidence:** Retain original schema/version/nullable/opaque boundary. actual emission/translation and consumers belong to separate qualified source families.

**Consumer / translation:** Exact owned error/return/status consumer selectors attached. no generic retry or global code meaning.

**Owning / consuming source:**

- [contracts/telemetry/v1/bundle_types.go:1](../../../contracts/telemetry/v1/bundle_types.go#L1)
- [contracts/telemetry/v1/telemetry_types.go:1](../../../contracts/telemetry/v1/telemetry_types.go#L1)

<a id="go-python-python-maintenance-reads-and-checks"></a>

## Uncoded SystemExit/RuntimeError/assertion and propagated Python/subprocess failures; collected failure flag→exit1

**Representation:** code-absent

**Identity / construction:** Uncoded SystemExit/RuntimeError/assertion and propagated Python/subprocess failures. collected failure flag→exit1

**Trigger:** Actual selected context/resource/prerequisite/dry-run/API read/policy-drift/agent readiness condition fails.

**Effect:** These named checks use API reads and selected server dry-run. verify-cilium also execs cilium-dbg in agent pods. Inspection does not establish encryption/authorization/reachability/global client completeness. No code here authorizes automatic sync, reset or policy widening.

**Retry boundary:** Preserve selected context/resource/field and actual first failure, retain incomplete reports. correct prerequisites or drift before adoption. Explicit current policy comparison is not universal negative-path/live-pipeline proof.

**Safe next action:** Preserve selected context/resource/field and actual first failure, retain incomplete reports. correct prerequisites or drift before adoption. Explicit current policy comparison is not universal negative-path/live-pipeline proof.

**Retained evidence:** Keep requested context/resource/field/first cause and incomplete report. no automatic sync/reset or credential disclosure. API reads/dry-run/agent exec remain distinct effects.

**Consumer / translation:** Exact owned error/return/status consumer selectors attached. no generic retry or global code meaning.

**Owning / consuming source:**

- [scripts/check-platform-adoption-live.py:1](../../../scripts/check-platform-adoption-live.py#L1)
- [scripts/check-runtime-adoption-live.py:20](../../../scripts/check-runtime-adoption-live.py#L20)
- [scripts/inspect-data-plane-mtls.py:76](../../../scripts/inspect-data-plane-mtls.py#L76)

<a id="go-python-python-maintenance-mutations"></a>

## Uncoded ValueError/RuntimeError/SystemExit through actual guards, require helper and subprocess failures

**Representation:** code-absent

**Identity / construction:** Uncoded ValueError/RuntimeError/SystemExit through actual guards, require helper and subprocess failures

**Trigger:** Wrong webhook list/concurrency, wrong exact legacy arguments/reservation state, changed unit/ref tip/origin/ancestry or mutation command failure.

**Effect:** Webhook --apply uses guarded JSON Patch list move with resourceVersion/name tests. dry-run is explanatory only. K3s repair verifies exact legacy argument removals and native drop-in, writes backup/staged unit, runs systemd verification then guarded install. it does not restart K3s and retains backup even on later failure. Branch cleanup fetches and verifies remote frozen refs. --apply leased atomic deletion is perbatch40, not whole-run atomic, so earlier batches can remain deleted after failure.

**Retry boundary:** Keep first failure, exact resourceVersion/unit/backup/ref tips and completed mutations. Do not bypass concurrency checks or broaden deletion/repair. Re-read owning state before resuming. no unconditional rollback.

**Safe next action:** Keep first failure, exact resourceVersion/unit/backup/ref tips and completed mutations. Do not bypass concurrency checks or broaden deletion/repair. Re-read owning state before resuming. no unconditional rollback.

**Retained evidence:** Keep webhook resourceVersion, original/staged K3s unit+backup, frozen branch tips/remote and completed deletion batches. earlier mutations are not automatically rolled back.

**Consumer / translation:** Exact owned error/return/status consumer selectors attached. no generic retry or global code meaning.

**Owning / consuming source:**

- [scripts/align-spire-webhook-order.py:12](../../../scripts/align-spire-webhook-order.py#L12)
- [scripts/repair-k3s-reservation-arguments.py:14](../../../scripts/repair-k3s-reservation-arguments.py#L14)
- [scripts/cleanup-consolidated-branches.py:9](../../../scripts/cleanup-consolidated-branches.py#L9)

<a id="go-python-ops-kubernetes-response-too-large"></a>

## Error.code = `KUBERNETES_RESPONSE_TOO_LARGE`

**Representation:** literal

**Identity / construction:** Error.code = `KUBERNETES_RESPONSE_TOO_LARGE`

**Trigger:** Streaming GET response bytes exceed maxBytes

**Effect:** Reject response and destroy request. createKubeList catches this code only, halves pageSize while retaining selector and continuation.

**Retry boundary:** Only this bounded read-page reduction is retried. stop at pageSize1 or deadline. Other errors propagate.

**Safe next action:** Preserve service/route/status/namespace and code separately from human text. Narrow oversized read. do not relax transport ceiling or treat generic failure as successful denial. No general mutation retry or pairing success follows.

**Retained evidence:** Keep service/route/status/query/namespace/continuation and original code/cause. do not expose bearer or infer successful denial from401/transport failure.

**Consumer / translation:** createKubeList actual catch checks code, pageSize and deadline before retry. failed attempts do not consume pages.

**Owning / consuming source:**

- [ops/pod/verify.py:8](../../../ops/pod/verify.py#L8)
- [tools/ops-mcp/src/kubernetes.mjs:7](../../../tools/ops-mcp/src/kubernetes.mjs#L7)
- [scripts/deploy-ops-pod.sh:47](../../../scripts/deploy-ops-pod.sh#L47)

<a id="go-python-ops-supervisor-process-state"></a>

## phase/controlSocketReady/pairingVerified:false and child return status

**Representation:** control-not-failure

**Identity / construction:** phase/controlSocketReady/pairingVerified:false and child return status

**Trigger:** Login/socket/direct process supervision transitions

**Effect:** Status is local process state. missing listener yields false, timeout kills/reaps direct child and returns124.

**Retry boundary:** Only owning supervisor loops described in exact source. no generic pairing/relay or descendant-termination assurance.

**Safe next action:** Keep persisted HOME and current child/control/status identity. Distinguish waiting-for-login from crash/startup failure. Do not turn local socket readiness or supervisor process state into enrollment/pairing/relay/API success.

**Retained evidence:** Keep persisted HOME/config/workspace and original child/control/status identity. status files and child effects may remain. pairingVerified stays false.

**Consumer / translation:** Chart readiness consumes phase==remote-process-running. this is not successful pairing or relay health.

**Owning / consuming source:**

- [ops/pod/supervisor.py:21](../../../ops/pod/supervisor.py#L21)
- [ops/pod/Dockerfile:76](../../../ops/pod/Dockerfile#L76)
- [charts/ops-pod/templates/workload.yaml:1](../../../charts/ops-pod/templates/workload.yaml#L1)

<a id="go-python-controller-api-error-forwarding"></a>

## apiError{statusCode,message}; Error() returns message from upstream API JSON.message/raw body/HTTP fallback

**Representation:** forwarded-error

**Identity / construction:** apiError{statusCode,message}. Error() returns message from upstream API JSON.message/raw body/HTTP fallback

**Trigger:** Non2xx Kubernetes response at exact request

**Effect:** Consumers branch on errors.As statusCode404/409 only at named caller. outer reconcile logs and may patch Failed after partial effects.

**Retry boundary:** No universal retry: named404 absence/409 POST→PATCH or version conflict rules only. preserve uncertain mutation outcome.

**Safe next action:** Retain leaseUID/generation/resourceVersion, namespace, status, partial effects and first API error. Polling is controller reconciliation, not authorization to replay the original external job or remove retained state. Correct owning input/authority. never bypass ownership/CAS guards or claim HTTP timeout means no mutation.

**Retained evidence:** Keep leaseUID/generation/resourceVersion, target namespace, status/conditions/log detail and partial Namespace/RBAC/Secret/exposure writes. no transaction or universal reset.

**Consumer / translation:** Typed status consumed by controller helpers, separate open message consumed by logs/status. unlike Ops JS client, API body text is not masked here.

**Owning / consuming source:**

- [cmd/buster-namespace-controller/main.go:98](../../../cmd/buster-namespace-controller/main.go#L98)
- [charts/kubeclaw/templates/buster-namespace-controller.yaml:1](../../../charts/kubeclaw/templates/buster-namespace-controller.yaml#L1)
- [docker/Dockerfile.namespace-controller:1](../../../docker/Dockerfile.namespace-controller#L1)

<a id="go-python-controller-structured-state-and-findings"></a>

## Lease phase/conditions and runtime:&lt;resource&gt;:&lt;finding&gt; id/severity/message

**Representation:** control-not-failure

**Identity / construction:** Lease phase/conditions and runtime:&lt;resource&gt;:&lt;finding&gt; id/severity/message

**Trigger:** Actual reconciliation state transition or security observation

**Effect:** Structured Failed/Rejected/Pending/Unavailable and findings are state/observations, not constructor exceptions or universal stable codes.

**Retry boundary:** Controller polling follows its guards. findings do not authorize resetting state, widening grants or deleting resources.

**Safe next action:** Retain leaseUID/generation/resourceVersion, namespace, status, partial effects and first API error. Polling is controller reconciliation, not authorization to replay the original external job or remove retained state. Correct owning input/authority. never bypass ownership/CAS guards or claim HTTP timeout means no mutation.

**Retained evidence:** Keep leaseUID/generation/resourceVersion, target namespace, status/conditions/log detail and partial Namespace/RBAC/Secret/exposure writes. no transaction or universal reset.

**Consumer / translation:** patchLeaseStatus CAS and runtimeSecurityStatus record/compare owning state. logs and errors remain separate.

**Owning / consuming source:**

- [cmd/buster-namespace-controller/main.go:98](../../../cmd/buster-namespace-controller/main.go#L98)
- [charts/kubeclaw/templates/buster-namespace-controller.yaml:1](../../../charts/kubeclaw/templates/buster-namespace-controller.yaml#L1)
- [docker/Dockerfile.namespace-controller:1](../../../docker/Dockerfile.namespace-controller#L1)

<a id="go-python-nri-open-forwarded-errors"></a>

## readConfiguration OS/JSON errors; stub.New/run client.Run returned error

**Representation:** forwarded-error

**Identity / construction:** readConfiguration OS/JSON errors. stub.New/run client.Run returned error

**Trigger:** Actual OS, parser or external selected NRI SDK/runtime failure

**Effect:** Main prints returned error to stderr and exits1. callback result interpretation stays external.

**Retry boundary:** Correct exact owning failure. no inferred all-code retry, reset or live callback success.

**Safe next action:** Keep selected binary/policy/version/role/sandbox identity. Correct owned rejection before admission. do not restart services, clear pools or reinterpret arbitrary SDK failure as one fixed NRI code. Host activation/upstream SDK consumers require their own closure before any stronger claim.

**Retained evidence:** Keep selected binary/policy/version/role/sandbox and first error. no generic service restart/state removal. External SDK vocabulary/callback delivery remains open.

**Consumer / translation:** Owned main run/policy-check exits. external SDK Configure/CreateContainer interpretation explicitly OPEN.

**Owning / consuming source:**

- [tools/native-worker-nri/main.go:37](../../../tools/native-worker-nri/main.go#L37)
- [scripts/install-native-worker-pools-stage.sh:6](../../../scripts/install-native-worker-pools-stage.sh#L6)
- [scripts/activate-native-worker-ax41.sh:22](../../../scripts/activate-native-worker-ax41.sh#L22)

<a id="go-python-nri-owned-build-install-activation"></a>

## Selected Go build/render, root-only install/activation/failed-launch repair guards and child nonzero exits

**Representation:** code-absent

**Identity / construction:** Selected Go build/render, root-only install/activation/failed-launch repair guards and child nonzero exits

**Trigger:** Builder rejects existing output and wrong selected Go version, verifies modules then builds with readonly module mode. Child failures propagate through execFileSync with inherited output. It may leave new output/cache/module state after failure. no rollback promised. Renderer validates node policy and selected Node/containerd versions. In a new exclusive directory, it emits native-nri.json, the containerd NRI enable stanza and pool/systemd files. The JSON binds the exact role namespace, container and policyDigest. later file failure can leave partial bundle. No host installation or target runtime is run by rendering. . Root-only initial install checks actual built binary --check-policy and selected host Node before writes. refuses active service or preexisting target files/symlinks. Rewrites exact generated systemd Node executable into staged unit, installs owned policies/helper/plugin/systemd, verifies unit, reloads and starts pool service. Failure can leave earlier installed files/pool state. Explicitly neither enables boot nor activates NRI/restarts K3s. safe action is inspect retained actual state, not rerun blindly against existing files or restart active pools. . Root/selected-host initial path requires running pools, absent configuration targets and inspected kubelet/containerd authority. Captures backups/node/configz/agents, compares generated/installed policies and invokes policy-check. Embedded guards reject old-agent activity, mismatched runtime, uninspected config, unsupported cgroups/capacity or legacy overrides before mutation. Later backs up unit/config, saves etcd snapshot, installs kubelet/containerd/systemd configuration, reloads/enables and actually restarts K3s if executed. API/node readiness failures or later preflight/pgrep failures occur after mutations. keep SSH/backup/snapshot and diagnose. Process found and preflight success explicitly leave real worker adjustment unverified. . Root selected repair refuses an already running plugin and requires active pools/preflight. It retains the original binary backup and runs scoped Go tests plus selected builder/policy checks. It installs the replacement, restarts K3s and checks Node, preflight, process and log evidence. Repeated node-poll misses do not alone trigger explicit loop failure. later wait/preflight determines stop under set-e. No automatic restoration of old binary/config or universal rollback. retain backup and exact post-restart state. Registration logs/process do not establish callback adjustment.

**Effect:** Builder rejects existing output and wrong selected Go version, verifies modules then builds with readonly module mode. Child failures propagate through execFileSync with inherited output. It may leave new output/cache/module state after failure. no rollback promised. Renderer validates node policy and selected Node/containerd versions. In a new exclusive directory, it emits native-nri.json, the containerd NRI enable stanza and pool/systemd files. The JSON binds the exact role namespace, container and policyDigest. later file failure can leave partial bundle. No host installation or target runtime is run by rendering. . Root-only initial install checks actual built binary --check-policy and selected host Node before writes. refuses active service or preexisting target files/symlinks. Rewrites exact generated systemd Node executable into staged unit, installs owned policies/helper/plugin/systemd, verifies unit, reloads and starts pool service. Failure can leave earlier installed files/pool state. Explicitly neither enables boot nor activates NRI/restarts K3s. safe action is inspect retained actual state, not rerun blindly against existing files or restart active pools. . Root/selected-host initial path requires running pools, absent configuration targets and inspected kubelet/containerd authority. Captures backups/node/configz/agents, compares generated/installed policies and invokes policy-check. Embedded guards reject old-agent activity, mismatched runtime, uninspected config, unsupported cgroups/capacity or legacy overrides before mutation. Later backs up unit/config, saves etcd snapshot, installs kubelet/containerd/systemd configuration, reloads/enables and actually restarts K3s if executed. API/node readiness failures or later preflight/pgrep failures occur after mutations. keep SSH/backup/snapshot and diagnose. Process found and preflight success explicitly leave real worker adjustment unverified. . Root selected repair refuses an already running plugin and requires active pools/preflight. It retains the original binary backup and runs scoped Go tests plus selected builder/policy checks. It installs the replacement, restarts K3s and checks Node, preflight, process and log evidence. Repeated node-poll misses do not alone trigger explicit loop failure. later wait/preflight determines stop under set-e. No automatic restoration of old binary/config or universal rollback. retain backup and exact post-restart state. Registration logs/process do not establish callback adjustment.

**Retry boundary:** Stop on first failed prerequisite/child/guard. retain original identities and any partial staging or host state. No automatic rollback, repin or generic retry.

**Safe next action:** Use exact qualified guard and original identity to diagnose before resuming. preserve backups/parts and independent host access where applicable.

**Retained evidence:** Selected source/tool/input hash. first stderr/status/output. private build/cache effects and actual staged files/backups/installed state where applicable.

**Consumer / translation:** Builder rejects existing output and wrong selected Go version, verifies modules then builds with readonly module mode. Child failures propagate through execFileSync with inherited output. It may leave new output/cache/module state after failure. no rollback promised. Renderer validates node policy and selected Node/containerd versions. In a new exclusive directory, it emits native-nri.json, the containerd NRI enable stanza and pool/systemd files. The JSON binds the exact role namespace, container and policyDigest. later file failure can leave partial bundle. No host installation or target runtime is run by rendering. . Root-only initial install checks actual built binary --check-policy and selected host Node before writes. refuses active service or preexisting target files/symlinks. Rewrites exact generated systemd Node executable into staged unit, installs owned policies/helper/plugin/systemd, verifies unit, reloads and starts pool service. Failure can leave earlier installed files/pool state. Explicitly neither enables boot nor activates NRI/restarts K3s. safe action is inspect retained actual state, not rerun blindly against existing files or restart active pools. . Root/selected-host initial path requires running pools, absent configuration targets and inspected kubelet/containerd authority. Captures backups/node/configz/agents, compares generated/installed policies and invokes policy-check. Embedded guards reject old-agent activity, mismatched runtime, uninspected config, unsupported cgroups/capacity or legacy overrides before mutation. Later backs up unit/config, saves etcd snapshot, installs kubelet/containerd/systemd configuration, reloads/enables and actually restarts K3s if executed. API/node readiness failures or later preflight/pgrep failures occur after mutations. keep SSH/backup/snapshot and diagnose. Process found and preflight success explicitly leave real worker adjustment unverified. . Root selected repair refuses an already running plugin and requires active pools/preflight. It retains the original binary backup and runs scoped Go tests plus selected builder/policy checks. It installs the replacement, restarts K3s and checks Node, preflight, process and log evidence. Repeated node-poll misses do not alone trigger explicit loop failure. later wait/preflight determines stop under set-e. No automatic restoration of old binary/config or universal rollback. retain backup and exact post-restart state. Registration logs/process do not establish callback adjustment.

**Owning / consuming source:**

- [scripts/build-native-worker-nri.mjs:1](../../../scripts/build-native-worker-nri.mjs#L1)
- [scripts/activate-native-worker-ax41.sh:1](../../../scripts/activate-native-worker-ax41.sh#L1)
- [scripts/install-native-worker-pools-stage.sh:1](../../../scripts/install-native-worker-pools-stage.sh#L1)

<a id="lua-application-health-condition-degraded"></a>

## lua:application-health:condition-degraded

**Representation:** upstream-condition-translation

**Identity / construction:** Argo Application health status and message; not a thrown exception or stable runtime error code.

**Trigger:** Matched upstream condition.type from exact seven-key set. first matching condition yields Degraded and condition.message or condition.type.

**Effect:** Returns an Argo Application health result. does not throw an owned runtime error.

**Retry boundary:** No retry loop or repair action in Lua. a projected health value does not prove cause or resolution.

**Safe next action:** The Lua projection performs no repair or retry. Inspect the child Application and its sync/health evidence before changing deployment state.

**Retained evidence:** Read-only evaluation of supplied fields. no durable-state mutation or retention guarantee.

**Consumer / translation:** Actual readFile/set-file/installed exactness chain from scripts/argocd-self-management.mjs, deploy-argocd.sh, gitops.mjs. No invented chart Files.Get loader.

**Owning / consuming source:**

- [charts/gitops/files/application-health.lua:1](../../../charts/gitops/files/application-health.lua#L1)
- [scripts/argocd-self-management.mjs:1](../../../scripts/argocd-self-management.mjs#L1)
- [scripts/deploy-argocd.sh:1](../../../scripts/deploy-argocd.sh#L1)

<a id="lua-application-health-operation-degraded"></a>

## lua:application-health:operation-degraded

**Representation:** upstream-phase-translation

**Identity / construction:** Argo Application health status and message; not a thrown exception or stable runtime error code.

**Trigger:** operationState phase Failed or Error yields Degraded before observed mode.

**Effect:** Returns an Argo Application health result. does not throw an owned runtime error.

**Retry boundary:** No retry loop or repair action in Lua. a projected health value does not prove cause or resolution.

**Safe next action:** The Lua projection performs no repair or retry. Inspect the child Application and its sync/health evidence before changing deployment state.

**Retained evidence:** Read-only evaluation of supplied fields. no durable-state mutation or retention guarantee.

**Consumer / translation:** Actual readFile/set-file/installed exactness chain from scripts/argocd-self-management.mjs, deploy-argocd.sh, gitops.mjs. No invented chart Files.Get loader.

**Owning / consuming source:**

- [charts/gitops/files/application-health.lua:1](../../../charts/gitops/files/application-health.lua#L1)
- [scripts/argocd-self-management.mjs:1](../../../scripts/argocd-self-management.mjs#L1)
- [scripts/deploy-argocd.sh:1](../../../scripts/deploy-argocd.sh#L1)

<a id="lua-application-health-observed-health"></a>

## lua:application-health:observed-health

**Representation:** upstream-health-control-projection

**Identity / construction:** Argo Application health status and message; not a thrown exception or stable runtime error code.

**Trigger:** Only observed annotation path, after error/failed-operation guards. returns upstream health status/message or Progressing/Waiting for child health.

**Effect:** Returns an Argo Application health result. does not throw an owned runtime error.

**Retry boundary:** No retry loop or repair action in Lua. a projected health value does not prove cause or resolution.

**Safe next action:** The Lua projection performs no repair or retry. Inspect the child Application and its sync/health evidence before changing deployment state.

**Retained evidence:** Read-only evaluation of supplied fields. no durable-state mutation or retention guarantee.

**Consumer / translation:** Actual readFile/set-file/installed exactness chain from scripts/argocd-self-management.mjs, deploy-argocd.sh, gitops.mjs. No invented chart Files.Get loader.

**Owning / consuming source:**

- [charts/gitops/files/application-health.lua:1](../../../charts/gitops/files/application-health.lua#L1)
- [scripts/argocd-self-management.mjs:1](../../../scripts/argocd-self-management.mjs#L1)
- [scripts/deploy-argocd.sh:1](../../../scripts/deploy-argocd.sh#L1)

<a id="lua-application-health-strict-selected-revision"></a>

## lua:application-health:strict-selected-revision

**Representation:** provenance-and-health-control

**Identity / construction:** Argo Application health status and message; not a thrown exception or stable runtime error code.

**Trigger:** Exact selected revision, compared source/destination/directory and successful operation checks, including explicit immutable main bundle exception. Missing or mismatched provenance returns pending. non-Healthy health projects upstream status/message. final Healthy is control.

**Effect:** Returns an Argo Application health result. does not throw an owned runtime error.

**Retry boundary:** No retry loop or repair action in Lua. a projected health value does not prove cause or resolution.

**Safe next action:** The Lua projection performs no repair or retry. Inspect the child Application and its sync/health evidence before changing deployment state.

**Retained evidence:** Read-only evaluation of supplied fields. no durable-state mutation or retention guarantee.

**Consumer / translation:** Actual readFile/set-file/installed exactness chain from scripts/argocd-self-management.mjs, deploy-argocd.sh, gitops.mjs. No invented chart Files.Get loader.

**Owning / consuming source:**

- [charts/gitops/files/application-health.lua:1](../../../charts/gitops/files/application-health.lua#L1)
- [scripts/argocd-self-management.mjs:1](../../../scripts/argocd-self-management.mjs#L1)
- [scripts/deploy-argocd.sh:1](../../../scripts/deploy-argocd.sh#L1)

<!-- END GENERATED: common error catalogue -->
