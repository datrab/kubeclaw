# Change a Platform Component

Status: source-backed change router; environment and unsupported paths stated below
Audience: platform developers, component maintainers, contract and UI authors
Owner: developer experience maintainers; each component owner retains implementation authority
Evidence: package.json; skills/prism/package.json; skills/nova/core/lifecycle/reducer.ts; skills/nova/core/effects/durable-invocation.ts; skills/worker/core/worker/native-resource-pool.ts; skills/common/plugin-runtime/foundation/registry/discovery.ts; skills/prism/storage/index.ts; .github/workflows/pipeline-reliability.yaml; .github/workflows/docs-checks.yaml
Applies to: Nova, Worker, Foundation, SDK, capability/event, integration, UI, deployment and durable-data changes; Buster and Prism details remain in their own guides
Last verified: 2026-10-15; named current source bytes and script definitions inspected, not executed

## Choose the smallest owner

Use this router before changing an internal component. First ask whether an
existing [extension contract](../README.md) can contain the behavior. If it can,
use that extension's guide instead of changing the platform. A package's presence
does not grant permission to activate it or establish a ready native host.
Start with the [request-to-result path](../../understand/request-to-result.md)
and [role and package boundaries](../../reference/roles-and-package-ownership.md).

A **contract** is a versioned boundary between a caller and its receiver.
An **invariant** is a rule that must survive every supported action.
A **reducer** computes the next state from the current state and a result.
**Replay** reconstructs state from retained records. A **receipt** records an
external operation's outcome; an HTTP response alone is not necessarily that
receipt. **Idempotency** keeps one logical request from causing duplicate work.
**Fencing** rejects work when the current owner cannot prove authority.
A **digest** identifies bytes or one declared encoding, not permission or health.

