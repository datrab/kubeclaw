# kubeclaw-agent-observer

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json; skills/common/plugins/openclaw-agent-observer/README.md
Applies to: openclaw-plugin; package 0.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Move OpenClaw agent events into bounded Redis observability streams.

## When To Use It

Use it when OpenClaw hook activity must become durable agent evidence.

## When Not To Use It

Do not use it for Nova pipeline events or lifecycle control.

## Most Important Limit

It depends on configured Redis streams and does not own pipeline state.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-observer/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `openclaw`.
- Package identity: `kubeclaw-agent-observer@0.0.0`.
- Runtime-role manifest inclusion: `buster`, `nova`, `prism`
- Manifest: [skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json)

## Boundaries

- OpenClaw owns hook or tool registration and plugin activation.
- The host validates the package configuration before activation.
- The plugin does not own pipeline scheduling or lifecycle state.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| OpenClaw extension | `kubeclaw-agent-observer` | `kubeclaw-agent-observer` | `./src/index.ts` | Runtime registration |

## OpenClaw extension: kubeclaw-agent-observer

Public identifier: `kubeclaw-agent-observer`.

Required capabilities: None.

Provided capabilities: None.

Configuration schema: [Inline host schema in the manifest](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json)

Configuration fields:

- `enabled` (boolean; optional)
- `redisHost` (string; optional)
- `redisPort` (number; optional)
- `redisUsername` (string; optional)
- `redisPassword` (string; optional)
- `redisTls` (boolean; optional)
- `redisNetworkIsolation` (boolean or string; optional)
- `maxEventBytes` (number; optional)
- `maxQueuePerStream` (number; optional)
- `redisCommandTimeoutMs` (number; optional)
- `streamMaxLen` (number; optional)
- `deadLetterMaxLen` (number; optional)
- `controlWriteMaxAttempts` (number; optional)
- `controlWriteRetryBaseMs` (number; optional)
- `controlWriteRetryMaxMs` (number; optional)
- `hookPriority` (number; optional)
- `hookTimeoutMs` (number; optional)

Input schema: None.

Result schema: None.

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `kubeclaw-agent-observer` |
| `module` | `./src/index.ts` |
| `requiredCapabilities` | Empty list. |

## Failure Behavior

OpenClaw rejects invalid host configuration or an unavailable extension module.
External dependency failure appears in the extension result or bounded diagnostics.

## Verification Record

Audit status: `locally-verified`.
Local command result on 2026-09-16: `passed`.

The package-local command completed with exit code 0.

Run the package command:

```bash
npm test --prefix skills/common/plugins/openclaw-agent-observer
```

Package tests found: 5.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json)
- Authored package guide: [skills/common/plugins/openclaw-agent-observer/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-observer/README.md)
- Module for `kubeclaw-agent-observer`: [./src/index.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-observer/src/index.ts)
- Test: [skills/common/plugins/openclaw-agent-observer/tests/clean-build.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-observer/tests/clean-build.test.mjs)
- Test: [skills/common/plugins/openclaw-agent-observer/tests/config.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-observer/tests/config.test.mjs)
- Test: [skills/common/plugins/openclaw-agent-observer/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-observer/tests/live-function.test.ts)
- Test: [skills/common/plugins/openclaw-agent-observer/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-observer/tests/package-boundary.test.mjs)
- Test: [skills/common/plugins/openclaw-agent-observer/tests/remediation.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-observer/tests/remediation.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
