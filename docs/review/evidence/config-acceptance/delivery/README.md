# Delivery / host / native-policy C0 evidence (incomplete)

## DLS material correction continuation (13 October 2026)

[DELIVERY-DLS-CORRECTIONS-20261013.md](DELIVERY-DLS-CORRECTIONS-20261013.md)
records sole-version/Core-alias corrections, current reader versus target domains,
complete definition profiles, exact future invocations, bounded pure observations,
retained failed attempts and remaining per-field obligations. **NOT ACCEPTED**;
DLS004 and material independent recheck remain open. Parent DLS002 infrastructure
and universal originalModule/grant/cleanup contracts remain separate, not aliases
invented by deployment profile filenames.

The collector now invokes the original refiners, bce3f075 source closures and
explicit DLS domain/case refiners in its literal listed order. The seven-command
list below is historical partial navigation, **not** the whole current pipeline.
Use `node docs/review/evidence/config-acceptance/delivery/collect-delivery.cjs`
only with retained exact pinned source roots. It performs source/evidence generation,
not any proposed native/API/host/image/account future command.

## Current checkpoint and reproducibility

Work is confined to this evidence directory. No production/test edits, commit,
deployment, runtime acceptance or C1 approval are claimed. Initial PR18 artifacts,
raw failures and original identities remain preserved in `snapshots/pr18-initial/`.
The live fragment/status/backlog supersede that snapshot's missing-package and row
coverage statements; the snapshot remains historical, not current evidence.

Exact npm distributions `openclaw@2026.9.5`, `@openclaw/discord@2026.9.5`,
`@openclaw/acpx@2026.9.5` and dependency `acpx@0.16.0` were acquired read-only.
Acquisition records retain registry URLs, SHA512 integrity, SHA1, archive SHA256
and exact origin/version. Full selected sources and excerpts are beneath
`pinned-*`. No lifecycle/package scripts or dependency installation were executed.
Npm source identity **does not establish OCI image byte equality**. Local
`/app` 2026.9.9 must not substitute for the pinned productive source.

Evidence-only continuation:

```sh
python3 docs/review/evidence/config-acceptance/delivery/refine-pinned-openclaw.py
python3 docs/review/evidence/config-acceptance/delivery/refine-ops-delivery.py
python3 docs/review/evidence/config-acceptance/delivery/refine-semantic-closure.py
python3 docs/review/evidence/config-acceptance/delivery/refine-prism-chart.py
python3 docs/review/evidence/config-acceptance/delivery/refine-kubernetes-boundaries.py
python3 docs/review/evidence/config-acceptance/delivery/refine-buster-build-inputs.py
python3 docs/review/evidence/config-acceptance/delivery/refine-case-links.py
python3 docs/review/evidence/config-acceptance/delivery/verify-semantic-closure.py
```

`collect-delivery.cjs` originally invoked these seven refinements in that order (Kubernetes source
refinement only when its acquisition record exists). Pinned
refinement requires the exact integrity-checked acquisition's extracted source
root; persisted snapshots permit review without `/tmp`, but not blind collector
reproduction after losing that acquisition root. Reacquire that same archive and
verify recorded integrity before running, never install/execute it. The initial
collector establishes enumeration and hashes only; refinements supply actual
semantic observations. Re-running it must not erase later manual dispositions.

## Authoritative artifacts

- `inventory-fragment.json`: field IDs, owners, source hashes, precedence,
  consumers, validation/error contracts, proposed authority/activation and cases.
  Each row status is authoritative. `source-traced`, `source-traced-pinned-consumer`
  and `source-traced-declared-unused` are source-definition dispositions, **not**
  independent acceptance or runtime PASS.
- `fragment-status.json` and `open-row-backlog.json`: derived current status and
  exact unresolved IDs; neither is a completeness claim. Remaining open rows
  must not be relabelled closed because their template/ENV projection exists.
- `proposed-cases.json`: stable links now resolve, including one specification per
  authored Gateway field and separate Ops/host/controller cases. All are
  `not-run`. `commandReadiness`, `specificationStatus` and `profileSelectionGap`
  expose absent field harnesses, observer fixtures or valid external B profiles.
  Existing suite commands are entrypoints/supplemental regressions, not fabricated
  proof they already exercise new cases. Zero dangling links does not close C0-E.
