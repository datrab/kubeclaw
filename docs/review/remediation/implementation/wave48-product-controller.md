# Product decision controller — wave 48

Base: d53947b. Controller/CRD/chart implementation; Prism signer, session gate, SQL ledger and UI belong to the parallel Product decision slice. No deployment, CI or operator configuration was changed. This does not close native Kubernetes, browser or PostgreSQL acceptance findings.

## Authority and wire

The existing internal TLS Ready listener gains POST `/v1/demo-product/subjects`, `/decisions` and `/status`. Product decisions default disabled. Enabling requires an explicit audience, a separate transport ServiceAccount, an explicit human issuer, raw Ed25519 public key (standard base64) and nonempty actor allowlist. No operator values are supplied by defaults. TokenReview authenticates transport only; every mutation additionally requires the dedicated issuer's signature and allowed actor. The corresponding Prism private key belongs only to its control server. Chart ingress matches the actual `app: prism-control` label in the explicitly configured producer namespace.

Envelope v1 has exactly `schemaVersion`, standard-base64 `payload`, and standard-base64 `signature`. Ed25519 verifies UTF-8 `kubeclaw.demo-product-decision.v1` followed by NUL followed by the unchanged payload bytes. Envelope input is bounded at 16 KiB; decoded payload at 8 KiB. No Go JSON recanonicalization participates in the signature. Duplicate keys, case aliases, unknown fields, explicit nulls, trailing values and invalid UTF-8 are rejected.

Payload `demo-product-decision.v1` has issuer, actorId, decisionId, action (`accept` or `extend`), reason, leaseName, leaseUID, sourceRevision, candidateDigest, resultDigest, readyDigest, generation, expectedExpiry, expectedRevision, issuedAt and expiresAt. Only extend has extensionSeconds. UTC-second issuance/expiry permits at most 300 seconds; the subject's RFC3339Nano expectedExpiry is preserved exactly. Positive extension seconds have only the existing arithmetic bound 9,223,372,036; there is no new operational policy cap. The displayed old expiry plus the signed exact seconds uniquely fixes the requested later expiry including fractional nanoseconds.

Subject discovery verifies original Ready namespace/ingress/credential checks and exact current lease generation, immutable Ready generation, source/candidate/result digests, Ready request digest, resourceVersion and deadline. A stale subject cannot be silently refreshed into a different human decision. Accept does not extend TTL. Extend never rewrites immutable Ready/readyAt. Expired, deleting, stale-generation and stale-resourceVersion new actions fail closed.

## Atomic state and recovery

A single original resourceVersion status PATCH stores the decision receipt, unchanged signed envelope and resulting deadline. The bounded append-only `status.demoProduct.decisions` history retains all IDs; at 128 records admission fails rather than evicting replay authority. Exact ID+payload digest returns the recorded receipt without another mutation; changed payload under the same ID conflicts. Authenticated status lookup requires lease UID, decision ID and payload digest and preserves historical acceptance even after namespace expiry. It is a historical receipt, not a claim that the demo is still live.

The existing cleanup deadline follows persisted extension links independently of list-map array ordering. Ready-state CAS comparison now includes Product history, so an expiry/cleanup operation that observed state before extension cannot expire the newer lease. Existing namespace/exposure/credential cleanup remains unchanged and does not remove the historical receipt from the retained lease status. If the lease object itself is explicitly deleted, its status is no longer an archive: Prism's durable ledger remains the external history, and an unresolved commit cannot be invented after both its authoritative receipt and response have disappeared.

CRD structural fields preserve receipts/envelopes; the root transition rule forbids removal of recorded Product history, subject binding is immutable and list entries are append-only. Native API admission/CEL cost validation is still required; Helm rendering is not an API-server admission proof.

## Verification

Evidence: `docs/review/evidence/wave48-product-controller/`.

- `controller-final.txt`: all 55 top-level original Go controller tests pass, including 5 new Product groups and their subcases. Product tests cover exact subject fields, actor/issuer/signature/transport rejection, resourceVersion conflict, TTL preservation, fractional extension, immutable Ready, uncertain response after applied PATCH followed by a newly constructed controller, one-apply replay, changed replay, historical acceptance and stale cleanup fencing.
- `product-interop-initial.txt`: original TypeScript signer executed in a child process; actual Ed25519 signatures for accept and extend verified by Go, exact decoded payload compared, payload tampering rejected, fractional nanoseconds retained. Permanent Go test invokes `skills/prism/tests/export-product-vectors.mts` supplied by the companion Prism commit. In this isolated worktree the command uses `PRODUCT_TS_EXPORTER=/workspace/scratch/0d8f8ddb55c3/wave47-product/skills/prism/tests/export-product-vectors.mts`; after integration the default repository-relative path applies.
- `helm-contract-final.txt`: 3 original Helm contract tests pass, including opt-in authority, missing-configuration failures, retained CRD fields and matching the new ingress peer against an actual rendered Prism control Deployment. Initial failed render logs are preserved; missing explicit render-fixture image digests and database Secret were supplied, with no production values invented.
- `native-k8s-context.txt`: actual kubectl current-context exits 1, `current-context is not set`. There is no native TokenReview, Kubernetes storage/CEL admission or deployed cleanup claim.

Controller lifecycle tests use the existing explicitly labelled HTTP Kubernetes contract fixture. The production controller and real resourceVersion PATCH/readback algorithm run unchanged, but the fixture's API storage is not a native Kubernetes server. This limitation is not hidden by the native Go/TypeScript cryptographic success.

Independent reviewer `readiness` identified and prompted fixes for Go case-insensitive struct aliases, the actual Prism pod label, and parent presence/list-map history semantics before final review. No global finding/register status was changed in this slice.

## Follow-up: CRD cost and correlated immutability

Before integration, root identified that comparing complete signed-envelope records in nested old/new list scans multiplies their cost quadratically. The replacement checks old-ID presence using only the actual lowercase UUID decision IDs (36 characters, matching the existing Prism validator). A separate `self == oldSelf` transition rule on the list-map item prevents modification of a retained record. Parent history-presence protection remains. Every compared string, including timestamps, enum fields and the enclosing ready digest, has an explicit maximum length.

The [official Kubernetes CRD documentation](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/#transition-rules) permits transition rules beneath map-list parents because their elements can be correlated, and requires parent rules to detect removal. Its resource-use guidance explains bounds and nested-iteration costs. Applying those documented rules removes repeated full-envelope comparison; it does not constitute a measured CEL static-cost result.

`product-cel-boundary.txt` passes all 5 original Product test groups, including actual TypeScript signing and the new non-UUID rejection. `helm-cel-boundary.txt` passes 3 chart tests; it checks exact membership/item rules and walks every receipt string to ensure explicit bounds include all enum values. The real API-server/CEL compiler and its dependencies are not installed locally; no replacement validator or fake admission result was used. Native CRD installation/static-cost acceptance remains an explicit integration gate.
