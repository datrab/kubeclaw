# kubeclaw.wait-store

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/wait-store/plugin.json; skills/common/plugins/wait-store/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Create and read durable wait records through signal.wait.

## When To Use It

Use it when Core needs storage for a wait owned by a pipeline attempt.

## When Not To Use It

Do not use it to authorize a signal or decide that a waiting stage can continue.

## Most Important Limit

The adapter stores waits. Core validates signals and owns wait resolution and continuation.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/wait-store/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.wait-store@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/common/plugins/wait-store/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/wait-store/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| capability adapter | `waits` | `waits` | `src/adapter.ts` | `activate` |

## capability adapter: waits

Public identifier: `waits`.
Global registration ID: `kubeclaw.wait-store:waits`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: None.

Provided capabilities: `signal.wait`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/wait-store/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `root` (string; required; minLength `1`)
- `maxEntryBytes` (integer; optional; default `1048576`; minimum `1`)
- `maximumRecords` (integer; optional; default `100000`; minimum `1`)
- `maximumStoreBytes` (integer; optional; default `268435456`; minimum `1`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `waits` |
| `module` | `src/adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["signal.wait"]` |
| `requiredCapabilities` | Empty list. |
| `configSchema` | `schemas/config.schema.json` |

## Failure Behavior

Create checks typed wait fields and expiry; read retrieves a stored wait. Reusing a key with different wait content fails with WAIT_IDEMPOTENCY_CONFLICT. Signal authorization and continuation remain Core responsibilities.

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
npm test --prefix skills/common/plugins/wait-store
```

Package test files found: 2. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/live-function.test.ts && node tests/package-boundary.test.mjs
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/common/plugins/wait-store/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/wait-store/plugin.json)
- Authored package guide: [skills/common/plugins/wait-store/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/wait-store/README.md)
- Module for `waits`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/wait-store/src/adapter.ts)
- Test: [skills/common/plugins/wait-store/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/wait-store/tests/live-function.test.ts)
- Test: [skills/common/plugins/wait-store/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/wait-store/tests/package-boundary.test.mjs)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
