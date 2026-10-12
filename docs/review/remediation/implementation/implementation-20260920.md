# Implementation checkpoint — 2026-09-20

The user authorized implementation of the assessed remaining findings, register
consistency and central operator configuration, followed by an independent fresh
review of code, removed old paths, real tests and documentation. The complete
[acceptance contract](../acceptance-20260920.md) remains in force. This checkpoint
is not an acceptance report and does not change any historical finding status.

Starting source: `cd9f235345f5fd8736a2ffe75d806288e4d538db`. Work is currently
uncommitted. The previously reviewed acceptance digest predates the subsequently
requested DOC criteria; final review must include those additions.

## Scope ledger

| Scope | Work in this iteration | Still required |
| --- | --- | --- |
| PCR-BUSTER-ENGINE-001 | Whole-operation seam mapped; provider validation/report extraction independently accepted; generic ownership drain and terminal-capacity corrections have bounded independent acceptance and shared Prism typing passes; the frozen Core snapshot passes all 12 original guest-kernel tests after a production boundary correction, not yet a Buster production cutover | Complete production native integration, broker/accounting, obsolete path removal and B1–B5 evidence |
| PCR-BUSTER-ENGINE-004 | Directory-replacement race in existing terminal cleanup hardened; fresh reviewer reproduced new tests and old defect | Positive durable orphan recovery, retained fixture and quota integration |
| PCR-OBS-002 | Manual imported-result closure projection and final inventory digest guard functionally reviewed; original combined regression 43/43 | Remaining cross-store manual retirement and all R cases |
| IFR-21-001 | Trivy database and browser archive byte locks implemented and independently checked; actual offline vulnerability scan and both-architecture archive extraction; context/input-selection corrections reviewed | Complete independent image builds and comparisons, browser execution and remaining I2/I3 evidence |
| IFR-29-001 | Current config consumers inspected | Portable operator surface and full publication inventory |
| IFR-04-001 | No new implementation claim | Access contract and real Tailnet evidence |
| IFR-10-001 | No new implementation claim | Short-lived build isolation and real negative/positive cases |
| IFR-01-001 | Namespace absence and DA1–DA8 API-error guards independently accepted, including the corrected actual-Helm storage omission | Complete bootstrap/recovery and applicable real host tests; unrelated API paths are not covered by this bounded review |
| IFR-02-001 | Missing Cilium runbook restored; CG1–CG6 script guards and fixture-limited evidence independently accepted | Actual host maintenance inventory, complete C2 acceptance and separate live migration/recovery |
| IFR-06-001 | S1/S2/S-DOC locally accepted against actual pinned chart rendering and versioned upstream source | Separate real backup/restore, rotation, outage and recovery gates |
| IFR-16-001 | Existing reservation checker inspected | Full resource/storage budget and measured capacity tests |
| IFR-26-001 | Manual retirement, original-digest resume binding and real storage roundtrip implemented; independent review confirms 10 filesystem and 2 native cases plus failing mutants | Full DB/reference/session recovery, key/journal binding and external recovery evidence |
| IFR-28-001 | Existing independent-access boundary preserved | Concrete externally available recovery contract and evidence |
| IFR-05-001 | Existing local closure preserved | Separate live GitOps evidence; no reopened implementation claim |
| REGISTER | Generator/checker, 26 cases and original-reference correction independently verified; individual matrix mapped | Original first-draft A1 timing violation cannot be retrospectively erased; no overall goal closure inferred |
| CONFIG | Twenty-four Prism settings across twenty-eight historical reads use central strict startup loaders; Control listener delivery and route extraction independently accepted after logger correction; native execution remains separate | Full setting inventory, remaining consumers, capacity consistency, actual native/image proof and final complete integration review |

## Environment and observed baseline

`npm ci --ignore-scripts --no-audit --no-fund` installed 476 packages successfully.
`npm run plugin-system:sdk:check` and `node scripts/versions.mjs --check` passed;
42 generated version files had no drift and four toolinputs/five locks matched.

The first invocation of the existing Buster fixture-control and fixture-journal
tests failed all 12 cases because this Alpine workspace provides BusyBox at
`/usr/bin/flock`, which does not accept the required `--timeout` option. These
are failed executions, not passing fixture evidence and not proof of a production
regression. The production lock code uses that absolute path; putting another
flock on PATH does not change it. Production locking must not be weakened to
accommodate the development environment.

The backup agent prepared actual Alpine GNU/util-linux/PostgreSQL tools in
a private temporary directory. A separate tool environment must be identified
in each test receipt. It is not a container image, delegated kernel runtime or
production recovery proof. Docker, a C compiler and Go were not present in the
initial PATH; no complete image/native-kernel acceptance is claimed.

The 12 fixture-control/journal cases now pass with genuine util-linux `flock`
bound at the production absolute path using proot. A first proot attempt without
the trailing `!` dereferenced the BusyBox symlink and failed all cases again;
that failed setup is not a code defect or a passing run. The successful command is:

```sh
LD_LIBRARY_PATH=/tmp/prism-native-tools/root/usr/lib:/tmp/prism-native-tools/root/lib \
/tmp/prism-native-tools/root/usr/bin/proot \
  -b '/tmp/prism-native-tools/root/usr/bin/flock:/usr/bin/flock!' \
  /usr/local/bin/node --test --test-concurrency=1 \
  tests/verification/reliability/buster-fixture-control.test.mts \
  tests/verification/reliability/buster-fixture-journal.test.mts
```

