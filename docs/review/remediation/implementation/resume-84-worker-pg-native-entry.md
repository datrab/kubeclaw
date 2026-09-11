# Strict native Worker PostgreSQL acceptance entry

Base integration commit `be7095f`. Added only a native test entry and its Prism
package script; no production code or original SQL test/assertion was changed.

```sh
npm run test:worker-readiness-native --prefix skills/prism
```

The entry is `skills/prism/tests/native/worker-readiness-gate.mts`. It fails before
starting the test runner unless `KUBECLAW_PRISM_READINESS_TEST_DATABASE` is
nonempty. The value must identify an actual isolated, migrated native test
database. It is passed through the original environment untouched; no database,
query, pool or environment shim is introduced.

Node's original test runner selects exactly the existing named native case in
`skills/prism/tests/worker-readiness.test.mts`. The original SQL/lock/cancel/pool
release/rollback/recovery test body is reused byte-for-byte. The new entry never
runs a second copy of that SQL test and does not select the PGlite/HTTP cases.

Acceptance requires one actual pass with the exact native test name, no failed
runner event, a successful summary with exactly one test/one pass, and zero
skipped, cancelled or TODO tests. Node can produce a green file-level pass when
no named tests matched; the exact native-name count explicitly rejects this.
A green skipped native test is likewise rejected. Missing summaries fail closed.
The gate sits under tests/native because it is test infrastructure, outside the
ordinary package tests/*.test.mts discovery; it runs only through its explicit
entrypoint. It is included by the existing Prism TypeScript project.

## Local preparation verification only

The actual database prerequisite is absent in this environment. No PostgreSQL
connection, query, installation, service setup or native positive test was run.

- The new package command exits1 with REAL_POSTGRES_DATABASE_REQUIRED before
  test execution.
- A read-only routing proof invokes the original test runner with the actual
  absent prerequisite. The original native case emits its real skip event;
  the acceptance validator rejects it.
- With a nonmatching test selector, Node emits its real green file-level pass;
  the same validator rejects it because no native test passed. This is a test
  runner routing check, not an environment/database substitute.
- Original Prism typecheck and canonical entrypoint lint pass.
- Original worker-readiness.test.mts exactly matches base bytes; SHA-256 and
  commands/exit codes are recorded in the evidence commands.json.

Evidence: `docs/review/evidence/resume-84-worker-pg-native-entry/`. Initial lint
feedback is preserved: the first placement mixed test-only environment access
into a production-classified integration path and its acceptance predicate was
oversized. The final explicit test-infrastructure location and small predicate
pass the unchanged lint policy; no rule override was introduced.

Full native PostgreSQL acceptance is **still unexecuted**. After independent
review/integration, the follow-up matrix's worker-pg reference should point to
this strict package command while retaining the original SQL test as its source.
This does not close PCR-PRISM-WORKER-001, prove full Control/Worker lifecycle, or
replace broader transaction and service recovery requirements.
