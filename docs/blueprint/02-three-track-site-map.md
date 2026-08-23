# 2. Three-track site map

## Navigation contract

The home page gives readers three explicit entrances:

- **Understand the platform** — architecture readers and evaluators.
- **Operate the platform** — deployers and operators.
- **Extend the platform** — plugin, engine, integration, and core developers.

Each track contains its own orientation, prerequisites, tasks, troubleshooting, and glossary context. Cross-track links are optional “Learn why” or “See the contract” links. A reader must not leave their track to complete its core job.

Facts have one canonical page. A task page may repeat a one-sentence definition or a required value, but it links to the canonical explanation or generated reference. Inventories, option tables, schemas, and compatibility data are embedded from shared generated sources rather than copied.

## Global website structure

```text
/
├── understand/                 Platform and architecture
├── use/                        Operator documentation
├── extend/                     Developer documentation
├── reference/                  Generated and normative facts
├── decisions/                  Durable design reasoning
├── examples/                   Verified end-to-end examples
├── status/                     Current support and compatibility
└── search/                     Full-site search with track filters
```

Global pages:

- `/glossary` — canonical terminology shared through links and tooltips.
- `/status/current` — implemented, experimental, designed, deprecated, and removed surfaces.
- `/reference/source-index` — release-pinned source links by component and symbol.
- `/reference/compatibility` — API, plugin, contract, runtime, and deployment compatibility.
- `/decisions` — accepted, proposed, superseded, and rejected decisions.

## Track 1: Understand

Primary promise: **Understand what KubeClaw is, what it can and cannot do, and how every implemented layer interacts.**

```text
/understand/
├── platform-overview
├── capabilities-and-boundaries
├── architecture/
│   ├── interactive-platform-map
│   ├── request-to-result
│   ├── nova-core/
│   │   ├── responsibilities-and-non-responsibilities
│   │   ├── pipeline-graph-and-run-lifecycle
│   │   ├── scheduling-remediation-waits-and-resume
│   │   ├── effects-state-artifacts-and-authority
│   │   └── reconciliation-and-terminal-closure
│   ├── plugin-foundation/
│   │   ├── discovery-registration-and-freeze
│   │   ├── grants-capabilities-and-isolation
│   │   ├── activation-execution-and-cleanup
│   │   └── failure-and-recovery-model
│   ├── worker-core/
│   │   ├── boundary-and-contract
│   │   ├── attempt-lifecycle
│   │   ├── capacity-progress-and-results
│   │   └── local-and-remote-operation
│   ├── worker-engines/
│   │   ├── engine-contract
│   │   ├── buster
│   │   └── prism-designed
│   ├── specialists/
│   │   ├── forge
│   │   └── echo
│   ├── communication-and-telemetry/
│   │   ├── capability-routing
│   │   ├── event-and-evidence-flow
│   │   ├── durable-delivery
│   │   └── observability-and-reconciliation
│   ├── security/
│   │   ├── trust-boundaries
│   │   ├── package-and-process-isolation
│   │   ├── capability-containment
│   │   └── secrets-network-and-workspaces
│   └── deployment-topologies/
│       ├── local-composition
│       ├── nova-and-buster-on-kubernetes
│       └── future-engine-topology
├── use-cases/
│   ├── application-delivery
│   ├── verified-test-execution
│   ├── governed-agent-review
│   └── custom-pipeline-composition
└── boundaries/
    ├── supported-now
    ├── designed-not-implemented
    └── explicit-non-goals
```

The interactive map is the primary visual explanation. Every node links to its canonical page and can switch between logical layers, runtime packaging, deployment topology, a single-run flow, telemetry flow, and failure flow.

## Track 2: Use

Primary promise: **Install, configure, operate, observe, troubleshoot, recover, upgrade, and safely customize KubeClaw without learning plugin development or internal architecture.**

