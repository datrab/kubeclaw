# Configuration ownership

Generic platform, graph, policy, grant, and adapter-selection configuration only.

External plugin isolation requires a host-provisioned cgroup-v2 subtree:

```json
{"isolation":{"cgroupRoot":"/sys/fs/cgroup/kubeclaw-external"}}
```

The loader resolves relative paths against the platform configuration file.
The subtree must be a real cgroup-v2 directory, have no resident host processes,
have the memory controller enabled for children, and permit creation/removal of
per-invocation groups. Kernel support for memory.max, memory.swap.max,
memory.oom.group, memory.events, memory.peak and cgroup.kill is required. The host
provisions delegation; the runtime does not modify controller delegation or move
host processes. The cgroup mount root itself is rejected.

Each external invocation receives memory.max rounded down from its byte lease
to the actual host page size and verified by exact readback, with swap disabled.
The existing native launcher queries sysconf(_SC_PAGESIZE); a missing/invalid
query fails closed. The effective limit is at least 16 MiB and never exceeds
the lease. V8 and address-space limits are supplementary. The native
supervisor stays outside that child group so it can kill/reap an OOM workload.
External invocation fails closed without valid delegation; trusted builtin
execution remains in process. Isolation configuration is part of the persisted
runtime fingerprint and cannot silently change on recovery.

Linux x86-64 seccomp support and readable proc task-children files remain native
launcher prerequisites. Build the original launcher with
`npm run plugin-system:sandbox:build`. Provisioning and kernel enforcement must
be checked separately on the deployment host; local protocol tests do not prove
those kernel capabilities.

The existing isolation, external-engine and phase11 contract scripts accept the
delegated root as their first CLI argument. The additional isolation-kernel gate
also requires target UID/GID arguments and credential-drop authority so its
parent-death check covers that native branch. Missing prerequisites remain blocked
checks, not passing isolation assertions.

Prism worker and shared native transport operator settings are resolved by `swarm.ts` from the existing
canonical component bundle. Control and Worker capture one strict startup snapshot; Control response bytes and Worker journal
result bytes share `native.maximumResultBytes`, while `native.dispatchTimeoutMs`
bounds the complete Control HTTP exchange. Required `native.resourcePolicy`
values supply cumulative CPU milliseconds, memory bytes and Linux tasks to the
Control producer and Worker admission from their frozen startup snapshots.
Resource safe-integer bounds differ from timer bounds; pool memory/task fit is
checked at supervisor composition, without comparing CPU time to CPU rate. The strict schema rejects unknown keys, missing/invalid
values and retired environment overrides. `native.supervisor` supplies nine
required numeric UID/GID, ownership/output/journal and poll/drain/close settings.
The loader freezes this object and requires worker shutdown strictly above close
plus drain; Helm uses those same authored values and checks Pod grace separately.
Generated host identity, pool policy and runtime paths retain their authorities.
Other configuration surfaces are not
yet fully migrated. Studio also uses this shared loader for its required
`prism-studio.config.json → settings` port, Control origin and proxy deadline. Its role loader
rejects `PORT`, `PRISM_CONTROL_URL` and `PRISM_CONTROL_TIMEOUT_MS`; installation
assets and ingress credentials retain their separate inputs. The native Buster
preparation path reads `buster-engine.config.json → settings.preparation` through the same schema,
while its node/pool identity and remaining runtime/platform configuration are
separate checked inputs. This does not establish completed Buster integration.
See [operator configuration](../../../../../docs/operations/operator-configuration.md)
for the exact migrated keys, deployment delivery and remaining scope.

## Explicit effect-lock lifetime

Every `pipeline-platform.v2` document must author `effectLockTtlMs` as an integer
from 60000 to 86400000 milliseconds. Neither the Nova runtime nor the direct
`EffectCoordinator` constructor supplies a TTL default. Add `"effectLockTtlMs":
300000` to preserve the former implicit five-minute policy. Missing values fail
platform validation. This lifetime is separate from `shutdownTimeoutMs`. The
Buster entrypoint authors its generated platform value explicitly; this does
not complete the broader component-file configuration migration.

## Worker listener configuration

`PrismWorkerSettings.port` is a required integer in the range 1–65535, authored
by `prism-worker.config.json` `settings.ingress.port`. The shared loader validates
it; Worker captures it once and rejects its retired role-specific `PORT` input.
See the [operator contract](../../../../../docs/operations/operator-configuration.md#worker-listener-component-migration)
for deployment and migration. This change is staged, not runtime-accepted.
