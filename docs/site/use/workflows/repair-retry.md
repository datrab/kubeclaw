# Inspect Technical Retry, Repair Orders, and Mandatory Rechecks

Status: maintained local Core contract rehearsal with trusted test stages; no application-delivery claim
Audience: pipeline operators and runtime developers
Owner: Nova Core lifecycle maintainers
Evidence: docs/site/use/workflows/examples/repair-retry.mjs; tests/verification/reliability/repair-budget-fixture.mjs; tests/fixtures/repair-budget/plugin; skills/nova/core/lifecycle; skills/common/plugins/artifact-store
Applies to: pipeline-definition.v2, pipeline-platform.v2, category-based repair and resume-signal.v2
Last verified: 2026-10-21; author executed the three local fixture scenarios, replay checks and rejection controls

## What this rehearsal changes

Run an intentionally failing **test checker** through the actual Core CLI,
retain its original event/effect journals and artifact store, then distinguish
technical retry from a source repair and the check that follows it. This is not
a full Nova implementation project or a live Forge, review-agent or Buster
provider verdict. No mocked Core runner or prewritten lifecycle record supplies
the result.

The repository's `test.repair-budget:execute` fixture has two modes. `source`
changes a private repository's `version.txt` and commits the change with real
Git. `check` reads that version and emits a deterministic finding selected by
its input. Both write real evidence through the shipped artifact store. These
are deliberately trusted in-process test stages: their direct Git/filesystem
access is not an example of capability-mediated production plugin isolation.
Never substitute a real project path or trust an external package to recreate
this rehearsal.

The [local shipped-stage workflow](local-core.md) owns the separate actual
Delivery Lint, repository-adapter, artifact and telemetry example. A test
checker's `passed` result here does not prove that an application passed a
production lint, review or test gate.

## Prepare and run

Prepare Node.js 24, Git, Linux GNU `flock` and the locked development/runtime
dependencies through the [developer handbook](../../extend/developer-handbook.md#prepare-a-clean-checkout).
Use an isolated selected checkout and run from its repository root. The helper
copies the existing test package and production artifact store into each
private fixture, links that checkout's dependency directory and trusts only
those copied roots. It needs no network, agent credential, Redis or cluster.
Keep the selected checkout and dependency bytes unchanged until cleanup.

```bash
export REPAIR_REHEARSAL="$(mktemp -d)/repair-rehearsal"
node docs/site/use/workflows/examples/repair-retry.mjs prepare "$REPAIR_REHEARSAL"
node docs/site/use/workflows/examples/repair-retry.mjs run "$REPAIR_REHEARSAL"
```

`prepare` must return `status: prepared`, `execution: false` and the actual
selected Source revision. `run` must return
`status: verified-core-retry-repair-rehearsal`. Do not equate CLI exit 1 with an
unexpected harness failure: the helper expects it for the deliberately blocked
and waiting Core outcomes and separately validates their JSON status. Missing
imports, an unexpected process exit, invalid journals or failed assertions are
errors; preserve the entire fixture and stop. An exclusive `run-started.json` intent precedes every Core child and remains
after error or interruption. Even an intent with no command result blocks
another `run`; do not delete it to retry. A partial run is not resumable by
rerunning `run`; use `verify` only for completed observations or prepare a new
fixture after diagnosing the failure.

### The frozen graph and budgets

Each scenario has its own real platform and graph files. Read them before using
the pattern elsewhere:

```bash
cat "$REPAIR_REHEARSAL/mixed/platform.json"
cat "$REPAIR_REHEARSAL/mixed/pipeline.json"
```

The ordinary chain is `source → lint → review → test`. Each check declares
`on.request_fix: source` and its own repair category. The source owns two
automatic orders per category and at most one additional orchestrator-authorized
order. Every stage explicitly declares nine maximum attempts, seven remediation
cycles, one technical retry and a 5,000 ms timeout. These are this fixture's
values, not inherited defaults or the project compiler's exact budget.

A retry repeats the same stage without spending a repair order. A trusted
`request_fix` result spends the requesting category's allowance and follows the
frozen repair edge. Core retains that finding, invalidates affected downstream
results and schedules the source stage. The successful source attempt produces
a new revision; checks must evaluate that revision rather than reuse old facts.

## Read the three outcomes

### 1. Retry, repair and recheck succeed

`mixed` requests one technical retry on source attempt 1. That attempt does not
change the repository. The next source attempt commits version 1. The lint
checker requests a repair at version 1, review at version 2 and test at version
3. Source repairs create versions 2, 3 and 4 respectively. Every invalidated
check runs again; its attempt count is not another category debit.

Expected final status is `succeeded`. Source has five attempts, one technical
retry and exactly three ledger orders, in category order `lint`, `review`,
`test`. Lint has four attempts, review three and test two. The initial source
attempt and technical retry are not repair orders. The final original journal
contains 132 events for this selected fixture and implementation; use identities,
results and the ledger, not event count alone, to decide what occurred.

### 2. Technical allowance ends without a repair order

`technical-exhausted` returns `retry` for both source attempts. Core spends its
one technical retry, then blocks. Expected source attempts: two; technical
retries: one; repair ledger: empty; final status: `blocked` (21 events in the
verified fixture). Increasing a category allowance would not restore technical
retry authority. Do not edit an existing graph or start a new run to disguise
the exhausted original attempt.

### 3. One exact extra order cannot authorize unlimited work

`extra-order` requests lint repairs at source versions 1, 2 and 3. Two automatic
lint orders produce versions 2 and 3. The next request exhausts that category
and creates an orchestrator wait. Read the preserved original wait in
`run.stdout`; it binds the exact request/history digest, wait and issuer.

The helper first submits the same signal envelope with a wrong pending digest.
Expect `REPAIR_AUTHORIZATION_INVALID`; original lifecycle event bytes must remain
identical. It then submits one valid `resume-signal.v2` with the actual wait,
signal type and issuer, the current pending digest and an explicit reason.
This local fixture acts as its configured test orchestrator; copying its issuer
text is not production identity authentication.

The accepted signal authorizes one source repair directly; it does not rerun the
known-failing lint check before repair. Source reaches version 4, and lint's
recheck passes. The test checker then requests another repair. Core blocks even
though that category had unused automatic allowance: after an extra order,
later repair needs operator action, not an automatic category reset.

Expected final status is `blocked`, source attempts four, ledger categories
`lint, lint, lint`, exactly one authorized ledger entry, lint attempts four, and
the test's pending repair category `test` (98 final events in the verified
fixture). A real administrator must use the supported separate authority path
or retain the stop; the helper neither fabricates another signal nor modifies
the journal.