The first successful output was tool output only; a repeated evidence-capture
run is stored in [baseline log](../../evidence/implementation-baseline-20260920/buster-fixture-baseline.txt).
No fake-root flag or replacement lock implementation was used. This proves these
filesystem/control cases, not delegated cgroups, namespaces or native cutover.

Go 1.26.5 was subsequently downloaded from `go.dev/dl` into `/tmp` and its archive
matched `versions.json` SHA-256
`5c2c3b16caefa1d968a94c1daca04a7ca301a496d9b086e17ad77bb81393f053`.
Its executable is `/tmp/kubeclaw-review-go/go/bin/go`; no system installation was
performed. The real NRI build now runs, but its test reaches and fails the actual
root-owned policy boundary (`NATIVE_NRI_POLICY_NOT_TRUSTED`) in this UID-1000
workspace. [Output](../../evidence/implementation-baseline-20260920/prism-native-runtime-go.txt).
Ownership checks were not weakened. `/sys/fs/cgroup` is root-owned, no delegated
writable cgroup or Docker socket is available, and process capabilities are zero.
The user has been asked for the existing isolated test host or CI runner while
local work continues. This does not block unrelated implementation work.

## Documentation gates and broader integration

Actual operator documents and review links pass `docs-check-refs.mjs`.
Frozen reviewer copies use `.md.snapshot` filenames, with separate storage maps;
their bytes and source identities are unchanged. They are evidence, not new
current pages whose relative links resolve inside the archive directory.

The full documentation check initially found stale generated inventories. The
existing inventory/reference/blueprint/publication generators were run. Blueprint
classification lacked all historical `docs/review/` material and the evidence
matrix omitted delivery-manifest v3; it also incorrectly described Prism as
unimplemented. Those source descriptions were corrected. Every review file
remains in the exhaustive ledger as internal review/evidence, not omitted.
A fresh reviewer independently proved a complete positive generator run and a
negative run with a new unclassified document outside `docs/review/`: it still
fails. At that review snapshot, all 2476 review files had matching ledger rows.
The final ledger must be regenerated after parallel evidence creation stops.

Publication validation passes (64 pages, 50 plugins). **The complete `docs:check`
does not yet pass.** Its migration-workflow phase also invokes behavioral gates,
and found missing historical HTTP proof paths, undocumented schema fields/error
codes, existing lint-cutover expectation failures, and Alpine `tar`/`flock`
prerequisites. Separately, the new `operator` section exposed an existing E2E
reader that rejected the expanded authored file; its shared-validator integration
now passes the full 66-case workspace/profile suite. The five local Prism HTTP
settings also have an [independent final review](independent-config-final-20260921.md).
No historical proof was silently replaced and no error-code/schema check was
disabled. The documentation-check attempts are preserved under
[baseline evidence](../../evidence/implementation-baseline-20260920/).

On 2026-09-21, the actual schemas and runtime branches were used to complete the
three missing project fields and 17 missing error descriptions. Both reference
gates now pass. A [fresh documentation review](independent-reference-docs-20260921.md)
found four imprecise descriptions; all were corrected and rechecked against the
runtime. This fixes those reference gaps, not the remaining behavioral gates.
The [migration proof repair](migration-gates-20260921.md) retains failures from
the complete workflow and records exact old-to-current proof mappings.

## Completed bounded checks on 2026-09-21

The [Trivy input-lock implementation](trivy-database-lock-20260920.md) pins actual
official vulnerability and Java artifacts, removes mutable build refresh paths,
and installs only verified inputs. Its [fresh independent review](independent-trivy-lock-20260921.md)
confirms 19 boundary/version tests and meaningful integrity mutants. One actual
offline scanner integration passes using the original installer and a vulnerable
dependency. Complete images remain open; the later browser archive slice below
supersedes the earlier pending archive-input work. A supplementary full
production-freshness suite was initially interrupted by environment reset after
its first case. The subsequent complete run passed all four original tests,
including stale/malformed/FIFO metadata rejection. Both logs remain preserved;
only `production-freshness-retry.txt` is a completed suite result.

The [independent Buster cancel review](independent-buster-cancel-20260921.md)
repeats the complete remote-plan contract with actual GNU tar/flock and confirms
the specific early-cancel fix; its negative control starts the forbidden executor
when the two production checks are removed. It does not identify the historical
uninstrumented shutdown timeout's exact schedule or close native accounting.
Temporary Alpine tools now live in ignored `node_modules/.cache/native-host-tools`
because environment resets removed `/tmp` tools and terminated running tests.
No fake root or altered production lock implementation is used.

## Cilium documentation slice

The actual deploy script referred to the absent `docs/ops/cilium-networking.md`.
The new runbook describes its single-node same-CIDR boundary, mandatory current
inventory, independent access, policy exceptions, positive/negative application
checks and phase-specific recovery prerequisites. It distinguishes endpoint
revision checks from complete Pod coverage and marker existence from evidence.

Local checks: both referenced deployment/migration shell scripts pass `bash -n`;
the runbook's local Markdown links resolve. These checks do not verify the
script's mutation behavior or perform migration. C1/C-DOC are prepared for review;
C2 and real host inventory/rollback/Live cases are still pending. The original
implementation and deferred Roadmap order are unchanged.

