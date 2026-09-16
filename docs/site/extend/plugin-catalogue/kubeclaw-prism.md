# kubeclaw-prism

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/prism/openclaw-plugin/openclaw.plugin.json; skills/prism/openclaw-plugin/README.md
Applies to: openclaw-plugin; package 0.1.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Expose Prism design-set and revision commits as OpenClaw tools.

## When To Use It

Use it when the Prism agent must submit validated design output to Prism control.

## When Not To Use It

Do not use it as a general HTTP client or a Nova pipeline stage.

## Most Important Limit

It requires the Prism control service and accepts exactly the declared tool schemas.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/openclaw-plugin/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `openclaw`.
- Package identity: `kubeclaw-prism@0.1.0`.
- Runtime-role manifest inclusion: No runtime role.
- Additional packaging path: The Prism agent image copies this extension directly; the runtime-role manifest does not list it.
- Manifest: [skills/prism/openclaw-plugin/openclaw.plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/openclaw-plugin/openclaw.plugin.json)

## Boundaries

- OpenClaw owns hook or tool registration and plugin activation.
- The host validates the package configuration before activation.
- The plugin does not own pipeline scheduling or lifecycle state.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| OpenClaw extension | `kubeclaw-prism` | `kubeclaw-prism` | `./index.mjs` | Runtime registration |

## OpenClaw extension: kubeclaw-prism

Public identifier: `kubeclaw-prism`.

Required capabilities: None.

Provided capabilities: None.

Configuration schema: [Inline host schema in the manifest](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/openclaw-plugin/openclaw.plugin.json)

Configuration fields:

- `controlUrl` (string; optional)

Input schema: None.

Result schema: None.

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `kubeclaw-prism` |
| `module` | `./index.mjs` |
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
node --test skills/prism/openclaw-plugin/index.test.mjs
```

Package tests found: 1.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/prism/openclaw-plugin/openclaw.plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/openclaw-plugin/openclaw.plugin.json)
- Authored package guide: [skills/prism/openclaw-plugin/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/openclaw-plugin/README.md)
- Module for `kubeclaw-prism`: [./index.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/openclaw-plugin/index.mjs)
- Test: [skills/prism/openclaw-plugin/index.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/openclaw-plugin/index.test.mjs)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
