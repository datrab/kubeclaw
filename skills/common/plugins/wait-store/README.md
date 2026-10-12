# Wait store

Creates durable typed waits through the shared pipeline durable-record
interface. Creation
is idempotent under the core-issued idempotency key; replay with different
content fails closed. The adapter validates expiry timestamps, rejects
invalid durable stores, bounds entries, supports inspection, and honors
cancellation.

`root` selects the embedded file driver. The former `journalPath` and
`waits.jsonl` storage path are removed.
Wait records accept the full 256-character pipeline idempotency-key limit.

Core remains responsible for signal authorization, expiry enforcement, and
lifecycle resumption. This adapter persists wait intent; it does not accept or
authorize resume signals.

## Explicit retirement of a completed human-approval Wait

`scripts/retire-wait-value.mjs --apply /absolute/scope.json` is a manual local operation for the original completed human-approval flow. It retains the Wait key and original logical payload digest, replacing redundant value bytes with an exact retained Core source reference only when the serialized record becomes smaller. It does not free a record slot, delete Core evidence or deliver another notification. The connected original operator receipt and authorized approval signal must still prove the completed outcome under Run → Wait → Delivery writer ownership. Missing, waiting, uncertain, foreign or unsupported authority is rejected without changing the Wait.

The scope uses `wait-value-retirement-scope.v1`, action `project-completed-human-approval-wait`, `novaStorageRoot`, `orchestratorIssuerId`, and an explicit `intent`. The intent names `operationId`, `actor`, the configured `waitRoot` and `deliveryRoot`, the original `operatorEffectKey`, exact `terminalPayloadDigest`, and `source`. The source is `retained-core-wait-source.v1`: run ID and original journal head, snapshot and raw event/effect/signal digests, complete original event/effect/signal prefix lengths, root/file identity digest, original Wait effect key/Wait ID/payload digest, and positive bounded `inventoryLimits` (`maximumFiles`, `maximumTotalBytes`, `maximumSnapshotBytes`). Paths are derived by the owning Core; a stored reference cannot select arbitrary source files. The exact reference construction and genuine original producer fixture are maintained in `tests/verification/reliability/wait-value-projection.test.mjs`.

Applying the operation checks full current original authority. Later `signal.wait.read` and identical `create` reconstruct only the exact retained original prefixes, preserving their original value and idempotency behavior even if unrelated data was later appended to a Core journal. This read is not an audit or authorization of the suffix. Changed/truncated/replaced original sources fail closed. Current operator retirement continues to verify full current authority independently. No original history can be removed while a projection references it.

Core injects this narrow resolver only when its original Wait adapter is the selected signal.wait provider. Legacy inline records remain usable in standalone activation. Standalone activation encountering a projected record without its owner resolver fails closed; it never fabricates a Wait or falls back to an alternate history. Repeating the same manual operation returns zero newly released bytes; a different intent is a conflict. Quota settings and record counts remain unchanged.

The author verification includes real filesystem/Core/HTTP cases, competing writers, fixed quotas, process crashes, and unchanged original suites. Final source binding, omission controls and independent acceptance remain pending; these local results are not deployment or overall observability closure. See `docs/review/remediation/implementation/wait-value-retirement-20260921.md` for the bounded status.

Physical byte savings do not reduce the logical `read` response or guarantee lower RAM use. `read` still returns all original Waits, each bounded by its original snapshot-pinned entry limit. Aggregate values can exceed the current physical Store-byte quota; record count and the applicable original entry bounds govern that logical size. Bounded source reads and retained Core history are additional costs. The retirement quota proof therefore concerns new physical Store writes only.
