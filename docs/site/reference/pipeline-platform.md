# Pipeline Platform Configuration

Status: current configuration reference
Audience: platform operator, pipeline operator, plugin author
Owner: plugin runtime and Nova Core
Evidence: skills/common/plugin-runtime/foundation/config/platform.schema.json; skills/common/plugin-runtime/foundation/config/platform.ts; skills/nova/core/execution/engine-runtime.ts
Applies to: `pipeline-platform.v2`
Last verified: 2026-09-21 at source revision `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`

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
| `installationRoots` | Array of at least one unique, non-empty path string | No default; `[]` is invalid | Package discovery searches every resolved root. |
| `trustedBuiltinRoots` | Array of at least one unique, non-empty path string | No default; `[]` is invalid | Discovery treats packages below these roots as shipped built-ins. This is trust, not only search order. |
| `externalTrust` | Closed object; see below | No default | Discovery verifies external package provenance. |
| `providers` | Object from capability name to non-empty registration ID | `{}` is valid only if enabled registrations need no selected provider | Capability resolution selects one provider for each keyed capability. |
| `grants` | Three-level JSON object: registration ID → capability → resource policy object | `{}` is structurally valid | Capability resolution rejects an enabled registration that lacks required authority. Resource policy fields are capability-specific, so this envelope deliberately remains open. |
| `adapters` | Object from adapter registration ID to its JSON configuration object | `{}` is valid | Registration configuration validation checks each value against the installed adapter schema. |
| `activeAdapters` | Unique array of non-empty registration IDs | `[]` is valid | Only these adapters activate. Supplying configuration in `adapters` does not activate one. |
| `observers` | Object from observer registration ID to its JSON configuration object | `{}` is valid | Every keyed observer is enabled, schema-checked, and used for event delivery. |
| `isolation` | Optional closed object `{cgroupRoot}`; `cgroupRoot` is non-empty | Omitted means no platform isolation object is passed to activation | Plugin activation receives the resolved cgroup root. Availability and permissions are checked by the relevant runtime, not by JSON Schema. |
| `storageRoot` | Non-empty path string | No default | Nova stores run snapshots, journals, effect locks, and observer records below this resolved root. |
| `shutdownTimeoutMs` | Integer ≥ 1 | No default | Adapter shutdown receives this deadline in milliseconds. |
| `effectLockTtlMs` | Optional integer from 60,000 through 86,400,000 | If absent, the effect coordinator uses 300,000 ms | Controls expiry of resource-effect locks. A larger value reduces premature reuse but delays recovery from an abandoned lock. |
| `orchestratorIssuerId` | Non-empty string | No default | Identifies the orchestrator that may issue its governed decisions. |
| `administrativeDecisionIssuers` | Unique array of closed `{type,id}` objects; `type` is `operator` or `administrator`; `id` is non-empty | `[]` is structurally valid | Core checks administrative decisions against these exact identities. Do not use a shared display name. |

`externalTrust` has exactly these required fields:

| Field | Type and constraints | Empty meaning |
| --- | --- | --- |
| `allowedSourceDigests` | Object from an external source ID to a non-empty, unique array of lowercase `sha256:` digests | `{}` permits no digest by this mechanism. Each array must contain at least one digest. |
| `verifiedAttestations` | Object from one lowercase `sha256:` digest to another lowercase `sha256:` digest | `{}` supplies no verified attestation mapping. |

The schema constrains the two digest maps but does not establish who approved a
digest. The operator must obtain these values through the deployment's trust
process.

## Path resolution

The loader obtains the real path of the platform file. It resolves every
relative value in `installationRoots`, `trustedBuiltinRoots`, `storageRoot`,
and `isolation.cgroupRoot` from that file's directory. It does not use the
shell working directory. Absolute paths remain absolute. The loader resolves
symbolic links in the platform filename before selecting the base directory.

This rule makes a checked configuration portable as one directory, but it also
means that moving the file can change every relative target. Record the
canonical file path and its digest with the run.

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
4. Discovery reads packages only from `installationRoots` and applies built-in
   or external trust.
