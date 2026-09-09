# Capability utility import and fixture independence — 2026-09-09

The clean integration exposed two local test setup defects. `redis-test-client.mjs` eagerly required `ioredis` at module import, so importing unrelated capability utilities required a runtime-only dependency. The actual client factory now loads the unchanged original `ioredis` dependency when a Redis operation is requested. `docker/openclaw-tools/package.json` remains its declaration authority. No new dependency, fallback client, resolver substitution, or Redis success outcome was introduced.

After that correction, the two Codex utility tests exposed their dependency on an absent operator project `Projects/pipeline-smoke-landing/src/.swarm/progress.json`. They now write the original `buildProgress` generator output into unique local project directories and remove those directories through the test cleanup hook. Both original dispatch/model assertions remain unchanged. The existing immutable image fixture is supplied only while generating metadata and the prior environment value is restored immediately. No image is fetched or deployed. The model rejection assertion now creates its fixture before entering `assert.throws`, preventing fixture failures from masquerading as the expected resolver rejection.

Scope: `tests/verification/e2e/redis-test-client.mjs`, `tests/verification/e2e/check-real-e2e-capabilities.test.mjs`, and this note. No commit or staging by this agent.

## Commands and outcomes

Raw logs: `docs/review/evidence/resume-20260909/offline-import/`.

- Original `node --test tests/verification/e2e/check-real-e2e-capabilities.test.mjs`: exit 1 at import (`utilities-before.log`). After the deferred import, two utility cases passed and two failed on the absent operator project (`utilities-after.log`).
- Same original test command after generated-fixture correction: exit 0, four passed, none skipped (`utilities-final.log`).
- `node --input-type=module` importing the original client helper and asserting both `createRealE2ERedisClient({})` and `withRealE2ERedisClient(operation,{})` reject `MODULE_NOT_FOUND` naming `ioredis`: exit 0 (`missing-runtime.log`). The supplied operation was asserted never invoked. This exercised the actual absent runtime dependency, without modifying resolution or replacing the client.
- Canonical ESLint `node node_modules/eslint/bin/eslint.js --config charts/kubeclaw/files/config/eslint.config.mjs tests/verification/e2e/redis-test-client.mjs tests/verification/e2e/check-real-e2e-capabilities.test.mjs`: exit 0 (`lint-final.log`).
- `git diff --check -- tests/verification/e2e/redis-test-client.mjs tests/verification/e2e/check-real-e2e-capabilities.test.mjs`: exit 0.

These are local utility/import and real missing-dependency checks. Successful Redis connectivity, Redis runtime installation, model dispatch, cluster execution and provider acceptance remain untested by this slice.
