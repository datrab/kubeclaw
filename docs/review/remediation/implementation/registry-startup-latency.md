# Registry startup validation latency

This follow-up fixes a measured responsiveness regression exposed by the original phase6 cancellation gate. It does not change cancellation scheduling, the 500 ms assertion, attempts-used expectations, lock semantics, or registry import-audit policy.

## Cause and baseline evidence

The untouched original checkout's isolated cancellation probe completed in 209/168 ms (203/163 ms before the abort timer fired, 6/5 ms afterward). The remediated checkout completed in 665/528 ms (601/481 ms before abort, 64/47 ms afterward). Both runs used the actual registered graph plugin and actual stores.

Delegating instrumentation around the real `child_process.spawnSync` implementation measured four import-audit calls in both checkouts: 243.7 ms total original versus 277.8 ms current. Current also had 116 actual flock acquisitions, 241.4 ms total. Import audit therefore was an existing cost; flock added about 121 ms/run, but did not explain the full regression. No subprocess or lock was bypassed.

A CPU profile identified repeated Ajv meta-schema compilation. Delegating instrumentation around real Ajv methods measured 53 `addSchema` calls/504.8 ms in current versus 6/94.8 ms original, across module startup and two runs; compile costs were 174.8 versus 134.7 ms. The security fix for snapshot-owned validators correctly isolated each schema namespace, but constructed a fresh meta-schema compiler for every document/default mode. A separate actual Ajv benchmark of 24 fixture-document compilations measured current311 ms, skipping bundled-contract meta-validation alone256 ms, and shared meta-validation followed by isolated strict compilation14 ms.

Independent WP04 review also compared only the two changed WP04 core files reverted against the same current SDK/foundation: 577/501 ms versus current596/737 ms, while untouched original passed243/173 ms. Thus this was a broader remediation regression, not a WP04 administrative invalidation defect or an original-baseline failure.

## Implementation

The bundled canonical contract and every parsed referenced document are frozen iteratively. A dedicated validator checks each exact referenced document against its meta-schema before each isolated compilation. This API does not register the document's `$id`. Only those already-validated immutable objects enter compilers with duplicate meta-validation disabled. Strict compilation, formats, reference resolution, separate default behavior, document-local `$id` namespaces, and snapshot ownership remain intact. Validation failures synchronously become independent error messages; no shared mutable Ajv error array escapes.

No global cache of referenced schema documents or validators was introduced. Every registry rebuild rereads and validates its schemas. No native dependency, activation change, lock weakening, or subprocess bypass was needed.

## Verification

Before-change profiling used the actual `/workspace/scratch/4e25cf57c177/wp04-cancellation-probe.mjs` with the original and fixes core paths; profiling delegates are `/tmp/state-lock-profile.cjs` and `/tmp/state-schema-profile.cjs`. The isolated Ajv comparison is `/tmp/ajv-registry-cost.cjs`; CPU profile is `/tmp/state-cancel-current.cpuprofile`. These are diagnostic scratch artifacts, not product code or test dependencies.

After change, the same cancellation probe completed414/357 ms, abort timer354/310 ms, settling60/47 ms afterward; both original stage attempts-used assertions remained one.

Commands:

- `node --test tests/verification/reliability/registry-schema-isolation.test.mjs`: PASS, two tests. Invalid document types/required/minLength, strict unknown keywords, malformed regex, absent references rejected. Real file replacements with repeated identical `$id` retain independent defaults and old snapshots; referenced IDs never leak across compilers; boolean schemas remain supported; prior error details survive later validation.
- `node tests/verification/contracts/check-plugin-system-v2-registry-remediation.mjs`: PASS. Actual registry rebuilds, distinct same-ID schema documents, configuration defaults, immutable old snapshots, real package installation/security rejection paths.
- `node tests/verification/contracts/check-plugin-system-v2-registry.mjs`: PASS, original registry contract gate.
- `node tests/verification/contracts/check-plugin-system-v2-phase6.mjs`: PASS, original gate unchanged, including cancellation <500 ms.
- `npm run typecheck --prefix skills/nova`: PASS.
- `npx --no-install eslint --config charts/kubeclaw/files/config/eslint.config.mjs skills/common/plugin-runtime/foundation/registry/schema.ts tests/verification/reliability/registry-schema-isolation.test.mjs`: PASS.

## Limits

FileMutex still uses a real synchronous flock subprocess per acquisition. Import auditing is also synchronous. Startup can therefore delay signal observation, especially under contention or load; this patch removes demonstrated redundant validation work rather than claiming a hard wall-clock bound for arbitrary startup. The original unchanged gate and actual timings establish the measured improvement only. No new timing threshold or timing-only replacement test was introduced.
