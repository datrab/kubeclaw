# Runtime and operations decisions

Status: AP04 decision extraction; implementation and acceptance recorded separately
Audience: maintainer, operator, architecture reader
Owner: platform maintainers
Evidence: docs/review/remediation/decisions.md; docs/architecture/05-decision-record-catalogue.md; skills/nova/core/execution/engine-snapshots.ts
Applies to: repository source at ad67f9bb5c75cfa8cc1b926668aec1dd0168452c
Last verified: 2026-09-15; source review, no runtime or live acceptance executed

These records preserve lasting constraints. They do not approve new product choices or certify deployed behavior. Links to original material are pinned to the reviewed commit so later review cleanup cannot erase the decision's provenance. Implementation evidence below means inspected repository source; historical test results remain attributed to their original record. Current incomplete work belongs to [open issues](../status/open-issues.md); live proof belongs to [acceptance](../status/acceptance.md).

## ADR-015

**Durable, reconcilable observability.** A completed provider can outlive its worker or lose its acknowledgement. Preserve durable result and completion intent before acknowledging completion; retry admission by stable identity, without rerunning a completed provider. Separate Nova's execution authority, workers' attempt facts and ClawDeck's observability history. ClawDeck is one logical collection system, potentially using different physical stores. Nova must not proxy every raw log byte.

Producer boot, run, attempt and claim identity, local sequences and terminal closures establish completeness. Timestamps order a display; they do not establish causal authority across producers. Duplicate content is idempotent, conflicting identity is rejected, and a `restored` label cannot clear an unfilled sequence gap. Final authoritative gate evidence must be complete; earlier continuation may be policy-permitted only when safe, with gaps visible. Durable state needed for recovery remains available without ClawDeck.

**Rationale and alternatives:** the foundation rejects local JSONL as a scalable central outbox and rejects a second provider execution as recovery from failed admission. Embedded durable stores are an implemented boundary that a later database driver may replace; this is not an approved new database deployment. **Approval:** D-106/D-107 are original test-gate decision identities; this ADR groups their observability application rather than replacing them. The foundation records a technical decision, but no independent approval date/actor is established here. **Implementation:** partial for the full every-producer/ClawDeck goal; embedded attempts, admission and reconciliation exist. An OpenClaw source can remain volatile, so “every producer uses a durable outbox” is a target, not blanket current fact. **Verification:** source and historical proof only; no deployed ClawDeck or HA proof. **Supersession:** none established for the durable-result rule; obsolete phase scheduling is not a current prerequisite.

