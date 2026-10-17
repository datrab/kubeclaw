# Independent CONFIG C0 review — 9452d355 (incremental, NOT ACCEPTED)

Reviewer: native task `/root/independent_c0_review`, 2026-10-12. No implementation
or author role; no production/test edits, commits, deployments, or paid Evals.
Read D17–D22, `OPENCLAW-CONFIG-GOAL.md`, original CONFIG F1–F6/F-DOC,
F2a/F3a/F4a/F5a/F-DOCa, A1–A8, and author artifacts as claims to challenge.

## Identity and verdict

Checkout `/home/node/.openclaw/workspace/kubeclaw-config-c0`, branch
`codex/config-c0-semantic-inventory-20261012`; HEAD
`9452d35524192f8665bc87254b3c63a361e7bd4a`; HEAD tree
`89fa8e4d683cf442deb189d60ce8b7cc1ff05327`.
The tracked patch at my initial observation was empty. A later author amendment
to `OPENCLAW-CONFIG-GOAL.md` is tracked and retained separately in
`independent/tracked-later.patch`. C0 artifacts are untracked
and being changed concurrently by authors. Therefore this is **not a frozen final
acceptance identity**. `independent/review-input-identities.json` records the
observed untracked input SHA-256/size and all tracked Git mode/blob identities;
material corrections must be frozen and rechecked. Do not attribute an interim
count/hash failure to the final artifact set without rerunning it.

- **C0-A: NOT ACCEPTED.** Full source enumeration is recorded, but independent
  semantic disposition of the complete field/candidate set remains unfinished;
  concrete productive settings are absent and large reader/schema scopes open.
- **C0-B: NOT ACCEPTED.** Shared lease API authority is contradictory; numerous
  current values/defaults and target owners remain generic/unresolved.
- **C0-C: NOT ACCEPTED.** Gateway/health/store literal policies are omitted;
  activation/domain/error contracts and precise field/case assignment remain open.
- **C0-D: NOT ACCEPTED.** Definition describes a plausible proposed transition,
  not complete actual module/adapter/observer/operation membership and field-level
  recovery/activation compatibility. Run-lived adapter policy is wrongly given
  generic module-start eligibility.
- **C0-E: NOT ACCEPTED.** This fresh independent review exists, but blocking
  corrections and exhaustive semantic recheck are outstanding. C1 is expressly
  not approval-ready; no approval should be requested from this stand.

Implementation cases remaining `not-run` are appropriate in C0. They must be
concrete and independently reviewed; C0's own source/definition checks must have
actual evidence. No implementation runtime PASS is demanded before approval.

## Independently expected versus covered scope

I enumerated **every tracked path**, not only the author's source-index/filters.
`independent/source-roster.json` holds the full 22,665-path set, content identities,
provisional source/test/example/history boundaries, and primary inventory links.
Test/example paths are *not* automatically excluded from delivery: actual image
COPY/role-package closure can make them relevant. Git mode/blob identity is the
symlink's identity; roster `sha256` for symlinks deliberately hashes resolved bytes
and must not be mistaken for the Git link-text blob.

`independent/expected-field-obligations.json` independently enumerates 52,029
conservative obligations at the initial observed stand: 17,683 JSON/YAML
source/data leaves; 15,041 schema-document leaves; 15,523 literal/default/CLI/task
candidates; 3,615 literal ENV reader/author sites; 167 dynamic ENV-map sites.
557 obligations had an exact primary-source/field row match against the initial
1,791-row inventory. This is **not 557 settings covered or 51,472 settings
missing**: schema keywords, task/protocol/test/history fields and lexical false
positives require semantic disposition, and readers may be linked from another
primary author. I retain the entire expected set so exclusions are inspectable.
Helm templates cannot be parsed as plain YAML: 36 failures are explicitly retained
and must be expanded through template references/literals/render paths, not hidden.

`independent/expected-logical-schema-fields.json` independently traverses all 273
tracked non-review schema documents, their properties/items/combinators/patterns
and local refs, including orphan `$defs`: 9,537 logical field obligations, 430
exact source/logical-field matches. Duplicate root/definition views are preserved;
external-ID refs and recursive JSON patterns remain explicit unresolved
obligations. The repo's registry `$id` map must resolve external-ID refs; no
network schema guess or unbounded JSON property expansion proves coverage.

`independent/expected-case-obligations.json` records independent per-operator-field
obligations (real distinct profiles, required/inactive, type/unit/domain, unknown
owner/key, equal-valued competing author, semantic fallback mutation, activation,
recovery/budget, provenance/redaction) plus 25 global delivery/binding/C1/F-CODE/
F-DOC obligations. These are reviewer obligations, not fabricated executed tests.
The expected operator set must also expand when absent settings are added.
At the initial 1,067-case stand, every existing row was referenced by some matrix
case, but that is insufficient: linking a schema-discovery group to a setting
cannot satisfy its real consumer/negative/activation cases.

