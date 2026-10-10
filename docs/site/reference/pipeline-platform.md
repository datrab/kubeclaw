# Pipeline Platform Configuration

Status: current configuration reference
Audience: platform operator, pipeline operator, plugin author
Owner: plugin runtime and Nova Core
Evidence: skills/common/plugin-runtime/foundation/config/platform.schema.json; skills/common/plugin-runtime/foundation/config/platform.ts; skills/nova/core/execution/engine-runtime.ts; skills/common/plugin-runtime/foundation/registry/capabilities.ts; skills/common/plugin-runtime/foundation/registry/configuration.ts; skills/common/plugin-runtime/foundation/registry/activation.ts; skills/common/plugin-runtime/foundation/registry/discovery.ts; skills/common/plugin-runtime/foundation/registry/digest.ts; skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts; skills/common/plugin-runtime/foundation/isolation/runner.ts; skills/common/plugin-runtime/foundation/isolation/cgroup.ts; skills/nova/core/execution/adapter-startup.ts
Applies to: `pipeline-platform.v2`
Last verified: 2026-10-10 at source revision `94fd165ae8177ec37bb16798bfed63cb8923f413`

## Purpose and authority

The platform document is the operator-owned trust and runtime boundary for a
pipeline process. It tells Nova where plugin packages may be discovered, which
external bytes are trusted, which registrations receive capabilities, which
adapters and observers start, and where durable run state is stored. A project
or pipeline definition cannot add any of these authorities.

Pass this file with `--platform`. The loader validates a closed JSON object,
resolves its path fields, freezes the resulting object, and returns no
partially valid configuration.

## Complete field reference

All top-level fields are required except `isolation` and `effectLockTtlMs`.
Unknown fields are invalid. An empty string is invalid wherever this table says
“non-empty.” JSON has no comments, environment substitution, or secret
interpolation at this boundary.

