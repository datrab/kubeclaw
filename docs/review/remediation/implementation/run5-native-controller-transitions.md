# Original signed controller transitions against a native API

Author source freeze: `5f11dab`; fresh integration base and official binary
provenance remain documented in `run5-native-fence-status.md`.
No production source was modified: coupled controller and chart files remain
the exact nine freshly verified `e21a2998f8b0e39b60705dfd8bbd6855452a0395` blobs.

```
HELM=/path/to/helm GO=/path/to/go KUBEBUILDER_ASSETS=/path/to/envtest \
NATIVE_CONTROLLER=true \
NATIVE_EVIDENCE_DIR=docs/review/evidence/run5-native-controller-final \
node tests/verification/integration/product-native-api.mjs
```

Author result: exit 0, no skips. The native Go suite runs only under its explicit
`native_product` build tag and fails if its private test configuration is absent.
All sources/dependencies resolve from this checkout; the loopback-only API and
etcd are reaped and temporary credentials removed in `cleanup.json`.

Established native boundaries:

- All original IFR-18 ServiceAccount/RBAC/VAP and CRD status/CEL cases from the
  prior checkpoint rerun successfully.
- 128 receipts are retained, full 128-entry oldSelf CEL replay succeeds, 129
  rejects. Max legal 1,024-character fields, generation 9007199254740991 and
  10,924-character payload survive storage and replay; 10,925 rejects. These
  are explicit schema vectors, not evidence of any external human decision.
- The original controller creates random immutable credentials in the actual
  native Secret API, with durable original intent and UID/resourceVersion proof.
- Real native ServiceAccount tokens for Nova, Prism and a foreign identity pass
  through original controller TLS handlers and actual Kubernetes TokenReview.
- Genuine Ed25519 signed requests traverse the original Product handler,
  subject verification, merge-patch CAS, native storage and persisted readback.
  Foreign-SA401 and wrong signature/source/generation/revision/actor/expired409
  leave the actual resourceVersion unchanged.
- Accept preserves TTL; recreated original controller/HTTP handler replays the
  exact receipt without a native write; changed same-ID payload rejects409.
  Extension adds exactly 60 seconds, preserves original Ready bytes, and rejects
  an owned stale cleanup observation without altering native state.
- A real loopback forwarding proxy transmits requests to the original API and
  closes the connection only after one genuine successful status PATCH body
  was received. It fabricates no response or persisted fact. The original
  handler returns `DEMO_PRODUCT_COMMIT_UNCERTAIN`; a recreated handler recovers
  the persisted receipt without applying a second extension or resourceVersion
  change. The raw output records exact observed API revisions.

Important boundaries: API Ingress load-balancer metadata and a clearly labelled
delivery receipt are seeded admission fixtures. No Tailnet route, workload,
application login, Discord message, human operator interaction, or full Product
delivery is claimed. Handler/object recreation is not an OS process-crash test.
Original TypeScript Control signer/SQL tests remain separately reviewed evidence;
this native test signs via the existing original Go test producer helper. A
production native PostgreSQL requirement is neither established nor invented.

The first signed-controller attempt incorrectly shallow-copied the stale lease;
later JSON decoding mutated the shared map in that witness. It is preserved in
`run5-native-controller/native-controller.txt`. The test was corrected to retain
an owned JSON snapshot before the extension, without changing production code
or weakening the stale-transition assertion. Final frozen-source output is in
`run5-native-controller-final/native-controller.txt`.

Status: author-tested, independent review required. Coupled Product integration
and any original finding closure remain root decisions after independent review.
Full F-T14/T01 and all-47 completion are not claimed.