An independent later observation had 1,088 cases, all `not-run`, only one tagged
C0 (`RT-C0-SCHEMA-DISCOVERY`). `independent/independent-integrity.json` preserves
exact missing-field sets, duplicate-ID observations and semantic states. This
later snapshot lacks `command` in 1,068 cases, `productiveCaller` in 920,
`testDigests` and tool/dependency/image/config identities in all 1,088. Runtime
future identities may legitimately be pending, but proposed executable commands,
caller/input/prior state/observer/rejection expectations cannot stay generic at
C0 acceptance. Schema-only rows retain `unit: schema-defined`, null verified
reader, and “See owning schema”/“See candidate lines”; those are open obligations.

## Blocking findings and concrete correction/recheck requests

### IC0-001 — missing productive template/Go/store policies (C0-A/C)

`charts/kubeclaw/templates/deployment.yaml:712–713,834–835` supplies health timeout
5000, startup-status locator, Redis health stream derivation and max length 1000;
other health/drain defaults nearby also need field-level classification.
`charts/kubeclaw/templates/configmap-gateway.yaml:74–134` authors embedding model
`gemini-embedding-001`, thinking/reasoning defaults, model allowlist/runtime mapping,
context-pruning TTL 2h and compaction keepRecentTokens 140000. These are not
protocol invariants merely because the scanner starts at `.Values`.
`skills/common/plugins/artifact-store/src/adapter.ts:171` additionally hardcodes
`maximumRecordBytes: 64 * 1024` outside its config schema; the actual
`FileDurableRecordStore` constructor/append enforces this metadata size.
`cmd/buster-namespace-controller/main.go:29,213` hardcodes security observation
refresh 5 seconds and HTTP request timeout 60 seconds. `semantic-probes.json`
retains exact hashed source excerpts and observed absent inventory text matches.

Correction: enumerate and classify each policy/locator; identify actual productive
consumer and sole target owner, supported domain/unit, activation and cases.
Distinguish protocol paths/identities from adjustable resource/time/model policy.
Expand *all* literal/template candidates, not just these examples. Global scanner
candidate counts cannot close this finding.

### IC0-002 — duplicate proposed shared lease API authority (C0-B/C)

`CMP-buster-engine-clusterInvokers.shared.leaseApiGroup` and `...leaseApiVersion`
propose Buster component authors. `DLV-NAMESPACE-CONTROLLER-BUSTER-LEASE-API-GROUP`
and `...VERSION` instead propose controller-owned authors for the same binding.
Actual `charts/kubeclaw/templates/buster-namespace-controller.yaml:212–215` emits
`$clusterShared.leaseApiGroup/version`; CRD group/version and controller RBAC use
that same selected component value. Go `newController` consumes generated ENV,
but also supplies independent literal defaults (`main.go:141–142`).

Correction: one explicitly named shared/current owner, generated controller/CRD/
RBAC projections and duplicate/alias row links, not two profile writers. Preserve
current code fallback in current-state description; proposed migration rejects
missing/equal old authors. API group/version lifecycle must cover existing CRs,
finalizers, claims, grants, started runs and controller process rollout; a merely
next-module setting cannot retarget persisted lease identity.

### IC0-003 — generic module activation conflicts with run-lived adapters (C0-D)

Example `RT-8aa1a4b60a163ab6` artifact-store `maximumRecords` has
`activation: target module-start immutable binding`. Actual
`skills/nova/core/execution/adapter-startup.ts::startAll/#start` activates a single
instance per `(package,registration)`, caches it and returns that instance to
later invocations; `adapters.ts` owns these instances across the run.
Artifact-store `activate` constructs durable records/blobs from root/quotas once.
Lowering/remapping a quota/root at next module has storage/recovery consequences,
not just stage-local tuning. Same review applies to observers, waits/secrets and
capability-provider dependencies, including parallel graph modules.

Correction: explicitly classify run/service-bound adapter fields R/S; or justify
and specify a coherent versioned per-instance design with dependency/cleanup/
retained-wait/effect ownership. Trace each registration and observer activation,
instance key and caller. No unsupported universal M assignment. Retain graph,
grants, recovery identity and consumed budgets through module transitions.

### IC0-004 — case matrix/specification is not full field acceptance (C0-C/E)

A row linked only to `RT-C0-SCHEMA-DISCOVERY`, broad chart alternatives, or a lexical
candidate consumer does not specify all necessary field cases. The generated
component numeric rule “workload lower+1” must account for aligned bytes, minima,
reserves, cadences and interacting caps at the real consumer; otherwise the
wrong limit can reject both profiles. Broad proposed commands/observers cannot
become executable merely by adding identities later.

