# D17: Plugin settings — bounded source inventory

Status: read-only inventory, independent review pending. No production change,
runtime test, deployment or CONFIG completion is claimed. This extends the
[platform inventory](config-platform-inventory-20260921.md) into seven concrete
common plugins. It does not replace the complete F1 inventory or D17 migration.

## Scope and what “active” actually means

The current repository manifest roster contains 48 packages and 26 adapter or
observer registrations. This slice traces eight registrations in seven packages;
the other 18 registrations are listed explicitly in the
[roster](../../evidence/config-plugin-settings-inventory-20260921/registrations.json).
These counts come from parsed manifests and named registration objects, not a
count of regex matches. They describe repository registrations, not live activity
or all externally installable packages.

Nova's real `--platform` callers select a `pipeline-platform.v2` file. No committed
selected production Nova platform profile was found in the inspected config,
Docker and CLI paths. Buster's real entrypoint generates `platform.json` with
`activeAdapters: []`, `adapters: {}`, `observers: {}`, `providers: {}` and `grants: {}`;
that Buster consumer uses registry discovery, not this Nova adapter chain. A
runtime-selected external profile is required to identify which registrations
are actually active in a deployment. No test profile is relabeled production.

The actual Nova activation chain is:

1. [engine-runtime.ts](../../../../skills/nova/core/execution/engine-runtime.ts)
   enables explicitly selected adapters, every configured observer, and stage
   owners selected by the pipeline definition.
2. [capabilities.ts](../../../../skills/common/plugin-runtime/foundation/registry/capabilities.ts)
   recursively enables explicitly selected capability providers and requires
   registration-specific grants. A sole available provider is **not** silently
   selected: missing provider policy still fails.
3. [configuration.ts](../../../../skills/common/plugin-runtime/foundation/registry/configuration.ts)
   checks the selected registration schema. Missing adapter/observer config is
   passed as `{}`. [AdapterStarter](../../../../skills/nova/core/execution/adapter-startup.ts)
   validates again and passes that configuration to the actual plugin factory.
4. [observer-delivery.ts](../../../../skills/nova/core/telemetry/observer-delivery.ts)
   passes configured observer values, or `{}`, into the invocation context.
   The actual plugin then consumes those values.

[Schema validation](../../../../skills/common/plugin-runtime/foundation/registry/schema.ts)
has separate nonmutating `validate` and default-applying `resolve` functions.
These adapter/observer callers use `validateReferencedValue`, not the resolving
function. Consequently the schema defaults below are annotations on this path;
the plugin decoder supplies the effective missing-value fallback. Test-provider
resolution is a separate default-applying path and remains outside this slice.

## Inspected registrations and proposed sole owners

All proposed files are future authors under the existing central config
namespace, not files created or consumed by this inventory. Each plugin has one
file; multiple registrations use separate explicit sections within that file.
Activation, provider selection and caller grants belong to the orchestrator's
policy file and reference these plugin owners, rather than copying their values.

| Registration | Productive function when enabled | Proposed sole plugin file |
| --- | --- | --- |
| `kubeclaw.operator-messaging:operator` | `src/adapter.ts::activate/deliver/lookupReceipt` | `charts/kubeclaw/files/config/plugin-operator-messaging.config.json` |
| `kubeclaw.wait-store:waits` | `src/adapter.ts::activate/invoke` | `charts/kubeclaw/files/config/plugin-wait-store.config.json` |
| `kubeclaw.notification-observer:notifications` | `src/observer.ts::observe` | `charts/kubeclaw/files/config/plugin-notification-observer.config.json` |
| `kubeclaw.notification-observer:preview-delivery` | `src/observer.ts::deliverPreview` | Same notification plugin file, distinct registration section |
| `kubeclaw.telemetry-observer:telemetry` | `src/observer.ts::observe` | `charts/kubeclaw/files/config/plugin-telemetry-observer.config.json` |
| `kubeclaw.network-http:http` | `src/adapter.ts::activate/invoke/performRequest` | `charts/kubeclaw/files/config/plugin-network-http.config.json` |
| `kubeclaw.secret-resolver:secrets` | `src/adapter.ts::activate/invoke` | `charts/kubeclaw/files/config/plugin-secret-resolver.config.json` |
| `kubeclaw.telemetry-store:telemetry` | `src/adapter.ts::activate/invoke` | `charts/kubeclaw/files/config/plugin-telemetry-store.config.json` |

