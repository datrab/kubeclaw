# PCR-SDK-001 follow-up: versioned durable effect identity

Base: `354ee88060c93e8a0482ac91b7786788eda76fe8`. The actual durable producer now
writes `effect:json-utf16-v1:<64 lowercase hex>`. Its digest is SHA-256 over the
portable SDK codec applied to the original identity subject plus
`schemaVersion: "effect-identity.utf16.v1"`. The prefix selects exactly one
identity version and the hashed domain also contains its version. New payload
comparison uses the same portable codec. Effect request/receipt schema v2 and
journal storage formats are unchanged; effectId remains the existing opaque
identifier. Confidential random identities do not enter the durable journal and
remain outside this cutover.

## Coupled producer, replay, lock and evidence validation

The production changes are confined to `effects/identity.ts`,
`effects/durable-invocation.ts` and `state/read-run-evidence.ts`:

- New DurableInvocation requests use the explicit portable identity.
- Replay selects the original stored ID version. The exact historical
  `effect:<64 lowercase hex>` branch uses the unchanged legacy algorithm and
  payload comparison. No alternate collator, locale guessing or hash-matching
  fallback is attempted. Both stored request metadata and incoming invocation
  must match that original ID before payload comparison or receipt lookup.
- Existing requests and receipts are reused unchanged, including requestedAt,
  payload, effectId and byte-preserved journal prefixes. New code does not stamp
  a version onto historical records or regenerate their IDs.
- Runtime dispatch reacquires the original per-effect resource lock using
  `prior.effectId`. If an old request arrives after the unlocked read while the
  new runtime has acquired a different portable lock, locked recheck detects the
  mismatch and exits before accepted/external execution. The lock is released;
  a subsequent safe retry can select the real stored ID and acquire its lock.
- ReadRunEvidence validates either recognized stored identity version through
  the same identity function. It does not compare historical requests with the
  new default writer. Unknown/malformed versions and nonmatching metadata reject.

The persisted semantic identity does not include payload in its hash, preserving
the existing separation between operation identity and immutable payload replay
comparison. No side effect is reissued merely because the new identity version
exists. Accepted work still requires the adapter's actual recovery receipt;
absence remains unresolved rather than being treated as safe new execution.

## Real historical bytes and locale limits

Three small immutable fixtures were produced by executing the original
Coordinator/DurableInvocation/Identity source from the base commit with actual
file journal, resource locks and concrete adapters. Successful artifact writes
and real local HTTP dispatches were recorded in English locale. The regression
opens those exact completed or crash-prefix files in English, Swedish and Turkish
Node processes. Completed receipts return unchanged without writes; requested
work keeps the original identity and appends acceptance/completion only when it
was never accepted; already accepted work with no adapter recovery receipt is
not sent again. The real dispatch lock log retains the original legacy ID.

A separate captured original direct-call record contains deliberately extra
Unicode attempt metadata, demonstrating the legacy codec's actual locale risk.
This is not a valid new closed-schema pipeline attempt. Under Swedish locale its
old ID cannot be verified: the new code rejects before locks, new journal writes
or external work, even when an old completed receipt exists. Preserving that
record requires actual verified producer facts/operator reconciliation; the new
version cannot reconstruct absent locale authority. Ordinary captured legacy
schema-field identities remain readable in all three tested locales.

New original artifact/HTTP producers run in both en-US→sv-SE and sv-SE→en-US
process sequences. Their portable IDs and reopened completed receipts match
exactly. An actual journal race inserts an original legacy request between first
read and locked recheck; the first call blocks under/relinquishes the portable
lock, then a safe retry dispatches exactly once under the original legacy lock.
Unknown versions, altered prior metadata and changed payloads reject. No injected
replacement journal/adapter/lock or Git-history-dependent product test is used.

The existing Phase7 ID assertion now requires the explicit new identity syntax;
other original assertions remain unchanged. The original PipelineReview package
executes an actual completed source-run projection through ReadRunEvidence and
its artifact consumer with the new IDs. This is local pipeline/transport proof,
not deployed model execution or a complete historical population migration.

## Remaining SDK001 work

This closes the coupled durable-effect semantic identity boundary. It does not
change Source/ReviewSubject input digests, repository review report/cache/map
contracts, repair-order/authorization digests, or runtime/workspace ownership
contracts from the remaining inventory. Those separate semantic authorities need
their own explicit producer/validator versioning. The global legacy
`canonicalJson` export remains unchanged for those callers; no universal
pipeline locale portability is claimed.

## Executed local gates

Raw outputs under `docs/review/evidence/wave47-sdk-effects/`:

| Command / actual scope | Exit | Evidence |
| --- | --- | --- |
| `node --test tests/verification/reliability/effect-identity-version.test.mts` (two tests, 32 legacy native-process cases plus new writer/replay directions) | 0 | identity-tests.txt |
| Original effect-lock-lifetime + effect-journal-ownership (seven tests) | 0 | original-effects.txt |
| `node tests/verification/contracts/check-plugin-system-v2-phase7.mjs` | 0 | phase7.txt |
| `npm test --prefix skills/nova/plugins/pipeline-review` | 0 | report-consumer.txt |
| Original SDK portable-blob consumers + Discord receipt/replay (five tests) | 0 | replay-consumers.txt |
| `npx --no-install tsc --noEmit -p skills/nova/tsconfig.json` | 0 | types.txt |
| Canonical ESLint on all five changed/new TypeScript/test paths | 0 | lint.txt |

The captured legacy producer completed successfully (legacy-producer.txt).
Its exact original source/fixture hashes are listed in legacy-provenance.json.
No test requires that capture's historical Git object to exist. No deployment,
CI invocation or real recipient message was performed; all HTTP was loopback.

## Independent final review

Reviewer `resource_accounting` approved the frozen three-production-file cutover
without a blocking finding. Independently reran the two new effect identity tests,
seven original effect/lock/journal tests and Phase7. Its separate original
held-legacy-lock/HTTP probe observed zero requests while the old lock was held,
then exactly one after release and replay, preserving the original ID and journal
bytes. An independent unknown-version case through the actual full report fixture
and ReadRunEvidence passed with the adversarial FileJournal unchanged and rejected
(11/11 projection/fixture checks). Separate committed evidence paths are
`wave47-sdk-independent-review.txt`, `wave47-sdk-independent-lock.txt` and
`wave47-sdk-independent-projection.txt`; no reviewer harness remains in this
worktree. No production migration, automatic reapproval or global SDK001 closure
is asserted.
