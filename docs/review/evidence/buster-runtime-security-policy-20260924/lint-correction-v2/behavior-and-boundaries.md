# Dedicated Kubernetes transport boundary, V2

Private source only; no execution/integration. Root explicitly authorized moving the existing environment boundary to `kubernetes-command-environment.ts` after independent review rejected the V1 coupling. V1 remains unchanged.

The new small infrastructure adapter reads only HOME, KUBECONFIG, KUBERNETES_SERVICE_HOST and KUBERNETES_SERVICE_PORT. Both KubernetesFixture and RuntimeSecurity call it at the same per-command point previously occupied by their direct reads. Values, undefined handling and caller-selected PATH remain unchanged; no defaults or operator policy were introduced. RuntimeSecurity now imports the adapter directly, without importing another invoker implementation.

The exact ESLint boundary entry moves from `kubernetes-fixture-runtime.ts` to the adapter. No rule is disabled and the number of admitted files does not increase. Existing no-default tests remain for both admitted adapters; new tests prove direct environment reads are rejected in both consuming invokers after relocation. Tailscale's original separate boundary remains because it still directly reads transport inputs.

The two cohesive observation helpers from V1 remain byte-for-byte unchanged: status/spec binding and snapshot shape projection preserve evaluation order, and the observation conjunction preserves every original check including freshness and result-digest shape. The computed digest comparison remains in invoke after that conjunction. See the preserved V1 `extracted-before.txt` for the original block.

`mutation-specs.json` updates affected source hashes and checks each original replacement anchor occurs exactly once. This is a prepared controls map, not test execution. Canonical types/lint, environment-boundary tests, exact-stand consumer/original regressions and fresh review remain required. No lifecycle, manifest-budget or live gate is closed here.