Relative plugin source paths in this table start at `skills/common/plugins/<name>/`.
The roster binds each exact manifest, module and schema path. The machine-readable
[field inventory](../../evidence/config-plugin-settings-inventory-20260921/settings.json)
records 31 schema field patterns, not 31 total deployed values: target/name maps
can contain multiple values, and notification configuration is per registration.
[Schema coverage](../../evidence/config-plugin-settings-inventory-20260921/schema-field-coverage-check.json)
checks every top-level field of all seven schemas and every Operator target key.

## Exact field and fallback inventory

The current author for these plugin config objects is the selected platform
file's `adapters` or `observers` map. “None” below means no supplied replacement;
it does not mean an authored JSON null. Secret values remain external.

| Plugin and field | Current missing-value behavior | Actual effect and unit |
| --- | --- | --- |
| Operator `deliveryRoot` | Required, no fallback | Durable delivery store path |
| Operator `maximumDeliveryRecords` | 100,000; also schema default | Maximum retained record count |
| Operator `maximumDeliveryBytes` | 268,435,456; also schema default | Whole durable store byte limit |
| Operator `targets.*.endpoint` | Required with `tokenSecret` in direct mode | Absolute HTTP(S) delivery URL |
| Operator `targets.*.tokenSecret` | Required in direct mode | Secret identity, not token content |
| Operator `targets.*.endpointOrigin` | Required with `endpointSecret` in confidential mode | Allowed origin of resolved secret endpoint |
| Operator `targets.*.endpointSecret` | Required in confidential mode | Secret identity containing endpoint |
| Operator `targets.*.receiptEndpoint` | None; receipt lookup disabled | Optional same-origin receiver receipt URL |
| Operator `targets.*.maxPayloadBytes` | 65,536; also schema default; permitted 1–1,048,576 | UTF-8 serialized payload bound in `parsePayload` |
| Operator `targets.*.format` | `json`; also schema default | `json` or Discord webhook rendering/receipt behavior |
| Wait `root` | Required, no fallback | Durable Wait store path |
| Wait `maxEntryBytes` | 1,048,576; also schema default | Maximum canonical durable payload bytes |
| Wait `maximumRecords` | 100,000; also schema default | Retained record count |
| Wait `maximumStoreBytes` | 268,435,456; also schema default | Whole durable store bytes |
| Telemetry store `root` | Required, no fallback | Durable telemetry store path |
| Telemetry store `maxRecordBytes` | 1,048,576; also schema default | Projection and canonical payload byte bound |
| Telemetry store `maximumRecords` | 100,000; also schema default | Retained record count |
| Telemetry store `maximumStoreBytes` | 268,435,456; also schema default | Whole durable store bytes |
| HTTP `allowedOrigins` | Required, no fallback | Provider endpoint-origin allowlist |
| HTTP `allowedMethods` | `[GET]`; also schema default | Allowed method set |
| HTTP `allowedHeaders` | `accept`, `content-type`, `idempotency-key`; also schema default | Request header allowlist |
| HTTP `maxRequestBytes` | 1,048,576; also schema default | UTF-8 serialized request body bytes |
| HTTP `maxResponseBytes` | 1,048,576; also schema default | Decompressed response bytes retained |
| HTTP `timeoutMs` | 30,000; also schema default | Actual `AbortSignal.timeout` budget, milliseconds |
| Secret resolver `environment.*` | Mapping required; missing/empty secret fails at invocation | Explicit secret-name → ENV-name reference; ENV is external secret material |
| Notification `target` | Optional in schema, but `target()` rejects absence when publishing | Operator target identity; startup validation currently does not guarantee it |
| Notification `pipelineLabel` | `KubeClaw Pipeline` in footer | Presentation string, maximum 256 JS string code units |
| Notification `modelLabel` | No model field when absent | Optional presentation string, maximum 256 code units |
| Notification `stageLabels` | Unmatched/absent label derives `titleCase(stageId)` | Optional per-stage presentation mapping |
| Notification `maxMessageChars` | 8,192 in both invocation and helper default parameter | Message length in JS string code units; schema range 256–8,192 |
| Notification `suppressEventTypes` | Nothing suppressed when absent | Optional event suppression list, schema maximum 64 |

