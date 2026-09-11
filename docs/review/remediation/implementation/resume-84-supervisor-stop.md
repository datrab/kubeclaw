# Supervisor stop admission during recovery

Bounded fix following the independently reproduced stop defect in
`resume-84-nonprism-triage.md`. Base local commit
`7d172b6cee37d2f9e38165f81d06413b4a7cb935`; shared Worker Core, pipeline CLI,
status semantics and adopted-process ownership are unchanged.

Previously SIGTERM/SIGINT during the five-second recovery delay set the
controller's signal but did not prevent the next pipeline launch. runAttempt
registered an abort listener after spawning, without handling already-aborted
signals. The subsequent invocation therefore ran with `stopping:false` and
ended75 instead of the intended stopped exit130.

The retry coordinator now checks stop admission before invoking runAttempt;
runAttempt also refuses launch for an already-aborted signal and immediately
handles cancellation when registering its listener. The recovery wait removes
its timer/listener and returns on abort. Main checks cancellation when leaving
adopted observation, so a stopped observer cannot fall through to an owned
launch. Adopted external processes are never signalled by this change. Lease
release remains in the original finally boundary; return-await preserves it.

The regression invokes the actual supervisor, npm, original pipeline CLI and
original status reader with a real platform and intentionally invalid graph.
The first CLI rejection leaves recovery eligible. Sending SIGTERM or SIGINT
in the recovery pause must produce130, release the lease, retain only the first
attempt diagnostic, and never invoke `--recover`. No fake npm/CLI, mocked
provider, procfs substitute or guessed process identity is involved.

The exact new test was first executed against unchanged base production source:
**both tests failed**, actual75 versus expected130. With the fix, the same two
tests and the six existing genuine status/start regressions all pass:
**8 passed, 0 failed, 0 skipped**.

```sh
node --test scripts/tests/integration/repository-review-supervisor-stop.test.mjs scripts/tests/repository-review-supervisor-status.test.mjs scripts/tests/integration/repository-review-supervisor-start.mjs
node node_modules/eslint/bin/eslint.js --config charts/kubeclaw/files/config/eslint.config.mjs scripts/tests/integration/repository-review-supervisor-stop.test.mjs
node --check scripts/supervise-repository-review.mjs
```

All three commands exit0. Original source configured ESLint still exits1 with
the same six pre-existing errors (four optional-reader catches, process.env
ownership, main complexity). Main complexity decreased20→17; no rule was disabled
and no broad lint cleanup was mixed into this fix. The new test lints clean.
Raw before/after/syntax/lint evidence is under
`docs/review/evidence/resume-84-supervisor-stop/`.

Independent review of this implementation is still required. This closes no
broader finding: native adopted-pipeline identity/status-loss acceptance remains
separate and was not retried. No model/provider, browser, PostgreSQL, native
sandbox, deployment, CI or externally delivered acceptance is claimed.
