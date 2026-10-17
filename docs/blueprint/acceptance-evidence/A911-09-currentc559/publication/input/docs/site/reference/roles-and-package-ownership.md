# Roles and package ownership

Status: current source reference
Audience: operator, package maintainer, plugin author, developer
Owner: runtime packaging, Nova, Buster, Prism, and Worker Core maintainers
Evidence: [charts/kubeclaw/templates/deployment.yaml](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/charts/kubeclaw/templates/deployment.yaml); [charts/kubeclaw/values.yaml](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/charts/kubeclaw/values.yaml); [packaging/runtime/external-capabilities.json](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/packaging/runtime/external-capabilities.json); [packaging/runtime/package-ownership.json](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/packaging/runtime/package-ownership.json); [packaging/runtime/roles/buster.json](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/packaging/runtime/roles/buster.json); [packaging/runtime/roles/nova.json](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/packaging/runtime/roles/nova.json); [packaging/runtime/roles/prism.json](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/packaging/runtime/roles/prism.json); [scripts/build-runtime-role-bundle.mjs](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/scripts/build-runtime-role-bundle.mjs); [scripts/check-runtime-role-manifests.mjs](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/scripts/check-runtime-role-manifests.mjs); [skills/buster/engine/remote-plan-cli.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/buster/engine/remote-plan-cli.ts); [skills/buster/engine/test-gates/production.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/buster/engine/test-gates/production.ts); [skills/buster/engine/test-gates/remote-plan-http.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/buster/engine/test-gates/remote-plan-http.ts); [skills/buster/engine/test-gates/remote-plan-runtime.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/buster/engine/test-gates/remote-plan-runtime.ts); [skills/buster/engine/test-gates/remote-plan-service.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/buster/engine/test-gates/remote-plan-service.ts); [skills/common/plugin-runtime/foundation/config/platform.schema.json](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/common/plugin-runtime/foundation/config/platform.schema.json); [skills/common/plugin-runtime/foundation/config/platform.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/common/plugin-runtime/foundation/config/platform.ts); [skills/common/plugin-runtime/foundation/registry/capabilities.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/common/plugin-runtime/foundation/registry/capabilities.ts); [skills/common/plugin-runtime/foundation/registry/configuration.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/common/plugin-runtime/foundation/registry/configuration.ts); [skills/common/plugin-runtime/foundation/registry/discovery.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/common/plugin-runtime/foundation/registry/discovery.ts); [skills/nova/core/cli.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/nova/core/cli.ts); [skills/nova/core/execution/engine-runtime.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/nova/core/execution/engine-runtime.ts); [skills/nova/project/cli.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/nova/project/cli.ts); [skills/nova/project/legacy-import-cli.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/nova/project/legacy-import-cli.ts); [skills/nova/project/recovery.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/nova/project/recovery.ts); [skills/prism/config/native-worker.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/prism/config/native-worker.ts); [skills/prism/engine/index.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/prism/engine/index.ts); [skills/prism/engine/worker-binding.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/prism/engine/worker-binding.ts); [skills/prism/runtime.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/prism/runtime.ts); [skills/prism/server/internal-auth.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/prism/server/internal-auth.ts); [skills/prism/server/native-worker-execution.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/prism/server/native-worker-execution.ts); [skills/prism/server/native-worker-host.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/prism/server/native-worker-host.ts); [skills/prism/server/worker-config.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/prism/server/worker-config.ts); [skills/prism/server/worker.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/prism/server/worker.ts); [skills/worker/core/worker/native-attempt-executor.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/worker/core/worker/native-attempt-executor.ts); [skills/worker/core/worker/native-attempt-journal.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/worker/core/worker/native-attempt-journal.ts); [skills/worker/core/worker/native-pool-policy.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/worker/core/worker/native-pool-policy.ts); [skills/worker/core/worker/native-result.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/worker/core/worker/native-result.ts); [skills/worker/core/worker/native-runtime-identity.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/worker/core/worker/native-runtime-identity.ts); [skills/worker/core/worker/native-supervisor-authority.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/worker/core/worker/native-supervisor-authority.ts); [skills/worker/core/worker/native-worker-launcher.c](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/worker/core/worker/native-worker-launcher.c); [skills/worker/core/worker/native-worker-process.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/worker/core/worker/native-worker-process.ts); [skills/worker/core/worker/trust.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/worker/core/worker/trust.ts); [tests/verification/contracts/check-plugin-system-v2-platform-config.mjs](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/tests/verification/contracts/check-plugin-system-v2-platform-config.mjs); [tests/verification/contracts/check-prism-runtime-role.mts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/tests/verification/contracts/check-prism-runtime-role.mts)
Applies to: pipeline-runtime-role.v1, pipeline-runtime-bundle.v1, pipeline-platform.v2, buster-remote-plan-runtime.v1, and current Prism native workers
Last verified: 2026-10-14 at source revision `eb51092b825c9501c53e486517ae3739411f60b3`; source and reader-reference facts only

Use this reference when a package is missing from a bundle, a registration is denied, or a worker starts with the wrong configuration. A **role** selects bundle contents. A **package owner** identifies the subsystem responsible for source changes. Neither selection nor ownership grants a runtime permission.

Source revision: `eb51092b825c9501c53e486517ae3739411f60b3`. The links below identify the exact checked-in sources. A bundle manifest, a configured process, and a successful deployed operation are different results.

## Choose the boundary first

