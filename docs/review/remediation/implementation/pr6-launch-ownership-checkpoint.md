# Launch ownership recovery checkpoint — 2026-09-13

Baseline: PR #6 at `e71a21dd21916e683a3a4a36291f1252714d959a`.
Recovered three uncommitted Worker Core files before making further changes.

## Changed boundary

- Additional launches use the same lease, immutable launcher selection, scope
  observation and closing fence. Only supervisor callbacks receive the launch
  authority; no deserialized worker request is directly executed.
- Every spawned launcher is owned from spawn until exit, including the interval
  before cgroup membership. Closing fences new launches synchronously and reaps
  launchers before draining the kernel scope and sealing accounting.
- The original C launcher requires the supervisor PID supplied by Core. It arms
  Linux parent-death termination and checks that PID before scope admission,
  then re-arms/checks after dropping identity (which clears parent-death state).
- The generic launcher tracker is exercised with actual Node child processes,
  real ENOENT, concurrent starts and the optional fourth descriptor.

## Local verification

`node_modules/.bin/tsc --noEmit -p skills/worker/core/tsconfig.json`: passed.

`node_modules/.bin/eslint --config charts/kubeclaw/files/config/eslint.config.mjs`
for the four changed production TS worker modules: passed.

`node --test --test-concurrency=1` on these five files: **24 passed, 0 failed,
0 skipped**, 11.2 seconds:

- `tests/verification/reliability/native-process-launches.test.mts`
- `tests/verification/reliability/worker-native-launcher.test.mts`
- `tests/verification/reliability/worker-control-channel.test.mts`
- `tests/verification/reliability/native-process-cancellation.test.mts`
- `tests/verification/reliability/worker-ownership-store.test.mts`

The launcher test compiles the actual C source with warnings as errors and
checks refusal of invalid parent bindings and ordinary filesystems. This is
not a positive cgroup launch or parent-death test after a successful UID change.
Those require the prepared native environment and remain explicit acceptance
work. An initial parallel test/typecheck invocation exited 137 without a test
result; separate runs and the serial 24-test run above succeeded. The first
lint invocation omitted the repository config and failed; the explicit-config
invocation above succeeded.

## Still incomplete

The Buster role-specific launch protocol, in-scope broker accounting, provider
host integration, fixture lifetime, old runner removal and complete retention
are not finished. No original Finding is closed by this foundational change.
Counts remain **137 locally verified / 17 incomplete**. No deployment or merge.
