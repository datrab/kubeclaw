# Native namespace fence and coupled Product CRD status

Status: author-tested, not yet independently reviewed. This is not whole Product
delivery, Tailnet, app authentication, human acceptance, or all-47 completion.

Fresh integration source: remote `4627f01fe532d3dd890b7c8f93df40ae59547071`,
all 3,354 Git blobs and modes checked against the fresh untruncated remote tree.
Fresh mandatory resume documents and original IFR-18-001, F-T14-01/02 and T01-F02
requirements were read. Nine coupled Controller/chart delta blobs are exact
remote `e21a2998f8b0e39b60705dfd8bbd6855452a0395`; none changes production code.
The separate chart package `47b392dc2aa36cb37fdbd8f63b1a6f10a1823973` contains no
additional kubeclaw chart delta relative to this integration source. Product
Control package `459eaf9779a6bf735a1420cc12b5d98f276f45b3` remains coupled and is
not installed or silently integrated by this test.

Official original binaries: controller-tools envtest v1.35.0 linux-amd64 release,
52,314,948-byte archive, SHA256
`5716719def14a3fec3ed285e5e8c4280e6268854039b5073a96e8c0adafb1c02`.
Release metadata was freshly fetched; the archive hash rechecked and executables
extracted into this run's own directory. API server and etcd listen only on
127.0.0.1, with private disposable certificates, authentication and RBAC.
No existing kubeconfig, remote cluster, Deployment, Pod, workload, CI or paid
resource is used. Every child is terminated and reaped, as cleanup.json shows.

Command (toolchain and asset paths configurable):

```
HELM=/path/to/helm KUBEBUILDER_ASSETS=/path/to/envtest \
NATIVE_EVIDENCE_DIR=docs/review/evidence/run5-native-matrix-4 \
node tests/verification/integration/product-native-api.mjs
```

Author result: exit 0, no skips. Raw files are in the evidence directory above.

- Original Helm CRD accepted 201 and Established by native Kubernetes v1.35.0;
  CEL cost admission succeeds, not an inferred/static rule check.
- Two alternative installation namespaces and prefixes, sequential original
  configurations. Original chart SA, ClusterRoles and binding; genuine
  TokenRequest/TokenReview authenticated each alternate controller identity.
  Only safe identity/RBAC resources selected; rendered Deployment never applied.
- Original VAP and binding installed. A specific native policy denial is the
  admission cache readiness barrier, followed by allowed real namespace CREATE
  and DELETE, denied wrong-prefix/missing-label CREATE, and denied control
  namespace DELETE with unchanged control namespace. Denial is native HTTP 422
  Invalid, not an assumed generic 403. Both object and oldObject paths execute.
- Original role-derived cluster binding name is shared; test configurations are
  sequential, not simultaneous multi-release compatibility. The previous own
  binding is removed before the second installation configuration.
- Original CRD status retains every schema-vector receipt field; stale CAS409,
  product removal, receipt removal/mutation, changed subject, duplicate IDs and
  oversized envelope all reject (422 for schema/CEL) without resourceVersion
  change. Valid append and exact replay succeed. Receipt payloads explicitly
  label themselves schema vectors, not signed human acceptance or delivery.

Failed author attempts 1–3 are preserved. They exposed only test harness issues:
kubectl emits concatenated JSON for multiple YAML documents; VAP defaults to
Invalid422; DELETE JSON needed explicit Content-Length to preserve keepalive
framing. No native assertion or production contract was weakened.

Next: independent rerun of exact native IFR-18 and status matrix; separately add
genuine signed original-controller transitions against the same native API.
Legacy installed global-policy migration and full Product/Tailnet acceptance are
not established by this checkpoint. Keep coupled Product packages unintegrated
until the documented full coupled gate is independently accepted.
