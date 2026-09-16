# kubeclaw.demo-handoff

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/nova/plugins/demo-handoff/plugin.json; skills/nova/plugins/demo-handoff/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

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

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/README.md)
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
- Manifest: [skills/nova/plugins/demo-handoff/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/plugin.json)

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

Required capabilities: `test.plan.evidence`, `artifacts.write`

Provided capabilities: None.

Configuration schema: [schemas/empty.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/schemas/empty.schema.json)

Configuration fields:

The schema declares no top-level fields.

Input schema: [schemas/candidate.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/schemas/candidate.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/schemas/result.schema.json)

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

Required capabilities: `demo.handoff`, `artifacts.write`

Provided capabilities: None.

Configuration schema: [schemas/empty.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/schemas/empty.schema.json)

Configuration fields:

The schema declares no top-level fields.

Input schema: [schemas/delivery.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/schemas/delivery.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/schemas/result.schema.json)

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

Required capabilities: `demo.handoff`, `artifacts.write`

Provided capabilities: None.

Configuration schema: [schemas/empty.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/schemas/empty.schema.json)

Configuration fields:

The schema declares no top-level fields.

Input schema: [schemas/ready.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/schemas/ready.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/schemas/result.schema.json)

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

Required capabilities: `artifacts.read`, `test.plan.evidence`, `operator.request`, `operator.receipt`

Provided capabilities: `demo.handoff`

Configuration schema: [schemas/adapter.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/schemas/adapter.schema.json)

Configuration fields:

- `candidateStageId` (string; required)
- `deliveryStageId` (string; required)
- `readyStageId` (string; required)
- `manifestStageId` (string; required)
- `endpoint` (string; required)
- `tokenPath` (string; required)
- `caPath` (string; required)
- `stateRoot` (string; required)
- `operatorTarget` (string; required)
- `timeoutMs` (integer; required)

Input schema: None.

Result schema: None.

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

Registry validation rejects a missing module, export, schema, or capability declaration.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `content-written`.
Local command result on 2026-09-16: `unavailable`.

The command requires the OpenSSL executable, which is absent on this host.

Run the package command:

```bash
npm test --prefix skills/nova/plugins/demo-handoff
```

Package tests found: 3.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/nova/plugins/demo-handoff/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/plugin.json)
- Authored package guide: [skills/nova/plugins/demo-handoff/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/README.md)
- Module for `candidate`: [src/candidate.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/src/candidate.ts)
- Module for `delivery`: [src/delivery.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/src/delivery.ts)
- Module for `ready`: [src/ready.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/src/ready.ts)
- Module for `handoff`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/src/adapter.ts)
- Test: [skills/nova/plugins/demo-handoff/tests/compiler.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/tests/compiler.test.mjs)
- Test: [skills/nova/plugins/demo-handoff/tests/controller-client.test.mts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/tests/controller-client.test.mts)
- Test: [skills/nova/plugins/demo-handoff/tests/handoff.test.mts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/demo-handoff/tests/handoff.test.mts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
