# WP08 renderer and Studio editor remediation

Scope: PCR-PRISM-RENDERER-001/002 and PCR-PRISM-STUDIO-001/002.
Implementation and Node/HTTP verification complete; browser-dependent acceptance
remains blocked by the missing Chromium executable and failed CDN download.
No engine, server, worker, contract, or deployment implementation changes.

## Original reproductions

Before edits, both historical original-source probes executed successfully:

```sh
node docs/review/evidence/prism-renderer-review-probe.mjs
node docs/review/evidence/prism-studio-probes.mjs
```

They reproduced component variant content disappearing under a disjoint hidden
patch, pagination buttons without either declared action, an unchanged horizontal
Stack becoming a vertical canonical operation, and a contract-valid canonical
image producing only the unavailable-preview panel. The historical probes remain
unchanged; their assertions intentionally describe the old failures.

## Changes

Renderer component expansion now clones the template and merges each node's
properties in Base → Variant → Override order. Pagination buttons carry separate
previous/next action identities. Tabs, dialog dismissal, and the existing
empty-state button also emit their declared control action. Actions remain
escaped data attributes; the iframe sends declarative messages to the original
App flow handler. No inline user script or new transition mechanism was added.

Studio and its adapter share the actual projection in projection.ts. Existing
nodes are compared against that projection before deriving explicit property
deltas. The adapter no longer applies insertion defaults to unrelated canonical
properties. Object-valued default projections compare structurally. New-node
insertion still owns its existing defaults and structural completion. Existing
node type conversion is rejected explicitly because no canonical type-conversion
operation exists. Canonical components, bindings, state and responsive patches
remain owned by the original document and domain.

The preview asset loader uses the existing authenticated same-origin artifact GET
route, same-origin credentials and no redirects. Only canonical image/icon
artifacts with a supported image MIME type are translated. SHA-256 must match
the canonical artifact identity; streamed bytes share a six-million-byte limit
and a thirty-second request deadline. Replacement/unmount aborts outstanding
work, and results are bound to their originating document. Data URLs avoid blob
URL retention. Fonts, audio and video are not renderer image sources.

Preview receives these verified sources separately from canonical asset metadata.
Its sandbox remains allow-scripts without allow-same-origin. CSP permits data
images and retains the existing default-deny policy and fixed selection script.
Asset errors are explicit in the parent UI. The loader's HTTP fixture tests do
not establish production authentication or browser decoding/CSP correctness.

## Verification

Passed 62 original-engine, renderer, adapter, actual projection and real HTTP
checks:

```sh
node --test skills/prism/tests/studio-adapter.test.mts skills/prism/tests/studio-roundtrip.test.mts skills/prism/tests/preview-assets.test.mts skills/prism/tests/renderer.test.mts skills/prism/tests/renderer-remediation.test.mts skills/prism/tests/engine.test.mts
npx tsc --noEmit -p skills/prism/tsconfig.json
npm run build:studio --workspace @kubeclaw/prism
```

The 36-node-type roundtrip matrix validates each original contract document,
serializes the actual App projection, asserts no operation, edits a neighboring
heading through the adapter/domain, and compares the untouched canonical node.
The layer regression executes both original Engine and Studio render paths,
including disjoint and colliding overrides and original-template immutability.
Asset tests use the actual content-addressed store and a real local HTTP server;
load failure, declared/streaming size limits, digest mismatch, cancellation and
unsupported MIME metadata fail explicitly. No fetch, renderer, engine or domain
implementation is replaced in these tests.

New helper/test modules pass the canonical ESLint configuration. Existing
renderer/adapter complexity and function-length diagnostics remain baseline
debt. Canonical ESLint cannot parse App because the existing Prism tsconfig
excludes TSX; the identical HEAD source has the same diagnostic. Vite builds the
actual TSX successfully. No lint suppression or configuration exemption added.

## Browser gate: blocked, not passed

```sh
node node_modules/playwright/cli.js install chromium
node node_modules/playwright/cli.js test --config skills/prism/studio/playwright-remediation.mjs --max-failures=1
```

The exact package browser installer failed after CDN timeouts/download failure.
No system browser or existing executable was found. The browser suite validates
its fixture, then fails launching chromium_headless_shell-1234 before UI
assertions; the remaining three cases do not run. No fallback browser or fake
browser result is substituted.

The four prepared cases load the production Studio bundle from a real local HTTP
fixture backed by the original artifact store. They click Next and Previous in
the actual sandbox iframe and expect the original App flow to change state in
both directions; they check image naturalWidth and sandbox behavior, and verify
load/integrity/size denials in the App. This fixture does not claim to execute the
Control service's authentication. These assertions still need execution on a
host with the exact browser installed. The package test:studio-remediation command
builds the original bundle before invoking this gate.
