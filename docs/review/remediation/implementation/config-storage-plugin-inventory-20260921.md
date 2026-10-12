# Artifact and state plugin configuration: source inventory

Status: [independently accepted source inventory](independent-config-storage-plugin-inventory-20260921.md),
not migrated or runtime-tested. This adds the
two registrations `kubeclaw.artifact-store:artifact-store` and
`kubeclaw.state-store:state` to the earlier
[plugin inventory](config-plugin-settings-inventory-20260921.md). Both manifests
register their actual `src/adapter.ts::activate` and config schema. These are
repository registrations, not evidence that a deployment selects them.

## Fields and actual effects

| Plugin / field | Current missing-value behavior | Consumer and meaning |
| --- | --- | --- |
| Artifact `artifactRoot` | Required nonempty string | Both durable stores resolve this root against process cwd; metadata is in `records/store.json`, content in `blobs/sha256`. |
| Artifact `maxArtifactBytes` | 16777216 in `activate`; no schema default | Positive safe integer; serialized JSON write size, blob write size **and blob read size**. |
| Artifact `maximumRecords` | 100000 in decoder and schema annotation | Positive safe integer; number of durable metadata records, not unique blob count. |
| Artifact `maximumStoreBytes` | 268435456 in decoder and schema annotation | Positive safe integer; passed separately to the metadata store and the blob store. See scope below. |
| State `root` | Required nonempty string | Durable record store root, resolved against process cwd. |
| State `maxEntryBytes` | 1048576 in decoder and schema annotation | Positive safe integer after `Number(...)`; bounds canonical serialized `{schemaVersion, value}` stored payload, not only the caller's raw value. |
| State `maximumRecords` | 100000 in decoder and schema annotation | Positive safe integer after `Number(...)`; whole durable record store count across streams. |
| State `maximumStoreBytes` | 268435456 in decoder and schema annotation | Positive safe integer after `Number(...)`; serialized durable record state bound on reads and candidate writes. |

There is a ninth policy value absent from both schemas: Artifact passes fixed
`64 * 1024` as `maximumRecordBytes` for its metadata. A schema-only inventory
would miss this configurable storage bound. It belongs in the Artifact plugin's
eventual central configuration, not in shared Core as an unrelated default.

The existing registry activation validates schemas without resolving annotated
defaults, as established in the earlier inventory. Artifact checks the raw
numeric values with `Number.isSafeInteger` before conversion; State converts
first. Direct factory calls can therefore differ from schema-validated calls.
Migration must require actual integer inputs consistently and test both the
public schema boundary and the factories, without retaining hidden coercion.

## Two storage budgets are not one total directory budget

Artifact gives `maximumStoreBytes` to `FileDurableRecordStore.maximumBytes` and
independently to `FileDurableBlobStore.maximumTotalBytes`. The former bounds the
serialized record state; the latter walks only `root/blobs` under its blob-budget
lock. This is **not** a shared cap on metadata plus blobs, locks and temporary
filesystem usage. The existing value must not be documented as such or silently
reinterpreted during a configuration-only migration. If distinct knobs are
introduced, author both explicitly with these existing domains and preserve the
effective limits; a new combined quota requires its own storage contract.

Artifact admits metadata before writing a blob, preserving an idempotent write
intent if blob storage fails. State detects repeated idempotency keys and payload
conflicts before appending. Configuration changes must preserve these actual
storage and replay behaviors. Lowering limits can make existing stores or blobs
unreadable; a central file does not itself migrate retained data or authorize its
deletion.

The read and admission checks are distinct: whole record-state reads are
byte-bounded, but they do not reapply every historical record's write-size limit
or the record-count admission limit. Blob reads apply the individual blob-size
bound. The total blob-budget walk occurs on admission; an identical existing blob
can return before it. Tests and documentation must preserve these distinctions.

## Migration obligations

The proposed owners are `plugin-artifact-store.config.json` and
`plugin-state-store.config.json`, referenced through the common configuration
entry and resolved into the existing adapter configuration before activation.
The selected platform's inline settings must not remain a competing author.
Do not change relative-root semantics silently; a deliberate absolute-root
contract needs explicit migration instructions and actual path tests.

Before implementation, record criteria covering all eight schema fields and the
additional metadata-size policy, two explicit profiles, missing/invalid values,
actual store admission/read limits, duplicate/conflicting writes and interrupted
metadata/blob publication. Restored decoder defaults and ignored limits must
fail meaningful tests. Keep complete original plugin and durable-store suites.
Bind historical configuration interpretation and retained-data behavior before
removing old factory defaults; do not rewrite immutable run snapshots or infer
their omitted values from today's profile.

DOC completion must identify the sole file per plugin, all units and bounds,
per-domain quota meaning, root resolution, rejected old inputs, and safe handling
of existing data when changing limits. Independent implementation review and
real consumer tests remain required. This inventory does not close CONFIG F1 or
the observability retirement finding.

The [source manifest](../../evidence/config-storage-plugin-inventory-20260921/source-identities.json)
binds both plugins, both underlying store implementations and the existing
registration roster. No runtime test was run for this inventory.