- `semantic-closure-source-observations.json`: new static caller/validator excerpts
  and hashes; existing `openclaw-pinned-observations.json`, acquisition logs,
  source observations and raw test failures are preserved.
- `semantic-closure-verification.json/.txt`: actual evidence consistency check,
  not runtime tests. Dirty source/evidence identity belongs the parent's final
  checkpoint, including patch and every untracked input digest.
- `pending-source-candidates.json`: lexical continuation queue. It is not a
  non-setting disposition for those sources. `delivery-surface-dispositions.json`
  separately records inspected sources and linked unresolved row obligations.

## Gateway: consumer, validation and activation are different boundaries

The repository author is Chart embedded JSON/init code, not a native parser.
Init overwrites managed memory/model/ACP/plugin subtrees on restart; other
policies seed absent values while existing PVC config can win. This is current
precedence, not the target unique immutable author. Native CLI overlays remain:
Chart `gateway.bind=loopback` is shadowed by actual command `--bind lan`.
`gateway.tools.allow` removes named default HTTP denies; it is not a universal
restrictive allowlist. Owner-only denials and other tool-policy layers still apply.

Pinned native readers/validators are cited per field. Schema permits optional
native fallbacks; target complete required author/selected runtime validation must
reject absence/unsupported behavior before effect. Parsing a config is not proof
of consumer effect, persistence, reload or durable module binding.

### Embedded versus Codex

Model routes for `openai/gpt-5.5` and `openai/gpt-5.6-sol` explicitly select `codex`;
`gpt-6-astra` does so under the retained primary-model condition. Runtime selection
still respects per-agent/model/provider/wildcard/session policy, registry and
model/auth capability. A schema-supported model string is not a capability fact.

`embeddedAgent.executionContract`, `contextPruning.mode/ttl` and embedded
`compaction.mode/keepRecentTokens` have builtin OpenClaw harness/settings-manager
consumers. Their presence on a Codex-routed profile does **not** demonstrate
Codex-native equivalent behavior. Field cases require a valid actual embedded
positive and selected Codex/ineligible control; compatible auth/model profile is
not invented. Universal target policy requires rejecting an unsupported lane or
explicitly defining the real Codex-native equivalent, not silent no-op acceptance.
Memory-core `memoryFlush.enabled` is a separate registered flush-plan capability;
its execution on selected Codex turns remains a field-harness obligation, not an
inferred embedded-compaction equivalent. `runtimeApplicability` records these
boundaries in rows and per-field cases.

Concrete pinned semantics retained:

- Invalid pruning `ttl` string is caught and preserves native five-minute baseline;
  eligible provider/model is required. Unsupported `strict-agentic` lane resolves
  default rather than rejecting. These are target negative-counterexamples.
- Thinking supports `off|minimal|low|medium|high|xhigh|adaptive|max|ultra`; reasoning
  supports `off|on|stream`. Actual runtime/model support and authorization constrain
  productive execution.
- `openai-compatible` embedding adapter requires nonempty endpoint/model.
  `gemini-embedding-001` is transmitted to that endpoint, not inferred native
  Gemini routing. Exact second supported remote model remains external-profile
  input; no arbitrary B model is presented as valid.
- Final ACP allowed-agent policy compares normalized exact IDs; empty permits
  all. Spawn target enumeration has distinct wildcard handling. ACPX
  `permissionMode=approve-all` changes permission responses/write authorization,
  not independent cwd/grant bounds. Exact ACPX plugin/runtime sources are retained.
- `channels.discord.inboundWorker.runTimeoutMs` is schema/type-declared but unused
  by exhaustive retained pinned search. C3 disposition is removal/rejection;
  alternate values cannot count as behavior effects. Actual native
  `agents.defaults.timeoutSeconds` defaults to 172800 seconds (48h), with run
  overrides/config/timer-safe zero handling separately inventoried.
- Thread bindings, subagent archive/timeout, session reset and selected secret
  references have stored R/S lifecycle effects. Native current-config archive
  lookup or reload behavior is not permission to reset a started module's policy.

