# Raw evidence: F-T14-01/02 reconciliation

Authority: remote repair head `1ba445125fbacfa4f0344f8bf38e68f8f0686eff`,
tree `692a57a387d823d4b6636062e90dfbbeb07d28cd`; isolated local graft
`5d8207712dc52f48e8860dc9530b77d085cb1094` has that exact tree.

| File | Command | Exit / scope |
| --- | --- | --- |
| `prism-current.txt` | `node --test --test-concurrency=1 skills/prism/tests/control-product-independent.test.mts skills/prism/tests/product-decisions.test.mts skills/prism/tests/product-controller.test.mts skills/prism/tests/studio-proxy.test.mts skills/prism/tests/control-product-composition.test.mts` | 0; 16 pass, 0 fail/skip |
| `prism-types.txt` | `./node_modules/.bin/tsc -p skills/prism/tsconfig.json --noEmit` | 0; empty successful output |
| `prism-product-lint.txt` | `node node_modules/eslint/bin/eslint.js --config charts/kubeclaw/files/config/eslint.config.mjs skills/prism/control/product-decisions.ts skills/prism/server/control-config.ts skills/prism/server/control.ts skills/prism/server/product-controller.ts skills/prism/server/product-decisions.ts skills/prism/server/product-operator-page.ts skills/prism/server/studio-request.ts skills/prism/storage/product-decisions.ts skills/prism/tests/product-controller.test.mts skills/prism/tests/product-decisions.test.mts skills/prism/tests/control-product-composition.test.mts skills/prism/tests/control-product-independent.test.mts` | 0; empty successful output |
| `prism-lint.txt` | the exact focused command above plus `skills/prism/server/control-server.ts` | 1; 25 pre-existing whole-file complexity/length errors retained, not used as a passing gate |
| `reviewed-source-reconciliation.json` | SHA-256 comparison with `wave48-product-independent/source-sha256.json` | Product-owned authority/controller/CRD/dedicated chart sources unchanged; later shared composition changes are explicitly visible |
| `source-hashes.txt` | `sha256sum` over current authority, controller, CRD, chart, tests and prior root raw evidence | 0 |
| `environment.txt` | UTC/run/source/runtime availability probe | Node 24.19.0; Go and Helm unavailable in this isolated run |

No Product/controller/chart production source was edited. The previous native
Kubernetes/CRD/CEL/TokenReview/CAS evidence is reconciled, not rerun or widened.
No Tailnet identity, app login, recipient delivery, deployment or human action is
represented by this directory.
