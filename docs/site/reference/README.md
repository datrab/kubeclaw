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

- [Buster suites and providers](buster-suites.md) gives the complete twelve-suite surface, provider fields, defaults, ports, evidence, prerequisites, and checks.
- [Buster provider configuration](buster-provider-configuration.md) gives every exact nested field path, type, default, limit, and choice in all shipped provider schemas.
- [Buster error codes](buster-error-codes.md) lists every exact error emitted by the shipped suite providers and gives the safe action for each boundary.
- [CLI commands](cli.md) lists the deployment command surface.
- [Environment variables](environment-variables.md) lists deployment and secret-setup variables.
- [Helm values](helm-values.md) lists current value families and Secret references.
- [Secrets](secrets.md) lists names, keys, owners, consumers, and recovery rules.
- [Verification commands](verification-commands.md) maps claims to checks.
- [Workflow inventory](workflows.md) lists repository automation and triggers.

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

## Known Coverage Limit

These references do not yet form an exhaustive catalogue of every schema, event,
error code, endpoint, store, or compatibility contract. The pages state their
scope. Do not interpret an absent entry as permission or as an unsupported
feature without checking the applicable source contract.
