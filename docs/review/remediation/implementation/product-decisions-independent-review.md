# Human product decisions — independent source and local gate review

Reviewed 2026-09-09 across `wave47-product` (Prism), `wave48-product-controller` (Go/CRD), and `wave47-product-chart` (Prism chart). Reviewed source hashes and independently executed logs are in `../../evidence/wave48-product-independent/`. This is a bounded local review, not a native operator/cluster acceptance. No production authority values, deployment, CI, or external messages were used. The reviewer did not edit the implementing agents' source.

## Result and corrected findings

The reviewed local authority, signature, storage and Prism chart gates pass after the following early findings were corrected by their owners. A subsequent root review identified a material CRD installation risk: the nested full-record history comparison can have excessive static CEL cost even while product decisions are disabled. The source now uses bounded UUID membership plus immutable map-item rules; native CRD compilation/acceptance remains required before claiming that schema change is installable.

- Go's standard JSON struct decoder accepted case-insensitive aliases despite the duplicate-key walk. Exact allowed field names and null rejection now precede typed decoding; actual signed-wire regressions pass.
- Prism extension receipt comparison lost Go's fractional nanoseconds, and its SQL replay comparison compared nested envelope object identity. Fraction-preserving whole-second addition and deep receipt/envelope equality now pass actual regression tests.
- Controller ingress selected a nonexistent Prism pod label. It now selects the actual `app: prism-control` inside the explicit producer namespace.
- The CRD field-local history rule did not prevent removal of the optional containing field. A root presence transition rule now covers removal of product history. Cleanup deadline derivation follows validated expiry links independently of list-map ordering. Admission and CEL cost are still unproved on a real API server.
- Studio could discard another pending decision when recovering an older applied receipt, or forget an original intent when leaving an unresolved request that never reached SQL. It now clears only the matching decision, archives unresolved IDs/intents before clearing the active slot, and requires a fresh subject before another deliberate decision. No browser execution is claimed.
- Prism chart allowed controller ports inconsistent with its fixed 8443 egress policy. The production chart now requires explicit HTTPS port 8443, with a negative real Helm case.

## Authority and recovery assessed

The signer derives the actor from an authenticated Prism session and an explicit operator allowlist. New mutations require the configured exact Origin and existing CSRF cookie/header check; Studio now forwards Origin. Product authority is disabled by default. Its private Ed25519 key is mounted only into Control from a separate Secret; the projected audience-scoped service account token is transport authority, independently checked from the human issuer/signature and actor policy.

The wire signs exact payload bytes under a dedicated domain prefix. Controller verification binds the current lease UID, source/candidate/result/Ready digests, generation, resource version and deadline. Live Ready source verification and resource-version CAS precede a new write. Acceptance preserves TTL; extension adds the explicitly signed seconds to the exact previous deadline and preserves Ready. Exact recorded replay precedes new-apply expiry checks. Changed replay conflicts. Product history is included in cleanup fencing, so a stale cleanup observation cannot silently supersede an extension through the reviewed writer.

Prism persists the original envelope in SQL before transport, retries identical bytes, and records Applied only after an exactly matching receipt. A status miss does not prove no in-flight apply; unresolved outcomes remain unresolved. SQL audit survives lease removal, but an applied receipt lost before SQL persistence and then removed with the lease cannot be reconstructed from nonexistent controller history. Neither UI nor review calls that uncertainty a confirmed failure.

The existing Studio identity boundary still relies on the actual Tailscale proxy path and effective network isolation. Official [Tailscale Serve identity documentation](https://tailscale.com/docs/features/tailscale-serve#identity-headers) specifies replacement of incoming identity headers and warns that direct backend access permits header spoofing. This supports the design, not proof that the installed Kubernetes ingress and network policies enforce it. Tagged devices do not supply a human identity; the explicit allowlist also matters for shared external users.

## Independently executed gates

| Command and working tree | Exit | Evidence and precise scope |
| --- | --- | --- |
| `PRODUCT_TS_EXPORTER=/workspace/scratch/0d8f8ddb55c3/wave47-product/skills/prism/tests/export-product-vectors.mts /workspace/scratch/4e25cf57c177/toolchains/go/bin/go test ./cmd/buster-namespace-controller -run '^TestProduct' -count=1 -v` in controller tree | 0 | `go-product.txt`: real TypeScript Ed25519 signer to native Go verifier; signed-wire negatives, source/expiry/RV/replay and cleanup contracts. Existing HTTP fixture supplies API responses; this is explicitly not native Kubernetes TokenReview/CAS/Admission. |
| `node --experimental-strip-types --test skills/prism/tests/product-decisions.test.mts` in Prism tree | 0 | `prism-product.txt`: four tests, no skips. Real session/signature, original Studio proxy/HTTP handler, disk-backed PGlite reopen, append-only SQL privileges, nested receipt and nanosecond comparison. PGlite is not a native PostgreSQL server. |
| `node --experimental-strip-types --test skills/prism/tests/product-controller.test.mts` in Prism tree | 0 | `prism-tls.txt`: actual OpenSSL-generated certificate and HTTPS client, CA verification, reread rotated token, error/size/header rejection. Diagnostic HTTPS endpoint is not controller admission. |
| `PATH=/workspace/scratch/4e25cf57c177/toolchains/bin:$PATH node --test tests/verification/deployment/prism-product-decisions.test.mjs` in Prism chart tree | 0 | `prism-chart.txt`: three tests, no skips. Real Helm disabled/enabled/invalid render checks and rotation checksum; no running pods or policy enforcement. |

An initial reviewer Helm invocation replaced PATH and failed to locate Node (exit 127); preserving the existing PATH fixed the command. No passing gate relied on that failed invocation.

## CRD cost follow-up

The official [Kubernetes transition-rule documentation](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/#transition-rules) supports correlating items under `x-kubernetes-list-type: map` for immutable-item rules; parent rules must cover removal of optional containers. Its [validation resource-use documentation](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/#resource-use-by-validation-functions) confirms that excessive estimated rule or total cost rejects CRD installation, and that collection/string bounds affect that estimate. No native apiextensions/CEL compiler dependencies or API-server binary were found in the current or previous scratch/toolchain trees or `/root/go/pkg/mod`. Source/Helm checks do not establish this native gate.

The final follow-up was independently read: membership compares only strict lowercase UUIDs bounded to 36 characters, correlated map items are immutable, and every compared receipt string has an explicit length bound, including enums and timestamps. `go-product-cost-followup.txt` records the same real TypeScript-to-Go command rerun after this change: all five product test groups pass, including the new non-UUID negative. That rerun establishes Go wire compatibility, not CEL compilation or API-server cost acceptance. Current source hashes include this follow-up. Prism source commit is `2eebb88`; its final bounded plaintext controller-error projection was also read and does not convert an uncertain result into a claimed failure.

## Original acceptance remains bounded

Original `source_finding_text` was read for T01-F02, F-T14-01 and F-T14-02. This slice implements the previously missing human decision writer and its durable product state; it does not close their complete product-lifecycle acceptance by itself. The original two-module source-bound graph/complete delivery obligation, actual application login and authorized operator feedback, denial of another Tailnet user and stale generation, post-plan reachability and exact-generation release/TTL require their original evidence. Native API-server CRD/CEL acceptance and cost, concurrent CAS/TokenReview, actual Tailscale ingress isolation, and a real browser recovery journey remain unproved here. No new generic deployment requirement is imposed on unrelated findings.
