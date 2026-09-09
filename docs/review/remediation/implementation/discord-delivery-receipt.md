# Discord delivery receipt prerequisite — PATH-T04-002 / F-T14-02

This implements an actual transport receipt prerequisite for D01/D02. It does
not implement demo readiness or operator acceptance, and does not claim that a
human read the message. No external message or deployment ran.

The original operator-messaging adapter now sets exactly one `wait=true` query
parameter after resolving and validating its configured webhook endpoint. Other
query parameters, path and origin are preserved. The normalized endpoint still
passes through the original network adapter's capability/origin authorization,
request deadline and response-byte bounds. Both configured and secret-backed
Discord endpoints use this path; secret endpoints retain confidential invocation.

A Discord success requires a 2xx response and an actual `body.id` containing a
positive decimal uint64 message ID. A generic `messageId`, empty/invalid ID or
204 without a message cannot become a Discord delivery receipt. The existing
durable receipt now carries typed `discord-delivery-receipt.v1`, target, HTTP
status, actual message ID, stable delivery identity and SHA-256 of the exact JSON
transport bytes. The original network adapter serializes that same payload with
JSON.stringify. This binds the rendered webhook message, including any existing
format truncation, rather than asserting that omitted source fields were sent.

The receipt commits in the existing FileDurableRecordStore before return. Exact
replay after reopen validates and returns that receipt without another POST;
changed payload or identity rejects. Legacy unbound Discord acknowledgments
require reconciliation and are not silently upgraded. A dropped response or
invalid post-send response remains uncertain in the existing ledger; restart
cannot resend blindly. Discord does not use the generic receiver lookup as
substitute authority. JSON transports retain their existing acknowledgment and
explicit compatible-receiver protocol, without being promoted to Discord proof.

## Genuine verification

- `node --test tests/verification/reliability/discord-delivery-receipt.test.mts tests/verification/reliability/operator-delivery.test.mts`: 9/9 pass. Three new scenarios use the original discovered/activated plugins, Nova AdapterRuntime,
  secret resolver, network HTTP adapter, FileEffectJournal and durable sender
  store against a localhost HTTP receiver. They check actual wire-byte digest,
  secret-backed query normalization, reopen/replay, changed payload, dropped
  response and invalid ID with exactly one POST. One additional explicitly
  labeled contract-vector test covers legacy receipts and malformed IDs.
  The existing five JSON delivery/reconciliation scenarios remain passing.
- Original operator-messaging `npm test` and `npm run build` pass, including
  configured and confidential Discord paths. Canonical source/regression ESLint
  and diff checks pass. Nova consumer `tsc --noEmit -p skills/nova/tsconfig.json`
  also passes.
- Shared runtime typecheck was attempted and is blocked by the unrelated
  `skills/buster/engine/test-gates/production.ts:189` optional
  `securityScan.databasePolicy` mismatch. No unrelated source was changed.

These localhost receipts are transport-boundary proof, not a deployed Discord
service, human acknowledgement, Clawdeck receipt or tested demo availability.
Actual deployed endpoint configuration, live Discord transport, final
source/coverage-bound demo/login evidence and the readiness producer remain open.
Future readiness must consume the exact v2 delivery manifest and verify that the
actual transmitted message contains the required demo URL and generated values.

## Exact frozen scope

- Modified `skills/common/plugins/operator-messaging/src/adapter.ts`.
- New `skills/common/plugins/operator-messaging/src/discord-receipt.ts`.
- Modified original `skills/common/plugins/operator-messaging/tests/live-function.test.ts`.
- New `tests/verification/reliability/discord-delivery-receipt.test.mts`.
- This implementation note.

No SDK, credential, readiness or durable store implementation changes; no staging
or commits by this author.


## Resume review: durable lookup capability

On 2026-09-09 the existing uncommitted `operator.receipt` capability and shared
Discord renderer were independently reviewed at base `bbc36de` plus working-tree
changes. Lookup does not reserve or transmit: it requires the exact target,
original delivery ID, owning run/stage, rendered transport bytes and one completed
receipt in the original durable store. Legacy records and uncertain deliveries
cannot authorize handoff. The same renderer is used for send and lookup, avoiding
a second independently reconstructed transport representation.

The original package boundary expectation omitted this additional advertised
capability and failed. It now asserts the exact two-capability surface. The
original live-function test and package boundary test pass. Operator TypeScript
and canonical lint on all affected operator sources and boundary test pass.
Existing real HTTP Discord/JSON recovery regressions pass (9 tests; also included
in the combined 41-test run). Logs: `docs/review/evidence/resume-20260909/remaining/`.

Demo-handoff's existing integration test contains wrong-run, wrong-stage and
changed-payload lookup rejection checks; its execution evidence belongs to the
separate handoff work package. No deployed Discord or human acknowledgement is
claimed by this review.

### Independent review correction: lookup effect recovery

The follow-up audit found that `invoke` supported `operator.receipt`, but the
adapter's `receipt` lifecycle hook still rejected everything except publish.
A crash after the core's durable accepted marker therefore made an otherwise
recoverable local lookup fail with `OPERATOR_OPERATION_UNSUPPORTED`.

Both entrypoints now use the same lookup/ownership/transport-binding function.
Normal invocation retains its cancellation check; recovery reads the existing
local receipt without reserving or sending another message. This repairs the
original lifecycle boundary rather than retrying an uncertain external action.

The existing real-HTTP regression now creates a genuine Discord-format delivery
through the original activated adapters, records requested/accepted lookup
prefixes through FileEffectJournal, reconstructs AdapterRuntime, and verifies a
completed matching receipt and rejection of foreign run/stage/changed payload.
The HTTP receiver sees exactly one POST throughout. This is a deliberate
accepted-prefix reconstruction test, not a claimed process kill. All four tests
in `discord-delivery-receipt.test.mts` pass; canonical lint and operator typecheck
pass. A read-only source-hook negative control removes only the new recovery
branch; the identical test fails at the original lifecycle hook with
`OPERATOR_OPERATION_UNSUPPORTED`. Logs are `lookup-recovery-tests.txt`,
`lookup-recovery-negative.txt`, `lookup-recovery-all-lint.txt` and
`lookup-recovery-types.txt` under `docs/review/evidence/resume-20260909/remaining/`.
