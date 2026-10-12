# Develop KubeClaw

Status: source-backed development routes with explicit environment limits
Audience: platform developer, component maintainer, contract author, UI developer
Owner: developer experience maintainers
Evidence: package.json; package-lock.json; tsconfig.base.json; packaging/runtime/package-ownership.json; versions.json; .github/workflows; skills/nova/core; skills/worker/core; skills/buster/engine; skills/prism; tools/ops-mcp; scripts
Evidence revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`
Applies to: the current source workspaces, runtime bundles, services, and release workflows
Last verified: source inspection and bounded local checks on 2026-10-12; clean-checkout, native, image, deployment, and live routes require their stated environments

Use this handbook to prepare a checkout, find the component that owns a change,
and select checks that reach the changed boundary. Start with [the request
path](../understand/request-to-result.md). Use [the extension choice
guide](README.md) when an existing extension contract can contain the change.
For an installed plugin, continue to its [package guide](plugin-catalogue/README.md).

A **workspace** is an npm package installed through the root lockfile. A
**runtime role** is the package set assembled for a deployable Nova, Buster, or
Prism runtime. A workspace install does not prove that a role contains that
package. A **contract** is a versioned machine boundary. A **projection** is a
view derived from durable records; it does not replace those records. A
**digest** identifies exact bytes or a declared canonical encoding of a value.
A **fixture** is bounded input and expected behavior for a check.

## Prepare a clean checkout

Use an isolated development checkout on Linux. Journal checks require GNU
util-linux `flock` at `/usr/bin/flock`, including `--timeout` and
`--conflict-exit-code`. A BusyBox command with the same name does not meet this
requirement.

The journal uses `fsync`, which requests synchronization of a file's data and
metadata (information about the file) with storage. Here, an `inode` is the
underlying filesystem object that a lock protects. A pathname identifies that
object. If a process removes or replaces the pathname while another process
still uses the original object, a new process can open a different object and
take a competing lock.

Use a filesystem qualified for the required Linux locks, complete append
writes, and file synchronization. Do not assume a shared/network mount has the
same durability behavior. Never unlink or replace a stable lock inode while a
process can use it. Synchronizing the journal file does not by itself prove
that the entry linking it into its parent directory survives a host crash.
The C isolation launcher requires a C11 compiler named `cc`.
Use Bash and GNU `tar` for bundle scripts. Use Git for checkout, source-identity,
and compatibility fixtures. Keep fixture work outside a deployed run root.

Use Node.js 24, npm, and the committed root lockfile. CI selects Node 24 rather
than an exact host patch. Container patches and digests come from `versions.json`;
they are separate from the CI host. TypeScript 5.9.3 is a root development
dependency. Do not substitute a global `tsc` for the lockfile-selected compiler.
Root npm scripts put `node_modules/.bin` on `PATH`.

Run these steps in order. Stop at the first nonzero exit.

1. Clone the repository into a new directory.

   ```sh
   git clone https://github.com/datrab/kubeclaw.git kubeclaw
   cd kubeclaw
   ```

2. Select the full commit that you intend to change. The command below selects
   this handbook's inspected source baseline. For a later change, use its full
   commit and verify the corresponding source and documentation together.

   ```sh
   git checkout --detach 671234b056bf5f5f503e51e8db30f843e781ba6e
   git status --short
   git rev-parse HEAD
   ```

   The status output must be empty. The revision output must be the requested
   40-character commit. Create your working branch only after this check.

3. Check the host tools before installing or building.

   ```sh
   node --version
   npm --version
   git --version
   /usr/bin/flock --version
   cc --version
   bash --version
   tar --version
   ```

   Confirm Node major 24 and GNU util-linux `flock`. If a tool is missing or has
   a different contract, provision the disposable development host first.
   Changing `PATH` cannot replace the absolute `/usr/bin/flock` used by Nova.

4. Install root dependencies without executing package install hooks.

   ```sh
   npm ci --ignore-scripts
   ```

   This installs the declared workspaces. It does not build the C launcher,
   fetch browsers, provision services, or install independently locked packages.
   A lockfile or dependency-resolution failure is a setup failure. Retain its
   output and correct the dependency input; do not replace `npm ci` with an
   unrecorded dependency update.

5. Build the isolation launcher explicitly.

   ```sh
   npm run plugin-system:sandbox:build
   ```

   The build writes an executable at
   `skills/common/plugin-runtime/foundation/isolation/plugin-sandbox` through a
   temporary file and rename. This is a local build artifact. It is not a
   deployed native Worker launcher.

6. Check the common source baseline.

   ```sh
   npm run versions:check
   npm run plugin-system:sdk:check
   npm run verify:runtime-packaging:ownership
   node tests/verification/contracts/check-plugin-system-v2-lifecycle.mjs
   node tests/verification/contracts/check-plugin-system-v2-registry.mjs
   ```

   Each command must exit zero. The two final scripts print an `ok` result.
   This proves version synchronization, generated SDK freshness, dependency
   direction, and bounded lifecycle/registry contracts. It does not prove a
   running platform. Before editing, run the baseline checks for your selected
   component below and retain their results.

> **Source evidence — checkout baseline**
>
> Claim: the root install owns the listed workspaces; CI uses Node 24 and an explicit launcher build.
> Implementation: [workspace membership](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L1-L25), [launcher build](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/build-plugin-sandbox.mjs#L1-L25).
> Contract or setting: [journal append and fsync](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/nova/core/state/journal.ts#L125-L156), [absolute GNU lock invocation](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/nova/core/state/file-mutex.ts#L4-L23), [CI setup](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L9-L37).
> Test evidence: lifecycle and registry contract scripts exited zero in the existing checkout. The clean-checkout route has not executed this complete procedure.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: local contract checks do not establish native isolation, deployment, or live service readiness.

### Add tools and credentials only for the selected route

| Route | Additional prerequisites | Access and isolation |
| --- | --- | --- |
| Source and contract changes | Root dependencies; TypeScript; GNU locks for durable-store checks | No production credential is needed for pure fixtures. Tests can start local processes and temporary stores. |
| Prism Studio or Buster browser providers | Locked Playwright 1.62.1 browser and its Linux libraries | Disposable browser environment; loopback ports; no production session. |
| Go controller | Root `go.mod` declares Go 1.22 | Run module commands at repository root. Use a compatible installed Go toolchain and the module lock. |
| Pipeline observability cross-language check | Separate `contracts/pipeline-observability/v1/go/go.mod` declares Go 1.24 and has its own `go.sum`; genuine compatible Go at `/usr/local/go/bin/go` | Verify the absolute executable before this selected check. Telemetry wire tests/generation separately require `go` and `gofmt` on `PATH`. |
| Native Worker NRI | `tools/native-worker-nri/go.mod` declares Go 1.26.5; C launcher; Linux cgroup v2 | Disposable host with explicit root/delegated-scope authority. This is a separate Go module. |
| Documentation API discovery | Helm 3.22.0; Go 1.26.3; root dependencies | Local render/parser route. The documentation workflow fixes these versions. They differ from runtime image tools. |
| Chart/release render tests | Helm 3.18.4 as selected by product CI; local chart inputs | No cluster credential is required for local render. A successful render does not prove storage or RBAC. |
| Redis/service reliability | Native nginx and source Redis; selected Redis binaries; Docker for extraction | Disposable service roots. CI supplies `ARCHVIEWER_TEST_NGINX`, `REDIS_SOURCE_SERVER`, and `REDIS_SERVER`. |
| Buster remote archive fixtures | GNU tar at `/usr/bin/tar`; launcher and selected fixture services | Check the absolute executable before remote runtime, restart, or real-provider fixtures. GNU tar elsewhere on `PATH` does not satisfy them. |
| Native local Registry | Original Distribution 3.0.0 executable in absolute `KUBECLAW_REGISTRY_BINARY` | Test owns a loopback server and temporary storage. No production registry is selected. |
| PostgreSQL transaction/native checks | Disposable PostgreSQL with the required extensions; the exact database variable of the selected test | Dedicated role/database. Never point a fault test at source production data. |
| Ops network-policy test | Python 3 with `venv`/`ensurepip`; isolated PyYAML 6.0.3; package-download access | Prepare and verify the pinned Python dependency before the policy command in the Ops MCP route. No system Python package installation. |
| Runtime image checks | Docker Buildx; pinned base access; scanner database network access | Registry read access where required. Publishing requires a different, write-enabled workflow. |
| Deployment/live checks | Named test cluster, kubectl, Helm, DNS, storage, controller leases, trust identities, service secrets | Namespace and identity must belong to the test. Use [installation](../use/install.md) and [service diagnosis](../use/diagnose.md) for preflight. |

Install the locked browser from repository root when your route needs it:

```sh
node node_modules/playwright/cli.js install --with-deps chromium
```

The `--with-deps` action can require host package authority. Run it on the
prepared disposable host. The Studio test runner uses port 4190 and can reuse
an existing server. Stop an unrelated listener before the test so that it does
not validate someone else's build.

Ops MCP and Ops Pod are not root workspaces. Install their separate lockfiles
before their tests:

```sh
npm ci --prefix tools/ops-mcp --ignore-scripts
npm ci --prefix ops/pod --ignore-scripts
```

The Prism spike packages also have independent lockfiles. If you select
`verify:prism:spikes`, prepare all four through the maintained bootstrap:

```sh
npm run bootstrap:prism:tests
```

That script reinstalls the root and four spike packages. Do not run it in a
shared checkout while another process uses the dependency tree.

A deployed Nova/Buster path can require Redis transport, exact Git source,
artifact and result stores, BuildKit and registry access, Tailscale exposure,
and a configured model route through LiteLLM. These are not prerequisites for
all unit tests. Find exact endpoints, secret sources, permissions, and failure
owners in [platform dependencies](../understand/platform-and-operations.md),
[communication](../understand/communication.md), and [security and
trust](../understand/security-and-trust.md). Do not infer readiness from an
environment variable being present.

> **Source evidence — separate environments**
>
> Claim: browser, service, Go, documentation, and separately locked package setup are distinct.
> Implementation: [Prism bootstrap](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/bootstrap-prism-tests.sh#L1-L8), [service binary extraction and output variables](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/prepare-reliability-services.sh#L1-L38), [separate package installs](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/remediation-native.yaml#L20-L37).
> Contract or setting: [NRI toolchain](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tools/native-worker-nri/go.mod#L1-L13), [root Go module](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/go.mod#L1-L3), [documentation tool versions](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/docs-checks.yaml#L20-L38), [Studio browser/port selection](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/studio/playwright.config.mjs#L1-L7).
> Test evidence: [native Registry fixture prerequisites](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/integration/registry-local-gc.test.mjs#L14-L45); not executed here.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: an installed tool or a rendered configuration does not prove external access.

## Repository ownership and build boundaries

Select the owner by the behavior that changes. Nova decides pipeline policy.
Worker Core executes one bounded attempt. Buster interprets test plans and
returns evidence. Prism owns design meaning. Foundation supplies shared
mechanisms. An observer can deliver facts but cannot decide pipeline state.
These boundaries prevent a specialist policy change from changing every worker.

| Source area | Responsibility and adjacent boundary | Build or generated boundary |
| --- | --- | --- |
| `skills/nova/core`, `skills/nova/project`, `skills/nova/pipeline.ts` | Lifecycle, scheduling, effects, run authority, project compilation, CLI | TypeScript source exports; project compilation produces run inputs, not a package build. |
| `skills/worker/core` | Attempt admission, cancellation, deadlines, resource and result mechanics | TypeScript source plus native launcher/runtime prerequisites. No pipeline scheduling. |
| `skills/buster/engine`, `skills/buster/runtime.ts` | Resolved test execution, providers, artifacts, reports, remote result production | Buster role assembly and provider identity must match the plan. Nova owns final import/decision. |
| `skills/prism` | Domain, renderer, corpus, engine, Control, Studio, Worker binding, Ingestion | Studio emits `dist-studio`; service entrypoints consume source and contract validators. |
| `skills/common/plugin-runtime/sdk` | Public plugin API and value helpers | Schema-generated `src/generated/contracts.ts`; compiled SDK has its own build config. |
| `skills/common/plugin-runtime/foundation` | Registry, configuration, package identity, artifact, isolation, observability mechanics | C isolation launcher and runtime contract assets. No specialist policy import. |
| `skills/common/plugins`, `skills/nova/plugins`, `skills/buster/plugins` | Registered adapters, observers, stages, providers, report adapters | Manifest `src/*.ts` registration; each plugin needs a TypeScript config. The aggregate plugin build emits temporary JavaScript and removes it. |
| `contracts/*` | Versioned schemas, validation, types, identity | Follow each contract's generator; never edit generated types/validators directly. |
| `packaging/runtime` | Package ownership and consuming role membership | Role bundles contain selected package bytes and immutable metadata. |
| `charts`, `my-values`, `gitops`, `releases` | Selected workload configuration and deployment selection | Chart render, generated version values, release values and GitOps bundles have separate authorities. |
| `cmd`, `tools/native-worker-nri` | Go controllers and node integration | Root Go module and independent NRI module. |
| `tools/ops-mcp`, `ops/pod` | Read-only MCP diagnostics and operator tool environment | Independent npm lockfiles and images. |
| `docs/site`, `scripts/docs-*`, `docs/config` | Reader explanations, generated references, ownership and publication | Authored prose remains separate from source-derived output. |

The enforced dependency directions are:

| Owner | May import these owners |
| --- | --- |
| shared | shared |
| Nova | shared, Nova |
| Worker | shared, Worker |
| Buster | shared, Worker, Buster |
| Prism | shared, Worker, Prism |

Use package exports for cross-package imports. Keep explicit `.ts`/`.mts`
extensions for relative source imports. TypeScript must be erasable: Node can
remove types without a separate compile step. Use `import type` for types under
`verbatimModuleSyntax`. All checked source configs extend `tsconfig.base.json`;
compiler-only `paths` and `baseUrl` aliases are rejected. Generated `dist`
files under skills/contracts must not be tracked.

Do not repair a forbidden dependency by copying an internal implementation.
Move a genuinely shared mechanism to its owner, expose the required contract,
and test both consumers. The historical reason for each local source split is
unknown unless a [decision record](../decisions/README.md) records it.
The present benefit is an inference: explicit ownership narrows policy and
release effects. The cost is coordinated contract and packaging work. Reassess
a boundary when a supported consumer needs behavior it cannot obtain through
its current contract; do not silently bypass the boundary.

> **Source evidence — ownership and source rules**
>
> Claim: package/import direction, role membership, erasable source, and generated-file rules are enforced separately.
> Implementation: [dependency checks](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/check-runtime-package-ownership.mjs#L68-L106), [TypeScript config and tracked-output checks](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/check-erasable-typescript.mjs#L7-L42), [source/manifest rules](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/check-erasable-typescript.mjs#L43-L95).
> Contract or setting: [owner directions](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/packaging/runtime/package-ownership.json#L54-L80), [compiler options](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tsconfig.base.json#L1-L16).
> Test evidence: [temporary plugin compilation](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/build-v2-plugins.mjs#L6-L43); not executed in this bounded local session.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: a dependency check does not prove that the installed runtime role contains a changed package.

### Generate and build in the right order

For a plugin-system contract change, update
`skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json`
first. Then run:

```sh
npm run plugin-system:sdk:generate
npm run plugin-system:sdk:check
npm run plugin-system:sdk:build
npm run plugin-system:plugins:build
npm run plugin-system:sandbox:build
```

The generator owns the SDK contract types and the finite transport/cache profile
constants. A hand edit to generated types can compile while disagreeing with
runtime admission. The build checks do not install or activate a plugin.
Use [the first plugin procedure](first-plugin.md) for registration, permission,
activation, observation, disablement, and removal.

For a Prism contract change, use its source schema and
`npm run generate:validators --prefix contracts/prism/v1` before consumers.
Its `test`, `typecheck`, and Studio prebuild hooks also generate validators.
Thus a command called a check can change generated files. Retain the diff and
verify that it is the expected generation; a zero exit does not prove the
checkout remained unchanged.

For telemetry, change the catalogue/schema authority, then run
`node scripts/generate-telemetry-contracts.mjs` followed by the same command
with `--check`. It requires `gofmt` even in check mode. For central versions,
use [the version procedure below](#versions-and-release-selection).

> **Source evidence — code generation**
>
> Claim: generated source has a specific authority and order; some check hooks regenerate it.
> Implementation: [SDK generation and byte comparison](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/generate-plugin-sdk-types.mjs#L1-L33), [telemetry check/write boundary](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/generate-telemetry-contracts.mjs#L9-L39).
> Contract or setting: [Prism hooks](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/contracts/prism/v1/package.json#L1-L22), [root build scripts](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L153-L174).
> Test evidence: source inspection; generator/build sequence not executed here.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: generation proves agreement of representations, not compatible interpretation by old consumers.

## Select the smallest complete check chain

A small check chain must cover every changed invariant. It is not necessarily
one script. Use these six questions to select it:

1. Which local rule changes? Add a positive and a negative unit assertion.
2. Which producer/consumer boundary can change? Run its contract and type checks.
3. Which committed record can be replayed? Check live execution against replay.
4. Where can a crash, cancellation, or uncertain external effect occur? Check
   recovery from that exact durable boundary.
5. Which earlier bytes, identities, or consumers remain supported? Run the
   applicable compatibility fixtures and generated-output checks.
6. Which reader procedure, reference, error explanation, or release input changes?
   Update its canonical page and run its documentation checks.

An in-memory unit test does not exercise locks, process death, native authority,
transport authentication, or a real service. Add the next layer only when the
change reaches that layer. A missing environment remains an unexecuted required
check. A skip is not a successful negative proof.

| Evidence class | What it can establish | What it cannot establish |
| --- | --- | --- |
| Source | Current rules and declared inputs | Successful execution |
| Unit | Local function behavior | Real service, transport, or deployment |
| Contract | Shape and semantic boundary agreement | Installed package or credential authority |
| Replay/recovery | Retained bytes produce the expected state after interruption | Live cluster behavior outside the fixture |
| Render | Selected templates produce the expected workload objects | Admission, storage persistence, or RBAC enforcement |
| Target image | Exact built image contains and runs selected tools | Its deployed credentials, mounts, and network |
| Deployment | Installed objects and service path in the test cluster | Every production environment |
| Live | The named real dependency path and fault behavior | A universal availability or recovery guarantee |

Before each edit, record revision, environment, selected commands, baseline,
and stop conditions. After the edit, retain exit codes, nonzero failures,
skips, test counts, identity-bearing output, and generated diffs. Remove only
the fixture's temporary directories/processes. Do not delete journals, lock
inodes, result records, or remote effects to make a check pass. See
[extension testing](testing.md) for effect identity, activation, and remaining
state requirements.

The aggregate `verify:product`, `verify:contracts`, `verify:plugin-system-v2`,
`verify:prism`, and `docs:check` scripts are not universal starting commands.
They include native launchers, delegated cgroups, browser/service prerequisites,
role packaging, generators, or unrelated families. Inspect their script bodies
and prepare those environments before choosing them as an integration gate.
In particular, `verify:plugin-system-v2` requires
`KUBECLAW_TEST_CGROUP_ROOT` to name a delegated cgroup-v2 subtree.

> **Source evidence — aggregate check limits**
>
> Claim: broad gates have prerequisites and side effects beyond a unit test.
> Implementation: [runtime aggregate](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L258-L265), [reliability group prerequisite checks](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/reliability-tests.mjs#L9-L48).
> Contract or setting: [accounted native CI scope](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L102-L118).
> Test evidence: the bounded lifecycle/recovery run failed locally at GNU-lock acquisition; the contract-only lifecycle script passed.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: source inspection and a failed prerequisite do not establish recovery success.

## Run Lint for a selected source change

Owner: Lint maintainers. Use [Lint policy](../reference/lint-policy.md) for
selected rules, tools, severity, baselines and waivers, and [Extend Lint](lint.md)
for a rule/tool/target/pack change. A contributor check is an engine report;
the Nova stage owns its pipeline interpretation. Run these package checks from
repository root:

```sh
npm run build --prefix skills/nova/plugins/lint
npm run test:focused --prefix skills/nova/plugins/lint
npm run test:live --prefix skills/nova/plugins/lint
```

The live-function test requires real shellcheck, shfmt, GNU locks and its
selected tools/configuration. Prepare the target-image route in the Lint guide
when the source host lacks those tools. Do not let a missing analyzer look like
a clean source result. Serialize acceptance-relevant reports while the shared
discovery/cache isolation limit remains open.

To lint the checked-out workspace with the canonical policy, after preparing
its selected analyzer and Kubernetes-schema dependencies, run:

```sh
npm run lint:report -- --working-directory . --policy charts/kubeclaw/files/config/lint-policy.json --policy-project workspace --tier full --helm-chart charts/kubeclaw --include-debt --include-experimental --output artifacts/lint-report.json
```

Exit 0 means no operational tool failure or blocking finding. Exit 1 means an
operational failure; retain stderr and any written report. Exit 2 means invalid
CLI input with no report. Exit 3 means a validated report has blocking findings.
The runner's JSON `ok` field alone does not prove a passing lint result.
Inspect per-tool status, policy/config identity, debt, experimental findings,
and error evidence before changing source or a baseline. Remove only the owned
report after retaining its digest. This engine command does not prove stage
activation, runtime grants, or deployed policy-pack delivery. Follow the Lint
guide's known deployment boundary rather than inventing a Nova-pod invocation.

> **Source evidence — Lint check and exit contract**
>
> Claim: focused, live, and report paths have distinct prerequisites and outcomes.
> Implementation: [package check sequence](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/nova/plugins/lint/package.json#L1-L16), [report CLI inputs](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/run-lint-report.mjs#L8-L28), [validated report and exit selection](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/run-lint-report.mjs#L110-L145).
> Contract or setting: the linked Lint policy/extension guides own policy and deployment limits.
> Test evidence: source inspection; analyzer/report/live route not executed here.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: an engine report is not a deployed stage or authorization proof.

## Change Nova lifecycle, scheduling, or run authority

Owner: Nova Core maintainers. The entrypoints are `skills/nova/pipeline.ts` and
`skills/nova/core/cli.ts`; `skills/nova/core/src/index.ts` exposes the Core
library. Start with [Nova's mechanism](../understand/nova-core.md), then inspect
`lifecycle/reducer.ts`, `execution/run-decisions.ts`,
`lifecycle/recovery-state.ts`, and the durable journal owner for a lifecycle
change. Scheduling belongs to the execution graph/engine. Project graph
construction belongs to `skills/nova/project/compiler.ts`.

The reducer accepts results only from `running`. It consumes an attempt,
requires a reason for every outcome except `passed`, and selects a bounded
next action. The recorder commits the resulting stage event. Recovery folds
committed events and completed-attempt results; interrupted `running` states
return to `pending`. Do not add a live-only outcome that replay cannot derive.
Do not change event names or schema versions for an internal diagnostic reason.

For an internal lifecycle reason change, run this complete local chain after
adding tests that assert its precise trigger and unchanged neighboring cases:

```sh
npm run typecheck --prefix skills/nova
node tests/verification/contracts/check-plugin-system-v2-lifecycle.mjs
node --test tests/verification/reliability/lifecycle.test.mts tests/verification/reliability/decisions-and-snapshots.test.mts
node --test tests/verification/reliability/project-recovery-version.test.mjs tests/verification/reliability/source-snapshot-version.test.mjs
npm run plugin-system:sdk:check
npm run verify:runtime-packaging:ownership
npm run docs:core-guides:check
npm run docs:governance:check
npm run docs:check:refs
npm run docs:publication:check
```

The first checks typing and local lifecycle rules. The journal tests cover
repair scheduling, snapshots, and process-death recovery. Version fixtures
cover retained source/graph interpretation. The SDK check must leave the
unchanged external contract generation intact. Add a targeted new assertion
for the changed diagnostic; existing tests do not automatically cover it.
The last checks protect the affected explanation, ownership, links, and output.

For a graph/compiler change, add
`node tests/verification/contracts/check-project-compiler.mts` and
`node --test tests/skills/nova/project_setup/progress-scaffold.test.mjs`.
Before a remote result/import or restart change, complete the
[absolute GNU tar preflight](#prepare-buster-remote-archive-fixtures) and prepare
the launcher and remote-plan fixture environment. Then add
`npm run verify:test-gate:remote-import` and
`node tests/verification/contracts/check-pipeline-remote-process-restart.mts`. For an
external-effect change, add
`node --test tests/verification/reliability/external-effect-recovery.test.mts`.
A dispatch response loss requires receipt reconciliation, not a fresh effect ID.

Use [the run procedure](../use/operate.md) for start, signal, audit, and bounded
recovery commands; it defines the actual project/platform/run inputs. Use
[diagnosis](../use/diagnose.md) for logs and journal evidence. Core has no
independent service start script. For a local CLI debug session, Node's `--inspect` can precede the
same `.ts` entrypoint and arguments; keep the debug listener on loopback. An
attached debugger can alter timeouts, so it cannot supply timing evidence.

> **Source evidence — lifecycle and restart**
>
> Claim: live result handling and replay must preserve the same bounded lifecycle decision.
> Implementation: [result guard and accounting](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/nova/core/lifecycle/reducer.ts#L96-L136), [decision recording and administrative stop](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/nova/core/execution/run-decisions.ts#L29-L60), [terminal event payload](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/nova/core/execution/run-decisions.ts#L103-L129).
> Contract or setting: [completed-attempt replay](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/nova/core/lifecycle/recovery-state.ts#L39-L69), [interrupted state reset](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/nova/core/lifecycle/recovery-state.ts#L153-L180).
> Test evidence: the Nova type check and source-snapshot compatibility fixture passed locally. [Process-death fixture](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/reliability/lifecycle.test.mts#L61-L81), [old/current graph recovery](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/reliability/project-recovery-version.test.mjs#L14-L34). Local recovery execution failed on the unavailable GNU-lock contract.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: this fixture proves only its registered journal boundary when executed; it is not a deployed restart proof.

### Practice a bounded lifecycle change and removal

The [Nova lifecycle exercise](examples/platform-change-nova-lifecycle.json)
contains desired behavior, invalid input, interruption, and removal conditions.
It is task input, not a run result. Use a separate scratch checkout at the
selected revision. Find ownership and the check chain from this handbook.
Capture the unchanged baseline before editing. Add the temporary behavior and
its tests in that scratch checkout only.

Keep existing schema/type generation and identity encoding unchanged. Reject
the invalid transition before it can append an event. Persist the new reason
only for the defined administrative retry case; preserve the original stage
result and other administrative reasons. After a crash at the named durable
boundary, inspect both journal bytes and recovered state. A reason in a durable
event is not automatically a field in the recovered stage projection.

Run the complete Nova chain and the new assertions. Record the reason, stage
status, attempt counters, journal identity, schema/graph identities, and every
failure or skip. Then remove the temporary source/test changes. Compare
tracked files and generated output with the original baseline and rerun the
selected checks. Retain logs outside the scratch tree before deleting it.
No successful exercise is claimed by the presence of this file or handbook.

## Change Worker Core or native execution

Owner: Worker Core maintainers. `skills/worker/core/src/index.ts` exposes attempt
execution; the module does not schedule a pipeline or decide quality. Read
[Worker Core](../understand/worker-core.md) before changing claims, deadlines,
process control, ownership, result sealing, or resource accounting.

For generic attempt behavior, run:

```sh
npm run verify:worker-core:contracts
npm run verify:worker-core:attempt-executor
npm run verify:worker-core:local-runtime
npm run verify:worker-core:role-surfaces
npm run verify:runtime-packaging:ownership
```

Add the native chain when the change touches launch, cgroups, ownership,
observation, or host recovery:

```sh
npm run verify:worker-core:node-pools
npm run verify:worker-core:native-runtime
npm run verify:worker-core:native-scope
```

These require Linux, the named native launchers, an accounted/delegated cgroup
scope, and the NRI Go module toolchain. The native scope command is a live-host
check. Before execution, identify the fixture's scope and privilege requirements;
never use a production node as a disposable process-kill fixture. For trust
changes, run `npm run verify:worker-core:trust` and use
`npm run verify:worker-core:trust:live` only in the registered cluster.

Test rejection before launch, cancellation propagation, deadline expiry,
cleanup failure, crash after ownership commit, restart adoption, and admission
fencing while authority is uncertain. Keep generic envelope/schema identity
separate from Buster or Prism request meaning. Update the Worker architecture,
profile reference, and recovery procedure; run `docs:core-guides:check` and the
common documentation chain above.

Worker Core is a library, not a separately started developer daemon. Its
specialist host supplies configuration. Stop admission before replacing native
code. Preserve ownership, journal, and spool records until the owning process
has reconciled them; deleting them can remove the only proof that an attempt
still exists.

> **Source evidence — Worker route**
>
> Claim: contract/local checks and native/role/trust checks protect different boundaries.
> Implementation: [maintained Worker commands](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L153-L166), [NRI/native command](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L288-L295).
> Contract or setting: [Worker ownership statement](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/worker/core/BOUNDARIES.md#L1-L5), [native CI authority](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L102-L118).
> Test evidence: commands inspected; native host checks not executed here.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: a local attempt test cannot establish native process authority or cluster trust.

## Change Buster plans, providers, or result import

Owner: Buster maintainers for execution; Nova maintainers for final import.
`skills/buster/engine/remote-plan-cli.ts` and `skills/buster/runtime.ts` compose
the engine. Start a real runtime only through the documented
[Buster workflow](../use/workflows/buster-suite.md). Use
[Develop Buster Core](platform/buster.md) for wire, engine, capability, signing,
and namespace-controller changes. Use [Extend Buster](buster.md) for a provider,
fixture, suite, or report adapter.

For resolver/provider identity changes, run:

```sh
npm run verify:test-gate:contracts
npm run verify:test-gate:provider-registry
npm run verify:test-gate:report-adapter-registry
npm run verify:test-gate:suite-resolver
npm run verify:test-gate:plan-runner
```

Prepare the C launcher before `plan-runner`. Add the changed package's `npm
test --prefix` command from its package guide. A provider invocation test is
not enough for a report change: check the report adapter and imported decision.
Before remote wire/result changes, complete the absolute archive preflight
below and prepare the launcher/services. Then add
`verify:test-gate:remote-plan`, `verify:test-gate:remote-runtime`, and
`verify:test-gate:remote-import`.
For restart/uncertain result handling and the actual isolated provider path,
use the commands below only after this preflight.

### Prepare Buster remote archive fixtures

The remote-runtime, restart, and real-provider fixtures consume GNU tar at
`/usr/bin/tar`. From repository root, check that exact executable before
selecting those routes:

```sh
set -eu
test -x /usr/bin/tar
/usr/bin/tar --version
```

The version output must identify GNU tar. Stop on a missing executable or a
different implementation. The development environment owner must prepare the
real tool at the required path before the fixture can run. GNU tar elsewhere
on `PATH` is insufficient; do not insert a wrapper or change the fixture to
hide this prerequisite. Generic role-bundle scripts select `tar` through
`PATH`, so their earlier `tar --version` check remains a separate requirement.

After the absolute check, launcher, and selected services are ready, run the
changed remote route and its relevant interruption/provider fixture:

```sh
set -eu
node tests/verification/contracts/check-pipeline-remote-process-restart.mts
node tests/verification/contracts/check-pipeline-remote-real-provider.mts
```

Retain the executable version and actual fixture exit/output. A failed archive
prerequisite does not test remote recovery. Remove only the fixture-owned
processes and temporary archive/state after retaining their evidence.

> **Source evidence — fixed remote archive executable**
>
> Claim: these remote fixtures require the absolute tar path; generic bundle scripts use PATH selection.
> Implementation: [remote archive creation](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/contracts/check-pipeline-remote-plan-runtime.mts#L43-L51), [restart tar configuration](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/contracts/check-pipeline-remote-process-restart.mts#L169-L180), [real-provider tar configuration](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/contracts/check-pipeline-remote-real-provider.mts#L108-L119).
> Contract or setting: [generic bundle tar selection](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/package-agent-skill-bundle.sh#L27-L44).
> Test evidence: source inspection; absolute tar is unavailable in the bounded local environment, so these routes remain unexecuted.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: archive-tool readiness does not establish restart, isolated provider, or deployed runtime behavior.

Check duplicate request, mismatched source/provider/schema digest, incomplete
required report, cancellation, restart, and response loss. Retain resolved
plan, source identity, evidence, result signature/record, and import decision.
For BuildKit, Registry, Kubernetes, browser, scanner, or Tailscale provider
changes, the [suite guide](../reference/buster-suites.md) defines the additional
local/production route and service prerequisites. Do not replace those checks
with an unrelated provider's success. Update suite/config/error guides and run
`npm run docs:buster-guides:check` plus the common documentation chain.

> **Source evidence — Buster chain**
>
> Claim: provider resolution, plan execution, remote transport, and result import have separate checks.
> Implementation: [resolver and remote check scripts](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L72-L88).
> Contract or setting: [Buster ownership statement](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/buster/engine/BOUNDARIES.md#L1-L5), [engine dependencies and entrypoint](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/buster/engine/package.json#L1-L26).
> Test evidence: scripts inspected; complete provider/remote chain not executed here.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: provider facts cannot approve their own pipeline gate.

## Change Prism contracts, services, data, or engine

Owner: Prism maintainers. Use [Extend Prism safely](platform/prism.md) for the
specific contract/domain/renderer/corpus/engine/Control/Worker boundary. The
package provides `typecheck`, `test:domain`, `test:renderer`, `test:storage`,
`test:engine`, `test:corpus`, `test:quality`, and `test:pipeline`. Run the one that
owns the change, `npm run typecheck --prefix skills/prism`, and
`npm run verify:prism:contracts`. Add adjacent consumer tests when the shape or
meaning crosses their boundary.

For a storage transaction, also run
`node tests/verification/contracts/check-prism-postgres-transactions.mts`
with `KUBECLAW_PRISM_TRANSACTION_TEST_DATABASE` naming a disposable PostgreSQL
database. PGlite/in-memory success cannot prove real PostgreSQL transaction
ownership. For native Worker binding, add `verify:prism:native-dispatch` and
`verify:prism:native-worker` with their native authority prepared. For chart or
runtime entrypoint changes, add `verify:prism:helm`,
`verify:prism:runtime-role`, and `verify:prism:images`. Live service/recovery
checks use the named cluster/provider routes; they remain separate from
`verify:prism:repository`.

The service commands below run from repository root after configuration:

| Service | Exact start command | Required starting state and observation |
| --- | --- | --- |
| Control | `npm run start:control --prefix skills/prism` | PostgreSQL `DATABASE_URL`; session, ingress, ingestion and dispatch/Worker trust configuration. Observe its configured port and application route, not process survival alone. |
| Studio server | `npm run build:studio --prefix skills/prism`, then `npm run start:studio --prefix skills/prism` | Built `dist-studio`; reachable `PRISM_CONTROL_URL`; matching ingress secret. Check the browser-to-Control path. |
| Native Worker | `npm run start:worker --prefix skills/prism` | Root/native supervisor authority, root-owned launcher, writable accounted scope, durable ownership/journal roots, specialist trust configuration. Startup reconciles ownership before listening. |

These listeners bind `0.0.0.0`. Run them only in the isolated service environment
with explicit ports and access restrictions. Use [Prism Studio
operation](../use/prism-studio.md) for exact credential creation, deployment,
health, and cleanup. Do not start Worker without native prerequisites or add an
in-process production fallback. Retain stderr, service identities, document
revision, operation/job IDs, and durable failure evidence. Use loopback Node
inspection only for local debugging. Stop your own listeners through their
signal path and confirm exit before removing disposable stores.

Update the affected Prism architecture/operator guide and run
`npm run docs:prism-guides:check` plus the common documentation chain.
A new API or stored field also needs contract compatibility and upgrade/rollback
rules; a successful fresh-database test does not cover old stored data.

> **Source evidence — Prism startup and selection**
>
> Claim: component tests and real services have distinct entrypoints and configuration.
> Implementation: [package commands](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/package.json#L1-L44), [Control listener](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/server/control.ts#L1-L9), [native Worker startup](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/server/worker.ts#L12-L36).
> Contract or setting: [Control secrets/trust/endpoints](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/server/control-config.ts#L22-L59), [Studio configuration](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/server/studio-config.ts#L1-L18), [native transaction CI fixture](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L196-L223).
> Test evidence: source inspection; these service/native chains not executed here.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: service startup does not prove design publication, provider fidelity, or independent human acceptance.

## Change Registry storage or package discovery

The word Registry names two different boundaries. Foundation's plugin registry
owns discovery/admission/activation. An OCI image registry stores manifests and
blobs. Select the correct owner before testing.

For plugin registry changes, run:

```sh
node tests/verification/contracts/check-plugin-system-v2-registry.mjs
node tests/verification/contracts/check-plugin-system-v2-import-safety.mjs
node tests/verification/contracts/check-plugin-system-v2-installation.mjs
npm run verify:runtime-packaging:ownership
```

Prepare the sandbox and host prerequisites for installation checks. Preserve
inert discovery: reading a manifest must not run untrusted plugin code. Test
unknown registration, wrong identity, undeclared capability, changed bytes under
an existing digest, activation denial, replacement, and removal with retained
state. Add checkpoint/recovery fixtures when registry state can survive a
restart. Use [Plugin Runtime](../understand/plugin-runtime.md) and the changed
[package guide](plugin-catalogue/README.md); run `docs:core-guides:check` and the
common documentation chain.

For local OCI Registry storage changes, use:

```sh
npm run verify:registry-local:storage
npm run verify:registry-local:native
```

The first checks selected manifests/storage configuration. The second starts
original Distribution 3.0.0 with temporary local storage, writes blobs/manifests,
checks restart and garbage collection, and shuts down its server. Supply the
absolute native binary through `KUBECLAW_REGISTRY_BINARY`. A render alone
cannot prove digest retention. A pull-through mirror is a different service
from a writable build registry. Use [platform operations](../understand/platform-and-operations.md)
and [data ownership](../understand/data-and-state.md) for that distinction.
Do not run garbage collection on a live writer or discard referenced rollback
images. Test an unavailable exact image digest rather than substituting a tag.

> **Source evidence — Registry distinction**
>
> Claim: native OCI retention tests are separate from plugin registry validation.
> Implementation: [maintained OCI checks](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L288-L289), [original registry start and storage](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/integration/registry-local-gc.test.mjs#L14-L51).
> Contract or setting: [manifest retention, offline GC and restart checks](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/integration/registry-local-gc.test.mjs#L67-L87).
> Test evidence: plugin registry contract passed locally; OCI native checks not executed here.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: the native fixture does not certify a production registry, its authentication, or its backup path.

## Change SDK or shared contracts

Owner: plugin Foundation/SDK maintainers. Consumers use the public package
entrypoints `@kubeclaw/plugin-sdk` and `@kubeclaw/plugin-sdk/testing`. Do not
import Foundation internals from a plugin to bypass the public contract.
Use [extension contracts](contracts.md) for the meaning of stage, observer,
adapter, provider, and report boundaries.

For a helper/type/portable-value change, run:

```sh
npm run plugin-system:sdk:check
npm run plugin-system:sdk:build
npm test --workspace @kubeclaw/plugin-sdk
npm run verify:sdk:local
npm run verify:runtime-packaging:ownership
```

The local SDK aggregate covers portable JSON, effect/dependency/source identity,
historical repair producers, and delivery-manifest compiler/durability/cancel
boundaries. It requires GNU locks and Git for its retained-state fixtures.
Select additional changed-consumer package tests. For a generated type, change
its canonical schema first and follow the generation order above. For an
external wire contract, test old producer/new consumer and new producer/old
consumer where support is declared; do not assume optional fields are compatible
with a closed `additionalProperties: false` schema.

Preserve exact digest encoding/version for retained values. A runtime identity
change is not a package patch merely because types compile. Add historical
fixture bytes and an explicit translation or safe rejection rule before release.
Update the API explanation, contract/example pages, generated references, and
common documentation checks. This handbook routes SDK work; it does not replace
a complete API export reference.

> **Source evidence — SDK boundary**
>
> Claim: public/testing exports, schema generation, and historical compatibility are separate responsibilities.
> Implementation: [SDK package exports](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/common/plugin-runtime/sdk/package.json#L1-L16), [local compatibility command](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L290-L290).
> Contract or setting: [schema generator](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/generate-plugin-sdk-types.mjs#L1-L33).
> Test evidence: the SDK value helper test passed. Portable JSON consumer tests were attempted and failed at GNU-lock acquisition; no portable-consumer PASS is claimed.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: generated type freshness does not prove runtime compatibility or every public export's semantics.

## Change telemetry or derived views

Owner: telemetry and source-component maintainers. Read
[telemetry](../understand/telemetry.md) and
[data/state ownership](../understand/data-and-state.md). Decide whether the
change belongs to an authoritative source event, its envelope/payload contract,
observer delivery, durable store, projection, or UI reader. A projection must
not grant a capability or create a pipeline decision.

Before a contract/projection change, prepare `go` and `gofmt` on `PATH`, GNU
locks, and the changed store's fixture prerequisites. The telemetry wire test
invokes PATH-selected `go test`; its generator invokes PATH-selected `gofmt`.
From repository root, verify the selected Go installation before those commands:

```sh
set -eu
command -v go
command -v gofmt
go version
```

Stop if either executable is missing or the selected toolchain cannot compile
the tested representations. The development environment owner must provide the
real Go tools; parser-only documentation setup does not prove contract execution.
Then run the changed contract/projection chain:

```sh
set -eu
node scripts/generate-telemetry-contracts.mjs --check
node --test contracts/telemetry/v1/tests/contracts.test.mjs
npm test --prefix skills/common/plugins/telemetry-observer
npm test --prefix skills/common/plugins/telemetry-store
node --test tests/verification/integration/telemetry-store-projection.test.mts tests/verification/reliability/observability-replay.test.mjs
```

Pipeline observability uses a separate Go module in
`contracts/pipeline-observability/v1/go`. Its `go.mod` declares Go 1.24 and its
own `go.sum` pins the canonical-JSON dependency. Preserve that lockfile; the
root and NRI Go modules do not replace it. The cross-language check invokes
`/usr/local/go/bin/go` for fixture execution and module-cache cleanup, not the
PATH-selected Go command. Prepare a genuine toolchain at that absolute path
that supports the declared module version and access to its locked dependency
through the selected Go download configuration. The check uses fresh temporary
module/build caches, so an unrelated populated host cache is not proof of access.

Before the cross-language/reconciliation chain, run from repository root:

```sh
set -eu
test -x /usr/local/go/bin/go
/usr/local/go/bin/go version
/usr/local/go/bin/go -C contracts/pipeline-observability/v1/go env GOMOD
```

The version must support the module's Go 1.24 declaration. The final output
must identify this checkout's `contracts/pipeline-observability/v1/go/go.mod`.
Stop if the absolute program is absent, its toolchain is incompatible, or its
locked dependency cannot be obtained. The environment owner must prepare the
qualified host; changing `PATH` or inserting a wrapper does not satisfy this
fixed executable boundary. Then add:

```sh
node tests/verification/contracts/check-pipeline-observability-contracts.mts
node tests/verification/contracts/check-pipeline-observability-durable-delivery.mts
node tests/verification/contracts/check-pipeline-observability-durable-attempts.mts
node tests/verification/contracts/check-pipeline-observability-nova-reconciliation.mts
node tests/verification/contracts/check-pipeline-observability-clawdeck-view.mts
```

Check duplicate delivery, ordering, wrong correlation, store limits,
backpressure, redaction, interrupted delivery, restart checkpoints, and retained
readers. Change source and projection compatibility together. Test a missing
observation as unknown/unavailable, not as success. Update event/store/error
references, telemetry explanations, and the consuming UI guide. Run
`docs:platform-specialist-guides:check` and the common documentation chain.
Stop only the fixture-owned delivery process; retain its authoritative journal
and checkpoint before removing temporary projections.

> **Source evidence — telemetry generation and reconciliation**
>
> Claim: generated representations are byte-checked and pipeline reconciliation has distinct durability/reader checks.
> Implementation: [gofmt and byte drift behavior](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/generate-telemetry-contracts.mjs#L9-L39), [reconciliation check chain](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L84-L84).
> Contract or setting: [contract generator assertions and PATH Go invocation](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/contracts/telemetry/v1/tests/contracts.test.mjs#L130-L150), [separate Go module](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/contracts/pipeline-observability/v1/go/go.mod#L1-L5), [dependency lock](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/contracts/pipeline-observability/v1/go/go.sum#L1-L2), [absolute Go invocation and cache cleanup](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/contracts/check-pipeline-observability-contracts.mts#L45-L52).
> Test evidence: source inspection; telemetry generator/store/native chain not executed here.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: stored events do not alone prove complete end-to-end observability.

## Change Charts or GitOps

Owner: platform deployment maintainers. Edit selected KubeClaw values/templates
and their consumers. For general Kubernetes semantics, use the upstream
[API reference](https://kubernetes.io/docs/reference/kubernetes-api/).
KubeClaw's supported fields, conditional branches, omitted/default selections,
PVC lifetimes, permissions, and recovery effects belong in its own
[configuration reference](../reference/configuration-precedence.md).

For role-chart or persistent-workload changes, run:

```sh
node tests/verification/deployment/check-role-chart.mjs
node tests/verification/deployment/check-deployment-truth.mjs
helm lint charts/kubeclaw -f my-values/buster-values.yaml -f tests/fixtures/helm/runtime-registry.yaml
helm template agent-buster charts/kubeclaw -f my-values/buster-values.yaml -f tests/fixtures/helm/runtime-registry.yaml > /tmp/kubeclaw-buster-rendered.yaml
```

Use a uniquely owned output path when retaining concurrent runs. Inspect
expected objects, selected image/bundle identities, PVCs, service accounts,
mounts, environment and conditional branches. Run additional profiles that
activate each branch changed by the patch. Check empty/omitted values when they
select a cluster default. Do not convert an omitted storage class into a claim
about a specific storage backend without cluster evidence.

For release selection/Argo routing, run:

```sh
node --test tests/verification/deployment/gitops-continuous.test.mjs tests/verification/deployment/gitops-release.test.mjs tests/verification/deployment/code-release.test.mjs
node --test tests/verification/deployment/release-configuration.test.mjs tests/verification/deployment/deployment-release.test.mjs
npm run versions:check
```

These checks validate selection/export behavior and identities. They do not
synchronize a cluster. Before live rollout, use
[maintenance](../use/maintenance.md) to check retained old images/bundles,
backup, credential access, resource capacity, compatibility, and the irreversible
data boundary. After rollout, check process, service, dependency, and functional
readiness separately. Use [recovery](../use/recovery.md) for a safe stop on
uncertain state. Render success cannot establish network enforcement or restore.

Update install/configuration/maintenance pages and generated values through
their own generators. Run `docs:inventory:config:check`,
`docs:inventory:local-helm:check`, and the common documentation chain after
those generators are current. Remove only disposable render output. A GitOps
rollback selects a prior deployment; it does not delete retained PVCs or restore
database contents.

> **Source evidence — Chart and GitOps route**
>
> Claim: role rendering, selection checks, and live synchronization are different boundaries.
> Implementation: [CI role render](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L60-L79), [selection check chain](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/update-checks.yaml#L24-L52).
> Contract or setting: [rollback's preserved data/resource limit](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/rollback-runtime.yaml#L47-L64).
> Test evidence: source inspection; no render or cluster run is claimed here.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: local YAML/selection tests do not prove a live admission, restore, or rollout.

## Change Ops MCP

Owner: Ops MCP maintainers. The source entrypoint is
`tools/ops-mcp/src/server.mjs`; its package has independent dependencies. Run:

```sh
npm test --prefix tools/ops-mcp
```

The npm tests cover bearer authentication, HTTP, local startup, diagnostics,
Kubernetes reads, Hubble, and bootstrap. Read [Ops MCP](../understand/ops-mcp.md)
for tool semantics, namespaces, error interpretation, and deployment access.

For the network-policy test, prepare Python 3 with `venv` and `ensurepip` support,
and package-download access for pinned `PyYAML==6.0.3`. This Python dependency
is separate from both npm installations. CI installs the same pin; use an
isolated environment locally instead of installing into system Python.
Run the steps from repository root in the same prepared Bash session.
Each command block stops at the first nonzero exit:

1. Check Python and create a uniquely named disposable environment.

   ```sh
   set -eu
   python3 --version
   OPS_POLICY_VENV="$(mktemp -d /tmp/kubeclaw-ops-policy.XXXXXX)"
   printf '%s\n' "$OPS_POLICY_VENV"
   python3 -m venv "$OPS_POLICY_VENV"
   "$OPS_POLICY_VENV/bin/python" -m pip --version
   ```

   Python must report major 3. If environment or pip creation fails, the
   development environment owner must supply `venv`/`ensurepip` support before
   policy testing. Keep the exact allocated path for cleanup.

2. Install and verify the pinned dependency in that environment.

   ```sh
   set -eu
   "$OPS_POLICY_VENV/bin/python" -m pip install --no-cache-dir PyYAML==6.0.3
   "$OPS_POLICY_VENV/bin/python" -c 'import yaml; assert yaml.__version__ == "6.0.3"; print(yaml.__version__)'
   ```

   The verification must exit zero and print `6.0.3`. A download, import, or
   version failure is a prerequisite failure; it does not test policy meaning.

3. Run the actual policy assertions with this isolated Python interpreter.

   ```sh
   set -eu
   "$OPS_POLICY_VENV/bin/python" tools/ops-mcp/test/policy_contract_test.py
   ```

   Exit zero means the policy assertions passed. Retain Python/PyYAML versions,
   test output, and the real exit code. A nonzero exit remains failed; distinguish
   missing dependency from an assertion failure. Neither result proves live
   Cilium enforcement.

4. After the test has stopped and its evidence is retained, remove only the
   exact disposable environment allocated in step 1.

   ```sh
   set -eu
   rm -r -- "$OPS_POLICY_VENV"
   ```

   After a failed preparation, clean up only if step 1 allocated an environment.
   If the shell exited, set `OPS_POLICY_VENV` to the retained printed path in a
   new prepared shell before cleanup. The install disables pip download caching.
   Do not remove a different environment, repository data, or system packages.

> **Source evidence — policy test's Python dependency**
>
> Claim: the actual policy test imports PyYAML and CI selects version 6.0.3.
> Implementation: [policy imports and document reader](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tools/ops-mcp/test/policy_contract_test.py#L1-L12).
> Contract or setting: [validation dependency and command](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/build-ops-mcp.yaml#L69-L73), [publication dependency and command](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/build-ops-mcp.yaml#L162-L166).
> Test evidence: source inspection; the bounded local dependency diagnostic failed because `yaml` is absent. The isolated install and policy assertions have not executed here.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: source policy assertions and dependency setup cannot prove deployed network enforcement.

For a local diagnostic server, set `OPS_LOCAL_ONLY=1`, `HOST=127.0.0.1`, and an
explicit `PORT`. Supply exactly one of `OPS_MCP_BEARER_TOKEN_FILE` or
`OPS_MCP_BEARER_TOKEN`. The bearer must contain 32–512 URL-safe characters.
Then run `npm start --prefix tools/ops-mcp`. The bearer remains required on
loopback. Use a test-only credential; do not place it in a command transcript.
Configure a disposable Kubernetes API/token/CA route only if you need real reads.
The local test can list tools while Kubernetes credentials are unavailable;
`/healthz` does not establish that Kubernetes reads work.

For a tool change, preserve namespace/resource allowlists, byte/time limits,
redaction, failed-read semantics, and read-only authority. Add tests for wrong
bearer, wrong namespace, unavailable credential, pagination and truncated logs.
Do not add a generic shell or restart tool. For image changes, use
`bash tools/ops-mcp/test-image.sh "$OPS_TEST_IMAGE"` after setting
`OPS_TEST_IMAGE` to your built image identity. The image test is separate from
package tests; live RBAC/cluster reads still require the test deployment.

Keep stderr startup/diagnostic logs and failed-read output. Stop the owned
process and remove its test bearer file. Do not remove source Kubernetes
resources as MCP cleanup. Update the Ops page/endpoints/security inventory and
run `docs:platform-specialist-guides:check` plus common documentation checks.

> **Source evidence — MCP local and image boundary**
>
> Claim: bearer authentication stays required locally, while unavailable Kubernetes reads remain errors.
> Implementation: [listener configuration](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tools/ops-mcp/src/config.mjs#L1-L23), [authentication source/rotation](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tools/ops-mcp/src/authentication.mjs#L4-L38).
> Contract or setting: [Ops package scripts](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tools/ops-mcp/package.json#L1-L22), [CI package/image separation](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/build-ops-mcp.yaml#L62-L113).
> Test evidence: [local tool/read fixture](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tools/ops-mcp/test/local.test.mjs#L10-L51); the local attempt failed during child startup because its separate dependency @modelcontextprotocol/server was not installed; it did not establish a running MCP service.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: package or image success cannot prove live Kubernetes authorization.

## Change UI behavior

Owner: Prism Studio maintainers for the editor; Archviewer maintainers for the
read-only architecture view. A UI must preserve the source component's authority.
Studio submits typed domain operations with a base revision. It does not edit
the database directly or grant approval. Archviewer serves static architecture HTML from Nova's read-only mounted
output. It has no supported production publisher. A healthy server with a
missing document must not become a publication success.

For Studio, prepare the locked browser, then run:

```sh
npm run typecheck --prefix skills/prism
npm run test:domain --prefix skills/prism
npm run build:studio --prefix skills/prism
npm run test:studio --prefix skills/prism
npm run test:studio-remediation --prefix skills/prism
```

Use `npm run dev:studio --prefix skills/prism` for local editor development.
This runs the development Vite server, not the deployed Studio proxy. Test typed
operation mapping, stale revision/conflict, preview origin/isolation, pagination,
image decode, unavailable backend, keyboard use, and phone/tablet/desktop
layouts. Preserve user intent on conflict rather than overwriting a newer
revision. Add contract/storage tests if the change creates new writes.

For Archviewer, run
`node --test tests/verification/reliability/archviewer-native.test.mjs`
with `ARCHVIEWER_TEST_NGINX` naming the native nginx executable. Use
[Archviewer architecture](../understand/archviewer.md) for data sources,
configuration and diagnosis. For image/ingress changes, add the Archviewer
role-image check and deployment/network profile checks.
The native fixture needs OpenSSL as well as nginx for its test password file.
It proves authenticated static reads, not a deployed publication producer.
A missing production document remains the Nova/Archviewer owners' publisher
boundary; stop at 404 and require a supported writer-to-authenticated-read test.

Retain browser reports, screenshots for failing states, request/revision IDs,
and server logs. Stop only the test-owned Vite/nginx process and preserve the
source data. Update the UI's operator and extension guides; run the relevant
Prism or platform guide check and common documentation chain.

> **Source evidence — UI routes**
>
> Claim: Studio development, build, browser checks, and native Archviewer are separate routes.
> Implementation: [Studio scripts](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/package.json#L15-L36), [browser viewports and managed server](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/studio/playwright.config.mjs#L1-L7).
> Contract or setting: [static authenticated document route](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/docker/archviewer.nginx.conf#L1-L19), [native service group](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/reliability-tests.mjs#L11-L38).
> Test evidence: [actual nginx authentication and failure controls](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/reliability/archviewer-native.test.mjs#L10-L56); source inspection only, browser/nginx routes not executed here.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: client assertions do not approve design content or prove source-service completeness.

## Security and performance checks

Before changing an authority boundary, name the caller, controlled resource,
credential source, allowed operation, denial rule, persistence, and external
effect. A Nova grant, plugin capability, Buster runtime capability, and Kubernetes
RBAC permission are different namespaces. Use [capabilities](../reference/capabilities.md)
and [security/trust](../understand/security-and-trust.md) to trace their
translations. Never accept a requested capability as proof of an authorized
caller.

For plugin isolation/capability changes, prepare the C launcher and delegated
cgroup environment, then select
`node tests/verification/contracts/check-plugin-system-v2-capability-security.mjs`
and the changed isolation/installation fixtures. For Worker trust use its
source and live trust chains. For a security provider, use its package test and
real scanner/advisory database; the security CI job deliberately downloads real
Trivy databases. For an image, use `npm run scan:images -- "$SECURITY_TEST_IMAGE"`
where `SECURITY_TEST_IMAGE` is the exact digest-pinned image under test. Keep
scanner failure, unavailable database, and detected vulnerability separate.
A failed scan is not an empty finding set.

For a journal performance change, run `npm run verify:nova-journal-scale` on the
prepared Linux/GNU-lock host. Its default load is 16 MiB; accepted
`NOVA_JOURNAL_SCALE_MIB` values are integers from 1 to 512. The fixture measures
replay and steady append, checks append below 5,000 ms, verifies peer tail
refresh, and removes its temporary root. That coarse ceiling is not a platform
latency objective. Capture CPU/memory/disk, journal size, concurrency, tool
versions, cold/warm cache state, exact revision and elapsed values. Compare
baseline and changed revision under the same conditions before attributing a
regression to the patch.

For browser performance or output-size budgets, use the changed `perf` or
`size-budget` suite from [Buster suites](../reference/buster-suites.md). For
resource accounting, use the Worker native scope/observation chain. For Prism
capture memory retention, use
the command below with the locked Chromium executable, its Linux libraries,
and a predeclared positive byte budget. Set `RETENTION_BUDGET_BYTES` to the
acceptance limit recorded for this change before the run. Do not choose it
after observing the result.

```sh
npm run test:engine:native-retention --prefix skills/prism -- --max-retained-growth-bytes="$RETENTION_BUDGET_BYTES"
```

The package command enables explicit garbage collection. It checks three
measurement windows and bounded parent retention, not child RSS or Control
restart. Do not infer a capacity guarantee from a single unit
fixture. Keep overload/backpressure, abort/cleanup, invalid input, and repeated
or concurrent requests in the change-specific proof. Retain failed budgets;
change a budget only with a recorded requirement and comparable evidence.

> **Source evidence — security and scale limits**
>
> Claim: scanner data and journal scale checks require real dependencies and have bounded proof.
> Implementation: [real security database setup](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L174-L194), [journal load, timing and cleanup](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/contracts/check-nova-journal-scale.mts#L7-L37).
> Contract or setting: [required predeclared retention budget](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/integration/engine-capture-retention.mts#L10-L29), [retention measurement and limit](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/integration/engine-capture-retention.mts#L98-L136), [native Worker and Prism performance commands](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/package.json#L32-L37).
> Test evidence: the journal scale attempt failed before measurement because GNU `flock` was unavailable. No timing result or benchmark PASS is claimed.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: one fixture and one environment cannot establish production capacity or security enforcement.

## CI triggers, authority, and failure handling

A workflow being present does not prove that repository branch protection marks
its job required. That server setting is outside this checkout. Confirm the
current required checks with the repository maintainer before merging. The
following table describes the workflow's own triggers and dependencies.

| Workflow | Trigger and role | Environment, result, and release consequence |
| --- | --- | --- |
| [pipeline-reliability.yaml](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L1-L59) | Pull request; reusable call from main image build | Core 25 min; four reliability shards 15 min; native 10 min; services 15 min; browser/security 20 min; PostgreSQL 10 min. Failed steps fail jobs even when later independent checks continue. No publication credential. |
| [role-images.yaml](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/role-images.yaml#L1-L59) | Pull request/manual; detects image-input change | Conditional ten-image matrix, 60 min; builds without push and checks built artifacts. A skipped image job supplies no image proof. |
| [update-checks.yaml](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/update-checks.yaml#L1-L59) | Pull request/reusable | Version/receipt/GitOps/policy checks, actual Envoy and upstream metadata/checksum checks. Upstream-checksums has a declared 20-minute timeout; policy and envoy have no declared job timeout and use the runner/platform limit. Docker, Helm, Python and network prerequisites. Used as a dependency of main runtime builds. |
| [docs-checks.yaml](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/docs-checks.yaml#L1-L59) | Pull request, main push, manual | Read-only authority for untrusted events; trusted main generation may commit allowed generated output. Node 24, Go 1.26.3, Helm 3.22.0. A stale generated tree fails validation. |
| [remediation-native.yaml](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/remediation-native.yaml#L1-L55) | Path-filtered pull request/reusable | Static 15 min, pinned-input selection 5 min, PostgreSQL 15 min, Studio 20 min, supervisor 15 min. Independently locked packages and native/browser checks; zero-skip requirements on selected paths. |
| [build-images.yaml](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/build-images.yaml#L1-L50) | Main push/manual | Reliability and update-policy must succeed; image-input detection controls build. Ten-image matrix, 60 min, GHCR write token. Stores image receipts; code-bundle releases are separately assembled. Optional leased-namespace Prism live job requires its enable variable and test secrets. |
| [build-ops-mcp.yaml](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/build-ops-mcp.yaml#L1-L50) | Path-filtered pull request/main push/manual | Untrusted validation builds/tests/scans without registry publication; trusted main publishes separate Ops images. Uses its own Node 22 test host and separate lockfiles; container Node is selected centrally. |
| [publish-image-receipts.yaml](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/publish-image-receipts.yaml#L1-L35) | Reusable trusted build call | Preserves exact image receipts as release assets beyond temporary CI artifact retention. |
| [promote-runtime.yaml](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/promote-runtime.yaml#L1-L59) | Manual family/source-run selection | Verifies successful main run, receipt and digest; scans; opens release-selection PR with GitHub App identity. Does not rebuild selected images. |
| [auto-promote-runtime.yaml](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/auto-promote-runtime.yaml#L1-L60) | Successful trusted workflow completion with GitOps enabled | Selects compatible images/code and creates production deployment selection. This is a write-authority path. |
| [rollback-runtime.yaml](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/rollback-runtime.yaml#L1-L60) | Manual prior deployment selection | Serialized preparation; opens rollback PR without image rebuild. Merge authorizes GitOps synchronization when configured. Data rollback is separate. |
| [dependency-updates.yaml](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/dependency-updates.yaml#L1-L56) | Scheduled/manual | 60 min; checksum-pinned Renovate and configured GitHub App. Proposes updates; it is not permission to bypass checks. |
| [release-security.yaml](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/release-security.yaml#L1-L43) | Daily/manual | 60 min; current advisory-data scan, retained reports, and an issue on failure. Does not silently replace a selected digest. |

Workflows with no declared `timeout-minutes` use the runner/platform limit; do
not invent a repository-specific shorter timeout. Matrix `fail-fast: false`
allows independent jobs to report together. It does not convert a failure into
success. Promotion/rollback concurrency uses `cancel-in-progress: false`;
Ops build concurrency can cancel superseded runs. There is no universal automatic
retry of failed product tests. Bounded package/network retries must not be
confused with lifecycle retry or an external effect replay.

CI secrets belong to their trust path. Runtime/Ops publication uses
`GITHUB_TOKEN` for packages. Promotion/updater paths use
`DEPENDENCY_APP_ID` and `DEPENDENCY_APP_PRIVATE_KEY` to create the write identity.
Optional Prism live checks use `PRISM_TEST_KUBECONFIG_B64` and `PRISM_E2E_USER`;
the client must not create arbitrary namespaces and must be able to create the
controller lease. Do not transfer these secrets to a local unit test.
Retain run ID/attempt, full source commit, job results, image digests, receipt
assets, bundle checksums, scans and failed logs. A missing artifact or a cancelled
run is missing proof, not a passed merge/release gate.

> **Source evidence — workflow authority**
>
> Claim: trigger, trust, conditional image build, and promotion are separate controls.
> Implementation: [image dependency/matrix selection](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/build-images.yaml#L1-L50), [optional live identity](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/build-images.yaml#L188-L224), [read-only documentation job](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/docs-checks.yaml#L1-L19).
> Contract or setting: [Ops event boundary](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/build-ops-mcp.yaml#L1-L50), [promotion source-run verification](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/promote-runtime.yaml#L1-L59), [daily scan failure tracking](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/release-security.yaml#L1-L43).
> Test evidence: workflow source inspection; [shard/native/service jobs](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L82-L137), [browser/security jobs](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L139-L194), [native PostgreSQL job](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L196-L223). No hosted CI or release run is claimed here.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: workflow source cannot establish branch-protection settings, available secrets, or actual job execution.

## Versions and release selection

`versions.json` owns selected tools, base images/digests, image-specific
overrides, infrastructure images/charts, and automation images. Package
lockfiles own npm dependency resolution. A contract schema version, package
version, source commit, image digest, code-bundle digest, and deployment commit
identify different things. Do not use one as proof of the others.

For a selected tool/base change:

1. Change `versions.json` and inspect every affected image/tool consumer.
2. Run `npm run versions:sync`. This updates generated versions and runtime
   tool locks; it is a write command and can need the updater's network inputs.
3. Run `npm run versions:check` and
   `node --test tests/verification/deployment/versions.test.mjs tests/verification/deployment/runtime-tool-locks.test.mjs`.
4. Run the changed component/image/native check. A version generator does not
   prove that the selected executable exists or works on both architectures.
5. Update compatibility, operator, and release explanations before proposing
   the change. Keep old identities available while recovery still references them.

A contract change needs a declared compatibility decision. Preserve supported
old schema versions and retained byte encodings, or add a new version with a
safe translation/rejection boundary. There is no universal command that proves
all schema/data version pairs. The owning component must name its supported
pairs, migrations, rollback point, and historical fixtures. If those facts are
missing, stop release of the incompatible change and assign the gap to that
component's maintainer. Record user-visible behavior, errors, data impact,
compatibility, deprecation and operational actions in the change/release notes;
do not invent a changelog generator or a global SemVer rule for all private
packages.

Image build produces candidate digests and receipts bound to a source commit.
Bundle assembly produces Nova/Buster/Prism archives and checksums. Publication
preserves receipts as release assets. Promotion verifies a successful main
source run and materializes values from its exact receipts. Manual promotion
opens a PR; automatic production selection is a separately enabled workflow.
When continuous GitOps is active, merging the selection authorizes Argo to
apply it. A release PR is therefore not always a harmless metadata-only change.

For release-tool changes, run:

```sh
node --test tests/verification/deployment/release-images.test.mjs tests/verification/deployment/oci-image-identity.test.mjs tests/verification/deployment/release-configuration.test.mjs tests/verification/deployment/code-release.test.mjs
node --test tests/verification/deployment/gitops-continuous.test.mjs tests/verification/deployment/gitops-release.test.mjs
```

Prepare Helm and Git for their fixtures. Scan the selected immutable images
before promotion. Do not substitute a fresh image/tag for a failed retained
digest check. For an actual promotion/rollback, use
[maintenance](../use/maintenance.md) and its authorization, backups, health,
functional verification and stop rules.

Rollback takes a **deployment commit**, not an image source commit. It restores
previous selection and GitOps inputs without rebuilding images. The previous
selection is not automatically healthy. Check artifact availability and data
compatibility before merge. It does not restore database contents and does not
remove resources retained by `prune=false`. Once an incompatible data write or
migration crosses its irreversible boundary, selecting old code is insufficient.
Stop and use the owning store's proven recovery path; the current platform
[recovery limits](../use/recovery.md) still apply.

> **Source evidence — version, receipt, promotion, rollback**
>
> Claim: generated versions and immutable release selection have separate authorities; rollback does not restore data.
> Implementation: [central tool/image inputs](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/versions.json#L1-L59), [version command interface](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/versions.mjs#L178-L181), [image receipt creation](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/build-images.yaml#L86-L105).
> Contract or setting: [bundle checksums/source release](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/build-images.yaml#L142-L178), [GitOps promotion consequence](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/promote-runtime.yaml#L84-L113), [rollback contract](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/rollback-runtime.yaml#L1-L35), [rollback safety limit](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/rollback-runtime.yaml#L47-L64).
> Test evidence: sources inspected; no image build, publication, promotion, or rollback was executed in this bounded local session.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: selected bytes and successful source fixtures do not establish production rollout or data recovery.

## Route each source change to its documentation owner

Use [documentation governance](../reference/documentation-governance.md) and the
[generated page map](../reference/generated-documentation-map.json). The map
records page owner, evidence sources, canonical route and mapped checks. Search
it for the changed source and its parent component; a narrow symbol can be
covered by a parent evidence path. If no correct page/owner appears, assign and
register that dependency before considering the change documented. An exhaustive
source inventory and an authored explanation must each remain current.

| Changed authority | Canonical reader explanation | Maintenance/check route |
| --- | --- | --- |
| Nova reducer, recorder, recovery, graph/compiler | [Nova Core](../understand/nova-core.md), this change guide, run/recovery task | Nova + developer experience; Core guide and source/contract checks |
| Worker envelope, profile, native authority | [Worker Core](../understand/worker-core.md), profiles and recovery | Worker maintainer; Worker contracts/role/native checks and Core guide |
| SDK schema/export/helper | [extension contracts](contracts.md), public API explanation and examples | SDK maintainer; SDK generation, compatibility, consumer and publication checks |
| Plugin manifest/registration/config | [package catalogue](plugin-catalogue/README.md), supported extension guide | Package + Foundation maintainer; inventory/publication and package checks |
| Buster plan/provider/fixture/report/error | [Buster suite reference](../reference/buster-suites.md), Buster change guide | Buster maintainer; resolver/provider/import checks and Buster guide |
| Prism schema/service/domain/data/Studio | [Prism change guide](platform/prism.md), linked mechanism and operator task | Prism maintainer; component/contract/native checks and Prism guide |
| Event/store/telemetry/endpoint/secret | [telemetry](../understand/telemetry.md), communication/data/security references | Source owner + telemetry/platform; generated surface and platform guide checks |
| Chart/values/environment/deploy input | [configuration precedence](../reference/configuration-precedence.md), install/maintenance | Deployment maintainer; config/Helm generation, render and mapped guide checks |
| Version/receipt/release/GitOps | This release route and [maintenance](../use/maintenance.md) | Release/deployment maintainer; version/receipt/selection checks |
| Ops MCP tool/auth/namespace | [Ops MCP](../understand/ops-mcp.md), trust/endpoints | Ops maintainer; tool inventory, package/image and platform guide checks |
| UI view/operation/preview | Studio or [Archviewer](../understand/archviewer.md) | UI + source-data owner; browser/native reader and mapped guide checks |

Run `npm run docs:governance:generate` after metadata/source dependencies change,
then `npm run docs:governance:check`. Refresh generated references through their
registered generators, not a manual table edit. Run `npm run docs:generate:check`,
`npm run docs:check:refs`, the affected guide checks,
`npm run docs:site-boundary:check`, and `npm run docs:publication:check`.
Use `npm run docs:publication:build` to inspect the actual static output. These
commands require the declared parser/render environment when their dependency
chain reaches it. Coordinate generation after source changes are stable; do
not regenerate while another author changes an authority.

Update source callouts with a full committed SHA, a symbol, and a narrow valid
line range. Check the cited file bytes against the current checkout. A pinned
old link remains readable after a code change but can become false evidence for
current behavior. Update reasons, errors, safe action, compatibility, and
remaining-data instructions when meaning changes. For a new option or surface,
add its discovery/ownership mapping and prove the responsible drift check fails
when its documentation is absent. Removal and rename need equivalent checks,
link cleanup and the declared route redirect before deleting a public page.

> **Source evidence — maintenance routing**
>
> Claim: page metadata supplies ownership and checks while source-derived references remain separate from authored prose.
> Implementation: [map inputs and check routing](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/docs-governance.mjs#L8-L63).
> Contract or setting: [publication source boundaries](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L215-L229).
> Test evidence: source inspection; whole-tree generation/publication integration is not claimed by this bounded local session.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: the map routes known dependencies; it does not prove a semantic explanation complete or an unknown source surface discovered.

## Stop rules and unresolved proof

| Observation | Safe action and owner | Condition for closure |
| --- | --- | --- |
| BusyBox `flock` rejects `--timeout`; journal/store tests fail before work | Stop durable-state checks. Development environment owner supplies GNU util-linux at the required absolute path. Keep failing logs. | Repeat the same journal/recovery/compatibility/scale checks to terminal status on the supported host. |
| Missing `cc`, Bash, GNU tar, Go, Helm, browser, scanner or service binary | Stop the affected route. Toolchain/environment owner supplies its declared prerequisite. | Exact focused check executes with retained version/exit/output evidence; no skip or substitute. |
| Ops MCP local child exits before listener readiness | Check its separate lockfile install and bounded startup stderr. Ops maintainer/environment owner diagnoses the first failure. Do not weaken bearer authentication. | Local test lists tools, rejects unauthorized access, reports failed Kubernetes reads honestly and cleans up. Image and live authorization remain separate. |
| A new public source field/export/registration has no page/owner or drift proof | Component and documentation owners add the mapping, explanation, generator/check and negative mutation. | Addition/change/removal of the real surface fails the responsible documentation gate when stale. |
| Incompatible retained schema/data/identity change has no supported old/new pair | Stop its release. Contract/store owner defines migration, recovery and irreversible boundary. | Historical fixtures and original consumers prove the declared supported pair; release procedure names safe failure and rollback limits. |
| No cluster/native/provider environment for a required change check | Record the check as unexecuted and assign its environment owner. Do not promote lower-class proof. | The exact registered test deployment/live path executes with real identities, failure/recovery observations and cleanup evidence. |
| Platform restore or a component application-restore route is not demonstrated | Follow [recovery limits](../use/recovery.md). Platform/store owners prepare isolated-target proof; stop before destructive cutover. | Original application readers and cross-service identity/data checks pass on an independent target with a declared rollback boundary. |

The local checks establish only the bounded successes stated above.
Recovery, portable SDK, scale, and Ops local attempts did not pass in that
initial environment. No clean-reader exercise, native execution, rendered
chart, target image, deployment, live dependency, release, or platform restore
success is inferred from this handbook.
