# Operator Quickstart

Status: convenience source check only; canonical install and run procedures own operator acceptance
Audience: operator
Owner: platform operations
Evidence: package.json; scripts/deploy.sh
Applies to: current repository checkout
Last verified: 2026-10-22, source/procedure review; revised dependency commands not executed

## Objective

Confirm that a checkout can enter the full installation or pipeline procedure.
This quickstart makes no cluster change and starts no external effect.
It is not a second install, readiness, or run-control authority.

Use [Plan and Install](install.md) for deployment.
Use the [maintained first project](workflows/README.md#materialize-and-compile-a-first-project)
for complete local inputs, eight-stage compilation, graph inspection and cleanup.
That exercise neither admits nor executes a runtime pipeline.
Use [Configure and Operate](operate.md) to start a governed run with separately
owned platform configuration, grants and services.

## Prerequisites

- Use a clean KubeClaw checkout.
- Install Node.js major version 24 and its supplied npm version.
- Install Go and make `go` available on `PATH`. The generated-documentation
  checks use it to inspect Go producers.
- Run commands from the repository root.
- Use the npm registry and credentials selected by the repository or host package
  authority. Keep network and DNS access to that registry when the package cache
  is incomplete. Do not print registry tokens into the evidence record.
- Use a disposable checkout when an existing `node_modules` directory contains
  local state. `npm ci` removes that directory and installs the lockfile state.

## Supported Versions

Use the [shared version rules](README.md#version-and-tool-boundary).
This portable quickstart requires Node.js 24 and Go.
The repository does not declare an accepted Go version range; record `go version`.
It does not require Kubernetes, Helm, kubectl, or a delegated cgroup.

## Locked Dependency Installation

This is the canonical `npm ci` safety contract for operator procedures. Run it
from the repository root in a disposable checkout, before any procedure that
links here. The package authority is `package-lock.json`; the network authority
is the registry returned by `npm config get registry`, together with the host's
DNS, TLS, proxy, and npm credential configuration. Never copy `.npmrc`, tokens,
authorization headers, or npm debug logs into retained evidence.

Set `<dependency-evidence-dir>` to a new access-restricted directory outside
the checkout. `npm ci` deletes and recreates `node_modules`; it must not run in
a checkout whose existing dependency tree or files are owned by another task.

```bash
set -euo pipefail
umask 077
test "$(git rev-parse --show-toplevel)" = "$PWD"
test ! -e "<dependency-evidence-dir>"
mkdir -m 0700 "<dependency-evidence-dir>"
git status --short > "<dependency-evidence-dir>/worktree-before.txt"
git rev-parse HEAD > "<dependency-evidence-dir>/source-commit.txt"
node --version > "<dependency-evidence-dir>/node-version.txt"
npm --version > "<dependency-evidence-dir>/npm-version.txt"
npm config get omit > "<dependency-evidence-dir>/npm-omit.txt"
sha256sum package-lock.json > "<dependency-evidence-dir>/package-lock.sha256"
npm config get registry | node -e '
let value=""; process.stdin.on("data", c => value += c).on("end", () => {
  const url = new URL(value.trim());
  url.username = ""; url.password = ""; url.search = ""; url.hash = "";
  process.stdout.write(url.toString() + "\n");
});' > "<dependency-evidence-dir>/registry.txt"
set +e
npm ci --ignore-scripts --include=dev > "<dependency-evidence-dir>/npm-ci.stdout.txt" \
  2> "<dependency-evidence-dir>/npm-ci.stderr.txt"
npm_ci_status=$?
set -e
printf '%s\n' "$npm_ci_status" > "<dependency-evidence-dir>/npm-ci.exit-status.txt"
test "$npm_ci_status" -eq 0
set +e
node -e 'for (const name of ["typescript", "json-schema-to-typescript"]) console.log(require.resolve(name))' \
  > "<dependency-evidence-dir>/required-modules.stdout.txt" \
  2> "<dependency-evidence-dir>/required-modules.stderr.txt"
module_status=$?
set -e
printf '%s\n' "$module_status" > "<dependency-evidence-dir>/required-modules.exit-status.txt"
test "$module_status" -eq 0
git status --short > "<dependency-evidence-dir>/worktree-after.txt"
cmp "<dependency-evidence-dir>/worktree-before.txt" \
  "<dependency-evidence-dir>/worktree-after.txt"
```

Expected observations: the sanitized registry URL names the approved endpoint,
the lock digest is nonempty, and both exit-status files contain `0`.
Module resolution prints the installed paths for `typescript` and
`json-schema-to-typescript`. The before/after worktree files match.
These development packages are required by the root compiler and generator
checks. `NODE_ENV=production` or an npm omit setting can otherwise exclude them
while `npm ci` still exits zero. Explicit `--include=dev` overrides dev omission;
see the [developer setup boundary](../extend/developer-handbook.md#prepare-a-clean-checkout).
Do not treat a successful production-only install as complete preparation.

Stop before generated checks if installation or module resolution fails.
Retain the sanitized output and exit statuses. A missing required module is a
dependency-setup failure, not schema drift or a product-runtime defect.
Correct the named setup prerequisite and repeat this same locked include-dev
installation in an owned checkout with a new evidence directory.
On DNS, TLS, proxy, authentication, package-not-found, integrity, engine, disk,
or permission failure, stop at the named owner. An incomplete offline cache
needs approved registry access or a complete approved cache before retry.
Do not change the registry, lockfile, or package versions merely to pass.

Successful module resolution proves these entry points are available; it does
not run their generators, validate generated output, build the native launcher,
fetch browsers, provision services, or establish cluster readiness.

If no later step needs the installed tree, have the checkout owner remove the
entire disposable checkout. If later steps continue in it, retain
`node_modules` until those steps finish and then use the same owner-approved
checkout cleanup. Do not delete an unproven path or an independently owned
dependency tree.

## Procedure

1. Complete [Locked Dependency Installation](#locked-dependency-installation).

2. Confirm the source identity if continuing in the installed checkout.

```bash
git status --short
git rev-parse HEAD
node --version
npm --version
command -v go
go version
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

`npm ci` reports a completed lockfile installation from the selected registry.
Record a registry authentication, DNS, TLS, package-not-found, or integrity
error as its own failure; do not change the registry or lockfile merely to pass.

The final command prints `"node skills/nova/pipeline.ts"`.
It does not start a run.

The pipeline command does not implement a `--help` option.
Use the exact project and explicit-graph forms in [Configure and Operate](operate.md#understand-the-two-command-forms).

## Verification

Confirm that the inventory check matches every installed manifest and registration.
Confirm that generated documentation matches its source inventories.

Keep the source commit before continuing to installation or operation.

Retain the complete dependency-installation evidence directory, the
generated-documentation result, plugin-inventory result, and printed pipeline
entry point.

## Common Failures

| Failure | Cause class | Next action |
| --- | --- | --- |
| Dirty worktree | Local or generated files differ | Review the changes; do not discard unknown work |
| `npm ci` fails | Lockfile, registry, network, cache, or runtime mismatch | Retain the first failure and correct the named prerequisite before the same locked retry |
| Required module resolution fails after install | Missing compiler/generator development dependency; production-only installation can still exit zero | Stop before generated checks; repeat the canonical include-dev installation and resolution check with new evidence |
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

The installed `node_modules` tree is the only persistent quickstart output.
Keep it when the same checkout continues to another documented task. Otherwise,
remove the disposable checkout through its workspace owner; do not use an
unbounded filesystem command. This quickstart creates no cluster, provider, or
external runtime resource.