Sources: [complete foundation](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/pipeline-observability-foundation.md), [versioned contract](https://github.com/datrab/kubeclaw/tree/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/contracts/pipeline-observability/v1).

## ADR-016

**Version telemetry contracts independently of telemetry services.** Correlation, envelope, payload and bundle definitions generate consistent schema/type artifacts. A version identifies the wire contract; a schema alone cannot prove durable admission, authentication, ordering, retention or ingestion.

**Context and rationale:** a flat v1 envelope and the active plugin v2 envelope are different contracts. Treating v1's generated assets as the active event path would create a false compatibility promise. **Decision:** preserve v1 as a delivered compatibility asset until external consumers are assessed. Its nullable fields, content manifest, generated types and schema validation obligations remain explicit. Go data models are not validators. No v1-to-v2 adapter is implied. **Alternatives:** removal based only on absence of repository imports is not justified; no separately approved adapter option is recorded. **Approval:** technical ownership is recorded; formal approval/date unconfirmed. **Implementation:** retained v1 schema generation is implemented; it is not an active producer/consumer service. **Verification:** the README's schema/type regressions are local contract evidence, not transport tests; none rerun for AP04. **Supersession:** v2 is the active plugin envelope, not an automatic rewrite of historical v1 data.

Sources: [v1 contract README](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/contracts/telemetry/v1/README.md), [generator](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/scripts/generate-telemetry-contracts.mjs).

## ADR-017

**Forge returns bounded implementation evidence.** Nova dispatches implementation work through the implementation-agent protocol. Forge supplies `status`, `summary`, repository-relative `changedPaths` and `checks`. Runtime/Core attach invocation identity and session evidence; Forge cannot author a stage result or select another run/module/attempt. `ready_for_testing` is neither pipeline success nor human acceptance.

**Rationale and alternatives:** an agent-authored completion envelope cannot establish its own authority. The former README language about returned identity must be read against the current parser: it derives run/module/attempt from trusted input and rejects agent-owned identity fields. A ready completion needs changed paths, successful checks and a completed session; contradictory blocked/ready evidence fails. Attempt-owned workspaces and verified merge/source lineage prevent a repair from inheriting an unrelated worktree. **Approval:** recorded technical decision; separate user approval/date unconfirmed. **Implementation:** protocol and workspace handling implemented in source, broader parity assessed in the canonical issue register. **Verification:** parser and documentation inspected; package “live” tests use a local protocol endpoint and do not spawn a real Forge agent. **Supersession:** agent-authored identity descriptions are obsolete; no second lifecycle implementation is introduced.

Sources: [implementation protocol](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/implementation-agent/src/protocol.ts), [package rationale and workspace contract](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/implementation-agent/README.md).

## ADR-018

**Echo proposes; deterministic plugin policy governs effects.** Echo supplies assessments and proposals. The review plugin proves immutable source/evidence membership, verifies eligible proposals independently, freezes policy, reduces certified state and records immutable reports. Core alone schedules repairs, retries, waits and transitions. A parseable assertion is not a verified finding. Neither Echo nor Nova can forge Core's remediation counter.

**Rationale and alternatives:** agent PASS/FAIL was replaced by the existing canonical `stage-result.v2` reduction. A second review scheduler, mutable cross-run backlog and new verifier service are unnecessary for this boundary. The detailed original IDs, actual alternatives and later qualifications are preserved in [Echo decisions](echo.md). **Approval:** historical designs record technical decisions; user acceptance is independently explicit for D03/D04 below. Do not infer blanket approval from historical “complete” labels. **Implementation:** the bounded review/governor path exists; live model quality and configured activation are separate. **Verification:** current package documentation and governor reduction inspected, no model calls or test execution. **Supersession:** Phase 2's temporary rejection of all proposals was replaced by certified semantic verification; old merge-conflict prerequisites and unrelated historical Buster test failures are not current blockers.

Sources: [review package](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/README.md), [Phase 8 rationale](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-8-design.md), [governor result reduction](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/src/review-governor-decision.ts).

## ADR-019

**Prism is a design engine above neutral Worker Core.** Prism owns design documents, mocked interactions, generation, rendering, evaluation, ingestion and publication rules. Neutral Core owns attempt identity, process/resource mechanisms, transport and receipts. Prism-specific types or policy must not enter that core. Nova owns architecture and module planning; Prism returns a versioned, explicitly approved immutable Design Baseline Bundle. An agent critique or a mutable Studio workspace cannot approve a baseline.

**Rationale and alternatives:** reuse the same worker mechanisms rather than create a parallel Prism queue/lifecycle. Keep editor internals, provider payloads and generated HTML outside the canonical Design Document. PostgreSQL/pgvector and platform content-addressed artifacts are the accepted initial data direction; a separate vector store was deferred until measured limits justify it. Puck and external research-provider candidates were replaceable implementation choices, not architectural authorities. **Approval:** the source explicitly labels runtime/product/data boundaries accepted (document updated 2026-08-12); a separate approval actor/date is not established. D09 independently confirms the shared-core target on 2026-09-09. **Implementation:** partial for the complete product; source contains contracts, role packaging and services, without establishing production availability. Older no-host-path deployment prose does not describe the subsequently accepted native-host profile in D16. **Verification:** full architecture source and preference/recovery contracts read; no UI, provider, renderer or deployed database proof. **Supersession:** later preference and recovery contracts qualify earlier speculative decay/PITR language; the remaining preference implementation conflict is explicit in D11.

Sources: [Prism architecture](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/prism-design-engine-architecture.md), [historical integration choices](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/implementation/prism/integration-baseline.md), [role manifest](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/packaging/runtime/roles/prism.json). Historical fixed software versions in the integration note are not current release authority.

## ADR-020

**Distinguish roles, engines, specialists and activation.** Nova, Buster and Prism have runtime-role manifests. A role installs a declared dependency set; an engine owns specialist meaning; Forge/Echo are dispatched specialists sharing Nova's development environment; an OpenClaw host extension is a different registration surface. Presence in an image, manifest or inventory does not prove that a capability is enabled or deployed.

**Context and rationale:** formerly copying all shared source into every role blurred authority. Use one source/version installed into separate immutable images, with package digests and dependency-direction checks. Multiple installations do not mean multiple implementations. **Alternatives:** whole-directory overlays were replaced; DeepSec appears in the older target model, but there is no current DeepSec role manifest. **Approval:** packaging source declares its model authoritative; independent approval/date unconfirmed. **Implementation:** three role manifests and bundle builder exist. **Verification:** role file inventory and packaging document inspected, no role image built. **Supersession:** the `general` image name has been retired; role manifests and release selections own current installed bytes.

Sources: [packaging rationale](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/pipeline-runtime-packaging.md), [actual roles](https://github.com/datrab/kubeclaw/tree/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/packaging/runtime/roles), [image responsibilities](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/operations/runtime-versions-and-images.md).

## ADR-021

**Explain behavior in authored prose; generate exhaustive facts from source.** Readers need detailed, understandable guidance and accurate inventories. Manually curate explanations and decisions; derive manifest/version/registration facts from their owning source. Bind verification claims to a source revision and the actual evidence scope.

**Rationale and alternatives:** duplicated factual inventories drift; a generator's successful execution cannot prove that its prose was reviewed or that a deployment worked. Preserve authored ownership rather than overwrite it with blanket “implemented” and “generated during publication” claims. **Approval:** the documentation overhaul is user-requested; this extraction does not invent a separate approval date for an earlier ADR. **Implementation:** generators exist, but AP09 publication changes remain incomplete. AP02's heuristic migration outputs are not the manual AP03 review ledger. **Verification:** existing publication generator and catalogue inspected; no editorial approval inferred from CI. **Supersession:** this record clarifies provenance; it does not silently mark later publication work complete.

Sources: [AP02 decision catalogue](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/blueprint/05-decision-record-catalogue.md), [current publication implementation](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/scripts/docs-publication.mjs).

## ADR-022

**Architecture visualization is optional presentation.** Use an accurate SVG or Mermaid diagram when it explains a relationship; interactive architecture views can be added where they help. A reference lock, compulsory HTML rewrite or completed Archviewer is not a prerequisite for correct documentation or pipeline approval.

**Rationale and alternatives:** machine-authoritative design contracts and a human architecture view have different purposes. The existing SVG/Mermaid route and optional HTML presentation are actual alternatives in the documentation plan. **Approval:** the catalogue explicitly preserves this user requirement; no separate historical ADR approval date is established. **Implementation:** diagrams and an architecture-viewer surface exist; interactive presentation quality is separate future work. **Verification:** decision source and Prism integration note inspected; no visual/product acceptance claimed. **Supersession:** any universal interactive/HTML requirement is not carried forward; Prism design-baseline authority remains separate.

Sources: [decision catalogue](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/blueprint/05-decision-record-catalogue.md), [Prism versus Archviewer boundary](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/implementation/prism/integration-baseline.md).

## Product decision provenance

D01–D11 are explicitly confirmed user target decisions dated 2026-09-09 in the [original decision record](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/decisions.md). D13 is explicitly dated 2026-09-12. D14 and D16 record explicit user confirmation without an individual date; none is invented. These approvals concern intended behavior, not completed implementation. For all D records below, implementation remains **partial at the complete product-contract level** unless a narrower implementation statement is made; AP04 performs source review only. Original finding closure and live gates are maintained in the canonical registers rather than duplicated here. No supersession is established unless stated below, and alternatives absent from the source are marked “none recorded”.

## D01

**Complete diagnosis through the private operator path.** Record who did what, where, when and how, with project/run/module/stage/attempt/external-job identity, original errors and recovery context. Preserve large output completely as artifacts and label shortened displays. ClawDeck owns logical log collection; no second central pipeline log product is required. Durable local callbacks must still work.

The explicit exception permits only pipeline-generated **demo** credentials in private logs and authorized operator notifications. It does not permit platform, GitHub, model, Tailscale or database secrets, real user data, or public disclosure. Credential origin and purpose decide the exception, not a namespace or field name. **Rationale/consequence:** usable diagnosis without silently dropping evidence or abolishing protection. **Alternative:** blanket unredacted logging is not the accepted rule. See D06/D07 for separate retention lifecycles.

## D02

**Technical delivery and human acceptance are different states.** Ready for acceptance requires completed implementation, all mandatory checks, a reachable demo of the exact checked revision, and delivery of its URL/demo credentials to the operator. Accepted requires the operator's explicit agreement to that version. Changes require fresh verification and acceptance; an expired demo remains expired even if its historical acceptance remains valid.

**Rationale/consequence:** build success, demo reachability and human agreement cannot substitute for one another. Pipeline Review and Case Study remain optional completion analyses. **Alternatives:** none separately recorded. D12 changes local remediation closure, not this product approval contract.

## D03

**Explicit mandatory checks and optional agents.** Lint follows every module change, including repairs. Each module has a declared deterministic test requirement, and the integrated project is checked cumulatively before technical delivery. Skipped mandatory checks do not pass; scope cannot be silently reduced. Architecture's deterministic structure/configuration/reference checks are mandatory; agentic architecture review is optional. Echo defaults off. Buster defaults on, with its Test-Agent separately disableable while deterministic obligations remain.

**Rationale/consequence:** project-specific required evidence controls delivery, rather than running every possible suite or treating an optional agent as all of Buster. Enabled checks remain binding under D10. **Superseded alternative:** the earlier general requirement for agentic architecture review was explicitly corrected. Source configuration can show defaults; it cannot prove that a particular run selected or passed them.

## D04

**Separate 2/2/2 repair budgets, then one Nova exception.** Each module has two lint, two enabled-review and two test repair rounds. Initial implementation and a pure recheck consume no repair round. Charge a repair to its triggering category and still execute other mandatory checks afterwards. Used budgets survive invalidation and restart.

An additional required repair beyond a category's exhausted budget becomes `Needs Nova` with complete history. Success after the last permitted repair may pass. Nova may issue **one additional repair assignment per module**, not one per category; if that assignment and all required rechecks fail to converge, the module becomes `blocked` and requires operator decision. Nova cannot relax requirements or required checks. Persist the exception and its rationale.

**Rationale/consequence:** bounded convergence without counting successful rechecks as repairs. **Rejected alternatives:** one shared two-round limit, three default rounds, two extra Nova rounds, or reset of every category. Echo's scope governor adds a separate constraint: a clean final repair cannot pass after unauthorized file/LOC/ownership expansion. It consumes Core-certified repair state, not an agent counter.

## D05

**Parallel isolated work; serialized shared Git integration.** Independent modules use separate authorized worktrees; dependencies must pass mandatory checks before dependents start. Configure maximum concurrency, serialize short shared integrations, and treat ordinary lock contention as controlled contention. Check the actual integrated revision cumulatively.

**Rationale/consequence:** parallel implementation must not create competing repository authority or validate an unmerged approximation. **Alternatives:** none separately recorded. This product rule does not request new documentation branches.

## D06

**Seven-day demo lifetime.** The default begins when the project is ready for acceptance, lasts seven days, and is configurable/extendable per project. Notify before expiry and allow earlier operator cleanup. Namespace, exposure URL and demo credentials share the lifetime. Completion of a test plan must not prematurely delete an exposure already transferred to the operator.

**Rationale/consequence:** users need time to inspect exactly the delivered version, while temporary infrastructure has a bounded lifetime. Expiry/explicit cleanup removes demo resources. **Alternatives:** none separately recorded. **Boundary:** seven days is not a log-retention policy; D07 owns retained evidence and acceptance history.

## D07

**Manual log cleanup; preserved project history.** Disk/Git logs remain indefinitely until explicit operator cleanup. Code, final reports, decisions and acceptance history remain until explicit project deletion. Preserve evidence needed by a waiting run; cleanup that makes recovery impossible must expose that consequence. ClawDeck's internal deletion period was not specified.

**Rationale/consequence:** diagnosis and pending decisions must survive a demo expiration. This does not classify caches, unpacked sources or temporary build directories as permanent logs. Capacity budgets, backpressure and explicit errors must not hide silent truncation or loss. **Rejected alternative:** automatic 30-day log deletion.

## D08

**Reconcile uncertain effects before retry.** Automatically resume safely repeatable work. For a push or externally accepted job that may already have happened, inspect and adopt the actual state first. If the outcome remains unknown, request `Needs Nova` with diagnosis; even D04's extra assignment cannot authorize blind repetition. Technical retries have independent configured time/attempt limits and do not consume product repair budgets.

**Rationale/consequence:** restart must not duplicate an external authority-changing action or create an endless retry loop. **Alternative:** blind replay of uncertain effects is excluded. Core's durable-effect authority remains the shared architectural rule; this record preserves its operator-facing recovery semantics.

## D09

**One generic Worker Core, independent durable execution state.** Buster, Prism and future workers use the same neutral job identity, state, timeout, cancellation, recovery and result mechanics. Engines own domain logic; worker capabilities/resources are configurable. Nova owns the overall process. Core imports no concrete plugin. Required job/result evidence remains durable even when ClawDeck is unavailable.

**Rationale/consequence:** specialist additions must not fork lifecycle or depend on log collection for recovery. **Alternative:** parallel specialist cores are excluded. This user-confirmed rule corroborates ADR-002 in the core decision set and ADR-019 here; it is not a second implementation contract.

## D10

**Only the operator can accept a quality risk.** Bind explicit acceptance and its reason to the checked revision. Nova cannot grant it. A failed required check remains failed; a deliberate requirement/test-scope change requires rechecking the affected revision. Corrupt evidence, wrong result identity or missing authorization cannot be overridden as an accepted risk.

**Rationale/consequence:** preserve both human authority and truth of evidence. **Rejected alternative:** `force-passed` or an agent-made risk waiver. This decision does not mean every failed check can be bypassed.

## D11

**Contextual personal preferences with project override and recorded provenance.** Personal preferences may apply across a user's projects, but each project may override or disable them. Explicit project requirements win. Record the preference state used by every generation, preserving user, project/event origin and generation identity across projects.

**Rationale/consequence:** reusable taste must not mix users or erase the provenance of an output. **Alternatives:** none separately recorded for D11. The later [accepted preference v1 contract](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/prism-preference-learning-v1.md) separately rejects automatic time decay and passive/self-generated taste evidence. It derives correctable profiles from append-only events and retractions.

**Unresolved supersession:** current [projection source](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/prism/preferences/index.ts) applies a 180-day half-life using the latest evidence time. The [generation snapshot](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/prism/control/preference-snapshot.ts) records `referenceTime` and `prism.preferences.v1.decay180-project-override`, and gives project traits precedence over matching personal traits. These source facts do not establish approval to replace the accepted no-decay rule. Do not publish either “no decay implemented” or “decay accepted”; alignment is tracked in open issues. Current traits are strings, and project events including retractions require project identity; the old contract examples are not a current wire reference.

## D12

The distinct decision about local finding closure versus later live acceptance is preserved in [acceptance decisions](acceptance.md). It neither supersedes D02 nor grants deployment authority.

## D13

**Explicit Linux-task units and generous measured headroom.** A Linux task includes every thread, including a process's main thread; do not count processes again. Bind the unit in profiles and contracts. Preserve old process-budget receipts under their original version instead of relabelling them as task counts. Choose headroom from actual worker work, with CPU, memory and concurrency bounded independently; no fixed conversion or claimed calibration without measurements.

The user also confirmed a separate roadmap step to consolidate operator settings through the existing `swarm.config.json`; do not create another operator file as the supposed central authority. **Rationale/consequence:** units and aggregate admission must remain meaningful during migration. **Alternatives:** tight normal-load limits and silent process-to-task conversion are excluded. Host policy currently has a dedicated selected input; complete settings consolidation is not claimed.

## D14

**Buster owns retained fixtures beyond setup.** Buster gives retained fixtures a durable separate lifetime, generous dedicated budget, dependency/readiness management and final cleanup evidence. Worker Core supplies neutral process ownership, measurement and recovery. Prism retains ordinary attempt lifetime. Readiness after setup is not proof of cleanup.

Physical resource binding continues throughout fixture lifetime. Moving a process between cgroups does not transfer its previously incurred memory charges. Keep historical setup receipts/budgets readable; explicitly version and bind new lifetime receipts. **Rationale/consequence:** a retained service must not outlive its resource accounting. **Alternative:** release-at-setup or retroactive memory-charge transfer is excluded.

## D15

**Historical remediation scope, not a new product setting.** The recorded instruction expanded PR #6 to all then-remaining 23 of the original 154 findings: four ongoing implementations and 19 infrastructure findings. Completion required implemented code and sufficient real local tests; live checks remained separate under D12. A requested eight-hour duration was not evidence of completion.

**Disposition:** preserve the scope/provenance once; do not carry “23 remaining” or a minimum work duration into today's product configuration or open-issue count. The accepted local-proof rule continues through D12. The source records the instruction, but gives no individual D15 confirmation date.

## D16

**Fixed host-managed native-worker reservations.** The user selected option A: persistent Buster/Prism host role pools with fixed capacity withheld from Kubernetes scheduling. Aggregate ceilings and full admission reservations prevent concurrency from multiplying generous per-attempt budgets beyond available capacity. Reserve separately for supervisors, Kubernetes and other host services; inspect actual capacity instead of assuming it.

**Actual alternative:** option B keeps attempts in a runtime-delegated subtree beneath each worker container, so normal Pod accounting covers their aggregate use; that requires different runtime integration and replacement/drain handling. A static host-path mount cannot substitute for it. A Node annotation cannot prove scheduler withholding. A was chosen for durable role-scope/fixture recovery across supervisor replacement. Missing host/runtime/accounting prerequisites must prevent activation. D13/D14 remain unchanged; the selection authorizes implementation, not a host change or purchase.

**Implementation and proof:** pool generation/preflight and Prism native selection exist; complete Buster integration and actual scheduler/enforcement acceptance are separate. Proposed capacity values are not calibrated host measurements. Retain final observations before releasing scopes; unresolved cleanup fences capacity. Sources: [actual A/B decision](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-node-accounting-decision.md), [current host-pool contract](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/operations/native-worker-host-pools.md).

## Configuration and release authority

**Decision:** `versions.json` owns managed versions, immutable bases and downloaded-binary checksums; native manifests/lockfiles own their remaining dependencies. Generated native defaults remain committed so ordinary Docker/Helm tooling works without a deployment-time preprocessor. Edit the central source, synchronize, and reject drift in checks; do not manually maintain duplicate generated version fields. The current manifest also owns `redisProduction` and `monitoringCharts`; older prose excluding all cluster charts is obsolete.

**Context/rationale:** one executable JSON source prevents divergent pins, while committed output preserves native tooling. **Actual alternatives:** Markdown inventory as executable authority would need another parser; independently edited defaults introduce drift; a mandatory runtime preprocessor is not required. **Approval/date:** established implementation policy; separate approval date unconfirmed. **Implementation:** generator and selected-release validators exist; full operator-settings consolidation under D13 remains separate.

Build inputs, published artifacts and deployed images are different identities. Release selection binds a complete receipt family to exact immutable images and source-matched configuration; private overlays may not substitute images. Rollback uses the prior reviewed selection and compatible data state, not a guessed tag. Older “manual promotion only” prose is qualified by current receipt-backed proposal automation; an operator merge remains required. A build or selected receipt is not a deployment/compatibility proof. **Supersession:** current generated central fields and GitOps ownership supersede older independent-version/Helm-only descriptions, not the one-authority principle.

Sources: [version policy](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/operations/runtime-versions-and-images.md), [manifest](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/versions.json), [generator](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/scripts/versions.mjs).

## Frozen recovery and versioned retirement

**Decision:** resume with the run's frozen graph, registry, package identities and versioned configuration/encoding. Verify their exact digests and supported versions. Rebuild missing wait/artifact projections from authoritative journal events rather than fabricate state. If configuration must change, use an explicit new run or verified migration; never substitute today's config merely because the old snapshot cannot be read.

**Context/rationale:** a retry with new policy or package bytes is different authorized work. Retire obsolete implementations through explicit drain/migration, preserving original receipts and unresolved ownership evidence. This is compatible with removing unused fallback code: retaining a supported historical data contract is not an excuse for a second active execution path. **Alternatives:** silent fallback, manual journal edits and relabelling old codecs are excluded. **Approval/date:** shared architectural rule corroborated by D08 and source; independent approval date for this editorial grouping unconfirmed. **Implementation:** snapshot validators support explicit v1–v4 run identities, pinned package comparison and profile separation. **Verification:** inspected source paths; no process-replacement proof executed. **Supersession:** each data version retains its original hash/codec semantics; no new migration is authorized here.

Sources: [snapshot authority](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/core/execution/engine-snapshots.ts), [journal recovery](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/core/lifecycle/recovery.ts), [recovery contract](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/site/use/recovery.md).

## Prism recovery policy

**Decision:** reuse platform recovery/observability; protect canonical PostgreSQL records and immutable artifacts, rebuild disposable derived state. V1 specifies daily encrypted/digest-verified database backups, weekly restoration of real canonical records/bundles, and quarterly derived rebuild/render proof. Published evidence referenced by an approved bundle is retained canonical evidence even when draft previews or reports are rebuildable.

Restore PostgreSQL, reconnect/restore artifacts, verify required digests, enter recovery mode, rebuild derived data, and only then enable writes and resume workers. A completed backup job is not a successful restore. Deployment policy must explicitly set accepted data loss, recovery time, retention and the trigger for stronger WAL/replication protection; no exact RPO/RTO is invented. Authoritative publication stops if required storage, approval or observability is incomplete.

**Rationale/actual alternatives:** avoid a separate Prism backup or telemetry platform. Daily backups are the v1 baseline; continuous WAL is added when the accepted loss limit becomes shorter than a day. This qualifies the older broad architecture's unconditional PITR wording. **Approval:** source explicitly labels the architecture contract accepted; actor/date not recorded. **Implementation:** full deployed recovery remains unverified. **Verification:** full contract read; no backups/restores executed. **Supersession:** the detailed v1 operations contract qualifies the earlier proposed backup mechanism, not the need for tested recovery.

Source: [accepted recovery contract](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/prism-recovery-observability-v1.md).

## Supported operations access

**Decision:** use the persistent Codex Ops Pod/Devbox workspace with its local loopback MCP. There is no second supported public Ops MCP/tunnel deployment. Keep independent existing host/KVM management available: this Pod depends on Kubernetes, node, network, DNS and storage and cannot guarantee recovery from their failure. One replica avoids concurrent writers to one account/workspace; a second replica on the same host does not remove the failure domain. The source records the operator's acceptance of this trade-off; its individual approval date is unrecorded.

**Authority:** the MCP tool surface is read-only, but both containers share a ServiceAccount. Current chart defaults `rbac.execNamespaces` to `[kubeclaw]`, with rotating token and kubeconfig mounted into Codex when enabled. Exec inherits the target container's data, credentials and effective authority. `[]` removes the exec roles and Codex API mounts. Older startup/runbook statements that Codex never receives an API credential are therefore obsolete. An approval prompt is not a Kubernetes identity boundary.

**Ownership:** direct Helm bootstrap and later explicit platform Argo adoption are sequential ownership choices, not simultaneous managers. After adoption, do not maintain the same release independently with Helm. Platform definitions can autosync while child applications remain manual; the selected Ops chart is tied to its receipt source. The current GitOps health-gate revision mismatch is a separate implementation issue, not a newly approved delivery rule.

**Implementation/proof:** supervisor, chart and verifier exist. Local app-server socket readiness does not prove login, mobile pairing, end-to-end task execution or independent host access. The verifier's authorization checks do not execute a target command. No deployment, pairing or management recovery was performed for AP04. **Alternatives/supersession:** no new VM is required by this design; the retired external ChatGPT Ops bootstrap is not a fallback. A separately authenticated independent workspace would be a new design, not automatic failover.

Sources: [Ops architecture and explicit failure trade-off](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/ops-pod.md), [chart defaults](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/charts/ops-pod/values.yaml), [platform adoption](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/scripts/argocd-self-management.mjs), [continuous GitOps](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/deployment/continuous-gitops.md).
