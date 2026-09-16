# kubeclaw.redis-transport

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/redis-transport/plugin.json; skills/common/plugins/redis-transport/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Publish transport and telemetry records through configured Redis channels.

## When To Use It

Use it when Nova extensions need the installed Redis transport boundary.

## When Not To Use It

Do not use it as a general Redis client or canonical state store.

## Most Important Limit

Channel, payload, timeout, and credential behavior follow adapter configuration.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/redis-transport/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.redis-transport@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/common/plugins/redis-transport/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/redis-transport/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| capability adapter | `publisher` | `publisher` | `src/adapter.ts` | `activatePublisher` |
| capability adapter | `telemetry` | `telemetry` | `src/adapter.ts` | `activateTelemetry` |

## capability adapter: publisher

Public identifier: `publisher`.

Required capabilities: `secrets.read`

Provided capabilities: `transport.publish`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/redis-transport/schemas/config.schema.json)

Configuration fields:

- `url` (string; required)
- `passwordSecret` (string; required)
- `streamPrefix` (string; required)
- `maxLen` (integer; required)
- `dedupTtlMs` (integer; required)
- `timeoutMs` (integer; required)

Input schema: None.

Result schema: None.

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `publisher` |
| `module` | `src/adapter.ts` |
| `export` | `activatePublisher` |
| `providesCapabilities` | `["transport.publish"]` |
| `requiredCapabilities` | `["secrets.read"]` |
| `configSchema` | `schemas/config.schema.json` |

## capability adapter: telemetry

Public identifier: `telemetry`.

Required capabilities: `secrets.read`

Provided capabilities: `telemetry.emit`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/redis-transport/schemas/config.schema.json)

Configuration fields:

- `url` (string; required)
- `passwordSecret` (string; required)
- `streamPrefix` (string; required)
- `maxLen` (integer; required)
- `dedupTtlMs` (integer; required)
- `timeoutMs` (integer; required)

Input schema: None.

Result schema: None.

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `telemetry` |
| `module` | `src/adapter.ts` |
| `export` | `activateTelemetry` |
| `providesCapabilities` | `["telemetry.emit"]` |
| `requiredCapabilities` | `["secrets.read"]` |
| `configSchema` | `schemas/config.schema.json` |

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `locally-verified`.
Local command result on 2026-09-16: `passed`.

The package-local command completed with exit code 0.

Run the package command:

```bash
npm test --prefix skills/common/plugins/redis-transport
```

Package tests found: 2.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/common/plugins/redis-transport/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/redis-transport/plugin.json)
- Authored package guide: [skills/common/plugins/redis-transport/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/redis-transport/README.md)
- Module for `publisher`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/redis-transport/src/adapter.ts)
- Module for `telemetry`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/redis-transport/src/adapter.ts)
- Test: [skills/common/plugins/redis-transport/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/redis-transport/tests/live-function.test.ts)
- Test: [skills/common/plugins/redis-transport/tests/package-boundary.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/redis-transport/tests/package-boundary.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
