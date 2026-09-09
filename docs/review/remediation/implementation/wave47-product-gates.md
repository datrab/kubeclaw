# Welle47 — product authoring and gate verification

Base: `a8cf34fc93c7bcb823ed9c54792a32de743255f1`. Worktree: `/workspace/scratch/0d8f8ddb55c3/wave47-product`. Decisions D01–D11 retained. No deployment, CI invocation, external message, runtime impersonation, mock executor or fallback provider. This note does not change the global findings register.

## Code completed

The existing Project entrypoint now supports explicit legacy **authoring** import. `legacy-import.ts` combines version-1 progress structure with a complete explicit v2 authoring input. Every legacy module must have a one-to-one ID mapping; dependencies, module directories and substeps cannot be silently changed by an overlay. Nonmodule gate dependencies reject until explicitly reauthored. Every legacy gate needs an explicit replacement explanation. Requirements, ownership, mandatory provider coverage, final tests, source admission and agent choices remain authored v2 fields, checked by the original compiler. It never derives test obligations from old selected suite names or copies old passed/approved/runtime state.

The import CLI verifies the physical legacy-file/repository boundary, requires a canonical repository root, validates the compiled graph through original installed registrations/grants, then creates a new file without overwriting an existing one. Its report binds normalized inputs/result by digest, names ignored legacy and per-module fields, and explicitly reports `authoring-only`. Authoring notes and a caller's `acknowledgeLegacyPolicy:true` are not authenticated human decisions. The normal source-preflight still checks actual committed blueprints during execution.

The documented import and compile commands were executed through both the original source launcher and an actual archived/extracted Nova role bundle. Real Git fixture files and real provider registry/resolver plans underpin the original two-module contract test. Added negative cases cover missing requirements/final policy, structural conflict, incomplete module mapping, unexplained gates, missing policy acknowledgement, reused old run ID, gate dependencies, foreign source path, output collision, and missing grants before output. No executed stage is invented.

A separately committed packaging correction adds the existing demo plugins to their actual owning role manifests; see `demo-role-packaging.md`. This was a real source-to-production composition gap, detected by the original manifest validator, not a new generic E2E requirement.

## Findings, individually

| ID | Welle47 outcome | Precise remaining boundary |
| --- | --- | --- |
| T01-F01 | Canonical explicit legacy import, reachable CLI documentation, source-launcher and extracted-launcher validation completed. Import/compile demonstrably produce accepted v2 inputs/graphs, never old execution authority. | Actual application execution is separately classified under T01-F02; compile is not a run. Legacy gate-dependent declarations require explicit restructuring, with a specific rejection rather than silent migration. |
| T01-F02 | Existing two-module full technical graph, source admission, cumulative gates and source-bound demo composition retained; role omissions now fixed. | Complete live product lifecycle and authenticated human acceptance remain incomplete; graph success is still correctly distinguished from Ready and Accepted. |
| F-T14-01 | Corrected the missing production package for existing retained-demo ownership/Ready implementation. | Original requested end-to-end fixture plan, post-plan Tailnet reachability and exact-generation release/TTL proof unavailable. Human extension authorizer is actual missing code/integration, not merely an unrun test. |
| F-T14-02 | Corrected owning role inclusion of both demo handoff and app-auth provider; actual bundled imports resolve their dependencies. | Real application login, private operator reception, other-user/old-generation denial and authenticated acceptance/extension remain unproved or unimplemented. |
| T15-F01 | Original immutable report-source suite passes with actual journals/artifact stores, cross-run/stale/missing/tampered/FIFO negatives. | Original requested genuine configured Writer consumption/output remains unavailable. No local source assertion is called a successful Writer. |
| PATH-T11-001 | Original real Node JUnit → original parser/finalizer → real HTTP Nova import and durable reconstruction passes again. | Required original provider/adapter/runner chain still fails through actual supervised native adapter after building its helper (`REPORT_ADAPTER_STDIN_FAILED`, EPIPE). No local finalizer-only result is labelled full runner evidence. |
| PATH-T11-002 | Original coverage gate passes: ten cases plus real installed-registry/compiler and original summary checks. Explicit mandatory exclusion/advisory/skips remain unsatisfied. | Exact original all-skipped/selected-empty plan policy is checked locally; full native product-final decision remains unavailable. No new universal fixed suite count or invented broader closure criterion. |
| PATH-T13-001 | Original independent cumulative-policy and source/decision contracts retained and passing; importer cannot reduce authored coverage. | Original same-revision earlier-module interaction defect through complete native cumulative provider chain remains unproved; no synthetic pass report replaces it. |
| PCR-CONTAINER-BUILD-001 | Original real-file output validator/resolver covers failed omission, mandatory success output, invalid supplied outputs; passes. | Original failed Dockerfile build through original runner cannot run: no native BuildKit/configuration. Failed-vs-errored full provider disposition is not claimed. |
| PCR-CONTAINER-BUILD-002 | Actual local HTTP delayed/stalled body, full deadline, cancellation and diagnostic preservation regressions pass. | Original real prepared build followed by Registryverify deadline remains unexecuted because BuildKit is unavailable. |
| PCR-DIRECT-COMMAND-001 | All eight output positions × six media types pass the original resolver/production validator with actual file copies/hashes. | The original native two-artifact command/provider/runner regression was run after genuine sandbox build and fails (`errored`/EPIPE before command), so the exact original requested native proof remains open. No cluster/BuildKit requirement was added to this finding. |
| PCR-RUNTIME-001 | Twenty-two current original Core/real-HTTP session cleanup cases pass, including timeout/parent-abort, late identity and conflicting ownership. | The original requested controlled-HTTP/Core regression is locally satisfied. A real OpenClaw service was not used; that is stated as a deployment limit, not added as a new mandatory proof beyond the finding text. |
| PCR-OPERATOR-001 | Five original actual observer/effect/HTTP/fsynced-receiver cases pass: second send after transient rejection, lost ACK reconciliation, bounded retries across reconstruction, unresolved unknown receiver and invalid protocol. | The supported-receiver original local regression is satisfied. An intended external receiver without that reconciliation protocol still fails explicitly; no claim of arbitrary receiver compatibility or deployed support. |
| PCR-SCAFFOLD-OPS-001 | Five real supervisor/status CLI regressions pass again. | Original adopted-live-process proof fails its actual process-identity prerequisite (`REAL_PROC_PROCESS_CMDLINE_REQUIRED`); no procfs replacement or successful start/recovery is claimed. |

