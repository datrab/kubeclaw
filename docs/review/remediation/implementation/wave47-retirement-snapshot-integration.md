# Retirement snapshot-version integration fix

Base integration commit: `803415d`.

Root integration exposed seven admission failures with
`RUN_SNAPSHOT_INTEGRITY_INVALID`. The shared retirement inspector duplicated a
v1-only snapshot digest check. The current original Core writer now produces
run-snapshot.v2 with its explicit portable codec, so this affected both manual
admission/telemetry retirement and the read-only planner.

The inspector now invokes the original Core `assertRunSnapshot` on the already
bounded inventory JSON. It does not reopen the file through an unbounded reader,
bypass digest checks, rewrite legacy snapshots, or approximate codec selection.
The Core validates supported run and graph snapshot versions and the exact
digest using the selected original codec. Legacy v1 remains subject to its
original locale-dependent digest semantics.

A new regression invokes the planner with the actual current Core snapshot,
captured original legacy bytes, corrupted registry data and unknown run/graph
versions. It requires valid snapshots remain unmodified and invalid snapshots
produce the integrity blocker with no accepted run. Captured legacy bytes test
snapshot decoding only, not graph execution of that different fixture.

Verification after the fix:

```sh
node --test tests/verification/reliability/admission-retirement.test.mjs tests/verification/reliability/observability-replay.test.mjs tests/verification/reliability/observability-retirement-plan.test.mjs tests/verification/reliability/telemetry-retirement.test.mjs
node_modules/.bin/eslint --config charts/kubeclaw/files/config/eslint.config.mjs scripts/observability-retirement/journals.mjs tests/verification/reliability/observability-retirement-plan.test.mjs
```

32/32 tests passed, zero skips, both commands exit 0. Existing test assertions
were unchanged. The first new regression mistakenly expected a thrown exception;
the planner's documented public contract returns an integrity blocker. The new
assertion was corrected to require that exact blocker and a null run. Its initial
failure is retained. A first lint invocation omitted the repository's explicit
config and failed to discover a config; the canonical command above passed.
Raw logs are `docs/review/evidence/wave47-retirement-snapshot-integration-*.txt`,
including the original integration failure and intermediate invocation failures.

No native cluster or full OBS acceptance is claimed. PCR-OBS-002 stays partial.
