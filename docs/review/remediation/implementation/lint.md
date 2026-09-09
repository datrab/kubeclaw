# WP06 — Lint path and native execution remediation

Scope: PCR-LINT-001, PCR-LINT-002 and PCR-LINT-003. Implemented in the shared
remediation worktree; independent reviewer reports no remaining scoped blocker.
Historical component findings and the remediation register are unchanged.
No claim of complete WP06, whole-project, deployed or production verification.

## Before implementation

Read the root contribution rules, confirmed remediation decisions and the full
`docs/review/components/kubeclaw.lint.md` report. Ran the historical original
`docs/review/evidence/lint-boundary-probes.mjs` against unchanged local HEAD code:

- Real `/bin/sleep` with a 20 ms native timeout produced ETIMEDOUT but
  `timedOut: false` and `probe-execution-failed`.
- A 5 ms timer could not run during the original 123 ms synchronous sleep.
- Generic policy validation and both full/changed discovery accepted
  `repo/src/external.sh`, resolving through a symlink into the external fixture.

Original `npm test` passed stage, package boundary, adapter boundary, discovery
and actual ESLint-discipline tests, then failed the live-function clean case:
`shellcheck` and `shfmt` are absent. The expected successful run was blocked.
Neither programs nor provider results were substituted to make that test pass.

## Root changes

`engine/paths.ts` canonicalizes each source input, including the closest existing
ancestor of deleted/missing leaves. Policy project, language roots, generic
source targets, module scope and changed-file paths are bound to the authorized
repository. Native recursive source checks inspect symlink entries even where
discovery exclusions would skip them. Independent review found an initial
exclusion bypass using actual TypeScript `files`; it was corrected and added to
the regression. Kubernetes-specific checks remain present. In-repository
symlinks remain valid. Git metadata is excluded from the source walk; native
source dependencies symlinked outside the repository are intentionally rejected.

One visited set is shared across targets in each validation pass. The engine
validates declarations initially and rechecks the current tool's targets before
running it, instead of rescanning every tool's full target set for every tool.

`engine/process.ts` owns asynchronous native spawning, output collection,
termination and close. Existing native runner call sites await it through
`safeExec`, including Helm rendering and candidate Git. The caller's signal is
passed through the original adapter, engine, tool contexts and candidate path.
Shutdown aborts and awaits active adapter invocations; cancellation rejects the
attempt rather than publishing an ordinary report. The fence is checked again
before returning a successful result. No SDK, core, registry or adapter schema
change was required; existing per-tool and 60-second Git timeouts remain.

On timeout/abort/output overflow the Linux process group receives TERM then KILL
after 250 ms. Escalation remains scheduled after leader exit so descendants
cannot survive by closing inherited streams. A repeated unchanged regression
found that returning immediately after KILL delivery was too early: the kernel
could still report a running descendant. This was corrected without changing
the test assertion or waiting in the test.

`linux-process-group.ts` captures the outer process-group ID while the group is
owned, using namespace depth and namespace inode to avoid collisions between
concurrent tool sessions. After KILL, bounded `/proc` scans confirm that no group
member is running. `process-termination.ts` races a single 1,500 ms deadline
against BOTH leader close and descendant exit acknowledgement, including when
the leader already closed. Only vanished-process races are ignored; inspection
or acknowledgement failure is explicit. Z/X states are nonrunning; init owns
orphan reaping. Native ETIMEDOUT/timeout remains distinct from startup failure,
buffer overflow and ordinary nonzero findings. Report timeouts retain
`status: error`, `code: eslint-timeout`, and a failed tool count.

Canonical lint initially exposed existing complexity/size violations in the
touched request parser, policy-path validation, Kubeconform/OpenAPI tool runners
and Kubernetes rule evaluator. Their existing logic was extracted into focused
helpers; rules were not disabled or weakened. All source changes remain inside
the lint package.

## Executed validation and limits

- `npm run build --prefix skills/nova/plugins/lint`: passed.
- Canonical ESLint across adapter, request, candidate, all engine modules and
  `tests/remediation.test.mjs`: passed without suppressions.
- `npm run test:remediation --prefix skills/nova/plugins/lint`: **8 passed**.
  Real installed ESLint retains clean/finding outcomes. Real tsc proves an
  excluded symlink can be consumed natively and the adapter rejects it. Tests
  distinguish timeout/start failure/nonzero/output overflow; check timeout in
  the canonical report; abort active ESLint and a TERM-resistant descendant;
  exercise shutdown, exact-commit candidate cleanup, and cancellation during
  actual Git checkout running a configured smudge filter. Cancellation cases
  assert completion within two seconds after native readiness.
- After the exit-acknowledgement correction, the unchanged eight-case remediation
  suite passed five consecutive repetitions (40 cases), in addition to the
  initial corrected run. The immediate descendant-state assertions are unchanged.
- Full package `npm test` passed after the coordinator supplied checksum-verified
  ShellCheck 0.11.0 and repository-pinned shfmt 3.13.1 on PATH. The original
  live-function test now reaches real runner/adapter pass, fail and artifact-store
  failure cases for both stages, plus candidate revision behavior. This supersedes
  the earlier environment-blocked after-check; its before-check remains historical.
- `git diff --check`: passed.

The process tests use the child-provided host PID from `/proc/self/status`
because this environment exposes namespace PIDs through Node while mounting
host `/proc`. They assert the leader is reaped and no descendant is running;
a killed orphan may remain a zombie pending init reaping. No stronger child
reaping guarantee is claimed. The real slow fixture is an ESLint rule/native
Git filter doing bounded test work, not a replacement executable or mock engine.

No installed Helm/Kubeconform, full language-toolchain parity, cluster, external
service, CI or deployment result is claimed. Native source/configuration must
remain stable while tools read it: preflight/rechecks do not form a sandbox or
atomically eliminate hostile concurrent symlink swaps, config-level external
imports, or processes deliberately leaving their group. Synchronous filesystem
walks/parsing/cleanup retain their previous responsiveness limits; the caller's
signal supplies the existing overall deadline, with no invented global budget.
