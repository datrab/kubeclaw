# 2. Reader journeys and chapter structure

Status: AP02 target structure; product pages will be migrated in AP06–AP09.

## Structure rules

Keep three entrances: Understand, Operate and Extend. Reference, decisions, status and a glossary support all three. Keep the existing source root `docs/site/`; the operator route remains `use/` to avoid gratuitous route churn.

The identifiers below are coverage identifiers, not a requirement to create one file per row. A chapter can contain several sections or split when independent tasks need different prerequisites. AP03/AP05 may refine grouping with a recorded reason. Do not create empty pages or duplicate explanations to match this table. Record concrete destinations when content is migrated; existing published routes get redirects where needed.

| ID | Chapter and audience | Required content and reader outcome |
| --- | --- | --- |
| U1 | Overview — new reader | Purpose, capabilities, limits, vocabulary and one complete example; reader can explain what KubeClaw does |
| U2 | Components and authority — architecture reader | Nova, Foundation/SDK, Worker Core, Buster, Prism, Forge, Echo, roles and plugin types; reader identifies who owns each decision |
| U3 | Request, state and recovery — architecture reader | Graph, effects, stores, artifacts, dispatch, waits, approval, retries, repair budgets, cancellation, resume and terminal closure; trace both normal and failed runs |
| U4 | Deployment and trust — architecture reader | Process/pod boundaries, identities, grants, network, data and observability flows; explain isolation and failure domains |
| O1 | Plan and install — operator | Supported topology, capacity, storage, DNS/network, access, secrets, dependency order, configuration and first verification |
| O2 | Configure and operate — operator | Defaults/overrides, roles, projects, plugins/providers, start/inspect/approve/resume/cancel, results, Prism workflow and demo access |
| O3 | Observe and diagnose — operator | Health, logs/events/metrics, queues/storage growth, symptom-to-check index, known failures and evidence collection |
| O4 | Backup and recover — operator | Complete persistent-data inventory, consistent backup, restore and verification; lost state, nodes, cluster and administrative access |
| O5 | Maintain and retire — operator | Version authority, builds/images, upgrades/migrations, rollback limits, secrets/certificates, retention and controlled decommission |
| E1 | Choose and prepare — developer | Configuration versus pipeline plugin, OpenClaw extension, Codex plugin, provider/adapter, engine or core change; setup and first check |
| E2 | Build a pipeline plugin — developer | Complete minimal plugin, manifest, lifecycle, configuration, grants, registration, packaging and real integration |
| E3 | Extension contracts and reliability — developer | Five registration surfaces; state/effects, idempotence, cancellation, failure, retries, waits/resume and cleanup; practical stateful/effectful example |
| E4 | Engines and host integrations — developer | Worker contract, Buster/Prism boundaries, local/remote execution, runtime roles; separate OpenClaw and Codex host requirements |
| E5 | Test and maintain extensions — developer | Unit/contract/integration checks, failure injection, debugging, install/activate/update/replace/disable/remove and compatibility |
| E6 | Plugin catalogue — developer/operator | Reuse existing pages; generated identity and contracts plus authored purpose, examples, limits, operations and tests |
| R1 | Reference — all readers | Commands, configuration/defaults/precedence, environment, secrets, roles, capabilities, contracts, telemetry and compatibility |
| S1 | Current limits and acceptance — all readers | Implemented/partial/planned distinctions, remaining issues and separate live acceptance; no false production guarantee |
| D1 | Decisions — maintainers | Durable reasoning, acceptance state, implementation state, consequences and supersession |

The glossary is one shared resource, with short definitions repeated where needed to finish a task. Required steps must be readable directly in the task; reference links may supply exhaustive tables. Cross-track links explain why or offer deeper detail, not hidden prerequisites.

## Mandatory operations coverage

The five operator chapters must collectively cover every applicable task below. Use component-specific sections only when behavior differs; avoid copying generic instructions for every service.

