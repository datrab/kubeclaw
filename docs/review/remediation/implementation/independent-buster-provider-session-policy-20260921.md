# Independent provider session policy source review

Private manifest-v3 review: not accepted pending Helm correction and remaining maintained caller migration. No runtime, integration or production changes by reviewer. The reviewer authored the pre-existing Loader refactor; this review is limited to the other author's new policy delta, not independent acceptance of that Loader baseline.

`../../evidence/independent-buster-provider-session-policy-20260921/source-comparison-v3.json` records the inspected seventeen snapshots and their relation to the author's manifest.

## Blocking finding

The Helm edit applied conditional integer checking beyond the execution definition loop. Worker Core localRuntime, preparation resourcePolicy, Studio, Worker/native/supervisor blocks now reference `$limit.type` without a corresponding in-scope declaration. The preparation loop also references `$section` outside its former loop. This cannot establish Helm/schema parity and introduces unrelated guard changes. Restore all unrelated blocks to before bytes and confine fractional support to the Buster execution schema loop. No Helm execution was performed to replace this static finding with a runtime claim.

## Caller handoff

The now-maintained provider-loader-ownership.test.mjs uses the old observation-only Session argument and is absent from manifest-v3. It requires explicit migration when this policy is integrated. Other observed current Session/Loader/Capabilities call sites are covered by the draft or are its implementation paths.

## Bounded positive source findings

All nine added JSON fields are required, closed-shape and default-free: protocol bytes, grace/termination/drain milliseconds, minimum heap MiB, heap fraction, pending capability count, minimum descriptors and artifact descriptor reserve. Eight are positive integers; fraction is strictly positive and at most one. Timers have the Node timer-safe maximum. Provider-runtime validation reuses the same provider schema and enforces grace strictly below termination timeout. Canonical values retain 500/1000/1000ms stop/drain behavior.

The Loader validates and freezes provider plus observation; normal and recovery sessions receive that same frozen snapshot. Session validates before spawning and Capabilities has no count/drain default. Descriptor addition checks safe-integer overflow before launch. Heap calculation keeps the existing max(minimum,floor(memoryMiB*fraction)) structure. Policy does not pretend to change invocation memory or kernel accounting. No new cleanup-order change is present: abort first, process close bound, then bounded drain after actual close, then retained signal error.

Root separately reviews actual consumer-test adequacy. Full configuration, independent Loader correctness, actual process behavior and deployment acceptance remain outside this source-only decision.

## V4 correction review

The v4 source-only correction is accepted within this bounded delta: all 18 manifest entries match independent copies in sources-v4/source-comparison-v4.json. Actual Helm diff now changes only the execution definition's numeric/fraction checks and the provider grace-before-timeout relationship; unrelated policy guards are restored. The maintained Ownership Session caller now passes both explicit provider and observation settings. Thus the two specific v3 findings are resolved at source level. Actual schema/Helm and consumer execution remain unverified here; no full CONFIG or baseline Loader acceptance is implied.