## Additional integrated slices, 2026-09-21

The [browser archive implementation](browser-archive-lock-20260921.md) binds the
ten original Playwright archives for both image architectures to byte identities.
Actual download and extraction are recorded; browser launch and image execution
are not. [Independent review](independent-browser-archive-review-20260921.md)
found and verified corrections to Docker context inclusion and image input
selection. The official Moby matcher validates explicit local COPY inputs and
protected exclusions. Both authored database/browser identities and installer
changes now affect the production image-selection digest. The combined original
lock/version/selection suite passes 30 tests without skips, recorded in
`../../evidence/browser-archive-lock-20260921/combined-input-locks.txt`.
The subsequent [lint cleanup](browser-lint-cleanup-20260921.md) splits unchanged
validation, uses a literal module path and declares two exact infrastructure
environment adapters. Its [fresh independent review](independent-browser-lint-cleanup-20260921.md)
passes canonical lint, repeats all 30 tests, checks six actual GitHub-entrypoint
branches and rejects a bounds mutant. These focused checks do not imply a clean
complete repository gate.

The sixth central Prism setting,
[maximumInputBytes](config-input-limit-20260921.md), supplies HTTP admission and
the native input parser from one startup snapshot. The former operator
environment setting is rejected; the generated child transport has a distinct
internal name. The existing HTTP 422 behavior is preserved.
[Independent review](independent-prism-input-review-20260921.md) repeats 123 tests,
actual chunked input and child-parser checks, and rejects a constant-limit mutant.
This does not prove complete native execution or close the full configuration
inventory. A broader release test exposed rejection of the chart's canonical
symlinks. Its [bounded correction](release-config-aliases-20260921.md) passes
25 tests across five original suites. The
[fresh independent review](independent-release-alias-review-20260921.md) repeats
those tests, rejects three semantic mutants and checks additional actual Git
states. No open finding remains in that bounded release correction.

The [SPIRE recovery matrix](spire-recovery-matrix-20260921.md) and
[independent review](independent-spire-review-20260921.md) establish local
S1/S2/S-DOC against actual chart rendering and pinned upstream configuration.
The runbook includes the SQLite database and signing keys, cold coherent backup,
isolated restore, real TTL inheritance and renewal limitations. Separate live
snapshot, restore, rotation and outage evidence remains absent; IFR-06-001 stays
open.

The full migration workflow still fails five gates in
`../../evidence/migration-gates-20260921/all-native-tools.txt`.
Building the original sandbox resolves its missing-binary condition, but the
HTTP retry exits with SIGSEGV under this Alpine/proot environment. That retry is
not a passing runtime proof and its cause is not established. Other failures
include production provider digest, schema installation and native library
availability. The complete documentation/workflow gate remains unpassed.
An additional unchanged HTTP implementation run without proot fails at the
actual BusyBox flock's unsupported `--timeout` option
(`../../evidence/migration-gates-20260921/http-implementation-without-proot.txt`).
It neither passes the contract nor establishes the cause of the proot SIGSEGV.
An unprivileged user-namespace probe (`unshare -Ur /usr/bin/id`) is also denied
by the runtime with `Operation not permitted`; see the adjacent
`user-namespace-probe.txt`. No namespace-based replacement test environment was
established, and no host executable or security setting was changed.
Generated documentation and publication checks were rerun successfully; their
`docs-*-current.txt` logs are in `../../evidence/implementation-baseline-20260920/`.

## Next deployment guard work

The [namespace guard](bootstrap-api-guard-20260921.md) now requires a successful,
validated namespace collection before inferring absence. Its implementation
checks exit status before parsing stdout, including the actual kubectl case
where an API 404 still prints an empty List. Fourteen shell orchestration cases
pass; fixtures establish script control flow, not a live API or fresh host.
The [independent review](independent-bootstrap-api-guard-20260921.md) accepts the
bounded HA1–HA5/HA-DOC slice after its own 14 original tests, eleven additional
cases, four detected mutants and five original-script runs with actual kubectl
against a local HTTP fixture. Exact reviewed snapshots are retained for comparison
with the subsequent wider API-error correction.

This is only the namespace lookup. The pre-follow-up source inspection found generic
`is_not_found_error` classification in `scripts/deploy.sh`: Helm-idle admission,
optional status output, resource deletion helpers, Tailscale OAuth secret lookup,
and Helm uninstall. In particular, misleading error text can still admit the
Helm operation or OAuth secret apply; deletion helpers can misreport an API error
as absence. These paths need separate exact-result handling and regression tests
before claiming broader bootstrap/API error closure. They are not covered by the
namespace slice's passing cases. Their
[follow-up matrix](deploy-api-errors-20260921.md) governs the wider correction
now independently accepted as described below. No execution against a cluster
was performed.

The [Cilium observation guards](cilium-observation-guards-20260921.md) replace
inline permissive observations with explicit node/CRI checks and reject empty
endpoint observations or missing/invalid policy revisions before cleanup. The
48 original-script invocation cases pass against explicitly fake command
observations. Pinned K3s/cri-tools source supports the expected serialized shape;
it is not evidence of the current cluster's state. The
[independent review](independent-cilium-observation-20260921.md) accepts CG1–CG6
after repeating the original cases, twenty additional optimized-Python cases,
four detected unsafe mutants and upstream byte verification. Some malformed
endpoint nesting yields a Python type error; it still stops before deletion.
C2 and live connectivity,
workload coverage, migration and recovery gates remain open.

