# Non-Prism remaining-work triage

Read the integration register and
`resume/run-20260911-a51d-2h-state.json` from the saved integration checkout,
and candidate source through `bc777cd` (supervisor/Buster/Nova files unchanged
by later Delivery/HTTP work). No finding status changed. The following is
bounded local work, not a claim that native acceptance has become available.

## Action 1 — fix Supervisor stop admission across retry waits

**New locally reproduced code defect**, adjacent to PCR-SCAFFOLD-OPS-001:
`scripts/supervise-repository-review.mjs:252-263` waits five seconds before
recovery, but does not check `stopController.signal.aborted` before starting
the next attempt. `runAttempt:184-203` only attaches an abort listener after
launch; adding a listener to an already-aborted signal does not trigger it.
Consequently SIGTERM during the recovery pause still launches another pipeline
and does not produce the intended stopped exit.

The checked-in probe invokes the original supervisor, original npm/pipeline CLI,
original status reader and real platform adapters. An invalid graph is a real
CLI input failure before a journal terminal state, allowing the actual retry
path to be reached without running providers. After the first original CLI exit
and during the recovery delay, the probe sends SIGTERM to its owned supervisor.
The original code then launches `npm ... --recover`, writes a second diagnostic
with `stopping:false`, and exits **75**, not **130**. Both original CLI commands
and validation errors are in the raw pipeline log; no process identity was
invented or procfs substituted. The lease is eventually released.

Suggested correction: make stop admission explicit before every owned launch,
handle an already-aborted signal at the launch boundary, and make the recovery
wait cancelable. Preserve adopted-process non-ownership: stopping observation
must not terminate an adopted external process. Do not interpret stop as a
successful terminal pipeline result. A fixed regression should require exit130,
only the first attempt diagnostic, no `--recover` invocation after stop, and
lease release. The current probe deliberately asserts the observed *broken*
behavior and must not be mistaken for a passing post-fix regression.

Evidence: `supervisor-stop-probe.mjs` and
`supervisor-stop-probe-configured.txt` under
`docs/review/evidence/resume-84-nonprism-triage/`. The first probe with an
incomplete minimal adapter platform did not reach the intended first CLI exit;
its failed output is retained as `supervisor-stop-probe.txt`. The successful
probe uses the same original adapter configuration shape as the established
native start test. No original assertion was weakened.

## Action 2 — repair the configured Supervisor lint gate alongside the fix

The unchanged canonical ESLint reports six errors in the same file:
optional JSON/resource readers swallow errors at lines42/117/124/131; process
launch reads `process.env` outside an infrastructure adapter at187; main
complexity is20 at223 (limit15). This is executable code-quality work, with
source responsibility separation rather than disabled rules or fake values.

A bounded extraction can keep optional telemetry behavior explicit, preserve
status failures as hard failures, centralize process environment/launch in its
infrastructure owner, and separate stop/retry admission from CLI setup. Gate:

```sh
node node_modules/eslint/bin/eslint.js --config charts/kubeclaw/files/config/eslint.config.mjs scripts/supervise-repository-review.mjs
node --test scripts/tests/repository-review-supervisor-status.test.mjs scripts/tests/integration/repository-review-supervisor-start.mjs
```

The unchanged latter command passed **6/6, no skips** in this triage: real
missing/readable-platform pipeline start plus existing status failures. The
native adoption gate was not retried. A lint cleanup cannot replace that native
adoption requirement.

## No shortcut found for Buster orphan or Nova full restart

PCR-BUSTER-ENGINE-004: `remote-plan-service.ts:588-618` explicitly retains
uncertain prior-host inputs; current execution cleanup at764-765 is conditioned
on runner cleanup and completed execution. `terminal-workspace.ts:6-10` deletes
only reproducible source/snapshot copies. Its unchanged real-file test passed:
three source classes removed idempotently, six result/evidence/log classes kept.
The missing restart authority remains material: terminal metadata is not proof
that escaped/reparented/native descendants stopped. Do not add age-based cleanup,
PID-only inference or an isolated false quiescence acknowledgement. Correctly
solving this needs the coherent generic durable owner/containment protocol
already described in `buster-orphan-recovery-boundary.md`; it is not another
small local retention patch.

PCR-NOVA-GATE-005: `check-pipeline-remote-process-restart.mts:223-230` already
reopens FileNovaGateImportStore and uses its public `readExecutionGraphs` API.
The obsolete execution-graph-file read is gone. The required original full
restart gate still reaches native sandbox failure first. Repeating it here or
substituting a provider would add no valid acceptance. No further isolated source
cause was identified in that specific corrected graph-reader boundary.

The remaining non-Prism state entries chiefly require actual native
BuildKit/CRI/cgroup/browser work, configured writer/provider execution, deployment
capacity or externally delivered acceptance. Nothing inspected authorizes
simulating those gates into closure. The actionable local defect is Supervisor
stop admission above; lint is a second bounded gate in the same code owner.

## Exact checks and boundaries

- `node docs/review/evidence/resume-84-nonprism-triage/supervisor-stop-probe.mjs`:
  current bug reproduced, exit0 for its explicit before-fix assertions.
- `node --test scripts/tests/repository-review-supervisor-status.test.mjs scripts/tests/integration/repository-review-supervisor-start.mjs`:
  6 passed, exit0.
- `node skills/buster/engine/test-gates/tests/terminal-workspace.test.ts`:
  original idempotent file cleanup/retention assertions passed, exit0.
- Canonical Supervisor ESLint above: exit1, six original errors.

No source implementation was changed. No subprocess/provider mock, credential
change, host-control bypass, cgroup change, browser install, semantic helper,
infrastructure mutation, CI run or external message was used.
