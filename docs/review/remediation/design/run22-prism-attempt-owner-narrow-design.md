# Prism attempt owner: narrow RED and implementation boundary

Run `20260910t052307`, remote base
`1ba445125fbacfa4f0344f8bf38e68f8f0686eff` (tree
`692a57a387d823d4b6636062e90dfbbeb07d28cd`). Scope is exactly
PCR-PRISM-WORKER-002 and PCR-PRISM-WORKER-003. The frozen 47 IDs derived from
`register.json` at `c38779c71bb92bc15c3fcb89930348e5417aa475` equal both the
current `partial-47-scope.json` and `resume/work-items.json` ID sets.

## Reproduced local ownership defect

`worker-concurrent-resource-attribution.mts` uses the production
`PrismWorkerOperation`, `WorkerArtifactClient`, real local HTTP transport and
original deterministic engine. It holds the attempt at its real input read,
performs material unrelated CPU work in the same long-lived service process,
then lets the small render finish. The receipt includes nearly all unrelated
CPU. This is an expected RED against the current source and directly exercises
the remaining concurrency clause of PCR-PRISM-WORKER-002. It is not a mocked
resource counter and does not pretend to prove child accounting.

The existing unchanged native browser gate was also executed. It is RED before
the cancellation assertions because the pinned Playwright Chromium/headless
shell executable is absent. `chromium.executablePath()` merely returns the
expected cache path; that file does not exist. No replacement executable,
download, skip or launch shim was used.

## Narrow ownership design

The fix must introduce one generic attempt owner in Worker Core, created before
specialist input hydration. An attempt-specific execution host, its Chromium
children and any capability subprocesses must be admitted beneath one delegated
kernel scope before untrusted/specialist work begins. The long-lived HTTP worker
keeps authentication and durable claim authority; the Prism engine remains the
role-specific engine. No second Worker Core is introduced.

The owner must expose cumulative live and terminal observations plus bounded
terminate/drain. CPU comes from cumulative kernel usage for the owned subtree,
not `process.cpuUsage()` in the shared parent. Memory is an owned peak and the
process/task contract must be explicitly reconciled rather than setting a
constant one. Browser close and artifact I/O receive the attempt abort signal;
successful drain requires an empty owned scope and prevents post-terminal local
writes. The final observation remains after Core completion hooks and before
disposing the empty scope, preserving the already implemented early/final
resource checks.

This cannot be safely activated or certified on the current host: cgroup v2 is
mounted read-only at `/sys/fs/cgroup`, no delegated writable subtree exists, and
the pinned Chromium binary is absent. A process-wide delta, serialization,
sampled `/proc` tree, constant zero/one or unit-test fake would not satisfy the
original finding. Therefore this checkpoint intentionally adds the real RED and
exact implementation boundary only; production code and finding status remain
unchanged.

## Next native action

Provide a delegated writable cgroup v2 subtree and the repository-pinned
Playwright Chromium. Implement the generic Core owner and Prism execution-host
vertical slice atomically. Run this RED unchanged plus two concurrent original
Prism attempts, real Chromium capture cancellation during launch/page/upload,
short-lived/outliving descendants, unavailable-counter fail-closed behavior,
and the full original Core/Prism suites. Independent review is required before
integration or status change.