## Controller, shared lease and native host

Shared `leaseApiGroup/leaseApiVersion` belong **CMP buster-engine
`clusterInvokers.shared`**. DLV namespacecontroller rows are generated aliases;
CRD, RBAC, Buster client, API path and finalizer must use that one generation.
There is no second controller author. Changes require coordinated S/R protocol
migration with stored leases/finalizers preserved, not per-module reselection.

Controller startup captures ENV policy once. TTL `envInt` silently falls back for
malformed/blank strings; negative/zero/default>max and duration overflow lack
owner validation. Task spec TTL has different validation (`>=60`, max comparison).
`expiresAt` recomputes creation+task/default TTL with positive max clamp; malformed
creation timestamp uses `time.Now()` each call. Stored validated demo-ready/product
deadlines take priority. Target R must preserve immutable expiry/grants/ownership;
current fallback/recompute behavior is not durable recovery proof.

Access roster JSON unions duplicate subjects/modes, rejects invalid modes/subject
references and empty subject map but accepts unknown fields and a subject with
empty modes. A single-name roster subject uses literal namespace `kubeclaw`, not
selected controller namespace. Role/SA/prefix/port strings have weak or downstream
validation, explicitly recorded per field. New HTTP/client/readiness request/header,
security-refresh/skew/evidence-budget and retention literals are individually
inventoried. Seven-day absent-request retention is operator fallback; signed-duration
maximum is an arithmetic invariant, not an operational cap. v1 historical implicit
retention and v2 required stored retention are different versioned recovery contracts.

Host fields now have exact local checks/errors and distinct reservation/cgroup/NRI
projections. CPU period/quantity mappings are identified; containerd version is
validated in renderer's `nriPolicy`, not the general policy validator. Current
unknown properties pass and enter policyDigest; target unknown-key rejection remains
proposed. Render is local evidence only. Live delegated host capacity, root/node/boot
identity, cgroup controls/NRI/Kubelet behavior and maximumActiveScopes admission
remain separate cases; no production host installation/capacity was invented.

## Ops and Chart boundaries

Ops deploy inputs and all Ops Chart fields carry actual precedence:
Chart defaults < generated discovery < selected release values < OPS_POD_VALUES
< explicit `--set` flags. Selected-image guard validates complete rendered output
before deploy namespace/credential effects. Discovery uses live namespace/API
endpoint bindings; render requires explicit supplied discovery and does not query
production. Existing bearer/pull Secrets and Codex credential/session PVC survive.

Chart has no `values.schema.json`. Boolean feature values use Go-template truthiness,
not strict boolean rejection. Image refs/exec namespaces have explicit guards;
MCP startup validates permitted/default namespaces. Quantities, CIDRs, ports,
PVC/Secret names have Kubernetes/downstream boundaries still marked open where exact
upstream source/domain validation has not been expanded. Tailscale ENV/argument
consumer remains pinned external-reader gap. Codex TOML parser is a separate exact
native distribution gap (metadata alone is not productive reader evidence).

Non-Ops Chart aliases/conditional bodies, all caller/operator overlays and dynamic
`extraEnv/extraContainers/capabilityProviders` still need field/member disposition.
Projection references alone never close these obligations. Parent owns Prism server
ENV endpoint/trust consumer rows; DLV Chart author IDs link there without inventing
a duplicate primary owner.

## C1 delivery obligations and exact remaining C0 gaps

### Actual current-source Prism Chart definition checks

`run-prism-chart-definition.py`, `prism-chart-definition.json`, retained raw outputs
and `c0-definition-cases.json` establish local **C0 definition observations**.
The actual current base plus isolated synthetic complete A/B profiles rendered
successfully. Image digest, studio replicas, ingestion enablement/sizing/TTL,
backup schedules/budgets/Job deadline, artifact PVC and Tailscale ingress witnesses
are retained; canonical bundle/schema package members equal source bytes.
Synthetic image/host identities prove no pullability/physical capacity.

