# kubeclaw.remote-test-gate

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/nova/plugins/remote-test-gate/plugin.json; skills/nova/plugins/remote-test-gate/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision 32b02816cc19cc8865a45b221b8b6ca28e99e8fb

## Authored Guidance

Submit exact remote test plans and retrieve their evidence for Nova.

## When To Use It

Use it when Nova delegates test execution to the Buster boundary.

## When Not To Use It

Do not use it to run provider code inside the Nova process.

## Most Important Limit

Plan and evidence identities must remain bound across remote execution.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/remote-test-gate/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.remote-test-gate@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/nova/plugins/remote-test-gate/plugin.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/remote-test-gate/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| capability adapter | `plan` | `plan` | `src/adapter.ts` | `activate` |
| capability adapter | `evidence` | `evidence` | `src/evidence-adapter.ts` | `activate` |

## capability adapter: plan

Public identifier: `plan`.
Global registration ID: `kubeclaw.remote-test-gate:plan`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `secrets.read`

Provided capabilities: `test.plan.execute`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/remote-test-gate/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `endpoint` (string; required; pattern `^https?://`)
- `authentication` (enumeration; required; allowed `["bearer","spiffe-proxy"]`)
- `tokenSecret` (string; optional; minLength `1`)
- `sourcePrivateKeySecret` (string; required; minLength `1`)
- `sourceAuthority` (string; required; minLength `1`)
- `stateRoot` (string; required; minLength `1`)
- `allowedRepositoryRoots` (array; required; minItems `1`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `plan` |
| `module` | `src/adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["test.plan.execute"]` |
| `requiredCapabilities` | `["secrets.read"]` |
| `configSchema` | `schemas/config.schema.json` |

## capability adapter: evidence

Public identifier: `evidence`.
Global registration ID: `kubeclaw.remote-test-gate:evidence`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `artifacts.read`

Provided capabilities: `test.plan.evidence`

Configuration schema: [schemas/evidence-config.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/remote-test-gate/schemas/evidence-config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `stateRoot` (string; required; minLength `1`)
- `manifestStageId` (string; required; minLength `1`)
- `gateStageId` (string; required; minLength `1`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `evidence` |
| `module` | `src/evidence-adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["test.plan.evidence"]` |
| `requiredCapabilities` | `["artifacts.read"]` |
| `configSchema` | `schemas/evidence-config.schema.json` |

## Failure Behavior

The package imports remote evidence through its configured manifest and gate-stage bindings. It validates the evidence store and stops on cancellation; fixture envelopes alone do not prove a remote Buster job.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports; discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Catalogue status: `content-written`.
Recorded local command result on 2026-09-16: `unavailable`.

The command requires the Go executable, which is absent on this host.

Run the package command:

```bash
npm test --prefix skills/nova/plugins/remote-test-gate
```

Package test files found: 2. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/live-function.test.ts && node --test tests/evidence-projection.test.ts
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/nova/plugins/remote-test-gate/plugin.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/remote-test-gate/plugin.json)
- Authored package guide: [skills/nova/plugins/remote-test-gate/README.md](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/remote-test-gate/README.md)
- Module for `plan`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/remote-test-gate/src/adapter.ts)
- Module for `evidence`: [src/evidence-adapter.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/remote-test-gate/src/evidence-adapter.ts)
- Test: [skills/nova/plugins/remote-test-gate/tests/evidence-projection.test.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/remote-test-gate/tests/evidence-projection.test.ts)
- Test: [skills/nova/plugins/remote-test-gate/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/remote-test-gate/tests/live-function.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