The [shared Prism result/deadline slice](config-result-dispatch-20260921.md)
adds `operator.prism.native.maximumResultBytes` and `dispatchTimeoutMs`, bringing
the current bounded migration to eight settings. Both Control and Worker load
the same authored configuration through their production startup path and receive
the actual read-only Helm mount and checksum. Old result/deadline environment
resolvers are removed and competing settings rejected. The implementation report
records 172 runtime/render tests, two actual durable-journal tests, nineteen
release integration tests, twelve existing Control composition tests, seven
additional Control tests and five E2E reader tests, all passing without skips.
Type checking, focused lint and schema/error documentation checks also pass.
The [independent review](independent-config-result-dispatch-20260921.md) accepts
CR01–CR07/CR-DOC after its own runtime, journal, Control, release and GitOps runs,
additional real-stream cancellation checks and two detected transport mutants.
It discovered two further release fixtures that rewrote relative chart aliases;
the corrections preserve the actual links and commit the actual schema, without
changing any assertions or production guard. The corrected deployment and GitOps
suites pass eight and six original tests respectively; initial failures remain
preserved. Actual native supervisor/host
execution, the Docker smoke gate and the PostgreSQL native operation gate have
not been executed for this slice; their distinct prerequisites are not replaced
by its successful HTTP transport and journal tests.

The wider deployment API-error correction is now independently accepted for
DA1–DA8/DA-DOC. Its [initial independent review](independent-deploy-api-errors-20260921.md)
reproduced a
blind spot with actual Helm and a local HTTP API: Helm's decoded release list
silently skips corrupt storage records, so a successful empty list or an older
valid release can conceal existing or pending state. The scripted CLI-fixture
tests passed but did not represent that decoder behavior. The corrected path
inspects raw backend identities and requires original Helm to decode every
observed revision. It rejects incomplete lists and Helm-only connection overrides
that could separate the two clients' observed clusters. Independent final runs
pass 83 script-entrypoint scenarios, eighteen namespace cases and eighteen actual
kubectl/Helm probes against local HTTP fixtures. A latest-revision-only mutant
fails specifically when older history is corrupt. The report preserves the
initial rejection and binds the corrected source, tests and operator docs.
No Helm mutation has been run against a real cluster, and H1–H3 remain open.

The deployment inventory was regenerated after these script changes. Generated
documentation, publication, reference and topic-coverage checks pass. The main
documentation checker initially exposed a missing canonical troubleshooting
heading; that heading and its Tailscale cross-reference were corrected, and the
checker passes on the updated content. Logs are retained under
`../../evidence/implementation-baseline-20260920/`, including failed intermediate
checks. Register consistency also passes without changing any finding status.
The separate complete migration workflow still has the failures recorded above;
these documentation checks do not turn the full `docs:check` pipeline green.

Final local checkpoint for these slices: the `integrated-guards-*.txt` logs in
that evidence directory record passing blueprint generation/check, generated
documentation, main documentation check, references, topic coverage, publication,
register consistency, versions and whitespace checks. There are 44 checked
version outputs with no drift, four tool inputs and five locks. The main checker
covers 905 active Markdown files; reference checking reports 2156 local links and
812 repository path references. These are the actual bounded checks, not a
replacement for the unpassed migration workflow or native/live gates. The goal
remains active; the scope ledger above is the continuation boundary.

No deployment, host change, live outage test, push or finding closure has occurred.
Fresh reviewers must not have implemented the slice they review; the final
overall reviewer must assess the complete integrated scope, not extrapolate
from these partial checks.

## Resource policy and Buster extraction in progress, 2026-09-21

The [resource-policy slice](config-resource-policy-20260921.md) adds the three
explicit CPU-time, memory and Linux-task settings to the shared authored startup
snapshot. The [independent resource review](independent-resource-policy-review-20260921.md)
accepts the bounded functional and documentation slice: 232 runtime/Helm cases,
17 original consumers, eight journal cases and its own actual PostgreSQL replay
pass. Three private mutants are detected. The subsequent [native test maintenance review](independent-prism-native-test-quality-20260921.md)
accepts three byte-preserving filename changes, both updated command globs and
a behavior-preserving helper extraction. Its independent AST equivalence and
two negative controls pass; all 25 affected source files lint cleanly and Prism
typecheck passes. The separate actual native suite still fails for lack of its
isolated host prerequisites and was stopped after 35 seconds; that is no native
execution acceptance. The original PostgreSQL operation-journal test passes against actual
PostgreSQL 18.6 and migration 017, including changed-author-policy replay,
concurrent reservations and a killed writer. [Raw evidence and replay boundary](../../evidence/native-postgresql-20260921/README.md)
retain the failed environment setup separately. This establishes persistence,
not successful native execution or root-owned pool verification.

