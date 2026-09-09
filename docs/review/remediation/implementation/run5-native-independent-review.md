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
and maximal-valid-envelope runtime CEL boundaries were pending at this first
checkpoint and are independently covered by the follow-up below. Signed
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

## Independent capacity follow-up

Imported only frozen author `459ce0e308fe35f332a5752e18cf9a210e06f406` and
reran the complete native harness at local `0418f06` with evidence directory
`docs/review/evidence/run5-native-bounds-independent`. Exit 0, no skips. The
unchanged native API admitted and returned all 128 records intact, accepted a
full oldSelf equality replay, and rejected a 129th record with HTTP422. A
separate maximal-valid-record vector retained 1,024-character lease/actor/issuer
fields, maximum safe-integer generation, and 10,924-character envelope payload;
its exact native CEL replay passed. The existing 10,925-character rejection
remained enabled. These are count and individual-record boundary checks, not a
claim that 128 simultaneously maximal records fit the default storage byte cap.

No product authority, Tailscale delivery, or full coupled integration conclusion
is inferred from these schema vectors. The signed controller/native storage
extension was pending here and is covered by the corrected follow-up below;
the full fresh combined Product/controller/chart regression remains the next
integration action.

## Corrected independent signed-controller/native-storage review

Frozen author `59498a93758d24101de6fead097d81303955fb41` was independently
run at local `d8ba256` with `NATIVE_CONTROLLER=true` and the original Go toolchain,
otherwise the same complete native harness command. Actual exit 0 after cleanup,
zero skips. Raw evidence is in `run5-native-corrected-independent`.

Review found that the initial `expired` test vector had a 59-minute validity
window and therefore reached `DEMO_PRODUCT_TIME_INVALID`, not the claimed
expiration guard. The author preserved the actual sharpened-assertion failure
in `run5-native-expiry-before`, then used a valid one-minute interval entirely
in the past and asserted the exact fixed code for every negative. Independent
rerun observes `DEMO_PRODUCT_DECISION_EXPIRED`; no assertion or production gate
was weakened. Initial independent baseline raw remains separately archived.

The original controller handler now independently traverses genuine native
ServiceAccount TokenReview, random Secret creation with original credential
intent and proof, real signed Product requests, native resourceVersion CAS and
persisted readback. Foreign identity, signature, source, generation, revision,
actor and valid-expired-window negatives return their exact errors without
changing the native Lease version. Accept preserves expiry; recreated original
handler replay retains the same version; changed same-ID request rejects.
Extension adds exactly 60 seconds, preserves Ready bytes and blocks a stale
cleanup observation. A real forwarding proxy drops a successful native status
PATCH acknowledgement only after the API actually returns 200: original handler
reports uncertainty, and recreated-handler replay recovers the exact committed
receipt without another extension or resourceVersion change.

The proxy forwards original API bytes and is fault injection, not a replacement
Kubernetes backend. Outbound controller API operations use the private test
admin credential; this is not a claim of deployed controller-SA RBAC. The
separate IFR-18 matrix does use the original rendered controller SA and RBAC.
Seeded Ingress status and explicitly labelled delivery receipt are admission
inputs, not actual Tailnet, application login or human-delivery evidence.
Handler recreation is not an OS-crash claim. The original Go test signing
helper is used here; existing original TypeScript signer/SQL regression must
still be included in the final combined candidate.

The frozen native fence, structural/CEL install, status/capacity, and corrected
signed-controller/native-CAS package is independently approved at this stated
boundary. Full Product459/Controllere21/Chart47 source reconciliation and
combined original suites against a fresh repair head are still required before
coupled integration. No all-47 completion is claimed.
