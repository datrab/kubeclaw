# IFR-25-001 — Buster dependency readiness

Scope: Buster only. No deployment or CI run. Prism and worker-trust/SVID readiness are separate work; this slice does not close the whole finding.

The original Buster `/healthz` always advertised `ready: true` after the HTTP listener opened. Its startup BuildKit RPC check did not detect a later dependency failure. The runtime now separates three versioned HTTP contracts:

| Endpoint | Meaning | Response |
| --- | --- | --- |
| `/healthz` | Process HTTP liveness | 200, `buster-plan-health.v2`, `live: true` |
| `/bootstrapz` | Durable recovery completed and service not stopping | 200/503, `buster-plan-bootstrap.v1`, `initialized` |
| `/readyz` | Bootstrap plus configured required dependency | 200/503, `buster-plan-readiness.v1`, `ready`, fixed `code` |

This intentionally changes the old health response version. Both actual E2E capability callers (`capabilities.mts` and `check-real-e2e-capabilities.mjs`) now use the shared `/readyz` reader. The worker-trust live script retains `/healthz` as a transport/liveness probe; it does not prove functional BuildKit readiness. The Buster Helm startup probe uses `/bootstrapz`, readiness `/readyz`, and liveness `/healthz`. Dependency failure after startup cannot trigger a liveness restart loop through these probes.

When `container.build` is enabled, readiness invokes the actual configured absolute `buildctlExecutable` with the same `buildkitHost` and existing `--addr HOST debug workers` command used by the entrypoint. It does not invent a dependency when that capability is disabled. This proves only successful daemon RPC, not a successful build or registry push. Initial entrypoint socket creation and ownership handoff remain bootstrap requirements; this change does not redesign them.

The process helper starts an isolated process group, strips inherited credentials, bounds time (default 1 second; hard maximum 30 seconds) and output (default 64 KiB; hard maximum 1 MiB), kills the process group on a limit, and waits for actual child closure. Concurrent readiness/admission callers share one in-flight dependency check; completed results are never cached. State-change diagnostics contain fixed dependency/cause codes, exit code, signal, sanitized errno, output length/digest and duration, not raw output, executable path, endpoint or credentials. Public responses contain only fixed codes. No configured alert delivery or new monitoring service is claimed.

New submissions check the dependency before durable acceptance; stopping is rechecked after the asynchronous dependency check. Rejected checks do not write accepted records or rewrite already accepted records. Durable terminal replays remain available during dependency failure. Existing execution, queue/recovery and cancellation semantics otherwise remain in force; this is not a new durable scheduler or retry policy.

## Evidence and limits

- `buster-readiness-tests.txt`: four focused tests pass, including actual Helm rendering, genuine missing configured buildctl failure, one in-flight check/no completed cache, and native Node process-group timeout/output/environment tests. Native Node is only a generic process-mechanism test, never a substituted BuildKit executable.
- `buster-readiness-original-runtime.txt`: original authenticated remote-plan runtime suite, including genuine absent BuildKit executable → readiness/admission 503, live/bootstrap 200, no durable new acceptance, accepted/terminal replay invariants, and actual E2E capability reader against the original runtime. The original Nova deadline regressions remain included.
- `buster-readiness-types.txt`: Buster engine TypeScript check passes.
- `buster-readiness-consumers.txt`: original capability tests pass (4 tests).
- `buster-readiness-lint.txt`: nine existing lint findings remain in the original production loader/service/HTTP files; both new runtime helpers are clean. HTTP, service and production loader HEAD baseline diagnostics are preserved in the corresponding `*-baseline-lint.txt` files. No lint waiver was introduced.
- `buster-readiness-deployment.txt`: original combined source/Helm gate initially fails at the concurrent Prism worker probe migration assertion, before the Buster assertions. The Prism owner corrected its own assertion; the full original gate now passes with actual Helm on PATH (`buster-readiness-deployment-final.txt`). The initial failure is retained.

Native BuildKit is not installed/runnable here. Successful native daemon RPC, actual daemon loss/recovery, socket ownership in the production image, and image-build acceptance remain unverified prerequisites. Neither generic native process tests nor missing-executable tests substitute for that acceptance. No native PostgreSQL or SVID/Envoy proof is claimed by this Buster slice.

