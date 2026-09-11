# Independent Prism engine extraction review

Reviewed source: remote `d22ee1d298aa63050673e075b363ae4c996008dc`, exact tree
`d90200377036cd73d1048e1d206e66cc9e8fed40`, local restoration `bc777cd`.
Baseline: remote `c71134a` / local `e4b2bc5` before the engine extraction.
Reviewer: separate `prism_independent_review` agent, isolated checkout
`/workspace/scratch/a51d993d444b/review-prism-84`. Production source was not edited.

## Decision

The bounded refactor passes independent review: no introduced functional defect
was found in `index.ts`, `render-operation.ts`, `capture-findings.ts` or
`design-providers.ts`. This closes the separate-review requirement for this
extraction only. It does **not** approve the coupled Delivery/semantic package,
claim native capture acceptance, or promote PCR-PRISM-ENGINE-001 or worker findings.

## Source findings

- Both extracted provider classes have identical TypeScript AST structure and
  leaf tokens to the original, excluding formatting and optional trailing commas.
  Fetch timeout, caller AbortSignal composition, validation, credentials, URL
  checks and response-body consumption remain in their original methods.
- The public runtime and package exports are byte-identical. The original engine
  still re-exports both providers; reverse imports from the extracted modules
  are type-only and therefore create no runtime module-initialization cycle.
- Operation validation and ingest retain the original ordering, rejection messages,
  coercions and result shape. Request cloning, fingerprint formation, cache
  admission and ownership are unchanged. Cache implementation is byte-identical.
- Render asset checks, CSS allowlists, CSP, view resolution, document data,
  rendering metadata and optional capture output match the original code. The
  actual original engine parity script reproduces all 12 recorded successful and
  rejected cases including exact JSON order and HTML bytes.
- Capture preserves original browser acquisition, caller signal, context options,
  screenshot/ARIA/DOM-check order, context close and final owned-browser close.
  The browser ownership module itself is byte-identical. An extraction adds an
  async return boundary but does not remove the final cache cancellation check.
- Browser callbacks contain their helpers within the serialized function body.
  TypeScript-transpiled callback scope analysis resolves free identifiers only to
  `Array`, `Math`, `Number`, `getComputedStyle`, `undefined` and `window`.
  Neither callback relies on imported helpers or Node/module closures. Interactive
  name fallback preserves truthiness/order, and contrast formula/thresholds and
  ancestor traversal preserve the original expressions. This is static closure
  evidence, not actual Playwright/Chromium execution.

## Independent executions

All commands ran on the isolated unmodified reviewed source.

| Check | Outcome | Raw evidence |
| --- | --- | --- |
| Seven original engine/cache/provider/renderer/worker test files | 36 passed, 0 failed, 0 skipped | `original-tests.txt` |
| Original 12-case before/after parity script | 12 identical outcomes and bytes | `parity.txt` |
| Prism `tsc --noEmit` | exit 0 | `types.txt` |
| Canonical repository ESLint config, four changed production files | exit 0 | `configured-lint.txt` |
| Provider AST, unchanged source bytes, browser closure inspection | exit 0 | `static-parity.txt` and `static-parity.mjs` |

Evidence directory: `docs/review/evidence/resume-84-prism-review/`.
The original test invocation is:

```
node --test skills/prism/tests/engine-cache.test.mts skills/prism/tests/engine.test.mts skills/prism/tests/provider-cancellation.test.mts skills/prism/tests/renderer-remediation.test.mts skills/prism/tests/renderer.test.mts skills/prism/tests/worker-cancellation.test.mts skills/prism/tests/worker-service.test.mts
```

No assertion, adapter, provider or browser was replaced. Existing tests include
actual TLS response-body cancellation and disk/artifact operations. Where they
use the existing explicitly deterministic test provider, this is not represented
as model execution. Test bodies were unchanged from the reviewed source.

Initial review harness invocations are retained: unconfigured ESLint failed to
find a root config; the corrected command explicitly used the unchanged
`charts/kubeclaw/files/config/eslint.config.mjs`. AST-printer comparison retained
line breaks; token-tree comparison also retained optional trailing commas;
semantic child-tree comparison removes those formatting differences. Its initial
global allowlist omitted the built-in `undefined`, subsequently explicitly added.
These were inspection-harness corrections, with all failed logs retained and no
production or original test assertions relaxed.

## Remaining gates

Actual Chromium capture, screenshot/ARIA behavior, process termination after
abort, long-lived heap behavior, concurrent child CPU attribution and full native
PostgreSQL Control restart/replay remain unverified here. No Chromium installation
retry or surrogate browser was attempted. Closure analysis and non-browser render
parity cannot close those requirements. No CI, deployment or production operation
was performed. The original 154-finding statuses are unchanged by this report.
