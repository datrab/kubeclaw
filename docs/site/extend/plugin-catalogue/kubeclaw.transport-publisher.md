# kubeclaw.transport-publisher

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/transport-publisher/plugin.json; skills/common/plugins/transport-publisher/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Publish bounded messages through the selected transport capability.

## When To Use It

Use it when a Nova extension needs transport-neutral message publication.

## When Not To Use It

Do not use it when a package requires Redis-specific telemetry behavior.

## Most Important Limit

The selected provider and grant determine the real transport authority.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/transport-publisher/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.transport-publisher@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/common/plugins/transport-publisher/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/transport-publisher/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| capability adapter | `publisher` | `publisher` | `src/adapter.ts` | `activate` |

## capability adapter: publisher

Public identifier: `publisher`.

Required capabilities: `network.http`, `secrets.read`

Provided capabilities: `transport.publish`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/transport-publisher/schemas/config.schema.json)

Configuration fields:

- `deliveryRoot` (string; required)
- `maximumDeliveryRecords` (integer; optional; default `100000`)
- `maximumDeliveryBytes` (integer; optional; default `268435456`)
- `targets` (object; required)

Input schema: None.

Result schema: None.

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `publisher` |
| `module` | `src/adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["transport.publish"]` |
| `requiredCapabilities` | `["network.http","secrets.read"]` |
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
npm test --prefix skills/common/plugins/transport-publisher
```

Package tests found: 3.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/common/plugins/transport-publisher/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/transport-publisher/plugin.json)
- Authored package guide: [skills/common/plugins/transport-publisher/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/transport-publisher/README.md)
- Module for `publisher`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/transport-publisher/src/adapter.ts)
- Test: [skills/common/plugins/transport-publisher/tests/config-validation.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/transport-publisher/tests/config-validation.test.mjs)
- Test: [skills/common/plugins/transport-publisher/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/transport-publisher/tests/live-function.test.ts)
- Test: [skills/common/plugins/transport-publisher/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/transport-publisher/tests/package-boundary.test.mjs)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