```text
/use/
├── operator-overview
├── quickstart
├── plan/
│   ├── requirements
│   ├── capacity-and-storage
│   ├── network-and-dns
│   └── security-prerequisites
├── deploy/
│   ├── infrastructure
│   ├── secrets
│   ├── litellm
│   ├── tailscale
│   ├── nova
│   ├── buster
│   └── verify-deployment
├── configure/
│   ├── platform
│   ├── runtime-roles
│   ├── capability-providers
│   ├── pipeline-and-projects
│   ├── plugins
│   ├── telemetry-and-notifications
│   └── customization-boundaries
├── operate/
│   ├── start-inspect-resume-and-stop-runs
│   ├── approvals-and-signals
│   ├── artifacts-results-and-evidence
│   ├── buster-jobs
│   ├── forge-and-echo-sessions
│   └── preview-access
├── observe/
│   ├── health-and-readiness
│   ├── run-status
│   ├── logs-events-and-telemetry
│   └── degraded-observability
├── troubleshoot/
│   ├── diagnostic-entrypoint
│   ├── deployment
│   ├── pipeline-runs
│   ├── plugins-and-capabilities
│   ├── buster
│   ├── forge-and-echo
│   └── telemetry
├── recover/
│   ├── safe-retry-and-resume
│   ├── process-and-pod-restart
│   ├── failed-dispatch-and-import
│   ├── state-and-artifact-recovery
│   └── disaster-recovery
├── maintain/
│   ├── backup-and-restore
│   ├── upgrade
│   ├── compatibility-check
│   └── decommission
└── runbooks/
    ├── symptoms-index
    └── verified-runbooks
```

Operator page template: objective, safety/impact, prerequisites, exact procedure, expected result, verification, rollback/recovery, failures, escalation evidence, and optional architecture link.

## Track 3: Extend

Primary promise: **Build and verify every supported extension without first studying the architecture track.**

```text
/extend/
├── developer-overview
├── setup-and-first-verification
├── choose-an-extension/
│   ├── configuration-or-plugin-or-engine-or-core
│   └── compatibility-and-maintenance-cost
├── plugins/
│   ├── mental-model-and-package-anatomy
│   ├── first-plugin
│   ├── manifest-schemas-and-provenance
│   ├── configuration-and-validation
│   ├── capabilities-and-grants
│   ├── lifecycle-effects-idempotency-and-cancellation
│   ├── state-artifacts-waits-and-resume
│   ├── errors-retries-remediation-and-cleanup
│   ├── install-replace-remove-and-version
│   └── test-package-and-publish
├── extension-points/
│   ├── stage
│   ├── observer
│   ├── capability-adapter
│   ├── test-provider
│   ├── report-adapter
│   └── core-only-authority
├── plugin-catalogue/
│   └── one generated-plus-authored page per installed plugin
├── engines/
│   ├── engine-boundary
│   ├── first-worker-engine
│   ├── worker-core-contract
│   ├── attempts-progress-results-and-evidence
│   ├── local-runtime
│   ├── remote-service-and-recovery
│   └── packaging-and-role-integration
├── integrations/
│   ├── runtime-dispatch-provider
│   ├── transport-and-telemetry
│   ├── secrets-network-and-repositories
│   └── operator-messaging
├── customize/
│   ├── pipeline-graph
│   ├── provider-selection-and-grants
│   ├── plugin-configuration
│   ├── runtime-role-bundle
│   ├── deployment
│   └── core-fork-boundary
├── test-and-debug/
│   ├── unit-contract-live-and-e2e-tests
│   ├── fixtures-and-golden-contracts
│   ├── failure-injection-and-restart
│   └── package-and-boundary-verification
└── contribute/
    ├── code
    ├── contracts-and-versioning
    ├── documentation
    └── release-checklist
```

Each extension-point page contains: when to use it, when not to use it, complete contract, lifecycle, capability access, configuration, minimal example, production example, failure behavior, testing, packaging, compatibility, security, and links to every installed implementation.

Each plugin page contains generated identity/registrations/schemas/capabilities plus authored purpose, behavior, inputs/results, configuration examples, use cases, boundaries, failures, operations, extension guidance, and verified source/test links.

## Interlinking rules

- Task text contains the minimum facts needed to finish the task.
- “Why” links go to Understand; “contract” links go to Reference; “operate” links go to Use; “implement” links go to Extend.
- Definitions use glossary tooltips and one canonical glossary URL.
- Every architecture node has incoming links from affected operator/developer tasks.
- Every plugin catalogue page links to its extension-point page, configuration reference, source manifest, implementation, and verification.
- Related links are curated and typed; pages do not rely on search for required navigation.

## Track acceptance tests

- An operator can deploy, run, diagnose, recover, and upgrade without opening Understand or Extend.
- A developer can author, test, package, install, replace, and remove each extension type without opening Understand or Use.
- An architecture reader can explain platform layers, authority, data flow, boundaries, deployment, and current versus designed components without reading procedural tracks.
- No generated fact is manually duplicated between tracks.
