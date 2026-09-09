# PCR-BUSTER-ENGINE-004 — restart/orphan source cleanup boundary

Read-only source review, 2026-09-09, on the resumed working tree based on
`bbc36de`. This report implements no cleanup policy or ownership mechanism and
claims no native orphan/restart acceptance test. It complements
[attempt-resource-accountability-boundary.md](attempt-resource-accountability-boundary.md).

## Existing evidence and missing authority

| Path | Actual behavior | Recovery implication |
| --- | --- | --- |
| `skills/buster/engine/test-gates/remote-plan-service.ts`, `recover` | Requeues accepted jobs and moves interrupted running/cancelling jobs to terminal states; explicitly preserves inputs. | A failed/cancelled record is not a process-termination receipt. |
| Same file, `#execute` | Removes reproducible inputs after runner cleanup succeeds and every attempt reports completed execution; extraction failures can remove inputs before providers start. | This is current-host evidence, not persisted ownership of a crashed host's outstanding execution. |
| `terminal-workspace.ts` | Idempotently removes archive, extracted repository and provider snapshots; preserves artifact/evidence/observability/scratch/log directories. | Deletion scope is already bounded, but deciding when it is safe remains essential. |
| `provider-loader.ts`, `ProcessInputLifecycle` in `process-input-lifecycle.ts` | Holds child/group identities, pending RPC and termination promises in memory; Linux group checks can acknowledge the owned live scope. | These references do not survive service death or identify all parent-side capability/report work after restart. |
| Command/browser capability cgroups and report-adapter process lifecycle | Own individual invocations, not the complete durable remote job. | The absence of one provider process does not establish complete job quiescence. |
| [buster-job-compaction.md](buster-job-compaction.md) | Explicit operator compaction removes completed-job embedded archive bytes after result/evidence/source-retention validation. | This neither kills orphan executions nor authorizes deletion of uncertain runtime workspaces. |

The scanned remote-job store and recovery paths have no persistent, fenced
per-job owner for provider descendants, capability subprocesses, report adapters
and retained fixture processes. An old parent PID being absent is insufficient:
children can survive their leader, be reparented, or move process groups. A PID
is also namespace-relative and reusable. A successful `kill(pid, 0)`/ESRCH check
alone is not identity or descendant reconciliation. Boot identity, process start
time and namespace identity could disambiguate an individual process, but even
those would not account for escaped or separately launched local work.

## Required coherent follow-up

Implement restart reconciliation together with the generic attempt owner
described in the resource-accountability report, preserving the shared Worker
Core and engine separation. Bind durable job/attempt/claim identity to a trusted
local execution scope before work can start. Process admission and durable
ownership must have explicit crash ordering: no launched-but-unrecorded scope
may become silently disposable. Cover providers, parent-side capability
dispatch, native capability children, report adapters and finalization, with
explicit retained-fixture ownership transfer.

On restart, reconcile that exact fenced owner and all its local descendant
scopes. Require an authoritative empty/stopped scope acknowledgement or a
verified old container/scope teardown; an inaccessible or ambiguous scope keeps
inputs intact and reports the blocking owner. Do not issue blind PID kills or
infer safety from a terminal metadata state. Preserve D06 external demo lifetime
and D07 evidence/log retention independently of local process cleanup.

Only after complete quiescence is established may an idempotent, job-bound
cleanup acknowledgement authorize the existing narrow input-removal routine.
A durable acknowledgement immediately before deletion could make the crash
window after successful drain recoverable, but introducing that isolated
receipt now would leave active-crash ownership unresolved. No such half-solution
is implemented here. Historical jobs without sufficient ownership evidence
remain retained pending explicit, authoritative reconciliation.

## Native acceptance gates still open

- Crash the original worker with a real provider active; restart while the
  provider and genuine capability/report descendants remain live. Inputs must
  remain until all owned local scopes are proven stopped.
- Exercise leader death separately from descendant death, reparented children,
  group escape and namespace/PID identity mismatch. Unknown ownership must
  reject cleanup. Use actual delegated containment, not fake cgroup files.
- Crash after durable ownership publication, after native launch, during drain,
  after quiescence acknowledgement and partway through input deletion. Recovery
  must be idempotent and must not remove input files still in use.
- Run original completed/failed/cancelled jobs and retained-fixture transitions
  through restart. Verify exact result/evidence receipts, logs, final source
  retention and external demo lifetime remain valid after safe cleanup.

The current environment has no verified writable delegated scope covering
these engines; the resource-accountability report records the actual read-only
cgroup mount observation. No replacement provider, forged cgroup, production
access or cleanup command was used by this review. ENGINE-004 remains partial
for restart/orphan cleanup, regardless of any broader register label.
