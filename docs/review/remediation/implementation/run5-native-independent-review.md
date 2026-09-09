# Independent native API review — bounded approval

Reviewed frozen author `d95a8bad14ff57d7c8478b5f21ba95735c63ddeb` in a separate
checkout over freshly read remote `4627f01fe532d3dd890b7c8f93df40ae59547071`.
All 3,354 base blobs/modes/types matched remote. The frozen original 47 IDs were
independently rederived and matched the scope file. The original IFR-18 text was
also checked against immutable infrastructure review `eac591fb`.

The nine restored controller/chart production delta blobs match fresh remote
`e21a2998f8b0e39b60705dfd8bbd6855452a0395` exactly. No production changes were
made by this reviewer. The original native binary archive checksum was compared
with fresh official release metadata, and every extracted executable was compared
byte-for-byte with its archive member; see `run5-native-review-binaries.json`.

## Actual independent execution

From this checkout at `fe0ab22`, ran:

```sh
HELM=/workspace/scratch/4e25cf57c177/toolchains/bin/helm \
KUBEBUILDER_ASSETS=/workspace/scratch/15fb596e6560/run5-envtest-assets/controller-tools/envtest \
NATIVE_EVIDENCE_DIR=docs/review/evidence/run5-native-independent \
node tests/verification/integration/product-native-api.mjs
```

Exit 0, no skipped cases. Original Kubernetes v1.35.0 and etcd 3.6.6 started
on loopback only. Actual API readiness, unchanged CRD HTTP201 admission and
Established succeeded, including the native structural/CEL install gate.

For each of two **sequential** alternate namespace/prefix configurations, the
original rendered ServiceAccount, RBAC, ValidatingAdmissionPolicy and binding
were installed in the private API. A real TokenRequest token authenticated as
that exact ServiceAccount through a real TokenReview. Namespace CREATE and
DELETE were admitted for the configured managed test prefix. Wrong-prefix and
unlabelled CREATE and control-namespace DELETE were rejected with HTTP422 and
the original policy message. The control namespace remained non-terminating.
The denied dry-run barrier established actual policy propagation before tests.
This establishes the originally requested IFR-18 alternative-SA admission
boundary; it is not only a static identity-string or mocked API check. DELETE
admission is proved, not namespace-controller finalization of deletion.

The status matrix ran against native persisted Lease objects: no producer-field
pruning, stale resourceVersion HTTP409, history/receipt removal and mutation,
subject replacement, duplicate identity and oversized envelope HTTP422 with
unchanged resourceVersion, then valid append and exact replay. These are explicit
schema vectors, not signed human decisions or application delivery receipts.

Raw evidence: `docs/review/evidence/run5-native-independent/` contains 38 fence
observations (including setup/readbacks), 18 status observations, native server
logs, rendered originals, versions and cleanup. These are not inflated test-case
counts. Both original server children exited and were reaped; their private
temporary data/config/TLS/token directory no longer existed after the run.
No existing kubeconfig was read. No Deployment, Pod or workload was installed.
The original Deployment was only rendered to derive its co-owned SA/RBAC.
No production cluster, CI, paid resource or third-party message was involved.

## Remaining coupled-package gate

This is bounded approval of the native fence/basic status matrix, **not** full
Product/controller/chart integration approval. Native 128/129 history capacity
and maximal-valid-envelope runtime CEL boundaries remain to be tested. Signed
original controller transitions against native storage are being extended
separately. The full combined Product459/Controllere21/Chart47 source candidate
must be reconciled against the latest repair head and its original Go, Product
and chart suites rerun before integration.

No claim is made about simultaneous Helm releases (the original cluster binding
name is shared), legacy-policy migration, actual Tailnet/browser/app login,
human receipt, deployed TTL cleanup, or complete T01-F02/F-T14 delivery. The
overall frozen-47 completion condition remains false.

## Remote continuation

The review-only backup intentionally contains no coupled production-source
changes. Reproduce against the frozen source/harness backup
`fix/resume-47-run5-native-d95a8ba` at
`26bf4eaf0829a439c550a64c1c5187ee0cbfa9ff`, not against the review-only branch
by itself. Native 128/129 and maximal-record follow-up work is separate from
this frozen first independent execution.