## Audit original findings and replay

Each Core CLI child exits before the helper copies the **complete** scenario
`state/` and `artifacts/` trees. It records their byte manifest and strictly
parses every copied run journal before invoking the real audit CLI. Thus an
audit's journal-open behavior cannot replace the pre-audit raw bytes.
`extra-order` also retains a fresh capture immediately before the rejected
signal, before valid resume and before the final audit. `verify` checks the
manifest and strictly parses every copied run journal in each capture. All writers belong to those completed child processes; this
private-fixture fact does not establish a writer fence for a deployed system.

Inspect the retained command status and original audit rather than inferring
success from a terminal shell alone:

```bash
cat "$REPAIR_REHEARSAL/mixed/run.command.json"
cat "$REPAIR_REHEARSAL/mixed/run.stdout"
cat "$REPAIR_REHEARSAL/mixed/first-audit.stdout"
cat "$REPAIR_REHEARSAL/extra-order/invalid-resume.stderr"
cat "$REPAIR_REHEARSAL/extra-order/resume.stdout"
cat "$REPAIR_REHEARSAL/extra-order/final-audit.stdout"
node docs/site/use/workflows/examples/repair-retry.mjs verify "$REPAIR_REHEARSAL"
```

`verify` recomputes retained raw-tree hashes, strictly parses the original
preserved event chain and folds it through the real lifecycle recovery reducer.
Every reconstructed stage state must equal the final CLI result, including
attempt budgets, ledger and pending repair. It does not execute a stage again,
open the preserved journals for repair, or send another signal. Repeated verify
must return the same observations. A hash, parse or replay mismatch is a stop,
not permission to rewrite the fixture to match its expected result.

For a real interrupted or uncertain run, follow
[stopped-writer inspection and run control](../operate.md#inspect-a-run) and
[pipeline state recovery](../recovery.md#pipeline-state-recovery). This helper
uses whole completed child outcomes; it does not demonstrate a crash between
acceptance and receipt or an external provider's reconciliation.

## Cleanup and change boundaries

After retaining the observations needed for your task:

```bash
node docs/site/use/workflows/examples/repair-retry.mjs cleanup "$REPAIR_REHEARSAL"
```

The helper checks its private ownership marker, absolute path, UID, selected
checkout and exact current HEAD before run, verify or cleanup. A changed HEAD
must reject before action: preserve the fixture and return to the original
selected source rather than rewriting its marker. Cleanup removes only that
owned fixture, including its disposable Git commits, copied plugins, run state,
artifact store and observations. It never changes the selected source checkout
or a real platform. A failed or unknown-ownership fixture requires its owner's
investigation, not an arbitrary recursive delete.

Change category limits, retry inputs or checker findings only in a new prepared
fixture before execution. Retain the old inputs and outcomes. For production
changes, use the [Core retry/repair contract](../../understand/nova-core.md#8-technical-retry-and-product-repair),
the original graph/package identities and the owning plugin's compatibility and
reconciliation procedure. A new budget does not amend the authority of an
already-pinned run.

## Source authority

The maintained helper owns this rehearsal's CLI calls and retained observations.
The following current source objects are whole-byte equal to the pinned revision:

- [Fixture graph, budgets, copied package roots and actual artifact provider](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/tests/verification/reliability/repair-budget-fixture.mjs#L1-L39).
- [The test stage makes native Git commits and writes actual evidence](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/tests/fixtures/repair-budget/plugin/stage.mjs#L1-L27).
- [Graph validation proves the separate retry allowance and aggregate ceiling](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/skills/nova/core/execution/graph-repair-budget.ts#L3-L30).
- [Repair disposition and exact category/extra-order debit](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/skills/nova/core/lifecycle/repair-budget.ts#L46-L100).
- [Repair retains the finding, invalidates descendants and schedules the declared return path](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/skills/nova/core/lifecycle/remediation.ts#L15-L58).
- [Authorization validates the current pending digest and original wait/issuer](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/skills/nova/core/lifecycle/repair-authorization.ts#L1-L30).