Prism has a real `values.schema.json`: primary image pull policy permits only
`IfNotPresent|Never`; worker replicas is schema const1; digest/ingestion sizing,
TTL type/bounds and root unknown keys reject before template effect. Control
replicas and coordinated worker shutdown/grace have separate template guards.
The first evidence script incorrectly expected template wording or no schema
rejection for six negatives; exact failed results/raw logs/script are preserved
in `snapshots/prism-chart-initial-diagnostic-observations/`. Current corrected
definition observations use the actual intended first schema/template boundary.
No production tests/assertions were changed; the historical four diagnostic
suite failures remain unchanged. These new current-source checks do not execute
or pass the proposed implementation cases or independent C0 review.

`refine-prism-chart.py` records field-specific productive image/topology/native
binding/ingestion/backup boundaries and still-open resource/cron/Secret admission.
Backup duration becomes actual shell timeout and Job duration+30 seconds; acquired
quarantine TTL reaches safe-integer parse/clamp/reap/unlink. Other ENV endpoint/trust
consumers remain parent-owned; no duplicate author was introduced here.

`run-build-input-definitions.mjs` executes actual current input selectors. Root
`pipeline.config.json`, selected `config/*`, host policy/renderer paths are currently
neither image nor deployment inputs; Chart component paths are deployment-only.
The workflow graph's separate exclusion is not a claim it should become a system
config/image input. Real GitHub reliability/update/build/bundle publication gates
are traced in DLV rows. Predicate observation is not actual GitHub/build execution.

### Proposed C1 package and remaining C0 work

### Kubernetes resource / Secret / volume / cron continuation

`kubernetes-source-acquisitions.json` retains exact resolved GitHub commits and
SHA256 for primary Kubernetes `v1.35.6` and `v1.34.11` code, the exact cron3.0.1
dependency, and the selected Nova offline strict-schema commit. These release
versions derive from repository kubectl pins. `go.mod` has **no Kubernetes client
dependency**, and the Charts declare **no kubeVersion**. A client/schema pin is
not proof of deployed apiserver version, feature gates or supported cluster roster.
No downloaded code/package was executed. `kubernetes-boundary-source-observations.json`
holds exact validator/defaulting/kubelet/scheduler/cron functions and hashes;
`refine-kubernetes-boundaries.py` annotates individually enumerated fields/containers.

Current boundaries now distinguished:

- Container CPU/memory quantities are parsed, **nonnegative** at the pinned API
  and requests may not exceed same-resource limits. Prism ingestion adds its own
  stricter positive-sizing schema. Missing Pod requests can inherit limits; kubelet
  repeats CPU-share fallback. Zero memory limit omits the CRI limit. CPU quota
  depends node CFS/exclusive-CPU policies; scheduler capacity, LimitRange and quota
  remain separate live facts. Target complete selected settings cannot rely on
  those missing-input fallbacks. Each doctor/init/main/proxy/controller/backup
  projection has its own exact container/activation condition.
- PVC storage is **strictly positive**, supported access modes and RWOP combination
  rules are explicit. Empty Chart storageClass omits the field (cluster default),
  not explicitly empty no-class selection. Existing PVC class/mode/name changes
  are not a safe next-module publish; update immutability/expansion/recovery rules
  depend actual bound state, feature gates and CSI. Ops home2Gi/Tailscale1Gi and
  Prism backup100Gi are separate fixed projections, not changed by workspace or
  artifact size. Their classes can share the indicated selected class field.
- ENV SecretKeySelector validates Secret DNS name/key syntax, then kubelet enforces
  required lookup/key at container ENV creation. Secret/projected-volume references
  have a weaker nonempty-name boundary; all-data volume does not guarantee token
  file exists. Image-pull references can be blank or missing at that API boundary;
  kubelet ignores blank and warns/continues on missing lookup, so public/cache pull
  may still succeed. There is no universal “missing Secret rejects Helm” claim.
  Ops MCP auth reopens a rotated token file per request and fails closed; Codex
  supervisor reads its token at startup. Secret revisions/grants/credential state
  and rotation/availability must be defined, not inferred from a Secret name.
