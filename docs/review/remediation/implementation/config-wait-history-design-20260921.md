# Wait configuration: immutable history and the D17 cutover

Status: source-based design, not implementation or acceptance. No runtime jobs, journal changes or deployment actions were performed. This supplements the [plugin inventory](config-plugin-settings-inventory-20260921.md) and preserves the [accepted Wait projection scope](independent-wait-retirement-final-20260921.md). The companion source manifest records the exact inspected checkpoint; it is not a transitive runtime proof.

## What the current history actually records

`engine-runtime.ts::prepareRuntime` places the raw adapters map in `runtime.configuration`. `engine-snapshots.ts::registrySnapshot` copies that configuration into the immutable RunSnapshot. Adapter schema validation does not materialize defaults. A historical Wait configuration containing only `root` therefore does **not** record its three effective limits.

There are three consumers to migrate together:

| Consumer | Current interpretation of an omitted value |
| --- | --- |
| Wait adapter `activate` | `maxEntryBytes = 1048576`, `maximumRecords = 100000`, `maximumStoreBytes = 268435456` |
| Manual retention `operatorConfiguration` | The same three limits, read from the original snapshot |
| Core `wait-projection-reader.ts::pinnedContext` | `maxEntryBytes = 1048576` when reconstructing a projected Wait |

Changing only the adapter leaves both historical consumers supplying code defaults. Changing all three to strict readers without a history policy breaks previously supported snapshots and projected Waits. The Operator delivery limits have separate fallbacks in the same manual-retention function; those remain a distinct migration obligation and must not be silently changed in this Wait slice.

RunSnapshots v1–v4 retain version-specific digest rules. Their package provenance includes the original plugin identity, version and content digest. `computePackageDigest` covers sorted relative file names and file contents inside that plugin directory and rejects symlinks. It does not cover transitive Foundation/Core dependencies. A package version string alone, or a schema's old `default` annotation, is insufficient evidence for arbitrary historical runtime semantics.

Recovery compares the entire saved configuration with the prepared runtime configuration before checking package identity. Explicit administrative package upgrades do not bypass that equality. Adding the formerly absent values to an old configuration is therefore not a supported transparent resume. Existing dependency-identity rejection already directs unsupported runs to their original runtime.

## Smallest prospective contract

One centrally maintained `plugin-wait-store.config.json` owns exactly the four settings. The orchestrator owns activation, provider selection and grants and references this file; neither the orchestrator document nor a generated entrypoint duplicates its values. A version discriminator is protocol metadata, not a fifth configurable setting. The exact reference envelope belongs to the shared configuration-loader design, not a second Wait-specific loader.

All four settings are mandatory before activation. Numeric values must be actual positive safe integers, without string coercion, schema defaults, environment fallback or fixture repair. Preserve the existing effective numeric domain; do not introduce an unrelated quota increase. Require an absolute Wait root for the new format. Existing relative adapter roots resolve through the durable store against process working directory, not the platform file directory: silently rebasing them would select different data. Migration must explicitly name the same existing store.

Read and validate the referenced file once, freeze the effective configuration, and pass that exact object to the actual adapter. Write all four effective values into each new immutable RunSnapshot. Keep the resolved adapter map as the runtime configuration used by existing equality checks; references and file provenance must not replace those values. Bind source identity/digest as snapshot provenance, without turning a harmless file relocation into permission to alter the effective policy. A new snapshot/configuration discriminator should explicitly select the strict history decoder; do not infer a new protocol solely from which optional keys happen to exist.

Manual retirement and projected-Wait reconstruction consume the pinned effective values from that run, never reload today's plugin file. One small shared historical policy decoder should serve both consumers; it should not activate a plugin, alter a journal or supply runtime defaults. Current activation remains strictly configured. Projected records continue to reference the original snapshot digest; no existing receipt, snapshot or prefix digest is rewritten.

## Historical activation boundary: the unresolved decision

A complete four-value historical object can be read strictly under its existing snapshot version, with the original provider/root/integrity checks retained. A missing historical value cannot be recovered from that object alone. Today's config is not evidence of its former value.

The minimal backwards-compatible extension, **if explicitly accepted as historical protocol decoding under D17**, is one bounded, immutable Wait legacy protocol profile. Its accepted producer identities must identify an actually preserved original Wait package digest and reviewed historical runtime semantics, including relevant original Core/Foundation consumers, and explicitly record the old omitted-field meaning. This single Wait profile is release compatibility data, never an editable operator config, wildcard version rule or new-run default. Unknown producers fail closed. Explicit old values retain their own values; a profile cannot overwrite them. Historical invalid values remain invalid. No broad claim about all old `1.0.0` packages is justified.

