# F-T14-01/02: human acceptance/extension reconciliation

Run `20260910t080401` began from remote repair head
`1ba445125fbacfa4f0344f8bf38e68f8f0686eff`, tree
`692a57a387d823d4b6636062e90dfbbeb07d28cd`. The isolated checkout uses the
same tree under local graft `5d8207712dc52f48e8860dc9530b77d085cb1094`.
The frozen 47 IDs were derived again from remote commit
`c38779c71bb92bc15c3fcb89930348e5417aa475`; they exactly equal
`partial-47-scope.json`, and the original finding texts are unchanged. Only
F-T14-01 and F-T14-02 are assessed here.

## Result

The statement in the older work-item checkpoint that the human extension
authorizer is missing code is stale. The subsequently integrated coupled
Product/controller/chart package supplies it. No production source was changed
in this checkpoint.

The current original Control listener composes the product authority before the
existing service. Session creation accepts a Tailscale login header only when the
private ingress secret matches. With Product enabled it also requires the exact
configured HTTPS Origin. A decision mutation then verifies the HMAC session,
finite session expiry, exact operator allowlist, Origin and CSRF cookie/header.
Control signs the current lease/source/candidate/result/Ready/generation/
resourceVersion/expiry subject using its separate Ed25519 authority, with a
decision lifetime no longer than 300 seconds or the session lifetime. It inserts
the exact normalized intent and envelope into append-only SQL before bounded
HTTPS transport and recovers the identical envelope after an uncertain result.

The integrated controller independently authenticates the Prism service account,
verifies issuer, actor and signature, re-reads the current Ready subject, performs
resourceVersion CAS, preserves Ready, and applies either acceptance with unchanged
expiry or an explicitly bounded extension. The coupled root evidence already
contains the genuine Kubernetes 1.35 CRD/CEL/TokenReview/CAS regression: accept,
restart replay, changed replay rejection, exact +60 second extension, immutable
Ready, and stale-cleanup rejection. This run did not touch Product, controller,
CRD or chart source, so it did not manufacture a second native claim.

## Current execution

From the fresh isolated checkout:

- `node --test --test-concurrency=1 skills/prism/tests/control-product-independent.test.mts skills/prism/tests/product-decisions.test.mts skills/prism/tests/product-controller.test.mts skills/prism/tests/studio-proxy.test.mts skills/prism/tests/control-product-composition.test.mts`: exit 0, 16/16 passed, zero skips. This uses the original Control composition, HMAC session exchange, exact Origin/CSRF/allowlist policy, Ed25519 signing, disk-backed PGlite reopen, immutable intent/recovery, real local TLS/CA verification and rotated token reads. The controller endpoint in the persistence case is deliberately unavailable; the test proves safe pending/recovery, not controller success.
- `./node_modules/.bin/tsc -p skills/prism/tsconfig.json --noEmit`: exit 0.
- Focused Product authority ESLint over the signer, Control composition adapter,
  controller client, product wrapper/page, Studio proxy, storage and four test
  files: exit 0.
- A first broader lint invocation additionally included the pre-existing
  992-line `control-server.ts`; it exited 1 on 25 existing whole-file
  complexity/length findings. The exact failure is retained. The Product-owned
  focused lint above passes and this checkpoint does not relabel the broader
  baseline as a Product regression.

Raw output and source reconciliation are under
`docs/review/evidence/run-20260910t080401-human-extension/`. The authoritative
Product signer/wrapper/client/storage, controller Product source and CRD, and
dedicated Prism Product chart templates match the independently reviewed hashes.
Three shared composition files have later repository changes, and the current
original-component tests cover their present composition; no unchanged-hash
claim is made for those shared files. Go and Helm are unavailable in this fresh
isolated checkout. Because no coupled production source was changed, this run
retains and hashes the already independent/root native evidence instead of
repeating an unchanged infrastructure prerequisite or relabeling archived output
as a new execution.

## Exact remaining boundary

Both findings remain `implementiert` and `teilweise / blockiert`. Local headers
are not a real Tailscale Serve identity event; PGlite is not deployed PostgreSQL;
seeded Ingress/delivery records are admission fixtures; local TLS is not a live
controller deployment. No application, Tailnet, recipient or human was contacted.

Closure still requires one authorized original full-pipeline run proving all of:

1. the source/image/lease/generation/URL/auth/expiry delivery contract reaches a
   real application with its generated secret actually bound to login;
2. the allowed Tailnet operator receives the private handoff, reaches and logs in
   to that exact generation, and submits authenticated feedback;
3. another Tailnet user and an old preview generation are rejected;
4. the retained namespace and exposure remain reachable for the operator period;
5. explicit release or TTL removes exactly that generation after the extension.

Those steps require deployment, real Tailnet identity/routing, a real recipient
delivery and human interaction, all explicitly outside this run's authority.
They must not be replaced by local identity headers, schema fixtures, static
traces or a successful partial test.
