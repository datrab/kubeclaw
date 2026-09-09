# Independent review — Product authority port into current ControlService

Verdict: **local source-port review passed; integration remains blocked by the coupled native gate**.
Reviewed author `4d93e5721fc99580ab4af6a3405f1d372a9a7ff6` on base
`c8dd0917f4f0eb53dd6719c657ff90578e697602`. This is not Controller/Chart approval,
not deployment approval and not closure of T01-F02, F-T14-01 or F-T14-02.

## Fresh authority and isolation

The reviewer freshly fetched main
`b284a15ebfa58c31688271c62d9bf1ea276fa2f0`, its original finding texts in the
register, and the durable package checkpoint. The checkpoint explicitly couples
Product `74e0cc0f848269e7e6b163c82253952f638682d7`, Controller
`e21a2998f8b0e39b60705dfd8bbd6855452a0395`, and Chart
`47b392dc2aa36cb37fdbd8f63b1a6f10a1823973` behind native CRD/CEL installation
and cost validation. That requirement is unchanged.

An independent new checkout was created only after comparing all 2,034 non-docs
blobs of its baseline with the freshly fetched untruncated main tree. The reviewer
also compared all 22 restored Product files against their fresh immutable remote
tree blob SHAs. Raw identities are recorded in
`docs/review/evidence/run3-product-independent-restoration.json`.
No other writer's checkout was edited; no cluster, CI, paid service or recipient
was contacted.

## Source assessment

The saved authority now wraps the existing `ControlService.handle` through
`productAuthorityHandler`. It does not restore the old monolithic `control.ts`
entrypoint. Production still constructs the genuine `pg.Pool`, awaits configuration
and server composition, listens only after successful startup, and closes the
same pool during its existing SIGTERM path. All current factory call sites await
the new asynchronous return; current preference tests changed only these awaits.

The asynchronous configuration loader takes one owned environment snapshot
before signing-key IO. It feeds the same session secret to ordinary Control and
the Product wrapper. Origin is forwarded by the existing Studio proxy rather
than invented at the authority endpoint. The original session/allowlist/CSRF
checks, append-only decision SQL and immutable signed-envelope recovery are
preserved. Disabled Product routes remain unavailable. No worker-core/engine
boundary, controller source, chart, CRD or deployment activation was changed.

## Actual independent execution

`docs/review/evidence/run3-product-independent-tests.txt` records **17/17 cases
passed, zero skips**. The independently authored test imports the original
composition fixture, which registers its four tests; those cases are counted
once. One of the 17 is explicitly the existing PATH-T02-002 blocked-successor
diagnostic: it is not acceptance or finding closure.

The run exercises original composed HTTP handlers, actual session issuance,
on-disk PostgreSQL/WASM PGlite plus pgvector and migrations, database/server reopen,
actual Ed25519 signing, the original HTTPS transport against a local TLS server,
and current Prism preference/agent-input/configuration regressions. This is not
native PostgreSQL `pg.Pool`, Kubernetes, Envoy, Tailscale/browser or gateway/model
acceptance. The production-entry subprocess only proves invalid opt-in
configuration fails before listening, not a running native database deployment.

Independent additional cases prove a real RSA private key cannot start the
Ed25519 authority, a disabled authority does not read its missing key file, and
restarting the actual service/database with a changed session secret prevents
the previous session from recording or recovering a Product intent. A fresh
original session records an actor-bound pending intent; no controller receipt
is fabricated. Existing tests independently rerun wrong Origin, non-operator,
CSRF rejection, original signed-byte persistence after restart, receipt equality,
TLS/token behavior and existing preference evidence.

Product submissions and recovery intentionally remain **202/pending** when the
native controller authority is absent. A durable intent is not a successful
Acceptance, TTL extension or DeliveryReady proof.

`docs/review/evidence/run3-product-independent-static.json` contains commands,
exit codes and raw output for Prism typecheck and canonical focused ESLint (both
pass). The full existing Control handler fails with the same 25 baseline rule
counts before and after this port: two function-length, one complexity, twenty
depth, one file-length and one console violation. These remain disclosed debt;
no suppressions or thresholds were added, and no whole-repository lint pass is
claimed. Baseline was checked through original Git bytes via ESLint stdin,
without replacing current source.

## Durable next action

Save this reviewed source port and evidence only on its isolated repair backup.
Do not integrate or enable it alone. Keep Product, Controller and Chart coupled
until the documented real native CRD/CEL gate succeeds, then independently check
their combined source against the fresh repair head and rerun affected tests.
The original complete product graph, authenticated final Acceptance and
generation-bound Tailnet/operator lifecycle requirements remain open. No
unchanged unavailable infrastructure check was retried during this review.
