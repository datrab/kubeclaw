# Root review of prepared native acceptance entrypoints

Two missing or ambiguous native follow-up entrypoints were prepared by separate agents and reviewed by Root. These are acceptance preparations, not new native passes or finding closures. Production Engine, browser adapter, cache, Worker Core, database implementation and existing native SQL assertions are unchanged.

## Native Chromium capture and retention

Reviewed source: original c1bd5fb plus corrected4a759df. The gate calls the original Engine with capture:true, real installed Playwright Chromium, the public bounded cache constructor, a fixed local document fixture and no model call. PNG dimensions match the original renderer's1440x1000 viewport; each actual capture's text/ARIA/version/hash and cache bounds are checked. Same-key evidence is explicitly one cache admission plus identical resolved result identity, not an invented browser-launch count. Measured post-GC parent heapUsed+external growth is compared with a separately predeclared budget; cumulative output must exceed twice the cache byte budget. Browser-child RSS and Control restart remain outside this gate.

Root found a genuine measurement risk in the initial harness: unawaited stdout writes could retain evidence buffers and pollute the measured heap when the receiver is slow. The corrected gate awaits every output write before GC sampling and retains only primitive per-capture summaries. It also binds the actual fixture SHA, Playwright package/version and engine source hashes. Root inspected that correction against the original renderer and cache.

No browser prerequisite probe, native browser launch, installation or alternative browser was attempted here. Prism typecheck and canonical lint pass for the prepared entrypoint. Successful native execution is still required.

Command on a suitable authorized host with the pinned browser already present:

```
npm run test:engine:native-retention --prefix skills/prism -- --max-retained-growth-bytes=BYTES --captures-per-window=32
```

BYTES must be chosen and justified before execution; it is not automatically raised after a failure. The package script supplies --expose-gc. Missing prerequisites, invalid arguments, insufficient workload and failed measurements do not turn into passing skips.

## Strict native PostgreSQL readiness boundary

Reviewed source:7d3e157. The opt-in entry requires the existing actual KUBECLAW_PRISM_READINESS_TEST_DATABASE value before invoking Node's test runner. It selects precisely the original native SQL/lock/cancel/release/recovery test and requires exactly one named actual pass, a successful one-test summary and zero failures/skips/cancellations/TODOs. The original SQL test bytes equal the integration baseline exactly.

Root independently executed the safe negative routing paths with the actual absent database prerequisite. The package command fails1 before SQL starts. The original native test's real skip is rejected, and Node's real green file-level pass when zero tests match is also rejected. These are actual test-runner events, not mocked query/pool/test-result objects. No PostgreSQL connection was opened. Raw root outputs are under docs/review/evidence/resume-84-native-gates-root/.

```
npm run test:worker-readiness-native --prefix skills/prism
```

A configured isolated migrated native database is still required for a positive result. This SQL boundary alone does not prove the full Control/Worker transaction and lifecycle acceptance.

The two agents edited the same package script object independently. Root resolved that routine JSON conflict by preserving every original package field/script and adding exactly the two named opt-in commands. Combined Prism typecheck and changed-file configured lint pass. No package's ordinary test discovery was redirected to a native prerequisite that would silently skip.
