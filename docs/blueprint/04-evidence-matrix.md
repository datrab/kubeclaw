# 4. Coverage and verification matrix

Status: AP02 coverage contract. Chapter IDs refer to [artifact 2](02-three-track-site-map.md), not already-created pages.

## What a coverage record proves

Each row below is a source starting point. It is not an assertion that all linked code works or that a test was run in AP02. AP03/AP05 expand rows to cover every item discovered in the inventory. AP06–AP09 attach concrete destinations and actual verification results.

For an authored task or technical claim record: chapter/section, audience, precise claim or task, source paths and relevant symbols, applicable revision/contract, implementation limitation, verifier, environment, actual result and remaining work. Use existing plain metadata where possible. Do not claim that publication time is the last behavioral verification time.

## Domain coverage

| Domain | Source starting points | Required verification and boundaries | Chapters |
| --- | --- | --- | --- |
| Runtime composition | `packaging/runtime/roles/`; `packaging/runtime/package-ownership.json` | Exact role/package/plugin inclusion; assembly separate from activation | U2, U4, O1, E4, R1 |
| Nova lifecycle | `skills/nova/core/execution/`; `skills/nova/core/lifecycle/`; `skills/nova/core/state/`; `skills/nova/core/effects/` | Trace normal run, approval, repair budgets, retry, cancellation, uncertain effects and restart | U2, U3, O2, O3 |
| Plugin API and discovery | `skills/common/plugin-runtime/contracts/plugin-system/v2/`; `skills/common/plugin-runtime/sdk/`; `skills/common/plugin-runtime/foundation/registry/`; `skills/common/plugin-runtime/foundation/packages/` | Schema validation, inert discovery, registration, provenance, activation and lifecycle; actual clean-checkout example | E1, E2, E3, E5, R1 |
| Capabilities and isolation | `skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts`; `skills/common/plugin-runtime/foundation/isolation/` | Allowed/denied operations, imports, authority and cancellation; state exact isolation environment | U4, E3, O3, R1 |
| Five registration surfaces | Current pipeline manifests in `skills/` and v2 schemas | Every registration mapped to type, configuration, examples and failure semantics; aggregate count alone insufficient | E3, E6, R1 |
| Worker Core | `skills/worker/core/`; `contracts/pipeline-worker-core/v1` | Actual attempt/process ownership, budget, progress, results, abort and recovery; minimal engine build-to-result/cancel example; partial Buster integration remains visible | U2, U3, U4, E4, S1 |
| Buster execution | `skills/buster/engine/`; `skills/buster/runtime.ts`; `contracts/pipeline-test-gate/v1` | Providers, reports, fixtures, job persistence, evidence import, cleanup and remote failure; distinguish engine from quality judgment | U2, O2, O3, E3, E4 |
| Nova remote test dispatch | `skills/nova/core/test-gates/`; `skills/buster/engine/test-gates/` | Lost response, duplicate submission, restart, result identity and safe reconciliation | U3, O3, O4 |
| Forge and Echo | `skills/nova/plugins/implementation-agent/`; `skills/nova/plugins/review/` | Real dispatch contract, result validation, policy and human continuation; agent output is not proof | U2, U3, O2, E6 |
| Prism | `skills/prism/`; `packaging/runtime/roles/prism.json`; `charts/prism/`; `contracts/prism` | Design/control/worker/Studio/data flows, pipeline integration and recovery; separate source, packaging and live checks | U2, U3, O1, O2, O4, E4, S1 |
| OpenClaw host extensions | `skills/common/plugins/openclaw-agent-observer/`; `skills/prism/openclaw-plugin/` | Host manifest, loading, permissions, lifecycle, compatibility and removal; not pipeline registration tests | E1, E4, E5, E6 |
| Codex operations plugin | `plugins/kubeclaw-ops/` | Manifest/skill paths and supported host connection; repository presence does not prove deployed Devbox access | E1, E4, O1, O4 |
| Telemetry and observability | `contracts/agent-observability/v1`; `contracts/pipeline-observability/v1`; `contracts/telemetry/v1`; `skills/common/plugin-runtime/foundation/observability/` | Event identity, delivery, backpressure, replay and retention limits; distinguish observability from canonical state | U3, U4, O3, O5, R1 |
| Deployment and access | `charts/`; `my-values/`; `scripts/deploy.sh`; `scripts/deploy-ops-pod.sh` | Dependency order, rendered values, identity/network/storage checks; PR #12 overlap; actual target acceptance separate | U4, O1, O3, O4 |
| State and recovery | Persistent-volume/chart configuration, database/queue clients, journals and artifact stores discovered during inventory | Every persistent dataset, consistency group, keys, schedule/owner, backup failure detection, destination capacity, restore exercise and application verification; no recovery claim from a file-copy test alone | O4, O5, S1 |
| Build and upgrade | `versions.json`; `docker/`; `packaging/`; deployment/update scripts | Version authority, reproducibility limits, chart/image/config/data compatibility, upgrade and rollback boundary; open image and security-scan work | O5, R1, S1 |
| CLI and project configuration | `package.json`; `skills/nova/core/cli.ts`; `skills/nova/project_setup/`; `docs/examples/` | Actual command, execution location, prerequisites, config precedence, graph/provider/grant changes, portable public examples and effective values; validate and reverse each supported customization | O1, O2, E1, E2, R1 |
| Contracts and compatibility | All families under `contracts/` plus the plugin v2 contract | Inventory each family/version, producer/consumer, compatibility and executable examples; discover new families rather than freezing a count | E3, E4, E5, R1 |
| Decisions and unfinished work | Historical decisions, finding register, GitHub issues and closure evidence | Acceptance source, implementation state, remaining tasks and independent live acceptance | D1, S1 |

## Task verification levels

| Level | What can be claimed | What cannot be inferred |
| --- | --- | --- |
| Source inspection | Paths/definitions exist and a particular behavior is present in the inspected code | End-to-end execution or deployment success |
| Static/local validation | Example parses, schema/compile/check succeeds for the recorded revision | Runtime behavior not exercised by that check |
| Local behavioral test | The recorded scenario passed with stated real components and fixtures | Success in an untested target cluster or host |
| Live task | The task passed in the named environment with recorded revision/configuration | Universal support for other environments or irreversible recovery guarantees |

Record failed, skipped, unavailable and not-run separately from passed. Retain the exact command and necessary inputs. A local fixture for a remote service must be identified. Existing closure evidence may be reused after checking its revision and applicability; do not rerun unrelated suites just to inflate assurance.

## Coverage acceptance

Inventory coverage: every relevant component, plugin/registration, capability, contract, configuration family and persistent dataset maps to a chapter or an explicitly justified exclusion.

Content coverage: the assigned section answers the reader's task, including prerequisites, failures and current limitations. A heading or generated catalogue entry alone does not pass.

Migration coverage: each removed source has an individual disposition and preserved required content/dependencies.

Journey coverage: new reader explains a run and failure; operator installs, diagnoses, restores and upgrades; developer creates, integrates and replaces each supported extension type. Record missing questions and resolve them in the owning chapter. Shared reference pages are allowed; hidden chat context is not.

AP05 prioritizes gaps: P0 incorrect/missing instructions risking data or access, P1 blocked core tasks, P2 clarity/navigation. Product defects and missing live proofs remain different task types. A complete document may explain a blocked product operation precisely without claiming that operation works.