## Human acceptance and extension authority

The searched original boundaries are `skills/nova/core/execution/engine-admin.ts`, `engine-snapshots.ts`, Core/Project signal CLIs, `tools/ops-mcp/src/server.mjs`, and the Buster controller Ready endpoint. Administrative decisions define a host authenticator interface, but the existing human-approval signal CLI only carries caller-supplied issuer JSON. The existing MCP server is explicitly read-only and uses a service bearer token; it does not provide a domain-specific authenticated human decision writer. Controller TokenReview verifies the Nova service account, not a person. These are not interchangeable identities.

Consequently no extension/Accepted writer accepting `actor`, `issuerId`, `approved:true` or a runtime SA as sufficient human authority was added. A production authenticated human principal ingress, authorization mapping and durable source/generation/deadline-bound decision verification still need implementation. Existing Ready and seven-day/default configured retention remain unchanged. This is reported as incomplete code/integration for T01-F02/F-T14, not hidden behind a generic native-test label.

## Executed commands and logs

Raw logs are persisted in `docs/review/evidence/wave47-product/` from `/tmp/kubeclaw-wave47-product/`. Where commands failed initially, both observations are retained.

| Command | Exit/result | Log |
| --- | --- | --- |
| `node tests/verification/contracts/check-project-compiler.mts` | 0, original plus import regressions | `import-compiler-final.log` |
| Same command with actual archived Nova bundle argument | 0, extracted original launcher | `import-bundle.log` |
| `node node_modules/typescript/bin/tsc --noEmit -p skills/nova/tsconfig.json` | 0 | `types-final.log` |
| Canonical ESLint, new importer/CLI/cases files | 0 | `lint-final.log` |
| Canonical ESLint, existing Project CLI and existing compiler check | 1, six existing CLI dynamic-load/depth diagnostics; no new loader exemption | `lint-existing-final.log` |
| `npm run plugin-system:sandbox:build` | 0, actual native helper built | `sandbox-build.log` |
| `node tests/verification/contracts/check-pipeline-junit-report-adapter.mts` | 1 after build, EPIPE | `junit-native-built.log` |
| `node skills/buster/plugins/direct-command/tests/runner-artifacts.test.mts` | 1 after build, native errored before command | `direct-native-built.log` |
| `node tests/verification/contracts/check-pipeline-container-build-production.mts` | 1, `CONTAINER_BUILD_LIVE_CONFIGURATION_REQUIRED` | `build-native.log` |
| `node tests/verification/contracts/check-junit-executed-required.mts` | 0 | `junit-local.log` |
| `node skills/buster/plugins/container-build/tests/deadline.test.mts` | 0 | `build-deadline.log` |
| `node skills/buster/plugins/direct-command/tests/output-contract.test.mts` | 0 | `output-contract.log` |
| `node --test tests/verification/reliability/runtime-session-cleanup.test.mts` | 0, 22 pass | `runtime-session.log` |
| `node --test tests/verification/reliability/report-evidence.test.mts tests/verification/reliability/operator-delivery.test.mts` | 0, 15 pass | `report-operator.log` |
| `npm run verify:test-gate:coverage` | 0, 10 coverage cases and original compiler/summary | `coverage.log` |
| `node --test scripts/tests/repository-review-supervisor-status.test.mjs` | 0, five pass | `supervisor-local.log` |
| `node --test scripts/tests/integration/repository-review-supervisor-adoption.mjs` | 1, actual procfs prerequisite unavailable | `supervisor-adoption.log` |
| Original role validator, Nova/Buster bundlebuilder, bundled demo module imports | 0 | `role-manifests.log`, `bundle-build-final.log`, `buster-bundle.log`, `bundled-demo-imports.log` |

The first JUnit/direct attempts correctly reported `*_SANDBOX_NOT_BUILT`; this ordinary missing build step was completed and both original gates rerun before declaring the actual EPIPE host boundary. BuildKit/Docker executables are absent. Resource owner independently confirms read-only cgroup/process-observation constraints; no launcher policy was weakened. No global finding count is inferred from this scoped matrix.
