# IFR-25-001 — Prism worker operational readiness

This bounded slice separates process liveness (`GET /health`), initialized local service (`GET /bootstrap`), and selected dependency availability (`GET /ready`). The worker's actual HTTP handler is extracted without replacing the original attempt executor, deterministic engine, artifact client, contract validation, or trust consumer.

HMAC mode alone constructs the original native `pg.Pool`. Readiness queries the actual `prism.worker_request_nonce` table; POST admission performs that same query and the original `PostgresNonceStore` verification/nonce writes using one bounded borrowed client before calling the attempt executor. Operator stderr diagnostics contain only phase, allowlisted native SQLSTATE/system code (or fixed unknown/timeout/cancellation code), elapsed milliseconds, and actual bounded pool/admission counts. No raw error, connection string, SQL, request, or body is emitted; this is diagnosis, not an alert integration. Real native TCP refusal and blackhole tests distinguish ECONNREFUSED, PG_CONNECT_TIMEOUT, and admission saturation. Database failures return fixed `PRISM_NONCE_DATABASE_UNAVAILABLE` with HTTP 503, without database messages, URLs, or credentials. Control's existing non-2xx rollback applies. SPIFFE mode requires no database URL or pool; actual POST authorization still consumes the original loopback proxy/forwarded certificate identity contract. Its local readiness does **not** claim current proxy SVID/SDS validity or remote artifact availability.

The pool is private, maximum four clients, and maximum four concurrent operations: excess checks/admissions fail immediately. Native acquisition timeout is 750 ms; after acquisition an additional 750 ms wall deadline, PostgreSQL statement/lock timeout, and disconnect cancellation bound query work. The deadline destroys the actual client transport, awaits original SQL settlement and connection closure, then releases the client. There is no detached timeout race. Keeping the operation cap equal to the private pool maximum avoids pg's queued-acquisition behavior where an expired pending callback can leave its replacement connection still starting. A real TCP blackhole regression exposed this during implementation and now verifies no pending/open pool clients when responses finish.

The Helm worker readiness probe changes from `/health` to `/bootstrap`, preserving the post-install migration hook's initial rollout prerequisite. Kubernetes bootstrap readiness is deliberately not an operational database alarm or service-endpoint removal mechanism. This slice adds no monitoring/alert deployment or restart loop.

## Verification and limits

- `node --test skills/prism/tests/worker-readiness.test.mts skills/prism/tests/internal-auth.test.mts skills/prism/tests/worker-service.test.mts`: 11 pass, one native PostgreSQL cancellation case explicitly skipped with `REAL_POSTGRES_DATABASE_REQUIRED`. Actual localhost HTTP and native pg startup against a real TCP blackhole prove bounded connection failure and original admission behavior. SPIFFE HTTP tests prove missing peer rejection and progression to original envelope validation with the accepted local proxy identity; they are not real mTLS/SVID proof. Original worker executor/artifact tests remain separate genuine local engine evidence.
- PGlite executes the actual readiness SQL before/after the original nonce migration; original auth tests execute nonce persistence/replay. PGlite does not prove native pg pool SQL execution, lock timing, cancellation, or scheduling.
- `PATH=/workspace/scratch/4e25cf57c177/toolchains/bin:$PATH node --test skills/prism/tests/worker-readiness-chart.test.mts`: actual Helm render, one pass, validates worker bootstrap/liveness probes and original post-install migration hook.
- `npx tsc --noEmit -p skills/prism/tsconfig.json`: pass. Canonical ESLint passes for both new production modules and both new tests. Existing startup `worker.ts` retains its original environment-access lint findings; no rule waiver added.
- Native cancellation test is executable with `KUBECLAW_PRISM_READINESS_TEST_DATABASE` pointing to an isolated, already migrated PostgreSQL database; it uses an actual independent table-locking connection, aborts the production check, checks client destruction, and verifies recovery after rollback. No eligible DSN/unprivileged initdb environment is available here. Native pool SQL/cancellation, stopped-live-database recovery, cluster bootstrap, SVID lifecycle, and alarms remain open. No model, executor, or PostgreSQL protocol replacement is used to claim these gates.

The original `PATH=/workspace/scratch/4e25cf57c177/toolchains/bin:$PATH node tests/verification/deployment/check-deployment-truth.mjs` also passes after updating only its Prism probe expectation to `/bootstrap`; concurrent Buster assertions are preserved.

Raw logs: `docs/review/evidence/prism-readiness-{tests,types,lint,chart,deployment}.txt`.

## Exact scope (13 paths)

- `skills/prism/server/worker.ts`
- `skills/prism/server/worker-service.ts`
- `skills/prism/server/worker-readiness.ts`
- `skills/prism/tests/worker-readiness.test.mts`
- `skills/prism/tests/worker-readiness-chart.test.mts`
- `charts/prism/templates/workloads.yaml` (worker readiness path only)
- `docs/review/remediation/implementation/prism-operational-readiness.md`
- `docs/review/evidence/prism-readiness-tests.txt`
- `docs/review/evidence/prism-readiness-types.txt`
- `docs/review/evidence/prism-readiness-lint.txt`
- `docs/review/evidence/prism-readiness-chart.txt`
- `tests/verification/deployment/check-deployment-truth.mjs` (only Prism `/bootstrap` expectation; other authors own remaining hunks)
- `docs/review/evidence/prism-readiness-deployment.txt`

## Resume verification — 2026-09-09

Reviewed the actual native pool lifetime, timeout/abort handling, HMAC admission,
SPIFFE dependency selection and Helm migration ordering against the existing
changes. No additional Prism functional change was necessary in this resumed
slice. The combined original HTTP/auth/readiness/Helm/Buster process suite
(`node --test skills/prism/tests/worker-readiness.test.mts
skills/prism/tests/internal-auth.test.mts skills/prism/tests/worker-service.test.mts
skills/prism/tests/worker-readiness-chart.test.mts
tests/verification/deployment/buster-readiness.test.mts`, with actual Helm on
PATH) exits 0: 16 passed and one explicit native PostgreSQL cancellation skip.
`node node_modules/typescript/bin/tsc --noEmit -p skills/prism/tsconfig.json`
exits 0. Canonical ESLint with
`--config charts/kubeclaw/files/config/eslint.config.mjs` on both new production
modules and both new tests exits 0. The original deployment truth gate also
exits 0. Logs: `docs/review/evidence/resume-20260909/readiness/{tests,prism-types,lint-canonical,deployment}.txt`.

Native PostgreSQL binaries/DSN are still unavailable. Native database query
cancellation and live database loss/recovery therefore remain unverified;
PGlite SQL, TCP blackhole and connection refusal evidence retain their precise
limited meanings above. No deployment, external action, mock or shim was used.
