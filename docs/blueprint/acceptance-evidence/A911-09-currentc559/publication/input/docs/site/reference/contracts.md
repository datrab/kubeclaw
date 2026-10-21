# Contracts, Versions, and Compatibility

Status: bounded reference; discovery and recovery limits stated below
Audience: operator, developer, plugin author, maintainer
Owner: documentation; named contract and store components own behavior
Evidence: [skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json); [skills/nova/core/execution/engine-snapshots.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/nova/core/execution/engine-snapshots.ts); [contracts/prism/v1/src/index.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/contracts/prism/v1/src/index.ts); [contracts/delivery-manifest/v3/src/index.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/contracts/delivery-manifest/v3/src/index.ts); [skills/common/plugin-runtime/foundation/observability/record-retirement.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/common/plugin-runtime/foundation/observability/record-retirement.ts)
Applies to: the eight named contract families and actual selected reader boundaries below
Last verified: 2026-10-15; current source behavior checked; no migration, backup or recovery executed

## Identify the contract before changing a version

A contract is the agreement between a producer and its consumer about data and
behavior. A producer writes or returns a value. A validator checks the selected
shape and semantic rules. A consumer acts on it. These can be three different
components; passing one validator does not prove that every consumer accepts it.

1. Identify the logical contract, record marker, producer and actual reader.
2. Match the direction in the matrix below: new write, read, recovery or rejection.
3. Retain original bytes, package/content identities and affected durable state
   before considering an upgrade, migration or removal.

For exact recursive fields use [Schema authorities](schemas.md). For package
owners versus grants use [Roles and package ownership](roles-and-package-ownership.md).
For retained data use [Stores and retention](stores-and-retention.md). This
page routes contract changes; it is not a migration command or an all-contract
compatibility guarantee.

## Keep identity layers separate

| Identity | What it selects | What it does not prove |
| --- | --- | --- |
| Logical contract ID, for example `kubeclaw.prism-design-engine@1` | A named interface agreed by its selected producer/consumer | Every document, database or package uses record version 1 |
| Plugin API `pipeline-plugin-v2` | The extension API/envelope generation | A package's semantic version or permission to activate it |
| `packageVersion`, plugin ID, registration ID | Installed package version and exact stage/observer/adapter/provider/report owner | Equal registration labels across packages grant the same authority |
| Content digest | Exact selected bytes under their defined digest algorithm | Compatible behavior, an authorized caller or a migration |
| JSON `$id`, schema path, embedded pointer | A validator document/definition namespace | The source filename alone is the runtime-selected authority |
| Record `schemaVersion` or `schema` marker | The exact record/document variant dispatched by the reader | A newer writer is readable by an older reader |
| Semantic/artifact encoding | Rules for meaning, ordering and serialized-byte identity | A different encoding preserves the same digest by renaming its label |
| SQL migration name | A selected database change recorded by the migration runner | Contract ID/version or a checksum of previously applied SQL bytes |
| Deployed image or source revision | Executable/source identity for a component | All its external reader/writer pairs or stored records are compatible |

Semantic version numbers describe package releases. They do not replace exact
content and registration identity. A digest is a hash binding to selected bytes;
retain its encoding and source, not only the hexadecimal text.

**Source — package/API/content/registration identity:**
[packageIdentity / packageResolution](../../../skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L162-L188) (`skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json:162-188`, current-checkout SHA-256 `837efd7975991aa21b8c92b57881194e9bc8c7adc4370f238d1a15b6d85d44db`). [manifest API and distinct registration arrays](../../../skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L413-L455) (`skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json:413-455`, current-checkout SHA-256 `837efd7975991aa21b8c92b57881194e9bc8c7adc4370f238d1a15b6d85d44db`).

## Read the direction, not just the version number

- **Write:** a named current producer creates this format for new work.
- **Read:** a named reader validates and consumes this format in a selected route.
- **Recover:** a reader can continue retained state with the required original
  graph, package, configuration and semantic identities. Readability alone is insufficient.
- **Reject:** the boundary stops rather than guessing a conversion.
- **Unestablished direction:** this finite source set does not prove the writer,
  reader, downgrade, conversion or retirement route. Do not infer support.

[Configuration compatibility](configuration-compatibility.md) gives the detailed
artifact-specific vocabulary. No row below promises universal migration or
rollback between arbitrary versions.

## Current finite producer-to-consumer matrix

