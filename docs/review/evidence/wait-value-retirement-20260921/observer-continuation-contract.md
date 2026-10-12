# Superseded observer-tail proposal

This unimplemented proposal is superseded by the coordinator-approved retained-prefix contract below. Requiring current-tail authorization would change original Wait.read semantics: the original durable wait does not depend on unrelated later Core history. No broad observer validator or full-evidence API change will be implemented for this task.

At apply time the executor validates FULL current original authority under Run → Wait → Delivery, verifies prefix lengths equal current full original journals, and persists bounded complete prefix lengths/digests, snapshot/root/file identity and original payload digest in the projection receipt. At read time the owner derives paths and validates only those exact retained original bytes, complete hash chains, original snapshot and selected completed Wait effect/signal identity. New suffixes—including unrelated malformed suffix bytes—cannot authorize anything and need not be read. Changed/truncated/replaced retained prefix evidence rejects. Operator retirement independently retains its CURRENT full-authority verification. Existing readRunEvidence is unchanged.

Positive proof must use real producer late append and preserve original read/identical create. Negative proof mutates/truncates/replaces the retained source; payload/digest idempotency remains exact. Source work is WIP and no tests have passed yet.

---

Historical unimplemented proposal follows for traceability.

# Proposed retained Wait observer continuation contract

Pre-code contract; implementation and genuine producer tests are outstanding. Existing WP1–WP8 remain unchanged. No Core reader behavior is changed by this document.

## Original authority retained

The reference binds the original snapshot digest, root inode identity, complete original event/effect prefix byte lengths and digests, original lifecycle head, and entire signal journal digest. Prefix lengths end at actual complete journal-record boundaries. The selected original completed Wait effect/request/receipt and authorized approval signal remain unique and byte-identical. Original full operator/human-approval authority is checked before replacement under Run → Wait → Delivery. The original terminal boundary remains succeeded/failed/cancelled, never blocked or active.

The existing physical prefix helper is `foundation/observability/attempt-projection.ts:readAttemptJournalPrefix`. Reuse its bounded canonical regular-file read rather than inventing a repair reader. This helper alone is insufficient authority: current complete chains, source inode/path identities and snapshot integrity must also validate. Manual inventory byte/file bounds apply to all reads; no maxEntryBytes substitution or implicit budget increase.

## Only permitted continuation

Signals have no allowed suffix. A lifecycle event suffix may contain only the original Core effect audit event kinds for validated observer attempts. Run lifecycle, stage/attempt creation/completion, wait resolution, administrative resume, or another terminal boundary is rejected. A plugin-domain suffix must name an exact snapshot-pinned, enabled and granted observer provenance and the actual observer delivery causation ID. The source input event must exist earlier, belong to this run and match that observer's original subscription. A causation cycle, missing source event, duplicate identity or invented observer name is rejected.

An effect suffix must retain the ordinary Core request/accept/completion sequence, valid original effect identity codec, exact request equality and receipt linkage, actual selected adapter provenance and audited lifecycle events. The root request's observer attempt and delivery key must match `telemetry/observer-delivery.ts`: run identity, local observer stage ID, `observer:<globalObserverId>:<eventId>`, and the stable `delivery:<globalObserverId>:<eventId>:<invocationIndex>` key. The documented operator.request retry variant also binds `:execution:<deliveryAttempt>` and its unchanged deliveryId. Delegated child requests must validate the existing parent-invocation identity and the pinned adapter dependency grant route; they cannot be waved through merely because the attempt string starts with observer:. Existing capability/resource authorization remains required. All new keys must differ from selected original Wait/operator keys; no original completed effect can be redefined or reopened.

These additional observer actions do not change any original approval stage result, completed Wait effect, authorized signal or lifecycle terminal. They may add new observer receipts/domain events. A malformed, partial, conflicting or unsupported suffix fails closed, including when the original prefix remains intact. No caller-supplied projection path, new source catalog or silent authority reset is introduced.

## Genuine route and tests required

`ObserverRuntime.drain` snapshots its inputs once. `deliverObserver` permits domain events to be appended during delivery. A second observer subscribing to such an event can therefore have legitimate pending input after the final snapshot. `engine-admin.ts` recorded-decision replay executes the original observer drainer; this is the producer path to exercise, using actual installed observer packages and actual Core events, not handwritten journal tails.

Required positive: original human approval completes, original Wait projects, an observer-emitted subscribed event is later consumed through actual recorded admin replay, then actual Wait read and identical late create still return the original value without reinflation; original receiver sees no duplicate POST. Original signal/receipt bytes remain identical.

Required negatives: changed original prefix, conflicting selected key, fresh run/resume/attempt or signal suffix, foreign observer provenance, wrong subscription/causation, missing grant, invented execution index/attempt, child-effect parent mismatch, incomplete current tail, and invalid full-current chain. Separate original new-run same-ID test must reject RUN_ALREADY_EXISTS without a single appended byte. Record all original API errors, not just generic rejection.

This is a proposed exact acceptance boundary, not evidence that existing readRunEvidence already supplies all observer authorization checks. Shared existing validators must be identified before implementation; any missing seam must be reviewed explicitly rather than duplicating the Core authorization model.

Existing reusable authorization components identified: `execution/authorization.ts:authorizeCapabilityInvocation` validates the original pinned capability/resource grant; `effects/identity.ts:validEffectIdentity` preserves both original supported identity versions; `effects/dependency-identity.ts:portableDependencyKey` and `effects/dependency-journal.ts:DependencyRequestIndex` provide original parent/request sequence and owner lookup semantics. Snapshot `registry.registrations.observers`, `enabledRegistrations`, `grants`, and `selectedProviders` bind the original observer and adapter authority. Their reuse must not expose a writable journal or adapter invocation API to a reader.