- Cron Chart validation is string length only. Pinned API parses exact cron3.0.1
  five-field/descriptor grammar and rejects new TZ/CRON_TZ schedule strings.
  Existing Chart omits `spec.timeZone`; parser uses controller `time.Local`, **not
  inferred UTC**. New `DLV-PRISM-BACKUP-CONTROLLER-TIMEZONE` inventories that ambient
  policy and proposes a minimal projection to the existing native timeZone field
  in the approved C3 slice, not a second scheduler. Started Job deadlines/ENV and
  shared backup locks/immutable retained groups are separate recovery contracts.

`run-kubernetes-boundary-definition.py` produces complete reference-only synthetic
Prism/Ops/Nova/Buster A/B profiles, actual render outputs, exact container-resource
comparisons and selected local strict-schema observations. `c0-kubernetes-boundary-cases.json`
exports the **29 current actual local C0 observations**; prior failed Buster cases
remain in the immutable checkpoint snapshot, not relabelled.
Prism/Ops/Nova have nonempty all-valid zero-skip structural collections. At pushed
checkpoint `40cf24e7`, Buster whole-document validation failed for missing CRD/VAP
schemas; those exact failures remain archived. Current continuation acquired the
two VAP/Binding files from the same pinned primary tree. That tree lacks a standalone
CRD file (raw404 retained), but its **strict canonical `_definitions.json`** contains
the recursive CRD definition with `additionalProperties=false` and required `spec`.
`materialize-pinned-schema-alias.py` produces only a `$ref` to that exact immutable
primary definition; it authors no schema properties, relaxed constraints or broad
object substitute. Metadata records primary bytes/hash/definition pointer/alias
hash. Investigation-only primary README and unstrict local CRD snapshots have
explicit acquisition dispositions and are **not validation inputs**. Current complete Buster collections now validate all21 resources without
errors or skips. Decisive unknown-property, missing-spec and wrong-type CRD controls
reject through that same primary definition. The first wrong-type observational
diagnostic mismatch is preserved under `snapshots/pr40cf24e7-crd-alias-*`.
Structural schema success is not Go API semantic validation,
Secret existence, provisioning, scheduling, native credential or runtime effects.

All initial raw failures/incorrect observational expectations are retained under
`snapshots/kubernetes-boundary-*`. This includes missing correlated trust/SA/native
sidecar guards, the `.stdout` extension empty-collection trap (its initial PASS
labels are explicitly invalid), missing schema inputs, plural-summary parsing and
the comparison locator's initial `mcp` versus actual `ops-mcp` mismatch. Current
checks require nonempty complete collection and exact expected values. No production
test or baseline diagnostic assertion was changed. All proposed implementation
cases remain `not-run`; field/API/runtime observers and independent review still
required, with actual server/admission/CSI/node/Secret identities pinned first.

