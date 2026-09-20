# kubeclaw.demo-handoff

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/nova/plugins/demo-handoff/plugin.json; skills/nova/plugins/demo-handoff/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision 5b6e1b97415ffefa4bb42bf2ae331f27597170b5

## Authored Guidance

Move demo candidates through readiness, delivery, and handoff boundaries.

## When To Use It

Use it when the Nova graph needs the complete declared demo handoff flow.

## When Not To Use It

Do not use it as a generic transport or approval mechanism.

## Most Important Limit

Its three stages and adapter share one package-specific handoff contract.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.demo-handoff@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/nova/plugins/demo-handoff/plugin.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| stage | `candidate` | `kubeclaw.demo.candidate` | `src/candidate.ts` | `execute` |
| stage | `delivery` | `kubeclaw.demo.delivery` | `src/delivery.ts` | `execute` |
| stage | `ready` | `kubeclaw.demo.ready` | `src/ready.ts` | `execute` |
| capability adapter | `handoff` | `handoff` | `src/adapter.ts` | `activate` |

## stage: candidate

Public identifier: `kubeclaw.demo.candidate`.
Global registration ID: `kubeclaw.demo-handoff:candidate`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `test.plan.evidence`, `artifacts.write`

Provided capabilities: None.

Configuration schema: [schemas/empty.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/schemas/empty.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

The schema declares no top-level fields.

Input schema: [schemas/candidate.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/schemas/candidate.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/schemas/result.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `candidate` |
| `type` | `kubeclaw.demo.candidate` |
| `module` | `src/candidate.ts` |
| `export` | `execute` |
| `requiredCapabilities` | `["test.plan.evidence","artifacts.write"]` |
| `configSchema` | `schemas/empty.schema.json` |
| `inputSchema` | `schemas/candidate.schema.json` |
| `resultSchema` | `schemas/result.schema.json` |

## stage: delivery

Public identifier: `kubeclaw.demo.delivery`.
Global registration ID: `kubeclaw.demo-handoff:delivery`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `demo.handoff`, `artifacts.write`

Provided capabilities: None.

Configuration schema: [schemas/empty.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/schemas/empty.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

The schema declares no top-level fields.

Input schema: [schemas/delivery.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/schemas/delivery.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/schemas/result.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `delivery` |
| `type` | `kubeclaw.demo.delivery` |
| `module` | `src/delivery.ts` |
| `export` | `execute` |
| `requiredCapabilities` | `["demo.handoff","artifacts.write"]` |
| `configSchema` | `schemas/empty.schema.json` |
| `inputSchema` | `schemas/delivery.schema.json` |
| `resultSchema` | `schemas/result.schema.json` |

## stage: ready

Public identifier: `kubeclaw.demo.ready`.
Global registration ID: `kubeclaw.demo-handoff:ready`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `demo.handoff`, `artifacts.write`

Provided capabilities: None.

Configuration schema: [schemas/empty.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/schemas/empty.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

The schema declares no top-level fields.

Input schema: [schemas/ready.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/schemas/ready.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/schemas/result.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `ready` |
| `type` | `kubeclaw.demo.ready` |
| `module` | `src/ready.ts` |
| `export` | `execute` |
| `requiredCapabilities` | `["demo.handoff","artifacts.write"]` |
| `configSchema` | `schemas/empty.schema.json` |
| `inputSchema` | `schemas/ready.schema.json` |
| `resultSchema` | `schemas/result.schema.json` |

## capability adapter: handoff

Public identifier: `handoff`.
Global registration ID: `kubeclaw.demo-handoff:handoff`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `artifacts.read`, `test.plan.evidence`, `operator.request`, `operator.receipt`

Provided capabilities: `demo.handoff`

Configuration schema: [schemas/adapter.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/schemas/adapter.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `candidateStageId` (string; required; minLength `1`; maxLength `2048`)
- `deliveryStageId` (string; required; minLength `1`; maxLength `2048`)
- `readyStageId` (string; required; minLength `1`; maxLength `2048`)
- `manifestStageId` (string; required; minLength `1`; maxLength `2048`)
- `endpoint` (string; required; minLength `1`; maxLength `2048`)
- `tokenPath` (string; required; minLength `1`; maxLength `2048`)
- `caPath` (string; required; minLength `1`; maxLength `2048`)
- `stateRoot` (string; required; minLength `1`; maxLength `2048`)
- `operatorTarget` (string; required; pattern `^[a-z0-9][a-z0-9._:-]{0,127}$`)
- `timeoutMs` (integer; required; minimum `100`; maximum `60000`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `handoff` |
| `module` | `src/adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["demo.handoff"]` |
| `requiredCapabilities` | `["artifacts.read","test.plan.evidence","operator.request","operator.receipt"]` |
| `configSchema` | `schemas/adapter.schema.json` |

## Failure Behavior

The delivery adapter compares recovered receipts with the authoritative operator receipt before announcing readiness. Lost-response recovery must not create a second external delivery.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports; discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Catalogue status: `content-written`.
Recorded local command result on 2026-09-16: `unavailable`.

The command requires the OpenSSL executable, which is absent on this host.

Run the package command:

```bash
npm test --prefix skills/nova/plugins/demo-handoff
```

Package test files found: 3. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
cd ../../../.. && node --test skills/nova/plugins/demo-handoff/tests/*.test.mts skills/nova/plugins/demo-handoff/tests/*.test.mjs
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/nova/plugins/demo-handoff/plugin.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/plugin.json)
- Authored package guide: [skills/nova/plugins/demo-handoff/README.md](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/README.md)
- Module for `candidate`: [src/candidate.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/src/candidate.ts)
- Module for `delivery`: [src/delivery.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/src/delivery.ts)
- Module for `ready`: [src/ready.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/src/ready.ts)
- Module for `handoff`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/src/adapter.ts)
- Test: [skills/nova/plugins/demo-handoff/tests/compiler.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/tests/compiler.test.mjs)
- Test: [skills/nova/plugins/demo-handoff/tests/controller-client.test.mts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/tests/controller-client.test.mts)
- Test: [skills/nova/plugins/demo-handoff/tests/handoff.test.mts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/demo-handoff/tests/handoff.test.mts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
