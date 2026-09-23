# Reference

Status: current
Audience: operator, plugin author, maintainer, developer
Owner: documentation
Evidence: scripts/docs-generate.mjs; scripts/docs-publication.mjs
Applies to: current repository source and generated inventories
Last verified: 2026-09-17

## Purpose

Use this section when you know what value, command, contract, or registration you
need. The Understand section explains system behavior. The Use section gives
procedures. This section gives exact names and source-backed facts.

## Configuration and Operation

- [Pipeline platform](pipeline-platform.md) documents the operator-owned package, trust, capability, adapter, observer, storage, isolation, timeout, and issuer authority.
- [Nova project](nova-project.md) documents every `nova-project.v2` source field and its deterministic compilation boundary.
- [Pipeline definition](pipeline-definition.md) documents the explicit `pipeline-definition.v2` graph contract and semantic graph rules.
- [Project pipeline JSON](pipeline-json.md) separates authored `.swarm/pipeline.json`, Nova compiler input, explicit execution graphs, and runtime progress.
- [Worker profiles and roles](worker-profiles-and-roles.md) documents worker identity, capabilities, resources, admission, and runtime roles.
- [Host and Prism configuration](host-and-prism-configuration.md) documents compact swarm input, Prism startup settings, native host policy, and consumer boundaries.
- [Plugin configuration](plugin-configuration.md) lists every registered configuration schema recursively, including defaults, constraints, branches, owners, and consumers.
- [Buster suites and providers](buster-suites.md) gives the complete twelve-suite surface, provider fields, defaults, ports, evidence, prerequisites, and checks.
- [Buster runtime configuration](buster-runtime-configuration.md) explains the service, store, authentication, limits, and capability policy that make those providers available.
- [Buster provider configuration](buster-provider-configuration.md) gives every exact nested field path, type, default, limit, and choice in all shipped provider schemas.
- [Buster error codes](buster-error-codes.md) lists every exact error emitted by the shipped suite providers and gives the safe action for each boundary.
- [Lint policy](lint-policy.md) explains loading, precedence, scope, severity, baselines, admission, packs, failures, and report evidence.
- [Generated lint policy facts](lint-policy-generated.md) lists every exact shipped tool, target, filter, timeout, threshold, admission, waiver, and pack value.
- [Lint rules and findings](lint-rules.md) explains repository-owned rules, normalized findings, external-code boundaries, remediation, and operational failures.
- [CLI commands](cli.md) lists the deployment command surface.
- [Environment variables](environment-variables.md) lists deployment and secret-setup variables.
- [Helm values](helm-values.md) lists current value families and Secret references.
- [Secrets](secrets.md) lists names, keys, owners, consumers, and recovery rules.
- [Endpoints](endpoints.md) catalogues Services, ports, ingresses, inbound routes, outbound connections, trust boundaries, health, and failure effects.
- [Configuration precedence](configuration-precedence.md) identifies which source wins for each consumer without treating unrelated configuration families as one override stack.
- [Configuration change impact](configuration-change-impact.md) maps changes to restart, new-run, republish, host, rollout, and data procedures.
- [Configuration errors](configuration-errors.md) maps validation and admission signals to their owner and safe corrective action.
- [Project pipeline publication](project-pipeline-publication.md) documents the coupled `.swarm/progress.json` and `.swarm/pipeline.json` publication contract.
- [Configuration compatibility](configuration-compatibility.md) documents current version markers, pinned identities, and fail-closed compatibility boundaries.
- [Verification commands](verification-commands.md) maps claims to checks.
- [Workflow inventory](workflows.md) lists repository automation and triggers.
- [Generated platform surface inventory](platform-surfaces-generated.md) maps current runtime resources, Secret references, endpoints, stores, events, and Ops MCP tools to their detailed explanations.

## Extension Runtime

- [Capabilities](capabilities.md) lists every grantable capability and registration.
- [Plugin catalogue](../extend/plugin-catalogue/README.md) lists every extension package.
- [Extension contracts](../extend/contracts.md) explains registration inputs and results.

## Shared Language

- [Glossary](glossary.md) defines the terms used across the documentation.

## Documentation Maintenance

- [Documentation governance](documentation-governance.md) defines canonical ownership, source authority, metadata, decision, status, and route-lifecycle rules.
- [Generated documentation map](generated-documentation-map.json) maps every reader page to its owner, sources, status, and required checks.
- [Route registry](documentation-route-registry.json) records public redirects, deprecated terms, and their successors.

## Coverage boundary

These references cover current authored configuration and the readers that
consume it. Registration-specific configuration remains canonical in the
recursive plugin catalogue, while runtime events and progress records are
outputs rather than authoring inputs. An absent value grants no authority:
check the owning contract before adding a field, port, package, or credential.
