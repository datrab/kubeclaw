# Understand KubeClaw

Status: implemented
Audience: architecture reader, maintainer, security reviewer
Owner: platform-architecture
Evidence: packaging/runtime/roles/nova.json; packaging/runtime/roles/buster.json
Applies to: current supported release
Last verified: generated during publication

## Purpose

KubeClaw runs a frozen pipeline graph through a generic core and self-contained plugins.

Nova owns scheduling, lifecycle state, retries, waits, recovery, and final run state. Plugins own specific work but cannot mutate canonical lifecycle state.

Buster uses Worker Core to execute test plans. Forge and Echo are dispatched specialists. They are not additional scheduler authorities.

## Read Next

- [Request To Result](request-to-result.md) follows one complete run.
- [Current Status](../status/current.md) identifies implemented and designed components.
- [Plugin Catalogue](../extend/plugin-catalogue/README.md) lists every installed extension package.
