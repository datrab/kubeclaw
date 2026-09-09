# Observability retention assessment

PCR-OBS-002 remains partial/open. D01 and D07 settle the retention policy but do
not supply the missing safe quota-release mechanism identified in the original
foundation.observability review. D09 independently requires durable worker
recovery without depending on Clawdeck. No runtime source, limit, current data,
automatic deletion policy or central log store was changed in this slice.

The [operator contract](../../../operations/observability-retention.md) documents
actual configured/derived roots, record/blob/attempt/admission defaults, full-store
errors, read-only filesystem measurements, existing cleanup boundaries and the
requirements for a later manual retirement operation. Disk/Git logs remain until
manual operator cleanup, final project material until explicit project deletion,
and pending continuation evidence remains protected. Demo TTL does not expire
logs. No Clawdeck-internal retention interval is invented.

Source inspection confirms: durable record metadata supports append/read/transition
but no deletion/tombstones; admission has no compaction; outbox compaction removes
only admitted copies and has no production caller in the inspected tree; attempt
cleanup reclaims aged result-unreferenced staging evidence, not confirmed history;
Nova hash-chained journals have no total quota/retirement API; Buster terminal
workspace cleanup preserves diagnostics and durable state. Clawdeck observation
views expose cursors/completeness without a durable consumer-completion contract.
Artifact-store metadata and blob quotas are separate, both defaulting to 256 MiB.

This was a read-only source review followed by documentation edits. No stores were
instantiated for inspection (Nova journal construction can repair incomplete
append tails), no current diagnostic data was printed or deleted, and no cluster,
CI or external Clawdeck system was contacted. Links and quoted configuration
values were checked against the current source. No runtime test success or live
capacity/backup guarantee is claimed for a documentation-only change.

The minimal follow-on proposal is a scoped manual retirement plan bound to Nova's
hashed run roots, Buster's hashed job roots and shared artifact/job IDs, followed
by a separately reviewed writer-fenced transition that preserves deduplication
and references. Until that mechanism exists and passes real quota/crash/replay
tests, the primary finding cannot be declared closed by policy documentation.

Exact scope: `docs/operations/observability-retention.md`, this note, and a link in
`skills/common/plugin-runtime/foundation/observability/README.md`.
