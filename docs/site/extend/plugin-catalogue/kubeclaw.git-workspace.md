# kubeclaw.git-workspace

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/git-workspace/plugin.json; skills/common/plugins/git-workspace/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Provide controlled Git workspace operations to pipeline extensions.

## When To Use It

Use it for granted worktree creation, synchronization, commit, or merge operations. Use kubeclaw.repository-adapter for bounded repository inspection.

## When Not To Use It

Do not use it to bypass repository grants or package installation controls.

## Most Important Limit

Repository root, operation, and writable scope remain grant-bound.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/git-workspace/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.git-workspace@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/common/plugins/git-workspace/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/git-workspace/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| capability adapter | `git` | `git` | `src/adapter.ts` | `activate` |

## capability adapter: git

Public identifier: `git`.
Global registration ID: `kubeclaw.git-workspace:git`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: None.

Provided capabilities: `git.workspace.create`, `git.workspace.remove`, `git.commit`, `git.merge`, `git.sync`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/git-workspace/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `allowedRepositoryRoots` (array; required; minItems `1`)
- `workspaceRoot` (string; required; minLength `1`)
- `gitExecutable` (string; required; minLength `1`)
- `authorName` (string; required; minLength `1`; maxLength `320`; pattern `^[^\r\n\u0000]+$`)
- `authorEmail` (string; required; minLength `1`; maxLength `320`; pattern `^[^\r\n\u0000]+$`)
- `maxExecutionMs` (integer; required; minimum `1`; maximum `3600000`)
- `maxOutputBytes` (integer; required; minimum `1`; maximum `16777216`)
- `terminationGraceMs` (integer; required; minimum `1`; maximum `60000`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `git` |
| `module` | `src/adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["git.workspace.create","git.workspace.remove","git.commit","git.merge","git.sync"]` |
| `requiredCapabilities` | Empty list. |
| `configSchema` | `schemas/config.schema.json` |

## Failure Behavior

Workspace mutations use configured Git author identity and execution limits. Keep ordinary repository inspection on the repository-adapter surface and do not infer mutation authority from a read grant.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports; discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `locally-verified`.
Earlier AP08.7–AP08.9 local command result on 2026-09-16: `passed`.

The package-local command completed with exit code 0.

Run the package command:

```bash
npm test --prefix skills/common/plugins/git-workspace
```

Package test files found: 3. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/package-boundary.test.mjs && node tests/live-function.test.ts && node tests/sync-disposition.test.ts
```

The audit status does not claim live host or cluster acceptance. See the AP08
[AP08.10 checkpoint](../../../blueprint/AP08.10-checkpoint.md) for the independent rerun and current boundaries. Earlier results are historical.

## Source Evidence

- Manifest: [skills/common/plugins/git-workspace/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/git-workspace/plugin.json)
- Authored package guide: [skills/common/plugins/git-workspace/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/git-workspace/README.md)
- Module for `git`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/git-workspace/src/adapter.ts)
- Test: [skills/common/plugins/git-workspace/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/git-workspace/tests/live-function.test.ts)
- Test: [skills/common/plugins/git-workspace/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/git-workspace/tests/package-boundary.test.mjs)
- Test: [skills/common/plugins/git-workspace/tests/sync-disposition.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/git-workspace/tests/sync-disposition.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