The actual Buster operator caller supplies a nonempty `gateway.resources` map,
which overrides root `.Values.resources` wholesale. `gateway-resource-overlay-dispositions.json`
retains only audited resource subtrees/source hashes, never unrelated credentials
or a physical-capacity claim. The empty base map was not sufficient field coverage:
its six CPU/memory/**ephemeral-storage** request/limit members now have individual
IDs. Current continuation traces all six separately: complete synthetic Buster
gateway A/B maps are materially different from the root maps, and all132 field
projection comparisons match. A partial nonempty gateway map suppresses root
CPU/memory/limits entirely; it is not a per-key merge. That current permissiveness
is a planned target negative, not accepted complete policy. Ephemeral-storage
requests feed `NodeResourcesFit`; limits drive whole-Pod disk-usage eviction, **not
hard filesystem quota**. Enforcement depends `kubeCfg.LocalStorageCapacityIsolation`,
rootfs/log/emptyDir stats and image-filesystem layout. Actual node/API admission and
eviction cases remain unrun. Arbitrary future hugepage/extended-resource/claims
members and the strict selected-owner map/default-removal contract remain open.
The parent map row is a header/alias, not an additional independent setting author.

`refine-buster-build-inputs.py` and `buster-build-source-observations.json` define
the fifteen actual Buster Docker ARG consumers: FROM base identities, Debian snapshot
metadata/signature baseline, explicit platform/paired kubectl+Trivy downloads and
hashes, exact hashed Python wheel-lock membership, browser/DB locks and native
worker revision. Docker `--build-arg` can still compete with generated defaults;
`TARGETARCH` binary block can fallbackamd64 while browser loader receives raw input;
the worker rejects Docker's `KUBECLAW_BUILD_REVISION=unknown` default. Exact supported
platform/build commands and dependency/context prerequisites are in the proposed
case. `node scripts/versions.mjs --check` actually passes current44 projections and
local lock receipts, with command/source digests and raw output retained at
`buster-build-version-projection-check.*` and `c0-buster-build-definition-cases.json`.
`export-current-definition-cases.py` links these actual C0 source observations to
field IDs; `verify-semantic-closure.py` checks raw identities and the strict ref-only
alias. These are separate from `proposed-cases.json` implementation cases. It proves source projection consistency,
not image build/download/installed tool effect. Docker context/COPY gaps, baked ENV/
launcher/UID/capability/APT retry/error/expiry policy literals and remaining image
ARG/platform readers still need their separate obligations; no whole image closure
is inferred from these fifteen traced ARGs.

C1 proposal still evolves `swarm.config.json` to `pipeline.config.json` while
`pipeline.json` remains workflow/task graph. It must migrate real Chart .Files/bundle
aliases/ConfigMaps/checksum/mount/ENV roster, complete selected six-component/Buster
variant closure, CI runtime-input callers, release aliases/materializer/receipts,
actual role package/facade/install graph, and Docker context/COPY closure together.
Default-deny `.dockerignore` currently excludes required Buster COPY sources;
protected local/my-values/secret exclusions must remain. Host-mounted image checker
proves mounted loader path, not baked selected config identity. Four historical
649-suite diagnostic failures remain failures; neither fixed nor relabelled here.

C0 continuation is bounded by exact backlog IDs, not deferred out of scope:

1. Remaining non-Ops Chart domains/aliases/literals plus Kubernetes admission and
   downstream field consumers, dynamic members and all overlay callers.
2. Generated runtime/platform/transport per-field schemas/options/source duplication
   and Buster engine-owner cross-check, including conditional/spread branches.
3. Docker ARG download/checksum/platform semantics; ENV/launch literals; scripts,
   installer, repair, release and build input per-source dispositions.
4. Native implicit policy defaults beyond authored Gateway keys; exact Codex and
   Tailscale consumer sources; selected model/remote service capability inputs.
5. Per-field proposed observer/harness/input/negative-diagnostic expansion; exact
   immutable image/tool/config/test identities and later runtime/live execution.
6. Fresh independent C0 review after material corrections. Parent consolidates
   inventory/matrix/definition and final dirty patch/untracked digests. No local
   source-status/count or zero dangling-link result discharges that gate.

## bce3f075 continuation: exact reader contracts, not global closure

See [DELIVERY-CONTRACTS-BCE3F075.md](DELIVERY-CONTRACTS-BCE3F075.md) for the current
field corrections, actual observations, preserved diagnostics and exact remaining
obligations. New refiners are in the existing collector chain; raw acquisition
identities are retained for official Codex0.153.4, Tailscale1.102.3, Semgrep1.170.0
and locked ESLint10.7.0 sources. Original source-open rows now have inspected
contracts, but this is **not** exhaustive target/domain/profile/case closure.

`c0-residual-definition-cases-bce3f075.json` contains actual bounded current cases,
including all four initial observer failures. `proposed-cases.json` remains entirely
`not-run`. `delivery-source-candidate-dispositions-bce3f075.json` exposes remaining
exact authored/overlay/Docker/CI coordinates instead of accepting a source-marker
count. `target-binding-proposals-bce3f075.json` is a justified physical proposal,
not implementation approval. Stable checkpoint identity/limits are in
`delivery-stable-completion-bce3f075-followup.json`; older receipts remain historical.

## Current frozen incomplete milestone

See [delivery-stable-milestone-dls004-20261013.json](delivery-stable-milestone-dls004-20261013.json)
and [DELIVERY-DLS-CORRECTIONS-20261013.md](DELIVERY-DLS-CORRECTIONS-20261013.md).
All 825 rows remain unaccepted; exact missing-domain and proposal-review
obligations are in the current per-field backlog. The prior bce3f075 receipt is
historical, not the identity of this expanded frozen milestone.
