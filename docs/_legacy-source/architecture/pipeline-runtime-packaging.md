# Pipeline Runtime Packaging

Status: implemented and authoritative

Phase 5.6-A ownership inventory:
`packaging/runtime/package-ownership.json`.

## Problem

`skills/common` contains several kinds of shared source.

It contains:

- Pipeline orchestration code.
- Neutral worker code.
- Buster test code.
- Contracts and SDK code.
- Shared plugins.

The former bundle script copied all of `skills/common` into Nova and Buster.
Phase 5.6 removed that behavior. Each role now receives an exact package set.

## Required Model

Source ownership and runtime packaging are different concerns.

`skills/common` can remain the source location for shared code. It must not be
the package selection rule.

The target package model is:

```text
contracts and SDK
├── Nova orchestrator core
└── neutral worker core
    ├── Buster engine
    ├── Prism engine
    └── DeepSec engine
```

Shared plugins remain separate packages. A role receives a shared plugin only
when its bundle manifest declares that plugin.

## Role Contents

Nova receives:

- Contracts and SDK.
- Nova orchestrator core.
- Nova-owned plugins.
- Declared shared plugins.

Buster receives:

- Contracts and SDK.
- Neutral worker core.
- Buster test engine.
- Buster-owned providers.
- Declared shared plugins.

Prism and DeepSec use the same rule. Each receives the neutral worker core and
one specialist engine.

Nova does not receive worker execution authority. A worker does not receive
Nova pipeline authority. A neutral worker does not receive a specialist engine
unless its role declares one.

## One Source, Many Installations

Shared code has one source and one version.

Each image contains its own immutable installed package bytes. This is required
because Pods have separate filesystems. It does not create separate source
ownership or separate implementations.

The package digest proves that all roles use the same shared version.

## Bundle Assembly

Each role has a bundle manifest. The manifest lists root packages.

The bundle builder resolves their dependency set. It copies only that set.

The build fails when:

- A required package is missing.
- A package is not declared.
- A role imports another role's package.
- Two packages claim the same runtime path.
- A package digest does not match.

The final bundle manifest records each package ID, version, and content digest.

## Current Implementation

Role manifests are in `packaging/runtime/roles`.

The source packages are:

- `@kubeclaw/plugin-foundation`
- `@kubeclaw/plugin-sdk`
- `@kubeclaw/nova-core`
- `@kubeclaw/worker-core`
- `@kubeclaw/buster-engine`

`scripts/build-runtime-role-bundle.mjs` resolves one role manifest. It copies
the selected packages, plugins, assets, and third-party runtime dependencies.
It writes a package-set manifest with source digests.

`scripts/package-agent-skill-bundle.sh` creates the reproducible release
archive. It does not copy `skills/common` as a directory overlay.

Architecture proof rejects Nova access to worker and Buster authority. It
also rejects worker access to Nova and Buster authority.