This review has not established that profile or an inventory of deployed old producers. It deliberately supplies no fabricated approved digest. Such a legacy profile still encodes historical defaults; it must not be smuggled in as an already authorized exception to D17. If that exception is not acceptable, the supported boundary must be explicit: preserve and drain old active runs using their original pinned runtime, and retain an identified original reader for already projected historical data. That boundary leaves migration of those histories open; it does not justify deleting them or claiming full Wait cutover.

This profile is only for retirement and retained read reconstruction. It does not make the current adapter runtime compatible with an old incomplete snapshot. That activation remains rejected: use the original runtime or a separately designed, explicitly approved migration contract. Do not build a general plugin-digest-to-defaults registry.

Do not add a general historical configuration migration engine, mutable sidecar that attests arbitrary limits, or relaxation of `RECOVERY_RUNTIME_CONFIGURATION_MISMATCH`. A new immutable RunSnapshot cannot be substituted for an old run merely to pass this check. Resume across changed plugin package bytes remains subject to the existing separately authorized package-upgrade mechanism, even when explicit configuration values happen to match.

## File ownership and integration order

Assign one configuration author the shared platform schema/loader, central reference entrypoint, orchestrator/plugin JSON files, actual CLI loading and generated configuration. That author must coordinate the existing component-bundle work; Nova's actual platform policy and Buster's registry-discovery-only consumer are different roles. Do not merge their installation roots or introduce a second orchestrator policy for Buster.

Assign one Wait/history author the Wait schema/adapter, shared historical policy decoder, Core projected-Wait reader and manual-retention Wait policy call. `engine-runtime.ts` and `engine-snapshots.ts` are shared integration files and need one agreed author rather than concurrent edits. That author owns new snapshot provenance/discrimination and recovery compatibility tests. Existing Operator delivery defaults remain visibly open to their own author.

Prepare the strict loader and history decision before switching consumers. Freeze the entire resolved configuration before starting a run. Refuse missing references/settings before creating a store, snapshot or effect. Never switch the configuration of an already active adapter. Historical fixtures and captured producer snapshots remain untouched; only maintained new-run fixtures receive explicitly authored four-value configs. Tests may share file-writing utilities, but those utilities must not insert missing values.

## Required evidence before acceptance

1. Two actual configured profiles change entry-byte, whole-store-byte and record-count behavior independently at real durable-store boundaries. A changed root selects a different real store. Test exact boundary success and rejection, not only decoded objects.
2. Missing each setting/reference, invalid numeric types/ranges, legacy inline duplicates and any legacy environment author are rejected before activation. Mutation tests restoring each relevant fallback fail meaningfully.
3. Capture a real old producer snapshot that omits limits **before** changing its source. Demonstrate its original effective policy from the pinned original implementation. Test explicit old profiles with nondefault limits too; never regenerate old fixtures with the new producer and call them historical.
4. New snapshots contain all four values and their source provenance. Changing today's plugin file after snapshot creation cannot alter historical projection/read limits. Unknown historical producers, wrong provider/root, missing provenance and tampered snapshot bytes reject without writes.
5. Repeat the accepted Wait/Operator projection in both orders, duplicate creates, projected reads, physical byte savings and original authorization/alias-fence negatives under historical and new profiles. Preserve original assertions and deadlines. Existing receipts and run files retain exact bytes/digests except the already authorized projection transaction.
6. Recovery tests retain configuration mismatch and package mismatch rejection. Explicit configuration changes are not treated as a resume migration; original-runtime drain and any separately authorized package upgrade have distinct proofs.
7. Bind source, fixtures and dependencies before/after the actual test run; retain failed attempts. Update operator instructions with exact activation and historical limitations. No whole OBS/CONFIG or live deployment acceptance follows from this slice.

## Decisions required before implementation closes history

- Is narrowly content-bound historical protocol interpretation allowed by D17, or must old runtime/readers remain separately supported? This cannot be resolved by renaming a fallback.
- Which actual deployed producer identities and preserved dependency closures exist? Repository source proves the mechanism, not the population of old runs.
- Are historical relative roots present, and what original working directory established their store identity? No current path convention proves that retrospectively.
- Who owns the shared reference envelope and snapshot discriminator so that the existing component bundle, Nova policy and Buster discovery do not acquire competing authors?

These are bounded compatibility questions, not permission to broaden retention, rewrite history or substitute an invented success flag.
