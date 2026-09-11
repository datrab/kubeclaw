# Prepared native Prism capture/retention gate

Implementation base: integration `be7095f`. New opt-in native gate for the
unexecuted capture/retained-memory portion of PCR-PRISM-ENGINE-001:
`skills/prism/integration/engine-capture-retention.mts`.

**Prepared, not executed.** Chromium is unavailable and an earlier installation
attempt was cancelled. This work neither installs nor invokes a substitute
browser. No native test run or finding closure is claimed.

## Invocation and prerequisite ownership

On an authorized host with the repository-pinned Playwright Chromium already
installed, supply a predeclared acceptance budget:

```
npm run test:engine:native-retention --prefix skills/prism -- --max-retained-growth-bytes=BYTES --captures-per-window=32
```

Replace BYTES with a positive integer approved before the run. There is no
implicit memory threshold, baseline-derived automatic threshold, retry-based
increase, or passing skip. The separate package command passes `--expose-gc`;
direct execution without explicit GC fails. Missing/nonexecutable installed
Chromium fails at filesystem access, and launch/runtime failures propagate.
Unknown/duplicate arguments and invalid integers fail as well. This native gate
is deliberately separate from ordinary local package tests.

The budget applies to post-GC **parent heapUsed + external** growth relative to
the warmed baseline. external already includes ArrayBuffer memory; ArrayBuffers
are also recorded separately but not double-counted. RSS is recorded, not used
as a browser-tree or heap-retention claim. Choose the limit from the intended
worker cache budget plus independently justified driver/runtime overhead for
that Node/browser/fixture profile, and record the decision with the run evidence.
Do not increase it merely because a run fails. Comparing fixed repeated windows
is a bounded regression criterion, not a universal proof against every leak.

## Actual workload and evidence

The gate directly uses original PrismEngine/renderOperation/Playwright Chromium
and the original cache implementation. It uses an explicitly bounded cache
profile: 2 in-flight, 4 completed entries, 128 KiB completed serialized bytes.
Those are public constructor limits exercised by this workload, not altered
production defaults. The model-free original deterministic provider is supplied
but render does not invoke a model/provider method.

One same-key pair verifies one public in-flight admission and identical settled
result object. This evidence is deliberately limited: no Chromium process-launch
counter is fabricated, and no native process count is inferred from the cache.
Then eight unique actual captures warm the runtime and fill/evict cache entries.
Three measured windows of 32 captures each run in the same long-lived Node
process and the same original engine. Each capture requests `capture:true`,
checks native Chromium metadata, PNG signature/IHDR dimensions/IEND, exact
request text in HTML and ARIA, and cache count/byte limits. Each window finishes
with event-loop settlement and two explicitly synchronous GCs before sampling.

The harness releases screenshot/result/Promise references before sampling;
only primitive counters and hashes survive. Output includes engine-source, original fixture and installed Playwright package SHA-256s,
Node/Playwright/browser versions, per-capture PNG/ARIA hashes and serialized byte count,
baseline/window memory values, configured acceptance limit and cache usage.
Every JSONL write awaits its completion callback before continuing. All prior
writes have settled before the next GC sample, so a slow stdout consumer cannot
build an unbounded harness queue and falsely inflate the measured retained heap.
Screenshot/result objects are reduced to primitive summaries before awaiting
output. Output errors fail the gate. Save stdout as the raw execution evidence.

Cumulative produced serialized output must exceed twice the configured cache
byte budget; otherwise the workload fails as insufficient. Increase the number
of captures for that condition, not the memory threshold. The configurable
capture count is bounded to16..1024 per window; cache limits and three windows
remain explicit. Normal completion emits a final passed event only after all
native assertions and memory limits succeed.

## Verification performed here

Prism original typecheck passes and canonical repository ESLint passes for the
new file. The initial lint invocation caught GC's optional async-return overload;
the final implementation explicitly requests synchronous GC. No rule/assertion
was weakened. Initial and final output are retained under
`docs/review/evidence/resume-84-prism-native-retention/`.

No browser prerequisite check or native invocation was run in this environment.
The new executable gate still requires an independent review and actual native
execution before serving as runtime evidence. Control persistence/restart replay,
whole worker service retention, browser child memory/accounting and process
reaping remain separate original requirements. No register status changed, no
production engine/cache/provider source changed, and no deployment/CI ran.

## Independent-review correction

Root identified unawaited stdout backpressure as a measurement confounder. The
follow-up makes every evidence write awaited and removes original result objects
from logging waits. It also binds the original fixture bytes and installed
Playwright package bytes/version in configuration evidence. Original typecheck
and configured lint pass after this correction. No threshold/workload scope was
changed, and no native invocation, prerequisite probe or installation was run.