| Task group | Required scenario |
| --- | --- |
| Bootstrap | Build a supported environment from prerequisites; verify dependency readiness and handle a failed first installation |
| Access | Establish the supported Devbox/Ops Pod path; recover access independently if that path fails; distinguish pending PR #12 changes |
| Infrastructure | K3s, CNI/Cilium, GitOps, registry/BuildKit, Tailscale, identities/SPIRE, storage, databases, queues and model routing where present |
| Configuration | Show source of truth, required values, defaults, override order and how to verify the effective configuration |
| Workloads | Operate Nova, Buster and Prism; explain Forge/Echo dispatch and enabled/disabled plugin behavior |
| Failed run | Diagnose hanging work, lost responses, Git conflicts, failed gates, uncertain effects and cancellation; identify safe retry versus reconciliation |
| Data protection | Inventory databases, queues, journals, artifacts, keys and other persistent state; consistent groups, destination independence, retention and integrity |
| Restore | Recover an individual service and the whole environment; restore identity/access without requiring the failed service; verify application data |
| Upgrade | Identify compatible image/chart/config/data versions, migration order, rollback point and irreversible changes |
| Lifecycle | Rotate credentials/certificates, manage capacity/retention, export data and decommission resources without unowned leftovers |

For each procedure provide objective, prerequisites and access, expected impact, exact steps, expected results, checks, stop conditions, failure diagnosis, recovery/rollback and evidence to retain. Explain placeholders and execution location. If no complete safe recovery exists, say which part is missing and link the implementation issue; do not invent a working procedure. Recovery-time and data-loss targets must be demonstrated or explicitly undecided.

## Mandatory extension coverage

E2 must take a clean checkout from an empty package to a built, tested and activated pipeline plugin. Include a concrete successful result and an intentional failure. E3 then extends an example with state or an external effect and verifies replay, interruption and cleanup.

Each supported stage, observer, capability adapter, test provider and report adapter gets its contract, lifecycle, input/output/configuration, authority, error semantics and an executable example. Shared sections can supply common packaging and lifecycle behavior; link directly to the relevant steps. Do not manufacture APIs to make an unsupported extension appear available.

E4 separates pipeline plugins from OpenClaw extensions and Codex plugins. Each supported host integration needs its own manifest, loading/activation process, permissions, verification and removal story. Inventory presence alone does not prove a complete authoring workflow. Engine documentation distinguishes the neutral worker contract from engine meaning and integration limitations. Include one complete minimal worker-engine example: engine implementation, package/role integration, submission, progress, result import and cancellation. Verify both success and interrupted execution. If a required integration is unfinished, identify the exact blocked step and issue rather than claiming that the end-to-end example works.

Every catalogue entry links to its appropriate extension type, schemas, implementation and checks. Generated tables must not overwrite authored guidance.

Configuration is also an extension path. E1/O2 must explain changing the pipeline graph and project configuration, selecting providers and grants, enabling/disabling plugin behavior, and composing runtime-role bundles and deployment settings. For each supported customization show the authoritative setting, a minimal change, validation, effective result, restart/resume implications and reversal. E4/E5 distinguish these supported changes from a core fork; contribution guidance covers package/contract changes, versioning and the checks required before release.

O3/O4 must cover routine backup operation as well as a one-off restore: schedule and ownership, detection of missed/failed backups, destination capacity, access to encryption/recovery keys where used, and a repeatable restore exercise. Any unknown schedule, alert threshold or operational owner is explicitly unresolved; do not invent deployment-specific values.

O1/R1 must separate portable public examples from private operator settings. List required values and secret references using documented placeholders, explain where the operator supplies them, and verify that the example does not depend on private identifiers or an undocumented local file. This addresses documentation usability and the existing public-configuration finding; it does not itself close that finding.

## Page quality and task acceptance

Start with the reader's objective and a short explanation. Define terms before using them. Keep ordered steps actionable; use tables for comparisons and diagrams for relationships. Avoid phase names, internal review IDs as unexplained concepts, and claims such as “fully supported” without a defined scope.

A chapter passes when a reader using only its required pages can finish the listed task and identify the result. A reader must not need chat history. A locally verified example and a pending live exercise have different statuses. Automated link checks cannot certify this outcome.

Use compact diagrams with text explanations. Existing accurate SVGs may be retained; Mermaid or ordinary diagrams are sufficient. An interactive architecture map is optional after the content is coherent, never a migration or deletion prerequisite.
