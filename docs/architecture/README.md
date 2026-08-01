# Implemented Architecture

KubeClaw has one generic pipeline kernel and independently installable plugin
packages. The kernel discovers inert manifests, freezes a registry snapshot,
validates a generic graph, grants registration-scoped capabilities, commits
lifecycle state, journals effects and waits, and delivers immutable events.

Concrete behavior lives under:

- `skills/nova/plugins/`
- `skills/buster/plugins/`
- `skills/common/plugins/`

Generic authority lives under `skills/common/plugin-runtime/core/`. The stable
entrypoint is `skills/nova/pipeline.ts`.

The core starts with zero plugins and imports no concrete package. Operator
configuration selects trusted roots, providers, grants, and registration
configuration. Project input cannot install packages or expand trust.

See [security-model.md](security-model.md) and
[plugin-system-current-inventory.md](plugin-system-current-inventory.md).
