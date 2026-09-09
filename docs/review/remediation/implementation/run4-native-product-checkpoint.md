# Native Product gate — incomplete checkpoint

Official envtest v1.35.0 linux-amd64 release downloaded through ordinary HTTPS.
Archive: 52,314,948 bytes; SHA256
`5716719def14a3fec3ed285e5e8c4280e6268854039b5073a96e8c0adafb1c02`, matching
fresh official GitHub release metadata. Executed binaries report Kubernetes
v1.35.0 and etcd3.6.6. This is not a claim about a production server version.

`tests/verification/integration/product-native-api.mjs` starts only disposable
loopback etcd/API processes with private temporary TLS/token/config/data. It
never reads existing kubeconfig and never installs workloads. All children are
terminated and reaped; temporary credentials/data are removed in cleanup.

Actual controller source at remote
`e21a2998f8b0e39b60705dfd8bbd6855452a0395` was compared to cached committed
chart/controller files: all 53 source blobs matched. The original Buster values
blob `ca8638c8ce002fec2ac2b68c53a2bcf4f9e36f51` also matched. Those exact
sources were extracted into this run's isolated native-source fixture. The
registry.render-test value is only the existing Helm contract's render input;
no registry/network/workload connection is made.

First two runs reached genuine API readiness but original Helm guards rejected
incomplete harness values. Their server/cleanup evidence remains in
`docs/review/evidence/run4-native-product{,-install}`. The corrected run in
`run4-native-product-admission` reached `/readyz` HTTP200, submitted the unchanged
original rendered CRD to the native API, received HTTP201, and observed
Established. Thus the actual native structural/CEL compile/static-cost install
gate succeeds on v1.35.0; there is no source-rule replacement or cost bypass.

This is **not complete or independently reviewed**. Next: native original CRD
`/status` append/removal/immutable-entry/boundary/CAS matrix, then original
signed controller transitions against native persisted resources; verify
companion chart47b/Product459 changed blobs and overlaps in the isolated fixture.
Do not integrate the coupled package or close findings from this install-only
checkpoint. No production code changed.

Run (from a combined current checkout, with verified binary directory):

```sh
KUBEBUILDER_ASSETS=/path/to/controller-tools/envtest \
HELM=/path/to/helm node tests/verification/integration/product-native-api.mjs
```

`NATIVE_CHART` and `NATIVE_EVIDENCE_DIR` optionally select the isolated exact
source chart and a unique run evidence directory; do not overwrite older logs.
