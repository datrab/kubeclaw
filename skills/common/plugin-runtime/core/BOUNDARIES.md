# Core boundaries

Core owns generic configuration, execution, lifecycle, registry, state, artifacts, effects, telemetry, and package loading. It may import the public plugin SDK but never a concrete plugin.

The subdirectories are ownership boundaries:

- `config/` — platform and pipeline configuration assembly
- `execution/` — frozen-graph scheduling and invocation coordination
- `lifecycle/` — run, stage, and attempt transition authority
- `registry/` — registration ownership and startup freeze
- `state/` — journals, replay, projections, and plugin namespaces
- `artifacts/` — logical artifact authority
- `effects/` — durable effect identities and receipts
- `telemetry/` — canonical immutable event spine
- `packages/` — inert discovery, provenance, integrity, and activation

Concrete behavior does not belong in any of these directories.
