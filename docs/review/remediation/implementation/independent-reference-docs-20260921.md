# Independent review of provider reference documentation

Date: 2026-09-21. Scope: eight changed pipeline-test-gate reference pages;
three project fields, seventeen diagnostic entries and the endpoint-name bound.
The reviewer did not implement these changes. This is a documentation accuracy
review, not acceptance of any remediation finding or live behavior.

## Evidence and method

Compared the actual diff against Playwright and Tailscale provider code and
project schemas, and the container-build, Kubernetes fixture, Lighthouse,
security-scan and process-input runtime implementations. Inspected the recorded
[before](../../evidence/implementation-baseline-20260920/reference-gates-before.json)
and [after](../../evidence/implementation-baseline-20260920/reference-gates-after.json)
results: the two presence checks go from failures to exit zero. Their presence
checks alone do not establish accurate semantics. No new runtime tests were
executed for this documentation-only review.

The three field defaults and bounds match the provider/schema: minimum executed
cases defaults to one and has a blocking floor of one; required titles use the
full suite/spec/project title, require exactly one matching executed case and
are not test selectors; retained Tailscale exposure requires the handoff phase
and positive generation and remains lease-bound. The 64-character endpoint-name
correction matches the project schema, even though a separate unused provider
constant allows 128 characters. Process prefixes are correctly identified as
prefixes rather than standalone emitted failures. Security corrections preserve
HTTPS/authentication and do not advise disabling verification. No remediation
status or production/live completion claim was added.

## Findings requiring correction

1. Kubernetes complexity entry incorrectly includes alias bounds. Alias count
   and cycles emit `KUBERNETES_FIXTURE_MANIFEST_ALIAS_LIMIT` and
   `KUBERNETES_FIXTURE_MANIFEST_ALIAS_CYCLE`. Parser depth/node failures are
   additionally wrapped in `KUBERNETES_FIXTURE_MANIFEST_PARSE_FAILED`; traversal
   failures can surface the complexity code directly.
2. Lighthouse invalid-evidence entry is too broad about malformed URLs. The
   named code handles malformed objects and absent/non-string request URLs;
   invalid URL strings instead throw from `new URL`. Describe the implemented
   checks precisely.
3. Required-test wording says executed failures always fail the result. The
   provider classifies expected failures and flaky/retried cases as passed;
   only cases classified failed necessarily fail the result. Preserve that
   distinction rather than implying all individual failed attempts fail it.
4. Build execution wrapper is not conditional on having no classified
   diagnostic. Build-phase launch/resource execution errors receive this
   wrapper even if the underlying message already has a code; completed
   nonzero BuildKit exits instead return an unsuccessful build result.

Outcome at initial review: changes requested for these four wording errors.
All were sent to the implementing agent. Other added entries match their
respective source checks within this bounded review.

## Corrected-state recheck

Re-read the four corrected pages against the same original runtime branches.
All four findings are resolved: complexity now distinguishes parser wrapping
and alias diagnostics; Lighthouse distinguishes URL shape from URL parsing;
Playwright explicitly describes expected/flaky execution classification; and
build errors distinguish the execution wrapper from completed failed builds.

Final bounded verdict: accepted for documentation accuracy of these additions
and the endpoint-name correction. This does not assert a full docs pipeline
pass, runtime correctness, live operation or closure of any remediation item.
