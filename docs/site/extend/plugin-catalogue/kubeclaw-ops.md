# kubeclaw-ops

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: plugins/kubeclaw-ops/.codex-plugin/plugin.json; plugins/kubeclaw-ops/skills/troubleshoot/SKILL.md
Applies to: codex-plugin; package 0.2.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Guide read-only diagnosis across Kubernetes, Argo CD, logs, and Hubble evidence.

## When To Use It

Use it when a Codex operator must correlate platform symptoms without making changes.

## When Not To Use It

Do not use it to deploy, restart, patch, or delete platform resources.

## Most Important Limit

The plugin supplies a skill, but it does not supply the external read-only tools.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/plugins/kubeclaw-ops/skills/troubleshoot/SKILL.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `codex`.
- Package identity: `kubeclaw-ops@0.2.0`.
- Runtime-role manifest inclusion: No runtime role.
- Additional packaging path: Codex installs this package separately; KubeClaw runtime-role manifests do not contain it.
- Manifest: [plugins/kubeclaw-ops/.codex-plugin/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/plugins/kubeclaw-ops/.codex-plugin/plugin.json)

## Boundaries

- Codex owns plugin and skill discovery.
- The manifest supplies guidance and declares its interface capability.
- External tool connections remain separate from this package.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| Codex plugin | `kubeclaw-ops` | `kubeclaw-ops` | `./skills/` | Runtime registration |

## Codex plugin: kubeclaw-ops

Public identifier: `kubeclaw-ops`.

Codex interface capabilities: `Read`

Provided capabilities: None.

Configuration schema: None.

Configuration fields:

Not applicable.

Input schema: None.

Result schema: None.

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `kubeclaw-ops` |
| `module` | `./skills/` |
| `requiredCapabilities` | `["Read"]` |

## Failure Behavior

Codex cannot use the skill when the plugin is absent or its external tools are unavailable.
The current package has no package-local automated acceptance test.

## Verification Record

Audit status: `content-written`.
Local command result on 2026-09-16: `not-run`.

The Codex package declares no package-local automated test; connected-tool and missing-tool reader exercises remain required.

Run the package command:

No package-local automated command is declared.

Package tests found: 0.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [plugins/kubeclaw-ops/.codex-plugin/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/plugins/kubeclaw-ops/.codex-plugin/plugin.json)
- Authored package guide: [plugins/kubeclaw-ops/skills/troubleshoot/SKILL.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/plugins/kubeclaw-ops/skills/troubleshoot/SKILL.md)
- Module for `kubeclaw-ops`: [./skills/](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/plugins/kubeclaw-ops/skills)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
