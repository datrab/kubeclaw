# kubeclaw.remote-test-gate

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/nova/plugins/remote-test-gate/plugin.json; skills/nova/plugins/remote-test-gate/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

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

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/remote-test-gate/README.md)
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
- Manifest: [skills/nova/plugins/remote-test-gate/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/remote-test-gate/plugin.json)

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

Required capabilities: `secrets.read`

Provided capabilities: `test.plan.execute`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/remote-test-gate/schemas/config.schema.json)

Configuration fields:

- `endpoint` (string; required)
- `authentication` (schema-defined; required)
- `tokenSecret` (string; optional)
- `sourcePrivateKeySecret` (string; required)
- `sourceAuthority` (string; required)
- `stateRoot` (string; required)
- `allowedRepositoryRoots` (array; required)

Input schema: None.

Result schema: None.

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

Required capabilities: `artifacts.read`

Provided capabilities: `test.plan.evidence`

Configuration schema: [schemas/evidence-config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/remote-test-gate/schemas/evidence-config.schema.json)

Configuration fields:

- `stateRoot` (string; required)
- `manifestStageId` (string; required)
- `gateStageId` (string; required)

Input schema: None.

Result schema: None.

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

Registry validation rejects a missing module, export, schema, or capability declaration.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `content-written`.
Local command result on 2026-09-16: `unavailable`.

The command requires the Go executable, which is absent on this host.

Run the package command:

```bash
npm test --prefix skills/nova/plugins/remote-test-gate
```

Package tests found: 2.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/nova/plugins/remote-test-gate/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/remote-test-gate/plugin.json)
- Authored package guide: [skills/nova/plugins/remote-test-gate/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/remote-test-gate/README.md)
- Module for `plan`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/remote-test-gate/src/adapter.ts)
- Module for `evidence`: [src/evidence-adapter.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/remote-test-gate/src/evidence-adapter.ts)
- Test: [skills/nova/plugins/remote-test-gate/tests/evidence-projection.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/remote-test-gate/tests/evidence-projection.test.ts)
- Test: [skills/nova/plugins/remote-test-gate/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/remote-test-gate/tests/live-function.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