The [Buster integration design](buster-native-integration-seam-20260921.md)
traces all 71 required cases to production boundaries and identifies missing
helper-cgroup ownership, fixture progress reservations, durable result binding
and external BuildKit accounting. The bounded extraction of existing provider
result validation and report finalization is [independently accepted](independent-buster-specialist-extraction-20260921.md).
The scheduler calls the extracted implementation directly, with old inline
bodies removed. Independent differential probes cover 24 validation, 28 report
finalization and seven canonical-encoding cases; the package-binding mutant is
detected. Before/after runs distinguish a real pre-existing adapter timeout bug
from proot process failures. Three original runner/provider modules still fail
and the runner retains 30 baseline lint errors. Neither the design nor this
preparatory extraction closes native integration.

The extraction review also ran the original adapter tests without proot and
found a real pre-existing error-classification bug: an internal adapter deadline
was exposed as caller cancellation. A [separate deadline correction](report-adapter-deadline-20260921.md)
now preserves the exact internal deadline identity after child drain. Both
original adapter/JUnit modules pass with the actual sandbox, and restoring the
old code in a private copy makes the original assertion fail. The [fresh independent review](independent-report-adapter-deadline-20260921.md)
confirms both competing abort orders, unchanged cleanup-failure precedence using
explicit post-drain fault injection, and two unsafe mutants. The subsequent [independent runtime extraction review](independent-buster-report-runtime-extraction-20260921.md)
accepts two coherent package/artifact-reader modules and removes all five adapter
runtime lint violations. The original adapters plus filesystem tests pass 6/6;
three deadline probes, ten before/after real-file reader cases and independent
removed-close/source-substitution mutants pass their intended checks. Whole
runtime/new-module lint and engine typecheck are green. The separate original
runner failures and native integration requirements remain open.


## Manual closure projection functionally reviewed

The [bounded OBS projection](attempt-closure-projection-20260921.md) replaces a
redundant resident closure with a validated reference to the complete closure
already retained in its imported result. The original fixture releases 130 net
persisted bytes and one resident slot; duplicate requests release nothing extra.
Read-only planning, actual apply fences, crash recovery and original replay
consumers are covered. The [fresh independent review](independent-attempt-closure-projection-20260921.md)
accepts this behavior. The subsequent [Store extraction review](independent-attempt-store-quality-20260921.md) clears all ten former Store lint violations with complete original regression and mutation evidence. The global planner remains non-executable and
D07-protected materials are retained. Other store classes remain open.

A real metadata collision exposed a separate final-inventory guard defect.
The [digest guard correction](inventory-digest-guard-20260921.md) now rechecks
content with an exact original-size read bound, including concurrent growth.
Final original combined regression passes **43/43 with zero skips**; scoped
source hashes are unchanged across the run. Nine focused guard cases and both
single-defect mutations pass their intended checks. Independent actual-filesystem
probes observed 796 timestamp collisions and zero missed rewrites on the final
reader. These bounded results do not establish a general transaction against
writers that ignore the existing fences.

At the end of this bounded adapter/configuration checkpoint, documentation main,
references, coverage, publication, register and whitespace checks pass. Generated
plugin inventory was initially stale after the new modules; its failed output is
retained. After regeneration, both generated-document and blueprint checks pass.
Logs are `../../evidence/report-adapter-deadline-20260921/integrated-*.txt`.
This snapshot includes in-progress closure-projection filenames for inventory
completeness; it does not validate that unfinished behavior. Further source and
evidence additions require regenerating the inventories again. The full migration
workflow/native gates remain unpassed as described above; no overall docs-check
or goal completion is inferred from these static checks.

## Supervisor numeric configuration independently accepted

The [nine supervisor numeric settings](config-supervisor-numerics-20260921.md)
now come from the required central operator profile. Old environment authors and
the old Helm close-timeout author are rejected; actual ownership, journal and
process consumers use the profile. Close plus drain must fit strictly inside the
shutdown budget. The [fresh independent review](config-supervisor-numerics-independent-20260921.md)
accepts this bounded migration after actual Helm/runtime/journal/release/Control
checks and two semantic mutations. The original actual-Go NRI gate still fails
`NATIVE_NRI_POLICY_NOT_TRUSTED`; kernel enforcement is not established here.

The inventory now records twenty distinct migrated settings across twenty-three
historical reads. Five previously accepted HTTP worker entries were reconciled;
that correction does not count them twice. The broad F1–F6 CONFIG work remains
open.

## Final numeric/closure checkpoint

After the final independent reviews, documentation inventory/reference generation,
main documentation rules, references, coverage, publication and whitespace checks
pass. Exact commands and exits are retained in
`../../evidence/inventory-digest-guard-20260921/docs-check-results.json`.
These are the named static checks only, not the full migration/native workflow.
The next bounded change simplifies the Attempt Store to address its ten existing
lint violations. Its later source and evidence require their own regression,
independent review and generated-document refresh; this checkpoint does not
accept that forthcoming implementation.

## JUnit verification harness correction

The original JUnit executed-test contract passes under its direct invocation with
real GNU flock. Its aggregate `node --test` invocation previously inherited the
parent test context into a child runner, preventing the requested XML output.
The [small harness correction](junit-child-context-20260921.md) removes only that
child-context variable. Both invocation forms now pass; the eleven existing
assertion calls and all original scenarios remain unchanged. Canonical lint
passes. The [independent review](independent-junit-child-context-20260921.md) accepts the correction. This corrects interpretation of one
previously failing verification module; the separate Buster runner/provider
failures and native acceptance are still open.

## Supplemental configuration discovery

