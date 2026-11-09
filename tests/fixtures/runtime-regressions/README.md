# Retained runtime regression inputs

These are executable test inputs, not published reader pages. PR #13 retired the
old documentation trees; the runtime gates still require these five historical
files. `provenance.json` binds each unmodified byte stream to the last main
revision before that migration, with byte count, SHA256 and Git blob identity.
`retained-runtime-fixtures.test.mjs` validates those bindings.

The legacy CLI and transport diagnostics still execute the original registered
runtime and historical sources. Their successful offline tests are not live
Gateway/model or deployment acceptance. No tests, crash boundaries, negative
controls or release gates were removed.

The native cache recovery fixture uses the same 5s adapter I/O / 10s effect-lock
budgets as its existing legacy-prefix sibling. The 30s child watchdog and real
SIGKILL/locale/checkpoint/replay assertions remain unchanged. The earlier CI
blocked recovery did not serialize its stage map; the fixture now exposes those
states on failure. A local baseline and a controlled 150ms fsync run both passed
before this change, so they are not claimed to reproduce the exact CI cause.

Focused verification:

```sh
node --test tests/verification/reliability/review-cache-native-profile.test.mjs \
  tests/verification/reliability/prism-reader-value.test.mjs \
  tests/verification/reliability/runtime-profile-proxy-independent.test.mjs \
  tests/verification/reliability/legacy-cli-diagnostic-reproducibility.test.mjs
node --test tests/verification/reliability/retained-runtime-fixtures.test.mjs \
  tests/verification/deployment/reliability-groups.test.mjs
node tests/verification/contracts/check-plugin-system-v2-phase6.mjs
npm run schema:check --workspace @kubeclaw/plugin-review
npm test --workspace @kubeclaw/plugin-review
```

Structured autoreview (`--mode local`, with the focused code diff supplied as a
`--dataset`) reported no actionable findings. Its local inspection was blocked
by the review sandbox; actual test evidence is recorded independently.

The PR static gate also needs the independently locked reader package represented
as its own Knip workspace and installed with its committed lock. Markdown/parser
imports remain checked against that package. Mermaid is a narrowly scoped browser
asset dependency: the reader serves its actual module files and validates rendered
SVGs. Existing discovery export names are retained as forwarding functions, and
the discovery self-test now positively checks the real authenticated census route.
Full `knip:check`, `typecheck:integration`, discovery self-test and the complete
review-plugin npm test (including pretest/posttest) pass locally. A second focused
structured autoreview reports no actionable findings, with the same sandbox limit.

Main run 42705988348 exposed a separate historical transport-fixture 100ms
artifact-store readiness deadline. Its consumer now explicitly adapts the two
shutdown/startup budgets to 5s in memory, retaining the authenticated original
file and all proxy/trap/HTTP/admission assertions, with a 30s child watchdog.
A controlled 200ms delay in the real artifact-record directory creation reproduces
the original `ADAPTER_START_TIMEOUT:...:ready`; the adapted fixture passes with
both original registered adapters and invocation context, zero traps/posts and
no admitted request. This is a local scheduling regression check, not live service
acceptance. The focused consumer and provenance checks pass (3 tests).
