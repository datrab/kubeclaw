# Independent Artifact/State configuration inventory review

Accepted as a bounded source inventory. No implementation, runtime, migration or whole CONFIG acceptance is implied. The [author inventory](config-storage-plugin-inventory-20260921.md) accurately identifies eight schema fields plus Artifact's separate fixed 65,536-byte metadata payload limit.

All nine current source files match both the author's manifest and its retained snapshots. The [comparison](../../evidence/config-storage-plugin-independent-20260921/source-comparison.json) also binds the actual blob-read helper, durable-state reader and reviewed document. No runtime test was executed and no production file was changed.

The two manifests select the described factories and schemas. Artifact validates raw safe integers; State applies `Number` before safe-integer checks. Both schema boundaries require integers, so direct factory invocation has a materially different coercion surface. Neither migration may preserve that difference accidentally through hidden defaults. Both stores resolve their roots against process working directory; the platform loader does not rebase these arbitrary adapter fields.

The budget distinctions are correct. State charges canonical `{schemaVersion, value}` payload bytes, not merely caller-value bytes. Record count spans streams; serialized-state bytes include record framing. Artifact's 65,536-byte bound applies to its ArtifactRef payload, while maxArtifactBytes bounds encoded JSON writes and actual bounded blob reads. The same maximumStoreBytes is supplied independently to metadata and blobs, not used as a combined directory quota. Blob admission scans the blob tree under its budget lock; it does not include metadata or promise a peak filesystem-space limit.

Additional precision for later implementation: lowering the record-count or per-record-write limit does not itself add a read-time scan of each historical payload/count. The whole record-state read is byte-bounded. Blob reads enforce the individual blob bound, while the total blob-budget walk is an admission check; an already existing identical blob can return before that walk. The inventory's statement that lowered limits *can* make data unreadable is correct, but must not be expanded into a claim that every limit is revalidated on every read.

The described publication ordering matches production: bounded metadata admission precedes blob publication, leaving an idempotent intent available to retry after a blob failure. State retains duplicate/conflict semantics. Future migration must preserve these behaviors and the original test suite, alongside real profiles, omission controls and interrupted-publication tests.

Historical limitations are appropriately open. Raw immutable RunSnapshots can omit old effective limits; today's config cannot establish those old values. No snapshot rewrite or inferred historical policy is authorized here. The separate [Wait history design](config-wait-history-design-20260921.md) illustrates the same provenance issue without constituting an Artifact/State compatibility implementation.

No concrete correction to the reviewed inventory is required. The nine source identities are a source-inventory checkpoint, not a complete transitive runtime closure or evidence of deployed plugin selection.