## Resume verification — 2026-09-09

The resumed review found and fixed one diagnostic race: shutdown during an
awaited native dependency probe returned `ready: false` but classified the
response using the pre-shutdown bootstrap state. Readiness and its code now use
the same freshly read lifecycle state after the probe settles. The added
original-service regression starts an actual missing-buildctl probe and calls
actual service shutdown; it fails before the correction (exit 1) and passes
after it. It does not substitute a BuildKit implementation.

Commands executed from the repository root (Helm commands use
`PATH=/workspace/scratch/4e25cf57c177/toolchains/bin:$PATH`):

- `node tests/verification/contracts/check-pipeline-remote-plan-runtime.mts`: exit 0 both before the new regression and after the correction; new regression against the prior implementation exits 1. Original authenticated transport and Nova deadline/restart cases also complete.
- `node --test skills/prism/tests/worker-readiness.test.mts skills/prism/tests/internal-auth.test.mts skills/prism/tests/worker-service.test.mts skills/prism/tests/worker-readiness-chart.test.mts tests/verification/deployment/buster-readiness.test.mts`: exit 0; 16 passed, one explicit native PostgreSQL skip.
- `node node_modules/typescript/bin/tsc --noEmit -p skills/buster/engine/tsconfig.json`: exit 0, repeated after the race correction.
- `node tests/verification/deployment/check-deployment-truth.mjs`: exit 0 using actual Helm.
- Canonical ESLint with `--config charts/kubeclaw/files/config/eslint.config.mjs` on both new Buster helpers, both new Prism modules and three new readiness tests: exit 0.
- Same canonical ESLint on `remote-plan-service.ts` and `check-pipeline-remote-plan-runtime.mts`: exit 1 for the four previously documented service size/depth/complexity violations; the changed contract regression adds no lint finding. No suppression or scope reduction was introduced.

Resume logs are under `docs/review/evidence/resume-20260909/readiness/`: `tests.txt`,
`remote-runtime.txt`, `shutdown-regression-before.txt`,
`shutdown-regression-after.txt`, `buster-types{,-after}.txt`, `deployment.txt`,
`lint-canonical.txt`, and `changed-existing-lint.txt`. An initial ESLint invocation
without the repository's explicit configuration exited 2 (`lint.txt`); the
canonical invocation above replaces it. Native BuildKit and native PostgreSQL
remain unavailable here. IFR-25-001 remains open for its documented operational
proofs; these local checks do not close the whole infrastructure finding.

### Follow-up: shutdown owns its readiness subprocess

Independent review found that a native dependency probe could outlive
`service.shutdown()` until its own deadline (up to 30 seconds), since the old
shutdown only awaited job executions. The generic process runner now accepts
an `AbortSignal`, kills the actual process group on cancellation, and settles
after child closure. An already aborted request starts no child.
`BuildkitReadiness.shutdown()` aborts and awaits its in-flight check; service
shutdown includes this promise in its existing bounded shutdown wait even with
zero active jobs. Stopped readiness objects cannot start a later subprocess.

The native process regression starts a real Node parent and descendant, waits
for their actual PIDs, aborts a configured 30-second check and verifies prompt
closure and no running group members. Zombie states pending container-init
reaping are explicitly distinguished from live processes. A second native
case verifies no marker file is created for a pre-aborted invocation. This is
process-mechanism evidence, not a substitute BuildKit daemon test. The original
service regression also verifies its in-flight readiness promise has settled
when shutdown returns.

- Focused native/Helm readiness tests: 5 passed, exit 0
  (`cancellation-tests-final.txt`).
- Full original remote-plan runtime: exit 0
  (`cancellation-runtime-final.txt`).
- Buster engine TypeScript: exit 0 (`cancellation-types.txt`).
- Canonical ESLint on both process/readiness helpers and the focused test:
  exit 0 (`cancellation-lint.txt`).

These logs are in `docs/review/evidence/resume-20260909/readiness/`. The commands are the same
ones listed in the resume section, with the focused test limited to
`tests/verification/deployment/buster-readiness.test.mts`. No native BuildKit
service or deployed shutdown behavior is claimed.
