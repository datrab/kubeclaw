# Immutable release evidence correction and remaining IFR-19 protocol gap

Base integration commit `268bb72`. No cluster/network/CI/image build or deployment
was performed. IFR-19-001 remains partial.

## Concrete acceptance-validator bug corrected

`scripts/updates/release-images.mjs` accepts only immutable
`ghcr.io/<owner>/kubeclaw-<name>@sha256:<64 lowercase hex>` build receipts.
`deployment-release.mjs` requires the same immutable form in selected releases.
However, `tests/verification/live/check-prism-release-evidence.mjs:23` previously
required tag-shaped references and explicitly rejected `@sha256:`. A correct
selected release was therefore rejected by the final evidence validator, while
a mutable tag could pass that identity check.

The actual caller is root `verify:prism:production`. The original live service
runner copies configured PRISM_E2E_IMAGE_REFERENCES into its report without a
tag-only conversion. No independent tag-only protocol purpose was found. The
narrow correction requires canonical immutable receipt references for both
expected input and signed evidence. HMAC canonicalization/signature verification,
issuer, commit binding, distinct clean runs and all seven required gate checks
remain unchanged. No fallback to tags or digest-kind conversion was introduced.

The new test invokes the actual CLI validator on explicitly labelled signed
**contract fixtures**, with a test-only key. The positive reference is produced
through the original collectReceipts helper. These fixtures are never saved as
native acceptance evidence and make no claim that GitHub Actions or a cluster ran.

The exact final test on unchanged base source gives three failures: valid
immutable reference rejected; mutable tag accepted; and downstream missing-gate
error masked by the digest rejection. With the correction, all **5 tests pass**.
They also check malformed/different digests, signed-body tampering, inconsistent
clean-run identities and missing required gate evidence. Canonical lint passes.

```sh
node --test tests/verification/deployment/prism-release-evidence.test.mjs
node node_modules/eslint/bin/eslint.js --config charts/kubeclaw/files/config/eslint.config.mjs tests/verification/live/check-prism-release-evidence.mjs tests/verification/deployment/prism-release-evidence.test.mjs
```

This fixes only input-contract compatibility. The validator authenticates the
configured evidence envelope; it still does not itself observe a live pod or
establish OCI descriptor ancestry.

## Why no complete live imageID/bundle gate was fabricated

The current build receipt records name/image/commit. Release aggregation adds
sourceRunId/sourceRunAttempt and a map of image references. Buildx publishes
with provenance and SBOM enabled. The stored receipt has no descriptor media
type or authenticated mapping from an index digest to platform manifest and
configuration digest. Thus the protocol does not identify which digest kind a
runtime-reported imageID represents or establish its relation to the receipt.
String equality across these identity kinds is not a valid generic proof.

Required missing evidence for a correct future comparator:

1. Digest-verified OCI descriptor closure from selected subject through the
   actual node platform's manifest to image configuration, with media types,
   raw-byte hashes and unambiguous platform selection. A supplied mapping alone
   must not be trusted. Preserve the existing authenticated release selection.
2. Fresh actual pod and node observations identifying namespace/pod UID,
   container name and instance ID, restart count, spec image, reported imageID
   and platform. Define the actual runtime imageID interpretation before
   matching it to the verified descriptor graph. Reject missing, ambiguous,
   stale/replaced or mismatched observations.
3. A defined observation of the active code bundle bound to that same container
   instance. Desired CODE_BUNDLE_EXPECTED_COMMIT in Pod env is not the observed
   active commit. Current chart code reads
   `/runtime-config/code-bundle-manifest.json`, checks role/commit/contract during
   health/startup, and copies the manifest during bundle activation
   (`charts/kubeclaw/templates/deployment.yaml:741-743,876-890,1057-1081`).
   Ordinary `kubectl get pods` does not return that file. No existing structured
   live release collector combining it with the selected receipt was found.
4. An explicit capture/recheck freshness boundary so a pod/container restart or
   bundle transition during observation cannot produce a mixed successful proof.

Existing deployment scripts run health/smoke commands, and deployment-release
checks rendered desired slots/bundle controls. Neither is the complete actual
imageID plus active-bundle comparison. The current checkout also has no selected
`releases/runtime-images.json`; no values were guessed to manufacture selection.

A future read-only collector may use authenticated runtime/registry observations
once those protocols are defined, but this task did not issue kubectl, fetch
registry metadata, read a live bundle, or change any infrastructure. No native
success is inferred from the local contract fixtures. A machine-readable gap
inventory and before/after command evidence are retained alongside this report.
