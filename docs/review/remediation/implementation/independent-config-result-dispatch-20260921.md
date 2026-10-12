# Independent Prism result/dispatch configuration review — 2026-09-21

Scope: CR01–CR07 and CR-DOC in the
[result/dispatch matrix](config-result-dispatch-20260921.md). The reviewer did not
implement the slice or the subsequent release fixture corrections. Exact reviewed
production, test and documentation snapshots are in
[`config-result-dispatch-independent-20260921/source`](../../evidence/config-result-dispatch-independent-20260921/source/),
with identities recorded alongside them. No production code was edited during
this review.

## Implementation and proof boundary

The canonical author file and strict schema require both native settings. The
shared loader validates the complete document, rejects the retired environment
keys even when empty, and returns frozen snapshots. Control maps these values to
its existing transport; Worker passes its startup configuration to the native
supervisor. Source inspection confirms supervisor result-limit forwarding into
the original journal. The former result/deadline resolvers are removed; their
remaining production environment-key occurrences are rejection declarations.

The existing transport counts received UTF-8 bytes and applies its timeout signal
to fetch, including streamed body consumption. Both roles receive the same
read-only ConfigMap and checksum in the chart. The explicit Control Helm-key
rejection closes the otherwise permissive Control values object's competing
configuration path without weakening the chart schema. Packaging and selected
source identities remain part of the existing release checks.

The two real journal cases execute the original persistence and result-byte
validation with the loaded Worker value. They do **not** dynamically establish
the entire supervisor forwarding path: root-owned host-policy validation prevents
running that supervisor here. That wiring was source-inspected, not claimed as a
kernel/host test. The stored receipt truthfully represents an attempt that was
not launched. Docker image loader checks are wired for both roles but were not
executed here. The native PostgreSQL fixture's explicit config-path change does
not count as another native PostgreSQL run.

The operator documentation covers author keys, values, units, validation, obsolete
overrides, both rollouts, byte counting, result-persistence failure and timeout
recovery boundaries. It does not equate an HTTP abort with native termination.
The inventory retains unresolved discoveries and assigns only the two intended
additional entries. This is a straightforward extension of the established
loader rather than another config source.

## Independent evidence

All raw outputs below are in the same independent evidence directory.

- Original loader, input-limit, result/deadline HTTP, journal, Control-config and
  Helm tests: **174/174 passed**, no skips, in `original-tests.txt`.
- The initial combined run passed 172 but failed both journal cases because this
  Alpine host's absolute `/usr/bin/flock` was BusyBox and did not support the
  required option. `original-tests-busybox-flock-failure.txt` preserves that run.
  The complete rerun bound the cached real GNU flock using Proot; no fake root,
  lock stub or journal change was introduced.
- `adversarial.mjs` rejects four empty legacy overrides, verifies invalid later
  author bytes fail new loading while preserving both existing snapshots, and
  uses the real transport against an oversized **unterminated** UTF-8 HTTP stream.
  The original byte-limit error occurs and the actual server observes client
  closure (`adversarial.txt`), rather than waiting for server completion.
- Two fresh isolated transport mutants are caught by unchanged original HTTP
  behavior cases: counting decoded characters instead of received bytes, and
  removing the fetch abort signal. Both fail with a missing expected rejection;
  there are no module-resolution or fixture-setup failures. Exact mutations,
  hashes and raw tests are in `mutations.txt` and `mutant-*.txt`.
- All six original Control test modules passed independently: **22/22**, no
  skips (`control-tests.txt`). Three Control-config cases overlap the 174-case
  group and must not be counted as distinct additional cases.
- Prism typecheck and canonical lint passed (`typecheck.txt`, `lint.txt`).

## Review finding and correction

The broader independent release run initially passed 14 and failed all eight
`deployment-release.test.mjs` cases at materialization: its fixture copied the
new canonical chart aliases into absolute symlinks and omitted the canonical
schema from the selected source commit. The production guard correctly rejected
that invalid fixture. The full failing output remains in
`release-tests-initial-failure.txt`.

The root agent corrected only fixture construction: preserve relative symlinks,
copy the actual canonical schema, and include it in the fixture commit. This
review inspected the diff and confirmed no assertion or production release guard
was weakened. The independent four-module release rerun then passed **22/22**
(`release-tests.txt`), including all eight corrected deployment cases. The root
agent found the same construction defect in the GitOps release fixture and made
the equivalent correction, again preserving all assertions.

The independent original GitOps release suite also passed **6/6**, no skips
(`gitops-release.txt`). Canonical lint passed for both corrected fixture files
(`release-fixture-lint.txt`). Both fixture sources are included in the final
snapshot inventory.

**Accepted for CR01–CR07 and CR-DOC within the documented local proof boundary.**
The release-fixture findings are resolved. No full CONFIG, image-build, native
supervisor/kernel or live-cluster completion is claimed. The original register
status remains unchanged.
