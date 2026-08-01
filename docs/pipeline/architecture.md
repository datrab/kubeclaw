# Pipeline Architecture

`skills/nova/pipeline.ts` delegates to the generic v2 CLI and exports the v2
core API. A run follows this sequence:

1. Load operator-owned platform configuration.
2. Discover and verify inert `pipeline-plugin-v2` manifests.
3. Build one frozen package, registration, provider, and grant snapshot.
4. Validate and freeze the generic stage graph.
5. Activate adapters transactionally.
6. Invoke stages with revocable, registration-scoped contexts.
7. Commit results through the lifecycle reducer.
8. Evaluate predeclared conditional stages from immutable ancestor decision
   facts; false conditions commit `stage.skipped` without invoking the plugin.
9. Journal effects, waits, state, observer delivery, and recovery evidence.
10. Revoke contexts and shut adapters down in reverse dependency order.

Stages return typed results; they do not mutate lifecycle state. Observers
consume immutable events and cannot schedule work. Adapters are the only
providers of privileged capabilities.

Durability is implemented by the journals in
`skills/common/plugin-runtime/core/effects/`,
`skills/common/plugin-runtime/core/state/`, and
`skills/common/plugin-runtime/core/lifecycle/`.
