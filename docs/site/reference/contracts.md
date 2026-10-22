# Contracts, Versions, and Compatibility

Status: source-backed reference; execution and external-reader limits stated below
Audience: operator, developer, plugin author, maintainer
Owner: documentation; named contract and store components own behavior
Evidence: skills/common/plugins/transport-publisher/src/adapter.ts; skills/common/plugin-runtime/foundation/observability; skills/common/plugins/operator-messaging/src; skills/nova/plugins/review/src; contracts/prism/v1/src/baseline-archive.ts; skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json; skills/nova/core/execution/engine-snapshots.ts; contracts/prism/v1/src/index.ts; contracts/delivery-manifest/v3/src/index.ts; skills/common/plugin-runtime/foundation/observability/record-retirement.ts
Applies to: supported product contract families, selected producer/reader versions and retained-state compatibility
Last verified: 2026-10-21; source and focused local compatibility tests; no deployed migration or recovery

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

## Current producer-to-consumer matrix

| Family / identity | Producer and selected validator/consumer | Supported direction and explicit boundary | Detailed route |
| --- | --- | --- | --- |
| Plugin extension: `pipeline-plugin-v2`, `pipeline-definition.v2`, `stage-result.v2` | Installed manifest owns package-local modules/schemas; Nova validates stage config/input, then stage result; observer checkpoint validation has its own value subset | Current selected v2 shapes, exact installed registration and grants. Stage, observer, adapter, test-provider and report-adapter interfaces are not interchangeable. No blanket package transition follows | [Extension contracts](../extend/contracts.md), [pipeline definition](pipeline-definition.md), [plugin fields](plugin-configuration.md) |
| Nova snapshots: `run-snapshot.v1`–`v4`, `execution-graph-snapshot.v2`/`v3` | Current snapshot writer creates v4; reader validates the retained version and rebuilds graph with the stored graph version before digest comparison | v1/v2 reject newer profile fields; v3 requires runtime dispatch profile and rejects review cache profile; v4 requires both. Recovery also checks exact package set/content/runtime configuration. No automatic migration or universal downgrade | [Nova Core](../understand/nova-core.md), [compatibility](configuration-compatibility.md) |
| Buster provider/report and remote plan | Selected provider executes invocation; report adapter separately normalizes artifacts; test-gate validator adds per-definition semantic relations | Logical provider/report IDs come from installed registrations/plans. Durable `buster-plan-status.v1`, job-record/header/compacted-record and compaction-receipt formats do not enumerate all provider contracts. Compaction is a guarded retained-data change, not wire compatibility | [Buster](../understand/buster.md), [suites](buster-suites.md), [provider configuration](buster-provider-configuration.md) |
| Worker resource protocol | Executor dispatches envelope v3, then v2, otherwise the base validator; Prism worker service admits v3 | Actual validator rejects unsupported shapes; do not interpret the fallback as every version being accepted. v3 task accounting differs from v2 process accounting; absence is not zero. Buster writes v1 local attempts; Prism agent launcher writes v2; native Prism writes v3. Results must match their selected envelope/profile, not merely share a protocol label | [Worker Core](../understand/worker-core.md), [worker profiles](worker-profiles-and-roles.md) |
| Prism design engine and baseline | `kubeclaw.prism-design-engine@1`; `validatePrism` selects baseline v2 only when the actual marker is `prism.baseline-bundle.v2`; operation application validates input and resulting document | Logical ID, generated document validator, operation revision and SQL migration history are distinct. The selected Control publishes archive v2; the Nova importer reads explicit archive v1/v2 with the matching manifest/checksum codec. SQL migration remains a separate forward-only operation | [Prism runtime](../understand/prism-runtime.md), [schemas](schemas.md) |
| Delivery manifest v2/v3 | Project-summary producer returns v2 when delivery encoding is absent; otherwise calls v3 creator | `delivery-manifest.v3`, semantic `delivery-manifest.utf16-v1` and artifact encoding are distinct. Closed v3 keys and recursive relations apply. Summary binds its selected review semantic mode and artifact encoding separately. No automatic v2/v3 converter, historical reader upgrade or downgrade follows | [Nova project](nova-project.md), [compatibility](configuration-compatibility.md) |
| Durable adapter records/stores v1/v2 | Record replay checks version/owner; explicit retirement selects current v2 records under domain and store fences | v1 header has no owner; v2 requires a valid owner. Supported read/replay does not authorize retirement. Tombstones retain replay identity without payload; no general age-based garbage collection or blob deletion follows | [Stores and retention](stores-and-retention.md), [recovery](../use/recovery.md) |
| Telemetry/agent envelopes | Active lifecycle/domain v2 and separate host schema 1; delivered flat telemetry v1 remains a distinct asset | An equal version number does not join these envelopes. Retained flat assets do not implement ingestion, ordering, retention or authentication; external reader applicability must be assessed before removal | [Telemetry](../understand/telemetry.md), [retained contract source](../../../contracts/telemetry/v1/README.md) |
| Optional demo product decision | Prism records an operator intent, signs `demo-product-decision.v1` inside `demo-product-decision-envelope.v1`, and sends it to the configured controller | Enabled only by `PRISM_PRODUCT_DECISIONS_ENABLED=true`. Status recovery reuses the recorded signed envelope; it does not issue a replacement decision. No automatic version conversion or retirement is established | [Decision wire contract](#optional-demo-product-decision-wire-contract) |

**Source — actual extension callers:**
[package-local registration module/schema acquisition](../../../skills/common/plugin-runtime/foundation/registry/build.ts#L32-L70) (`skills/common/plugin-runtime/foundation/registry/build.ts:32-70`, current-checkout SHA-256 `c65248d6d4dc09dcfe762e9cddd6dd27d5864cbdab7cc421d87256e712873867`). [stage config/input validation](../../../skills/nova/core/execution/runner.ts#L40-L46) (`skills/nova/core/execution/runner.ts:40-46`, current-checkout SHA-256 `9a34098cd68460f42e220ada2f3e7bef37fcc9eb5fdd351db2cd1585fe6a5cc6`). [returned stage result validation](../../../skills/nova/core/execution/stage-executor.ts#L35-L48) (`skills/nova/core/execution/stage-executor.ts:35-48`, current-checkout SHA-256 `4c846993c679c9ce663f7dda0e8de78fd26101e83948dd17211e62f83ea2eafb`). [checkpoint sequence/eventId validation](../../../skills/nova/core/telemetry/observers.ts#L51-L58) (`skills/nova/core/telemetry/observers.ts:51-58`, current-checkout SHA-256 `b46b9a70b190bf8541d96188221a63acc1e9c03ff6204a9e94b37c944306aafd`).

## Select the actual versioned reader

A family can contain several record markers. The rows below identify the
selection rule, not a promise that all combinations interoperate. Retained
readers and current writers can intentionally differ.

| Contract group | Actual writer and reader selection | Upgrade, rollback and retained-state boundary |
| --- | --- | --- |
| Frozen runtime dispatch and review cache profiles | SDK parsers accept exactly the generated `runtime-dispatch-profile.v1` / `json-utf16-v1` and `review-cache-profile.v1` / `review-content-cache.v2` / `json-utf16-v1` objects. Core snapshots bind their presence. | Absent historical metadata stays absent. Present malformed or extra fields reject; payload keys cannot select invocation metadata. Neither profile selects the Review semantic mode or a network protocol. |
| Review bundles, reports and governor | Review config explicitly selects `review-semantics.utf16-v1` and requires portable report artifacts. That mode writes bundle v2, report v3 and governor v2; absent mode uses bundle v1, report v2 and governor v1. | Summary checks the complete selected pair and governor digests. Its old helper also admits the exact unversioned pair when no mode is selected; this is not a historical Review-writer claim. Mixed/future versions reject. The current Review policy parser requires v2; a retained v1 schema does not imply fallback. Summary does not admit a retained `review-report.v1` merely because its bundle says v1. Policy selection is separate from bundle labels. |
| Review content cache | The selected frozen run cache profile determines `review-content-cache.v2`; absence selects v1. Artifact reader also checks corresponding outer artifact encoding and original producer. | A valid record under the other mode is an integrity failure, not a cache miss or conversion. Keep original run profile, metadata, value/record digests and artifact bytes. Do not relabel old cache bytes or confuse cache encoding with Review semantic encoding. |
| Delivery manifest | Summary writes v2 without delivery encoding and v3 with its explicit portable selection. V3 validation checks closed shape and semantic relations. | V3 alone does not select Review mode. Summary's optional review selector independently controls the bundle/report/governor pair. Preserve those selectors and source artifacts; a schema rename is not a v2-to-v3 migration. |
| Worker wire messages and accounting | Buster's local runner authors envelope/result/profile v1. Prism agent launcher uses v2 resource capability/budget/accounting v1; native Prism uses envelope/result/profile v3 with resource capability/budget/accounting v2. | `worker-protocol.v1` does not collapse these versions. Exact native result binding checks accepted attempt, claim generation, worker, profile and specification digests. V2 process limits cannot be renamed to v3 Linux-task limits; unavailable observation is not zero. |
| Worker ownership state | Store decoder reads `worker-ownership-store.v1` or v2. V1 records gain `finalObservation: null` and an unbound host; current state/writes use v2. | This explicit decoder normalization is not general wire conversion. Host binding and record transitions still reject conflicting/unresolved ownership. Retain the old store and native scope evidence; no reverse v2-to-v1 writer exists here. |
| Foundation record stores | Reader accepts `pipeline-durable-record-store.v1/v2` and their matching record rules. Unowned new records use record v1; owned records use v2. Retirement writes v2 tombstones/receipts under the owner fence. | V2 requires owner identity and validates retained tombstones. Readable v1 does not authorize retirement. No age scheduler, reverse projection or arbitrary blob deletion follows. |
| Observability admission state | New admission store begins v1. Exact retirement of an admitted entry creates v2 with retained acknowledgements; replay accepts both and validates their version-specific fields/cursors. | V2 tombstones preserve receipt identity after payload retirement. Keep original producer/run/sequence and retirement authority. Do not drop `retiredEntries` and call the result a v1 downgrade. |
| Durable Worker-attempt results | Normal store is `durable-attempt-store.v1`; governed result projection writes v2 only when references exist. Decoder resolves v2 references against the exact original journal prefix and validates reconstructed v1 state. | V2 with no projections rejects. Missing/corrupt prefix, changed metadata, digest or result reference rejects rather than inventing a completed result. This reader normalization needs the referenced journal; it is not standalone v1 backup or safe rollback. |
| Operator message requests | Normal delivery without explicit `deliveryId` records `notification-delivery-request.v1`; explicit identity records v2 with run/stage owner and exact transport body. | Receipt lookup/handoff requires the owned v2 binding; legacy v1 cannot authorize it. Separate governed request projection retains a bound terminal receipt, not permission to erase unresolved delivery or reconstruct message content. |
| Signed HTTP transport publisher | Publisher writes request, per-attempt reservation and receipt/failure v1 records; only a matching completed receipt ends publication replay without send. | These are four different state records, not versions of one event. They do not interoperate with operator-message or Redis records. Exact request conflict, attempt identity, terminal CAS and receiver reconciliation remain required; no version converter or receiver deduplication implementation exists. |
| Buster gate decisions | Gate decision v1 has no coverage field; v2 requires its bound coverage result. Original decision validator checks exact keys, node effects, coverage relations and digest. | Do not add coverage to retained v1 bytes or omit it from v2. An advisory failure, execution error, cancellation or review request cannot be converted to success by changing the marker. |
| Visual baseline manifest | The capture/visual adapter accepts browser-bound `kubeclaw.visual-baselines.v2` and checks the observed browser version. | V1 fails `VISUAL_BASELINE_MIGRATION_REQUIRED`: recapture and approve v2. Relabeling old images, borrowing a profile name or changing the expected browser string is not migration. |
| Prism archive and baseline | Current Control assembles `prism.baseline-archive.v2`, `prism.baseline-bundle.v2` and `prism.baseline-checksums.v2` with UTF-16 checksum encoding. Importer explicitly reads archive v1/v2 using the matching manifest and checksum selection. | V1 preserves its original locale-sensitive checksum bytes; v2 uses code-unit ordering. Import verifies exact file set, content and approved digest. Mixed archive/manifest/encoding rejects. Repackaging, relabeling or converting an approved digest is not supported recovery. |
| Demo readiness and decision | Controller writes `demo-readiness.v2` with explicit retention. Only actual retained v1 without `retentionSeconds` receives the historical seven-day default. Decision/status/receipt wire records remain their own v1 contracts. | V2 missing retention and v1 carrying a retention field reject. New readiness does not migrate old decisions or authorize retention extension. Preserve lease UID/generation, signed envelope and receipt; use the same reconciliation identity. |
| Lint policy, baseline and report | Native lint owns `pipeline_lint_policy.v7`, `pipeline_lint_baseline.v2` and `pipeline_lint_report.v7`; Delivery Lint is a separate stage. | Each parser checks its own marker and fields. The equal policy/report suffix does not make them interchangeable or imply earlier policy versions are accepted. Regenerate through the owning loader/report/baseline workflow; preserve original findings and first rejection. |

[Review](../understand/echo.md), [Worker Core](../understand/worker-core.md),
[configuration compatibility](configuration-compatibility.md),
[complete store contracts](../understand/data-and-state.md#complete-store-matrix),
[the signed publisher](../understand/communication.md#signed-http-transport-publisher)
and [lint policy](lint-policy.md) own the detailed procedures and inputs.

> **Source — actual selected writers, retained readers and rejection branches**
>
> [Exact invocation profile parser and binding](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugin-runtime/sdk/src/runtime-dispatch-profile.ts#L1-L29).
>
> [Exact cache profile and historical absence](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugin-runtime/sdk/src/review-cache-profile.ts#L1-L17).
>
> [Review mode selection and bundle version guard](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/review/src/review-semantics.ts#L1-L50).
>
> [Actual Summary legacy and selected semantic-pair consumer](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/project-summary/src/review-semantics.ts#L1-L49).
>
> [Run-selected cache version rejects a mismatched record](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/review/src/review-content-cache.ts#L144-L171).
>
> [Current exact policy version, keys and semantic validation](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/review/src/review-policy-parser.ts#L254-L273).
>
> [Actual ownership-store legacy normalization and v2 state](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/worker/core/worker/ownership-state.ts#L97-L122).
>
> [Admission v1/v2 replay shape and cursor validation](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugin-runtime/foundation/observability/replay-validation.ts#L91-L109).
>
> [Attempt-store v1/v2 decoding and journal-bound projections](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugin-runtime/foundation/observability/attempt-projection.ts#L113-L151).
>
> [Legacy versus owned request producer and receipt reader](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/operator-messaging/src/delivery-records.ts#L14-L50).
>
> [Lookup rejects unbound legacy ownership](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/operator-messaging/src/delivery-records.ts#L83-L113).
>
> [Real v1 baseline rejection and v2 browser identity](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/buster/plugins/visual/src/browser-identity.js#L1-L23).
>
> [Version-specific checksum bytes and archive assembly](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/contracts/prism/v1/src/baseline-archive.ts#L33-L65).
>
> [Current Control explicitly selects archive v2](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/prism/server/control-server.ts#L749-L764).
>
> [Original importer dispatch and checksum/file/digest checks](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/prism-design/src/archive.ts#L17-L51).
>
> [Historical v1 retention versus explicit v2](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/cmd/buster-namespace-controller/demo-retention.go#L23-L43).
>
> [Publisher request, completed receipt and attempt reservation](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/transport-publisher/src/adapter.ts#L197-L253).
>
> [Publisher receipt/failure CAS and retained terminal outcomes](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/transport-publisher/src/adapter.ts#L283-L339).
>
> **Claim:** Compatibility follows each actual producer and retained reader, including selected versions, supported normalization and explicit rejection.
>
> **Implementation:** The linked profiles, journals, caches, envelopes and archives expose their owning version branches.
>
> **Contract or setting:** Run-selected versions, exact identities and original-reader rules govern compatibility; legacy normalization is not universal migration.
>
> **Test evidence:** No new migration, rollback or retained-reader execution accompanies these source links; existing chapter evidence retains its recorded scope.
>
> **Limit:** Changing a tag or rewriting retained bytes does not create compatibility; preserve original readers and stop at unsupported transitions.
>
> **Revision:** `0e35889a3c4e65d5c47ba88e924611aace67eb1d`. Source bindings, not execution receipts.

### Publisher records do not migrate one another

The four markers are `transport-publication-request.v1`,
`transport-publication-reservation.v1`, `transport-publication-receipt.v1` and
`transport-publication-failure.v1`. The same configured publisher writes and
reads them in `publications/<target>` under its delivery root.

Request append precedes Secret resolution and network transmission. The record
key hashes the publication key; replay first checks the same normalized request.
The terminal key additionally binds the attempt. Receipt/failure transition
uses the reserved record digest; a racing accepted receipt wins over failure.
A completed receipt can replay, but retained failure blocks only that attempt.
An unresolved reservation or a new attempt can send again under the original
publication key. Receiver deduplication remains a separate receiver contract.

These private records contain message or diagnostic data, not canonical events.
Retain the complete store and effect/receiver evidence before changing writers.
Drain old consumers before changing endpoint, Secret, grants or root. No
publisher version-migration, downgrade, retirement or restore command exists.
Do not delete a record, invent a new key or copy an ACK into another protocol.

## Contract families and their canonical owners

Use the following ownership boundaries for identities that do not need a
version conversion. A logical ID such as `kubeclaw.*@1` selects a producer/reader
interface, not the enclosing artifact's record version. A schema-only asset
and a currently composed runtime path remain different support classes.

| Authority family | Producer, validator and consuming boundary | Compatibility and change route |
| --- | --- | --- |
| SDK/plugin lifecycle, provenance, effects, waits, locks and state | The plugin-system v2 schema/SDK owns closed definitions; Core/registry/effect/observer readers select the named definition. Plugin-owned config/input/output schemas remain package-local. | Preserve definition, registration, grants, source/content identity and run snapshot. `effect-request.v2`, `effect-receipt.v2`, `resume-signal.v2` and `plugin-state-entry.v2` are not interchangeable records. Use [SDK](sdk.md) and [extension contracts](../extend/contracts.md). |
| Buster engine, provider, fixture, report and evidence contracts | Actual installed manifest and plan select logical provider IDs; test-gate validators add semantic relations and original result/import checks. | Common input/output JSON does not erase provider-specific shape or evidence identity. Retain plan/worker/result/source package pairing. See [Buster suites](buster-suites.md), [providers](buster-provider-configuration.md), [Buster](../understand/buster.md). |
| Forge implementation, Echo review, architecture and Blueprint artifacts | The selected stage assembles requests, dispatches the granted runtime and validates exact returned shape/source identity before storing artifacts. | Gateway session/result collection is not the generic HMAC runtime registration. A parser-valid artifact does not approve a source or make partial Git mutation transactional. See [Forge](../understand/forge.md), [Echo](../understand/echo.md), [project contract](nova-project.md) and their exact package schemas. |
| Core reporting and JUnit evidence | Reporting stages consume original terminal Core history/artifacts with source-mode, producer and digest bindings. | Source-run outcome and reporting-attempt outcome remain separate. Preserve pinned runtime and original history; no rewrite of ambiguous old records. See [Reports](../extend/deep-guides/reports.md). |
| Prism logical engine, operations, jobs, preferences and publications | The Prism contract package selects engine definitions; domain/Control/storage add revisions, job fences, authorization and SQL state. Archive import has its separate versioned codec above. | Logical engine ID, document version and migration filename differ. Keep matched database/artifact state and original operation/job identity. See [Prism runtime](../understand/prism-runtime.md), [data](../understand/prism-data.md) and [schemas](schemas.md). |
| Pipeline observability and direct host ingress | Producer/admission/closure contracts and their exact journal/store readers differ from plugin lifecycle v2, host schema1 and retained flat telemetry v1. | ACK, canonical cursor, closure, checkpoint and projection are different authorities. Preserve reference journals and delivery identity. See [Telemetry](../understand/telemetry.md) and [stores](../understand/data-and-state.md). |
| Retained flat telemetry assets | Catalog supplies53event types; source payload schemas produce flat event schemas,16bundle schemas, types and content manifest. No active flat-v1 runtime producer/consumer is established. | Regeneration is asset validation, not ingestion or v1-to-v2 conversion. Unknown external readers block removal; see [retained assets](../understand/telemetry.md#what-the-retained-v1-asset-contains). |
| Role and release metadata | Runtime role/package-ownership/external-capability manifests select bundled modules and entrypoints; release/image/bundle receipts bind actual content. | A shipped package is not activated. Source/image/bundle revisions are not wire protocol versions. Preserve selected receipt/content and rerun the owning build/release verifier; see [roles](roles-and-package-ownership.md), [images](images-and-digests.md). |
| Upstream host and network interfaces | Pinned OpenClaw/Codex, MCP, Kubernetes, SQL, Git/OCI and provider clients own their external protocol schemas. KubeClaw owns its configured grants, exact authenticated targets, payload wrappers and durable correlations. | Follow the selected upstream version and KubeClaw receiving adapter. An arbitrary HTTP200, tool name or container version proves no cross-version compatibility. See [OpenClaw](../understand/openclaw.md), [Codex](../understand/codex-integration.md), [Ops](../understand/ops-mcp.md), [communication](../understand/communication.md). |

### Optional demo product decision wire contract

The feature flag controls availability, not contract identity. When enabled,
Prism requires an explicit operator allowlist, HTTPS origins, a dedicated Ed25519
signing key, and controller CA/token files. Session authorization and mutation
Origin/CSRF checks precede recording. Disabled routes return HTTP 404.

| Layer | Marker and exact binding |
| --- | --- |
| Operator intent | Closed fields `decisionId`, `action`, `reason`, `subject`; `extensionSeconds` only for `extend`. Actions are `accept` or `extend`. The ID is a lowercase hexadecimal UUID-shaped string. Reason is nonblank and at most 2000 UTF-8 bytes. Extension is an integer from 1 through 9223372036 seconds. |
| Subject | Required `leaseName`, `leaseUID`, `sourceRevision`, `candidateDigest`, `resultDigest`, `readyDigest`, `generation`, `expectedExpiry`, `expectedRevision`, `url`, `runId`. Generation is a positive safe integer; other fields are nonempty strings of at most 2048 characters at this parser boundary. This does not establish controller-side digest or lease acceptance. |
| Signed payload | `demo-product-decision.v1`: subject fields except `url` and `runId`, plus `issuer`, `actorId`, decision/action/reason, `issuedAt`, `expiresAt`, and extension seconds only for `extend`. Expiry is bounded by five minutes and the operator session, rounded down to whole seconds. |
| Envelope | `demo-product-decision-envelope.v1`, base64 payload bytes and base64 signature. Ed25519 signs the UTF-8 domain `kubeclaw.demo-product-decision.v1` followed by one NUL byte and the exact JSON payload bytes. The payload digest is SHA-256 of those bytes, not the envelope. |
| Receipt | `demo-product-decision-receipt.v1`; Prism checks decision/payload/actor/issuer/lease/ready/generation bindings, action and expected state, previous and resulting expiry, applied timestamp, and equality of the recorded envelope. A returned object alone is not accepted as a bound receipt. |

Prism durably records the intent and envelope before reconciling with the
controller. It requests `/v1/demo-product/status` using
`demo-product-status-request.v1`; on failure it resends the identical envelope
to `/v1/demo-product/decisions`. An unconfirmed result remains `pending` (HTTP
202). Recover the same decision through its operator-owned recovery route;
do not create a replacement to resolve a lost response.

A reused decision ID must match the recorded actor and normalized intent digest.
Changing an intent under the same ID is rejected. Preserve the original envelope,
receipt, issuer verification material, and lease identity while reconciliation or
retained audit readers require them. These sources establish the current Prism
writer and receipt reader, not a future-version converter, downgrade, key-removal
schedule, or safe deletion procedure. Stop retirement until those consumers and
outstanding decisions are reconciled. No live controller execution is claimed.

**Source — current Prism decision boundaries:** [intent, feature configuration and signer](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/prism/control/product-decisions.ts#L6-L72).
[receipt binding and identical-envelope reconciliation](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/prism/server/product-decisions.ts#L9-L42).
[durable intent identity and receipt conflict checks](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/prism/storage/product-decisions.ts#L9-L29).

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

## Check the selected compatibility boundary

Use the owning component's tests before changing either side of a contract.
The following local checks exercise actual current/retained readers and negative
version, identity, digest or mode cases. They need repository dependencies,
Node 24 and Linux with `flock`; archive locale tests use the Node Intl runtime.
They do not require a cluster or prove a deployed upgrade.

```bash
env -u SWARM_CONFIG -u NODE_ENV node --test \
  tests/verification/reliability/runtime-dispatch-profile.test.mjs \
  tests/verification/reliability/review-cache-profile.test.mjs \
  tests/verification/reliability/review-semantic-summary.test.mjs \
  tests/verification/reliability/worker-ownership-store.test.mts \
  tests/verification/integration/prism-baseline-archive.test.mts \
  tests/verification/reliability/review-semantic-inner-owners.test.mjs \
  tests/verification/reliability/operator-projection-independent.test.mjs \
  tests/verification/reliability/attempt-projection-recovery.test.mjs
```

The two test groups passed 39 tests on 2026-10-21 with no skipped cases. Inherited
fixture settings were removed for these commands; this is not a product
configuration migration. A failed compatibility test must retain its first
error and original bytes. Repair the owning writer/reader or use its supported
pinned runtime; do not weaken a schema to obtain a passing fixture.

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

The matrices separate current write/read paths, retained readers, schema-only
assets and externally owned protocols. They do not promise compatibility with
future versions or prove unknown external readers absent. A new contract or
reader must join its actual owner and compatibility direction before activation.
This authored hub delegates exact fields to canonical schemas and explanations;
it does not create a second manually copied schema inventory. Generated config
freshness and live interoperability remain separate checks.
Use [Documentation maintenance](../extend/documentation-maintenance.md) when a
contract, reader, version or removal route changes. Focused local contract and reader tests cover their stated compatibility branches.
No deployed upgrade, retirement, migration or recovery ran for this page.
