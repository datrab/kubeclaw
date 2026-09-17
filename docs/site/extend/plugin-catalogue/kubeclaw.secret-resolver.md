# kubeclaw.secret-resolver

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/secret-resolver/plugin.json; skills/common/plugins/secret-resolver/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Resolve secret references without exposing the backing secret store.

## When To Use It

Use it when an extension needs an approved secret value at runtime.

## When Not To Use It

Do not use it to place literal secrets in project or plugin configuration.

## Most Important Limit

Callers receive only secrets allowed by their exact grant.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/secret-resolver/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.secret-resolver@1.0.0`.
- Runtime-role manifest inclusion: `buster`, `nova`, `prism`
- Manifest: [skills/common/plugins/secret-resolver/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/secret-resolver/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| capability adapter | `secrets` | `secrets` | `src/adapter.ts` | `activate` |

## capability adapter: secrets

Public identifier: `secrets`.
Global registration ID: `kubeclaw.secret-resolver:secrets`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: None.

Provided capabilities: `secrets.read`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/secret-resolver/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `environment` (object; required)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `secrets` |
| `module` | `src/adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["secrets.read"]` |
| `requiredCapabilities` | Empty list. |
| `configSchema` | `schemas/config.schema.json` |

## Failure Behavior

The resolve operation maps a logical secret ID to an allowed environment variable. An unmapped ID is denied and an empty or missing variable is unavailable. Removal does not erase the external secret.

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
npm test --prefix skills/common/plugins/secret-resolver
```

Package test files found: 2. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/live-function.test.ts && node tests/package-boundary.test.mjs
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/common/plugins/secret-resolver/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/secret-resolver/plugin.json)
- Authored package guide: [skills/common/plugins/secret-resolver/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/secret-resolver/README.md)
- Module for `secrets`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/secret-resolver/src/adapter.ts)
- Test: [skills/common/plugins/secret-resolver/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/secret-resolver/tests/live-function.test.ts)
- Test: [skills/common/plugins/secret-resolver/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/secret-resolver/tests/package-boundary.test.mjs)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