Correction: explicit expected case/disposition set for every setting and global
case; exact consumer/action/input/profile/prior-state/observer/expected boundary,
including inactive-feature obligations and multi-field constraints. Preserve
complete profiles, fixed task data, real caller and negative positive controls.
C0 integrity/source/definition checks themselves require current raw results,
not a single group discovery case marked `not-run`. Future implementation tests
remain `not-run`; do not invent runtime PASS or skip them to close C0.

### IC0-005 — draft identity/integrity failures (C0-E; recheck after freeze)

Independent structural run returned one drift error for
`delivery/inventory-fragment.json`; independent ID check later found duplicate
`DLV-IMAGE-OPS-POD-TARGETARCH`. Strict run had 24,005 errors, predominately open
semantic/reviewer/case fields. These are observations during concurrent expansion,
not claims about the eventual final package.

Correction: consolidate once fragments freeze, remove duplicate IDs, preserve
before/after raw logs/patches and all untracked digests, execute decisive source
and definition checks against exact final input set, and request independent
recheck of material corrections. A permissive structural green would still not
close semantic review.

### IC0-006 — no green existing suite / execution prerequisite boundary (C0-E)

Author first attempt lacks Node types; later retry 505/483/22 includes omitted dev
dependency and inherited ENV setup failures. Prepared isolated-ENV retry raw log
is 649/644/5, not historical 649/645/4. Fifth failure is
`buster-admission-render.test.mjs:66`: actual UID 0 != expected real UID 1000;
independently reproduced using the exact existing named test (log retained).
The four Helm negatives reject old fields, but their expected diagnostic text
fails; no assertion changes made. Root UID is preparation failure, not evidence
that the intended service-CLI negative reached its runtime rejecting boundary.

Correction: run existing suite using its actual unprivileged service identity and
intended complete dependency/environment stand; retain earlier failures and exact
tool/setup/test digests. No test weakening or C0 production edits. Existing four
semantic diagnostic fixes belong to a specifically approved implementation slice.
Even green existing suite would not prove exhaustive C0 field definition.
I subsequently inspected `author/unprivileged-checkout.json` and
`author/config-components-uid1000.log`: the archive replay under UID/GID 1000
exited 127 before suite execution; `setpriv: setresuid failed: Operation not
permitted`. This setup limit is not a code-based C0 rejection or runtime PASS.
It remains distinct from the observed five failures above.

## Actual reviewer commands, results, and raw records

From this checkout:

```sh
git status --short
git rev-parse HEAD 'HEAD^{tree}'
git diff --binary
git diff --check
python3 docs/review/evidence/config-acceptance/independent/enumerate.py
python3 docs/review/evidence/config-acceptance/independent/logical-schemas.py
python3 docs/review/evidence/config-acceptance/author/check-matrix.py --structural
python3 docs/review/evidence/config-acceptance/author/check-matrix.py
node --test --test-name-pattern='actual service CLI rejects inherited retired ENV' tests/verification/deployment/buster-admission-render.test.mjs
node scripts/review/remediation-register.mjs --check
```

Raw outputs: `independent/enumeration-raw.log`, `logical-schemas-raw.log`,
`author-structural-raw.log`, `author-strict-raw.log`,
`uid-negative-reproduction.log`, `register-corrected-reproduction.log`,
`tracked.patch`, `diff-check-raw.log`. Register consistency succeeds **without
finding acceptance**. Empty diff-check output only proves no tracked whitespace
errors. An initial erroneous register command used nonexistent
`check-remediation-register.mjs`; that failure is preserved in
`register-reproduction.log` and was corrected, not hidden or counted as PASS.
Independent digest/ID/missing-case-field checks are retained in
`independent-integrity.json`; raw hashed source excerpts in `semantic-probes.json`.
Author raw npm/suite logs were inspected directly, not inferred from summaries.

## Limits and follow-up

This is an **incremental rejecting review**, not the final exhaustive semantic
acceptance. Full independent source/field/case *obligation sets* are retained;
remaining semantic disposition cannot be replaced by sample probes or exact-name
match counts. No production host/cluster runtime, deployed Nova profile, external
installed-plugin roster, actual capacity, Secretstore revision contract, paid
Eval or future-module implementation is available/authorized here. Those live
limitations do not excuse missing repo-based C0 classification. Current ENV
secret-resolver fetches `process.env[environmentName]` at invocation and supplies
no immutable external revision; exact secret-binding recovery is genuinely open.

Continue authorized C0 correction and independent review at a stable material
stand. C1 must freeze exact files/settings/dependency/delivery delta, preserved
selected values and cases through both Charts/images/role bundles/filter/release
paths; naming `pipeline.config.json` alone is not implementation approval.
