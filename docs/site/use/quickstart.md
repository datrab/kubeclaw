# Operator Quickstart

Status: implemented local preflight; deployment and live execution require an operator environment
Audience: operator
Owner: platform operations
Evidence: package.json; scripts/deploy.sh
Applies to: current repository checkout
Last verified: 2026-09-16, local command execution

## Objective

Confirm that a checkout can enter the full installation or pipeline procedure.
This quickstart makes no cluster change and starts no external effect.

Use [Plan and Install](install.md) for deployment.
Use [Configure and Operate](operate.md) to start a governed run.

## Prerequisites

- Use a clean KubeClaw checkout.
- Install Node.js major version 24 and its supplied npm version.
- Run commands from the repository root.
- Keep network access for dependency installation when the package cache is incomplete.

## Supported Versions

Use the [shared version rules](README.md#supported-versions-and-tools).
This portable quickstart requires Node.js 24.
It does not require Kubernetes, Helm, kubectl, or a delegated cgroup.

## Procedure

1. Confirm the source identity.

```bash
git status --short
git rev-parse HEAD
```

2. Install exact repository dependencies.

```bash
npm ci --ignore-scripts
```

3. Check generated documentation and the installed plugin inventory.

```bash
npm run docs:check:generated
npm run plugin-system:inventory:check
```

4. Confirm the pipeline entry point.

```bash
npm pkg get scripts.pipeline
```

## Expected Result

The worktree output contains no unexpected change.
Both checks exit with code zero.

The final command prints `"node skills/nova/pipeline.ts"`.
It does not start a run.

The pipeline command does not implement a `--help` option.
Use the exact project and explicit-graph forms in [Configure and Operate](operate.md#understand-the-two-command-forms).

## Verification

Confirm that the inventory check matches every installed manifest and registration.
Confirm that generated documentation matches its source inventories.

Keep the source commit before continuing to installation or operation.

## Common Failures

| Failure | Cause class | Next action |
| --- | --- | --- |
| Dirty worktree | Local or generated files differ | Review the changes; do not discard unknown work |
| `npm ci` fails | Lockfile, registry, network, or runtime mismatch | Correct the named prerequisite |
| Generated file drift | Source inventory changed | Run the named generator and review its diff |
| Plugin validation fails | Manifest, module, schema, export, trust, or grant error | Repair the exact reported boundary |
| Pipeline entry point differs | The checkout and documentation do not describe the same command | Stop and review the selected source revision |

## Full Isolation Contract Verification

The full plugin-system verifier is not a portable quickstart check.
It requires a host administrator to provide a real writable and delegated cgroup-v2 subtree.

On a prepared verification host, use:

```bash
export KUBECLAW_TEST_CGROUP_ROOT="<delegated-cgroup-v2-root>"
npm run verify:plugin-system-v2
```

The variable alone does not create the delegation.
Use [Verification Commands](../reference/verification-commands.md) for the required checks and their evidence boundaries.

## Recovery

Do not delete the lockfile or replace versions to bypass a failed check.
Return to the selected source commit and use its supported tool versions.

If the checkout already contains user changes, preserve them.
Use a separate clean checkout for the operator preflight.