| Family / identity | Producer and selected validator/consumer | Supported direction and explicit boundary | Detailed route |
| --- | --- | --- | --- |
| Plugin extension: `pipeline-plugin-v2`, `pipeline-definition.v2`, `stage-result.v2` | Installed manifest owns package-local modules/schemas; Nova validates stage config/input, then stage result; observer checkpoint validation has its own value subset | Current selected v2 shapes, exact installed registration and grants. Stage, observer, adapter, test-provider and report-adapter interfaces are not interchangeable. No blanket package transition follows | [Extension contracts](../extend/contracts.md), [pipeline definition](pipeline-definition.md), [plugin fields](plugin-configuration.md) |
| Nova snapshots: `run-snapshot.v1`–`v4`, `execution-graph-snapshot.v2`/`v3` | Current snapshot writer creates v4; reader validates the retained version and rebuilds graph with the stored graph version before digest comparison | v1/v2 reject newer profile fields; v3 requires runtime dispatch profile and rejects review cache profile; v4 requires both. Recovery also checks exact package set/content/runtime configuration. No automatic migration or universal downgrade | [Nova Core](../understand/nova-core.md), [compatibility](configuration-compatibility.md) |
| Buster provider/report and remote plan | Selected provider executes invocation; report adapter separately normalizes artifacts; test-gate validator adds per-definition semantic relations | Logical provider/report IDs come from installed registrations/plans. Durable `buster-plan-status.v1`, job-record/header/compacted-record and compaction-receipt formats do not enumerate all provider contracts. Compaction is a guarded retained-data change, not wire compatibility | [Buster](../understand/buster.md), [suites](buster-suites.md), [provider configuration](buster-provider-configuration.md) |
| Worker resource protocol | Executor dispatches envelope v3, then v2, otherwise the base validator; Prism worker service admits v3 | Actual validator rejects unsupported shapes; do not interpret the fallback as every version being accepted. v3 task accounting differs from v2 process accounting; absence is not zero. Complete producer/result upgrade pairs remain to be traced | [Worker Core](../understand/worker-core.md), [worker profiles](worker-profiles-and-roles.md) |
| Prism design engine and baseline | `kubeclaw.prism-design-engine@1`; `validatePrism` selects baseline v2 only when the actual marker is `prism.baseline-bundle.v2`; operation application validates input and resulting document | Logical ID, generated document validator, operation revision and SQL migration history are distinct. Other engine/control/publication compatibility directions are not all established here | [Prism runtime](../understand/prism-runtime.md), [schemas](schemas.md) |
| Delivery manifest v2/v3 | Project-summary producer returns v2 when delivery encoding is absent; otherwise calls v3 creator | `delivery-manifest.v3`, semantic `delivery-manifest.utf16-v1` and artifact encoding are distinct. Closed v3 keys and recursive relations apply. This producer branch does not prove every downstream reader, converter or safe removal direction | [Nova project](nova-project.md), [compatibility](configuration-compatibility.md) |
| Durable adapter records/stores v1/v2 | Record replay checks version/owner; explicit retirement selects current v2 records under domain and store fences | v1 header has no owner; v2 requires a valid owner. Supported read/replay does not authorize retirement. Tombstones retain replay identity without payload; no general age-based garbage collection or blob deletion follows | [Stores and retention](stores-and-retention.md), [recovery](../use/recovery.md) |
| Telemetry/agent envelopes | Active lifecycle/domain v2 and separate host schema 1; delivered flat telemetry v1 remains a distinct asset | An equal version number does not join these envelopes. Retained flat assets do not implement ingestion, ordering, retention or authentication; external reader applicability must be assessed before removal | [Telemetry](../understand/telemetry.md), [retained contract source](../../../contracts/telemetry/v1/README.md) |