The exact decoder sources are [Operator config](../../../../skills/common/plugins/operator-messaging/src/config.ts),
[Wait activation](../../../../skills/common/plugins/wait-store/src/adapter.ts),
[Telemetry activation](../../../../skills/common/plugins/telemetry-store/src/adapter.ts),
[HTTP activation](../../../../skills/common/plugins/network-http/src/adapter.ts),
[Secret resolution](../../../../skills/common/plugins/secret-resolver/src/adapter.ts),
and [Notification delivery](../../../../skills/common/plugins/notification-observer/src/observer.ts).

Telemetry observer has a closed, empty config schema and ignores configurable
fields in its event-envelope construction. It still consumes the manifest
operational policy described below. The notification preview registration reuses
all six schema fields, but `deliverPreview` consumes only `target`; the other
presentation/suppression options affect `observe`, not preview delivery. That
schema/consumer distinction must not be hidden by the shared schema.

Plugin root paths are **not** rebased by `loadPlatformConfig`: that loader rebases
installation/trust/storage/isolation roots only. `FileDurableRecordStore` resolves
its received root relative to process working directory. A component migration
must choose and test explicit absolute-path or relative-path semantics; silently
rebasing existing plugin roots would relocate durable stores.

## Grants and additional authorities

Caller grants are separate authority boundaries from provider configuration.
[Capability vocabulary](../../../../skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts)
requires exact, nonempty, unique string lists with no default:

| Capability | Required caller constraint | Proposed owner |
| --- | --- | --- |
| `operator.request`, `operator.receipt` | `allowedTargets` | Orchestrator policy, per calling registration |
| `signal.wait` | `allowedSignalTypes`, `allowedIssuerIds` | Orchestrator policy, per calling registration |
| `telemetry.emit` | `allowedEventPrefixes` | Orchestrator policy, per calling registration |
| `secrets.read` | `allowedNames` | Orchestrator policy, per calling registration |
| `network.http` | `allowedOrigins` | Orchestrator policy, per calling registration |

A provider HTTP allowlist and a caller grant with the same origin are not two
default authors: they constrain different principals and both apply. Keep those
semantics distinct. Operator requires HTTP plus Secrets; Notification requires
Operator; Telemetry observer requires an explicitly selected telemetry provider,
which may be telemetry-store or Redis. This inventory traces telemetry-store,
not Redis. A profile relying on HTTP's GET-only/default-header policy cannot
perform Operator's signed POST: explicit `POST` and `x-kubeclaw-signature` access
is needed. This is a source-derived compatibility obligation, not an observed
failure in a deployed profile.

Both notification registrations and telemetry observer currently author
`failurePolicy` in their manifests: mode `best_effort`, `maxAttempts: 5`,
`backoffMs: 1000`, `timeoutMs: 10000`. Nova's real observer drain/retry loop and
invocation lease consume those fields. They are operational policy candidates
for the owning plugin's registration section, with no current platform override.
Moving them requires an explicit manifest/runtime contract migration; leaving
the same editable numeric policy in both manifest and component file would not
satisfy D17. The observer lease also authors a 256-MiB logical memory allowance
in Core; its eventual owner and enforcement require separate Core inventory.
This document makes no physical resource-isolation claim.

A further real consumer is
[operatorConfiguration](../../../../scripts/observability-retirement/operator-authority.mjs),
used by the manual Operator-request and Wait-value retirement CLIs. It reads
immutable `run-snapshot.json` adapter configuration, then independently inserts
Operator 100,000/256-MiB and Wait 100,000/256-MiB/1-MiB defaults. Migrating only the
live factories would leave this competing interpretation behind. Historical
snapshots need an explicit, versioned interpretation or bound migration record;
never rewrite original evidence or silently reinterpret old records using the
new current profile. The retired snapshot's exact limits remain material to
capacity and ownership validation.

## Independent inventory correction: retained Wait resolver

The first inventory omitted a third interpreter of Wait `maxEntryBytes`:
[`pinnedContext`](../../../../skills/nova/core/state/wait-projection-reader.ts)
reads the original run snapshot's adapter configuration and evaluates
`Number(config.maxEntryBytes ?? 1048576)`. `originalValue` then uses this limit
to validate the canonical reconstructed original Wait payload. The snapshot
is bound to the original digest, selected provider and configured root; this is
not the current live adapter's configuration. Its fallback and numeric coercion
are distinct from both the adapter decoder and manual retirement authority.

