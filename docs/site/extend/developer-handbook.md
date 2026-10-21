# Develop KubeClaw

Status: source-backed development routes with explicit environment limits
Audience: platform developer, component maintainer, contract author, UI developer
Owner: developer experience maintainers
Evidence: package.json; package-lock.json; tsconfig.base.json; packaging/runtime/package-ownership.json; versions.json; .github/workflows; skills/nova/core; skills/worker/core; skills/buster/engine; skills/prism; tools/ops-mcp; scripts
Evidence revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`
Applies to: the current source workspaces, runtime bundles, services, and release workflows
Last verified: 2026-10-12; applies to the source revision cited below

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
An **invariant** is a rule that must remain true after each supported action.
**Admission** is the decision to accept new work before it starts. **Fencing**
closes that path when the current owner cannot prove its authority; it does not
mean that running work has already stopped. A **spool** stores queued output
bytes on disk until their owner can deliver or seal them. **Backpressure** slows
or rejects new input when a bounded queue cannot accept more data.
**Portable JSON** is the SDK's restricted JSON value/encoding contract, not
arbitrary JavaScript serialization. Its tests reject values that cannot retain
the declared meaning. **RSS** (resident set size) measures memory currently held
in physical RAM by one process; child RSS is the child process's measurement,
not the parent Node heap. **NRI** (Node Resource Interface) is the container
runtime integration that binds a workload to its prepared native pool.
A Linux **cgroup** groups processes for kernel resource control and observation;
see [the shared glossary](../reference/glossary.md).

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
   set -eu
   git clone https://github.com/datrab/kubeclaw.git kubeclaw
   cd kubeclaw
   ```

2. Select the full commit that you intend to change. The command below selects
   this handbook's inspected source baseline. For a later change, use its full
   commit and verify the corresponding source and documentation together.

   ```sh
   set -eu
   git checkout --detach 671234b056bf5f5f503e51e8db30f843e781ba6e
   git status --short
   git rev-parse HEAD
   ```

   The status output must be empty. The revision output must be the requested
   40-character commit. Create your working branch only after this check.