5. The registry maps stage types, adapters, observers, providers, and package
   provenance.
6. Core enables the owners of all graph stages, every key in `observers`, and
   every ID in `activeAdapters`.
7. Capability resolution applies `providers` and `grants` to that enabled set.
8. Each stage, adapter, and observer configuration is checked against its
   registration schema before activation.

This ordering is intentional. Schema-valid JSON is not enough: the installed
package set determines whether registration IDs, stage owners, configuration
fields, providers, and grants are valid.

## Precedence and change impact

There is no merge between two platform files. The path passed to `--platform`
is the authority. Within that file, registration-specific configuration is
selected by exact key. Project configuration does not override it.

New runs use the loaded values. Recovery compares the recorded effective
providers, grants, adapters, active adapters, observers, and isolation object
with the newly prepared runtime. A difference causes
`RECOVERY_RUNTIME_CONFIGURATION_MISMATCH`. Package identities and the graph are
also pinned. Use the original platform inputs to continue a run; use a new run
identity for a changed authority set.

Changing `storageRoot` points the CLI at a different run store. It does not move
existing state. Changing package roots, trust maps, providers, grants, adapter
configuration, observer configuration, or isolation can change executable
authority and therefore requires a new run unless an explicit supported
administrative package transition applies. Changing timeouts affects newly
created runtime objects; it does not rewrite persisted events.

See [Configuration precedence](configuration-precedence.md) and
[Configuration change impact](configuration-change-impact.md) for the
cross-family rules.

## Sensitive values

Do not place raw credentials in this document. The platform snapshot is stored
with run state, and adapter/observer configuration is part of the recovery
comparison. Use the secret-reference field defined by the selected
registration and grant only that registration access to the referenced secret.
The platform schema cannot detect a credential hidden in a free-form resource
policy.

## Errors and recovery

| Signal | Meaning | Safe action |
| --- | --- | --- |
| `PLATFORM_CONFIG_INVALID:<path>:<details>` | JSON did not satisfy the closed schema. | Read the field path in the validation details; correct the operator-owned file before starting a run. |
| `PIPELINE_STAGE_OWNER_MISSING:<type>` | No trusted installed package owns a graph stage type. | Check installation roots, trust, and the exact stage type. Do not add an arbitrary grant. |
| Capability/provider/grant validation error | An enabled registration cannot receive its declared capabilities under this policy. | Compare the registration manifest with `providers` and `grants`; keep the smallest resource policy that permits the intended operation. |
| Registration configuration error | A stage, adapter, or observer value violates its own package schema. | Use that registration's configuration reference. The platform envelope cannot supply registration defaults itself. |
| `RECOVERY_RUNTIME_CONFIGURATION_MISMATCH` | Recovery prepared a different effective authority set. | Restore the recorded configuration and package set. Start a new run for intentional changes. |

JSON validation does not prove that paths exist, storage is durable, endpoints
are reachable, credentials resolve, cgroups are writable, or shutdown finishes
within its deadline. Check these dependencies before dispatch.

> **Source evidence — schema and consumer boundary**
>
> **Claim:** The platform object is closed, requires its authority fields, and resolves paths from the canonical file directory.
>
> Runtime preparation enables graph owners, configured observers, and active adapters.
>
> **Implementation:** [loader and path resolution](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/platform.ts#L36-L69); [runtime preparation](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/execution/engine-runtime.ts#L29-L50)
>
> **Contract or setting:** [root, installation, and trust fields](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/platform.schema.json#L1-L53); [provider, grant, adapter, and observer fields](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/platform.schema.json#L55-L87)
>
> [Isolation, storage, timeout, and issuer fields](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/platform.schema.json#L88-L110)
>
> **Test evidence:** [platform loading, default, bounds, and authority rejection](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/contracts/check-plugin-system-v2-platform-config.mjs#L12-L63)
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`
>
> **Limit:** These sources validate local configuration and package authority. They do not prove the availability of an external service.