| Your question | Authority to inspect | What it does not establish |
| --- | --- | --- |
| Which code travels in Nova, Buster, or Prism? | `packaging/runtime/roles/<role>.json` plus `package-ownership.json` | Activation, credentials, selected providers, or host readiness |
| Which installed plugin may Nova activate and call? | `pipeline-platform.v2`, pipeline stages, plugin registrations, explicit providers and grants | Buster executor admission or Linux privilege |
| Which executor may the Buster service run? | `buster-remote-plan-runtime.v1`, its selected environment secrets, and the admitted plan | A Nova grant or a role-manifest permission |
| Which Prism implementation handles a worker operation? | The supplied `PrismEngine`, installed operation schemas, and worker binding | A universal Prism platform CLI or an externally selected design provider |
| May a Prism native attempt start on this host? | Listener config, root-managed pool and runtime identity, launcher, and supervisor limits | Readiness from package presence or a copied identity file |

Follow the runtime consumer, not a familiar capability name. In particular, Buster runtime capability strings, Nova capability grants, and Linux process capabilities are separate namespaces.

## Inspect bundle selection without starting a runtime

Run these steps at the repository root on a development machine with Node.js 24. They need read access to checked-in manifests. They do not need cluster access, credentials, installed plugin activation, or a bundle output directory. See [developer setup](../extend/developer-handbook.md#prepare-a-clean-checkout) for the supported development environment.

1. Check `node --version`. Stop if this is not the selected Node.js 24 development environment.
2. Print the authoritative role selections:

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
for (const role of ['nova', 'buster', 'prism']) {
  const file = `packaging/runtime/roles/${role}.json`;
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(JSON.stringify({
    role: manifest.role, entrypoint: manifest.entrypoint,
    packages: manifest.packages, plugins: manifest.plugins,
    extensions: manifest.extensions,
    externalCapabilities: manifest.externalCapabilities,
  }, null, 2));
}
NODE
```

3. Check declared selection and dependency closure:

```bash
node scripts/check-runtime-role-manifests.mjs
```

The first command prints declarations, not activated registrations. The checker reads manifests and package metadata. A successful check exits zero and prints JSON with `ok: true`. An assertion stops it when selection, ownership, package closure, or declared capability supply is inconsistent. Keep the command, source revision, exit code, and non-secret output with the change. No persistent state needs cleanup. Do not turn this check into an application launch to diagnose a packaging error. [role and capability checks](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/scripts/check-runtime-role-manifests.mjs#L84-L143).
[external capability checks](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/scripts/check-runtime-role-manifests.mjs#L146-L169).
[checker success record](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/scripts/check-runtime-role-manifests.mjs#L185-L192).

## What each bundle selects

These package sets share `plugin-sdk`, `plugin-foundation`, `plugin-system-contract`, `agent-observability-contract`, `pipeline-test-gate-contract`, `pipeline-worker-core-contract`, `pipeline-observability-contract`. The table shows the additional selected packages. Pipeline-plugin IDs, OpenClaw extensions, and package IDs are different fields; use the inspection command for every selected plugin ID.

| Role | Declared selection | Additional packages | Assembled facade | Source |
| --- | --- | --- | --- | --- |
| Nova | 12 packages; 31 pipeline plugins | `nova-core`, `nova-runtime`, `delivery-manifest-contract`, `telemetry-contract`, `nova-project` | `/app/skills/pipeline.ts` exports `@kubeclaw/nova-core`; direct invocation loads `@kubeclaw/nova-project/cli` | [Nova role manifest](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/packaging/runtime/roles/nova.json#L1-L45) |
| Buster | 11 packages; 23 pipeline plugins | `worker-core`, `buster-engine`, `buster-runtime`, `telemetry-contract` | `/app/skills/runtime.ts` exports `@kubeclaw/buster-engine`; no server launch inferred from the facade | [Buster role manifest](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/packaging/runtime/roles/buster.json#L1-L55) |
| Prism | 11 packages; 6 pipeline plugins | `worker-core`, `prism-engine`, `prism-runtime`, `prism-contract` | `/app/skills/runtime.ts` exports `@kubeclaw/prism`; no server launch inferred from the facade | [Prism role manifest](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/packaging/runtime/roles/prism.json#L1-L29) |

Each role also selects the `kubeclaw-agent-observer` OpenClaw extension. Its extension manifest is not a pipeline-plugin registration. `node-package` entries supply packages; `assets` entries supply contract files at their declared targets; `entrypoint` entries select the source used to check the facade. The assembler writes a facade from the role's `import` and optional `execute` fields; it does not copy the original entrypoint verbatim. [package ownership and bundle kinds](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/packaging/runtime/package-ownership.json#L7-L30); [facade construction and bundle manifest](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/scripts/build-runtime-role-bundle.mjs#L232-L270).

A Buster or Prism `/app/skills/runtime.ts` facade exports its package. That fact alone does not start the remote-plan listener or native worker server. Use the actual consumer entrypoints below, not an invented `runtime.ts --platform` interface.

### Ownership and dependency direction

| Package owner | Declared allowed dependency owners |
| --- | --- |
| `shared` | `shared` |
| `nova` | `shared`, `nova` |
| `worker` | `shared`, `worker` |
| `buster` | `shared`, `worker`, `buster` |
| `prism` | `shared`, `worker`, `prism` |

These are declared architectural directions, not a claim that the runtime enforces every owner-to-owner edge. The role checker verifies selected package eligibility and internal closure; runtime package trust and caller grants are separate checks. The current split permits Buster and Prism to reuse Worker Core without making Nova packages part of their selected sets. The ownership file does not record a historical reason for every original split. [declared dependency directions](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/packaging/runtime/package-ownership.json#L74-L81); [role and capability checks](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/scripts/check-runtime-role-manifests.mjs#L84-L143).

### External supply is not a mount or a grant

Buster and Prism declare `git.repository.read` from `worker-workspace`, whose catalog kind is `read-only-mount`. Buster also declares `test.plan.execute` from `nova-orchestrator`, whose kind is `orchestrator-routed-capability`. These declarations name expected suppliers. They do not prove that a workspace was mounted, a plan was admitted, or a particular caller may execute it. [external capability sources](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/packaging/runtime/external-capabilities.json#L1-L19); [external capability checks](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/scripts/check-runtime-role-manifests.mjs#L146-L169).

## Follow the bundle into its consumer

The assembler records selected source digests and rejects a changed file set or changed bytes during assembly. It requires a built executable plugin sandbox and installed runtime dependencies. It writes a fresh output tree and can run the extension contract synchronizer. Building a bundle is therefore not the read-only inspection above. [assembler prerequisites](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/scripts/build-runtime-role-bundle.mjs#L8-L25); [source-selection consistency checks](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/scripts/build-runtime-role-bundle.mjs#L45-L62).

The chart's bundle intake requires exactly one archive root with `manifest.json` and a top-level `skills/` directory. The manifest must have `schemaVersion: pipeline-runtime-bundle.v1`, `bundleKind: app-skills-package-set`, and the expected agent role. A configured nonempty expected commit or contract version must match. Passing intake allows the selected skills to be copied; it does not establish a functioning plugin or worker. [bundle intake](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/charts/kubeclaw/templates/deployment.yaml#L1042-L1084).

| Deployment input | Default and precedence at this boundary | Failure or consequence |
| --- | --- | --- |
| `codeBundle.enabled` | Chart default `false` | With bundle loading disabled, manifest presence alone does not select its code |
| `codeBundle.archiveUrl` | Default empty; required by the enabled intake path | Enabled intake stops when the archive URL is empty |
| `codeBundle.expectedCommit` | Default empty; init trims the mapped string and checks it only when nonempty | A configured mismatch stops bundle acceptance; omission is not commit verification |
| `codeBundle.contractVersion` | Chart default `v2`; nonempty mapped value is compared with manifest `contractVersion` | A mismatch stops acceptance; `v2` here is distinct from manifest `schemaVersion` |
| `customSkills` overlay | Cannot override protected runtime paths | `pipeline.ts`, `runtime.ts`, `contracts`, `packages`, `node_modules`, and `plugins` are protected, including their descendants |

Sources: [codeBundle chart defaults](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/charts/kubeclaw/values.yaml#L34-L45).
[chart-to-init environment mapping](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/charts/kubeclaw/templates/deployment.yaml#L1158-L1170).
[bundle intake](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/charts/kubeclaw/templates/deployment.yaml#L1042-L1084).
[protected custom-skill paths](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/charts/kubeclaw/templates/deployment.yaml#L1088-L1107). Preserve the rejected archive's public identity and the selected expected values. Correct the artifact or selection; do not remove the expected-commit check or use a custom-skill overlay to bypass rejection.

## Nova: configure installed code, providers, and callers

The assembled Nova facade executes `@kubeclaw/nova-project/cli`, owned by `skills/nova/project/cli.ts`. It chooses an interface before it reads a project configuration. `--import-legacy` selects import first; otherwise `--project` selects project operation. Without either it delegates to the Core CLI. Do not apply the Core CLI's `--pipeline` requirement to project or import mode. [actual facade dispatcher](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/nova/project/cli.ts#L13-L38).

| Selected interface | Inputs and behavior | Reader procedure |
| --- | --- | --- |
| Project compile | `--project <file>` and `--platform <file>`, with `--compile <new-file>`; compiles and validates stages, registrations, and grants against the installed runtime, then writes canonical graph JSON using create-only `wx` mode. An existing output is not overwritten; the success record contains `status: compiled`, run identity, stage count, and definition digest | [validate before starting](../use/operate.md#validate-before-starting) |
| Project start | `--project <file>` and `--platform <file>` without compile/recover/signal; checks the project repository's current `HEAD` against `baseRevision` and rejects uncommitted changes before calling the pipeline runner | [start a project run](../use/operate.md#start-a-project-run) |
| Project recovery | Same project/platform plus `--recover <run-id>`; reconstructs and verifies the stored pinned graph, rejects a different derived run ID, and recovers the existing run | [recover after interruption](../use/operate.md#recover-after-interruption) |
| Project signal | Same project/platform plus `--signal <file>`; reconstructs the stored pinned graph, reads the signal JSON, and resumes that run rather than allocating a replacement run | [approve or resume a wait](../use/operate.md#approve-or-resume-a-wait) |
| Legacy import | `--import-legacy <file>`, `--authoring <file>`, `--platform <file>`, and `--output <new-file>`; all four pairs are required. Resolves the legacy file's real path, requires a canonical authoring repository root, validates the imported graph, and creates a new project file without replacing an existing output | [import a legacy project file](nova-project.md#import-a-legacy-project-file) |
| Explicit graph or audit | Delegates to `@kubeclaw/nova-core/cli`, not the project compiler; uses the separate graph/run/audit argument rules below | [understand the two command forms](../use/operate.md#understand-the-two-command-forms) |

Project mode accepts only `--project`, `--platform`, `--compile`, `--recover`, and `--signal`, each with one value. It rejects unknown or repeated options, absent or option-shaped values, a missing project/platform pair, and more than one compile/recover/signal mode. Project and platform file arguments, compile output, and signal file arguments resolve from the invocation directory. The platform loader then canonicalizes its file and resolves that file's internal paths as described below. Project mode loads JSON project input; import mode instead requires explicit authoring policy and has its own four-option parser. These branches are not interchangeable configuration sources. [project parsing, validation and output](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/nova/project/cli.ts#L19-L42).
[project start, recovery and signal](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/nova/project/cli.ts#L43-L62).
[pinned project recovery](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/nova/project/recovery.ts#L40-L52).
[legacy import parsing and create-only output](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/nova/project/legacy-import-cli.ts#L8-L30).

Project errors include `PROJECT_ARGUMENT_INVALID`, `PROJECT_AND_PLATFORM_REQUIRED`, `PROJECT_COMMAND_CONFLICT`, `PROJECT_RECOVERY_RUN_MISMATCH`, `PROJECT_BASELINE_CHANGED`, and `PROJECT_REPOSITORY_DIRTY`. Keep the original project, platform path, run identity, and durable state when a branch rejects the operation. Use the linked procedure's ownership and evidence prerequisites before recovery or signal. A compiled graph or a returned `succeeded` status is not proof of live reachability or human acceptance. No project, import, recovery, or signal command is part of the read-only bundle inspection above.

For the delegated explicit-graph interface, `skills/nova/core/cli.ts` requires `--platform` and either `--pipeline` or `--audit`. `--audit` cannot be combined with pipeline/run/recover/signal inputs. Run, recover, and signal dispatch are distinct branches; this reference does not turn an audit into a retry instruction. [Nova CLI arguments and dispatch](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/nova/core/cli.ts#L17-L76).

The platform file must use `pipeline-platform.v2`. Its loader resolves the file with `fs.realpathSync`, validates JSON, then freezes the resulting configuration. The loader resolves relative installation, trust, storage, and isolation paths against the directory of that **canonical file**. It uses neither the shell's working directory nor a symlink's parent. This loader does not merge role-manifest or environment defaults into required fields. [loadPlatformConfig and path resolution](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/common/plugin-runtime/foundation/config/platform.ts#L52-L70).

| Platform key | Required relationship, omission, and effect |
| --- | --- |
| `schemaVersion` | Required; exactly `pipeline-platform.v2` |
| `installationRoots` | Required, nonempty unique string array; identifies installed plugin roots |
| `trustedBuiltinRoots` | Required, nonempty unique string array; identifies first-party trust roots, not arbitrary project code |
| `externalTrust.allowedSourceDigests` | Required map: canonical `local:<package-root>` references select nonempty arrays of `sha256:<64 lowercase hex>` package digests |
| `externalTrust.verifiedAttestations` | Required map: a package digest maps to an attestation digest; both use `sha256:<64 lowercase hex>` |
| `providers` | Required map from capability to globally qualified adapter registration; selection is explicit even with one available provider |
| `grants` | Required nested map: registration ID → requested capability → constraint object. Missing required, extra, or disabled-registration grants are rejected |
| `adapters` | Required registration-ID → configuration-object map; it does not itself enable every adapter |
| `activeAdapters` | Required unique string array; initial explicitly enabled adapters. Provider dependency resolution can enable more adapters |
| `observers` | Required registration-ID → configuration-object map; its keys select enabled observers |
| `storageRoot` | Required nonempty path; anchors durable run and resource-lock storage after path resolution |
| `shutdownTimeoutMs` | Required integer ≥ 1; no loader default |
| `effectLockTtlMs` | Optional integer, 60,000–86,400,000 ms. Adapter runtime uses 300,000 ms when absent; this is a consumer default, not schema insertion |
| `isolation.cgroupRoot` | `isolation` is optional; when supplied its nonempty path is required and resolved from the platform file |
| `orchestratorIssuerId` | Required nonempty string naming the orchestrator issuer |
| `administrativeDecisionIssuers` | Required unique array of objects with `type` (`operator` or `administrator`) and nonempty `id`; an empty array is allowed |

Sources: [required platform fields and trust shape](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/common/plugin-runtime/foundation/config/platform.schema.json#L4-L62).
[registration, storage and issuer fields](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/common/plugin-runtime/foundation/config/platform.schema.json#L64-L112).
[effect lock default](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/nova/core/execution/engine-runtime.ts#L82-L87).
[package trust choices](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/common/plugin-runtime/foundation/registry/discovery.ts#L78-L102). Schema validation does not turn a missing required property into an empty map. Package discovery canonicalizes installation roots and rejects duplicate canonical roots. Trust selection checks builtin roots, then a matching source digest, then a verified attestation; otherwise it raises `REGISTRY_PACKAGE_UNTRUSTED`. [canonical installation roots and package trust](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/common/plugin-runtime/foundation/registry/discovery.ts#L13-L57).
[package trust choices](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/common/plugin-runtime/foundation/registry/discovery.ts#L78-L102).

Runtime preparation first discovers packages and builds a registry. It enables pipeline stage owners, observer keys, and `activeAdapters`. It then resolves providers and per-registration grants, validates configuration against owning registration schemas, and activates the resolved registry. A provider selected for a required capability is enabled with its dependency chain. For example, `kubeclaw.artifact-store:artifact-store` identifies an adapter registration, not a grant to every package. A stage or observer still needs its own requested-capability constraints. [Nova runtime preparation](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/nova/core/execution/engine-runtime.ts#L27-L56).
[explicit provider selection](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/common/plugin-runtime/foundation/registry/capabilities.ts#L85-L132).
[grant and dependency resolution](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/common/plugin-runtime/foundation/registry/capabilities.ts#L151-L209).
[registration-specific configuration](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/common/plugin-runtime/foundation/registry/configuration.ts#L28-L83).

Configuration is captured in the loaded runtime. Editing a JSON file does not revise an already constructed frozen object. Before a controlled restart, preserve the run identity and audit; do not create a second run to hide an uncertain effect. Use the [plugin runtime explanation](../understand/plugin-runtime.md) and [Nova lifecycle change guide](../extend/developer-handbook.md#change-nova-lifecycle-scheduling-or-run-authority) for the owning mechanisms.

## Buster: configure the separate remote-plan service

The actual CLI `skills/buster/engine/remote-plan-cli.ts` accepts exactly `--config <buster-runtime.json>`. The CLI resolves its file path from the invocation directory. The CLI loads the production runtime, starts it, prints a `buster-remote-runtime-ready.v1` record, and waits for SIGINT or SIGTERM before stopping. The runtime recovers its service state **before** listening. This identifies the interface; it is not a claim that a service has been started here. [Buster remote-plan CLI](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/remote-plan-cli.ts#L1-L27); [Buster recovery-before-listen sequence](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/remote-plan-runtime.ts#L24-L52).

The loader canonicalizes the selected config file. Referenced `platformConfig`, `stateRoot`, `runtimeRoot`, and `tarExecutable` paths are then resolved from that canonical config directory. `path.resolve` is lexical resolution; it is not a promise that every referenced path is already a canonical regular file. Browser executable overrides have separate realpath and executable-access checks. The environment supplies only the explicitly selected revision or secret inputs at this boundary; a role manifest does not override them. [Buster config, revision and secret selection](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/production.ts#L116-L162).
[durable storage and concurrency inputs](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/production.ts#L212-L239).
[command and build configuration](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/production.ts#L239-L277).

**SPIFFE** (Secure Production Identity Framework for Everyone) names workload identities with SPIFFE IDs. On Buster's trusted-peer path, the server compares the peer ID in a forwarded client-certificate header with the configured allowed IDs. It requires the request to arrive from a loopback proxy. Selecting this path does not configure that proxy or establish transport trust. The alternative bearer path compares the supplied HTTP token with the configured secret; it is separate from source-attestation verification. [peer identity and loopback proxy checks](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/worker/core/worker/trust.ts#L17-L52); [Buster peer or bearer request authorization](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/remote-plan-http.ts#L8-L31).

| Buster startup input | Required value, default, or precedence |
| --- | --- |
| `schemaVersion` | Exactly `buster-remote-plan-runtime.v1` |
| Environment `KUBECLAW_BUILD_REVISION` | Required, 40–64 lowercase hex characters; checked before configuration construction |
| `platformConfig` | Required nonempty path to the separate platform policy; its own path fields use that file's canonical directory |
| `host`, `port` | Required listener values; port must be an integer 0–65,535. Port 0 asks the OS for an assigned port; the ready record reports it |
| `trustedPeerSpiffeIds` | Optional nonempty array of 1–32 nonempty strings; if supplied, selects the trusted-peer authentication path instead of the token path |
| `tokenEnvironmentVariable` | Required on the token path; uppercase environment name. The selected value must be nonempty, and its JavaScript string length must be at least 32; a shorter value is rejected by the HTTP server constructor before listening |
| `sourceAttestationPublicKeyEnvironmentVariable` | Required uppercase environment name, distinct from the token selector when used. Its selected value must be nonempty and parse with `crypto.createPublicKey` as an Ed25519 key; the store normalizes the accepted public key to SPKI PEM format |
| `trustedSourceAuthority` | Required nonempty source authority identifier; distinct from worker revision and HTTP authentication |
| `stateRoot`, `runtimeRoot`, `tarExecutable` | Required nonempty paths; source authority, store, extraction, and executable choices must not be inferred from a bundle name |
| `recordLimits` | Required object with positive safe integers `maximumRecords`, `maximumBytes`, and `maximumRecordBytes` |
| `maximumArchiveBytes`, `maximumExtractedBytes`, `maximumResultBytes`, `maximumResultStoreBytes` | Required positive safe integers; admission and retained result/storage limits |
| `maximumRequestBytes`, `maximumResponseBytes`, `shutdownTimeoutMs` | Required positive safe integers; listener and shutdown limits |
| `maximumActiveJobs`, `maximumQueuedJobs`, `maximumConcurrentAttempts` | Missing or JSON `null` selects 2, 16, and 64 respectively; explicit zero is invalid |
| `allowedCapabilities` | Required string array; does not mean the same thing as Nova registration grants |
| `tls.keyPath`, `tls.certificatePath` | When `tls` is supplied, the loader resolves and reads the two real files. No credentials are taken from a project plan |

Sources: [Buster config, revision and secret selection](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/production.ts#L116-L162).
[durable storage and concurrency inputs](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/production.ts#L212-L239).
[TLS files and listener inputs](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/production.ts#L405-L422).
[Buster recovery-before-listen sequence](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/remote-plan-runtime.ts#L24-L52). Trusted-peer authorization and bearer verification have separate request paths; presence of a peer list is not proof of correctly configured proxies or transport. [Buster peer or bearer authentication](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/remote-plan-http.ts#L8-L31).

A missing or empty selected token fails in the loader; a nonempty token shorter than 32 fails later with `BUSTER_REMOTE_TOKEN_INVALID`. A missing source-key value fails in the loader. An unparseable nonempty value or a key type other than Ed25519 fails during store construction with `BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID`. Both invalid-value checks occur before listening, but store construction can already create or open durable storage. Preserve existing state; neither failure proves that service recovery completed or that storage remained unchanged. [selected secret names and missing values](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/production.ts#L135-L155).
[store construction before runtime construction](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/production.ts#L212-L239).
[Ed25519 parsing and normalization](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/remote-plan-service.ts#L71-L92).
[token minimum and authentication-mode construction](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/remote-plan-http.ts#L105-L120).
[runtime construction before recovery and listen](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/remote-plan-runtime.ts#L24-L52).

### An admitted executor needs its own configuration

| `allowedCapabilities` member | Owning configuration section |
| --- | --- |
| `command.execute` | `directCommand`; requires `cgroupRoot` unless `allowSampledProcessLimit` is explicitly `true` |
| `container.build` | `containerBuild`; selected registry username/password selectors must be supplied together |
| `kubernetes.fixture` | `kubernetesFixture` |
| `kubernetes.exposure` | `tailscaleExposure` |
| `network.http` | `networkHttp` |
| `browser.axe` | `browserAxe` |
| `browser.lighthouse` | `browserLighthouse` |
| `browser.visual` | `browserVisual` |
| `browser.playwright` | `browserPlaywright`, including its required `cgroupRoot` |
| `security.scan` | `securityScan` |
| `kubernetes.runtime-security` | `kubernetesRuntimeSecurity` |

The loader rejects an allowed executor whose required section is missing. Supplied sections also undergo their own value checks; they are not free-form permission grants. Limits, read roots, executable catalogs, target allowlists, and required credentials belong to the corresponding executor section. An included package cannot substitute for these controls. [conditional executor configuration](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/production.ts#L163-L211).
[command and build configuration](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/production.ts#L239-L277). Use the [Buster flow](../understand/buster.md) for plan/result ownership and the [Buster change guide](../extend/developer-handbook.md#change-buster-plans-providers-or-result-import) for scoped development work.

## Prism: exported engine is not the native host

The Prism facade exports its engine, worker binding, and domain. An embedding caller constructs `PrismEngine` with a `DesignProvider`. The worker binding accepts only contract `kubeclaw.prism-design-engine@1`, supported operations `generate`, `render`, `evaluate`, `ingest`, and `publish`, and the installed request schema ID and digest. It validates the request and result around the supplied engine call. Schema rejection is not authorization to retry with another contract. [Prism runtime exports](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/prism/runtime.ts#L1-L3).
[Prism engine caller/provider boundary](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/prism/engine/index.ts#L22-L41).
[Prism worker operation binding](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/prism/engine/worker-binding.ts#L18-L50).

The native per-attempt host is a different consumer. It constructs `PrismEngine(new DeterministicDesignProvider())`; it does **not** read a role field to select an external design provider. It reads a bounded worker envelope from stdin, validates it, runs `WorkerAttemptExecutor`, and emits its provisional result. Closing stdout does not make this result final. The supervisor first drains the owned process tree, then checks the provisional result against the accepted attempt. It applies the final observed resource use and host timestamps; a host fault or expired claim can turn a reported completion into an error. It calculates a new result digest and receipt identity and checks the final attempt binding. The journal then stores the canonical result bytes before delivery. This makes the final record distinct from the child's earlier stdout; it does not prove that external cleanup succeeded. [process-tree drain and final observation](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/worker/core/worker/native-worker-process.ts#L127-L145).
[result finalization and identity](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/worker/core/worker/native-result.ts#L7-L51).
[journal result-byte boundary](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/worker/core/worker/native-attempt-journal.ts#L117-L131).
[finalize and persist before returning](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/worker/core/worker/native-attempt-executor.ts#L37-L56). [native host engine and envelope](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/prism/server/native-worker-host.ts#L11-L36).

### Worker listener, supervisor, and child have different inputs

The Prism listener selects either SPIFFE peer identity, as defined above, or **HMAC** (hash-based message authentication code). HMAC uses a shared secret to check a code calculated from the request's timestamp, nonce, and body digest. A nonce is a per-request value whose reuse the nonce store rejects; this path needs the database as well as the secret. It is not the Buster bearer-token comparison and does not select a design provider. [Prism HMAC calculation](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/prism/server/internal-auth.ts#L5-L16).
[Prism time, signature and nonce checks](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/prism/server/internal-auth.ts#L52-L87).
[listener authentication selection](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/prism/server/worker.ts#L12-L27).

| Consumer | Configuration and defaults | Required relationship |
| --- | --- | --- |
| Worker listener | `WORKER_TRUST_SPIFFE_ENABLED` enables SPIFFE only for exact `true`; otherwise HMAC. `PRISM_WORKER_SECRET` defaults empty | HMAC requires a nonempty secret **and** `DATABASE_URL`; SPIFFE requires nonempty `PRISM_TRUSTED_CONTROL_SPIFFE_ID` |
| Worker listener | `PRISM_CONTROL_INTERNAL_URL` defaults `http://prism-control:8080`; `PORT` defaults 8080 | The URL is parsed. This loader converts the port with `Number`; do not treat the default as deployed reachability or as an exhaustive port validator |
| Worker ingress | Active requests 16, probes 4, connections 128; `PRISM_NATIVE_MAXIMUM_INPUT_BYTES` 16,777,216; body timeout 120,000 ms | Names: `PRISM_WORKER_MAXIMUM_ACTIVE_REQUESTS`, `PRISM_WORKER_MAXIMUM_PROBE_REQUESTS`, `PRISM_WORKER_MAXIMUM_CONNECTIONS`, `PRISM_WORKER_REQUEST_BODY_TIMEOUT_MS`; values must be integers 1–2,147,483,647 |
| Worker shutdown | `PRISM_WORKER_SHUTDOWN_TIMEOUT_MS` defaults 120,000 ms | Same positive timer-safe integer range |
| Native child | `KUBECLAW_NATIVE_SCOPE`, explicit positive integer `PRISM_NATIVE_MAXIMUM_INPUT_BYTES`, parseable `PRISM_CONTROL_INTERNAL_URL` | These have **no standalone host-loader default**. Non-SPIFFE artifact access requires `PRISM_WORKER_SECRET` |
| Native supervisor | `PRISM_NATIVE_POOL_POLICY_FILE`, `PRISM_NATIVE_LAUNCHER` | Required absolute, normalized paths other than `/`; pool policy supplies cgroup/ownership/identity paths and aggregate capacity |
| Native supervisor | `PRISM_ENGINE_CONTENT_DIGEST` | Required `sha256:<64 lowercase hex>` even outside production, because this supervisor checks it unconditionally |

Sources: [worker listener authentication and defaults](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/prism/server/worker-config.ts#L1-L18).
[worker ingress and shutdown limits](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/prism/server/worker-config.ts#L19-L38).
[nativePrismHostConfig](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/prism/config/native-worker.ts#L38-L50).
[nativePrismSupervisorConfig](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/prism/config/native-worker.ts#L50-L84).

The supervisor-to-host caller writes the child's selected URL, secret/trust flag, input limit, engine digest, browser path, and a finite base environment. The original launcher sets `KUBECLAW_NATIVE_SCOPE` from the owned scope. Do not emulate that authority by exporting the name yourself. The listener's fallback values do not remove the child loader's explicit input checks. [supervisor-to-host environment and journal recovery](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/prism/server/native-worker-execution.ts#L9-L41); [launcher-owned scope assignment](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/worker/core/worker/native-worker-launcher.c#L61-L78).

### Native supervisor limits and host evidence

| Input | Fallback or authority |
| --- | --- |
| `PRISM_NATIVE_CPU_TIME_MS`, `PRISM_NATIVE_MEMORY_BYTES`, `PRISM_NATIVE_TASKS` | 60,000 ms, 8,589,934,592 bytes, 2,048 tasks; positive safe integers |
| `PRISM_NATIVE_UID`, `PRISM_NATIVE_GID` | 1,000 each; positive timer-range integers |
| `PRISM_NATIVE_MAXIMUM_OWNERSHIP_RECORDS`, `PRISM_NATIVE_MAXIMUM_OWNERSHIP_BYTES` | 65,536 records; 67,108,864 bytes |
| `PRISM_NATIVE_MAXIMUM_INPUT_BYTES`, `PRISM_NATIVE_MAXIMUM_OUTPUT_BYTES`, `PRISM_NATIVE_MAXIMUM_RESULT_BYTES` | 16,777,216; 33,554,432; 67,108,864 bytes |
| `PRISM_NATIVE_MAXIMUM_JOURNAL_BYTES` | 68,719,476,736 bytes; positive safe integer up to `Number.MAX_SAFE_INTEGER` |
| `PRISM_NATIVE_POLL_INTERVAL_MS`, `PRISM_NATIVE_DRAIN_TIMEOUT_MS`, `PRISM_NATIVE_CLOSE_TIMEOUT_MS` | 20; 10,000; 105,000 ms |
| `PRISM_NATIVE_DISPATCH_TIMEOUT_MS` | Shared dispatch helper default 900,000 ms; this is not one of the supervisor object's own timeout fields |
| `PLAYWRIGHT_BROWSERS_PATH` | `/ms-playwright` when absent |
| Aggregate pool capacity | `maximumActiveScopes` and `limits.memoryBytes/tasks/cpuQuotaMicroseconds/cpuPeriodMicroseconds` come from the root-managed policy, not an attempt's environment |

Except for the explicit journal and per-attempt resource rules above, the supervisor's numeric reader requires integers 1–2,147,483,647. Empty numeric environment strings become zero and fail; fallback applies on absence, not on empty text. The engine digest is trimmed before checking. These per-attempt ceilings and aggregate pool capacity are separate restrictions. [Prism result/deadline/resource defaults](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/prism/config/native-worker.ts#L1-L37).
[nativePrismSupervisorConfig](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/prism/config/native-worker.ts#L50-L84).
[native pool policy authority](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/worker/core/worker/native-pool-policy.ts#L18-L53).

Pool policy and runtime-identity files are bounded regular root-owned files with no group/world write permission; the reader opens the final path with no-follow. The runtime-identity file must match the current boot ID and cgroup namespace device/inode. The launcher must be a canonical root-owned ordinary executable, without setuid/setgid or group/world write permission. The supervisor must have root identity and effective KILL, SETGID, and SETUID capabilities. These checks do not create a host or grant themselves the required privilege. [native pool policy authority](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/worker/core/worker/native-pool-policy.ts#L18-L53).
[boot and cgroup namespace verification](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/worker/core/worker/native-runtime-identity.ts#L10-L28).
[supervisor and launcher authority checks](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/worker/core/worker/native-supervisor-authority.ts#L4-L22).

Startup establishes listener config, supervisor policy and privileges, durable ownership, and journal recovery before HTTP admission. Shutdown fences new admission before draining and closing. Keep ownership and attempt-journal evidence when a host is interrupted; do not delete it merely to make a new process start. For an unavailable worker, follow [worker-not-ready diagnosis](../use/prism-studio.md#worker-not-ready). A disposable native development host has its own [fixture-host preparation procedure](../extend/developer-handbook.md#prepare-a-native-worker-fixture-host); that procedure is not proof that a deployment or native exercise passed. [native worker startup and shutdown](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/prism/server/worker.ts#L11-L60).
[supervisor-to-host environment and journal recovery](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/prism/server/native-worker-execution.ts#L9-L41).

## Diagnose the boundary that rejected the change

| Symptom or exact error family | What to distinguish | Safe next action and stop rule |
| --- | --- | --- |
| Role checker reports missing package/plugin/provider | Manifest selection or internal package closure, not a live dependency outage | Identify the owning role and package source; correct that selection and repeat the read-only checker. Do not start workers to conceal a failed package check |
| `bundle role … does not match`, commit/contract mismatch | Wrong selected artifact versus wrong expected values | Retain both public identities; select the intended matching artifact. Do not weaken the expected values or overwrite protected runtime paths |
| `PLATFORM_CONFIG_INVALID` | Wrong schema, missing required field, or invalid shape at the canonical file | Use the printed canonical path and schema detail; correct that file, retaining the rejected non-secret config. No default policy is synthesized |
| `REGISTRY_ROOT_INVALID`, `REGISTRY_PACKAGE_UNTRUSTED` | Missing canonical installation versus code not admitted by trust policy | Check actual resolved roots and intended source identity. Obtain the correct package or approved trust decision; do not broaden builtin roots to include arbitrary project code |
| `REGISTRY_CAPABILITY_PROVIDER_MISSING` / `…AMBIGUOUS` / `…INVALID` | No explicit selection, multiple candidates, or a selected adapter that does not supply the capability | Select one installed qualified adapter ID for the requested capability. A single candidate still needs explicit selection |
| `REGISTRY_CAPABILITY_DENIED` / `…UNREQUESTED` | Required caller grant absent versus extra grant or disabled registration | Match the exact enabled registration, its declared requirements, and constraint schema; do not grant everything to a package owner |
| `REGISTRY_ADAPTER_CYCLE` | Selected adapters recursively depend on one another | Correct the provider graph. Restarting with the same graph cannot resolve the cycle |
| `BUSTER_REMOTE_WORKER_REVISION_INVALID`, `BUSTER_REMOTE_CONFIG_VERSION_INVALID` | Wrong environment revision or wrong config schema, before service startup | Select matching worker/config identities. Do not replace source attestation with a build revision |
| `BUSTER_REMOTE_CONFIG_TOKEN_MISSING`, `BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY_MISSING` | Missing selected HTTP secret versus missing source-verification key | Check the configured environment variable **name** and authorized secret delivery without printing its value. Fix the owning secret source before startup |
| `BUSTER_REMOTE_CONFIG_TOKEN_ENV_INVALID`, `BUSTER_SOURCE_ATTESTATION_ENV_INVALID` | The token selector is not an uppercase environment name, or the source-key selector is invalid or duplicates the selected token name | Correct the configured selector names and their separate intended secret sources. Do not print credential values or replace the key with the token |
| `BUSTER_REMOTE_TOKEN_INVALID` | The token was supplied but its JavaScript string length is below 32; HTTP server construction rejects it before listening | Preserve existing job/storage evidence. Arrange an authorized replacement of sufficient length at the configured secret source, then follow the [safe configuration procedure](buster-runtime-configuration.md#safe-configuration-procedure); do not weaken the minimum |
| `BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID` | The selected source key cannot be parsed by `crypto.createPublicKey`, is not Ed25519, or the source authority is empty at store construction; storage may already have been opened | Preserve existing job/result storage and the non-secret error. Supply the intended source-verification key and authority; do not substitute build revision, HTTP token, or an arbitrary signing identity. Keep admission stopped until the input is corrected |
| `BUSTER_*_CONFIG_REQUIRED` or isolation-required error | An allowed executor lacks its owning section or required isolation | Correct that executor configuration, or remove an unneeded capability through the owner's approved policy change. Do not silently switch to a weaker execution mode |
| `PRISM_NATIVE_*_REQUIRED`, `WORKER_NATIVE_*_NOT_TRUSTED`, host-cgroup mismatch | Listener credentials, native pool files, launcher trust, or boot/namespace evidence | Keep admission closed. The native-host owner checks current policy, real host identity, permissions, and selected launcher. Never copy a different host's identity file or relax no-follow/trust checks |
| `Prism request schema does not match the installed contract` | Caller contract identity differs from the installed Prism request schema | Align caller and installed contract versions. Do not retry by editing only the declared schema digest |

The error sites and rejection order are in the linked loaders and resolvers above. For a Buster startup failure, retain existing job state: `start()` recovers the service before listening. For a native failure, preserve ownership and journal records and let the owning recovery procedure decide whether work can resume. A repeated launch is not proof of a recovered external effect. [explicit provider selection](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/common/plugin-runtime/foundation/registry/capabilities.ts#L85-L132).
[grant and dependency resolution](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/common/plugin-runtime/foundation/registry/capabilities.ts#L151-L209).
[adapter dependency-cycle check](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/common/plugin-runtime/foundation/registry/capabilities.ts#L132-L153).
[Buster recovery-before-listen sequence](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/buster/engine/test-gates/remote-plan-runtime.ts#L24-L52).
[supervisor-to-host environment and journal recovery](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/skills/prism/server/native-worker-execution.ts#L9-L41).

## Change impact and verification limits

| Change | What must remain consistent |
| --- | --- |
| Shared package or contract | Every role that selects it, internal dependencies, plugin contract versions, and the facade's installed exports |
| Role package/plugin/extension list | Ownership eligibility, closure, expected external supplier, generated bundle contents, and deployment role |
| Entrypoint import or execute module | The assembler's facade and the actual CLI/library consumer; an export is not a listener |
| Platform providers, grants, or registration configuration | Enabled callers, supplied capabilities, dependency acyclicity, trust, and registration schemas |
| Buster executor policy or secret selector | Runtime file, intended environment delivery, required executor section, isolation, and admitted plan/result ownership |
| Prism host or pool policy | Per-attempt limits, aggregate capacity, launcher, current boot/namespace identity, engine digest, durable ownership, and caller contract |

Start with the manifest-inspection procedure for a packaging change. Use the [developer change-to-check routing](../extend/developer-handbook.md#select-the-smallest-complete-check-chain) for the relevant subsystem; do not run unrelated product or native suites merely because package counts changed.

**Source evidence boundary.** Claim: bundle selection, canonical configuration, caller permission, and native host authority are separate mechanisms. Implementation: role manifests, assembler, loaders, resolvers, and host checks linked beside each mechanism. Contract: `pipeline-runtime-role.v1`, `pipeline-runtime-bundle.v1`, `pipeline-platform.v2`, `buster-remote-plan-runtime.v1`, and installed Prism/worker contracts. Test sources: [platform configuration test cases](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/tests/verification/contracts/check-plugin-system-v2-platform-config.mjs#L12-L55); [Prism role selection test cases](https://github.com/datrab/kubeclaw/blob/eb51092b825c9501c53e486517ae3739411f60b3/tests/verification/contracts/check-prism-runtime-role.mts#L1-L6). Revision: `eb51092b825c9501c53e486517ae3739411f60b3`. Limit: test source is not a recorded successful run. This reference does not assert a bundle build, service start, live deployment, native-host acceptance, or end-to-end delivery.
