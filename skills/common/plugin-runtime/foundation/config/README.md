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