3. Check the host tools before installing or building.

   ```sh
   set -eu
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

4. Install root **development** dependencies without executing package install
   hooks. Use the committed lockfile and a writable cache owned by this
   checkout's developer. The block allocates one under `/tmp`; if this host has
   no writable temporary parent, stop and provision one before installation.
   Keep the printed exact path for subsequent installs and cleanup.

   ```sh
   set -eu
   DEV_NPM_CACHE="$(mktemp -d /tmp/kubeclaw-dev-npm-cache.XXXXXX)"
   printf '%s\n' "$DEV_NPM_CACHE"
   test -d "$DEV_NPM_CACHE"
   test -w "$DEV_NPM_CACHE"
   npm config get omit
   npm ci --include=dev --ignore-scripts --cache "$DEV_NPM_CACHE"
   node -e 'for (const name of ["typescript", "json-schema-to-typescript"]) console.log(require.resolve(name))'
   ```

   Both install and module resolution must exit zero; resolution prints paths
   inside the locked dependency tree. The root build/generator checks need
   `typescript` and `json-schema-to-typescript`, which are development packages.
   `NODE_ENV=production` or an npm omit setting can otherwise exclude them while
   `npm ci` still exits zero. Explicit `--include=dev` overrides a dev omission;
   see [npm's include/omit rules](https://docs.npmjs.com/cli/v12/commands/npm-ci/#include).
   Do not treat a successful production-only install as this developer setup.
   This installs the declared workspaces. It does not build the C launcher,
   fetch browsers, provision services, or install independently locked packages.
   A lockfile or dependency-resolution failure is a setup failure. Retain its
   output and correct the dependency input; do not replace `npm ci` with an
   unrecorded dependency update. `ERR_MODULE_NOT_FOUND` for a required generator
   or compiler package first requires the same include-dev install and resolution
   check, not a schema/product fix. EROFS/EACCES for npm's cache is a separate host
   condition: retain the first error, select an owned writable cache explicitly,
   then repeat the same lockfile install. Do not weaken filesystem permissions
   or switch to a shared root cache. Retain npm logs/config selection and cache
   path without credentials. Remove only this exact owned cache after all
   installs have stopped and their logs are retained; never delete another
   user's cache, dependency tree or source files. If the shell exited, select
   the retained printed allocation path in a new shell before retry/cleanup;
   do not guess a cache directory from a filename pattern.

5. Build the isolation launcher explicitly.

   ```sh
   set -eu
   npm run plugin-system:sandbox:build
   ```

   The build writes an executable at
   `skills/common/plugin-runtime/foundation/isolation/plugin-sandbox` through a
   temporary file and rename. This is a local build artifact. It is not a
   deployed native Worker launcher.

6. Check the common source baseline.

   ```sh
   set -eu
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
> Contract or setting: [journal append and fsync](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/nova/core/state/journal.ts#L125-L156).
> [absolute GNU lock invocation](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/nova/core/state/file-mutex.ts#L4-L23).
> [CI setup](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L9-L37).
> Validation: run the lifecycle and registry contract checks in the prepared checkout. Run the clean-checkout procedure separately.
> Test evidence: no focused test is identified for this claim. Status: source-only; no execution result is asserted.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: local contract checks do not establish native isolation, deployment, or live service readiness.

### Add tools and credentials only for the selected route

| Route | Additional prerequisites | Access and isolation |
| --- | --- | --- |
| Source and contract changes | Root dependencies; TypeScript; GNU locks for durable-store checks | No production credential is needed for pure fixtures. Tests can start local processes and temporary stores. |
| Prism Studio or Buster browser providers | Locked Playwright 1.62.1 browser and its Linux libraries | Disposable browser environment; loopback ports; no production session. |
| Go controller | Root `go.mod` declares Go 1.22 | Run module commands at repository root. Use a compatible installed Go toolchain and the module lock. |
| Pipeline observability cross-language check | Separate `contracts/pipeline-observability/v1/go/go.mod` declares Go 1.24 and has its own `go.sum`; genuine compatible Go at `/usr/local/go/bin/go` | Verify the absolute executable before this selected check. Telemetry wire tests/generation separately require `go` and `gofmt` on `PATH`. |
| Native Worker NRI | `tools/native-worker-nri/go.mod` declares Go 1.26.5; C launcher; Linux cgroup v2. Native-runtime also needs actual Helm, race-supported Go platform, enabled cgo and the Go-selected C compiler. Native pool setup needs the exact central Node patch. | Disposable host with explicit root/delegated-scope authority; follow the native fixture and Helm/race procedures below. This is a separate Go module. |
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
set -eu
node node_modules/playwright/cli.js install --with-deps chromium
```

The browser installation must exit zero for the locked Chromium and selected
host libraries before browser checks. A download or host-package failure blocks
that route; retain its first error and exact version selection, then repair the
disposable host and retry the same command. Do not delete a shared browser cache
as test cleanup. The `--with-deps` action can require host package authority. Run it on the
prepared disposable host. The Studio test runner uses port 4190 and can reuse
an existing server. Stop an unrelated listener before the test so that it does
not validate someone else's build.

Ops MCP and Ops Pod are not root workspaces. Install their separate lockfiles
before their tests. Keep the root setup's `DEV_NPM_CACHE` selected in the same
shell, or allocate a new owned writable cache by that procedure if the shell
changed. Include development dependencies for each selected package: Ops Pod's
source checks require its development `yaml` package.

```sh
set -eu
: "${DEV_NPM_CACHE:?Select the owned writable cache from checkout setup}"
npm ci --prefix tools/ops-mcp --include=dev --ignore-scripts --cache "$DEV_NPM_CACHE"
npm ci --prefix ops/pod --include=dev --ignore-scripts --cache "$DEV_NPM_CACHE"
test -f tools/ops-mcp/node_modules/@modelcontextprotocol/server/package.json
test -f ops/pod/node_modules/yaml/package.json
```

The Prism spike packages also have independent lockfiles. If you select
`verify:prism:spikes`, prepare all four through the maintained bootstrap:

```sh
set -eu
NPM_CONFIG_CACHE="$DEV_NPM_CACHE" npm run bootstrap:prism:tests
```

Each separate `npm ci` must exit zero for its own lockfile; dependency-resolution
failure stops that package's tests, not the independent root baseline. Keep
install logs/lockfile identity, and remove only an owned disposable dependency
tree after no process uses it. The Prism bootstrap must finish all five installs
with exit zero; a partial install is not a ready spike environment.
The maintained bootstrap explicitly includes development dependencies for the
root and all four spike lockfiles and uses `NPM_CONFIG_CACHE` (or its declared
default). Select the same owned cache explicitly before calling it; stop if its
cache is not writable. A partial or production-only spike tree is not ready.
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
> Implementation: [Prism bootstrap](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/bootstrap-prism-tests.sh#L1-L8).
> [service binary extraction and output variables](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/prepare-reliability-services.sh#L1-L38).
> [separate package installs](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/remediation-native.yaml#L20-L37).
> Contract or setting: [NRI toolchain](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tools/native-worker-nri/go.mod#L1-L13).
> [root Go module](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/go.mod#L1-L3).
> [documentation tool versions](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/docs-checks.yaml#L20-L38).
> [Studio browser/port selection](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/studio/playwright.config.mjs#L1-L7).
> Required fixture: [native Registry fixture prerequisites](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/integration/registry-local-gc.test.mjs#L14-L45).
> Test evidence: [native Registry fixture prerequisites](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/integration/registry-local-gc.test.mjs#L14-L45). Status: source-only; no execution result is asserted.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: an installed tool or a rendered configuration does not prove external access.

Development dependency declarations are source-owned: [root compiler and SDK
generator packages](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L297-L308),
[Ops Pod development yaml](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/ops/pod/package.json#L5-L7), and the
[bootstrap's explicit include-dev/cache options](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/bootstrap-prism-tests.sh#L3-L8).
These declarations and install options do not establish an observed successful
installation on your host; the install/module checks above must actually finish.

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
> Implementation: [dependency checks](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/check-runtime-package-ownership.mjs#L110-L118).
> [import enforcement](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/check-runtime-package-ownership.mjs#L138-L151).
> [TypeScript config and tracked-output checks](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/check-erasable-typescript.mjs#L7-L42).
> [source/manifest rules](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/check-erasable-typescript.mjs#L43-L95).
> Contract or setting: [owner directions](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/packaging/runtime/package-ownership.json#L54-L80), [compiler options](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tsconfig.base.json#L1-L16).
> Required check: [temporary plugin compilation](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/build-v2-plugins.mjs#L6-L43).
> Test evidence: no focused test is identified for this claim. Status: source-only; no execution result is asserted.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: a dependency check does not prove that the installed runtime role contains a changed package.

### Generate and build in the right order

For a plugin-system contract change, update
`skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json`
first. Then run:

```sh
set -eu
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

Interpret each generation step before starting its consumer:

| Command/group | Expected completion and retained output | Failure/skip diagnosis, stop and cleanup |
| --- | --- | --- |
| SDK generate → check | Generate writes `sdk/src/generated/contracts.ts`; check exits zero only for exact generated bytes. Retain that intended diff. | A stale error stops consumers. Fix the schema/generation failure, retain any partial file and regenerate; do not repair generated bytes manually. |
| SDK build → plugin build → sandbox build | SDK emits declaration output under its untracked `dist`; plugin compilation emits JavaScript into a temporary root and removes it; sandbox build writes the named local executable. All must exit zero. | Diagnose the first compiler/package configuration or C compiler error. Stop dependent builds. Remove only owned untracked build output after retaining logs; never commit generated `dist`. |
| Prism validators/hooks | Generation and selected test/type/build commands finish with exit zero; inspect the validator diff even when a check hook wrote it. | A schema/generator failure can precede consumers. Retain the partial diff; fix the authority and rerun generation before retesting. |
| Telemetry generate → --check | Write updates the owned representations; check exits zero for the same bytes. Retain schema/output diff. | Missing `gofmt`, invalid source or byte drift is not success. Stop; correct the tool/source and repeat the generator and check. Do not discard a partial output diff. |

> **Source evidence — code generation**
>
> Claim: generated source has a specific authority and order; some check hooks regenerate it.
> Implementation: [SDK generation and byte comparison](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/generate-plugin-sdk-types.mjs#L1-L33), [telemetry check/write boundary](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/generate-telemetry-contracts.mjs#L9-L39).
> Contract or setting: [Prism hooks](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/contracts/prism/v1/package.json#L1-L22), [root build scripts](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L153-L174).
> Validation: run the contract generator and the root build in the prepared checkout.
> Test evidence: no focused test is identified for this claim. Status: source-only; no execution result is asserted.
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
   Update its canonical page and validate its commands, links, and reference output.

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

The outcome tables below describe required source-backed observations, not
recorded command runs. In Node test summaries, a required skipped test is not
a completed case; an intentionally asserted product `skipped` state inside a
passing test is different. Stop each ordered chain at its first nonzero exit.
Do not start downstream consumers on failed or partial output.

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
> Prerequisite: durable lifecycle and recovery checks require the GNU lock executable. Contract-only lifecycle checks do not exercise that host boundary.
> Test evidence: no focused test is identified for this claim. Status: source-only; no execution result is asserted.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: a failed prerequisite establishes no recovery result.

## Debug a component through its local caller

A debugger lets you pause a process and inspect its values. Run it only in the
isolated checkout with Node 24 and the selected caller's dependencies. Do not
attach it to a deployed owner. Libraries have no independent listener; debug
the test that imports them. The following callers are real source/test files,
not new service entrypoints.

| Component | Local caller and invocation from repository root | Configuration, logs and cleanup |
| --- | --- | --- |
| Nova Core | `node --inspect-brk=127.0.0.1:9229 --test --test-concurrency=1 tests/verification/reliability/lifecycle.test.mts` | Root install and GNU locks. Test output/stderr and temporary journal fixture; let fixture cleanup complete. Core has no daemon. |
| Worker Core | `node --inspect-brk=127.0.0.1:9229 tests/verification/contracts/check-pipeline-worker-attempt-executor.mts` | Root install; bounded in-process contract caller, not native host proof. Retain assertion/stderr output. No Worker daemon to stop. |
| Buster engine | `node --inspect-brk=127.0.0.1:9229 tests/verification/contracts/check-pipeline-test-plan-runner.mts` | Root install and built sandbox. Caller retains its allocated `test-plan-runner-` temporary root. Inspect its `temporary` variable at a breakpoint, retain that exact path/plan/assertion evidence, then remove only that root after exit; no production runtime starts. |
| Prism domain | `node --inspect-brk=127.0.0.1:9229 --test --test-concurrency=1 skills/prism/tests/domain.test.mts` | Root install and current Prism validators. Domain assertions need no production Control/Worker credential. Test output is not service readiness. |
| Plugin Registry | `node --inspect-brk=127.0.0.1:9229 tests/verification/contracts/check-plugin-system-v2-registry.mjs` | Root install; manifest discovery/registry caller. Retain assertion output; it is not a writable OCI daemon. |
| SDK | `node --inspect-brk=127.0.0.1:9229 skills/common/plugin-runtime/sdk/tests/values.test.ts` | Root install; real public-value assertions. No independent SDK process or persistent store. |
| Telemetry | `node --inspect-brk=127.0.0.1:9229 --test --test-concurrency=1 contracts/telemetry/v1/tests/contracts.test.mjs` | Prepare PATH Go/gofmt before this cross-language caller. Retain test/compiler errors; fixture temporary files are not authoritative deployed events. |
| Charts/GitOps | `node --inspect-brk=127.0.0.1:9229 --test --test-concurrency=1 tests/verification/deployment/gitops-release.test.mjs` | Prepare Helm/Git and root dependencies. Debug the selection fixture, not Argo. Retain rendered/selection errors; remove only its temporary output. |
| Ops MCP | `node --inspect-brk=127.0.0.1:9229 tools/ops-mcp/src/server.mjs` | Prepare its separate lockfile and the local-only bearer/loopback configuration in [the Ops route](#change-ops-mcp). Retain stderr without bearer values. Stop only this listener and remove its owned test bearer file after exit. |
| Studio server | `node --inspect-brk=127.0.0.1:9229 skills/prism/server/studio.ts` | Build `dist-studio` and prepare the Control URL/ingress configuration in [the Prism route](#change-prism-contracts-services-data-or-engine). This debugs the proxy, not browser code. Keep its application port isolated because it binds all interfaces. Retain request/server errors; stop only this listener. |
| Studio browser / Archviewer | Use `npm run dev:studio --prefix skills/prism` and browser developer tools for editor code. For Archviewer use the named native nginx test in [the UI route](#change-ui-behavior). | Vite and nginx are not Node SDK/Worker daemons. Browser console/network observations and nginx fixture logs belong to their own process. Stop only the owned Vite/nginx server and keep source documents. |

1. Stop an unrelated debugger on port 9229, or select another unused loopback
   port consistently in your invocation and debugger. Run one caller from the
   table in the foreground. `--inspect-brk` waits before application execution;
   absence of application output at that point is not a hung service.
2. Read Node's stderr inspector URL and attach a Node-capable debugger to that
   exact `127.0.0.1` port. Set a breakpoint in the component imported by the
   caller, resume, and inspect the caller's actual input/error values. The
   inspector URL identifies the debug listener, not application readiness.
3. Keep stdout/stderr and assertion or request errors. Diagnose an import error
   through the locked dependencies/current validators first; diagnose address
   conflicts by the selected listener, not by killing unrelated processes.
4. For a fixture, resume it to terminal status so its cleanup can run. For the
   local service, use Ctrl-C in its owning terminal and confirm process exit.
   If you interrupt a fixture before cleanup, retain its error/state and inspect
   its exact owned temporary paths before removing them. Do not delete retained
   native/journal state or a production resource as debugger cleanup.
5. Rerun the selected checks without the debugger. Pausing alters deadlines,
   cancellation and CPU measurements. Debug results cannot establish timing,
   successful recovery or a native cleanup budget.

The following sources define caller selection: [Nova/Worker command routing](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L153-L166).
[Buster plan-runner routing](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L72-L88).
[SDK values caller](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/common/plugin-runtime/sdk/package.json#L5-L12).
[Prism/Studio commands](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/package.json#L12-L29). These are source-backed debug routes, not recorded debug executions.

## Run Lint for a selected source change

Owner: Lint maintainers. Use [Lint policy](../reference/lint-policy.md) for
selected rules, tools, severity, baselines and waivers, and [Extend Lint](lint.md)
for a rule/tool/target/pack change. A contributor check is an engine report;
the Nova stage owns its pipeline interpretation. Run these package checks from
repository root:

```sh
set -eu
npm run build --prefix skills/nova/plugins/lint
npm run test:focused --prefix skills/nova/plugins/lint
npm run test:live --prefix skills/nova/plugins/lint
```

The build must exit zero before focused or live checks. Focused checks must
finish their assertions with no failed or required skipped case; retain their
actual test summary. A compiler/import error is setup/source failure, not a
clean Lint result. Stop this chain on the first error. The live check has the
same terminal requirement; missing analyzer/configuration is blocked execution.
Keep failed tool output and remove only owned temporary reports after retaining
it. The live-function test requires real shellcheck, shfmt, GNU locks and its
selected tools/configuration. Prepare the target-image route in the Lint guide
when the source host lacks those tools. Do not let a missing analyzer look like
a clean source result. Serialize acceptance-relevant reports while the shared
discovery/cache isolation limit remains open.

To lint the checked-out workspace with the canonical policy, after preparing
its selected analyzer and Kubernetes-schema dependencies, run:

```sh
set -eu
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
> Implementation: [package check sequence](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/nova/plugins/lint/package.json#L1-L16).
> [report CLI inputs](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/run-lint-report.mjs#L8-L28).
> [validated report and exit selection](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/run-lint-report.mjs#L110-L145).
> Contract or setting: the linked Lint policy/extension guides own policy and deployment limits.
> Validation: run the analyzer on the selected sources and confirm its report before exercising the deployed stage.
> Test evidence: no focused test is identified for this claim. Status: source-only; no execution result is asserted.
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
set -eu
npm run typecheck --prefix skills/nova
node tests/verification/contracts/check-plugin-system-v2-lifecycle.mjs
node --test tests/verification/reliability/lifecycle.test.mts tests/verification/reliability/decisions-and-snapshots.test.mts
node --test tests/verification/reliability/project-recovery-version.test.mjs tests/verification/reliability/source-snapshot-version.test.mjs
npm run plugin-system:sdk:check
npm run verify:runtime-packaging:ownership
npm run docs:core-guides:check
```

The first checks typing and local lifecycle rules. The journal tests cover
repair scheduling, snapshots, and process-death recovery. Version fixtures
cover retained source/graph interpretation. The SDK check must leave the
unchanged external contract generation intact. Add a targeted new assertion
for the changed diagnostic; existing tests do not automatically cover it.
The Core guide check protects its component explanation and exact linked
source bytes. If a Core source file changed, complete
[the protected Core source-revision procedure](#update-protected-core-source-revisions)
before that Core guide check can pass. Then complete the
[documentation-change chain](#documentation-change-chain).

For a graph/compiler change, complete the
[absolute GNU tar preflight](#prepare-buster-remote-archive-fixtures) before adding
`node tests/verification/contracts/check-project-compiler.mts` and
`node --test tests/skills/nova/project_setup/progress-scaffold.test.mjs`.
The progress-scaffold fixture creates and lists an archive with
[the actual `/usr/bin/tar` caller](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/skills/nova/project_setup/progress-scaffold.test.mjs#L482-L489). Missing or non-GNU absolute tar blocks this fixture even without a remote
result change. Retain the first archive error and fixture output; after the
fixture exits, remove only its owned temporary repository/archive, not source
run state. PATH tar cannot replace that absolute executable.
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
independent service start script. Use its retained-state fixture in
[the debug map](#debug-a-component-through-its-local-caller); do not substitute
a debugger session for a deadline/recovery check.


Read the Nova chain as these separate outcomes:

| Command/group | Expected completion and retained output | Failure/skip diagnosis, stop and cleanup |
| --- | --- | --- |
| Nova typecheck + lifecycle contract | Both exit zero; the contract result reports `ok`. No deployment/build artifact is implied. | Type/import errors need locked dependencies/current contract first; an assertion needs its exact trigger/expected outcome. Stop before journal checks. |
| Lifecycle/snapshot tests | Node test summary has no failed or required skipped case; durable/recovery assertions complete. Retain test names and interruption errors. | Missing GNU lock or process-death assertion is not replay success. Stop; retain the reported journal/temp path and failure before owned cleanup. |
| Source/graph version fixtures | Both families complete with no failed or required skipped case; retain old/current identity assertions. | First distinguish Git/source setup from retained-version mismatch. Stop incompatible interpretation; do not regenerate old fixture bytes to match new behavior. |
| SDK freshness + ownership + Core guide | Each exits zero; SDK check is read-only, owner check rejects forbidden dependencies, guide check protects its named explanation. | First stale generated output, then forbidden edge or named guide defect: fix the reported authority, not the guard. Stop; no tracked mutation is expected. |
| Selected compiler/remote/effect additions | Each selected command finishes its assertions; retain plan/source/receipt/recovery output. Not running an additional required case leaves that change unchecked. | Absolute tar/launcher/service setup error blocks remote proof. Assertion or uncertain receipt stops retry of effects; reconcile the original identity. Let owned fixture processes close; retain durable failure evidence. |

> **Source evidence — lifecycle and restart**
>
> Claim: live result handling and replay must preserve the same bounded lifecycle decision.
> Implementation: [result guard and accounting](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/nova/core/lifecycle/reducer.ts#L96-L136).
> [decision recording and administrative stop](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/nova/core/execution/run-decisions.ts#L29-L60).
> [terminal event payload](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/nova/core/execution/run-decisions.ts#L103-L129).
> Contract or setting: [completed-attempt replay](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/nova/core/lifecycle/recovery-state.ts#L39-L69), [interrupted state reset](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/nova/core/lifecycle/recovery-state.ts#L153-L180).
> Required fixtures: [Process-death fixture](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/reliability/lifecycle.test.mts#L61-L81), [old/current graph recovery](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/reliability/project-recovery-version.test.mjs#L14-L34). Prepare the required GNU lock executable before running recovery checks.
> Test evidence: [Process-death fixture](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/reliability/lifecycle.test.mts#L61-L81). Status: source-only; no execution result is asserted.
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

Run the Nova product checks and new assertions, including the invalid transition
and actual crash/replay cases. Record the reason, stage status, attempt counters,
journal identity, schema/graph identities, and every failure or skip. Product
success does not pass a failed documentation chain. Before the required Core
guide/common page checks, complete
[the protected source-revision procedure](#update-protected-core-source-revisions)
in this scratch checkout. Its temporary local commits may identify changed
source and documentation authorities for local Git checks. They do not make a
GitHub URL available or prove publication/rendered results.

After the changed product and documentation chains reach terminal results,
remove the temporary source/tests **and** temporary Core checker/guide pins,
authored explanations, common source lock and generated inventory/reference/map
changes. Restore the exact recorded original bytes, including the original
hardcoded checker revision and all three Core guide revisions. Do not retain a
changed-source pin after removing its source. Compare tracked source, docs and
generated output with the saved baseline, rerun the selected product and
complete documentation-chain commands, and retain each real result. A command
that failed before removal stays failed for the changed phase; successful
removal cannot rewrite it as success. Keep local commit identities and logs
outside the scratch tree before deleting only that owned tree.
No successful exercise is claimed by the presence of this file or handbook.

## Change Worker Core or native execution

Owner: Worker Core maintainers. `skills/worker/core/src/index.ts` exposes attempt
execution; the module does not schedule a pipeline or decide quality. Read
[Worker Core](../understand/worker-core.md) before changing claims, deadlines,
process control, ownership, result sealing, or resource accounting.

For generic attempt behavior, run:

```sh
set -eu
npm run verify:worker-core:contracts
npm run verify:worker-core:attempt-executor
npm run verify:worker-core:local-runtime
npm run verify:worker-core:role-surfaces
npm run verify:runtime-packaging:ownership
```

Add the native chain when the change touches launch, cgroups, ownership,
observation, or host recovery:

```sh
set -eu
npm run verify:worker-core:node-pools
npm run verify:worker-core:native-runtime
npm run verify:worker-core:native-scope
```

Prepare the [native fixture host](#prepare-a-native-worker-fixture-host) before
this chain. `node-pools` and `native-runtime` require the actual
`systemd-analyze verify` CLI. `native-runtime` also builds the NRI program with
PATH Go and `GOTOOLCHAIN=local`; that Go must exactly equal the current central
`versions.json` `buildArgs.GO_VERSION` (1.26.5 at this source revision), not the
documentation parser's Go 1.26.3. `native-scope` is a live-host check with four
explicit inputs below; missing inputs are failures, not supported skips.
`native-runtime` also invokes real Helm and a race-enabled Go test. Complete
[its Helm/race preparation](#prepare-helm-and-go-for-native-runtime) before the
native chain; a static NRI build does not cover that test.
Never use a production node as a disposable process-kill fixture. For trust
changes, run `npm run verify:worker-core:trust` and use
`npm run verify:worker-core:trust:live` only in the registered cluster.

Test rejection before launch, cancellation propagation, deadline expiry,
cleanup failure, crash after ownership commit, restart adoption, and admission
fencing while authority is uncertain. Keep generic envelope/schema identity
separate from Buster or Prism request meaning. Update the Worker architecture,
profile reference, and recovery procedure; run `docs:core-guides:check` and the
[documentation-change chain](#documentation-change-chain).

For local debugging use the Worker caller in
[the debug map](#debug-a-component-through-its-local-caller).
Worker Core is a library, not a separately started developer daemon. Its
specialist host supplies configuration. Stop admission before replacing native
code. Preserve ownership, journal, and spool records until the owning process
has reconciled them; deleting them can remove the only proof that an attempt
still exists.

Interpret Worker checks before using them as change evidence:

| Command/group | Expected completion and retained output | Failure/skip diagnosis, stop and cleanup |
| --- | --- | --- |
| contracts / attempt-executor / local-runtime | Each npm group must complete its caller assertions and TypeScript checks with exit zero. Keep the individual command/error output. | An import/typing failure is distinct from an attempt assertion failure. Stop the sequence at the first error; no standalone Worker daemon or deployed output is created. |
| role-surfaces + ownership | Exit zero checks neutral/specialist boundaries and package/import direction. No native resource claim follows. | Diagnose the named forbidden role/import or stale type first. Stop; do not copy specialist policy into Core. |
| node-pools / native-runtime | Exit zero and no failed/required skipped case, including the real systemd parser; native-runtime also completes real Helm renders, exact-Go static build and the mandatory Go race tests. Retain tool/module/cache/compiler/test diagnostics. | Missing `systemd-analyze`, Helm, exact Go, effective cgo=1, supported race platform or Go-selected compiler blocks the selected step. A race report is a test failure. Stop; do not remove `-race`. Fixture render/build outputs are owned cleanup, not host identities or shared Go caches. |
| native-scope | Exit zero with the two real-host cases completed; final counters/empty scopes/disposed ownership and replay/capacity assertions pass. | Missing one of the four inputs, launcher/host guard or cleanup error is failure, never a skip. Stop admission on unresolved ownership; keep records until reconciliation. See the host procedure for retirement. |
| trust / trust:live | Source trust checks must exit zero. The live route must separately complete on the registered cluster and retain real identity/denial observations. | Unavailable cluster/credentials mean live unexecuted. Wrong identity or denied expected action is a failure to diagnose through trust policy; do not weaken authentication. Follow the registered fixture cleanup, not global resource deletion. |

> **Source evidence — Worker route**
>
> Claim: contract/local checks and native/role/trust checks protect different boundaries.
> Implementation: [maintained Worker commands](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L153-L166), [NRI/native command](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L288-L295).
> Contract or setting: [Worker ownership statement](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/worker/core/BOUNDARIES.md#L1-L5), [native CI authority](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L102-L118).
> Validation: run the selected contract checks and native host checks separately with their declared prerequisites.
> Test evidence: no focused test is identified for this claim. Status: source-only; no execution result is asserted.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: a local attempt test cannot establish native process authority or cluster trust.

### Prepare Helm and Go for native-runtime

Run from repository root in the same shell that will run
`npm run verify:worker-core:native-runtime`. Prepare actual Helm through the
[chart/render tool route](#add-tools-and-credentials-only-for-the-selected-route)
(product CI selects Helm 3.18.4), exact central Go 1.26.5, its locked NRI module,
and package-download/cache access. This command first runs Node tests with real
Helm renders/static NRI build, then runs
`GOTOOLCHAIN=local go -C tools/native-worker-nri test -mod=readonly -race -count=1 -v ./...`.
Do not omit the race-enabled tail.

A **data race** occurs when concurrent execution accesses the same value and
at least one access writes it without the required coordination. Go's race
checker observes these accesses during tests. **cgo** is Go's C-tool integration;
this race route needs it enabled and an installed C compiler on Linux. Check
that your effective GOOS/GOARCH is supported by the selected Go's
[race detector](https://go.dev/doc/articles/race_detector#requirements). Do not
cross-compile a test as proof that it ran on this fixture host.

```sh
set -eu
command -v helm
helm version --short
env GOTOOLCHAIN=local go -C tools/native-worker-nri env GOVERSION GOOS GOARCH CGO_ENABLED CC GOMOD GOPROXY GOMODCACHE GOCACHE
test "$(env GOTOOLCHAIN=local go -C tools/native-worker-nri env CGO_ENABLED)" = 1
```

GOVERSION must equal the current central `GO_VERSION` prefixed by `go`; GOMOD
must select this checkout's NRI module. Verify the compiler selected by Go's
`CC` value under this same PATH and retain its real path/version. `cc --version`
for the launcher is sufficient only when Go actually selects that compiler.
If cgo is disabled, the compiler is absent or the platform lacks race support,
stop and prepare the supported environment before the command. After the
supported platform/compiler is prepared, select `CGO_ENABLED=1` in the same
shell, export it, and repeat the effective Go environment check before tests.
Do not remove `-race` or change expected tests. Retain module/tool/cache/download selection
and the first compiler or test diagnostic; never retain credential values.

The static NRI builder sets `CGO_ENABLED=0` for its own child build only. That
setting is not the mandatory race-test environment. The full command needs
exit zero for both Node test cases and Go race tests, no failed/required skipped
case and no reported race. A failed Helm render, compiler setup, module download
or race assertion stops the chain before native-scope claims. Fixture temporary
render/binary trees are removed by their callers; retain logs first. Shared Go
module/build caches are not fixture cleanup and must not be deleted blindly.

> **Source evidence — native-runtime tool and race boundary**
>
> Claim: native-runtime contains real Helm rendering, a static NRI build and a separate mandatory race-enabled Go test.
> Implementation: [Helm render call](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/deployment/prism-native-runtime.test.mjs#L14-L21), [negative Helm renders and owned temp cleanup](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/deployment/prism-native-runtime.test.mjs#L58-L64).
> Contract or setting: [complete native-runtime command](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L291-L291).
> [child-local static cgo setting and Go identity](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/build-native-worker-nri.mjs#L10-L18).
> [upstream race requirements](https://go.dev/doc/articles/race_detector#requirements).
> Test evidence: [original static binary and cleanup](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/deployment/prism-native-runtime.test.mjs#L66-L78). Status: source-only; no render, build or race-test result is asserted.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e` for repository definitions; upstream race requirements were inspected separately.
> Limit: setup observations do not prove test completion, native-host ownership or cluster execution.

### Prepare a native Worker fixture host

Use a disposable Linux cgroup-v2 host with real machine/boot identity, a
systemd delegated pool, and capacity reserved outside Kubernetes Pod allocation.
Do not copy a production identity/pool file into a container to imitate that
host. The host must have the compiled original production launcher, root
supervisor authority with effective KILL/SETGID/SETUID capabilities, and trusted
root-owned policy/identity files. A setuid or group/world-writable launcher is
rejected. Host and cgroup namespace identity must agree.

1. The native-host owner selects a test node, real containerd version and
   capacity policy. Start from `my-values/infra/native-worker-pools.yaml`; fill
   its actual `nodeName`, runtime selection and owned namespaces/resources.
   The template is not a prepared node. Render a new bundle with
   `bash scripts/deploy.sh native-node-render "$NATIVE_TEST_BUNDLE" "$NATIVE_TEST_POLICY"`.
   Both variables are exact owner-selected paths: the output directory must not
   already exist, and the policy must describe this test host. Inspect the
   generated role policies, NRI configuration, kubelet reservations and systemd
   service. `systemd-analyze verify --man=no "$NATIVE_TEST_BUNDLE/kubeclaw-native-pools.service"`
   must accept the actual unit before installation.
2. Before installation/start, the host owner prepares the **exact** Node patch
   selected by the bundle's `native-node-policy.json` `nodeVersion`. The renderer
   derives it from `versions.json` `buildArgs.NODE_BASE`: **24.15.0** at this source
   revision. The setup compares it directly with `process.versions.node` and
   rejects a mismatch as `NATIVE_SETUP_POLICY_RUNTIME_INVALID`. General CI Node
   major 24 and the separate Ops image override 24.21.0 are not this selection.
   The generated service executes `/usr/bin/env node`, so verify its real Node
   executable under the service's effective PATH, not only a login shell.
   Before the service is installed or started, the host owner determines its
   effective PATH from the actual systemd/service environment. Set
   `NATIVE_TEST_SERVICE_PATH` to that exact value, not a login-shell assumption,
   then run in the isolated verification shell:

   ```sh
   set -eu
   : "${NATIVE_TEST_SERVICE_PATH:?Select the actual generated service PATH}"
   env PATH="$NATIVE_TEST_SERVICE_PATH" /usr/bin/env node -p 'process.versions.node'
   env PATH="$NATIVE_TEST_SERVICE_PATH" /usr/bin/env node -p 'process.execPath'
   ```

   The version must exactly match generated `nodeVersion`; retain the executable
   path, version and service PATH. Stop if they differ. Install/select the real
   supported Node executable in the service environment; do not insert a shim,
   relax the guard or assume another major-24 process proves this requirement.
   The host owner then installs the generated setup/policies at their declared
   `/opt/kubeclaw/native` and `/etc/kubeclaw` paths, applies the generated kubelet
   reservations/NRI selection, and runs the generated systemd service on that
   host. These are host changes, not actions for a shared developer container.
   Its setup process must stay running in the delegated `setup` subgroup.
   It creates/verifies both role pools and real node/runtime identity files;
   a pool-prepared status still requires capacity preflight. Never run the setup
   script in an arbitrary shell cgroup or weaken a rejected limit/identity.
3. On that selected host, with named Node read and kubelet `configz` access,
   run `bash scripts/deploy.sh native-node-preflight "$NATIVE_TEST_POLICY"`.
   Exit zero and its capacity/policy receipt establish this preflight only.
   A namespace mismatch, changed Node/kubelet/host, unsupported runtime,
   direct pool-root process occupancy or reservation/control failure blocks
   this preflight. It checks host capacity, installed policy/runtime identity,
   root identity, limits, domain type, counters and writable kill boundary.
   It does **not** prove that all descendant scopes are empty: an empty root
   `cgroup.procs` can coexist with running processes in descendant scopes.
   Retain the first error and host policy/receipt; correct the host, not the guard.
   Before selecting a live fixture, the host owner must separately establish
   exclusive fixture ownership and an empty complete role subtree. Retain the
   scope inventory/ownership reconciliation and the actual role root's
   `cgroup.events` observation with `populated 0` (the kernel's
   [hierarchical population signal](https://docs.kernel.org/admin-guide/cgroup-v2.html#un-populated-notification)), taken after stopping admission
   and while no other writer can launch work. This is separate empty-fixture
   evidence, not a property inferred from a zero preflight exit. Unknown scopes,
   foreign work or unresolved ownership block the fixture. Do not remove a
   descendant or kill a workload whose ownership is not established.
4. Select the four live-scope fixture inputs in the same shell. Do not guess
   their contents. `KUBECLAW_WORKER_TEST_CGROUP_ROOT` is the actual empty delegated
   role pool. `KUBECLAW_WORKER_TEST_LAUNCHER` is the absolute original compiled
   production launcher. `KUBECLAW_WORKER_TEST_NODE_IDENTITY_FILE` is the trusted
   mounted node identity. `KUBECLAW_WORKER_TEST_POOL_LIMITS_FILE` is a JSON file
   containing the `limits` of that prepared pool, not the whole role policy.
   The host owner supplies it from the verified role-policy `limits` field,
   without changing values or substituting a test vector. It must
   describe the same aggregate pool, including CPU, memory and task controls.
   These are distinct from plugin isolation's `KUBECLAW_TEST_CGROUP_ROOT`.

   ```sh
   set -eu
   : "${KUBECLAW_WORKER_TEST_CGROUP_ROOT:?Select the prepared test pool}"
   : "${KUBECLAW_WORKER_TEST_LAUNCHER:?Select the original production launcher}"
   : "${KUBECLAW_WORKER_TEST_NODE_IDENTITY_FILE:?Select the trusted test host identity}"
   : "${KUBECLAW_WORKER_TEST_POOL_LIMITS_FILE:?Select the actual aggregate pool limits}"
   test -d "$KUBECLAW_WORKER_TEST_CGROUP_ROOT"
   test -x "$KUBECLAW_WORKER_TEST_LAUNCHER"
   test -r "$KUBECLAW_WORKER_TEST_NODE_IDENTITY_FILE"
   test -r "$KUBECLAW_WORKER_TEST_POOL_LIMITS_FILE"
   command -v systemd-analyze
   env GOTOOLCHAIN=local go env GOVERSION
   ```

   Compare GOVERSION with the current central `GO_VERSION` prefixed by `go`.
   The file/executable checks do not replace the native trust/identity/pool
   validators. Stop on any missing input or rejected real authority.
5. For Prism's native Worker tests, additionally set
   `PRISM_NATIVE_ISOLATED_TEST_POOL=true`, `PRISM_NATIVE_POOL_POLICY_FILE` to the
   trusted prepared **Prism** role policy, `PRISM_NATIVE_LAUNCHER` to its original
   trusted launcher, and `PRISM_ENGINE_CONTENT_DIGEST` to the actual engine
   identity. The supervisor reads limits, ownership root, node/runtime identity
   and scope from the role policy. Prepare the selected PostgreSQL runtime URL
   in `PRISM_NATIVE_OPERATION_TEST_DATABASE_URL`, locked Chromium/browser path
   and native host libraries before selecting browser-backed cases. The harness
   supplies its fixture-only HMAC configuration and local server; do not inject
   production trust secrets. Do not use this opt-in to authorize a shared pool.

The fixtures own their child processes and temporary state, not the host's
identity, service or persistent role pool. A successful native scope check must
prove final `populated=false`, final counters, disposed ownership and rejected
replay/capacity overflow. A cleanup error or missing authority is nonzero, not
an allowed skip. Preserve unresolved ownership and stop admission until the
host owner reconciles it. After terminal results and retained evidence, the
host owner retires only the disposable host/pool it provisioned. Do not stop a
shared pool service or remove its identities as package-test cleanup.

> **Source evidence — native fixture authority**
>
> Claim: native tests require actual accounted pools, exact fixture inputs and supervisor authority; rendering a setup bundle is not preparing a host.
> Implementation: [mandatory live cgroup input](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/reliability/worker-native-scope-live.mts#L19-L20).
> [live-scope inputs and retained kernel assertions](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/reliability/worker-native-scope-live.mts#L95-L136).
> [host render bundle and unit](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/render-native-worker-node.mjs#L9-L70).
> [host setup/retained service](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/prepare-native-worker-pools.mjs#L81-L121).
> Contract or setting: [central Node and separate Ops selections](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/versions.json#L27-L29).
> [complete-subtree populated observation](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/worker/core/worker/native-resource-observation.ts#L52-L67).
> [separate unknown-scope recovery guard](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/worker/core/worker/native-worker-ownership.ts#L244-L251).
> [exact generated Node selection](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/render-native-worker-node.mjs#L12-L15).
> [service executable selection](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/render-native-worker-node.mjs#L49-L56).
> [exact process Node guard](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/prepare-native-worker-pools.mjs#L8-L18).
> [pool controls, not descendant-empty assertion](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/worker/core/worker/native-resource-pool.ts#L33-L61).
> [direct root occupancy guard](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/worker/core/worker/native-resource-scope.ts#L15-L28).
> [trusted root/launcher guard](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/worker/core/worker/native-supervisor-authority.ts#L4-L22).
> [native preflight actual host and Node](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/native-worker-node-preflight.mjs#L26-L48).
> [exact NRI Go selection](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/build-native-worker-nri.mjs#L7-L18).
> [systemd parser check](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/deployment/native-worker-node.test.mjs#L30-L47).
> [Prism pool/engine configuration](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/config/native-worker.ts#L53-L84).
> Test evidence: [Prism isolated-pool harness and owned shutdown](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/tests/native/worker-harness.mts#L14-L36). Status: source-only; no host preparation or test execution is asserted.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: input preflight and host receipt do not prove fixture completion or deployed trust.

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
set -eu
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

The Nova progress-scaffold, Buster remote-runtime, restart, and real-provider
fixtures consume GNU tar at
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
> Implementation: [remote archive creation](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/contracts/check-pipeline-remote-plan-runtime.mts#L43-L51).
> [restart tar configuration](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/contracts/check-pipeline-remote-process-restart.mts#L169-L180).
> [real-provider tar configuration](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/contracts/check-pipeline-remote-real-provider.mts#L108-L119).
> Contract or setting: [generic bundle tar selection](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/package-agent-skill-bundle.sh#L27-L44).
> Prerequisite: the generic role-bundle script uses GNU tar selected through `PATH`. The remote archive fixtures require `/usr/bin/tar`. Check each selected executable before its route.
> Test evidence: [remote archive creation](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/contracts/check-pipeline-remote-plan-runtime.mts#L43-L51). Status: source-only; no execution result is asserted.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: archive-tool readiness does not establish restart, isolated provider, or deployed runtime behavior.

Check duplicate request, mismatched source/provider/schema digest, incomplete
required report, cancellation, restart, and response loss. Retain resolved
plan, source identity, evidence, result signature/record, and import decision.
For BuildKit, Registry, Kubernetes, browser, scanner, or Tailscale provider
changes, the [suite guide](../reference/buster-suites.md) defines the additional
local/production route and service prerequisites. Do not replace those checks
with an unrelated provider's success. Update suite/config/error guides and run
`npm run docs:buster-guides:check` plus the [documentation-change chain](#documentation-change-chain).

Interpret the Buster route by its changed boundary:

| Command/group | Expected completion and retained output | Failure/skip diagnosis, stop and cleanup |
| --- | --- | --- |
| contracts / provider registry / report registry / suite resolver | Each finishes with exit zero and its contract assertions. Keep resolver/provider/report identity output. | First inspect the reported manifest, registration, digest or required report. Stop before execution when resolution fails. These checks do not activate production providers. |
| plan-runner + changed package test | The original runner completes its plan/evidence/cancellation assertions; the package test completes its own cases. Retain plan/attempt/report output. | Missing sandbox/import setup differs from failed provider/report assertions. Stop dependent remote work. The plan-runner allocates a `test-plan-runner-` temporary root and retains it; keep its exact allocated path and evidence, then remove only that root after caller exit. If its exact path was not captured, retain it for diagnosis; do not select a directory by a broad name/glob. |
| remote-plan / remote-runtime / remote-import | All selected groups exit zero; retain original source/archive identity, result record/signature and imported decision. | Missing absolute tar, launcher or selected service blocks execution. A transport/result/digest assertion is a test failure. Stop; preserve result identity before retry, never create a fresh effect to hide response loss. |
| restart / real-provider additions | Both selected fixtures reach terminal assertions with exit zero; keep interruption/provider output. | Archive preflight or child readiness failure is not recovery evidence. Stop and retain first stderr; remove only their owned children/temp archives after evidence retention. |

> **Source evidence — Buster chain**
>
> Claim: provider resolution, plan execution, remote transport, and result import have separate checks.
> Implementation: [resolver and remote check scripts](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L72-L88).
> Contract or setting: [Buster ownership statement](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/buster/engine/BOUNDARIES.md#L1-L5), [engine dependencies and entrypoint](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/buster/engine/package.json#L1-L26).
> Validation: exercise the selected provider and remote service chain after preparing its identities, credentials, and cleanup procedure.
> Test evidence: no focused test is identified for this claim. Status: source-only; no execution result is asserted.
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

For a storage transaction, follow
[the transaction fixture procedure](#prepare-the-prism-pooled-transaction-fixture).
Its own database and retained-state rules differ from native dispatch.
PGlite/in-memory success cannot prove real PostgreSQL transaction ownership. For native dispatch, follow [the ordered PostgreSQL procedure](#prepare-prism-native-dispatch-databases).
For native Worker binding, prepare [the native fixture host](#prepare-a-native-worker-fixture-host),
then add `npm run verify:prism:native-worker`. That route requires
`PRISM_NATIVE_ISOLATED_TEST_POOL=true`; this is explicit permission to use the
prepared disposable pool, not proof that the pool is safe. For chart or
runtime entrypoint changes, add `verify:prism:helm`,
`verify:prism:runtime-role`, and `verify:prism:images`. Live service/recovery
checks use the named cluster/provider routes; they remain separate from
`verify:prism:repository`.

### Prepare the Prism pooled-transaction fixture

This regression checks concurrent pooled transactions, rollback and repeated
agent/design writes. It does not check deployment-role grants, native Worker
admission or the separate native-dispatch server. From repository root use an
owner-selected **fresh disposable PostgreSQL database**. The transaction CI
route uses PostgreSQL 17. Root npm dependencies and reachable native PostgreSQL
are required; this fixture does not require unrelated pgvector infrastructure.
PL/pgSQL is PostgreSQL's procedural language for SQL functions. A trigger calls
such a function when the specified table action occurs.

1. Its database owner provisions the fresh database and a test connection with
   authority to create the `prism` schema, tables, constraints/indexes, a
   PL/pgSQL function and a trigger, and to read/write its test rows. The selected
   production migration slices omit deployment-role grants. Set
   `KUBECLAW_PRISM_TRANSACTION_TEST_DATABASE` to that database's real URL.
   Confirm the database/role identity and that `prism` is absent before any
   test write. Do not reuse native dispatch's `/prism` database or a shared
   application's schema. The owner retains the provisioning/teardown method
   and exact database identity; credentials do not belong in logs. With that
   URL selected, perform this read-only identity/absent-schema check before
   the fixture. It uses the root-installed `pg` client and closes its connection.

   ```sh
   set -eu
   node --input-type=module <<'NODE'
   import assert from 'node:assert/strict';
   import { Pool } from 'pg';
   assert(process.env.KUBECLAW_PRISM_TRANSACTION_TEST_DATABASE, 'Select the fresh test database');
   const pool = new Pool({ connectionString: process.env.KUBECLAW_PRISM_TRANSACTION_TEST_DATABASE });
   try {
     const identity = (await pool.query('SELECT current_database() AS database, current_user AS role')).rows[0];
     const schemas = (await pool.query("SELECT nspname FROM pg_namespace WHERE nspname='prism'")).rows;
     console.log(JSON.stringify(identity));
     assert.equal(schemas.length, 0, 'Stop: prism schema is already present');
   } finally { await pool.end(); }
   NODE
   ```

   The printed database/role must match the owner's selected target and the
   absent-schema assertion must pass. A connection or assertion failure stops
   before writes. This read-only check does not prove creation privileges; the
   owner must verify the permissions above separately, and the fixture's first
   failed creation statement remains a failed preparation, not transaction evidence.
2. Run the unchanged fixture. It unconditionally executes `CREATE SCHEMA prism`
   and selected production migration slices, then its transaction assertions.

   ```sh
   set -eu
   : "${KUBECLAW_PRISM_TRANSACTION_TEST_DATABASE:?Select the fresh transaction fixture database}"
   node tests/verification/contracts/check-prism-postgres-transactions.mts
   ```

   Exit zero with its `ok` result establishes the pooled-transaction assertions:
   one concurrent replacement, rollback without partial rows, repeated design
   delivery and one claimed agent job. An absent URL raises
   `REAL_POSTGRES_DATABASE_REQUIRED`; a schema-already-exists error means reused
   or wrong setup. Connection/create/language privilege errors block the test.
   An assertion after setup is failed behavior, not permission to erase rows and
   retry. Stop at the first error; no database cleanup is inferred from exit.
3. Retain the exact database/server/role identity, source revision, exit code,
   output and first error. On success the fixture drops its `reject_second`
   trigger, but retains `prism`, tables/test rows and the
   `prism.reject_second_direction` function. Its `finally` closes only the pool.
   A failed run can leave partial migration/table/test state and the trigger if
   it failed before that explicit trigger removal. Do not claim automatic
   schema/database cleanup or continue other fixtures on this state.
4. After all connections have closed and evidence is retained, the database
   owner tears down only the dedicated database using the recorded provisioning
   method. No shared schema, unrelated role or production data is cleanup for
   this fixture. To repeat, provision a fresh database with absent `prism` and
   check the same permissions again. Retained successful or failed state is not
   an eligible starting point; `CREATE SCHEMA` will reject it.

> **Source evidence — pooled transaction setup and retained state**
>
> Claim: the transaction fixture requires an absent schema and its own creation authority, and retains database objects after success or failure.
> Implementation: [required URL, unconditional schema and migration slices](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/contracts/check-prism-postgres-transactions.mts#L7-L25), [function/trigger failure injection and successful trigger removal](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/contracts/check-prism-postgres-transactions.mts#L45-L53).
> Contract or setting: [separate transaction PostgreSQL CI selection](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L196-L223).
> Test evidence: [transaction/rollback assertions](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/contracts/check-prism-postgres-transactions.mts#L26-L44), [final probes, pool-only cleanup and result](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/contracts/check-prism-postgres-transactions.mts#L75-L79). Status: source-only; no SQL or fixture execution is asserted.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: pooled transaction assertions do not establish role grants, native admission or cleanup of the selected database.

### Prepare Prism native-dispatch databases

`verify:prism:native-dispatch` runs two processes in order. It is not the
transaction fixture selected by `KUBECLAW_PRISM_TRANSACTION_TEST_DATABASE` and
it does not launch a native Worker. Use a dedicated disposable PostgreSQL
server on loopback with pgvector available. Its administrator must be able to
create the database, login roles, extension and schema/grants. Initially it
must have only the non-template `postgres` database and no user role other than
the connected administrator; the first test refuses any other user database or
role. Do not use the transaction CI database or any populated/shared server.

1. The database owner provisions this empty server and records its exact
   loopback host/port and lifecycle/cleanup authority. Set
   `PRISM_NATIVE_OPERATION_TEST_ADMIN_URL` to its administrator connection to
   `/postgres`. Keep the credential out of retained transcripts. Ensure its
   authentication allows the subsequently created roles to log in with their
   fixture passwords; do not point these test identities outside this server.
2. Set `PRISM_NATIVE_OPERATION_TEST_DATABASE_URL` independently to the same
   server/port, database `/prism`, user `prism_runtime`, password
   `native-operation-runtime`. The first test creates that database and the
   `prism_migrator`, `prism_runtime`, `prism_readonly` roles with
   `native-operation-migrator`, `native-operation-runtime`, and
   `native-operation-readonly` passwords. They are fixed disposable fixture
   credentials, never production identities. Its child environment does not
   export this URL to the second process.
3. Check that both variables are selected, then run the maintained chain.

   ```sh
   set -eu
   : "${PRISM_NATIVE_OPERATION_TEST_ADMIN_URL:?Select the dedicated empty loopback server}"
   : "${PRISM_NATIVE_OPERATION_TEST_DATABASE_URL:?Select prism_runtime on that same server and /prism}"
   npm run verify:prism:native-dispatch
   ```

   The first test checks empty-server guards, creates roles/schema, migrates,
   checks concurrent reservation, writer death and durable receipt replay.
   The second checks the runtime login and real loopback transport refusal,
   retained attempt identity and SQL rejection of replacement. Exit zero with
   both tests completed is the required result. A refused Worker connection is
   an asserted negative case, not a failed test when its assertion passes.
4. Retain both test summaries and the first failure/skip, database/server
   identity and migration observation. Stop if the first process fails; the
   npm `&&` chain does not start the second. An empty-server/role guard means
   wrong or reused setup. Connection, extension or privilege errors mean
   database preparation failed. An assertion after preparation is a test
   failure, not permission to rerun setup against retained state.
5. The tests close connections and remove their own temporary files, but retain
   `prism`, all three roles and SQL rows. Keep that database between the two
   processes. After results and evidence are retained, its owner disposes only
   the dedicated server/data using the provisioning method from step 1. To
   repeat the full chain, provision a fresh empty server: repeating the first
   test on the retained one fails its guards. To investigate the second test,
   preserve the first test's state and real runtime URL; do not erase rows to
   force a pass.

> **Source evidence — ordered native dispatch**
>
> Claim: the two tests have separate admin/runtime authorities and retain database state between processes.
> Implementation: [admin guards, creation and migration](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/tests/native/operation-journal.mts#L19-L42), [journal connection/temp cleanup](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/tests/native/operation-journal.mts#L57-L61).
> Contract or setting: [runtime URL/user/database guards](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/tests/native/operation-http.mts#L15-L19).
> [role credentials/extension/grants](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/server/database-roles.ts#L43-L58).
> [ordered npm command](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L292-L292).
> Test evidence: [real refusal, retained identity and temp cleanup](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/tests/native/operation-http.mts#L21-L47). Status: source-only; no database or command execution is asserted.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: real SQL/refusal checks do not prove a running native Worker or live design delivery.

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
revision, operation/job IDs, and durable failure evidence. Use the concrete Prism caller in
[the debug map](#debug-a-component-through-its-local-caller) for local debugging. Stop your own listeners through their
signal path and confirm exit before removing disposable stores.

Update the affected Prism architecture/operator guide and run
`npm run docs:prism-guides:check` plus the [documentation-change chain](#documentation-change-chain).
A new API or stored field also needs contract compatibility and upgrade/rollback
rules; a successful fresh-database test does not cover old stored data.

Interpret Prism checks and service starts separately:

| Command/group | Expected completion and retained output | Failure/skip diagnosis, stop and cleanup |
| --- | --- | --- |
| selected component test + typecheck + contracts | Every selected test family completes with no failed/required skipped case and both contract/type checks exit zero. Retain generated-validator diff. | An invalid schema/generated validator or package import blocks consumers; an assertion is a component failure. Stop adjacent/native checks until diagnosed. Do not infer live readiness from PGlite. |
| transaction / native-dispatch / native-worker | Transaction needs its own fresh DB, absent `prism` schema and creation privileges; it retains schema/function/tables/rows and possible failed trigger state. Dispatch needs both ordered SQL authorities; Worker needs the opted-in original host/pool. Keep individual test/host/database results. | Missing variable or authority is failure/unexecuted, not a skip to count as success. Native cleanup failure stops admission. Use the database/host procedures for retained state and repeat rules. |
| helm / runtime-role / images | Each selected root command exits zero; keep template, role membership or exact image results by command. | Missing Helm/Docker/image access is prerequisite failure; wrong selected member or image input is assertion failure. Stop before service/live claims. Do not delete retained role/image identities. |
| Control / built Studio / native Worker start | Process remains at its configured listener only after accepted configuration; check the application route and dependency readiness from the linked operator procedure. Retain stderr and identity/request IDs. | Config/DB/trust/ownership error or early child exit is failed startup. Listening alone is not functional success. Stop only your listeners, confirm exit, then remove owned disposable stores; preserve unresolved Worker records. |

> **Source evidence — Prism startup and selection**
>
> Claim: component tests and real services have distinct entrypoints and configuration.
> Implementation: [package commands](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/package.json#L1-L44).
> [Control listener](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/server/control.ts#L1-L9).
> [native Worker startup](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/server/worker.ts#L12-L36).
> Contract or setting: [Control secrets/trust/endpoints](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/server/control-config.ts#L22-L59).
> [Studio configuration](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/server/studio-config.ts#L1-L18).
> [native transaction CI fixture](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L196-L223).
> Validation: start the selected service chain and run its native checks in the supported environment.
> Test evidence: no focused test is identified for this claim. Status: source-only; no execution result is asserted.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: service startup does not prove design publication, provider fidelity, or independent human acceptance.

## Change Registry storage or package discovery

The word Registry names two different boundaries. Foundation's plugin registry
owns discovery/admission/activation. An OCI image registry stores manifests and
blobs. Select the correct owner before testing.

For plugin registry changes, run:

```sh
set -eu
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
restart. Follow the [exclusive replacement and retained-run procedure](../use/plugins.md#5-replace-or-remove)
when testing same-ID package replacement. Use [Plugin Runtime](../understand/plugin-runtime.md) and the changed
[package guide](plugin-catalogue/README.md); run `docs:core-guides:check` and the
[documentation-change chain](#documentation-change-chain).

For local OCI Registry storage changes, use:

```sh
set -eu
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

Interpret the two Registry routes independently:

| Command/group | Expected completion and retained output | Failure/skip diagnosis, stop and cleanup |
| --- | --- | --- |
| plugin registry / import safety / installation / ownership | Every selected script exits zero after its registry/import/install assertions. Retain registration/activation denial output. | First distinguish missing sandbox/host setup from wrong identity/import/capability assertions. Stop; retain fixture state on failure and remove only its owned temporary tree after process exit. |
| OCI storage | Exit zero for selected storage/manifest assertions; no server or cluster proof. | Wrong configuration/manifest is a failed assertion. Stop before using its render as retention evidence; no production cleanup applies. |
| OCI native | Original Distribution starts on loopback, and write/restart/offline-GC assertions complete with exit zero. Retain actual binary/version and test summary. | Missing `KUBECLAW_REGISTRY_BINARY`, wrong version or early server exit blocks proof; inspect first stderr. Test closes its own server/removes temp storage; never run its GC against a live writer. |

> **Source evidence — Registry distinction**
>
> Claim: native OCI retention tests are separate from plugin registry validation.
> Implementation: [maintained OCI checks](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L288-L289), [original registry start and storage](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/integration/registry-local-gc.test.mjs#L14-L51).
> Contract or setting: [manifest retention, offline GC and restart checks](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/integration/registry-local-gc.test.mjs#L67-L87).
> Validation: run both the plugin registry contract checks and the native OCI checks. They protect different boundaries.
> Test evidence: [original registry start and storage](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/integration/registry-local-gc.test.mjs#L14-L51). Status: source-only; no execution result is asserted.
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
set -eu
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
Update the contract/example pages and generated references, then complete the
[documentation-change chain](#documentation-change-chain). Update the canonical
[SDK reference](../reference/sdk.md) and its
[complete export/member inventory](../reference/sdk-exports.md) for changes to
either entrypoint, public helpers/types/testing APIs, JSON and digest meaning,
source identity, compatibility or rejection behavior. SDK maintainers own the
product rules; documentation automation owns reference discovery and generation.
The extension contracts do not replace this API reference. This handbook owns
the contributor procedure, not a second manual export list.

Interpret the SDK chain at each boundary:

| Command/group | Expected completion and retained output | Failure/skip diagnosis, stop and cleanup |
| --- | --- | --- |
| SDK check → build | Freshness check exits zero for generated bytes; build exits zero and emits untracked declarations in SDK `dist`. | Stale generation requires canonical schema/generator; TypeScript errors need their source/consumer fix. Stop; retain diff/logs and remove only owned build output. |
| SDK package test | Exit zero means public-value assertions completed; retain the actual assertion output. | Rejected value/digest mismatch assertions differ from missing dependencies. Stop and inspect exact value/encoding before changing historical bytes. No daemon/store cleanup is needed. |
| verify:sdk:local + ownership | Aggregate completes every named portability/identity/durability/consumer test with no failure/required skip; owner check exits zero. Retain historical fixture and journal errors. | Missing Git/GNU lock blocks retained-state cases. Compatibility assertion failure stops release; retain original bytes and owned fixture evidence before temp cleanup. This is not complete API documentation. |

> **Source evidence — SDK boundary**
>
> Claim: public/testing exports, schema generation, and historical compatibility are separate responsibilities.
> Implementation: [SDK package exports](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/common/plugin-runtime/sdk/package.json#L1-L16), [local compatibility command](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L290-L290).
> Contract or setting: [schema generator](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/generate-plugin-sdk-types.mjs#L1-L33), [declaration-only build output](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/common/plugin-runtime/sdk/tsconfig.build.json#L9-L16).
> Validation: run the SDK value checks and portable JSON consumer checks with the required GNU lock executable.
> Test evidence: no focused test is identified for this claim. Status: source-only; no execution result is asserted.
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
set -eu
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
`docs:platform-specialist-guides:check` and the [documentation-change chain](#documentation-change-chain).
Stop only the fixture-owned delivery process; retain its authoritative journal
and checkpoint before removing temporary projections.

Interpret telemetry and observability results before claiming delivery:

| Command/group | Expected completion and retained output | Failure/skip diagnosis, stop and cleanup |
| --- | --- | --- |
| telemetry --check + wire tests | Generator comparison and every wire test complete with exit zero, no failed/required skipped case. Keep tool versions and compiler/test errors. | Missing Go/gofmt or source drift blocks interpretation; inspect the first tool/schema diagnostic. Stop; use the authority generator, not an edited expected wire byte. |
| observer / store / projection / replay tests | Each selected package/integration/reliability case completes; keep correlation, delivery and checkpoint assertions. | A failed ordering/redaction/store-limit assertion is failure, not missing-data success. Stop dependent reader claims; retain authoritative fixture records before removing derived temporary projections. |
| five pipeline observability scripts | Each completes its actual assertions with exit zero, using the separate absolute Go module route where selected. Retain delivery/attempt/reconciliation/view observations. | Missing absolute Go or locked-module download blocks the cross-language step; assertion/replay mismatch stops the rest. The check cleans its own temporary caches; do not delete a deployed spool/journal or checkpoint. |

> **Source evidence — telemetry generation and reconciliation**
>
> Claim: generated representations are byte-checked and pipeline reconciliation has distinct durability/reader checks.
> Implementation: [gofmt and byte drift behavior](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/generate-telemetry-contracts.mjs#L9-L39), [reconciliation check chain](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L84-L84).
> Contract or setting: [contract generator assertions and PATH Go invocation](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/contracts/telemetry/v1/tests/contracts.test.mjs#L130-L150).
> [separate Go module](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/contracts/pipeline-observability/v1/go/go.mod#L1-L5).
> [dependency lock](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/contracts/pipeline-observability/v1/go/go.sum#L1-L2).
> [absolute Go invocation and cache cleanup](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/contracts/check-pipeline-observability-contracts.mts#L45-L52).
> Validation: regenerate the telemetry contracts, check the store, and run the selected native chain.
> Test evidence: [contract generator assertions and PATH Go invocation](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/contracts/telemetry/v1/tests/contracts.test.mjs#L130-L150). Status: source-only; no execution result is asserted.
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
set -eu
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
set -eu
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
`docs:inventory:local-helm:check`, and the [documentation-change chain](#documentation-change-chain) after
those generators are current. Remove only disposable render output. A GitOps
rollback selects a prior deployment; it does not delete retained PVCs or restore
database contents.

Interpret each local Chart/GitOps command before rollout:

| Command/group | Expected completion and retained output | Failure/skip diagnosis, stop and cleanup |
| --- | --- | --- |
| role chart / deployment truth / Helm lint | All exit zero for the selected role/configuration assertions. Retain the actual profile/tool versions and diagnostics. | Missing Helm differs from template/object assertions. Stop rendering dependent profiles until repaired. No cluster resource is created by these checks. |
| Helm template | Exit zero and a newly written render contain the intended selected objects/identities and changed branches. Keep the render/diff. | A failed redirect can leave an empty/partial output file; retain error and do not inspect it as a valid render. After evidence retention remove only your exact disposable render path. |
| GitOps/code/config/deployment release tests + versions check | All families complete without failed/required skipped cases; versions check exits zero for selected inputs. Retain export/selection/identity errors. | First inspect stale input or exact selection/receipt mismatch. Stop live synchronization/promotion. Fixture temp work is not a production resource or database rollback. |

> **Source evidence — Chart and GitOps route**
>
> Claim: role rendering, selection checks, and live synchronization are different boundaries.
> Implementation: [CI role render](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L60-L79), [selection check chain](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/update-checks.yaml#L24-L52).
> Contract or setting: [rollback's preserved data/resource limit](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/rollback-runtime.yaml#L47-L64).
> Validation: render the selected configuration locally, then qualify its admission and rollout in the authorized target cluster.
> Test evidence: no focused test is identified for this claim. Status: source-only; no execution result is asserted.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: local YAML/selection tests do not prove a live admission, restore, or rollout.

## Change Ops MCP

Owner: Ops MCP maintainers. The source entrypoint is
`tools/ops-mcp/src/server.mjs`; its package has independent dependencies.
Before package tests, install its separate lockfile as described above and check
the real OpenSSL CLI. The [TLS fixture](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tools/ops-mcp/test/kubernetes.test.mjs#L12-L17) invokes `openssl req` with `-x509`,
`-newkey rsa:2048`, `-nodes`, `-days`, `-keyout`, `-out`, `-subj`, and `-addext`
for a localhost subject alternative name. Node TLS alone is not this tool.

```sh
set -eu
command -v openssl
openssl version
openssl req -help
```

The help must include these options, especially `-addext`. Stop for a missing
CLI or unsupported option. The fixture creates temporary test keys/certificates,
closes its loopback TLS server and removes its own temporary directory. Never
supply a production certificate or cluster credential to make this fixture pass.
Then run:

```sh
set -eu
npm test --prefix tools/ops-mcp
```

Exit zero with no failed or required skipped tests establishes the selected
package assertions. A missing OpenSSL process, invalid fixture certificate or
child exit before readiness is setup failure; inspect the first stderr/error
and separate dependency install before rerunning. Keep the actual test summary
and errors. Do not continue to image/live claims after a failed package test.
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
> Prerequisite: prepare the isolated workspace dependencies, including `yaml`, before running the policy assertions.
> Test evidence: no focused test is identified for this claim. Status: source-only; no execution result is asserted.
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
run `docs:platform-specialist-guides:check` and the
[documentation-change chain](#documentation-change-chain).

> **Source evidence — MCP local and image boundary**
>
> Claim: bearer authentication stays required locally, while unavailable Kubernetes reads remain errors.
> Implementation: [listener configuration](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tools/ops-mcp/src/config.mjs#L1-L23), [authentication source/rotation](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tools/ops-mcp/src/authentication.mjs#L4-L38).
> Contract or setting: [Ops package scripts](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tools/ops-mcp/package.json#L1-L22), [CI package/image separation](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/build-ops-mcp.yaml#L62-L113).
> Required fixture: [local tool/read fixture](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tools/ops-mcp/test/local.test.mjs#L10-L50). Install the separate locked dependencies, including `@modelcontextprotocol/server`, before running it. A child exit before listener readiness is a startup failure.
> Test evidence: [local tool/read fixture](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tools/ops-mcp/test/local.test.mjs#L10-L50). Status: source-only; no execution result is asserted.
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
set -eu
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
Prism or platform guide check and the [documentation-change chain](#documentation-change-chain).

Interpret UI outcomes and retained output:

| Command/group | Expected completion and retained output | Failure/skip diagnosis, stop and cleanup |
| --- | --- | --- |
| Studio typecheck / domain | Both complete with exit zero and no failed/required skipped case. Keep validator diff and domain/type errors. | Invalid generated schema/type or operation assertion stops build/browser claims; diagnose that first. |
| Studio build | Exit zero produces `dist-studio`; prebuild can regenerate validators. Retain build/validator diff. | Build/prebuild error stops server/browser checks. Partial `dist-studio` is not a valid build. Keep logs, then remove only owned build output. |
| Studio / remediation browser checks | Node prerequisites and Playwright cases complete; retain failing reports/screenshots and request/revision IDs. | Missing browser/library or wrong port-4190 server is setup failure. A failed browser assertion is UI failure. Stop; close only the owned test server before retry; do not count reused unrelated server output. |
| Vite dev / Archviewer native | Vite listening supports local editor development, not deployed readiness. Archviewer requires original nginx/OpenSSL and authenticated/negative-read assertions to complete. | Missing source document/404 is not publication success. Keep browser/nginx logs, confirm owned process exit and preserve source documents before temp cleanup. |

> **Source evidence — UI routes**
>
> Claim: Studio development, build, browser checks, and native Archviewer are separate routes.
> Implementation: [Studio scripts](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/package.json#L15-L36), [browser viewports and managed server](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/studio/playwright.config.mjs#L1-L7).
> Contract or setting: [static authenticated document route](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/docker/archviewer.nginx.conf#L1-L19), [native service group](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/reliability-tests.mjs#L11-L38).
> Required fixtures: [actual nginx authentication and failure controls](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/reliability/archviewer-native.test.mjs#L10-L56); run these in the supported nginx and browser environments.
> Test evidence: [actual nginx authentication and failure controls](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/reliability/archviewer-native.test.mjs#L10-L56). Status: source-only; no execution result is asserted.
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
A failed scan is not an empty finding set. The scan script retains reports in
`dist/trivy` by default (or `KUBECLAW_TRIVY_REPORT_DIR`); keep that exact report
path and its image identity before removing only owned disposable reports.

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
set -eu
npm run test:engine:native-retention --prefix skills/prism -- --max-retained-growth-bytes="$RETENTION_BUDGET_BYTES"
```

The package command enables explicit garbage collection. It checks three
measurement windows and bounded parent retention, not child RSS or Control
restart. Do not infer a capacity guarantee from a single unit
fixture. Keep overload/backpressure, abort/cleanup, invalid input, and repeated
or concurrent requests in the change-specific proof. Retain failed budgets;
change a budget only with a recorded requirement and comparable evidence.

Interpret security/performance results without changing their acceptance inputs:

| Command/group | Expected completion and retained output | Failure/skip diagnosis, stop and cleanup |
| --- | --- | --- |
| capability/isolation tests / scanner | Selected checks complete with exit zero and no required skip. Scanner result is bound to the exact selected image and available advisory data. | Missing launcher/cgroup/scanner/database is setup failure; denial/budget/security finding is its own result. Stop; retain denial/error reports and digest. Never turn unavailable scan into zero vulnerabilities. |
| journal scale | Exit zero means replay/append/tail assertions and its fixed coarse append ceiling completed; retain load/elapsed/environment data. | Missing GNU lock or failed ceiling/assertion stops comparison. Preserve the failure; the fixture removes its owned temporary root, not deployed journals. |
| Prism native retention | Exit zero means three measurement windows stayed within the predeclared parent-retention budget. Keep budget, window values and browser/tool identity. | Missing explicit GC/browser or invalid budget blocks measurement. Budget exceedance is regression evidence, not permission to choose a larger budget after the run. Keep failure and close only owned capture/browser resources. |

> **Source evidence — security and scale limits**
>
> Claim: scanner data and journal scale checks require real dependencies and have bounded proof.
> Implementation: [scanner report and nonzero failure contract](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/scan-runtime-images.sh#L118-L145).
> [real security database setup](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L174-L194).
> [journal load, timing and cleanup](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/contracts/check-nova-journal-scale.mts#L7-L37).
> Contract or setting: [required predeclared retention budget](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/integration/engine-capture-retention.mts#L10-L29).
> [retention measurement and limit](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/integration/engine-capture-retention.mts#L98-L136).
> [explicit-GC retention command](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/skills/prism/package.json#L31-L31).
> Prerequisite: journal scale checks require GNU `flock`. Verify that executable before measuring, and retain the actual timing, exit status, and output.
> Test evidence: [journal load, timing and cleanup](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/tests/verification/contracts/check-nova-journal-scale.mts#L7-L37). Status: source-only; no execution result is asserted.
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
| [promote-runtime.yaml](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/promote-runtime.yaml#L1-L59) | Manual family/source-run selection | Verifies successful main run, receipt and digest; scans without rebuilding. Runtime opens a release-selection PR with GitHub App identity. Ops commits the release and bootstrap selection directly to main using github.token; it does not open that PR. |
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
`GITHUB_TOKEN` for packages. Manual runtime promotion and dependency updates use
`DEPENDENCY_APP_ID` and `DEPENDENCY_APP_PRIVATE_KEY` to create the App write identity.
Manual Ops promotion instead uses `github.token` with `contents: write` for its direct main push.
A rejected push is a failed promotion, not an opened PR or a completed selection.
Do not bypass repository protection or substitute credentials to force that push.
Optional Prism live checks use `PRISM_TEST_KUBECONFIG_B64` and `PRISM_E2E_USER`;
the client must not create arbitrary namespaces and must be able to create the
controller lease. Do not transfer these secrets to a local unit test.
Retain run ID/attempt, full source commit, job results, image digests, receipt
assets, bundle checksums, scans and failed logs. A missing artifact or a cancelled
run is missing proof, not a passed merge/release gate.

> **Source evidence — workflow authority**
>
> Claim: trigger, trust, conditional image build, and promotion are separate controls.
> Manual promotion authority: [Ops direct main push](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/.github/workflows/promote-runtime.yaml#L80-L92);
> [runtime App identity and release-selection PR](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/.github/workflows/promote-runtime.yaml#L93-L130).
> Implementation: [image dependency/matrix selection](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/build-images.yaml#L1-L50).
> [optional live identity](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/build-images.yaml#L188-L224).
> [read-only documentation job](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/docs-checks.yaml#L1-L19).
> Contract or setting: [Ops event boundary](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/build-ops-mcp.yaml#L1-L50).
> [promotion source-run verification](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/promote-runtime.yaml#L1-L59).
> [daily scan failure tracking](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/release-security.yaml#L1-L43).
> Required CI checks: [shard/native/service jobs](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L82-L137).
> [browser/security jobs](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L139-L194).
> [native PostgreSQL job](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/pipeline-reliability.yaml#L196-L223). Retain the selected run and its artifacts.
> Test evidence: no focused test is identified for this claim. Status: source-only; no execution result is asserted.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: workflow source cannot establish branch-protection settings, available secrets, or actual job execution.

## Versions and release selection

`versions.json` owns selected tools, base images/digests, image-specific
overrides, infrastructure images/charts, and automation images. Package
lockfiles own npm dependency resolution. A contract schema version, package
version, source commit, image digest, code-bundle digest, and deployment commit
identify different things. Do not use one as proof of the others.

For a selected tool/base change:

1. Change `versions.json` and inspect every affected image/tool consumer. Save
   the pre-update diff so that you can distinguish your authored change from
   generated output.
2. Prepare the conditional lock-resolution route **before** synchronization.
   The command first writes version-derived inputs, then updates runtime-tool
   locks. If receipt input/output hashes still agree, the lock updater returns
   without running uv or Go. A stale/missing receipt or changed tool input
   enters actual resolution: `uv pip compile` resolves Python 3.11 binary-wheel
   locks through PyPI for x86_64 and aarch64; Go resolves/downloads its selected
   tool modules. Prepare network access to those selected package sources.
   The repository does not select a uv version; use a real uv CLI that supports
   the updater's options, and retain its version. Do not invent a pinned uv
   installation or substitute pip for this route.

   ```sh
   set -eu
   command -v uv
   uv --version
   uv pip compile --help
   command -v go
   env GOTOOLCHAIN=local go version
   node --input-type=module -e 'import fs from "node:fs"; console.log(JSON.parse(fs.readFileSync("versions.json", "utf8")).buildArgs.GO_VERSION)'
   ```

   Verify support for `--python-version`, `--python-platform`, `--generate-hashes`,
   `--only-binary`, `--no-annotate`, `--no-header`, `--no-strip-extras`,
   `--default-index`, and `--constraints`. PATH Go must exactly equal the new
   selected central `GO_VERSION` (1.26.5 at the cited baseline). Automatic
   toolchain downloads are disabled by `GOTOOLCHAIN=local`; a merely compatible
   root-module Go or documentation Go does not satisfy this updater.
3. Run `npm run versions:sync`. Exit zero must leave consistent version-derived
   consumers, all Python/Go lock outputs and the receipt. Inspect the complete
   diff, including `docker/python-tools/*.in`/`*.txt`,
   `docker/go-tools/requirements.json`, `go.mod`, `go.sum`, and
   `docker/runtime-tool-locks.json`. An unchanged valid receipt can mean no lock
   diff; it does not mean the resolution branch was exercised.
4. On failure, stop before image/build/release steps. The version writer or
   earlier Python/Go resolution can already have changed files. The updater
   writes the receipt only after both resolutions succeed; a failed run does
   not certify partial locks. Retain the partial diff and first error. For
   `RUNTIME_GO_TOOLCHAIN_NOT_SELECTED`, select the exact Go. For unavailable uv,
   downloads or architecture mismatch, correct that prerequisite or incompatible
   selection. Retry the same synchronization after diagnosis, then inspect its
   entire diff again. To abandon the change, restore only your recorded authored
   and generated changes, never someone else's work or a whole-tree reset.
5. Run the stable checks in order.

   ```sh
   set -eu
   npm run versions:check
   node --test tests/verification/deployment/versions.test.mjs tests/verification/deployment/runtime-tool-locks.test.mjs
   ```

   Exit zero with both test families completed proves their consistency
   assertions. `RUNTIME_TOOL_LOCK_DRIFT` or stale version output requires a
   successful reviewed sync, not a manual receipt edit. No required skip or
   missing command is a completed check. Retain exit/logs and generated diff;
   updater temporary constraints are removed by its `finally` cleanup.
6. Run the changed component/image/native check. A version generator does not
   prove that the executable works on both architectures. Update compatibility,
   operator/release explanations and the
   [documentation-change chain](#documentation-change-chain). Keep old identities
   available while recovery still references them.

The following sources define the conditional updater and partial-write boundary:
[receipt fast path and update order](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/runtime-tool-locks.mjs#L72-L86).
[uv platforms/options and exact Go](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/runtime-tool-locks.mjs#L36-L69).
[sync command sequencing](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/package.json#L283-L284). This describes expected source behavior, not an observed updater run.

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
source run and materializes values from its exact receipts. Manual runtime
promotion opens a release-selection PR using the GitHub App identity. Manual
Ops promotion instead commits the release and bootstrap selection directly to
`main` using `github.token`; there is no intervening selection PR to merge.
Automatic production selection is a separately enabled workflow. When continuous
GitOps is active, merging the runtime selection authorizes Argo to apply it.
For Ops, the successful direct push is the selection boundary; a configured
controller can reconcile the changed bootstrap selection without a later PR merge.
Authorize the family-specific write before starting manual promotion. A release
selection is not always a harmless metadata-only change.

For release-tool changes, run:

```sh
set -eu
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

Interpret release-tool fixtures separately from release operations:

| Command/group | Expected completion and retained output | Failure/skip diagnosis, stop and cleanup |
| --- | --- | --- |
| receipt/image/config/code-release tests | Every selected family completes without failed/required skipped cases; retain exact identity/checksum/materialization diagnostics. | Missing Helm/Git is setup failure; rejected receipt/digest/signature or selection is failed assertion. Stop promotion; never substitute a tag/new image for an unavailable old digest. |
| continuous / release GitOps tests | Both complete with exit zero; local selection/export behavior is checked. Keep test summaries and diffs. | A partial export or retained-selection assertion fails the route. Stop; remove only fixture-owned temporary outputs after retaining failure, not installed resources. |
| actual promotion / rollback | Requires its distinct authorized workflow/identity, retained receipts and maintenance health/data checks. Retain run/job results and selected deployment commit. | Missing artifact, cancelled workflow, failed scan or irreversible data change blocks release/recovery. Use the linked maintenance/recovery stop rules; local tests are not authorization or deployed success. |

> **Source evidence — version, receipt, promotion, rollback**
>
> Claim: generated versions and immutable release selection have separate authorities; rollback does not restore data.
> Implementation: [central tool/image inputs](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/versions.json#L1-L59).
> [version command interface](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/versions.mjs#L178-L181).
> [image receipt creation](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/build-images.yaml#L86-L105).
> Contract or setting: [bundle checksums/source release](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/build-images.yaml#L142-L178).
> [GitOps promotion consequence](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/promote-runtime.yaml#L84-L113).
> [rollback contract](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/rollback-runtime.yaml#L1-L35).
> [rollback safety limit](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/.github/workflows/rollback-runtime.yaml#L47-L64).
> Validation: build the selected image and qualify publication, promotion, and rollback as separate operations with their required identities.
> Test evidence: no focused test is identified for this claim. Status: source-only; no execution result is asserted.
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
| SDK schema/export/helper | [SDK reference](../reference/sdk.md), [export and member inventory](../reference/sdk-exports.md), [extension contracts](contracts.md) and examples | SDK maintainers own the product contract; documentation automation owns the reference and generated inventory. Run SDK generation/compatibility/consumer checks, `npm run docs:sdk:check`, and the documentation-change chain. |
| Plugin manifest/registration/config | [package catalogue](plugin-catalogue/README.md), supported extension guide | Package + Foundation maintainer; inventory/publication and package checks |
| Buster plan/provider/fixture/report/error | [Buster suite reference](../reference/buster-suites.md), Buster change guide | Buster maintainer; resolver/provider/import checks and Buster guide |
| Prism schema/service/domain/data/Studio | [Prism change guide](platform/prism.md), linked mechanism and operator task | Prism maintainer; component/contract/native checks and Prism guide |
| Event/store/telemetry/endpoint/secret | [telemetry](../understand/telemetry.md), communication/data/security references | Source owner + telemetry/platform; generated surface and platform guide checks |
| Chart/values/environment/deploy input | [configuration precedence](../reference/configuration-precedence.md), install/maintenance | Deployment maintainer; config/Helm generation, render and mapped guide checks |
| Version/receipt/release/GitOps | This release route and [maintenance](../use/maintenance.md) | Release/deployment maintainer; version/receipt/selection checks |
| Ops MCP tool/auth/namespace | [Ops MCP](../understand/ops-mcp.md), trust/endpoints | Ops maintainer; tool inventory, package/image and platform guide checks |
| UI view/operation/preview | Studio or [Archviewer](../understand/archviewer.md) | UI + source-data owner; browser/native reader and mapped guide checks |

### Update protected Core source revisions

Use this procedure when a Nova, Worker or Plugin Runtime change makes
`npm run docs:core-guides:check` report changed source bytes. An **immutable
revision** is a full Git commit whose stored bytes remain available by its
40-character SHA. A working-tree diff, branch name or refreshed digest is not
such a revision. Nova and developer-experience maintainers own the source/guide
inspection; documentation automation owns common inventories and generation.
Use an isolated branch with a real configured Git author identity. Do not
commit another contributor's files or invent identity/remote availability.

The selected checker currently fixes
`4f089958db97a551f406c157d774bda143a38946` in
`scripts/check-core-architecture-guides.mjs`. It protects exactly these three
canonical guides as one source-revision set:

- [Nova Core](../understand/nova-core.md)
- [Plugin Runtime](../understand/plugin-runtime.md)
- [Worker Core](../understand/worker-core.md)

Each page's `Evidence revision`, every linked repository source SHA, and the
checker's `revision` constant must agree. The checker compares **whole linked
files**, not only the displayed range, with `git show` at that SHA. An unrelated
line change in a linked file therefore still needs inspection and repinning.
It also checks required content, link ranges, capability/error explanations and
navigation. Changing the constant alone cannot establish a correct explanation.

1. Before editing, retain the clean baseline commit and exact original bytes of
   the changed source/tests, all three guides, this handbook's affected
   callouts, the checker, `docs/generated/inventory/documentation-source-revision.json`,
   and generated inventory/reference/map output. Record baseline results. For
   the lifecycle exercise, the task's `671234b056bf5f5f503e51e8db30f843e781ba6e`
   remains the original product baseline; it is not the later changed revision.
2. Inspect the actual changed implementation, its callers, compatibility and
   test results. Update the affected explanation and diagnostic/recovery
   instructions. Commit the genuine changed product source and focused tests
   on the isolated branch. Use `git status --short` and `git diff` to select
   only intended paths; stage those exact paths, then run `git commit` with a
   descriptive message. Do not stage a whole shared tree. For the bounded Nova
   exercise, set `NOVA_EXERCISE_TEST_PATH` to the exact focused test file that you
   authored in this scratch checkout, inspect the staged diff, and commit only
   that file and the changed recorder. For another Core change, select its
   actual owning paths instead; do not stage unrelated changes.

   ```sh
   set -eu
   : "${NOVA_EXERCISE_TEST_PATH:?Select the exact authored scratch test path}"
   git add -- skills/nova/core/execution/run-decisions.ts "$NOVA_EXERCISE_TEST_PATH"
   git diff --cached --check
   git diff --cached
   git commit -m "Exercise: bounded administrative retry diagnostic"
   CORE_SOURCE_REVISION="$(git rev-parse HEAD)"
   git cat-file -e "$CORE_SOURCE_REVISION^{commit}"
   git show --stat --oneline "$CORE_SOURCE_REVISION"
   ```

   Confirm this commit contains the changed source, not merely the old baseline
   or a documentation-only commit. The full SHA is the Core guides' new source
   authority. Verify every source file linked by all three guides still matches
   that commit; if another linked source changes, inspect and commit it before
   selecting the final `CORE_SOURCE_REVISION`. Keep narrow line ranges and
   meaningful symbol labels after shifts. Never refresh a digest or pin without
   reading the changed meaning and its callers/tests.
3. Update all three guides' `Evidence revision` and every repository source URL
   to this same `CORE_SOURCE_REVISION`, even where that guide's source is
   unchanged. Preserve correct reasons/limits and update `Last verified` with
   the actual inspection scope/date, not a fabricated execution claim. Update
   each affected callout's revision/range and any handbook callout whose source
   meaning changed. In the scratch branch, update the checker's existing
   `revision` constant to that same SHA. Keep its equality, content, capability,
   diagnostic, navigation and range guards intact. Then run:

   ```sh
   set -eu
   npm run docs:core-guides:check
   ```

   Exit zero with its `ok` result means these guards passed locally, not that
   remote links or product behavior passed. A source-equality failure means
   the selected immutable source is stale or incomplete; inspect that exact
   file and repeat steps 2–3. A missing-content/code/capability/range failure
   needs the real explanation/source fix. Stop before common generation rather
   than weaken a guard. Record the first error and any partial guide diff.
4. Commit the inspected checker and authored guide/metadata changes. This
   second commit is a **documentation authority revision**: it includes the
   actual current checker/tool/source inputs. It can differ from the Core
   source SHA because the checker itself changed after step 2. At this commit,
   all source files linked by the Core guides must still equal their selected
   Core source bytes. Capture and verify the common authority:

   ```sh
   set -eu
   DOCS_AUTHORITY_REVISION="$(git rev-parse HEAD)"
   git cat-file -e "$DOCS_AUTHORITY_REVISION^{commit}"
   git diff --exit-code "$DOCS_AUTHORITY_REVISION" -- . ':!docs/generated/**' ':!docs/site/**'
   git ls-files --others --exclude-standard
   ```

   The tracked non-generated/non-site source diff must be empty. Inspect the
   untracked list and stop for any undeclared source/tool input; a generator
   rejects such inputs outside its two output prefixes. Commit each genuine
   input before selecting a new authority. Do not pass a dirty candidate as a
   clean change revision or use the isolated-mutation override for this route.
   After capturing this immutable authority, refresh handbook callouts that
   describe the changed checker/tool itself to `DOCS_AUTHORITY_REVISION`, and
   update the handbook's stated checker selection to the actual
   `CORE_SOURCE_REVISION`. The three protected guides still use the Core source
   SHA; the checker implementation's own link can need the later authority SHA.
   These authored site updates can follow the authority commit because the
   common source guard excludes `docs/site/`. A further checker/tool/source
   change cannot: inspect and commit it, then recapture the authority.
5. Prepare the documentation parser/render tools named above. Refresh the
   common source inventories in dependency order, using their write modes only
   after reading any affected authority. The configuration route requires its
   current local Helm/schema inputs; it is not a product deployment or test.

   ```sh
   set -eu
   npm run docs:inventory
   npm run docs:inventory:local-helm
   npm run docs:inventory:config
   npm run docs:inventory:check
   npm run docs:inventory:local-helm:check
   npm run docs:inventory:config:check
   node scripts/docs-generate.mjs --revision "$DOCS_AUTHORITY_REVISION" --update-source-revision
   npm run docs:generate:check
   npm run docs:governance:generate
   npm run docs:governance:check
   npm run docs:core-guides:check
   ```

   The explicit generator command writes the common source-revision lock and
   owned reference output. It must use a real full local commit containing all
   current source/tool inputs. Its `--check` mode cannot update the lock.
   Inspect the entire intended inventory/reference/map diff, including partial
   writes after a failure. Unsupported parser input or a revision mismatch
   blocks the chain: diagnose and commit the real source/tool correction,
   reselect the authority, then repeat inventory generation/checks. The local
   Helm maintenance generator can write `scripts/docs-local-helm-field-authorities.json`,
   which is a source/tool authority outside the two output prefixes. If its
   reviewed content changes, stop before the common reference generator,
   inspect and commit that real authority with step 4, capture the resulting
   `DOCS_AUTHORITY_REVISION`, then repeat the inventory checks. Do not ignore
   this non-output diff or keep using the earlier commit. Do not
   hand-edit generated facts or refresh their digests to hide a failure.
   Once these steps pass, resume the canonical documentation-change chain below
   from its stable checks and then its staging/renderer boundary. Retain every
   real error/skip and generated diff. Commit generated output separately from
   the source/authority commits; do not mix later source changes into it.
6. For delivery, the selected source/authority commits must exist at the
   repository host before their public source URLs can be advertised as
   available. Local-only scratch commits can support Git/equality/generation
   observations; their GitHub links remain unavailable until genuine publication.
   Local Markdown staging is not rendered-site, remote-link or live evidence.
   If a required remote/renderer environment is absent, stop that part and
   record it as unverified, not passed. Retain source/authority/output commit
   identities, check results and source equality before retiring a scratch tree.

> **Source evidence — protected Core guide revision guard**
>
> Claim: one hardcoded revision controls the three Core guides, and the checker compares each linked current file with immutable Git source before checking its ranges.
> Implementation: [shared revision](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/check-core-architecture-guides.mjs#L9-L10).
> [Nova guide selection](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/check-core-architecture-guides.mjs#L20-L23).
> [Plugin Runtime guide selection](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/check-core-architecture-guides.mjs#L52-L54).
> [Worker guide selection](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/check-core-architecture-guides.mjs#L77-L79).
> [guide metadata, all link revisions and whole-file equality](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/check-core-architecture-guides.mjs#L103-L132).
> Contract or setting: [common generator full-commit selection and lock-write boundary](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/docs-generate.mjs#L24-L52).
> [common tracked/untracked source guard](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/docs-generate.mjs#L54-L69).
> [required navigation and surface checks](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/check-core-architecture-guides.mjs#L142-L157).
> The common generator independently owns `docs/generated/inventory/documentation-source-revision.json` and rejects current source/tool inputs not in its selected full commit.
> Test evidence: [local terminal guard result fields](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/check-core-architecture-guides.mjs#L300-L306). Status: source-only; no change-repin execution is asserted.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e` for the unchanged selected Core checker and the cited common source-revision/write guards. The current common generator has additional source changes; these narrow unchanged guards do not certify its full current implementation.
> Limit: local equality/metadata success does not prove source URL availability, complete semantic correctness, rendered output or the changed lifecycle task.

### Documentation-change chain

Run this one chain from repository root after the source and reader explanation
are stable. Component sections add their specific guide/inventory checks; they
do not define another common chain. Root locked dependencies are required.
If a selected generator reaches configuration/API discovery, prepare the
[documentation tools](#add-tools-and-credentials-only-for-the-selected-route)
and its current source revision first. For a protected Core source change,
complete [the source-revision procedure](#update-protected-core-source-revisions)
before these stable checks. A stale revision or unsupported parser input is a
blocked generation step, not permission to omit the source.

1. Identify the changed source in the generated page map and update its authored
   explanation and metadata. If metadata or source dependencies changed, run
   `npm run docs:governance:generate`. If source-derived facts changed, run their
   registered generator, then `npm run docs:generate` for the affected reference
   sections. Plugin catalogue/operator matrix changes use
   `npm run docs:publication:generate`. Do not run write commands for an
   unrelated prose-only edit. Never hand-edit a generated section.
2. Inspect the generated diff before continuing. Each write must finish with
   exit zero and update only its owned facts. A failure can leave earlier files
   written. Retain the partial diff and first error, fix the source/tool/revision
   cause, and rerun the same generator. Do not reset another author's files or
   treat a partial tree as current.
3. Run the stable read-only checks below in order, stopping at the first error.
   Run the component's named guide/inventory checks before publication checking.

   ```sh
   set -eu
   npm run docs:governance:check
   npm run docs:generate:check
   npm run docs:check:refs
   npm run docs:site-boundary:check
   npm run docs:publication:check
   ```

4. Stage the approved Markdown and assets for inspection.

   ```sh
   set -eu
   npm run docs:publication:build
   ```

   This replaces `.tmp/docs-publication` with staged Markdown, approved assets,
   and `build-report.json`. It does not render HTML or run a site server. Inspect
   the staged links/assets and report, then inspect the actual renderer's output
   through [documentation governance](../reference/documentation-governance.md).
   Staging does not prove rendered anchors, routes, accessibility, search, or
   browser behavior. If no renderer output is available, retain that explicit
   unverified result; do not call the Markdown tree a rendered site.

| Step/check | Required result and retained output | First diagnosis and stop/cleanup rule |
| --- | --- | --- |
| Metadata/source generators | Exit zero; intended generated page/map changes only. Keep the diff, generator, tool versions and selected revision. | Read the first source/revision/parser diagnostic. Stop before checks on a partial write; repair and rerun. Preserve authored content and unrelated output. |
| Governance / generated reference checks | Both exit zero; no tracked write in check mode. | A stale-output error requires the owning generator. A missing owner/source route requires its metadata, not a manual map patch. Stop the chain. |
| Reference / reader-boundary checks | Exit zero with no unresolved link, fragment or internal-reader-content error. | Open the named destination or prose location. Fix that exact defect before retry. They do not prove published HTML. |
| Publication check | Exit zero for its helper tests and publication-input checks. Retain individual test failures/skips. | A nonzero exit or skipped required test stops staging. Check allowance, metadata and reported source boundary first. |
| Publication build | Exit zero and a fresh Markdown/assets report in `.tmp/docs-publication`. | A nonzero exit is failed staging, even if old output exists. Retain the report/diff first; remove only this owned staging tree when no inspection uses it. |
| Actual renderer inspection | Retain the real rendered page/route/anchor results separately. | Missing renderer or failed request means unverified/failed rendering. Never infer it from the staging report. |

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
> Implementation: [map inputs and check routing](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/docs-governance.mjs#L85-L105).
> Contract or setting: [authored/generated page classification](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/docs-governance.mjs#L63-L80), [Markdown staging and approved asset copy](https://github.com/datrab/kubeclaw/blob/671234b056bf5f5f503e51e8db30f843e781ba6e/scripts/docs-publication.mjs#L993-L1028).
> Validation: regenerate affected references and inspect staged Markdown/assets. Inspect actual rendered routes and anchors separately; staging does not provide them.
> Test evidence: no focused test is identified for this claim. Status: source-only; no execution result is asserted.
> Revision: `671234b056bf5f5f503e51e8db30f843e781ba6e`.
> Limit: the map routes known dependencies; it does not prove a semantic explanation complete or an unknown source surface discovered.

> **Source evidence — publication input selection**
>
> Claim: publication staging selects explicitly classified regular Markdown pages and separately allowed regular assets; it rejects symlinks and unexpected inputs.
> Implementation: [publicationPages classification and regular-file guards](https://github.com/datrab/kubeclaw/blob/30824cc555fa2623142752646f26dcc43072b5f7/scripts/lib/docs-publication-assets.mjs#L25-L59).
> Contract or setting: [separate asset allowance](https://github.com/datrab/kubeclaw/blob/30824cc555fa2623142752646f26dcc43072b5f7/scripts/lib/docs-publication-assets.mjs#L5-L23), [publicationAssets regular-file and allowance guards](https://github.com/datrab/kubeclaw/blob/30824cc555fa2623142752646f26dcc43072b5f7/scripts/lib/docs-publication-assets.mjs#L62-L79).
> Test evidence: [selected/unexpected-page tests](https://github.com/datrab/kubeclaw/blob/30824cc555fa2623142752646f26dcc43072b5f7/scripts/tests/docs-publication-assets.test.mjs#L67-L85), [unexpected/symlink asset tests](https://github.com/datrab/kubeclaw/blob/30824cc555fa2623142752646f26dcc43072b5f7/scripts/tests/docs-publication-assets.test.mjs#L43-L65). Status: source-only; no execution or rendered result is asserted.
> Revision: `30824cc555fa2623142752646f26dcc43072b5f7` for this input selector. The earlier staging implementation is separately pinned above.
> Limit: selecting/copying reader inputs does not create HTML or prove rendered page/route/anchor behavior.

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

A change check is complete only after its exact command finishes in the
supported environment and you record its required observations. Native
execution, rendered charts, target images, deployment, live dependencies,
release operations, and platform restore each require their own results.
