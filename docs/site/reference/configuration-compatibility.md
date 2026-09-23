# Configuration Compatibility

Status: current support reference
Audience: operator, maintainer, plugin author
Owner: configuration-owning components
Evidence: skills/common/plugin-runtime/foundation/config/platform.schema.json; skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json; skills/nova/core/execution/engine-snapshots.ts; contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v2.schema.json; contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v3.schema.json
Applies to: current readers and retained durable versions
Last verified: 2026-09-21 at source revision `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`

## Support meanings

| Term | Meaning |
| --- | --- |
| Author | A current tool creates this version for new work. |
| Read | A current tool validates and consumes this version. |
| Recover only | Current code reads the version to continue retained state but does not create it for a new run. |
| Reject | The current boundary fails rather than guessing or translating it. |

Compatibility is per artifact. A process that can read an older snapshot does
not imply that its current project input, plugin packages, or worker result can
be mixed with that snapshot.

## Current map

| Artifact/contract | New authoring | Current read | Conditions |
| --- | --- | --- | --- |
| `pipeline-platform.v2` | Author | Read | Exact version only; closed schema. There is no version fallback or field translation. |
| `nova-project.v2` | Author | Read | Exact version only. Current CLI requires explicit architecture and Blueprint declarations. |
| `pipeline-definition.v2` | Author | Read | Exact version only; plugin-owned `config`/`input` must match the installed registration schemas. |
| `.swarm/pipeline.json` | Author | Read | Current structural declaration has no root schema-version field. Compatibility is determined by loader fields, suite/provider contract IDs, registration schemas, resolver policy, and coupled generation. |
| `.swarm/progress.json` version 1 | Author through scaffold | Read by project setup and explicit import tooling | It is project authoring state, not a resumable Core snapshot. |
| `published-json-pair.v1` | Author | Read | Exact manifest/member shape, generation digest, and byte equality. |
| `run-snapshot.v4` | Author | Read/recover | Current format; includes runtime-dispatch and cache semantic profiles. |
| `run-snapshot.v3` | No new authoring | Recover only | Requires its runtime-dispatch profile; has no cache profile. |
| `run-snapshot.v1` / `v2` | No new authoring | Recover only | Must not contain newer semantic profile fields. Original runtime/package compatibility remains required. |
| `execution-graph-snapshot.v3` | Author | Read/recover | Current portable JSON digest ordering. |
| `execution-graph-snapshot.v2` | No new authoring | Recover only | Recovery rebuilds using the stored version before digest comparison. |
| `worker-attempt-envelope/result/profile.v3` | Author for native Prism | Read | Uses native-attempt-tree resources and Linux tasks. Producer, worker, and result versions must agree. |
| Worker v2 envelope/result/profile | Author for current Prism agent launcher | Read | Uses resource capability/budget v1 and `maximumProcesses`; unavailable measurement is explicit. |
| Worker v1 retained records | No new authoring | Read where the v1 contract path is selected | No resource-accounting fields may be inferred. Do not turn absence into zero. |
| `worker-protocol.v1` | Author | Read | Exact protocol value in current worker versions. |
| Prism native pool policy schema `1` | Host preparation | Read | Exact role, node, digest, paths, and positive aggregate limits; actual cgroup must match. |
| Compact swarm profile `standard` | Shipped test/runtime authoring | Read only by callers of the expander | Exact feature/tuning assertions; unknown profiles/paths reject. Not a pipeline-platform version. |

## What pins a Nova run

Run recovery checks more than a schema version:

- pipeline ID and normalized graph digest,
- registry snapshot and its dependency-identity format,
- exact package set, versions, and content digests,
- effective providers, grants, adapters, active adapters, observers, and
  isolation configuration,
- runtime-dispatch and cache semantic profiles where the snapshot version
  contains them,
- project compiler source/report/semantic selections reconstructed from the
  stored graph.

A current parser can therefore read a stored snapshot but still reject the
current runtime as incompatible. This is deliberate: reading bytes is not
authority to reinterpret a running workflow.

## Contract-ID compatibility

Stage types, provider `uses`, suite `uses`, worker engine contracts, and
capability providers are versioned identities. Selection is exact. Installing
a newer package does not redirect an older contract ID unless that package
still registers and implements it. Configuration schema defaults are part of
the selected registration version and do not backfill stored effective values.

For `.swarm/pipeline.json`, retain the suite template digest and resolved
provider package/content digests in the resolved plan. The same authored JSON
can resolve differently if the registry or operator resolver policy changes;
the plan digest makes that difference visible.

## Unsupported combinations

- A v3 native profile with v2 `maximumProcesses` budgets.
- A v2 agent profile presented to a worker that advertises only its v3 digest.
- A changed graph supplied to an existing run ID.
- A changed platform authority or unapproved package set during recovery.
- One member from each of two `.swarm` publication generations.
- A compact `swarm.config.json` passed as `--platform`.
- A project test declaration passed to the Core `--pipeline` flag.
- A chart value assumed to be effective without schema validation, rendering,
  rollout, and process readiness.

## Change procedure

Before changing a versioned configuration or package:

1. Inventory active runs and retained worker attempts that use the old version.
2. Keep the old executable and configuration available until those records are
   terminal or proved recoverable by the intended release.
3. Validate the new authoring input and compile/resolve it without effects.
4. Start new work under a new run/plan/profile digest as applicable.
5. Prove recovery separately from new-run success.

Do not edit retained snapshots, plan digests, profile digests, or publication
manifests to declare compatibility.

> **Source evidence — retained version handling**
>
> **Claim:** Current Nova authors run snapshot v4 but validates v1–v4 under version-specific fields, and graph recovery preserves the stored v2/v3 digest algorithm before comparison.
>
> **Implementation:** [snapshot versions and checks](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/execution/engine-snapshots.ts#L75-L109); [stored graph version comparison](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/execution/engine-snapshots.ts#L68-L73)
>
> **Contract or setting:** [current graph contract](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L515-L529); [current native worker profile contract](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v3.schema.json#L113-L160)
>
> **Test evidence:** [historical worker fixture test](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/prism/tests/worker-service.test.mts#L120-L151)
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`
>
> **Limit:** Source compatibility does not prove that an older deployment image, external provider, or off-host backup remains available.