| Change | Start with the owning route | Adjacent owner that must agree |
| --- | --- | --- |
| Nova invocation, graph or run authority | [Nova and lifecycle](#nova-and-lifecycle) | Project compiler, package registry and retained-run reader |
| Retry, repair, scheduling or wait | [Lifecycle decisions](#lifecycle-decisions-and-waits) | Live recorder, replay, signal issuer and budget owner |
| External effect or recovery | [Effects](#effects-and-unknown-outcomes) | Adapter, durable receipt, lock and resource owners |
| Worker protocol, supervisor or capacity | [Worker](#worker-and-native-host-boundaries) | Host operator and caller's protocol/profile owner |
| Package discovery, trust or isolation | [Foundation](#foundation-discovery-and-trust) | Manifest, grant/provider and sandbox owners |
| Public type, schema, encoding or export | [SDK](#sdk-and-public-contracts) | All supported producers, consumers and reference owner |
| Capability or event | [Capabilities and events](#capabilities-and-events-are-different-changes) | Security/provider or observer/transport/retention owner |
| Forge, Echo, service or API integration | [Integrations](#integrations-and-receiving-services) | Actual target host/model/service and credential owner |
| Studio or Archviewer behavior | [UI](#studio-and-archviewer) | Typed domain/source-data owner and publisher |
| Chart, values or GitOps | [Deployment](#charts-values-and-gitops) | Rendered receiver, release selector and operator |
| Durable data or migration | [Stores](#data-models-and-migrations) | Every writer/reader, migrator and backup owner |

For a Buster resolver, provider, admitted plan or fixture change, use the
[Buster development guide](buster.md). For Control, Engine, Worker, Ingestion,
Renderer, Corpus or Studio ownership, use [Prism's owner selector](prism.md#start-with-the-smallest-owner).
Do not move a change into Control only because Control has a reachable endpoint.

## Prepare and finish one bounded change

1. Follow [Prepare a clean checkout](../developer-handbook.md#prepare-a-clean-checkout).
   Select the actual full source commit for your change. Use its lockfile and
   selected tools; do not substitute a global compiler or a live run directory.
   The handbook's historical example commit is not a universal current baseline.
2. Name the caller, receiver, data/authority handoff and invariant. Record which
   old inputs, active runs or stored records must still work. Choose one route below.
3. Trace changed configuration through validation, defaults, effective caller,
   capture time and receiver. Use [configuration change impact](../../reference/configuration-change-impact.md)
   and [precedence](../../reference/configuration-precedence.md). A values edit
   does not move stored data; a restart does not grant capabilities.
4. Change the owning source, not a generated copy. Add positive and denied-neighbor
   cases for the changed rule, plus interruption/replay/compatibility cases when
   state or effects cross the boundary. Select the smallest **complete** chain
   from the component route and command tables, not an arbitrary single green test.
5. Update the canonical explanation, affected operator task and recorded source
   dependency. Use [documentation maintenance](../documentation-maintenance.md)
   for its tools, generation ownership and drift checks. Keep original failures,
   partial outputs and uncertain cleanup distinct from a later success.
6. Before activation or rollout, require the actual caller/host/operator procedure
   and observation. A local check, generated document or compilation is not that
   result. For removal, first account for active users, retained versions and data;
   remove registration/grants/providers only through their owners' supported path.

Use Linux, Node.js 24, npm with the committed root lockfile, and the installed
root compiler selected by that lockfile. Journal fixtures need genuine GNU
util-linux `/usr/bin/flock`, a qualified local filesystem with complete append
writes and synchronization, and isolated durable fixture roots. C fixtures
need the C11 compiler `cc`. Native, Go, Helm and browser chains have additional
prerequisites below. Do not run them against a deployed run or data root.
The cited setup procedure includes dependency acquisition, not an offline check.

**Source — setup, ownership and effective configuration**

Implementation: [`setup_toolchain_lock_contract`](../../../../docs/site/extend/developer-handbook.md#prepare-a-clean-checkout), `docs/site/extend/developer-handbook.md:39-64`. Revision: current-checkout SHA-256 `c0d4232c5c8b5278c4d57d965a92ac6bb9481be89c6f88b3dbed7ca58a5f0067`. Implementation: [`ownership_build_boundary_reuse`](../../../../docs/site/extend/developer-handbook.md#repository-ownership-and-build-boundaries), `docs/site/extend/developer-handbook.md:284-309`. Revision: current-checkout SHA-256 `c0d4232c5c8b5278c4d57d965a92ac6bb9481be89c6f88b3dbed7ca58a5f0067`. Implementation: [`startup_new_run_rollout_boundaries`](../../../../docs/site/reference/configuration-change-impact.md#impact-classes), `docs/site/reference/configuration-change-impact.md:20-44`. Revision: current-checkout SHA-256 `c8e9a84b585bd96eb0d8e095e8a6188980f8a0584adbd7cca396f8a16e91854e`. Implementation: [`package_grant_host_boundary`](../../../../docs/site/reference/roles-and-package-ownership.md#choose-the-boundary-first), `docs/site/reference/roles-and-package-ownership.md:14-24`. Revision: current-checkout SHA-256 `be3e8aa7faa7f5f7f30fdcb6c6ca982d67834c5faeab2e78e504510d1ba17741`. Implementation: [`configuration_validation_paths`](../../../../skills/common/plugin-runtime/foundation/config/platform.ts#L53-L69), `skills/common/plugin-runtime/foundation/config/platform.ts:53-69`. Revision: current-checkout SHA-256 `4bce96fe0b9556266c7586aa7803f6ff790dfd7f74e4952ddc5ebd25f9ebc7e8`. Implementation: [`immutable_schema_default_resolution`](../../../../skills/common/plugin-runtime/foundation/registry/schema.ts#L84-L113), `skills/common/plugin-runtime/foundation/registry/schema.ts:84-113`. Revision: current-checkout SHA-256 `eb665b9db83e0d0d1bd15fbe5c6f916f479bf8a9c049de6d90b2d6f9f59cc557`. Contract or setting: the selected boundary and configuration described in this section. Test evidence: the selected checks below; not executed for this page. Limit: implementation contracts only; no native, deployed, browser or retained-run result.


## Nova and lifecycle

Nova Core is a library with a command-line interface (CLI), not an independent
daemon. The selected CLI or project facade loads platform configuration and a
pipeline/project, discovers the permitted packages and executes the resulting
graph. The project compiler owns graph construction; scheduling owns when an
eligible stage runs. Do not change one to conceal an invalid input to the other.

For a graph or invocation change, identify the actual caller variant, original
platform file, run identity, package snapshot, graph digest and recorded profile.
Current snapshot readers distinguish run versions v1–v4 and graph versions v2/v3;
that finite support is not permission to reinterpret an unknown version.
Retained recovery compares the original graph; incompatible changed input belongs
to a new run, not a relabeled recovery. Platform paths resolve from the canonical
configuration file's directory, not an assumed shell working directory.

Follow [Change Nova lifecycle, scheduling or run authority](../developer-handbook.md#change-nova-lifecycle-scheduling-or-run-authority).
Select lifecycle contract checks and lifecycle/replay fixtures; add SDK/package
ownership checks when schemas, packages or public contracts also change.
Update Nova Core's explanation and the affected run/recovery task. On graph or
snapshot mismatch stop with the original retained inputs and error; do not
regenerate the old identity, delete the snapshot or start a replacement run as recovery.

**Source — actual invocation and versioned snapshot readers**

Implementation: [`historical_profile_graph_pins`](../../../../skills/nova/core/execution/engine-snapshots.ts#L68-L109), `skills/nova/core/execution/engine-snapshots.ts:68-109`. Revision: current-checkout SHA-256 `50dfe92e656875658b7604f30012f8493564729473f6ddd65b64960ecf9946fd`. Implementation: [`CLI_input_audit_branch`](../../../../skills/nova/core/cli.ts#L28-L54), `skills/nova/core/cli.ts:28-54`. Revision: current-checkout SHA-256 `09121b4b0a160d2e5e35448795156856b15ccc078a229bb1895f570c22f76787`. Implementation: [`configuration_validation_paths`](../../../../skills/common/plugin-runtime/foundation/config/platform.ts#L53-L69), `skills/common/plugin-runtime/foundation/config/platform.ts:53-69`. Revision: current-checkout SHA-256 `4bce96fe0b9556266c7586aa7803f6ff790dfd7f74e4952ddc5ebd25f9ebc7e8`. Contract or setting: the selected boundary and configuration described in this section. Test evidence: the selected checks below; not executed for this page. Limit: implementation contracts only; no native, deployed, browser or retained-run result.


## Lifecycle decisions and waits

The live flow is stage result → reducer → budgeted decision → durable records
and next action. `applyStageResult` accepts results only from `running`.
It requires a reason for non-`passed` outcomes and consumes an attempt after
validation. Configured technical retries have their own accounting; remediation
has another budget. A new reason is not interchangeable
with a new outcome or scheduling action. Completed-attempt replay calls the same
reducer and repair decision; changing only live state breaks that agreement.

`decisionWait` binds an orchestrator wait to run, stage and attempt. Its authorized
issuer and signal type are part of the continuation boundary; the orchestrator
wait shown here has `expiresAt: null`. That does not remove validation from other
wait kinds or permit a stale/foreign signal. Preserve wait identity and the
original approved payload across interruption. Test allowed transitions, denied
neighbor states, exhausted budgets and live/replayed equality. Include the
process-death fixture, which writes a journal and kills a real Node child.
See the [lifecycle route](../developer-handbook.md#change-nova-lifecycle-scheduling-or-run-authority)
and [original-state recovery](../../use/recovery.md#pipeline-state-recovery).

**Source — one reducer and stable waits across live work and replay**

Implementation: [`requiredReason`](../../../../skills/nova/core/lifecycle/reducer.ts#L60-L64), `skills/nova/core/lifecycle/reducer.ts:60-64`. Revision: current-checkout SHA-256 `13982ba82b9b619f5df89dc0b9932c7802f0b78968e450263ab302726d4f552d`. Implementation: [`outcome_accounting_guard`](../../../../skills/nova/core/lifecycle/reducer.ts#L96-L136), `skills/nova/core/lifecycle/reducer.ts:96-136`. Revision: current-checkout SHA-256 `13982ba82b9b619f5df89dc0b9932c7802f0b78968e450263ab302726d4f552d`. Implementation: [`completed_attempt_replay`](../../../../skills/nova/core/lifecycle/recovery-state.ts#L39-L69), `skills/nova/core/lifecycle/recovery-state.ts:39-69`. Revision: current-checkout SHA-256 `bc20a1e3f27ba2f4f67ce0f33df0f41bc4ebadcc40dcce8606ba37213660c99f`. Implementation: [`decision_recording`](../../../../skills/nova/core/execution/run-decisions.ts#L29-L60), `skills/nova/core/execution/run-decisions.ts:29-60`. Revision: current-checkout SHA-256 `a509f00aa74367e90d396f338db55acff2610075ac0063d14fa8bec4ba9d1171`. Implementation: [`wait_issuer_identity_boundary`](../../../../skills/nova/core/lifecycle/wait-request.ts#L1-L19), `skills/nova/core/lifecycle/wait-request.ts:1-19`. Revision: current-checkout SHA-256 `0e9f41bd8e4a5ceb6e43d53e713e3fbbdacca2540ff31134d0409745252419de`. Implementation: [`process_death_fixture`](../../../../tests/verification/reliability/lifecycle.test.mts#L61-L81), `tests/verification/reliability/lifecycle.test.mts:61-81`. Revision: current-checkout SHA-256 `3ff75f78dc7ce12b4d362a7fc40292178d49eafd28eab5cada3c4508ccda9ace`. Contract or setting: the selected boundary and configuration described in this section. Test evidence: `node tests/verification/contracts/check-plugin-system-v2-lifecycle.mjs` and `node --test tests/verification/reliability/lifecycle.test.mts`; not executed for this page. Limit: implementation contracts only; no native, deployed, browser or retained-run result.


## Effects and unknown outcomes

The effect coordinator checks the original idempotency request and existing
receipt, acquires the resource lock, then rechecks identity under that lock.
A terminal receipt returns the existing outcome without another invocation.
The durable requested/accepted state separates first invocation from recovery.
An accepted request without a terminal receipt uses the adapter's `receipt`
method. If it is absent or returns no receipt, recovery stops; it does not grant
a fresh effect or a new idempotency key. Generic invoke/shutdown adapters need
not implement this recovery route.

Keep effect encoding/version, attempt/resource identity, lock renewal, current
fence and durable result together. A renewal/release failure can leave additional
failure evidence; do not hide it with a retry. Cover interruption before/after
acceptance and receipt, lost response, conflicting identity, corruption and
failed renewal/release. The external-effect fixture starts the real CLI and a
local service, writes durable temporary state and can kill the child; it is not
an inert assertion-only test. See the handbook's
[effect change route](../developer-handbook.md#change-nova-lifecycle-scheduling-or-run-authority).

Before audit or recovery, follow [Pipeline state recovery](../../use/recovery.md#pipeline-state-recovery):
establish the writer fence and preserve the original related stores. FileJournal
construction can create a lock and truncate a nonempty incomplete tail through
its last newline, possibly to zero, then synchronize it before parsing.
A projected audit adds no canonical event, but is not a guarantee of unchanged
storage. Preserve the first diagnostic and original bytes before an authorized
inspection; never remove a live lock inode or manufacture a no-record substitute.

### Change an effect identity or persisted result format

1. Start at `skills/nova/core/effects/journal.ts`. Its records are `requested`,
   `accepted`, `completed` and `completed-reference`. The enclosing hash journal
   stores newline-terminated JSON with `sequence`, `previousHash`, `hash` and
   `entry`. Its hash covers `JSON.stringify({sequence,previousHash,entry})`.
   Preserve that encoding for retained records; reserializing an old record can
   invalidate the chain even if its meaning appears unchanged.
2. Trace `effects/identity.ts` and the SDK JSON codec. New effects use
   `effect:json-utf16-v1:<hash>` over the portable, versioned subject. Historical
   `effect:<hash>` uses the exact old `canonicalJson` producer algorithm.
   Readers select and validate the stored identity; they do not relabel a
   historical digest or substitute a new locale/collator. Preserve payload,
   delivery ID, attempt, capability, operation, resource and dispatch-profile
   identity checks when the same idempotency key appears again.
3. Preserve the large-result reader before changing its writer. Results above
   64 KiB move to `effect-results/sha256/<first-two-hex>/<remaining-hex>.json`.
   `effect-result-reference.v1` binds digest and byte count. Existing inline
   `completed` records and referenced results must both remain readable.
   Test the threshold, missing/corrupt sidecar, wrong size/digest, conflicting
   request/receipt and interrupted publication. Retain journal and sidecars as
   one group; no automatic format migration or sidecar retirement follows.
4. Add a new explicit version and coordinated reader/writer path if the old
   contract cannot be retained. Do not rewrite an active run as a migration.
   Keep genuine historical-producer fixtures, current fixtures and replay
   rejection cases. Run the focused identity/journal checks below, then the
   existing external-effect and lock-lifetime fixtures for coordinator changes.

```sh
set -eu
node --test tests/verification/reliability/effect-identity-version.test.mts tests/verification/reliability/effect-journal-ownership.test.mts
node --test tests/verification/reliability/external-effect-recovery.test.mts tests/verification/reliability/effect-lock-lifetime.test.mts
```

Require exit zero and every required assertion; retain the first identity,
corruption, lock or reconciliation error. The external-effect fixture starts
real child processes. Use the prepared local toolchain and fixture-owned
workspace, not a retained production run. A local replay result does not prove
external receipt support. Activation/removal still uses the adapter/operator
path and the original writer fence described above.

Source: [effect record and sidecar contract](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/skills/nova/core/effects/journal.ts#L1-L241), [stored identity versions](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/skills/nova/core/effects/identity.ts#L1-L48), and [hash-chain encoding](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/skills/common/plugin-runtime/foundation/observability/hash-journal.ts#L1-L30). These locators define formats, not an executed migration.

**Source — stable effects, receipt recovery and journal effects**

Implementation: [`idempotent_request_lock_recheck`](../../../../skills/nova/core/effects/durable-invocation.ts#L39-L66), `skills/nova/core/effects/durable-invocation.ts:39-66`. Revision: current-checkout SHA-256 `6856d2c2761cb9c8e974d0f8683e0083571ed91b25740832921d32341e70d3f2`. Implementation: [`accepted_receipt_recovery_fence`](../../../../skills/nova/core/effects/durable-invocation.ts#L88-L145), `skills/nova/core/effects/durable-invocation.ts:88-145`. Revision: current-checkout SHA-256 `6856d2c2761cb9c8e974d0f8683e0083571ed91b25740832921d32341e70d3f2`. Implementation: [`effect_identity_owner`](../../../../skills/nova/core/effects/identity.ts#L1-L45), `skills/nova/core/effects/identity.ts:1-45`. Revision: current-checkout SHA-256 `8d3e2f32b4fdb98f6159c989b41fe926fd5b518791b4b02246d633dff847bcb9`. Implementation: [`journal_lock_conditional_repair_effects`](../../../../skills/nova/core/state/journal.ts#L30-L81), `skills/nova/core/state/journal.ts:30-81`. Revision: current-checkout SHA-256 `25be25a991c93c0e523178e3c45e2f7fb15ecad6e1a03566fca241d6b27f40bf`. Implementation: [`real_CLI_fixture_child_effect`](../../../../tests/verification/reliability/external-effect-recovery.test.mts#L72-L99), `tests/verification/reliability/external-effect-recovery.test.mts:72-99`. Revision: current-checkout SHA-256 `75501024d5ef9aaac53ff4dbe7666cc528624217a3749666a2d1ea837d4d4e22`. Contract or setting: the selected boundary and configuration described in this section. Test evidence: `node --test tests/verification/reliability/external-effect-recovery.test.mts` plus changed identity fixtures; not executed for this page. Limit: implementation contracts only; no native, deployed, browser or retained-run result.


## Worker and native host boundaries

The caller's versioned attempt/profile contract enters Worker Core. The native
supervisor owns the process lifetime, sealed control channel, output spool and
resource reservations. The host operator owns the root-managed launcher, policy,
Linux control groups (cgroups), runtime identity and aggregate capacity.
A cgroup is a kernel resource-control boundary, not a JavaScript memory limit.
The pool binds the real filesystem/device/inode; a copied pathname or policy
file is not proof of the original host boundary.

Follow [Change Worker Core or native execution](../developer-handbook.md#change-worker-core-or-native-execution).
Keep protocol/version, host/boot identity, supervisor lifetime lock, cancellation,
spool sealing and recovery consistent. The spool owns bounded private output
files and synchronizes accepted bytes; channel framing alone does not define
durable acknowledgement. Tests must account for every owned process before
cleanup or renewed admission. Preserve unresolved ownership and unfinished
cleanup; do not declare ready because contract fixtures pass.

Start with Worker contract and attempt-executor checks. Select the native chain
only with the genuine host, C compiler, prepared cgroups, root-owned policy,
Helm/native inputs and selected Go prerequisites. The Node Resource Interface
(NRI) connects the runtime to the native pool. Its builder separately checks
the selected Go version and modules, requires an absent output, then writes a
binary. Neither building it nor passing a render proves a supported running host.

**Source — host ownership, output and aggregate native boundaries**

Implementation: [`host_identity_lifetime_fence`](../../../../skills/worker/core/worker/ownership-store.ts#L60-L95), `skills/worker/core/worker/ownership-store.ts:60-95`. Revision: current-checkout SHA-256 `d784b4196a6103a0ad1e1eaa086640d89ea3205db74be0b0d569045183d20b79`. Implementation: [`spool_private_bounded_synced_bytes`](../../../../skills/worker/core/worker/native-output-spool.ts#L27-L67), `skills/worker/core/worker/native-output-spool.ts:27-67`. Revision: current-checkout SHA-256 `da9b2bdd9f5b8f9418e98a451eb3275aadec117a9ee7ca733566e571870898c7`. Implementation: [`native_channel_owner`](../../../../skills/worker/core/worker/native-control-channel.ts#L1-L36), `skills/worker/core/worker/native-control-channel.ts:1-36`. Revision: current-checkout SHA-256 `253ecc17f153e13e6e00aad3f842565ad17a01e85cac15db910d9b4b2ea9edc8`. Implementation: [`resource_pool_owner`](../../../../skills/worker/core/worker/native-resource-pool.ts#L1-L38), `skills/worker/core/worker/native-resource-pool.ts:1-38`. Revision: current-checkout SHA-256 `2a002b796bae216210186f258d32f5dd267ec10a4940f4d0fc2f12ea72bd93ee`. Implementation: [`selected_Go_build_effect`](../../../../scripts/build-native-worker-nri.mjs#L1-L17), `scripts/build-native-worker-nri.mjs:1-17`. Revision: current-checkout SHA-256 `2030ab287fd08b0acbe476b2248c92a44518117d68e278db94737516b7ec2dd8`. Implementation: [`C_build_native_fixture`](../../../../tests/verification/reliability/worker-native-launcher.test.mts#L11-L43), `tests/verification/reliability/worker-native-launcher.test.mts:11-43`. Revision: current-checkout SHA-256 `4ddfccf7e7ea894c8735f66777af0f193943d83e302d09a47440e83c66a6089c`. Implementation: [`Helm_fixture_subprocess`](../../../../tests/verification/deployment/prism-native-runtime.test.mjs#L15-L24), `tests/verification/deployment/prism-native-runtime.test.mjs:15-24`. Revision: current-checkout SHA-256 `8a103340311017870f682947f0003e59849048e344035bb55842851ee7d5531d`. Contract or setting: the selected boundary and configuration described in this section. Test evidence: the selected checks below; not executed for this page. Limit: implementation contracts only; no native, deployed, browser or retained-run result.


## Foundation discovery and trust

Foundation's plugin registry discovers inert manifests before executable
activation. It checks package identity/digest/trust, schema, references and
registrations; the import audit uses a permissioned Node child before activation.
This registry is not an Open Container Initiative (OCI) image storage server.
Role bundle membership, an installed package, a requested capability and the
caller's actual provider/grant are separate decisions.

Use [Change registry, storage or package discovery](../developer-handbook.md#change-registry-storage-or-package-discovery).
Change the owning manifest/trust/activation layer, include denied imports and
capabilities, and exercise replacement/removal with retained old package state.
Build the maintained sandbox only in an isolated source checkout: it calls `cc`,
writes a temporary native binary, sets its mode and renames it into the source
sandbox path. The import-safety check actually discovers and activates selected
first-party packages. Do not widen trust or grants merely to pass a failed import;
keep the first typed registry code/details and original package bytes.

**Source — manifest-to-activation trust and real child effects**

Implementation: [`C11_compile_atomic_output`](../../../../scripts/build-plugin-sandbox.mjs#L1-L25), `scripts/build-plugin-sandbox.mjs:1-25`. Revision: current-checkout SHA-256 `ea546fd31e572312986730c4f8c89aacf0943aeb37b560cc63281cf67a9f92ec`. Implementation: [`inert_manifest_trust_digest`](../../../../skills/common/plugin-runtime/foundation/registry/discovery.ts#L105-L137), `skills/common/plugin-runtime/foundation/registry/discovery.ts:105-137`. Revision: current-checkout SHA-256 `1f2742573de8a2f37067238bc53edcb4b031e881f04da94519687c79eb758a87`. Implementation: [`permission_child_import_audit_effect`](../../../../skills/common/plugin-runtime/foundation/registry/import-audit.ts#L27-L58), `skills/common/plugin-runtime/foundation/registry/import-audit.ts:27-58`. Revision: current-checkout SHA-256 `764ca496cd9bf406a26eed400777d61b239c6130fdf3b94204c4006d132458f3`. Implementation: [`actual_registry_activation_test`](../../../../tests/verification/contracts/check-plugin-system-v2-import-safety.mjs#L1-L38), `tests/verification/contracts/check-plugin-system-v2-import-safety.mjs:1-38`. Revision: current-checkout SHA-256 `a65c62186340e0c95f7a6371bc58ce48cb00ee69e60589a076a5638987b3ccd3`. Implementation: [`code_details_error_identity`](../../../../skills/common/plugin-runtime/foundation/registry/errors.ts#L1-L38), `skills/common/plugin-runtime/foundation/registry/errors.ts:1-38`. Revision: current-checkout SHA-256 `148025829782ddac5d15ea25736b4ec7a3faefcfabdce152809baf8ed807ce25`. Contract or setting: the selected boundary and configuration described in this section. Test evidence: the selected checks below; not executed for this page. Limit: implementation contracts only; no native, deployed, browser or retained-run result.


## SDK and public contracts

The software development kit (SDK) exposes shared contracts to actual producers
and consumers. Start with the canonical schema and encoding meaning, then the
source generator, generated types/exports and every supported caller. A TypeScript
optional field is not compatibility proof for a closed JSON schema. Package
version, wire version, source digest and portable JSON encoding are different
identities; choose the transition for the intended identity change explicitly.

Follow [Change SDK or shared contracts](../developer-handbook.md#change-sdk-or-shared-contracts)
and the [SDK reference](../../reference/sdk.md). The SDK check compiles the genuine
schema with the installed locked dependency and compares generated bytes;
without `--check` that generator writes the maintained generated TypeScript file.
Do not hand-edit it. SDK build emits compiler outputs. The local SDK fixture
chain exercises selected encoding/identity/delivery compatibility, not every
export or every deployed reader. Require declared old→new and new→old directions,
denied input/removal cases and retained old identity tests before release.
Route generated reference changes through documentation maintenance; a reference
collector or successful typecheck alone is not activation or consumer acceptance.

**Source — canonical schema, generator and identity compatibility**

Implementation: [`immutable_schema_default_resolution`](../../../../skills/common/plugin-runtime/foundation/registry/schema.ts#L84-L113), `skills/common/plugin-runtime/foundation/registry/schema.ts:84-113`. Revision: current-checkout SHA-256 `eb665b9db83e0d0d1bd15fbe5c6f916f479bf8a9c049de6d90b2d6f9f59cc557`. Implementation: [`effect_identity_owner`](../../../../skills/nova/core/effects/identity.ts#L1-L45), `skills/nova/core/effects/identity.ts:1-45`. Revision: current-checkout SHA-256 `8d3e2f32b4fdb98f6159c989b41fe926fd5b518791b4b02246d633dff847bcb9`. Implementation: [`canonical_schema_codegen_check_write`](../../../../scripts/generate-plugin-sdk-types.mjs#L1-L33), `scripts/generate-plugin-sdk-types.mjs:1-33`. Revision: current-checkout SHA-256 `3fe20ad1f2e5d604f4197d3fb7dd6e897f2ad3f6e6fd6b013412fc0eba8aed0b`. Implementation: [`SDK_contract_route_reuse`](../../../../docs/site/extend/developer-handbook.md#change-sdk-or-shared-contracts), `docs/site/extend/developer-handbook.md:1319-1359`. Revision: current-checkout SHA-256 `c0d4232c5c8b5278c4d57d965a92ac6bb9481be89c6f88b3dbed7ca58a5f0067`. Contract or setting: the selected boundary and configuration described in this section. Test evidence: the selected checks below; not executed for this page. Limit: implementation contracts only; no native, deployed, browser or retained-run result.


## Capabilities and events are different changes

For a **capability** (permission to perform a named operation), trace the closed
vocabulary, allowed operation/resource kinds, provider, resource constraints,
requesting registration and caller grant. Adding a vocabulary name alone does
not supply a provider or grant. Reject unknown names, denied operations, wrong
resource kinds and out-of-scope resources. Keep role packaging separate.

For an **event**, trace its producer, envelope, namespace, identity, receiving
observer, redaction, order, duplicate handling, replay and retention. The
`plugin-domain-event.v2` schema constrains names to the plugin namespace and
requires producer provenance and sequence. Retained flat-v1 telemetry is a
separate contract, not evidence that every current producer uses that format.
Emitting an event does not grant a capability. Use the
[telemetry/derived-view route](../developer-handbook.md#change-telemetry-or-derived-views)
and [telemetry mechanism](../../understand/telemetry.md).

Select changed security/provider and observer/store fixtures. The selected
telemetry generator's `--check` still runs PATH-selected `gofmt`; non-check mode
writes generated outputs. Require the actual producer-to-consumer denial,
ordering, version and retirement cases. Use the following ordered introduction tasks before activation or removal.

### Introduce a capability

1. Add the closed vocabulary entry in
   `foundation/registry/capability-vocabulary.ts`: exact capability name,
   permitted operations, resource kinds and supported constraints. Review
   whether the capability is confidential or Core-only. Do not make a Core-only
   operation grantable to accommodate one plugin.
2. Implement the provider's actual operation/resource checks. Update its
   manifest `providesCapabilities`; update each caller registration's
   `requiredCapabilities`. Registration alone creates neither a grant nor a
   selected provider. Implement the matching Core authorization handler in
   `skills/nova/core/execution/authorization.ts` and add it to `HANDLERS`.
   `execution/context.ts` calls `authorizeCapabilityInvocation` before the
   provider; a missing handler fails with `CAPABILITY_HANDLER_MISSING`.
   Preserve operation, resource-kind, canonical identity and constraint checks.
   Verify allowed and denied neighboring resources through the actual invocation
   context; provider checks do not replace this Core boundary.
   Trace the registry's explicit provider selection,
   dependency-cycle checks and caller grants through
   `foundation/registry/capabilities.ts`.
3. Supply the selected platform policy and least-privilege resource constraints
   through the real configuration loader. Follow [capability grants](../../reference/capabilities.md)
   and [configuration precedence](../../reference/configuration-precedence.md).
   Exercise the actual caller-to-provider boundary with allowed and denied
   neighboring resources, unknown operations/names, missing grants and an
   invalid/ambiguous provider. A manifest-only positive case is insufficient.
4. Add the package to the intended [runtime role](../../reference/roles-and-package-ownership.md)
   only through its role/ownership inputs. Regenerate plugin inventory and
   catalogue through their owners; verify registration, provider and role facts.
   Update the capability reference, resource constraints and consuming guide.
   Security review must inspect the translated receiver authority, not only
   whether the caller possesses a string with the right name.
5. Run the registry, capability-runtime and capability-security checks below,
   plus the changed provider/caller package tests. Select the specific
   vocabulary, registration and policy drift checks when those inputs change.
   Before removal, find all grants, provider selections, role inclusions and
   retained runs; retire them without silently widening another provider.

```sh
set -eu
node tests/verification/contracts/check-plugin-system-v2-registry.mjs
node tests/verification/contracts/check-plugin-system-v2-capability-runtime.mjs
node tests/verification/contracts/check-plugin-system-v2-capability-security.mjs
npm run plugin-system:inventory:check
```

A missing provider, denial, resource mismatch or retained consumer stops
activation/removal. A local green result does not install a cluster grant.

### Introduce an event

1. Select the actual contract family. A namespaced `plugin-domain-event.v2`
   remains a plugin-domain event; do not insert it into the separate flat-v1
   telemetry catalogue merely to reuse that generator.
2. For a flat-v1 telemetry event, edit `contracts/telemetry/v1/catalog.json`
   and add `payloads/<event-type>.schema.json`. Define required payload fields,
   correlation, unknown-field policy, ordering and whether work ownership
   applies. The generator reads these payloads and derives `events/` schemas,
   TypeScript/Go representations and the contract manifest. Do not edit those
   generated copies as the authority.
3. Update the real producer and every selected consumer/observer. State an
   unknown or absent consumer explicitly. Define redaction before emission,
   duplicate handling, backpressure, persistence, retention and replay version
   compatibility. Do not put credentials or unbounded model content in a new
   diagnostic field. Add one real producer-to-consumer fixture and negative
   payload/correlation/order cases, not only schema construction.
4. Prepare the selected Go/gofmt toolchain, run
   `node scripts/generate-telemetry-contracts.mjs`, inspect its owned outputs,
   then run the same command with `--check`. Run
   `node --test contracts/telemetry/v1/tests/contracts.test.mjs` and the
   handbook's [telemetry chain](../developer-handbook.md#change-telemetry-or-derived-views)
   for the changed producer, observer/store or derived UI path.
5. Update event/payload, producer/consumer, error/store and telemetry guides.
   Package the changed producer/observer in the selected roles separately from
   capability grants. Require supported readers before activation. On removal,
   account for retained events, checkpoints and old readers before deleting
   payload or consumer support; an unknown observation cannot become success.

Source: [vocabulary and resource checks](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts#L1-L198), [provider/grant validation](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/skills/common/plugin-runtime/foundation/registry/capabilities.ts#L1-L221), [telemetry catalogue](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/contracts/telemetry/v1/catalog.json#L1-L28), and [payload-to-wire generation](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/scripts/generate-telemetry-contracts.mjs#L134-L185). The steps prescribe checks, not prior execution results. Core invocation authority: [authorization handler and failure](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/skills/nova/core/execution/authorization.ts#L116-L130).
[Invocation context](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/skills/nova/core/execution/context.ts#L40-L54) calls that boundary before provider execution.

**Source — capability denials versus event envelope and generated telemetry**

Implementation: [`closed_capability_definitions`](../../../../skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts#L37-L70), `skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts:37-70`. Revision: current-checkout SHA-256 `147fae4d867752edcb4cb1bf9966ed62372e77a5e90402a9f8fac9a8ab170fa0`. Implementation: [`resource_constraint_denial`](../../../../skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts#L170-L197), `skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts:170-197`. Revision: current-checkout SHA-256 `147fae4d867752edcb4cb1bf9966ed62372e77a5e90402a9f8fac9a8ab170fa0`. Implementation: [`namespaced_plugin_domain_event`](../../../../skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1060-L1077), `skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json:1060-1077`. Revision: current-checkout SHA-256 `837efd7975991aa21b8c92b57881194e9bc8c7adc4370f238d1a15b6d85d44db`. Implementation: [`gofmt_child_and_generated_write`](../../../../scripts/generate-telemetry-contracts.mjs#L14-L39), `scripts/generate-telemetry-contracts.mjs:14-39`. Revision: current-checkout SHA-256 `71f894da41b2bda7462f785f2c0adbab863e4037a91dd649cd968f02547c5a0c`. Contract or setting: the selected boundary and configuration described in this section. Test evidence: the selected checks below; not executed for this page. Limit: implementation contracts only; no native, deployed, browser or retained-run result.


## Integrations and receiving services

Choose the actual [package guide](../plugin-catalogue/README.md) and the
[smallest complete check chain](../developer-handbook.md#select-the-smallest-complete-check-chain).
Trace caller → admitted target → host/model/service → bounded request → persisted
result and downstream consumer. Forge, Echo and service/API integrations do not
share an invented start command or one generic receipt implementation.
An application programming interface (API) defines the receiving operation;
endpoint reachability alone does not authorize it.

For runtime dispatch, verify the selected endpoint, authentication, resource
identity and limits at their real loader and receiver. HTTP means Hypertext
Transfer Protocol. HMAC is a keyed message authentication code; the shown adapter
signs the idempotency key and exact JSON body with a confidentially obtained
secret. SPIFFE (Secure Production Identity Framework for Everyone) workload
identity is a different selected trust path; do not substitute an HMAC secret.
The adapter rejects oversized requests, invalid target or cancellation; a safe
bounded no-follow retained-result read is not proof of successful remote work.

`createDispatchAdapter` exposes ready/invoke/shutdown here, not `receipt`.
If a response is lost, preserve the request identity and receiving-service
outcome; stop while it is unknown. Do not claim durable-effect recovery can
reconcile an adapter that lacks its required receipt method. Run selected package
and original receiving-host fixtures; use `verify:prism:native-dispatch` when that
Control boundary changes. Use the separate Forge/Echo change paths below for host, model, policy,
version and lost-response behavior.

### Change the Forge implementation path

1. Read the [Forge contract and operational path](../../understand/forge.md).
   Change `implementation-agent/src/protocol.ts`, its schemas and consumers
   together when request/completion semantics change. Trace `src/stage.ts`
   through active lease identity, attempt-owned workspace, dispatch, completion
   parsing, integrated revision and retained-workspace cleanup evidence.
   Preserve Git commit/merge authority in its owning adapter, not the model.
2. Select `config.agent` through the compiled stage config and admitted
   `runtime.dispatch` target. It has no Forge environment fallback.
   `agentRole` does not override the selected target. Change host/model routing,
   workspace/result roots, endpoint/authentication, limits and polling through
   that target's real runtime-dispatch configuration loader. Use the
   [OpenClaw target boundary](../../understand/openclaw.md) or the explicitly
   selected service/API receiver; do not invent a common launch command.
3. Build/test `@kubeclaw/plugin-implementation-agent` and
   `@kubeclaw/plugin-runtime-dispatch`. Run
   `node --test tests/verification/reliability/forge-workspace.test.mts tests/verification/reliability/forge-lock-wait.test.mts`
   and the changed dispatch-profile/workspace-result fixtures. Preserve invalid
   completion, wrong target/model, cancellation, conflicting workspace owner,
   lost response and retained work as negative cases.
4. For host rollout, use the actual role/package build and operator
   [maintenance procedure](../../use/maintenance.md), with the selected pinned
   host package/image, private target config and current credential authority.
   Verify target identity and bounded result collection before an attempt.
   A model name or successful harness does not install or authenticate that host.
   After uncertainty, inspect original effect/Git/workspace evidence; do not
   issue a second commit, merge or dispatch to manufacture a result.

For the Forge package boundary above, the exact common package commands are:

```sh
set -eu
npm run build --workspace @kubeclaw/plugin-implementation-agent
npm test --workspace @kubeclaw/plugin-implementation-agent
npm run build --workspace @kubeclaw/plugin-runtime-dispatch
npm test --workspace @kubeclaw/plugin-runtime-dispatch
```

The shared checkout prerequisites remain required; a missing tool or fixture
fails that path. Keep command output separate from a deployed-host observation.

### Change the Echo review path

1. Read the [Echo subject, policy and verification boundary](../../understand/echo.md).
   Select review, repository-audit or revalidation deliberately; their defaults,
   inputs and recovery identities differ. Trace `review/src/stage.ts`,
   `protocol.ts`, policy resolver/contract, verification protocol, reducer and
   report builder before changing a prompt or output field.
2. Update types, source schemas and owning schema generators together for a
   policy, evidence/report encoding or version change. Keep subject revisions,
   source/context manifests, model/runtime identity, policy and report digests
   bound. Retain old-version readers while stored reports or revalidation
   depend on them; never edit an immutable earlier report into the new format.
3. Use the selected stage's runtime target and admitted host/model configuration,
   not a prompt hint. Preserve repository/artifact read grants and the absence
   of Git write authority. Test the policy's accepted/denied and unknown
   evidence cases, deterministic reduction, report bounds and revalidation.
4. Run `npm run schema:check --workspace @kubeclaw/plugin-review`, the changed
   focused contract tests and `npm test --workspace @kubeclaw/plugin-review`.
   Its pre/post-test hooks and local harness are part of that command.
   Run runtime-dispatch tests when host/model/endpoint behavior changes.
   A quality/scale evaluation is a separate dataset/model route; prepare its
   declared inputs before claiming model judgment quality.
5. Deploy the selected role/host through the same bound operator procedure,
   then verify an immutable review subject, exact target/model and retained
   result through the receiving host. Keep orchestrator-required/unknown
   outcomes blocked. Removal must account for pending jobs, stored reports,
   earlier policy readers and revalidation consumers. No shared-adapter receipt
   method or automatic cross-version migration is implied.

Source: [Forge stage](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/skills/nova/plugins/implementation-agent/src/stage.ts#L1-L152), [Forge protocol](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/skills/nova/plugins/implementation-agent/src/protocol.ts#L1-L143), [Echo stage](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/skills/nova/plugins/review/src/stage.ts#L1-L289), [Echo check/harness ownership](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/skills/nova/plugins/review/package.json#L1-L26). Use the named package scripts for their actual complete prerequisites and effects.

**Source — target admission, authenticated request and missing generic receipt route**

Implementation: [`bounded_endpoint_defaults`](../../../../skills/common/plugins/runtime-dispatch/src/adapter.ts#L14-L25), `skills/common/plugins/runtime-dispatch/src/adapter.ts:14-25`. Revision: current-checkout SHA-256 `5bf2d0c003497e74b0bfdf7524b4725bcd77d12b592f00e121be553868009e5e`. Implementation: [`HTTP_identity_auth_output`](../../../../skills/common/plugins/runtime-dispatch/src/adapter.ts#L113-L137), `skills/common/plugins/runtime-dispatch/src/adapter.ts:113-137`. Revision: current-checkout SHA-256 `5bf2d0c003497e74b0bfdf7524b4725bcd77d12b592f00e121be553868009e5e`. Implementation: [`dispatch_admission_no_receipt_option`](../../../../skills/common/plugins/runtime-dispatch/src/dispatch-adapter.ts#L14-L38), `skills/common/plugins/runtime-dispatch/src/dispatch-adapter.ts:14-38`. Revision: current-checkout SHA-256 `16ccaa5e974de17c36d20078fb2912ddd9d2fa1c6a0a677af760e242ce3cd33a`. Implementation: [`no_follow_result_reader`](../../../../skills/common/plugins/runtime-dispatch/src/result-persistence.ts#L43-L64), `skills/common/plugins/runtime-dispatch/src/result-persistence.ts:43-64`. Revision: current-checkout SHA-256 `4939307a37adc3aea6dfba4d7f196a897c5ee3ca72a7594c6b7b8c02f4509a41`. Implementation: [`accepted_receipt_recovery_fence`](../../../../skills/nova/core/effects/durable-invocation.ts#L88-L145), `skills/nova/core/effects/durable-invocation.ts:88-145`. Revision: current-checkout SHA-256 `6856d2c2761cb9c8e974d0f8683e0083571ed91b25740832921d32341e70d3f2`. Contract or setting: the selected boundary and configuration described in this section. Test evidence: the selected checks below; not executed for this page. Limit: implementation contracts only; no native, deployed, browser or retained-run result.


## Studio and Archviewer

Prism Studio is a typed document editor. Archviewer is a separate static reader;
neither may take over the source component's write/approval authority. Use
[Change UI behavior](../developer-handbook.md#change-ui-behavior),
[Prism ownership](prism.md#start-with-the-smallest-owner) and
[Archviewer](../../understand/archviewer.md).
User interface (UI) changes must preserve domain operations, revision conflicts,
preview isolation, authentication, keyboard access and responsive behavior.
Preserve user intent on a stale-revision conflict rather than overwriting it.

The Studio build empties `skills/prism/dist-studio`; npm's `prebuild:studio`
also generates contract validators before Vite runs. The development server
binds loopback `127.0.0.1:4190`. Playwright can start or reuse a server there;
identify its owner/bytes before trusting a result from an already occupied port.
Its declared projects cover desktop, phone and tablet sizes, not every browser.
Build/test output is not publication or a deployed browser observation.
For Archviewer, native nginx/OpenSSL prerequisites and the actual input document
and publisher must be established separately. If that supported publisher/read
path is missing, stop there; do not replace it with a Studio build or screenshot.

**Source — Studio npm lifecycle, output directory and browser-server boundary**

Implementation: [`Studio_nested_script_owner`](../../../../skills/prism/package.json#L1-L40), `skills/prism/package.json:1-40`. Revision: current-checkout SHA-256 `19457da92aed9c48e1bc81e082463bba0e406c662adeaff7699e0c674b45709c`. Implementation: [`UI_build_write_local_server`](../../../../skills/prism/studio/vite.config.ts#L1-L10), `skills/prism/studio/vite.config.ts:1-10`. Revision: current-checkout SHA-256 `523f55894f9562a6c0f3bb2816ad9ab6e5a0538e7fbd7cf8d535f876a42d2ee5`. Implementation: [`browser_projects_managed_server`](../../../../skills/prism/studio/playwright.config.mjs#L1-L7), `skills/prism/studio/playwright.config.mjs:1-7`. Revision: current-checkout SHA-256 `b7a8e95cac93fae2ccc04cf5d4c79bab218b9e308164a1605667811ddb690655`. Implementation: [`UI_route_reuse`](../../../../docs/site/extend/developer-handbook.md#change-ui-behavior), `docs/site/extend/developer-handbook.md:1680-1726`. Revision: current-checkout SHA-256 `c0d4232c5c8b5278c4d57d965a92ac6bb9481be89c6f88b3dbed7ca58a5f0067`. Contract or setting: the selected boundary and configuration described in this section. Test evidence: the selected checks below; not executed for this page. Limit: implementation contracts only; no native, deployed, browser or retained-run result.


## Charts, values and GitOps

Helm renders templates from selected values. GitOps uses a repository selection
for deployment reconciliation; a render is not that reconciliation. Follow
[Change charts or GitOps](../developer-handbook.md#change-charts-or-gitops)
and the [configuration change-impact matrix](../../reference/configuration-change-impact.md).
Trace each changed value/schema/default or omitted field through conditions,
overrides and templates to the receiving process, volume, network policy or
role-based access control (RBAC) rule. Determine whether the effect is restart,
rollout, new run, host preparation or a separate data procedure.

The selected GitOps fixture copies and changes a temporary repository, creates
Git commits, materializes selections and invokes native Helm. Its synthetic
release data are fixture inputs, not accepted releases. Require the original
release/credentials/tool prerequisites and selected receivers. Configuration
and local-Helm checks detect their named input drift; they do not prove cluster
admission, image availability, storage attachment or a completed sync.
Before deployment or rollback, use the real operator maintenance/recovery path
with original images, data, credentials and writer boundaries. An old image does
not restore a schema or credential. Do not propose unconditional reruns of an
operation whose partial apply or cleanup is unknown.

### Regenerate the selected GitOps tree without changing its owner

1. Edit authored chart/templates, selected values, role inputs and version/release
   selectors. Do not hand-edit an immutable exported `resources.yaml` or its
   `bundle.receipt`. `scripts/gitops-bundle.mjs` exports Buster, Prism and Nova
   groups with resource identities and manifest digests into a new
   `releases/gitops/<name>` directory. It refuses an existing output directory.
2. The continuous route uses `scripts/gitops-continuous.mjs export` for its
   selected immutable bundle. Its `prepare` derives `gitops/production`
   application/bootstrap/selection files from that bundle, repository URL,
   revision and configured namespaces. Export reads the authored overlays
   selected by `gitops/production/config.json`; prepare does not rewrite them. Its `check` compares
   those exact generated bytes; it does not prepare or apply the cluster.
   Preserve consistent receipt, group paths, selections and image identities.
   Continuous Applications track `main`, not a permanently pinned
   `SOURCE_COMMIT`; unique bundle paths and reviewed promotion must keep
   that moving branch bound to the intended immutable release.
3. From a prepared checkout, bind `BUNDLE_DIRECTORY` to a new reviewed
   `releases/gitops/<name>` and `REPOSITORY_URL` to the approved HTTPS repository.
   First export the selected bundle:

```sh
set -eu
node scripts/gitops-continuous.mjs export "$BUNDLE_DIRECTORY"
```

   Review the receipt/resources and matching authored release selectors, values
   and configuration inputs. Commit that complete intended change before
   preparing the production tree. Do not select an earlier commit: the native
   `readCommittedBundle` consumer uses `git show` to read receipt, resource
   files and release inputs at `SOURCE_COMMIT`, not the uncommitted export.
   Record the full resulting commit containing the verified bundle and inputs.
   From that consistent checkout, bind it and derive the next change:

```sh
set -eu
SOURCE_COMMIT=$(git rev-parse HEAD)
node scripts/gitops-continuous.mjs prepare "$BUNDLE_DIRECTORY" "$REPOSITORY_URL" "$SOURCE_COMMIT"
node scripts/gitops-continuous.mjs check "$BUNDLE_DIRECTORY" "$REPOSITORY_URL" "$SOURCE_COMMIT"
```

   Review and commit the generated production files as the subsequent change.
   These local steps do not publish a branch, activate Argo or apply workloads.

4. Review the generated diff and security/upgrade consequences: service accounts,
   RBAC, Secrets, admission, network policy, image provenance, volumes and
   retained data; changed defaults and omitted fields need explicit review.
   Run the handbook's chart/branch renders and release/continuous/deployment
   tests, plus selected configuration/drift checks. Require consistent digests
   and selections before considering preflight or rollout.
5. Use [GitOps operation](../../use/maintenance.md#gitops-operation) for the
   separate cluster owner/preflight/health procedure. Imperative deployment
   rejects Argo-owned namespaces and retained tracked workloads. Deleting an
   Application or stripping metadata does not transfer ownership. The current
   repository has no supported in-place Helm-to-Argo takeover; stop mixed-owner
   rollout until the platform owner supplies and verifies that separate task.
6. Review the known continuous-health branch-versus-commit limitation before
   interpreting readiness. Compare intended and actually resolved immutable
   revisions, not arbitrary strings. A successful local generation/render does
   not resolve that live gap or prove sync, rollback or data recovery.

Source: [immutable bundle and receipt](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/scripts/gitops-bundle.mjs#L94-L123), [production tree generation](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/scripts/gitops-continuous.mjs#L1-L108), and [existing owner guard](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/scripts/gitops-owner.mjs#L1-L32). These are source-backed command effects, not an executed production generation or rollout.
[Committed bundle reader](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/scripts/gitops.mjs#L30-L79) defines the intervening Git revision boundary.

**Source — render inputs, real temporary Git/Helm effects and rollout classification**

Implementation: [`charts_GitOps_route_reuse`](../../../../docs/site/extend/developer-handbook.md#change-charts-or-gitops), `docs/site/extend/developer-handbook.md:1475-1516`. Revision: current-checkout SHA-256 `c0d4232c5c8b5278c4d57d965a92ac6bb9481be89c6f88b3dbed7ca58a5f0067`. Implementation: [`Helm_fixture_subprocess`](../../../../tests/verification/deployment/prism-native-runtime.test.mjs#L15-L24), `tests/verification/deployment/prism-native-runtime.test.mjs:15-24`. Revision: current-checkout SHA-256 `8a103340311017870f682947f0003e59849048e344035bb55842851ee7d5531d`. Implementation: [`Git_temp_render_mutation_fixture`](../../../../tests/verification/deployment/gitops-release.test.mjs#L15-L48), `tests/verification/deployment/gitops-release.test.mjs:15-48`. Revision: current-checkout SHA-256 `a48622956e62dc1461e8d696c36baa2a2087be9d3d0128e98e91a7e995bac80a`. Implementation: [`startup_new_run_rollout_boundaries`](../../../../docs/site/reference/configuration-change-impact.md#impact-classes), `docs/site/reference/configuration-change-impact.md:20-44`. Revision: current-checkout SHA-256 `c8e9a84b585bd96eb0d8e095e8a6188980f8a0584adbd7cca396f8a16e91854e`. Contract or setting: the selected boundary and configuration described in this section. Test evidence: the selected checks below; not executed for this page. Limit: implementation contracts only; no native, deployed, browser or retained-run result.


## Data models and migrations

Name the durable invariant, every writer/reader, transaction boundary and backup
owner before changing a stored field. Plan expansion, compatibility and backfill
of existing records separately from later removal. Keep old readers until their
supported-version and retained-data obligations are closed. A migration for one
store is not a general platform migration or restoration procedure.

Use [Prism storage changes](prism.md#change-storage-or-add-a-migration).
Its migrator sorts numbered SQL files, takes a transactional advisory lock and
records applied **filenames**, not SQL content hashes. Never edit an applied
migration. Use the migrator role for data definition and the runtime role for
application access. New immutable artifact bytes are synchronized and published
without replacing existing content before their database reference is committed.
Retain database, artifact references, keys and original media as one consistent
application recovery group; metadata restoration alone is not restored content.

Test both a new database and the oldest supported schema, application-code
rollback while the new schema remains, conflicts and interruption. `test:storage`
is a selected local test route, not a claim of native PostgreSQL or full restore.
Require the actual isolated database and application read/restore observation
before the corresponding operational claim. Use [Recovery](../../use/recovery.md)
for supported component procedures; if backfill, cutover or restore is not
provided, record that missing procedure and stop before the irreversible change.

**Source — Prism SQL migration history and durable artifact boundaries**

Implementation: [`migration_route_reuse`](../../../../docs/site/extend/platform/prism.md#change-storage-or-add-a-migration), `docs/site/extend/platform/prism.md:374-401`. Revision: current-checkout SHA-256 `9c7b43487328edd95695c7581468b768f21d538dd2d7e429aa62e6a9ec6badeb`. Implementation: [`migration_lock_ledger_transaction`](../../../../skills/prism/storage/index.ts#L21-L72), `skills/prism/storage/index.ts:21-72`. Revision: current-checkout SHA-256 `e5105909e5f1abf1eb2178270dd63d1b8e2aa337177dcb620b6ae43199a3a199`. Implementation: [`immutable_artifact_publication`](../../../../skills/prism/storage/artifacts.ts#L36-L68), `skills/prism/storage/artifacts.ts:36-68`. Revision: current-checkout SHA-256 `8177fe9d5199d1af866a2ad7d5d7fdfa82b99b0fe6df5b7f0c3c04e96536ef1f`. Implementation: [`preservation_reconciliation_not_pure_read`](../../../../docs/site/use/recovery.md#pipeline-state-recovery), `docs/site/use/recovery.md:936-985`. Revision: current-checkout SHA-256 `944988014bbfecd79138d2180f47631218ecea38efef9ae4bc3239e4e76a1a52`. Contract or setting: the selected boundary and configuration described in this section. Test evidence: the selected checks below; not executed for this page. Limit: implementation contracts only; no native, deployed, browser or retained-run result.


## Select commands with their real effects

These are source-defined commands, not checks executed for this page. Start at
the repository root after the setup and component prerequisites above. Root
`npm run` resolves the installed local binaries through npm's PATH; it does not
qualify a substituted compiler/tool. Stop at the first nonzero exit in a serial
chain. Preserve output, selected revision, working directory, non-secret inputs
and temporary-artifact/cleanup status. Exit zero establishes only the named
check's scope, not product, native, browser or deployed success.

### Root command routes

| Exact root invocation | Additional prerequisites and effects | Result meaning |
| --- | --- | --- |
| `npm run verify:worker-core:contracts` | Locked TypeScript and source contract inputs; Node checker then two-stage contract chain with noEmit typecheck | Worker contract consistency, not native host readiness |
| `npm run verify:worker-core:attempt-executor` | Node contract checker then two noEmit TypeScript projects; original package inputs | Attempt-executor/type contracts, not supervised process recovery |
| `npm run verify:runtime-packaging:ownership` | Role manifests and package-ownership authorities; Node ownership checker | Named packaging boundaries, not activation or host admission |
| `npm run plugin-system:sdk:check` | Installed json-schema-to-typescript; real compilation and generated-byte comparison; selected check does not write generated target | Current canonical generated types only |
| `npm run plugin-system:sdk:build` | Locked root tsc; emits SDK build outputs | Build, not full consumer compatibility |
| `npm run plugin-system:sandbox:build` | PATH cc/C11 hardening; writes temporary maintained sandbox binary, chmod then rename | Built isolation launcher, not trusted running host |
| `npm run docs:inventory:config:check` | Follow documentation-maintenance native/input prerequisites; traverse real config/schema sources and compare inventory | Named inventory drift, not global configuration acceptance |
| `npm run docs:inventory:local-helm:check` | Qualified Helm and selected chart/value inputs; generator check then boolean semantics checker | Local authorities/selected branch semantics, not live cluster state |
| `npm run docs:generate:check` | Follow documentation-maintenance source/input/native acquisition prerequisites; genuine source discovery and generated-output comparison | Selected generated outputs, not write-free execution merely because --check is present |
| `npm run docs:governance:check` | Classification, registered dependencies and baseline inputs; compare governance outputs | Governance constraints, not independent content correctness |
| `npm run docs:check:refs` | Actual referenced checkout/source objects and documented reference prerequisites | Selected repository references, not published browser routes |
| `npm run docs:publication:check` | Runs docs:publication:test before publication check; test fixture/effect prerequisites apply | Current publication checks, not future HTML/browser/search implementation |
| `npm run docs:publication:build` | Current publication input/output ownership and maintenance prerequisites; stages raw Markdown/assets and writes build output | Not a rendered HTML/search or live-site proof |
| `npm run docs:site-boundary:check` | Current reader-site input boundary checker | Source boundary, not complete reader-task acceptance |
| `npm run docs:core-guides:check` | Genuine Git objects and protected source revision; Git show and whole-file comparisons | Named Core guide byte/revision constraints; never fix by an unexplained repin |
| `npm run versions:check` | Central versions and their selected consumer files | Named version drift, not an observed build |
| `npm run verify:sdk:local` | Serial selected reliability fixtures; real identity/compiler/durability/cancellation paths and temporary outputs require original harness prerequisites | Named portable JSON/identity/delivery cases, not every SDK consumer |
| `npm run verify:worker-core:native-runtime` | Four real Node native/render fixture files, C compiler/prepared host/cgroups/Helm as selected; then GOTOOLCHAIN=local Go race test in tools/native-worker-nri, -mod=readonly -count=1 | Selected native cases; missing supported host remains not ready |
| `npm run verify:prism:native-dispatch` | Original native operation-journal then HTTP fixture prerequisites, real processes/stores/service identities | Selected Prism dispatch, not every service integration |

### Prism command routes

Invoke from the repository root using `--prefix skills/prism`; npm runs the
script with `skills/prism` as its working directory. Do not change to another
working directory and retain root-relative assumptions. Npm lifecycle hooks
still apply: `build:studio` invokes `prebuild:studio`, including when nested
inside remediation. The explicit development environment below is not a
production server configuration.

| Exact invocation from repository root | Prerequisites, environment and effects | Result meaning |
| --- | --- | --- |
| `npm run test:domain --prefix skills/prism` | Locked source/contract dependencies; runs domain and domain-storage Node fixtures | Typed/domain cases, not deployed database behavior |
| `npm run test:storage --prefix skills/prism` | Locked source/contract dependencies; runs storage and Control Node fixtures | Selected local storage tests, not native PostgreSQL/restore |
| `npm run build:studio --prefix skills/prism` | Prebuild regenerates contract validators; Vite replaces dist-studio | Compiled UI artifact, not observed browser or publisher |
| `npm run dev:studio --prefix skills/prism` | Explicit NODE_ENV=development; starts loopback Vite at 127.0.0.1:4190; port and process owner required | Development server; stop owned process after use |
| `npm run test:studio --prefix skills/prism` | Adapter Node fixtures then Playwright; genuine installed browser/dependencies and identified loopback server; may start/reuse server | Declared desktop/phone/tablet cases, not deployment |
| `npm run typecheck --prefix skills/prism` | Installed root-selected compiler; tsc --noEmit in Prism package | Static types, not activation |
| `npm run test:studio-remediation --prefix skills/prism` | Roundtrip and preview-assets Node fixtures; nested build with validator writes/dist replacement; then remediation Playwright/server effects | Selected remediation path, not all UI security or visual acceptance |

**Source — actual npm owners and selected generator/native/browser effects**

Implementation: [`workspace_map`](../../../../package.json#L1-L31), `package.json:1–31`. Revision: current-checkout SHA-256 `c1c7109e5aced3207861e9e676f69056583878c46bed4facbcd0503a9b8e10b6`. Implementation: [`Studio_nested_script_owner`](../../../../skills/prism/package.json#L1-L40), `skills/prism/package.json:1-40`. Revision: current-checkout SHA-256 `19457da92aed9c48e1bc81e082463bba0e406c662adeaff7699e0c674b45709c`. Implementation: [`canonical_schema_codegen_check_write`](../../../../scripts/generate-plugin-sdk-types.mjs#L1-L33), `scripts/generate-plugin-sdk-types.mjs:1-33`. Revision: current-checkout SHA-256 `3fe20ad1f2e5d604f4197d3fb7dd6e897f2ad3f6e6fd6b013412fc0eba8aed0b`. Implementation: [`C11_compile_atomic_output`](../../../../scripts/build-plugin-sandbox.mjs#L1-L25), `scripts/build-plugin-sandbox.mjs:1-25`. Revision: current-checkout SHA-256 `ea546fd31e572312986730c4f8c89aacf0943aeb37b560cc63281cf67a9f92ec`. Implementation: [`selected_Go_build_effect`](../../../../scripts/build-native-worker-nri.mjs#L1-L17), `scripts/build-native-worker-nri.mjs:1-17`. Revision: current-checkout SHA-256 `2030ab287fd08b0acbe476b2248c92a44518117d68e278db94737516b7ec2dd8`. Implementation: [`UI_build_write_local_server`](../../../../skills/prism/studio/vite.config.ts#L1-L10), `skills/prism/studio/vite.config.ts:1-10`. Revision: current-checkout SHA-256 `523f55894f9562a6c0f3bb2816ad9ab6e5a0538e7fbd7cf8d535f876a42d2ee5`. Implementation: [`browser_projects_managed_server`](../../../../skills/prism/studio/playwright.config.mjs#L1-L7), `skills/prism/studio/playwright.config.mjs:1-7`. Revision: current-checkout SHA-256 `b7a8e95cac93fae2ccc04cf5d4c79bab218b9e308164a1605667811ddb690655`. Contract or setting: the selected boundary and configuration described in this section. Test evidence: the selected checks below; not executed for this page. Limit: implementation contracts only; no native, deployed, browser or retained-run result.


## CI, documentation and protected evidence

Continuous integration (CI) runs the workflow's selected checks with its actual
permissions and tools. Pipeline reliability uses Node 24 and locked dependency
installation, then builds the sandbox before its selected contract fixtures.
Independent failed steps remain failures; collecting their reports together is
not a successful run. Docs CI selects Node 24, Go 1.26.3 and Helm 3.22.0.
Its remote `contents: read` permission does not make local commands read-only:
it regenerates inventories/docs, then uses Git status to reject drift.
This page does not establish actual remote branch protection, credentials,
workflow execution or merge/release authority.

The current Core guide checker selects protected revision
`4f089958db97a551f406c157d774bda143a38946`, checks the required evidence metadata,
and compares cited source files against Git objects. The handbook's historical
example revision is not that current guard. When relevant source changes, use
the owning Core-guide change procedure and have the affected explanation/source
reviewed together. Do not copy an old literal, silently renew the guard or infer
a general permission to bypass it. Git object availability/equality still needs
the actual qualified check; it was not observed here.

Use [the documentation owner routes](../developer-handbook.md#route-each-source-change-to-its-documentation-owner)
and [documentation maintenance](../documentation-maintenance.md) for generated
source, reference, configuration and reader-task changes. After a rename/removal,
account for imports, registered dependency paths, generated references, nav and
retained compatibility before deleting old authority. Recheck both repository
and published routes through their actual procedures; local links alone do not
prove publication.

**Source — current protected checker, workflow authority and documentation ownership**

Implementation: [`actual_current_protected_revision`](../../../../scripts/check-core-architecture-guides.mjs#L9-L23), `scripts/check-core-architecture-guides.mjs:9-23`. Revision: current-checkout SHA-256 `05e0c0421afda55921950e88adbb005e3455111830ee0953204c1f0f0ebce01e`. Implementation: [`Git_source_equality_guard`](../../../../scripts/check-core-architecture-guides.mjs#L103-L133), `scripts/check-core-architecture-guides.mjs:103-133`. Revision: current-checkout SHA-256 `05e0c0421afda55921950e88adbb005e3455111830ee0953204c1f0f0ebce01e`. Implementation: [`CI_core_dependencies_and_build_effect`](../../../../.github/workflows/pipeline-reliability.yaml#L1-L41), `.github/workflows/pipeline-reliability.yaml:1-41`. Revision: current-checkout SHA-256 `e338f143d87d8fcbf16830fdf82a0f7a9396f53376a780f4076ee4fb5e87ac4a`. Implementation: [`CI_read_authority_local_write_guard`](../../../../.github/workflows/docs-checks.yaml#L1-L60), `.github/workflows/docs-checks.yaml:1-60`. Revision: current-checkout SHA-256 `5349499f1936d361a0d269bc45664550580fb8b1af5773391fbdd30dd08a35d7`. Implementation: [`CI_read_authority_local_write_guard`](../../../../.github/workflows/docs-checks.yaml#L61-L61), `.github/workflows/docs-checks.yaml:61-61`. Revision: current-checkout SHA-256 `5349499f1936d361a0d269bc45664550580fb8b1af5773391fbdd30dd08a35d7`. Implementation: [`source_to_documentation_route_reuse`](../../../../docs/site/extend/developer-handbook.md#route-each-source-change-to-its-documentation-owner), `docs/site/extend/developer-handbook.md:2002-2024`. Revision: current-checkout SHA-256 `c0d4232c5c8b5278c4d57d965a92ac6bb9481be89c6f88b3dbed7ca58a5f0067`. Implementation: [`page_write_map_missing_hub`](../../../../scripts/docs-generate.mjs#L141-L153), `scripts/docs-generate.mjs:141-153`. Revision: current-checkout SHA-256 `c83c5653177b9b0a56326b0e315c409dc3c814c95d37dd53933402a2288aa718`. Contract or setting: the selected boundary and configuration described in this section. Test evidence: the selected checks below; not executed for this page. Limit: implementation contracts only; no native, deployed, browser or retained-run result.


## Failure and recovery decisions

| Observation | Stop condition | Owner and safe next action |
| --- | --- | --- |
| Illegal stage state or changed replay | Live and retained decisions no longer agree | Lifecycle owner preserves original journal/graph and adds the exact denied transition and replay case; no live-only patch |
| Graph/package/identity mismatch | Original run inputs cannot be proved | Nova/package owner retains old inputs and first error; changed work uses its separately authorized new-run path |
| Accepted effect, missing receipt or lost response | Remote outcome is unknown | Adapter/resource owner reconciles the original request through its supported receipt contract; no duplicate request/new identity |
| Native ownership, capacity, channel or cleanup unresolved | Supported host admission is unproved | Worker and host owners retain boot/process/spool evidence and fence new work until original recovery completes |
| Untrusted package or denied capability | Trust/provider/grant contract failed | Foundation/security owner corrects the owning input; no blanket grant, trust-root widening or protected identity edit |
| Schema/generated output or Core source guard drift | Caller contract or evidence no longer matches | Contract/documentation owner reviews source and explanation; do not edit generated output or merely repin to green |
| UI revision conflict, wrong local server or missing publisher | Result does not describe intended user/source state | Preserve user intent, identify the real server and use the component route; no screenshot/build substituted for the missing path |
| Render/test succeeds but rollout or restore is unknown | No actual receiver/data observation | Operator/data owner follows its original procedure, preserves partial effects and checks compatibility before retry/rollback |

Cleanup is part of the selected procedure, not a universal delete command.
Retain original failed evidence and account for owned processes, locks, temporary
fixtures, stored receipts and application references before removal. Do not
unlink a lock or erase a spool merely to allow another attempt.

## What this router does not supply

The routes describe a bounded set of current source and command definitions.
They do not discover every extension, SDK consumer, event, error, integration,
workflow or data store. Complete new-capability/event activation and retirement,
Forge/Echo host/model/lost-response paths, each store's backfill/expand-contract
and application restore, actual native-host/deployment exercises, and the
Archviewer publisher/browser path require their supported component procedures.
When one is missing, name the blocked step and owning component before changing
its boundary. Do not replace it with a universal run-all command or claim
clean-checkout, remote, deployed or global coverage from this router.
