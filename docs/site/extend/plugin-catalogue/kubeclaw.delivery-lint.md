# kubeclaw.delivery-lint

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/nova/plugins/delivery-lint/plugin.json; skills/nova/plugins/delivery-lint/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision 5b6e1b97415ffefa4bb42bf2ae331f27597170b5

## Authored Guidance

Check delivery metadata and files before release-oriented work continues.

## When To Use It

Use it when a graph needs a dedicated delivery-contract lint step.

## When Not To Use It

Do not use it for source-code lint rules owned by the main lint plugin.

## Most Important Limit

It checks the declared delivery surface, not every repository convention.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/delivery-lint/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.delivery-lint@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/nova/plugins/delivery-lint/plugin.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/delivery-lint/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| stage | `delivery-lint` | `kubeclaw.lint.delivery` | `src/stage.ts` | `execute` |

## stage: delivery-lint

Public identifier: `kubeclaw.lint.delivery`.
Global registration ID: `kubeclaw.delivery-lint:delivery-lint`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `git.repository.read`, `artifacts.write`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/delivery-lint/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

The schema declares no top-level fields.

Input schema: [schemas/input.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/delivery-lint/schemas/input.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/delivery-lint/schemas/result.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `delivery-lint` |
| `type` | `kubeclaw.lint.delivery` |
| `module` | `src/stage.ts` |
| `export` | `execute` |
| `requiredCapabilities` | `["git.repository.read","artifacts.write"]` |
| `configSchema` | `schemas/config.schema.json` |
| `inputSchema` | `schemas/input.schema.json` |
| `resultSchema` | `schemas/result.schema.json` |

## Failure Behavior

Configuration is the closed empty object. The artifact namespace is fixed to `kubeclaw.delivery-lint`; it is not a configurable report namespace. Input selects the Dockerfile and delivery paths. A passing lexical check does not prove COPY source existence or the final image filesystem. See the configuration schema and registration module above.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports; discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Catalogue status: `content-written`.
Recorded local command result on 2026-09-16: `unavailable`.

The command reached a persistent-path check, but BusyBox flock has no required --timeout option.

Run the package command:

```bash
npm test --prefix skills/nova/plugins/delivery-lint
```

Package test files found: 2. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/package-boundary.test.mjs && node tests/live-function.test.ts
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/nova/plugins/delivery-lint/plugin.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/delivery-lint/plugin.json)
- Authored package guide: [skills/nova/plugins/delivery-lint/README.md](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/delivery-lint/README.md)
- Module for `delivery-lint`: [src/stage.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/delivery-lint/src/stage.ts)
- Test: [skills/nova/plugins/delivery-lint/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/delivery-lint/tests/live-function.test.ts)
- Test: [skills/nova/plugins/delivery-lint/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/delivery-lint/tests/package-boundary.test.mjs)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
