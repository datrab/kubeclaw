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
- Install the Node.js version required by the repository.
- Run commands from the repository root.
- Keep network access for dependency installation when the package cache is incomplete.

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

3. Check generated documentation and plugin contracts.

```bash
npm run docs:check:generated
npm run verify:plugin-system-v2
```

4. Display the current pipeline interface.

```bash
npm run pipeline -- --help
```

## Expected Result

The worktree output contains no unexpected change.
Both checks exit with code zero.

The final command prints the required platform and project or pipeline arguments.
It does not start a run.

## Verification

Confirm that the plugin check validates every installed manifest and registration.
Confirm that generated documentation matches its source inventories.

Keep the source commit before continuing to installation or operation.

## Common Failures

| Failure | Cause class | Next action |
| --- | --- | --- |
| Dirty worktree | Local or generated files differ | Review the changes; do not discard unknown work |
| `npm ci` fails | Lockfile, registry, network, or runtime mismatch | Correct the named prerequisite |
| Generated file drift | Source inventory changed | Run the named generator and review its diff |
| Plugin validation fails | Manifest, module, schema, export, trust, or grant error | Repair the exact reported boundary |
| Help command returns an argument error | Unsupported or incomplete command form | Use the syntax on [Configure and Operate](operate.md) |

## Recovery

Do not delete the lockfile or replace versions to bypass a failed check.
Return to the selected source commit and use its supported tool versions.

If the checkout already contains user changes, preserve them.
Use a separate clean checkout for the operator preflight.
