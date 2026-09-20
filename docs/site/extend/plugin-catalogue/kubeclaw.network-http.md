# kubeclaw.network-http

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/network-http/plugin.json; skills/common/plugins/network-http/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision 32b02816cc19cc8865a45b221b8b6ca28e99e8fb

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

- [Package guide](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/network-http/README.md)
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
- Manifest: [skills/common/plugins/network-http/plugin.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/network-http/plugin.json)

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
Global registration ID: `kubeclaw.network-http:http`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: None.

Provided capabilities: `network.http`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/network-http/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `allowedOrigins` (array; required; minItems `1`)
- `allowedMethods` (array; optional; default `["GET"]`; minItems `1`)
- `allowedHeaders` (array; optional; default `["accept","content-type","idempotency-key"]`)
- `maxRequestBytes` (integer; optional; default `1048576`; minimum `1`)
- `maxResponseBytes` (integer; optional; default `1048576`; minimum `1`)
- `timeoutMs` (integer; optional; default `30000`; minimum `1`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

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

The adapter checks configured origins, methods, credentials, and request-size bounds before transport. A denied origin or oversized request is an error; a grant is not an unrestricted HTTP client.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports; discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Catalogue status: `locally-verified`.
Recorded local command result on 2026-09-16: `passed`.

The package-local command completed with exit code 0.

Run the package command:

```bash
npm test --prefix skills/common/plugins/network-http
```

Package test files found: 3. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/live-function.test.ts && node tests/package-boundary.test.mjs && node tests/streaming.test.ts
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/common/plugins/network-http/plugin.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/network-http/plugin.json)
- Authored package guide: [skills/common/plugins/network-http/README.md](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/network-http/README.md)
- Module for `http`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/network-http/src/adapter.ts)
- Test: [skills/common/plugins/network-http/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/network-http/tests/live-function.test.ts)
- Test: [skills/common/plugins/network-http/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/network-http/tests/package-boundary.test.mjs)
- Test: [skills/common/plugins/network-http/tests/streaming.test.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/network-http/tests/streaming.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