**Source — actual extension callers:**
[package-local registration module/schema acquisition](../../../skills/common/plugin-runtime/foundation/registry/build.ts#L32-L70) (`skills/common/plugin-runtime/foundation/registry/build.ts:32-70`, current-checkout SHA-256 `c65248d6d4dc09dcfe762e9cddd6dd27d5864cbdab7cc421d87256e712873867`). [stage config/input validation](../../../skills/nova/core/execution/runner.ts#L40-L46) (`skills/nova/core/execution/runner.ts:40-46`, current-checkout SHA-256 `9a34098cd68460f42e220ada2f3e7bef37fcc9eb5fdd351db2cd1585fe6a5cc6`). [returned stage result validation](../../../skills/nova/core/execution/stage-executor.ts#L35-L48) (`skills/nova/core/execution/stage-executor.ts:35-48`, current-checkout SHA-256 `4c846993c679c9ce663f7dda0e8de78fd26101e83948dd17211e62f83ea2eafb`). [checkpoint sequence/eventId validation](../../../skills/nova/core/telemetry/observers.ts#L51-L58) (`skills/nova/core/telemetry/observers.ts:51-58`, current-checkout SHA-256 `b46b9a70b190bf8541d96188221a63acc1e9c03ff6204a9e94b37c944306aafd`).

### A readable snapshot can still be unrecoverable with changed inputs

The current writer creates `run-snapshot.v4`. The reader accepts explicitly
listed retained snapshot versions and validates their profile fields. It does
not add newer profile fields to old bytes to make them current. Snapshot
version 1 also uses its version-specific digest serialization; retained graph
v2/v3 is rebuilt using the stored graph marker before digest comparison.

Recovery then checks the registry dependency-identity format, original package
set and content, effective runtime configuration and supported explicit package
upgrade evidence. A schema-valid snapshot with changed runtime authority can
therefore reject. Use original pinned runtime where required; do not edit the
stored digest or start a new identity and call it recovery.

**Source — exact snapshot read/write and recovery pins:**
[retained versions, profile checks and v4 writer](../../../skills/nova/core/execution/engine-snapshots.ts#L68-L118) (`skills/nova/core/execution/engine-snapshots.ts:68-118`, current-checkout SHA-256 `50dfe92e656875658b7604f30012f8493564729473f6ddd65b64960ecf9946fd`). [package/runtime recovery checks](../../../skills/nova/core/execution/engine-snapshots.ts#L28-L41) (`skills/nova/core/execution/engine-snapshots.ts:28-41`, current-checkout SHA-256 `50dfe92e656875658b7604f30012f8493564729473f6ddd65b64960ecf9946fd`).

### Shape validation and semantic checks are separate

Buster's contract checker first applies its selected schema, then the
per-definition relations for plans, reports, attempts, results, coverage and
status. The provider execution interface owns cleanup/termination/resources;
report reading and normalization has separate limits. Neither can be replaced
with a stage-result schema because both return JSON.

**Source — Buster validator and caller boundaries:**
[checkPipelineTestGateContract semantic dispatch](../../../contracts/pipeline-test-gate/v1/src/validation.ts#L250-L277) (`contracts/pipeline-test-gate/v1/src/validation.ts:250-277`, current-checkout SHA-256 `0932fe19bc79f5dba2a63842cf7892ac6ae0ea6885ed2efb36ac4f2e70b4b69a`). [LoadedTestProvider / TestProviderLoader](../../../skills/buster/engine/test-gates/provider-loader.ts#L14-L39) (`skills/buster/engine/test-gates/provider-loader.ts:14-39`, current-checkout SHA-256 `8453535b799916c74d2f036ca09a5bc973f600eb402ade0da57f93ab24ab6c85`). [ReportArtifactReader and runtime limit interface](../../../skills/buster/engine/test-gates/report-adapter-runtime.ts#L1-L32) (`skills/buster/engine/test-gates/report-adapter-runtime.ts:1-32`, current-checkout SHA-256 `0675902bcfebf7842d10eade9965c1b49d21e2083acaa9a7b7e6f03c248e24a9`).

**Source — version-specific Worker, Prism and delivery consumers:**
[Worker envelope validator dispatch](../../../skills/worker/core/worker/attempt-executor.ts#L188-L203) (`skills/worker/core/worker/attempt-executor.ts:188-203`, current-checkout SHA-256 `2ae7f5897a79042c601d58da5af682baba0e416e0c4ab302108386e3b619db42`). [Prism v3 attempt admission](../../../skills/prism/server/worker-service.ts#L89-L94) (`skills/prism/server/worker-service.ts:89-94`, current-checkout SHA-256 `90174f5edf19c85ef1642da95a51aac46854f9a1ce7172d876045a5bac1595e4`). [Prism contract ID and baseline marker dispatch](../../../contracts/prism/v1/src/index.ts#L34-L65) (`contracts/prism/v1/src/index.ts:34-65`, current-checkout SHA-256 `441cbe7b6ad9c471c3d8144de958497377d3785cff53904ac45943cfaf4a7c18`). [applyOperation input/revision/result validation](../../../skills/prism/domain/index.ts#L103-L113) (`skills/prism/domain/index.ts:103-113`, current-checkout SHA-256 `710ff6fd047d301aef22477cb8cdecfd1fe1c9bd224c069abc6af9d805462838`). [conditional v2/v3 delivery producer](../../../skills/nova/plugins/project-summary/src/summary.ts#L155-L164) (`skills/nova/plugins/project-summary/src/summary.ts:155-164`, current-checkout SHA-256 `bb82063929e9100dd42c3dff541eca77be2cfa624f8b5fd8733e773acb7ce7c5`). [delivery version and semantic/artifact encoding](../../../contracts/delivery-manifest/v3/src/index.ts#L14-L17) (`contracts/delivery-manifest/v3/src/index.ts:14-17`, current-checkout SHA-256 `5293ab3d5813e814487011bd80cad516bc3d1f5faec1181c86675505fa8ba294`). [closed v3 manifest validation](../../../contracts/delivery-manifest/v3/src/index.ts#L208-L224) (`contracts/delivery-manifest/v3/src/index.ts:208-224`, current-checkout SHA-256 `5293ab3d5813e814487011bd80cad516bc3d1f5faec1181c86675505fa8ba294`).

## Plan a change or retirement

Retirement removes old data or an interface only after its readers and retained
work no longer require it. Migration is a defined transformation with its own
writer, destination, validation and recovery procedure. Neither follows solely
from publishing a newer schema or package.

1. Record the exact current writer, logical ID, record version, encoding,
   content digest, installed registration and known internal/external readers.
2. Identify active and retained runs/records that pin the old authority. Keep
   original package bytes and required credentials, keys, profiles and readers.
3. Establish the supported direction with the actual consuming validator and
   semantic rules. Stop if conversion, downgrade, external reader or recovery
   applicability is unknown; do not relabel bytes as a newer version.
4. Preserve a consistent data group and writer fence using
   [Recovery](../use/recovery.md). A fence prevents conflicting owners from
   writing; a lock-file name alone does not establish that work stopped.
5. Use only the component's supported migration or drain procedure. Retain
   original input/output identities, first diagnostic and partial failures.
6. Before removal, verify recovery through the original application readers
   and required external consumers. Schema syntax or a native database check
   alone is not that proof. Keep unresolved readers and cleanup ownership visible.

One narrow example: the notification observer README directs retained runs
that enabled its retired audit registration to drain with their pinned runtime.
The current registrations are `notifications` and `preview-delivery`, with
separate grants/attempts/checkpoints. That does not establish historical
consumer absence, a universal retirement date or permission to delete journals.
Audit also has the physical acquisition effects described in
[Stores and retention](stores-and-retention.md#audit-and-inspection-are-not-universally-write-free).

**Source — explicit durable version/retirement boundary and pinned-run example:**
[record/store versions, owner and retirement identity](../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts#L1-L54) (`skills/common/plugin-runtime/foundation/observability/record-retirement.ts:1-54`, current-checkout SHA-256 `00a081bdccc917067eeabea36d6438615aada22c637e4d7f42e3852285647681`). [retire exact records with reauthorization and tombstones](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts#L134-L174) (`skills/common/plugin-runtime/foundation/observability/durable-records.ts:134-174`, current-checkout SHA-256 `c9a0c42b8cdd3a2f188ec38a3cab5270d0f032444801626ea2c6860e534582dd`). [current registrations and pinned-runtime drain guidance](../../../skills/common/plugins/notification-observer/README.md#notification-observer) (`skills/common/plugins/notification-observer/README.md:1-15`, current-checkout SHA-256 `64235a03c137827e4ef3db5cfa0313374a46f470bf91a86fbb7335fd8d99d52f`).

## Failure and coverage limits

If a consumer rejects a marker, digest, profile, package set or relation,
retain that original diagnostic and exact bytes. Correct the intended producer
or use the supported original runtime; do not weaken validation, fabricate an
empty accounting field or rewrite retained state to make it load.
A partial migration needs its domain owner and supported recovery route before
writers resume. Unknown external consumers are a stop condition for removal.

The eight families above are source-bounded examples with concrete selected
callers, not an exhaustive inventory of logical IDs, schemas, embedded
validators, all engine operations or every writer/reader pair. Other host,
OpenClaw/Codex, operations and external contract roots remain to be reconciled.
Current generated inventories do not generate this authored central hub.
Use [Documentation maintenance](../extend/documentation-maintenance.md) when a
contract, reader, version or removal route changes. We ran no validator, upgrade,
retirement, migration or recovery for this page.
