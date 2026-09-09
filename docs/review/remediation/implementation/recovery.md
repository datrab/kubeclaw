# WP02 — Completed-attempt wait and artifact recovery

Status: implemented and independently reviewed; scoped local verification passed.
Scope: PCR-EXEC-001 and PCR-EXEC-002. D04 counters, D08 safe continuation and D09
generic core boundaries are preserved. This patch does not implement the separate
repair-budget redesign or introduce plugin-specific code into core.

## Reproduced original defects

Before changes, both maintained original probes completed successfully, asserting
the historical defect against the real engine, real plugins and real journals:

```bash
node docs/review/evidence/orchestrator-wait-window.mjs
node docs/review/evidence/result-artifact-window.mjs
```

The wait probe produced a valid journal prefix ending immediately after the
complete original `attempt.completed` record. Recovery required its reconstructed
orchestrator signal, but resume rejected that signal with
`WAIT_CREATION_RECORD_MISSING` because the separately written wait projection
was absent.

The artifact probe ran production Delivery-Lint and the production artifact
adapter, then retained the valid original prefix through `attempt.completed`.
The stored result contained one report, but recovery succeeded with one producer
attempt and zero `artifact.created` records. Blob deletion was not asserted.
Historical probe files and review reports remain unchanged; their defect
assertions intentionally no longer pass after the fix.

## Root-cause changes

`skills/nova/core/lifecycle/wait-request.ts` now owns wait derivation for live
orchestrator decisions and completed-attempt replay. The canonical wait ID is
seeded by run ID, stage ID and attempt number. Explicit plugin waits retain their
own identity. Orchestrator issuer normalization, request payloads and retry
threshold behavior remain unchanged.

`skills/nova/core/lifecycle/recovery.ts` locates the creation of the requested
wait by folding the same original lifecycle reducer. A completed attempt is a
sufficient durable creation source even if its separate wait projection was never
written. Its committed timestamp supplies the stale-signal boundary. Existing
explicit wait projection rows remain supported, including older generated wait
IDs. `engine-run.ts` retains terminal-boundary, issuer, signal type, expiration,
issued-at and signal replay checks; none are bypassed to make recovery succeed.
No new projection journal or administrative repair tool is introduced.

`skills/nova/core/execution/artifact-checkpoints.ts` rebuilds missing artifact
projections from durable completed/cancelled/timed-out attempt results when the
recorder initializes, before dependent scheduling receives the artifact index.
Live and replay share `completedResult`: validate the stage-result contract,
check producing run/stage ownership, then apply existing exact-reference
deduplication and same-producer conflict rejection. Previously certified
references from earlier attempts of the same stage remain supported. Existing
checkpoint projections are retained and are not duplicated. Storage and adapter
implementations are unchanged.

## Verification

Passed:

```bash
node --test tests/verification/reliability/attempt-projection-recovery.test.mjs
node tests/verification/contracts/check-plugin-system-v2-resume.mjs
node tests/verification/contracts/check-plugin-system-v2-checkpoint-recovery.mjs
node tests/verification/contracts/check-plugin-system-v2-engine.mjs
node tests/verification/contracts/check-plugin-system-v2-phase6.mjs
npm run typecheck --prefix skills/nova
node_modules/.bin/eslint --config charts/kubeclaw/files/config/eslint.config.mjs skills/nova/core/execution/engine-run.ts skills/nova/core/execution/run-decisions.ts skills/nova/core/execution/artifact-checkpoints.ts skills/nova/core/lifecycle/recovery-state.ts skills/nova/core/lifecycle/recovery.ts skills/nova/core/lifecycle/wait-request.ts tests/verification/reliability/attempt-projection-recovery.test.mjs tests/fixtures/plugin-system-v2/recovery-plugin/stage.js
git diff --check
```

The new reliability suite has **5 passing tests**. It covers all original journal
prefixes from attempt completion through wait/run waiting for explicit waits,
`orchestrator_required` and retry-threshold orchestration. Live and recovered
waits match; each accepted signal causes exactly one additional completed attempt
and one wait resolution. Wrong issuer/type, stale issue time, expired explicit
wait and terminal replay remain rejected.

Its production Delivery-Lint producer is followed by a registered test consumer
that actually calls the production artifact adapter. Recovery from both sides of
the artifact projection write produces exactly one projection; the dependent
stage reads the same report digest and expected JSON bytes. Producer attempt
count remains one and the restored projection precedes consumer dispatch.

The registered recovery fixture is an ordinary executing plugin, not a replaced
engine/adapter or mock journal. Journal-prefix truncation models interruption
after a complete committed row; it does not claim a SIGKILL at that exact boundary.
The separate existing checkpoint gate does execute its real SIGKILL/restart case.
The reliability wildcard already includes the new test. No CI or production run
was requested or executed for this scoped patch.

Independent review repeated the five regression cases and the resume gate, and
verified legacy persisted random wait IDs with an additional original-journal
probe. The integrating agent repeated all five cases and Nova typechecking.
