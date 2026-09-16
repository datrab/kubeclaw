# kubeclaw.network-http

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/network-http/plugin.json; skills/common/plugins/network-http/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Provide grant-controlled HTTP effects to pipeline extensions.

## When To Use It

Use it when a stage or observer needs an approved outbound HTTP call.

## When Not To Use It

Do not use it as a Buster HTTP test provider.

## Most Important Limit

Destinations, methods, payloads, and response bounds follow operator grants.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/network-http/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.network-http@1.0.0`.
- Runtime-role manifest inclusion: `buster`, `nova`, `prism`
- Manifest: [skills/common/plugins/network-http/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/network-http/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| capability adapter | `http` | `http` | `src/adapter.ts` | `activate` |

## capability adapter: http

Public identifier: `http`.

Required capabilities: None.

Provided capabilities: `network.http`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/network-http/schemas/config.schema.json)

Configuration fields:

- `allowedOrigins` (array; required)
- `allowedMethods` (array; optional; default `["GET"]`)
- `allowedHeaders` (array; optional; default `["accept","content-type","idempotency-key"]`)
- `maxRequestBytes` (integer; optional; default `1048576`)
- `maxResponseBytes` (integer; optional; default `1048576`)
- `timeoutMs` (integer; optional; default `30000`)

Input schema: None.

Result schema: None.

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `http` |
| `module` | `src/adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["network.http"]` |
| `requiredCapabilities` | Empty list. |
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
npm test --prefix skills/common/plugins/network-http
```

Package tests found: 3.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/common/plugins/network-http/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/network-http/plugin.json)
- Authored package guide: [skills/common/plugins/network-http/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/network-http/README.md)
- Module for `http`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/network-http/src/adapter.ts)
- Test: [skills/common/plugins/network-http/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/network-http/tests/live-function.test.ts)
- Test: [skills/common/plugins/network-http/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/network-http/tests/package-boundary.test.mjs)
- Test: [skills/common/plugins/network-http/tests/streaming.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/network-http/tests/streaming.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