The [discovery extension](config-discovery-readers-20260921.md) identifies literal
computed environment reads and local parameter-based helper call candidates
omitted by the original scan. It finds 28 additional current callsites, including
five Control credential readers. Five tests, a missing-helper mutation and a
complete candidate-multiset comparison pass; all 1,349 current legacy candidates
are retained. Source enumeration is now deterministic. These are unclassified
candidates, not migrated settings or proof of F1 completeness. The historical
manually maintained inventory remains intact; the [fresh review](control-discovery-independent-20260921.md) accepts this bounded discovery extension.

Two workspace restarts interrupted ongoing Control and Store checks. Partial
logs are retained as incomplete; restarted processes are recorded separately.
The current 3 GiB container limit motivated serial heavy test execution, without
changing assertions, test scope or deadlines. The reason for the restarts is not
proven by the new container's reset memory counters.

## Control policy independently accepted

The three Control policy settings now have [fresh independent acceptance](control-discovery-independent-20260921.md):
authenticated preference subject, artifact directory and public Studio URL. The
reviewer reproduced 244 actual policy/HTTP/Helm cases and three consumer mutations,
and inspected the original runtime/Control/release evidence. The migrated total
is twenty-three settings across twenty-seven historical reads. Derived trust and
endpoint bindings, remaining operator settings and CONFIG F1–F6 remain open.

## Control image author found after review

The prior Control review omitted the final image's `ARTIFACT_ROOT` declaration.
Root reproduced its conflict with the real central loader and the image proof's
failure to inspect inherited environment. The [correction](control-image-environment-20260921.md)
removes that author and preserves inherited environment in both proof loaders.
Two-profile source/environment integration plus original config cases pass 5/5;
both old-path mutations fail. The [fresh correction review](control-image-environment-independent-20260921.md) accepts this local source/environment integration. The earlier Control review alone was insufficient for this path. No image build
or native/cluster result is inferred.

## Store quality independently accepted

The public Attempt Store now delegates to five cohesive responsibility modules
and one state owner. Its [fresh review](independent-attempt-store-quality-20260921.md)
accepts API, lock, quota, snapshot and synchronous-commit preservation. All 43
original tests, the caller-mutation probe, JUnit consumer, three semantic
mutations, both typechecks and complete canonical lint passed. This eliminates
the previous ten Store lint violations without changing their rules. The wider
retention finding stays open for its remaining stores and release classes.

The Control/Store documentation checkpoint regenerated plugin inventory,
documentation inventory/references and blueprint. Generated checks, blueprint,
main documentation rules, references, coverage, publication, register consistency
and whitespace all pass; exact commands and exits are retained in
`../../evidence/control-store-checkpoint-20260921/commands-results.json`.
This is the named static documentation checkpoint, not the complete migration or
native workflow. The evolving native topology review and later test/doc additions
require another relevant refresh; no acceptance of those edits is inferred.

## Native ownership: drain correction and remaining admission work

The [fresh topology review](independent-native-topology-20260921.md) found that
metadata exhaustion could prevent the subtree drain from being called. The
corrected lifecycle attempts the identity-checked drain even when persisting
quiescence fails, while retaining ownership and refusing successful finalization,
deletion and capacity release. Nine independent control-flow/store probes pass;
restoring the unsafe early exit in a private mutation is detected. These probes
use real durable metadata and explicitly modeled scope methods, not a native
kernel. The original real-host gates remain unavailable and unverified.

The correction does not reserve future terminal metadata at admission. An
already saturated store can therefore retain a drained owner that cannot be
finalized at its unchanged limit. [Terminal-capacity acceptance](ownership-terminal-capacity-20260921.md)
defines the next implementation boundary, including concurrent reservations,
actual serializer bounds, historical-store behavior and documentation. No quota
increase, automatic pruning, restart guarantee or complete NT acceptance is
claimed. The generic topology remains preparatory work for Buster integration.

## Follow-on terminal-capacity implementation

The [terminal-capacity correction](ownership-terminal-capacity-20260921.md) now
checks the whole store's prospective lifecycle bytes under the admission lock.
New owners and children cannot consume the reserved future metadata of existing
owners. Actual configured limits, historical readability and the safe-drain
fallback remain unchanged. Existing saturated history is not retroactively made
recoverable by this admission rule.

The author froze the Core sources after 27 maintained filesystem/consumer cases,
native type validation and scoped canonical lint passed. The complete node-pools
gate remains 33/35 with its two unchanged root-authority prerequisite failures.
The [supplemental serialization probe](../../evidence/ownership-capacity-bound-probe-20260921/README.md)
was repeated on the frozen implementation: 180 valid states fit the prior byte
commitment, an exact boundary is reached, and the diagnosis-omission mutation is
detected. These checks do not establish native enforcement. The [fresh review](independent-ownership-terminal-capacity-20260921.md)
accepts TC1–TC5/TC-DOC after repeating the maintained 27 tests and adding four
independent filesystem/consumer probes and two detected semantic mutations.
The independent reviewer also ran the shared Prism typecheck after the separate
Control source freeze; it passes. This resolves the previously deferred compiler
check, without claiming native host proof. The subsequent Control review is recorded below.
No complete finding is closed.

## Control listener and route quality accepted after correction

