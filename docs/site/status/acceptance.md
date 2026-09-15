# Operational and live acceptance

Status: planned; not executed  
Audience: operators and executing agents  
Owner: platform operator  
Evidence: .github/workflows/remediation-native.yaml; tests/verification/contracts/check-production-receipt-attestation.mjs  
Applies to: KubeClaw source checkpoint `ad67f9bb5c75cfa8cc1b926668aec1dd0168452c`  
Last verified: 2026-09-15 — documentation/source reconciliation; no new test execution

**141 of the original 154 findings are locally verified; 13 remain incomplete.** Five additional integration findings are locally verified separately. These counts assess code remediation under [D12](../decisions/acceptance.md#d12--accepted-local-completion-policy), not acceptance of a running system. Current implementation gaps belong in the [open issue register](open-issues.md).

This page defines outstanding operational evidence and preserves the limits of inherited local evidence. **All complete gates planned here remain open.** Existing native subtests retain their documented value; they do not establish a complete operational pass. AP04 executed none of these tests. G01–G14 follow the original work packages; the [provenance index](../decisions/acceptance.md) maps all original 154 and five additional finding IDs. Gate groups are not additional findings. G15 carries the separate Echo promotion requirement.

## Prerequisites and result contract

Before execution, the operator selects an isolated environment, immutable repository commit, release/bundle commit and actual running image digests. Node/npm, database, browser and tool versions follow that checkpoint's lockfiles and `versions.json`. Missing capacity, endpoints, identities, signing keys, cgroup delegation or a justified measurement threshold are missing prerequisites. Do not guess them or substitute test doubles.

Each execution record includes gate and finding IDs, UTC timestamp, environment, source commit, release/image/browser identities, exact command and nonsecret parameters, exit status, executed/skipped counts, unchanged original outputs and result artifacts with digests. Mutating tests also record the test project/namespace, responsible operator, prior backup, injected failure and verified cleanup. Secrets stay in the intended private access mechanism; public evidence must not contain platform tokens.

Record **passed**, **failed**, **blocked** or **not executed** per gate. Exit code zero counts only when the intended scope actually ran. Zero cases, all-skipped suites, empty reports, file existence, schema validation, model-written reports and compiled graphs are not execution evidence. Preserve failed runs separately from successful retries. Changes to source, browser baseline, required scope or identity invalidate the affected acceptance result.

The procedures below require an environment approved for their actual effects. D12 does not grant that environment approval. A passing subtest does not close an incomplete implementation finding. Commands requiring operator-selected values are not ready-to-run configurations.

## G01

### Contracts, SDK and installable packages

**Scope:** WP01; also INT-BOUNDARY001, INT-STARTUP-LATENCY001 and INT-OBSERVER-BUILD001.

**Prerequisites:** Clean checkout, original workspace packages and lockfiles, real generators and build/install tools. Use registered consumers, without substitute registrations or stale generated caches.

**Procedure:** Generate, build original source packages and register/install them in a fresh workspace. Connect real publishers and readers with valid and invalid data. Exercise depth, size, cycles, shared noncyclic references, incorrect media types and unknown tags. Carry supported historical codecs and current profiles through locale changes, snapshots, crashes and replay. Offer equal bytes from a different producer to test identity ownership.

**Pass conditions:** Validation is bounded and fails controllably. Original data and producer/schema/profile identity survive without a hidden new legacy fallback. Equal content does not transfer producer authority. A selected SDK consumer test proves that consumer, not model execution or the whole product. Use only the legitimate test environment and original authorized consumers. A historical unavailable helper is not evidence that its test ran.

## G02

### Durable state, effects and recovery

**Scope:** WP02, particularly PCR-STATE-001/002 and PCR-EFFECT-001; external review reconciliation also INT-REVIEW-UNCERTAIN001.

**Prerequisites:** Original stores, multiple real processes on the intended filesystem, isolated data and a controlled external receiver for uncertain effects.

**Procedure:** Start concurrent mutations and SIGKILL processes at journal, effect and projection boundaries. Reopen valid journal prefixes; supply tampered, oversized and foreign references. Execute an external effect once, lose its response, then resume. Compare waits, artifacts, results and retention fences before and after restart.

**Pass conditions:** One owner per critical section, no lost durable wait/artifact state and identity-bound deterministic replay. Reconcile an uncertain external effect instead of blindly repeating it. Release resources only after durable closure and proven owner termination. The incomplete broader retention finding PCR-OBS-002 remains explicitly open under G09.

## G03

### Workers, kernel limits, supervisors and cancellation

**Scope:** WP03; also PCR-SCAFFOLD-OPS-001 and Prism resources under G07.

**Prerequisites:** Original compiled sandbox; Linux with readable process-tree procfs, writable delegated cgroup v2, legitimate credential drop to nonprivileged UID/GID and measurable CPU/memory enforcement. A production acceptance run must use the actual runner integrated with the attempt host, including capability/broker work. PCR-BUSTER-ENGINE-001 and -004 remain incomplete.

**Procedure:** Run parallel attempts. Exercise early stdin closure, UTF-8 chunk boundaries, stalled downloads, lost submit responses, hanging children/grandchildren, TERM and host SIGKILL. Restart the supervisor; inject status-read and terminal-status-write errors and observe admission/queue drain. Measure kernel OOM, CPU/deadline limits and fixture teardown within the same attempt owner. After restart, require proven quiescence before deleting owned resources.

**Existing entrypoints:** `node tests/verification/contracts/check-plugin-system-v2-isolation-kernel.mjs <delegated-cgroup-root> <nonzero-drop-uid> <nonzero-drop-gid>`, `node tests/verification/contracts/check-pipeline-remote-process-restart.mts`, and `node --test scripts/tests/integration/repository-review-supervisor-adoption.mjs`. Placeholders require real operator-selected values.

**Pass conditions:** No surviving orphan work; parent PID alone is not ownership proof. Shared parent usage must not be charged repeatedly to concurrent attempts. Absolute deadlines include final work. Readback confirms enforced limits and memory exhaustion has kernel effect. Status errors remain visible; uncertain metadata never authorizes deletion. A supervisor start/lease test or terminal cleanup helper alone does not prove this gate.

## G04

### Approvals, repair budgets and risk acceptance

**Scope:** WP04.

**Prerequisites:** Real project, source/plan/module identities and authorized operator route. Lint, enabled review and tests have explicit required scopes.

**Procedure:** Inject category-specific failures and two repair rounds per category, including restart between repair and recheck. Change source, replay old approval/guidance and observe invalidation of dependent gates. After exhaustion, allow exactly one additional Nova repair assignment and make its required rechecks fail. Attempt risk acceptance with valid and foreign/stale source/requester identities.

**Pass conditions:** Separate monotonic budgets survive restart; pure rechecks do not consume repair rounds. Source changes invalidate affected approvals transitively. Exhaustion leads to Needs Nova; failed additional work leads to blocked. No autonomous reduction of mandatory scope. Success on the last permitted repair is not blocked merely because the counter reached its limit.

## G05

### Forge, Git concurrency and workspace ownership

**Scope:** WP05.

**Prerequisites:** Two independent authorized worktrees and a controlled Git remote; production branches are not failure fixtures.

**Procedure:** Execute independent modules in their actual separate working directories. Contend on short Git mutations, create a merge conflict and lose a push response after remote success. Inject cleanup failure followed by recovery; test symlink/path escape. A deleted or foreign workspace must not acquire new authority.

**Pass conditions:** No work in another workspace, bounded cancellable lock waits, precise conflict causes, push reconciliation instead of blind duplication and ownership-bound cleanup. Branch consolidation and equal trees prove provenance, not execution of these product paths.

## G06

### Executed quality gates and eleven production receipts

**Scope:** WP06; additional Echo promotion under G15.

**Prerequisites:** Registered Buster providers, attested source, authenticated Nova/Buster route and real suite dependencies. Install Chromium from the locked Playwright package and record its actual executable path/version. BuildKit, registry, Kubernetes, Tailnet, scanner database and target application must actually be available.

**Procedure:** For each of the eleven successors, run the current `tests/verification/e2e/nova-*-production-preflight.mts` identified below. Exercise success and a real defect, independently validate the signed receipt and check the final Nova consumer. Required all-skipped cases, zero HTTP requests, empty JUnit suites, missing success outputs, corrupt reports and stale source/browser identity must fail. Then run cumulative checks across a multi-module project: a defect involving an earlier module must not disappear because the last module passes.

| Former suite | Registered successor | Preflight suffix | Specific evidence |
| --- | --- | --- | --- |
| unit | kubeclaw.direct-command@1 | unit | Executed mandatory cases and typed output artifacts |
| build | kubeclaw.container-build@1 | buildkit | Real image, digest and registry verification within one deadline |
| k8s | kubeclaw.kubernetes-fixture@1 | kubernetes-fixture | Running fixture, admission, rollout and verified cleanup |
| health | kubeclaw.http@1 | http | Actual requests against the bound endpoint |
| tailscale-preview | kubeclaw.tailscale-exposure@1 | tailscale | Externally signed executing revision and independent cleanup receipt |
| api | kubeclaw.api-suite@1 | api | OpenAPI contract and executed API flows, beyond parser checks |
| a11y | kubeclaw.axe@1 | a11y | Axe in real Chromium against the bound application |
| perf | kubeclaw.lighthouse@1 | lighthouse | Real browser execution against the agreed budget |
| visual-reg | kubeclaw.visual@1 | visual | Approved baseline with matching browser/workload identity |
| e2e | kubeclaw.e2e-suite@1 | e2e | Playwright interactions in the actual application path |
| security | kubeclaw.security-suite@1 | security | Real scanner, database freshness and source/image binding |

`manifest → lint:kubernetes-policy` and `bundle → kubeclaw.size-budget@1` have complete local parity in the pinned suite inventory and require no separate production receipt there. Their required checks still apply. For the other eleven, completed source cutover is not completed production acceptance.

**Pass conditions:** Every successful suite has its complete authenticated receipt and executed scope. Schema checks alone do not attest an executing worker. Expected defect cases remain failures in the appropriate result field. Missing Chromium, ESLint configuration, shell tools or complete reports must not be hidden with stub tests. `tests/verification/contracts/check-production-receipt-attestation.mjs` checks the local receipt contract; real signing and execution identity come from the actual production run.

## G07

### Prism database, jobs, sessions and resources

**Scope:** WP07.

**Prerequisites:** Isolated native PostgreSQL with pgvector and multiple connections; intended migrations, actual Control/Agent/Worker processes and bound OpenClaw sessions. The test owner may create/drop temporary databases. For the existing wrapper, `PRISM_TEST_PG_URL` must identify a dedicated loopback service.

**Procedure:** Use `npm run test:corpus-pool --workspace @kubeclaw/prism`, `node skills/prism/tests/native/postgres-suite.mts transactions`, and `node skills/prism/tests/native/postgres-suite.mts worker-readiness` for pool/transaction/cancellation boundaries. Then restart actual services around claim, commit and lost HTTP response; repeat concurrent/late rounds, preferences, stale fences, namespace/session collisions and idempotent decisions. Disconnect the HTTP client, cancel upload/SQL and send SIGTERM/SIGINT during evidenced active work. Measure parallel attempt CPU including owned descendants and seal results durably before releasing resources.

**Pass conditions:** One transaction owner with atomic consistent writes, no leaked pool connection, duplicated external agent effect or lost decision. Service drain waits for owned work and releases capacity within bounds. A `/readyz` response before CRD installation proves that point only, not Established/migration readiness. PGlite and query doubles do not prove pooled native PostgreSQL. Existing native subtests retain their actual scope without automatically proving a full service/session journey.

## G08

### Prism browser, Studio, artifacts and retained memory

**Scope:** WP08.

**Prerequisites:** Locked real Chromium, original built Studio assets, authenticated CAS and actual browser/baseline identity. Declare and justify the retained-growth byte limit before measurement; do not adjust it after seeing results.

**Procedure:** Run `npm run test:studio-remediation --workspace @kubeclaw/prism` for iframe, navigation/pagination, actions, image decoding and errors. Use `node skills/prism/integration/worker-browser-cancellation.mts` for owned browser cancellation/drain. Run `npm run test:engine:native-retention --workspace @kubeclaw/prism -- --max-retained-growth-bytes=BYTES --captures-per-window=32` only after selecting a real BYTES value. Exercise descendant moves, recursive duplication, variants and state patches through the real UI; tamper with assets and restart Control.

**Pass conditions:** Correct visible interactions, authenticated artifact bytes/digests/sizes and controlled failures. Native capture produces real PNG/ARIA output. Completed cache entries obey count/byte limits; coalescing preserves active ownership. Retained heap is distinct from browser child-process memory and complete Worker/Control persistence, which require G03/G07. Renderer or baseline-codec checks do not approve a new real browser baseline.

## G09

### Observability, retention and operator delivery

**Scope:** WP09; also INT-DEPENDENCY-OWNER001.

**Prerequisites:** Original state/artifact/telemetry stores, actual authorized Clawdeck/receiver route and verifiable delivery receipt. PCR-OBS-002 remains incomplete implementation work.

**Procedure:** Deliver large original outputs as linked artifacts. Restart observers and receivers during replay and lost acknowledgement. A retry must perform a new actual delivery attempt. Offer equal-looking foreign artifacts, changed parent/attempt identities and expired/forged receipts. Compare acknowledged history, active references, quotas, projection/admission fences, dispatch retirement and supported older codecs across restart.

**Pass conditions:** No silent truncation of stored originals, lost causes, foreign receipt authority or premature resource release. Display truncation is explicitly labeled while the original remains complete. Only pipeline-generated demo credentials fall under the accepted private diagnostic exception; platform secrets remain protected. A local HTTP acknowledgement does not prove Clawdeck/Discord delivery or human receipt. Bounded projections are not a complete retention policy across all consumers.

## G10

### Demo, Kubernetes admission, Tailnet and human acceptance

**Scope:** WP10; also T01-F02 from WP14.

**Prerequisites:** Isolated cluster, actual namespace controller, CRDs, DNS and Tailnet authentication; bound Ready producer, real operator identity and demo credentials from the intended producer. Signing keys stay private.

**Procedure:** Create namespace and exposure for the exact tested source/run/attempt. Execute positive and negative native admission cases for decision/status/generation, including stale/foreign decisions and forbidden additional fields. Open the application through DNS/Tailnet, log in and verify credential delivery. Lose and replay the Ready response. Test the default week of retention starting at Ready for Acceptance, extension, expiry warning, early cleanup and expired demo behavior; clean up namespace, URL and credentials together. Record explicit human acceptance and later change requests against the exact version.

**Pass conditions:** Ready means tested and delivered; accepted requires the human. Old acceptance remains historically valid but does not authorize a new version. Generation/UID/receipt bindings reject stale cleanup and Ready acknowledgements. Tailnet execution revision and cleanup proof come from independent authenticated receipts. Schema/CEL/CAS fixtures and 24 operation/status combinations do not prove a running controller. Historical 384-domain plus 384-extra-field checks must not be described indiscriminately as 768 negative live cases. Faulty historical stale-cleanup/expiry fixtures are not demonstrated product defects.

## G11

### Release identity, registry, mirrors and GitHub permissions

**Scope:** WP11.

**Prerequisites:** Controlled registry with actual PVC/CSI, BuildKit/CRI clients, configured CA/auth, immutable release bundle and reproducible builds. GitHub checks use actual PR/publication jobs. IFR-21-001 and IFR-29-001 remain incomplete.

**Procedure:** Build from clean source and compare published OCI descriptor/platform digests, deployed pod imageIDs and active role bundle. Restart/move the registry pod; after planned offline garbage collection, pull referenced manifests/layers again and measure unreferenced storage release. Test cache misses and hits through both BuildKit and node CRI, then a defined upstream outage. Trigger stale scanner-database refusal. In actual GitHub jobs, check PR read permissions separately from publication privileges.

**Pass conditions:** The exact tested release is used, without private or mutable substitute references. Data survives real storage/pod changes. Ephemeral-to-PVC changes are not silently accepted as safe upgrades. Offline GC follows an exclusive maintenance procedure. Mirror configuration works in every actual client. A timed-out GHCR call, YAML pin check or Helm render proves neither OCI availability nor effective GitHub permissions. The local Distribution 3.0.0 GC result releasing 65,536 unreferenced bytes is bounded evidence, not CSI/capacity acceptance.

## G12

### Networking, identities, Envoy and access boundaries

**Scope:** WP12; SPIRE operations and Cilium migration also G13.

**Prerequisites:** Test cluster using the actual selected CNI, real SPIRE/Envoy identities, Tailnet route, namespace/secret RBAC and intended BuildKit isolation. Unresolved Tailnet/BuildKit decisions remain implementation issues.

**Procedure:** Exercise DNS, egress and inter-namespace access with permitted and foreign identities. Rotate Envoy/SVID, replace a peer and remove dependencies. Observe health/readiness boundaries and real alert receipt. Test secret access, namespace broker, Archviewer Tailnet authentication and Ops MCP with the actual service accounts. Assess Codex exec access independently from MCP read tools.

**Pass conditions:** Denial occurs at the real trust boundary, rollouts are selective and failures are bounded/observable. A local Envoy certificate rotation or self-probe does not prove the later live peer/alert chain. Default exec namespaces `[kubeclaw]` can expose token/kubeconfig to Codex: read-only MCP tools do not make a shared service account read-only. `execNamespaces: []` disables this exec access. `can-i` assesses authorization; it does not execute the operation.

## G13

### GitOps, stateful services, restore and capacity

**Scope:** WP13. The later “main versus resolved SHA” GitOps health mismatch is separate from the original 154 and is tracked in the open register.

**Prerequisites:** Isolated cluster with real storage class/PVCs, declared capacity, backed-up state and selected immutable bundle commit. Existing Helm resources require a checked ownership transfer. Helm and Argo must not concurrently manage the same resources.

**Procedure:** Bootstrap with WaitForFirstConsumer, first sync and readiness. A failed migration must block subsequent waves. Exercise drift/self-heal, Git failure and registry failure with uncached images. For runtime Applications compare actual `spec.source.targetRevision`, `status.sync.revision` and `status.operationState.syncResult.revision`: branch selection must resolve to the intended immutable revision and be evaluated correctly. Roll back only to a tested compatible bundle, preserving PVC UIDs and test data.

For Redis, PostgreSQL/pgvector, LiteLLM and Qdrant, write data, execute the documented migration and replace service/pod and, where required, node; verify integrity and restart. Create matching database/artifact backup groups using real scheduled jobs, validate them and restore into an empty isolated target. Test wrong keys, corrupt/missing members, quotas and premature deletion of previous backups. Record upgrade/rollback versions and tools in the actual image. Measure capacity, recovery access and SPIRE failure with real resources. Accept Cilium only after its migration/rollback plan is resolved, separately from the current Flannel deployment.

**Pass conditions:** No success at the wrong revision, data loss or implicit database downgrade/restore. The current combination of `targetRevision: main` and literal comparison with resolved status SHAs is a source-confirmed technical gap, not a demonstrated live outage. Platform autosync and manual child/runtime sync are distinct. Application-server readiness does not establish Devbox pairing.

Local GitOps evidence uses real Git/Helm/Lua/filesystem operations but fixture cluster responses, digests and SQL commands. Native Redis checks, PostgreSQL cryptographic restores and consecutive-version Qdrant full snapshots retain their actual scope. Real scheduling, installed CSI, complete cross-service restore and unresolved infrastructure prerequisites remain separate. IFR-26-001 stays incomplete until missing full recovery coverage is implemented.

## G14

### Complete user journey and evidence-backed final report

**Scope:** WP14, integrating G01–G13.

**Prerequisites:** Actual Nova→Forge→Buster→Prism/product/operator route, bound source, registered engines/providers and mandatory prechecks. Model/review functions use their intended real services. Echo defaults off; Buster defaults on. The separately optional test agent does not replace mandatory deterministic tests.

**Procedure:** Execute a complete project from requirement/architecture through modules, tests, demo and delivery to human approval. Distinguish design/no-design paths and enabled optional reviews. Add Git conflicts, provider failures, lost dispatch/delivery acknowledgements, resume and exhausted repair budgets. Existing `node tests/verification/live/prism-nova-production-e2e.mjs` and `node tests/verification/live/prism-production-failures.mjs` are actual mutating entrypoints, not universal coverage of all crash prefixes.

The first requires `PRISM_CONTROL_URL`, `PRISM_AGENT_URL`, `PRISM_E2E_INGRESS_SECRET` and `PRISM_E2E_USER`. The failure entrypoint requires, among other inputs, `PRISM_NAMESPACE`, `PRISM_BUSTER_DEFECT_RESULT_FILE` and `PRISM_BUSTER_CORRECTED_RESULT_FILE`; its original source defines the full current contract. Result files must come from real selected runs, not invented defect/success receipts.

**Pass conditions:** The final report uses the authoritative run/source/attempt-bound reader; model text remains a draft. Failed, cancelled and unexecuted work stays visible. No stale approval, foreign artifact identity or duplicated external effect after resume. Compiled graphs, offline materialization, plugin parity, local report readers and individual HTTP tests do not establish a full executed journey or human product acceptance.

## G15

### Echo promotion as a separate product decision

**Scope:** Additional acceptance obligation from Echo phase 9; no new original finding ID. Connects review requirements in WP06.

**Prerequisites:** Corrected paired corpus of genuinely defective and proven final fixed revisions, stable actual model/transport execution and independent adjudication. Historically four of twelve pairs were incomplete due to transport failures, three “clean” controls still had defects, one genuine P0 was rejected and one claim used requirements instead of source proof. Those data cannot establish a reliable promotion percentage.

**Procedure:** Correct each pair's ground truth before measurement. Execute at least two complete batches. Require direct source evidence, inspect the full enclosing guard and explain every rejected P0 identity/authority finding. Keep P1 nonblocking in shadow runs. Do not extrapolate from incomplete batches.

**Pass conditions:** Two complete batches show no new failure class, no false P0 on clean code and no missed seeded P0. Continue shadow evaluation until then. This documentation migration does not enable Echo as a production blocker.

## Existing automation and its scope

`.github/workflows/remediation-native.yaml` checks static Knip/integration types, isolated native PostgreSQL suites, Studio in a real browser and supervisor operations. PostgreSQL follows `versions.json` → `automation.prismTestPostgres`; the wrapper creates and cleans a fresh database per suite. These jobs do not replace cgroup/OOM tests, actual cloud/Tailnet/registry privileges or the full release/backup/operator journey. A green workflow is not a blanket pass for this page.

## Provenance and local proof boundaries

The 995 AP03 source decisions targeting these acceptance pages include local subtests and historical failed runs; each source does not create a new live test. They are consolidated by obligation: contracts/codecs G01; journals/replay G02; workers/supervisors G03; approvals G04; Git/workspaces G05; providers/compiler/lint G06; Prism SQL/sessions/resources G07; browsers/caches G08; delivery/retention G09; admission/demo G10; builds/registry/CI G11; trust G12; operations/restore G13; complete journeys/reports G14; Echo promotion G15.

No raw log alone grants acceptance. The selected current local dispositions and original finding identities are retained in the [compact provenance index](../decisions/acceptance.md). Historical failures remain reachable at immutable source references. Earlier and final release/Buster/registry test counts are not additive; truncated captures, failed diagnostic chains, timing instability, inherited lint/type failures and zero-execution preparation matrices remain limited evidence. A filename containing “native”, “final” or “independent” does not extend the scope actually executed.

Sources pinned to the AP03 completion checkpoint:

- [D12 and accepted target decisions](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/decisions.md).
- [Original 154-finding register and five separate integration findings](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/register.json).
- [Historical native matrix: preparation, not execution](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/resume/native-followup-39-20260911.json) and [later path reconciliation](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/resume/native-followup-current-resolution.json).
- [Suite cutover and eleven outstanding production receipts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/pipeline-test-gate-suite-migration-status.md).
- [Echo promotion and corpus limitations](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-9-evaluation.md).
- [GitOps handoff: 141/154 and separate cluster acceptance](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/resume-20260914-gitops-handoff.md).
