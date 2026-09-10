# Independent audit: operator delivery retention design and original prerequisite

Decision: the proposed narrowly bounded legacy JSON request.v1 duplicate-payload projection is a feasible next candidate. The original causal prerequisite is independently reproduced. This is NOT approval of a production projection implementation or PCR-OBS-002 closure.

Author checkpoint `bc8e889a9b8e2551e88fbfde6e94943910ddf1d8` adds only design, fixture and raw evidence. Independent execution `18cc5a003881a4f46f6da1bbf7064f56eaea9724` reconciles verified current main `a43aa256bdce35d7f9c44d5d661e59c4055e562e`. No production source was changed.

## Observed original execution

One original installed human-approval stage invokes original wait-store then operator-messaging through original Core, real network-http and confidential secret resolution. The loopback receiver receives one actual POST; the fixture verifies its exact body, idempotency header and HMAC. Original effect, delivery, wait, signal and lifecycle files persist the first waiting attempt and a distinct approved second attempt, ending in a succeeded run. Wrong issuer refuses before any signal journal write. Exact legacy replay returns the same receipt, changed payload conflicts, legacy operator.receipt lookup remains refused, and no second POST occurs.

Independent result: 1/1 test, zero skips; canonical fixture ESLint plus shared-runtime and Nova typechecks exit0. [Raw independent evidence](../../evidence/run7-operator-independent-prerequisite.txt).

The fixture proves real local delivery and original issuer-authorized trusted-caller resume, not authenticated external operator ingress or durable receiver deduplication across restart. No request payload is removed; original two delivery records occupy 10,137 bytes in this run. Neither quota release nor projection correctness is demonstrated.

## Required design boundaries

The author design now records these independently identified constraints:

- Legacy request.v1 has no owner. Derive authority from exact canonical original requested/accepted/completed effect, actual stage/attempt, pinned target/store/provider, original payload digest and exact internal hashed request/terminal keys. Do not infer ownership from runId, suffix, summary or a caller-supplied receipt.
- Original receipt v1 payload lookup lacks the v2 owner/body check. Any projected v1 path must compare the reconstructed ORIGINAL v1 candidate with its retained original RecordStore digest before returning its exact still-present receipt. Preserve full legacy append-before-return behavior; never promote v1 to v2 handoff authority.
- Canonical stored-object digests and HTTP JSON.stringify wire-byte digests are different authorities. Do not invent wire serialization from sorted legacy storage. Keep original Core/effect evidence; add no summary, token, endpoint secret, HMAC or transport body to projection/audit metadata.
- The original wait-store payload is wait-value.v1; waitId is derived from the signal.wait idempotency key, not approvalId. Actual recoverWaitCreation returns the committed first attempt.completed here, not a separate wait.created event. Preserve that authoritative path.
- Generic recovery alone does not revalidate ordinary signal issuer/type/time. Selected canonical signal, signal journal, actual wait.resolved causation/payload, configured issuer, inner approved guidance and later completed attempt must be bound explicitly. Historical timing cannot use today's clock to invalidate an already resolved wait.
- Run fencing alone does not fence wait/delivery stores. Use original run → wait read → delivery CAS fences, bounded snapshots and no same-store reentry. Current transition callback does not expose its locked state; any owning atomic API extension needs separate review. Validate the exact receipt/all same-delivery records at final mutation, including stale completeDelivery interleavings.
- Preserve original failure recovery: failDelivery invokes deliveryReceipt without transportPayload. A projected JSON-v1 branch must still bind the actual original request payload through the owning codec, or prove its unchanged exact-receipt fallback; silently skipping the binding or returning undefined is not acceptable. A delayed completeDelivery currently conflicts then returns an existing accepted receipt; its replacement fallback is possible when no accepted receipt is found. Prove with actual interleaving that projection retains the exact original receipt/key/schema and delayed completion/failure cannot replace it, reinflate payload or send again.
- Only duplicated request bytes may be removed. Preserve original records/counts, receipt identity, waits/signals, original evidence and external replay lifetime. All projection overhead remains charged to unchanged quotas. No positive savings means refusal.
- Initially exclude v2 deliveryId, Discord, confidential/unverifiable requests, unresolved/multiple/conflicting delivery history and active/waiting/unapproved runs.

The design's original-store and causal corruption, alias/fence/race/SIGKILL, no-reinflation/no-redelivery, historical expiry and true tiny-quota test requirements remain mandatory before implementation approval. Exact receiver restart/dedup is unproved by this prerequisite and must not be inferred from its in-memory received array.

Next action: root may authorize a separate bounded owning-consumer/atomic-state implementation using this prerequisite; independently inspect and execute all new gates before integration. No such implementation is authorized or approved by this audit itself.
