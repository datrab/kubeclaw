# Prism attempt CPU window and owned cancellation

PCR-PRISM-WORKER-002 and PCR-PRISM-WORKER-003 remain partial: this slice repairs the real measurement window and cancellation consumers, but does not establish per-attempt CPU isolation or native Chromium termination proof on this host.

## Frozen source scope

- `skills/prism/server/worker-operation.ts`
- `skills/prism/engine/index.ts`
- `skills/prism/engine/execution-cache.ts`
- `skills/prism/engine/worker-binding.ts`
- `skills/prism/engine/browser-capture.ts` (new)
- `skills/prism/tests/worker-cancellation.test.mts` and `provider-cancellation.test.mts` (new)
- `skills/prism/integration/worker-browser-cancellation.mts` (new)

## Measurement and ownership

The real operation records `process.cpuUsage()` at prepare and reports the user-plus-system delta through execution settlement. Later measurement calls use the settled sample, so earlier process lifetime and later unrelated work are excluded. Duplicate preparation/execution is rejected. Concurrent process work during that window is still included; browser child CPU is not included. Existing RSS sampling and process count are not changed into peak-memory or process-tree measurements. This is a corrected process measurement window, not per-attempt resource isolation.

Each worker invocation owns an AbortController combined with Core's execution signal. Terminate aborts that controller and awaits the actual execution settlement. Core retains the bounded termination/drain deadline and explicitly reports unresolved work; this callback does not assert that arbitrary JavaScript must stop. Browser-close failures remain explicit termination failures rather than a successful drain receipt.

Engine cancellation is a separate optional context, outside the request digest. The first admitted signal identity owns a pending execution. A matching key/fingerprint with a different owner, including a legacy unowned caller joining owned work, fails `PRISM_ENGINE_EXECUTION_OWNER_CONFLICT`. Identical-owner duplicates may coalesce; legacy undefined-owner coalescing remains unchanged. Abort is checked before admission, execution and successful retention. Pending duplicates share the complete checked retention settlement, so cancellation between execution and retention rejects every waiter rather than leaking an inner success. Both request and owner identity are captured before deferred execution, so caller mutation cannot change them. Completed snapshots preserve the previous RAM-cache behavior and durable Control replay authority.

The owned-browser helper checks cancellation before launch and after launch, closes an already-launched browser if cancellation arrived during launch, and memoizes the real `browser.close()` promise. The abort listener initiates that same close; the engine's `finally` awaits it and rechecks cancellation. A pending launch/close cannot be claimed stopped if it fails to drain within Core's deadline. No mocked browser or process identity substitutes are used.

The owner signal reaches actual artifact reads, screenshot/ARIA uploads and the existing provider's `embed`/`propose` fetch calls. Provider timeouts are combined with that signal and remain effective through response-body parsing. Full-log upload continues using Core's separate completion-phase signal. A cancelled HTTP request is not a remote rollback: the local regression deliberately preserves already-written receiver bytes while cancelling a stalled acknowledgment body.

## Evidence and limits

`docs/review/evidence/prism-worker-cancellation.txt` records 37 passing tests (the 30 original worker/engine/cache/Prism checks plus seven new real cancellation/CPU regressions), a passing Prism typecheck and clean focused canonical lint for changed helper/cache/binding/operation and new tests. No skips. The new tests use the original engine/renderer, actual CPU work, the real artifact client/store and local HTTP/HTTPS servers. HTTPS tests create a local certificate and use the actual provider client; there are no external or paid requests.

`docs/review/evidence/prism-worker-cpu-baseline.txt` records the exact original committed operation failing the same prior-CPU-exclusion assertion. The negative control used temporary copies removed immediately afterward; production source was not swapped. The corrected operation passes and retains a stable measurement after additional real CPU work.

Canonical lint of `engine/index.ts` retains four existing errors (executeOnce length, complexity, fallback chain and file length); its baseline had those four plus dynamic module loading. No rule was disabled or boundary exception added.

`docs/review/evidence/prism-worker-browser-native.txt` records both explicit native tests failing at original Chromium launch because the executable is missing. Therefore real browser close/drain and capture-upload cancellation remain native gates, not passing proof. The launch-adjacent cancellation test requests cancellation shortly after starting the original engine; it does not claim deterministic scheduler placement inside launch. No installation retry, replacement browser or hidden skip is included.

CPU attribution under concurrent attempts, browser child accounting, native browser termination and remote rollback remain unproven or out of scope. No Core, Tailscale, deployment, approval or register files were changed by this slice. Root alone stages and commits.
