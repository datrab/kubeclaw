# Namespace-controller selected policy — 2026-10-16

13 previously confirmed original rows are wired, exact IDs in field-mapping.json.
This bounded current-deployment change does not activate the denied v10 proposal,
complete its other controller policy fields, or establish C0–C6 acceptance.

## Operator and developer contract

The sole production author for these thirteen values is
`charts/kubeclaw/values.yaml#/busterNamespaceBroker/controller/policy`.
Helm transports that complete JSON object in the controller-policy ConfigMap,
mounts the directory read-only and sets `BUSTER_CONTROLLER_POLICY_FILE` to its
JSON file. The checksum annotation triggers a new controller rollout after a
policy change. Existing service configuration outside these thirteen fields
remains unchanged; this is not a claim of controller-wide default removal.

Standalone controller launches must provide the same explicit file locator.
No image fallback, embedded policy, per-setting ENV override, CWD search or
in-process default is used. The local testdata JSON is a test author only.
Go loads once before Kubernetes setup or listener side effects and rejects
missing/partial/unknown/case-aliased/duplicate keys, extra JSON, nonintegers,
nonpositive values, duration overflow and unsafe/platform-overflow byte sizes.
A running instance retains its captured selection; no hot reload or per-request
read of the current file. Keep actual secret bytes out of this policy.

Selected fields drive the actual listener, Ready/Product handlers, TokenReview
authorization header ceiling, observation age and product admission validity.
New Ready admissions capture their effective retention in the original v2 status.
Persisted v2 reads never use current policy; only historical v1 without its field
retains fixed seven-day compatibility. Exact durable product receipt lookup
precedes the current validity window, so B cannot invalidate accepted A replay.
Explicit request retention remains the original task surface and is not silently
overwritten. All original cases and lifecycle assertions remain intact.

## Verification

- Final Go suite: 118 passed test/subtest events, zero failed/skipped. Nested
  counts overlap; not 118 independent top-level acceptance obligations.
- Normal Buster image/role generation + full kubeclaw chart delivery: 5/5 tests,
  including real A60/B120 ConfigMap bytes, read-only mounts, rollout checksums
  and original Go HTTP consumer invoked on both delivered files.
- Native-product build-tag constructor compiles with `-run ^$` only. No native
  API/storage/Docker execution is claimed.
- `git diff --check` passed. Source identities in source-manifest.json.

Initial logs are retained: the older buster-readiness-config suite still has
retired busterComponentFile fixtures and a missing Prism config path; it was not
reported as passed. The first current delivery attempt correctly rejected stale
checked-in topology paired with new generation receipts. Its fixture now uses
the normal busterChartProjection producer on a private chart copy; no generation
checks disabled and no invented delivery receipts. Final current delivery passes.

## Open acceptance and next work

Fresh independent review of this batch is OPEN. No native spawn/review tool was
exposed in this scheduled runtime. The last direct-review surface initialization
failed EROFS; unchanged retry was not repeated. Prior Review-grade reviews do not
accept this new batch. Full native and historical C0–C6 acceptance stays OPEN.
Next: obtain fresh review, reconcile the other controller production literals
against their existing approved deployment definitions, then continue the
repository-wide source/owner/consumer reconciliation. Do not replay the completed
228 Review rows, count unchanged central JSON as residuals, or promote v10.
No deployment, main merge, production-host change or paid Eval performed.
