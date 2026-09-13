# Commands and evidence scope

Run at the repository root in the root-owned test environment with systemd-analyze
available. The authority test keeps the real root-owner requirement.

```sh
npm run verify:worker-core:node-pools
node_modules/.bin/tsc --noEmit -p skills/worker/core/tsconfig.json
npm run typecheck --prefix skills/prism
node_modules/.bin/tsc --noEmit -p tests/verification/reliability/tsconfig.native-scope.json
node --test skills/prism/tests/renderer.test.mts skills/prism/tests/renderer-remediation.test.mts
node_modules/.bin/eslint -c charts/kubeclaw/files/config/eslint.config.mjs scripts/native-worker-node-policy.mjs scripts/native-worker-node-capacity.mjs scripts/native-worker-node-preflight.mjs scripts/render-native-worker-node.mjs scripts/prepare-native-worker-pools.mjs skills/worker/core/worker/native-pool-policy.ts skills/worker/core/worker/resource-reservations.ts skills/worker/core/worker/native-resource-pool.ts skills/worker/core/worker/native-worker-ownership.ts skills/worker/core/worker/native-attempt-executor.ts skills/prism/config/native-worker.ts skills/prism/engine/render-operation.ts tests/verification/deployment/native-worker-node.test.mjs tests/verification/reliability/worker-resource-reservations.test.mts tests/verification/reliability/worker-native-scope-live.mts
bash -n scripts/deploy.sh
node scripts/versions.mjs --check
```

combined-tests.txt is the final 22-case local gate. core-tests.txt and
node-tests-first.txt/node-tests.txt are incremental prior scopes, not extra
unique current tests. Empty lint/core-types output corresponds to exit 0.
node-lint-first.txt preserves genuine initial lint failures corrected by splitting
functions. The systemd parser is 255.4-1ubuntu8.17; no service was started.

The native live gate requires a real delegated test root, original compiled
launcher, trusted host identity and KUBECLAW_WORKER_TEST_POOL_LIMITS_FILE. It has
not been executed here. Neither Node protocol vectors nor a parsed unit count as
positive kernel/cluster enforcement. No previous denied helper was retried or
rerouted. No host configuration, deployment or operational cleanup was run.

live-gate-types-first.txt preserves the initial cross-package optional-property
error. The actual render call was corrected; the dedicated strict native-gate
typecheck now passes without weakening its compiler settings.
