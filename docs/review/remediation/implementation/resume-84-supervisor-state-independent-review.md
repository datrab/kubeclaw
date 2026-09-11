# Independent Supervisor state preservation review

Reviewed frozen integration commit `21af42f` against `268bb72` in separate
`review-supervisor-state` checkout. No production modifications by reviewer.

Bounded approval: no blocking regression found. Critical optional JSON reads
return absence only for ENOENT; malformed JSON and other read failures now stop
with file context and the original error cause. Lease schema/instance/run/PID
validation precedes stale-file deletion. Unknown/malformed ownership state is
therefore preserved instead of silently discarded. The release path still checks
its own instanceId, and the malformed-heartbeat case releases only the newly
acquired lease while preserving the corrupt heartbeat itself.

Resource observation reads remain deliberately nonfatal and append file/error
code diagnostics. These are best-effort host observations, not per-attempt CPU,
process-tree or native ownership proof. No accounting capability or gate is
weakened by adding that diagnostic field.

Omitting explicit `env: process.env` keeps Node spawn's native environment
inheritance, while removing redundant environment access outside its ownership
boundary. `initialMode` preserves valid auto/start/recover behavior; auto alone
needs platform/event discovery. Explicit modes now bypass that redundant platform
JSON read, but the unchanged actual status/CLI validation still validates their
input paths. The earlier stop admission checks, interruptible recovery delay and
return-await lease-finally behavior remain intact.

## Independent verification

The original state, status, operations, genuine CLI start and stop tests ran
against this exact source: **17 passed, 0 failed, 0 skipped**. The new cases use
actual persisted malformed JSON/unknown lease files, the real supervisor CLI and
an actual live process PID. They prove byte-preserving rejection, no new pipeline
log, and correct lease release. No fake procfs/CLI, guessed process identity or
substitute metrics were used. Existing start/stop/status regressions passed too.

Canonical repository ESLint of the changed supervisor and new test passes.
Commands and raw outputs:

```
node --test scripts/tests/repository-review-supervisor-state.test.mjs scripts/tests/repository-review-supervisor-status.test.mjs scripts/tests/repository-review-operations.test.mjs scripts/tests/integration/repository-review-supervisor-start.mjs scripts/tests/integration/repository-review-supervisor-stop.test.mjs
node node_modules/eslint/bin/eslint.js --config charts/kubeclaw/files/config/eslint.config.mjs scripts/supervise-repository-review.mjs scripts/tests/repository-review-supervisor-state.test.mjs
```

Both exit0. Evidence under
`docs/review/evidence/resume-84-supervisor-state-independent/`.
Native adopted-pipeline identity and full recovery acceptance remain separate;
no such gate was retried. This review does not certify arbitrary multi-writer
filesystem lease races, which this bounded patch does not redesign. No finding
promotion, CI, deployment or production runtime operation was performed.