| Field | Type and constraints | Default or empty value | Consumer and effect |
| --- | --- | --- | --- |
| `schemaVersion` | Exact string `pipeline-platform.v2` | No default | Platform loader selects this contract. |
| `installationRoots` | Array of at least one unique, non-empty path string | No default; `[]` is invalid | Discovery searches direct package children of each canonical root. Missing roots and canonical aliases stop discovery; see [Path resolution](#path-resolution). |
| `trustedBuiltinRoots` | Array of at least one unique, non-empty path string | No default; `[]` is invalid | Discovery gives packages below these canonical roots built-in trust before checking either external map. These roots grant host-process execution authority; see [External trust and execution](#external-trust-and-execution). |
| `externalTrust` | Closed object; see below | No default | Discovery admits approved external package bytes with `isolated_external` trust scope. Approval does not establish execution readiness; see [External trust and execution](#external-trust-and-execution). |
| `providers` | Object from capability name to non-empty adapter registration ID | `{}` is structurally valid; every required capability still needs an explicit selection | Every entry must name a [known Nova capability](capabilities.md#nova-grant-vocabulary) and an installed adapter that declares it, including unused entries. Only required capabilities select and enable their providers. A mapping alone does not start an adapter; see [Adapter selection and validation](#adapter-selection-and-validation). |
| `grants` | Three-level JSON object: registration ID → capability → resource policy object | `{}` is structurally valid | The grant envelope is open; the consumer requires the exact closed constraints for each [Nova capability](capabilities.md#nova-grant-vocabulary). Missing, unrequested, disabled-registration, and invalid grants stop resolution. Follow the [canonical grant validation rules](../understand/plugin-runtime.md#capabilities-and-grants) and [disablement conditions](#adapter-selection-and-validation). |
| `adapters` | Object from adapter registration ID to its JSON configuration object | `{}` is valid | Every configured ID must exist. The runtime checks configuration against the installed schema for enabled adapters; invalid disabled configuration can remain undetected until activation. |
| `activeAdapters` | Unique array of non-empty registration IDs | `[]` is valid | Lists adapters to enable directly. Required capability providers and their dependencies are also enabled. Supplying configuration in `adapters` alone does not enable one. |
| `observers` | Object from observer registration ID to its JSON configuration object | `{}` is valid | Every keyed observer is enabled, schema-checked, and used for event delivery. |
| `isolation` | Optional closed object `{cgroupRoot}`; `cgroupRoot` is non-empty | Omission is schema-valid; it supplies no cgroup root | External stage and observer invocation requires a delegated cgroup-v2 subtree at this resolved root. Omission fails the cgroup consumer with `ISOLATION_CGROUP_REQUIRED`; see [External trust and execution](#external-trust-and-execution). |
| `storageRoot` | Non-empty path string | No default | Nova stores run snapshots, journals, effect locks, and observer records below this resolved root. |
| `shutdownTimeoutMs` | Schema: integer ≥ 1, without a maximum. Operational Node timer range: 1–2,147,483,647 ms. | No default | Adapter wait, shutdown, and cleanup paths capture this duration. Node converts larger values to a 1 ms delay. Stop before consumer recreation on overflow; see [timer range and cleanup limits](configuration-change-impact.md#timer-range-and-stop-condition). A deadline does not prove that adapter work stopped. |
| `effectLockTtlMs` | Optional integer from 60,000 through 86,400,000 | If absent, the effect coordinator uses 300,000 ms | Controls expiry of resource-effect locks. A larger value reduces premature reuse but delays recovery from an abandoned lock. |
| `orchestratorIssuerId` | Non-empty string | No default | Identifies the orchestrator that may issue its governed decisions. |
| `administrativeDecisionIssuers` | Unique array of closed `{type,id}` objects; `type` is `operator` or `administrator`; `id` is non-empty | `[]` is structurally valid | Core checks administrative decisions against these exact identities. Do not use a shared display name. |

`externalTrust` has exactly these required fields:

| Field | Type and constraints | Empty meaning |
| --- | --- | --- |
| `allowedSourceDigests` | Object keyed by `local:<canonical package root>` with a non-empty, unique array of package content digests; each digest is `sha256:` plus 64 lowercase hexadecimal characters | `{}` approves no source digest. Each array must contain at least one digest. The runtime requires the exact source key even though the schema accepts other key strings. |
| `verifiedAttestations` | Object from package content digest to approved attestation digest; each key and value is `sha256:` plus 64 lowercase hexadecimal characters | `{}` supplies no attestation mapping. Discovery looks up an operator-approved value; it does not verify a newly supplied attestation or publisher signature. |

The schema constrains the two digest maps but does not establish who approved a
digest. The operator must obtain these values through the deployment's trust
process.

## External trust and execution

Discovery uses the exact source reference `local:<canonical package root>`.
The root is the package directory after `realpath`, not its installation root,
package ID, registration ID, or publisher name. For example, the canonical
package root `/opt/nova/plugins/example` needs the key
`local:/opt/nova/plugins/example`.
Relocating it changes this key even if its bytes remain unchanged. Check and
approve the new location before changing the policy.

A package content digest covers every regular file in its tree, including
`plugin.json`. The files are sorted by relative path. For each file, SHA-256
receives the relative path's byte length, the relative path, and the file byte
length, separated by colons with a final colon, followed by the file bytes.
Package symlinks are rejected. A file rename or byte change therefore changes
the digest; an unchanged tree at a different root retains its content digest.

Source: [`computePackageDigest`](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/registry/digest.ts#L6-L27)
and [canonical package root before trust lookup](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/registry/discovery.ts#L119-L136).

Discovery checks trust in this order:

1. A package below a `trustedBuiltinRoots` root receives `trusted_first_party`
   scope. This decision bypasses both external maps.
2. Otherwise, its content digest must occur in `allowedSourceDigests` under
   the exact `local:` source reference. A match receives `isolated_external`
   scope and `source_digest_allowlist` evidence.
3. Otherwise, discovery looks up the content digest in `verifiedAttestations`.
   A match receives `isolated_external` scope and `publisher_attestation`
   evidence. This lookup does not perform cryptographic attestation verification.
4. If neither external map matches, discovery stops with
   `REGISTRY_PACKAGE_UNTRUSTED`. Obtain approval for the exact source and bytes
   through the deployment's trust process before preparing the runtime again.

Source: [`trustedProvenance` lookup order and scopes](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/registry/discovery.ts#L77-L103).

Trust admission permits the package to enter the registry. It does not make
all its registrations executable. An enabled external adapter still fails
activation with `REGISTRY_ACTIVATION_FAILED`: the persistent isolated adapter
runtime is not available. Plugin-runtime maintainers own this limit. Support
requires a persistent isolated host that implements and verifies adapter
startup, readiness, dependency calls, cleanup, and shutdown under isolation.
See the [canonical activation boundary](../understand/plugin-runtime.md#activation-is-fail-closed).

For an external stage or observer, preparation creates an invocation wrapper.
Actual invocation requires a bounded plugin context and a delegated cgroup-v2
root supplied through `isolation.cgroupRoot`. A bounded context contains the
host's invocation contract, resource limits, and capability-call interface.
An absent root fails with `ISOLATION_CGROUP_REQUIRED` at cgroup creation even
though the platform schema allows `isolation` to be omitted. Successful
preparation does not prove that the host can invoke the wrapper. Check the
[native launcher and host-kernel prerequisites](../understand/plugin-runtime.md#isolation-for-external-stages-and-observers)
before invocation.

Stop if these execution conditions are unavailable. Do not add external code
to `trustedBuiltinRoots` or import it directly to bypass isolation.

Source: [external adapter rejection and bounded-context wrapper](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/registry/activation.ts#L55-L86),
[invocation-time cgroup creation](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/isolation/runner.ts#L29-L40),
and [required root and delegation checks](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/isolation/cgroup.ts#L18-L25).

## Adapter selection and validation

Nova first enables the graph's stage owners, the configured observers, and
the IDs in `activeAdapters`. It then selects the provider of each capability
required by an enabled registration. Those providers can require other
providers. Resolution continues until no further registration is added.
Only required selections enter the effective provider set. The resolver also
validates every entry in `providers`, including an unused entry: the capability
must be known and the adapter must be installed and declare it. A valid unused
mapping does not enable or start that adapter. For a required capability,
selection is explicit even if only one installed adapter can provide it.

Without a mapping, multiple candidates produce
`REGISTRY_CAPABILITY_PROVIDER_AMBIGUOUS`; zero or one candidate produces
`REGISTRY_CAPABILITY_PROVIDER_MISSING`. A mapping to a missing adapter or one
that does not declare the capability produces
`REGISTRY_CAPABILITY_PROVIDER_INVALID`. An unknown capability key produces
`REGISTRY_CAPABILITY_UNKNOWN`. See [canonical provider selection](../understand/plugin-runtime.md#selection-is-separate-from-installation).

The final enabled set determines which built-in adapters load and start.
Enabled external adapters fail at the [external activation boundary](#external-trust-and-execution).
An empty `activeAdapters` list therefore does not guarantee that no adapter
will start: a stage or observer can require a provider adapter.

Source: [all-entry provider validation](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/registry/capabilities.ts#L75-L94)
and [missing, ambiguous, and invalid selection](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/registry/capabilities.ts#L96-L118).

Source: [initial enabled registrations](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/nova/core/execution/engine-runtime.ts#L44-L50),
[recursive provider selection](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/registry/capabilities.ts#L149-L159),
[loading enabled adapters](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/registry/activation.ts#L129-L136),
and [starting enabled adapters](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/nova/core/execution/adapter-startup.ts#L25-L31).

Configuration validation has two boundaries. Every key in `adapters` and
`observers` must name a known registration. Schema validation then applies to
enabled registrations, using their supplied configuration or `{}` when absent.
These checks do not insert schema defaults. In the platform path, every
configured observer is initially enabled. An
adapter can remain disabled, so successful preparation does not prove that its
stored configuration satisfies its schema. A later graph, provider, or
`activeAdapters` change can enable it and expose that invalid value.

Before changing adapter selection, validate the configuration for the resulting
enabled set. Stop on `REGISTRY_RESULT_INVALID`; correct the rejected value
against that adapter's installed schema before activation. Removing the ID
from `activeAdapters` does not disable it if another enabled registration still
requires it as a provider.

Grant validation follows that final enabled set. Every required capability
needs a grant. A grant for an unrequested capability fails with
`REGISTRY_CAPABILITY_UNREQUESTED`. Any `grants` entry for a disabled registration
fails with the same code, even if that entry is `{}`. The open grant policy
object does not relax the capability's closed shape: the consumer requires
exact constraint keys and non-empty, unique lists of non-empty strings, plus
the applicable path, prefix, or origin rules. Invalid constraints fail with
`REGISTRY_CAPABILITY_CONSTRAINT_INVALID`.

Use the [capability catalogue](capabilities.md#nova-grant-vocabulary) for the
required lists and the [canonical grant rules](../understand/plugin-runtime.md#capabilities-and-grants)
for validation and resource matching. To disable an adapter, first remove every
selection path through the graph, observers, `activeAdapters`, and required
providers. Remove its grant entry when it is actually disabled. If another
enabled registration still needs it, removing its grant can instead deny a
required capability. Disablement does not remove package bytes or durable data;
follow the [replacement, disablement, and removal boundary](../understand/plugin-runtime.md#replacement-disablement-and-removal).

Source: [required, unrequested, and disabled grant checks](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/registry/capabilities.ts#L163-L201)
and [closed constraint lists and canonical value checks](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts#L128-L167).

Source: [validation without defaults](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/registry/schema.ts#L95-L108),
[known registration IDs](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/registry/configuration.ts#L51-L63),
[enabled configuration validation](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/registry/configuration.ts#L65-L81),
and [preparation with resolved providers](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/nova/core/execution/engine-runtime.ts#L34-L41).

## Path resolution

The loader obtains the real path of the platform file. It resolves every
relative value in `installationRoots`, `trustedBuiltinRoots`, `storageRoot`,
and `isolation.cgroupRoot` from that file's directory. It does not use the
shell working directory. Absolute paths remain absolute. The loader resolves
symbolic links in the platform filename before selecting the base directory.

This rule makes a checked configuration portable as one directory, but it also
means that moving the file can change every relative target. Record the
canonical file path and its digest with the run.

Discovery then resolves each installation and trusted built-in root with
`realpath` and requires it to be a directory. A missing root or non-directory
stops preparation with `REGISTRY_ROOT_INVALID`. Distinct strings in either
root list that resolve to the same directory stop it with
`REGISTRY_PACKAGE_DUPLICATE`. A repeated canonical package directory also
fails with that code. Stop before activation; correct the missing target or
remove the alias after checking the canonical directories. Do not retain both
an original path and a symlink to the same root in one list.

Source: [root existence and directory checks](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/registry/discovery.ts#L13-L23),
[canonical root alias rejection](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/registry/discovery.ts#L39-L55),
and [canonical roots and repeated package checks](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/registry/discovery.ts#L106-L125).

## Minimal configuration

This example is syntactically complete. It assumes that the built-in packages
do not require an adapter, observer, provider, or grant. A graph that uses
capabilities or configured registrations requires entries in those maps.

```json
{
  "schemaVersion": "pipeline-platform.v2",
  "installationRoots": ["./packages"],
  "trustedBuiltinRoots": ["./packages"],
  "externalTrust": {
    "allowedSourceDigests": {},
    "verifiedAttestations": {}
  },
  "providers": {},
  "grants": {},
  "adapters": {},
  "activeAdapters": [],
  "observers": {},
  "storageRoot": "./state",
  "shutdownTimeoutMs": 30000,
  "orchestratorIssuerId": "nova:primary",
  "administrativeDecisionIssuers": [
    { "type": "operator", "id": "operator:release" }
  ]
}
```

## Configuration and activation sequence

1. The CLI loads and schema-validates the platform file.
2. The loader resolves paths and freezes the result.
3. Core validates the pipeline definition.
4. Discovery validates canonical roots, reads direct package children only
   from `installationRoots`, and applies the ordered trust checks above.
5. The registry maps stage types, adapters, observers, providers, and package
   provenance.
6. Core enables the owners of all graph stages, every key in `observers`, and
   every ID in `activeAdapters`.
7. Capability resolution validates all provider policy entries, selects the
   providers required by enabled registrations, and repeats selection for their
   dependencies. It validates grants against the final enabled set.
8. Each configured adapter and observer ID must exist. The runtime checks each
   graph stage and each enabled adapter and observer against its registration
   schema, using supplied configuration or `{}` for absent adapter/observer
   configuration. Disabled adapter configuration can remain unchecked.
9. Activation loads enabled built-in registrations, rejects enabled external
   adapters, and creates wrappers for enabled external stages and observers.
   The wrappers require the execution conditions above when invoked.

This ordering is intentional. Schema-valid JSON is not enough: the installed
package set determines whether registration IDs, stage owners, configuration
fields, providers, and grants are valid.

## Precedence and change impact

There is no merge between two platform files. The path passed to `--platform`
is the authority. Within that file, registration-specific configuration is
selected by exact key. Project configuration does not override it.

New runs use the loaded values. The runtime records the configured `providers`,
`grants`, `adapters`, `activeAdapters`, `observers`, and optional `isolation`
object. This includes unused provider mappings and disabled adapter
configuration. It is separate from providers selected for required capabilities.
Recovery compares this recorded subset with the newly prepared runtime. A
difference causes `RECOVERY_RUNTIME_CONFIGURATION_MISMATCH`. This comparison
does not include storage, trust roots/maps, timeout, TTL, or issuer fields.
Package identities and the graph are also pinned. Use the original platform
inputs to continue a run; use a new run identity for a changed authority set.

Source: [recorded configuration subset](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/nova/core/execution/engine-runtime.ts#L34-L41)
and [configuration and package comparison](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/nova/core/execution/engine-snapshots.ts#L28-L40).

Changing `storageRoot` points the CLI at a different run store. It does not move
existing state. Changing package roots, trust maps, providers, grants, adapter
configuration, observer configuration, or isolation can change executable
authority and therefore requires a new run unless an explicit supported
administrative package transition applies. Changing timeouts affects newly
created runtime objects; it does not rewrite persisted events.
The effect coordinator captures `effectLockTtlMs` when it is created, including
the 300,000 ms default if the field is absent. Editing the file does not change
the duration in an existing coordinator.

Source: [platform TTL passed at coordinator creation](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/nova/core/execution/engine-runtime.ts#L77-L86)
and [captured TTL used for effects](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/nova/core/effects/coordinator.ts#L11-L31).

See [Configuration precedence](configuration-precedence.md) and
[Configuration change impact](configuration-change-impact.md) for the
cross-family rules.

## Sensitive values

Do not place raw credentials in the platform file. The recorded runtime
configuration is stored with run state without redacting its values.
Adapter and observer configuration is part of the recovery comparison. Use the
secret-reference field defined by the selected registration and grant only
that registration access to the referenced secret. The platform schema cannot
detect a credential hidden in a free-form resource policy.

Source: [runtime configuration and selected providers recorded separately](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/nova/core/execution/engine-snapshots.ts#L123-L137)
and [snapshot serialization](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/nova/core/execution/engine-snapshots.ts#L105-L112).

## Errors and recovery

| Signal | Meaning | Safe action |
| --- | --- | --- |
| `PLATFORM_CONFIG_INVALID:<path>:<details>` | JSON did not satisfy the closed schema. | Read the field path in the validation details; correct the operator-owned file before starting a run. |
| `PIPELINE_STAGE_OWNER_MISSING:<type>` | No trusted installed package owns a graph stage type. | Check installation roots, trust, and the exact stage type. Do not add an arbitrary grant. |
| `REGISTRY_ROOT_INVALID` | An installation or trusted root is missing or is not a directory. | Stop preparation. Correct the canonical target before starting a run. |
| `REGISTRY_PACKAGE_DUPLICATE` | Root aliases or repeated package discovery resolve to one canonical directory. | Check real paths and remove the duplicate alias or discovery path. |
| `REGISTRY_PACKAGE_UNTRUSTED` | Neither built-in membership nor an external map admits the package bytes. | Obtain approval for the exact digest and `local:` source key. Do not widen built-in roots to bypass isolation. |
| `REGISTRY_CAPABILITY_PROVIDER_MISSING`, `REGISTRY_CAPABILITY_PROVIDER_AMBIGUOUS` | A required capability has no explicit selection; multiple candidates produce ambiguity. | Select the intended installed declaring adapter by exact ID in `providers`. |
| `REGISTRY_CAPABILITY_PROVIDER_INVALID`, `REGISTRY_CAPABILITY_UNKNOWN` | A policy entry has an unknown capability, missing adapter, or adapter that does not declare it, including unused entries. | Correct the entry against the capability catalogue and installed adapter declaration. |
| `REGISTRY_CAPABILITY_DENIED` | An enabled registration lacks a grant for a declared requirement. | Compare its declaration with the final enabled set and supply only the required bounded grant. |
| `REGISTRY_CAPABILITY_UNREQUESTED` | A grant names an unrequested capability or a disabled registration, including an empty registration entry. | Remove the unrequested grant; remove a registration entry only after checking actual disablement. |
| `REGISTRY_CAPABILITY_CONSTRAINT_INVALID` | Capability constraints have incorrect keys, lists, or canonical values. | Correct the exact shape using the [catalogue](capabilities.md#nova-grant-vocabulary) and [grant rules](../understand/plugin-runtime.md#capabilities-and-grants). |
| `REGISTRY_ACTIVATION_FAILED` for external execution | An enabled external adapter requires the unavailable persistent runtime, or an external wrapper lacks a bounded context. | Stop at the [external execution boundary](#external-trust-and-execution); do not bypass isolation. |
| `ISOLATION_CGROUP_REQUIRED`, `ISOLATION_CGROUP_ROOT_INVALID`, `ISOLATION_CGROUP_NOT_DELEGATED` | External invocation has no root, an invalid cgroup-v2 root, or a subtree without the required delegation. | Stop invocation. Have the host operator establish the [isolation prerequisites](../understand/plugin-runtime.md#isolation-for-external-stages-and-observers). |
| Registration configuration error | A stage, adapter, or observer value violates its own package schema. | Use that registration's configuration reference. The platform envelope cannot supply registration defaults itself. |
| `RECOVERY_RUNTIME_CONFIGURATION_MISMATCH` | Recovery prepared a different recorded configuration subset. | Restore the recorded configuration and package set. Start a new run for intentional changes. |

JSON validation does not prove that paths exist, storage is durable, endpoints
are reachable, credentials resolve, cgroups are writable, or shutdown finishes
within its deadline. Check these dependencies before dispatch.

> **Source evidence — schema and consumer boundary**
>
> **Claim:** The platform object is closed, requires its authority fields, and resolves paths from the canonical file directory.
>
> Runtime preparation enables graph owners, configured observers, and active adapters.
>
> **Implementation:** [loader and path resolution](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/config/platform.ts#L36-L69); [runtime preparation](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/nova/core/execution/engine-runtime.ts#L29-L50)
>
> **Contract or setting:** [root, installation, and trust fields](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/config/platform.schema.json#L1-L53); [provider, grant, adapter, and observer fields](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/config/platform.schema.json#L55-L87)
>
> [Isolation, storage, timeout, and issuer fields](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/skills/common/plugin-runtime/foundation/config/platform.schema.json#L88-L110)
>
> **Test evidence:** [platform paths, TTL bound, and authority rejection](https://github.com/datrab/kubeclaw/blob/94fd165ae8177ec37bb16798bfed63cb8923f413/tests/verification/contracts/check-plugin-system-v2-platform-config.mjs#L12-L63)
>
> **Check status:** On 2026-10-09, Node.js `v24.21.0` ran `node tests/verification/contracts/check-plugin-system-v2-platform-config.mjs` against implementation revision `c8987b18b450bc27571d5037cb6ce3fb26e0cbd0`: exit zero and `ok: true`. This is a local configuration contract check; it does not establish deployment readiness.
>
> **Revision:** `94fd165ae8177ec37bb16798bfed63cb8923f413`
>
> **Limit:** These sources validate local configuration and package authority. They do not prove the availability of an external service.
