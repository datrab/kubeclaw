# Resuming the frozen 47 repairs

> Historical remediation record. Its counts, branch instructions and register references describe that checkpoint. Current work is maintained in [open issues](../../../site/status/open-issues.md) and [the canonical JSON](../../../status/open-issues.json). [Local closure provenance](../../../site/decisions/acceptance.md) and [live acceptance](../../../site/status/acceptance.md) have separate authority. Original register data remains in [immutable history](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/register.json).

Aktueller Folgecheckpoint: **131 lokal verifiziert / 3 teilweise / 1 in Bearbeitung / 19 offen**. Von den zuletzt angefragten7 sind3 abgeschlossen;4 bleiben. SDK-Nachweis: ../implementation/pr6-sdk-local-verification.md. [Risiko-/Registry-Nachweise](../implementation/pr6-risk-and-registry.md). Ältere Zähler unten sind historische Stände.

Aktueller Stand nach D12 (2026-09-12): **128 lokal verifiziert / 5 teilweise / 2 in Bearbeitung / 19 offen**. Von den39 sind34 lokal abgeschlossen. Live-Abnahmen folgen separat durch den Auftraggeber nach Open-Sourcing. Maßgeblich sind [D12](../decisions.md#d12--lokaler-abschluss-und-separate-live-abnahme), [Einzelbewertung](../implementation/pr6-local-acceptance.md) und [Register](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/register.json). Ausschließlich im bestehenden PR #6 und dessen Branch weiterarbeiten; frühere Anweisungen zu weiteren Fixbranches gelten nicht. Die folgenden älteren Stände bleiben historischer Verlauf.

Latest saved continuation: [2026-09-11 resumed work](run-20260911-a51d-resumed.md),
with the exact [39-ID current state](run-20260911-a51d-resumed-state.json) and
[existence-checked native follow-up matrix](native-followup-39-20260911.json).

Current run stopped at the user time limit after the84-minute continuation. Latest reviewed source: `550eb948ec8766b38e8c8d4ccb88a1fdab28e61a`. Exact remaining work is in the linked current state; no additional finding was closed.

This is the durable entrypoint for a fresh repair orchestrator. Chat history and
local worktree paths are hints, never the only copy of unfinished work.

## Scope and evidence

Derive the exact IDs whose status was `implementiert` from `register.json` at
`c38779c71bb92bc15c3fcb89930348e5417aa475`. Compare that set with
`../partial-47-scope.json` and `work-items.json`: exactly 47, no substitutions.
Read the current register, original finding requirements and referenced evidence.
The work-items status is a dated checkpoint, not authority over newer evidence.
Only genuine required tests plus independent review establish completion.
Skipped, static, partial and environment-blocked checks never establish it.

## Each invocation

1. Read the latest remote integration branch and saved package branch inventory.
   Reconcile already published commits and evidence before selecting work.
2. Create a unique run ID and separate checkout for this invocation. Never attach
   a second writer to an old invocation's checkout. Delegate disjoint packages
   into separate worktrees; name an independent reviewer for each implementation.
3. Finish one bounded package, retaining original assertions and failing logs.
   Commit source and evidence with `[skip ci]`; publish unfinished work to its
   own `fix/resume-47-*` branch before moving on. Record exact SHA, base, affected
   findings, actual test commands/results and next action in its checkpoint.
4. Integrate only independently reviewed changes against a freshly read target
   head. Publish a commit whose parent is that exact head using fast-forward-only
   ref update. If another writer advanced it, stop that publication, fetch/reconcile
   and rerun affected checks. Never force-push or overwrite the competing result.
5. Update register and per-finding evidence only to the level actually established.
   Save the next action remotely before ending. A fresh invocation must be able
   to proceed without this filesystem or its conversation.

This protocol isolates concurrent work and rejects stale integration publication.
It does not provide an exclusive distributed agent lock, prevent duplicate
computation, or guarantee that a scheduler/OpenAI service runs during an outage.
Do not steal ownership based only on an old heartbeat or infer process death.

## Environment boundaries

Do not deploy, modify production, start CI, purchase resources or send messages
to third parties. Preserve the shared Worker Core plus role-engine architecture.
No mocks, shims, weakened tests or automatic log deletion to bypass a blocker.
Recheck a blocked prerequisite once when the environment changes; otherwise work
on another actionable item. Native PostgreSQL, Chromium, delegated writable
cgroups, Envoy, BuildKit and Kubernetes evidence must remain open where required
until the actual environment and tests exist. A scheduled agent cannot substitute
local contracts for these required proofs.

## Recovery acceptance

A remote checkpoint is accepted only after read-back confirms its affected blobs.
The workflow's restart test must use a fresh checkout/context, locate the saved
package and exact next action, and reproduce the relevant original test. Report
that boundary accurately: source restoration and test continuation do not prove
scheduler crash recovery or full completion of the 47 findings.

Notify the user of final completion only after all 47 meet their original gates,
with integration SHA and evidence. Then disable the existing recurring task.
