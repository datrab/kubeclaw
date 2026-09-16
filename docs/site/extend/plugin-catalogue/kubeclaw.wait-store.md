# kubeclaw.wait-store

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/wait-store/plugin.json; skills/common/plugins/wait-store/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Persist and resolve durable wait records for Nova stages.

## When To Use It

Use it when a stage pauses for an external condition or decision.

## When Not To Use It

Do not use it as a general state database or busy-wait mechanism.

## Most Important Limit

Wait identity and resolution remain bound to the owning pipeline context.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/wait-store/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.wait-store@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/common/plugins/wait-store/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/wait-store/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| capability adapter | `waits` | `waits` | `src/adapter.ts` | `activate` |

## capability adapter: waits

Public identifier: `waits`.

Required capabilities: None.

Provided capabilities: `signal.wait`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/wait-store/schemas/config.schema.json)

Configuration fields:

- `root` (string; required)
- `maxEntryBytes` (integer; optional; default `1048576`)
- `maximumRecords` (integer; optional; default `100000`)
- `maximumStoreBytes` (integer; optional; default `268435456`)

Input schema: None.

Result schema: None.

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `waits` |
| `module` | `src/adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["signal.wait"]` |
| `requiredCapabilities` | Empty list. |
| `configSchema` | `schemas/config.schema.json` |

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `content-written`.
Local command result on 2026-09-16: `unavailable`.

The command reached a persistent-path check, but BusyBox flock has no required --timeout option.

Run the package command:

```bash
npm test --prefix skills/common/plugins/wait-store
```

Package tests found: 2.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/common/plugins/wait-store/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/wait-store/plugin.json)
- Authored package guide: [skills/common/plugins/wait-store/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/wait-store/README.md)
- Module for `waits`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/wait-store/src/adapter.ts)
- Test: [skills/common/plugins/wait-store/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/wait-store/tests/live-function.test.ts)
- Test: [skills/common/plugins/wait-store/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/wait-store/tests/package-boundary.test.mjs)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