The [listener migration](config-control-listener-20260921.md) makes
`operator.prism.control.port` the single Control listener author, including probes,
Service targets, Envoy and network policy. Control's old `PORT` paths are removed;
Worker's separate setting remains. This brings the bounded migration to 24
settings and 28 historical reads. Image checks now select the actual service role;
they do not establish a successful image build or deployment.

The [route extraction](control-route-quality-20260921.md) replaces the oversized
handler with explicit route modules. Root subsequently found a real logger
regression missed by the initial independent review: a raw stderr write could
terminate the server when the original Console behavior continued serving.
That acceptance was reopened, the implementation corrected, and the
[fresh corrected review](independent-control-listener-quality-20260921.md)
accepted CL1–CL6/DOC and CQ1–CQ6/DOC after 357 maintained tests, types and lint,
plus actual HTTP child-process comparisons against the original and regressed
implementations. Final source and documentation identities are bound in evidence.
The proven closed-descriptor case is not a universal log-sink guarantee: the
separate EPIPE probe fails on both original and corrected implementations and
remains an explicit baseline limitation. Full CONFIG and all native/live gates
retain their separate open status.

## First isolated native VM run — failed, retained

The [isolated VM execution](isolated-native-vm-execution-20260921.md) boots a real
Linux kernel with unchanged native tests, fixed guest resources and no host
cgroup changes. Native results are 1 passed and 11 failed out of 12; node-pools
results are 30 passed, 1 failed and 4 cancelled by their original test timeouts
out of 35, with no skips. The wrapper correctly reports failure despite clean
guest shutdown and no outer watchdog intervention.

The passing native case establishes only separate scope CPU accounting and final
counters after drain in this guest. The other native cases reject an invalid
guest identity written by the fixture before exercising ownership behavior.
Root and the preparation reviewer missed that format requirement. The node-pools
failure is the missing real systemd parser; the four timeout cancellations remain
failed acceptance evidence without a proven performance diagnosis. The
[independent interpretation](independent-isolated-native-vm-proposal-20260921.md)
retains these omissions and limits. A corrected guest identity requires a separate
run and evidence; the failed result is not overwritten or counted as acceptance.

## Corrected VM fixture exposes a production limit-boundary regression

The separate [second VM run](isolated-native-vm-run2-execution-20260921.md)
passes the real guest identity reader, compilation and native typecheck. Eleven
of twelve unchanged native cases pass, including actual helper OOM/task pressure,
aggregate counters, protected replacements and descendant drain after a failed
quiescing write. The complete gate still fails: `runNativeWorkerProcess` passes
its complete process policy to a scope validator requiring only memory and tasks.
This is a production regression exposed by execution, not another fixture error.

The [boundary correction](native-process-scope-limits-20260921.md) explicitly
projects those two scope values while retaining the full policy for process
input/output, CPU and deadlines. The original child decoder remains strict.
Author checks pass; the subsequent fresh review and corrected original kernel
consumer are recorded below. Run 2's node-pools gate remains 30 passed, 1 missing-parser
failure and 4 timeout cancellations out of 35, without skips. Both failed VM runs
and their immutable source bindings remain separate. Concurrent Buster/shared
configuration edits were excluded by the frozen VM snapshot; these runs do not
prove the current whole-workspace integration or close a complete finding.


## Corrected production consumer passes the original guest-kernel gate

The separate [third VM execution](isolated-native-vm-run3-execution-20260921.md)
passes all 12 original native tests without failures, cancellations or skips,
including the previously failing production launcher, owner, journal and replay
case. The [fresh independent boundary review](independent-native-process-scope-limits-20260921.md)
binds the corrected source, original consumer result and final disk identity.
The four added process-policy cases also pass; their modeled ownership remains
explicitly distinct from the original kernel tests.

The overall run still fails: node-pools passes 34 of 39 cases, with one missing
systemd-parser failure and four original-deadline cancellations. No deadlines,
assertions or resource budgets were relaxed. Both earlier failed runs remain
preserved. This is bounded functional evidence from a disposable Linux guest
for the frozen source snapshot; subsequent Buster preparation, cleanup recovery
and journal-capacity work require their own verification. It does not establish
production host capacity, an actual image build, Buster cutover or complete
IFR16 acceptance. All thirteen incomplete findings remain open.


## Journal admission reserves terminal metadata

The [journal-capacity correction](native-journal-terminal-capacity-20260921.md)
reserves future metadata before retaining a new input or accepting its identity,
under the existing admission lock and unchanged quotas. A preserved filesystem
counterexample shows the old code admitting work that later failed to archive
valid completion diagnostics because the metadata store was full. The new rule
charges the complete durable-store representation, all pending rows and retained
history; it never persists projected observations or prunes original evidence.

The [fresh independent review](independent-native-journal-terminal-capacity-20260921.md)
accepts JC1–JC5/JC-DOC: six unchanged original tests and four maintained capacity
tests pass, as do two independent concurrency/serialization probes, types and
lint. Removing the reservation admits seven attempts into a one-slot budget and
fails the independent assertion. An initially invalid Unicode probe is retained;
the corrected probe explicitly verifies its rejection without metadata changes
before testing valid escaped diagnostics. Historical overcommit remains readable
but can still prevent terminal writes. This closes the bounded admission defect,
not Buster's pending source-cleanup authority or the complete native finding.

## Core cleanup reconciliation independently accepted

