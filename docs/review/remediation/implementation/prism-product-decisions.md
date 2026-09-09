# Prism product acceptance and extension authority

## Scope and composition

This opt-in slice completes the Prism side of the human acceptance/extension writer for T01-F02 and F-T14-01/02. It must be integrated with the independently implemented controller/CRD verifier and both charts. It does not by itself close deployed Tailscale, Kubernetes CAS, or browser acceptance gates. D02/D06/D09 remain intact: Ready originates in Nova, human product decisions are separate from graph success, and generic Core has no demo-specific authority.

`server/control.ts` composes `productAuthorityHandler` before the existing Control handler. Disabled configuration returns 404 for product routes. Startup enabled without explicit complete configuration fails. Environment access remains in the existing `server/control-config.ts` adapter. `control/product-decisions.ts` loads a dedicated Ed25519 private key and explicit exact `session.user` operator allowlist; no default operators or keys are supplied. Controller and Studio origins must be HTTPS origins with no credentials/path/query/hash. The key belongs only to Control, separate from session/ingress secrets and service-account transport credentials.

The original HMAC Prism session issuer/verifier supplies the actor. Caller JSON cannot supply an actor or extra authority fields. The writer requires a nonexpired finite session, exact allowlist membership, CSRF cookie/header equality, and exact configured Origin for every mutation. Opt-in session creation also requires that Origin. The existing Studio proxy now preserves Origin. Tailscale identity is trustworthy only through the actual Serve header replacement plus restricted ingress/network path; the local session tests do not prove that external path. See [Tailscale identity headers](https://tailscale.com/docs/features/tailscale-serve#identity-headers).

## Closed controller contract

POST `/v1/demo-product/subjects` obtains current authorized subjects via dedicated projected service-account transport. The UI discovers run/lease/source/generation/current expiry without manual digest entry. No demo credential is included in the new subject/decision contract.

Envelope `demo-product-decision-envelope.v1` carries standard-base64 payload/signature. Signature input is UTF-8 `kubeclaw.demo-product-decision.v1` followed by NUL and the exact payload bytes. Payload `demo-product-decision.v1` binds issuer, session actor, UUID decision ID, accept/extend, reason, lease name/UID, source revision, candidate/result/Ready digests, generation, expected Kubernetes resourceVersion/expiry, issuedAt/expiresAt, and extensionSeconds only for extend. Signature lifetime is at most 300 seconds and never beyond the current session. Go independently checks its configured authority and allowlist plus current subject/CAS. The TS exporter in `tests/export-product-vectors.mts` uses the actual signer and fresh Ed25519 keys; the paired native Go test invokes this exporter and checks complete decoded payloads and tampering.

The original HTTPS client reads CA and projected token on each call, verifies TLS, uses a 15-second deadline and bounded response, and does not follow redirects. Fixed controller `DEMO_PRODUCT_*` diagnostic codes are retained without treating a rejection/status miss as proof that an ambiguous operation never committed.

## Persistence and recovery

Migration 015 adds separate immutable intent and receipt tables. Runtime grants are SELECT/INSERT only. Signed intent is inserted before transport; decision ID plus actor plus normalized intent digest fences conflicting submissions. Retries recover the exact persisted signature, never a fresh expiry. The controller status lookup precedes identical-envelope resend. Receipt fields, nested original envelope, and exact expiry must match the intent before Applied is recorded. Extension arithmetic preserves all original nanosecond digits. SQL history survives ephemeral lease/namespace deletion; if no receipt was ever recorded and the authoritative lease itself disappears, the outcome remains unconfirmed.

`/v1/product-decisions/operator` provides sign-in, current subject selection, accept/extend, own durable history, and recovery by original ID. Browser pending intent is retained before submission. Recovering unrelated historical B cannot clear pending A. An operator may explicitly leave an unknown decision unresolved; local ID/intent is archived before clearing pending, and the UI requires a fresh subject before another deliberate decision. It never automatically replaces an unknown decision or calls it failed. The previous intent can still be retried from local history if its original request did not reach SQL.

## Verification

Raw logs are in `docs/review/evidence/wave48-prism-product/`.

- `node --test skills/prism/tests/product-decisions.test.mts skills/prism/tests/product-controller.test.mts skills/prism/tests/studio-proxy.test.mts`: exit 0, six tests. Real session issuance/signing, original Studio HTTP proxy → original authority handler → on-disk PGlite persistence and reopen, unauthorized no-write, immutable replay/SQL permissions, nanosecond receipt contract, original TLS client against a real openssl-certified diagnostic HTTPS server, rotation/CA denial/status/body bounds, and existing cookie regression. The diagnostic HTTPS server is transport evidence, not a substitute controller or Kubernetes success.
- `npm run typecheck --workspace @kubeclaw/prism`: exit 0.
- Canonical ESLint over the new source/tests plus configuration adapter: exit 0. The existing Control monolith still has pre-existing lint debt; baseline had 53 errors and complexity 208, current wrapper preserves complexity 208 and removes one misused-promise callback error. No baseline or lint rule changed.
- Native actual TS exporter → Go verification is executed and documented by the paired controller implementation. No fabricated successful controller application is used in the Prism tests.

Native limits: PGlite is a real on-disk PostgreSQL-compatible SQL engine, not native deployed PostgreSQL. Actual Kubernetes TokenReview/RBAC/CAS, operator proxy/CNI header isolation, deployment key ownership, and real browser recovery remain separate gates. Chromium is absent and the earlier locked Playwright installer timed out; no DOM substitutes or repeated download attempt were used here. No CI, deployment, or external messages were triggered.
