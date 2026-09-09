# Independent review: versioned durable effect identity cutover

Reviewed the author's frozen production diff on `354ee88` in `wave47-sdk`.
The exact three source SHA-256 values are recorded in
`docs/review/evidence/wave47-sdk-independent-review.txt`. Production scope:
`effects/identity.ts`, `effects/durable-invocation.ts`, and
`state/read-run-evidence.ts` under `skills/nova/core`.

**No blocking findings in this scoped cutover.** The reviewer made no production
changes. This does not assert native provider/cluster execution or a broader
SDK rollout beyond the reviewed effect producers and consumers.

## Identity and admission reasoning

New durable writes have an explicit `effect:json-utf16-v1:` identity domain whose
hashed subject includes the encoding schema. Existing `effect:<sha256>` records
are checked with the original legacy serializer; they are not relabelled as new
effects. Unknown version prefixes reject. A legacy identity that cannot be
verified in the current locale rejects rather than guessing the producer's
locale or emitting a replacement effect.

Matching checks both the stored request against its own stored effect ID and
the incoming invocation against that same ID, then compares payloads with the
stored identity version's serializer. This avoids accepting changed stored
authority merely because an incoming request happens to match selected fields.

For `runtime.dispatch`, resource admission selects `prior.effectId` when there
is a prior request. A new-version lock cannot replace a legacy invocation lock.
After acquisition, the journal is read again and the resulting identity is
compared to the actual held lock. If a legacy request appeared during admission,
the new lock is released and the invocation rejects before mutation. The next
attempt can acquire the actual legacy lock. Already-completed verified receipts
can return without another adapter call; accepted-but-unreceipted operations
still use receipt recovery rather than blind re-execution.

For other durable effects the lock remains the actual resource identity; the
version transition does not invent a separate lock namespace. Confidential
effects retain their separate non-durable random-identity path. Read-only
`readRunEvidence` now validates each stored durable identity in its own version,
then preserves existing journal, receipt and lifecycle-audit reconciliation.

## Independent executed evidence

- Original author effect-identity suite: **2/2**, including real locale-specific
  child processes, captured legacy journal prefixes, original artifact storage,
  original runtime/network adapters and actual local HTTP requests. The fixture
  documentation explicitly identifies extra historical Unicode metadata as a
  direct-call compatibility probe, not currently valid pipeline schema input.
- Original journal ownership, lock-lifetime and external-effect recovery suites:
  **10/10**. This includes actual external mutation recovery before receipt,
  after receipt and after lost response.
- Original Phase7 contract gate passes.
- Additional reviewer-held legacy lock probe: the real file-lock manager holds
  the legacy runtime invocation lock under another owner. The actual coordinator
  waits and cancels with **zero HTTP requests**, without adding journal entries.
  After release, original HTTP dispatch occurs once with the legacy effect ID.
  Completed replay makes no second request and does not rewrite the journal.
- Original report-evidence fixture plus a reviewer-added unknown-version case:
  **11/11**. The fixture generates actual Git/Core source history and artifact
  evidence. The added case rewrites the adversarial input through the original
  `FileJournal`, replacing a durable identity with an unsupported version while
  retaining a valid journal chain. Original `readRunEvidence` rejects with
  `RUN_EVIDENCE_EFFECT_INVALID` without changing the journal. Restoring the exact
  original bytes restores the valid projection. All original fixture assertions
  remain enabled.

Raw evidence and independent probe sources:

- `docs/review/evidence/wave47-sdk-independent-review.txt`
- `docs/review/evidence/wave47-sdk-independent-lock.txt`
- `docs/review/evidence/wave47-sdk-independent-lock-probe.mjs`
- `docs/review/evidence/wave47-sdk-independent-projection.txt`
- `docs/review/evidence/wave47-sdk-independent-projection-probe.mjs`

The lock probe invokes the original coordinator, file journal, file lock manager,
runtime-dispatch adapter and network adapter. Its local HTTP endpoint merely
acknowledges requests; it does not impersonate a model. The projection hook was
inserted into a temporary adjacent copy of the original report test after its
successful baseline read, retaining every original assertion. That temporary
harness was removed. No production module was replaced to obtain a pass.

The author's production freeze was preserved throughout the review. Missing
native execution proofs elsewhere remain missing; this review only accepts the
explicit effect-identity/admission/read-consumer cutover described above.
