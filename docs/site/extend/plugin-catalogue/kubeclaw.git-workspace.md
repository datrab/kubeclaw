# kubeclaw.git-workspace

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/git-workspace/plugin.json; skills/common/plugins/git-workspace/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: source facts revision 7994a51e16bc752357c3a801190b12b7d6a191a4; package behavior sources revision 32b02816cc19cc8865a45b221b8b6ca28e99e8fb. Local command results and their limits appear under Package Checks.

## Purpose

Give pipeline extensions controlled Git workspace operations.

## When To Use It

Use it for granted worktree creation, synchronization, commit, or merge operations. Use kubeclaw.repository-adapter for bounded repository inspection.

## When Not To Use It

Do not use it to bypass repository grants or package installation controls.

## Most Important Limit

Repository root, operation, and writable scope remain grant-bound.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/common/plugins/git-workspace/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Package Reference

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.git-workspace@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/common/plugins/git-workspace/plugin.json](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/common/plugins/git-workspace/plugin.json)

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
Global registration ID: `kubeclaw.git-workspace:git`. This identifies the installed registration. Graphs select stage types. Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: None.

Provided capabilities: `git.workspace.create`, `git.workspace.remove`, `git.commit`, `git.merge`, `git.sync`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/common/plugins/git-workspace/schemas/config.schema.json)

Configuration fields: schema declarations. Defaults are annotations, not proof that the caller inserts a value.

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

Git mutations can be partial: worktree creation precedes owner-record persistence, removal precedes optional branch deletion, and sync_paths changes files separately. Ownership checks depend on a supplied workspaceReference and approval checks on their selected contract. Fetch/push targets come from request remote plus actual Git fetch/pushurl/rewrite configuration, not an adapter remote allowlist. Reconcile workspace/ref state after failure or an uncertain remote effect.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports. Discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
The selected runtime owns failure recording and lifecycle state. Package code does not gain lifecycle authority.
Adapter startup cleanup can remain pending when shutdown ignores its abort signal. Use the [startup stop rules](../../use/plugins.md#3-activate-and-prove-health).

## Package Checks

Historical local command record dated 2026-09-16.
Recorded source revision: `bcf032f241b432bf920baa9ee5f727947921447d`.
Recorded environment: `Linux workspace with Node.js 24 and BusyBox userland`.
Recorded result: `passed`.

Exact reason from that historical record:

> The package-local command completed with exit code 0.

This historical quotation is not a current package-availability or readiness result.
The next section gives the current command or no-command declaration.

Run the package command:

```bash
npm test --prefix skills/common/plugins/git-workspace
```

Package test files found: 3. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/package-boundary.test.mjs && node tests/live-function.test.ts && node tests/sync-disposition.test.ts
```

Local package checks do not prove live host or cluster readiness.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/common/plugins/git-workspace/plugin.json](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/common/plugins/git-workspace/plugin.json)
- Package implementation guide: [skills/common/plugins/git-workspace/README.md](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/common/plugins/git-workspace/README.md)
- Module for `git`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/common/plugins/git-workspace/src/adapter.ts)
- Test: [skills/common/plugins/git-workspace/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/common/plugins/git-workspace/tests/live-function.test.ts)
- Test: [skills/common/plugins/git-workspace/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/common/plugins/git-workspace/tests/package-boundary.test.mjs)
- Test: [skills/common/plugins/git-workspace/tests/sync-disposition.test.ts](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/common/plugins/git-workspace/tests/sync-disposition.test.ts)
