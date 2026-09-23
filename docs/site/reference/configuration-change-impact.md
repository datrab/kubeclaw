# Configuration Change Impact

Status: current operational reference
Audience: operator, maintainer
Owner: platform operations
Evidence: skills/nova/core/execution/engine-snapshots.ts; skills/nova/project/recovery.ts; skills/common/plugin-runtime/foundation/config/published-pair.ts; skills/prism/server/control-config.ts; skills/prism/config/native-worker.ts
Applies to: current configuration families
Last verified: 2026-09-21 at source revision `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`

## Impact classes

| Class | Meaning |
| --- | --- |
| Hot | The documented consumer watches or reads the value for each operation. Do not assume this class without an explicit watcher/read path. |
| Restart | A process captures the value at startup; roll only the affected workload after validation. |
| New run | Existing Nova run snapshots pin the graph, package set, or runtime authority. Continue with original inputs and use changed configuration only for a new identity. |
| Republish | The `.swarm` authoring pair must be validated and atomically published together. |
| Host prepare + restart | Root-owned capacity/identity or cgroup state must be reconciled before the worker restarts and reports ready. |
| Data procedure | A persistent format, location, identity, or credential transition needs its component's explicit backup/restore or rotation procedure. Editing config alone is insufficient. |

## Change matrix

| Change | Required class | Why and checks |
| --- | --- | --- |
| `pipeline-platform.v2` package roots, trust, providers, grants, adapters, observers, isolation | New run | Recovery compares the recorded effective runtime and pinned packages. Validate registrations and grants; retain the prior file for active runs. |
| Platform `storageRoot` | New run + data procedure if state must move | The new path selects another store; the loader does not copy run state. Verify durability, permissions, capacity, backup, and restore before cutover. |
| Platform timeouts | New run; restart current CLI process | Runtime objects capture them. Persisted events are not rewritten. |
| `nova-project.v2` root, module, coverage, agent, lint, source, final, or demo fields | New run | Compiler output or source binding can change the graph digest. Compile first and compare the recorded digest. |
| `pipeline-definition.v2` field | New run | Recovery verifies pipeline ID and normalized graph digest. |
| `.swarm/progress.json` or `.swarm/pipeline.json` | Republish; then new resolved plan/run where consumed | The two files are one generation. Re-run scaffold checks and plan resolution. Never hand-update one current copy. |
| Provider schema/config, suite selection, coverage, matrix, limits | Republish + new resolved plan/run | Plan digest, provider config digest, links, coverage, or node identities can change. |
| Plugin package content/version | New run by default | Registry snapshot pins package version/content digest. An active run accepts only its recorded package or an explicitly governed supported package transition. |
| KubeClaw or Prism image digest | Restart; new run for any pipeline component used by that run | Workload executable bytes change. Render manifests, check digest pinning, and preserve a drain path. |
| Helm resources, probes, replicas, service account, volumes | Restart/rollout | Kubernetes pod template changes. Check disruption budget, storage attachment, native worker replica constraint, and readiness. |
| ConfigMap-backed startup configuration | Restart | Current services do not promise a live reload. Use a template checksum/generation to prove rollout. |
| Secret-backed environment value | Restart + credential rotation procedure | Existing processes retain their environment. Coordinate old/new acceptance to avoid loss of access; do not print the credential. |
| File-mounted signing key/CA/token | Restart unless its loader explicitly rereads for every action | Prism product authority captures configuration and key at composition. Coordinate controller trust before removing the old credential. |
| Prism service URL, timeout, ingress limit, trust ID | Restart | Loaders capture one startup snapshot. Validate URL/number form and peer policy before rollout. |
| Prism native pool limits, paths, node identity, policy digest | Host prepare + restart | Worker verifies a root-owned policy and actual cgroup state at readiness. Drain attempts, prepare the host, then restart the pinned worker. |
| Prism database or artifact storage location/size | Data procedure + restart | Persistent stores are independent. Prove backup, restore, ownership, and application connectivity. A values edit does not move data. |
| GitOps values source | Restart/rollout when the rendered workload changes | The controller reconciles declared Git state. Manual live edits are temporary and should not be the recorded change. |

## Safe change sequence

1. Classify the changed field by its actual consumer and use
   [Configuration precedence](configuration-precedence.md).
2. Preserve the old source, digest, rendered manifest, and required secret
   references. Back up persistent state before a data procedure.
3. Run schema and semantic checks. For project changes, compile to a new path.
   For Helm changes, render before applying.
4. Confirm stop conditions: active effects, waits, worker attempts, unavailable
   capacity, incompatible snapshots, or a missing old credential.
5. Apply through the canonical source. Publish coupled files together.
6. Roll or start the required new run; do not mutate an existing run to make it
   accept a new digest.
7. Verify readiness, effective non-secret values, identities, and one bounded
   operation. Retain evidence that identifies the source revision.

“Restart” does not mean delete retained storage. “New run” does not mean reuse
an old run ID. “Republish” does not mean copy two files sequentially.

## Rollback boundary

Configuration rollback is safe only while the older executable, package,
schema, credential, and state format remain supported. Before rollback, check
whether new work wrote data that the old release cannot read. Nova recovery
uses the original graph and runtime authority; restoring old configuration is
necessary but not sufficient if packages or durable records changed.

For uncertain external effects, inspect effect receipts and run evidence before
retrying. A timeout does not prove that an external operation did not happen.

> **Source evidence — pinned recovery and startup capture**
>
> **Claim:** Nova recovery rejects graph/runtime/package drift, coupled project files commit as one generation, and Prism Control captures one environment snapshot at composition.
>
> **Implementation:** [graph and runtime recovery checks](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/execution/engine-snapshots.ts#L28-L72); [coupled publication commit](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/published-pair.ts#L78-L113); [Control startup snapshot](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/prism/server/control-config.ts#L67-L72)
>
> **Contract or setting:** [run snapshot versions and integrity](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/execution/engine-snapshots.ts#L75-L109)
>
> **Test evidence:** [project graph drift rejection](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/reliability/project-recovery-version.test.mjs#L18-L31); [runtime isolation drift rejection](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/reliability/isolation-session.test.mjs#L101-L114)
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`
>
> **Limit:** Local checks cannot choose a maintenance window or prove that an external dependency honors a credential overlap period.