The corrected machine-readable `maxEntryBytes` row names this consumer. The
[additive source snapshot](../../evidence/config-plugin-settings-inventory-20260921/review-addendum/source-identities-addendum.json)
leaves all original 135 source identities untouched. This correction adds one
consumer/source, not a new setting or registration. The original report and
settings are retained in the addendum directory. No production source changed.

The Wait migration must handle this resolver's pinned historical interpretation
explicitly and preserve the original payload-size and identity guarantees. It
must test the actual retained-value path and detect a separately restored
resolver fallback, in addition to adapter and manual-retirement controls.

## Proposed smallest next implementation

Start with Wait's four fields through the real component loader, registry
validation, `activate`, retained Wait resolution and manual retirement consumer.
Explicitly author the current three numeric defaults once; require the root and
all limits before activation; reject old competing platform fields. Preserve
provider/grant identity and all current Wait projection/recovery/CAS semantics.
Do not modify or weaken the recently accepted projection tests.

Before editing, define historical-snapshot handling and prove that it does not
change the original store's limits or trust identity. Use two real authored
profiles, missing/unknown/invalid values, exact quota boundaries, actual persisted
Wait creation/replay and manual-retirement projection. A private restored decoder
fallback and independently restored retirement fallback must each be detected.
Existing relevant cases include the Wait plugin's live-function tests,
`wait-value-projection.test.mjs`, `wait-resolver-audience.test.mjs`,
`operator-request-projection.test.mjs` and `operator-retention-authority-fixture.test.mjs`.
This inventory did not execute them. A detached config-only helper is not the
intended deliverable.

The Operator/HTTP/Secret/Notification chain should then migrate as a coherent
subsequent scope, including both endpoint modes and actual signed delivery.
Retain secret references, durable receipt reconciliation and caller grants.
Missing Notification `target` must fail before activation, not only on delivery;
optional fields need an explicit feature contract without hidden replacement
values. Schema defaults and function default parameters are both migration
sources, not just `??` expressions.

## Explicitly uninspected remainder and proof limits

The 18 other registrations remain field-uninspected: Agent-observability ingester
and evidence; Artifact store; Command runner; Git workspace; OpenClaw agent-event
source; both Redis registrations; both Runtime-dispatch registrations; State
store; Transport publisher; Demo handoff; Lint executor; Pipeline-review evidence;
both Remote-test-gate registrations; Repository adapter. Their exact IDs and
paths are in the roster. All stage registrations, test-provider contracts,
external packages, Worker Core/native settings, actual deployed profiles and
image/environment authors outside the inspected production paths remain open.

Internal grammar constants, formatting/security truncation bounds, Discord
protocol ceilings, the derived maximum delivery-record serialization bound and
request-level API defaults were not declared operator settings merely because
they are numbers. They need their own contract classification before any broader
“no hardcoded configurable values” claim. For example, HTTP's missing request
method currently means GET independently of its configured allowed-method set.
Notification sanitizer depth/entry/string bounds were inspected as a separate
unclassified helper-policy surface, not silently counted as migrated settings.

The prior 1,374-row discovery inventory contains zero rows with source paths under
these seven plugin directories. [Preserved matching rows](../../evidence/config-plugin-settings-inventory-20260921/historical-rows.json)
record that gap without altering the historical inventory. Neither that zero nor
the 31 field patterns establishes full coverage. The structural schema check plus
actual named consumer trace establishes only the explicit scope above.

[135 source identities and snapshots](../../evidence/config-plugin-settings-inventory-20260921/source-identities.json)
bind this read-only inspection. Concurrent component/TTL implementation elsewhere
may supersede shared-source snapshots; no later source bytes are implicitly
claimed reviewed. Fresh nonauthor review of this bounded inventory is required.


At handoff, the parallel component/TTL work has changed seven bound shared or
fixture documents, listed in [handoff.json](../../evidence/config-plugin-settings-inventory-20260921/handoff.json).
The seven inspected plugin production implementations, their config schemas and
manifests still match this inspection's snapshots. Shared loader/entrypoint
claims above refer to the preserved inspected snapshot; the separate ongoing
migration must receive its own review. This is visible source drift, not a
claim that the current full workspace is frozen or runtime-tested.
