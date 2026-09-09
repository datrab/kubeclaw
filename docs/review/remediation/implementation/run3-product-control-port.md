# Product authority port to current ControlService

Status: **incomplete coupled package; not integrated, independently approved or
native-verified by this author checkpoint**. A backup of this port is not approval
to integrate it without the saved controller/chart native CRD/CEL gate.

## Fresh source recovery

The current remote branch was read at `b284a15ebfa58c31688271c62d9bf1ea276fa2f0`.
Its exact tree `197e8efc34c001cfabf74caba0c55f99fb7e1b0b` equals the isolated
checkout base `c8dd0917f4f0eb53dd6719c657ff90578e697602`. No other checkout was
modified. Current remote package checkpoints and each Product/controller/chart
branch ref were read before source work. The Product source was fetched from
`74e0cc0f848269e7e6b163c82253952f638682d7`, not taken from old uncommitted work.
All 22 added source/test/historical-evidence files match their remote Git blob
SHAs; `restored-remote-blobs.json` records the comparison. The original Product
implementation/review reports and logs are retained as historical package
evidence, not newly executed native tests.

## Scoped composition change

The obsolete Product patch wrapped the old Control monolith. The current thin
`control.ts` remains a real `pg.Pool` production listener. It now awaits the
existing service factory before listening, so missing/invalid opt-in authority
configuration rejects during startup. The original `productAuthorityHandler`
wraps `ControlService.handle` exactly once. Product domain signing, controller
transport, SQL persistence, migration and operator page are byte-identical to
the saved Product package. No controller, CRD, chart or Worker Core source was
ported or modified here.

Configuration stays in the existing environment adapter. The service and product
configuration are captured from one owned environment snapshot before the
asynchronous signing-key read. This prevents a caller mutation during key I/O
from changing authority issuer/session identity halfway through composition.
There is no injectable prevalidated authority object or bypass of key loading.
Origin forwarding in the original Studio proxy is restored from the saved
package. Session/Origin/CSRF/allowlist and immutable intent/receipt rules remain
unchanged.

A repository-wide search found the production listener and two creation sites
in `control-generation-http.test.mts` as the existing factory callers; all now
await asynchronous startup. No declaration file or other caller was found.
The current original HTTP tests retain every assertion, including the openly
incomplete PATH-T02-002 diagnostic. Current configuration tests are unchanged.

## Actual local verification

The six explicitly listed test files in the adjacent manifest pass **15/15,
zero skips**. They include the saved SQL/signature/HTTPS transport tests, original
Studio cookie and current Control HTTP/config tests, and four new composition
checks:

- Disabled product route remains 404 while original health works; incomplete
  enabled startup rejects before a server can listen.
- The actual production listener child exits 1 for incomplete opt-in config;
  this is a real Node process executing `server/control.ts`, not a fake listener.
- Async key loading keeps the original startup snapshot; absent key rejects.
- The actual composed Control issues the original authenticated session, denies
  wrong Origin/CSRF and an unlisted operator, then persists the genuine signed
  intent. After actual server close/database close/reopen, recovery retains
  identical bytes and no applied receipt. Altered intent rejects; only authorized
  own history is readable.

These are real loopback HTTP, Ed25519, disk-backed PGlite and original migration
tests. The controller CA/token are deliberately absent in the new composition
test: transport fails and the state stays **pending**, not fabricated Applied.
No Kubernetes response, gateway completion, model output, TLS proxy identity or
native PostgreSQL server is impersonated. The original authenticated proxy
boundary is exercised locally; installed Tailscale/CNI isolation is not proven.

Prism typecheck and focused canonical lint pass. Full `control-server.ts` lint
retains the same 25 existing handler diagnostics and unchanged handler complexity
204; no suppressions/threshold changes. One newly introduced type-only import
diagnostic was corrected, with initial and final logs retained. The bounded
factory itself adds no complexity diagnostic. The source-only diff check passes.
The complete staged diff reports trailing blank lines in untouched historical
and fresh raw tool output; those evidence bytes are preserved rather than
reformatted or described as a clean full-diff check.

Raw outputs and exact commands/exits:
`docs/review/evidence/run3-product-port/manifest.json`. The first 13-case test run
also passed; the final 15-case run adds startup-child and async-snapshot coverage.
Workspace Core/SDK dependencies resolve inside this new checkout.

## Durable next action

Independently review this frozen port and repeat the actual local gates. Keep it
on a separate repair backup branch. Before any main integration, reconcile the
paired controller `e21a2998f8b0e39b60705dfd8bbd6855452a0395` and chart
`47b392dc2aa36cb37fdbd8f63b1a6f10a1823973` packages and satisfy their genuine
native CRD/CEL installation/cost gate. The real API-server, app/Tailnet/browser,
operator acceptance and exact-generation TTL/release gates remain separately
incomplete. No finding/register count changes follow from this port.

No deployment, CI, production change, paid resource or third-party message was
performed. The generic shared Worker Core plus role-specific engine architecture
is unchanged.
