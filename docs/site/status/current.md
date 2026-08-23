# Current Platform Status

Status: implemented
Audience: operator, plugin author, architecture reader
Owner: platform-architecture
Evidence: packaging/runtime/roles/nova.json; packaging/runtime/roles/buster.json
Applies to: current supported release
Last verified: generated during publication

## Implemented

- Nova is the generic pipeline orchestrator and lifecycle authority.
- Plugin API version 2 is the sole active plugin contract.
- Worker Core provides neutral attempt execution and worker lifecycle behavior.
- Buster is a packaged Worker Core test engine.
- Forge and Echo are dispatched specialist boundaries.
- Plugin stages, observers, adapters, test providers, and report adapters use declared registrations.
- External stages and observers use the isolated plugin process boundary.

## Designed

- Prism has design contracts and implementation evidence outside the current KubeClaw runtime-role inventory.
- Additional worker engines can use Worker Core after they satisfy its contracts and verification gates.

## Removed

Legacy plugin aliases, dual runtime authority, and superseded v1 execution paths are not supported.