The approved [reconciliation seam](native-source-cleanup-reconciliation-20260921.md)
now accepts an optional trusted capability while preserving no-hook behavior.
Core checks both disposed ownership records, full original identity/receipt
binding and a separately sealed cleanup result. It recomputes the result using
the original executor finalizer and archived process output/accounting, so a
standalone success flag or mismatched stored result cannot release the fence.
The original failed receipt is unchanged. Author checks pass 30 filesystem and
protocol cases, types and lint; two archive-check negative controls fail as
intended. Ownership is explicitly modeled in these tests, with no kernel or
source-deletion claim. The [fresh nonauthor review](independent-native-source-cleanup-reconciliation-20260921.md)
repeated all 30 tests and added six independent probes plus two detected semantic
negative controls; scoped types and lint passed. Buster's publication
fence, root ledger, deletion eligibility and crash reconciliation remain WIP;
this preparatory Core capability does not close RC4/RC5 or a complete finding.

## First Buster helper guest proof — failed, retained

The separately reviewed HA guest compiled both current helper variants and the
preserved old helper, applied actual file capabilities and executed seven cases.
Six passed; the file-capability case failed because the intended inaccessible-group
ACL probe reached `BUSTER_SANDBOX_CALLER_DENIED` instead of filesystem permission
denial. The allowed target UID/GID, cleared capability sets and NoNewPrivs assertions
follow that assertion and were not executed. Neither the author nor independent
fixture review predicted this runtime behavior. Its precise credential/permission
cause remains unproven; production helper behavior is not changed on that guess.

The wrapper correctly returned failure despite normal guest poweroff (QEMU exit
0, 68.116 seconds, no watchdog stop). The passing private-source test demonstrated
both ordinary UID 1000 denial and the preserved old file-cap helper's actual UID
1003 access. Configuration permissions and the unprivileged generic helper also
passed. This partial evidence does not accept HA3/HA4/HA5 or complete Buster
integration. Preserve this run separately before any diagnostic fixture revision;
see the [execution checkpoint](isolated-buster-helper-vm-execution-20260921.md).

## Helper ACL failure diagnosed with actual pre-exec credentials

The separate [ACL diagnostic execution](buster-helper-acl-diagnostic-execution-20260921.md)
measured the original setpriv process immediately before helper exec. Its UID/GID
were 1003 and its supplementary groups were empty, but its effective capability
mask still included DAC override. Instrumented and original commands produced the
same policy rejection. An ordinary zero-capability Node caller received actual
EACCES; the independent allowed-browser positive then proved UID 1001/GID 1000,
empty supplementary groups, zero effective/permitted/inheritable/ambient
capabilities and NoNewPrivs=1. The [fresh interpretation](independent-buster-helper-acl-diagnostic-20260921.md)
binds these observations separately from the unchanged seven-case suite, which
still failed 6/7. Wrapper exit 1 is retained; no full image or Buster claim follows.

The maintained ACL fixture now constructs an ordinary caller, verifies its
actual credentials and zero capability masks, then requires EACCES. All other
original assertions remain, including the allowed-target positive. Syntax and
scoped lint pass; the corrected complete guest gate and fresh review are pending.
No production helper was changed to match this fixture failure. Subsequent
Buster two-slot identity and publication work remains outside the frozen guest
proof and needs its own integration evidence.


### Corrected helper guest — bounded independently accepted result

The [separately bound second run](isolated-buster-helper-vm-run2-execution-20260921.md)
passes all seven original cases, with zero failures, cancellations or skips.
The actual guest compiler/filecaps and both capability-free denied caller and
allowed browser identity execute successfully. Wrapper/source verification and
final disk hashing completed with exit zero; elapsed QEMU time was 68.109 seconds
with no watchdog. Three preboot memory refusals remain recorded; the same
unchanged guard later admitted execution after quiescence.

The [fresh execution review](independent-buster-helper-vm-run2-20260921.md)
accepts this bounded helper result and verifies sixteen frozen source/test/proof
identities. Only the two declared test-fixture files differ from the failed
baseline. Original failed runs remain preserved. No built-container-image,
subsequent UID1004/two-phase Buster integration, source cleanup or full finding
closure is claimed. The separately prepared startup/storage diagnosis now runs
under its original reviewed limits; its original deadline failures remain open
until actual output is evaluated.


### Read-only operational input snapshot

A [dated MCP inventory](readonly-operations-inventory-20260921.md) now records
actual node/version/capacity, Argo application state and kube-system DaemonSets.
This is partial C1/D1/H1 input, not a completed gate. The returned capacity is
12 CPU; allocatable and usage are absent. The deployed Git revision differs from
this tree; existing degraded/sync states remain separate operational findings.
No deployment, pod/node command, outage test or cluster mutation occurred.


### Startup/storage diagnostic — failed, retained

The [diagnostic execution](native-vm-startup-storage-execution-20260921.md)
hit its unchanged 900-second outer watchdog. All three instrumented 9p readiness
probes timed out; the two complete original modules yielded 11 passes and four
timeout cancellations among fifteen cases, with no skips. Full source verification
preceded the probes. The run reached ext4 staging but no verified ext4 comparison.
Independent review confirms the failed outcome; no storage/TCG/Ajv causal claim
or deadline increase follows. The original combined-guest failures stay visible.
A genuine systemd parser is now being prepared in an authenticated extract-only
workspace runtime, with no host installation or service execution.
