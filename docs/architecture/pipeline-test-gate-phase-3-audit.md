# Pipeline Test-Gate Phase 3 Audit

Status: complete
Audit date: 2026-08-05

## Purpose

Phase 3 adds test providers to the existing plugin package and registry system.
It does not create a second package system.

## Implemented Behavior

### Package Manifest

A `plugin.json` file can contain an optional `testProviders` list.

A package can contain:

- No test provider.
- One test provider.
- Several independent test providers.
- Test providers together with stages, observers, or adapters.

A package that contains only test providers still uses the normal plugin
installation and discovery path.

### Registration Validation

Each test-provider declaration contains:

- A local registration ID.
- A stable tool contract ID.
- Test or fixture kind.
- Module and exported function.
- Configuration schema.
- Typed inputs and outputs.
- Required capabilities.
- Retry-safety declaration.
- Supported matrix fields.
- Supported evidence types and default evidence policy.

The registry rejects:

- Invalid manifest data.
- Missing modules or schemas.
- Invalid configuration schemas.
- Duplicate global registration IDs.
- Duplicate tool contract IDs.
- Duplicate input or output names.
- Untyped value ports.
- Artifact ports without media types.
- Evidence defaults that the provider does not support.

### Locked Identity

The registry creates the canonical provider registration.

It adds:

- Package ID.
- Exact package version.
- Package content digest.
- Configuration schema digest.
- Registration provenance.

The provider cannot declare its own package digest. This avoids a circular
package digest.

### Registry Snapshot

The registry exposes two read-only indexes:

- Global registration ID to provider.
- Stable tool contract ID to provider.

The complete registry snapshot has a deterministic digest. The digest includes
the locked package and registration facts. The snapshot and its provider
registrations are frozen.

### Configuration Validation

The registry compiles each provider configuration schema during registry
creation.

The suite resolver can later validate the final resolved provider settings by
stable tool contract ID.

### Installation and Inventory

External package installation checks test-provider module syntax with the same
package installation path used by other executable registrations.

The generated plugin inventory now recognizes the `test-provider` registration
kind.

## Intentionally Not Implemented in Phase 3

Phase 3 does not:

- Select tests or suites.
- Read `pipeline.json`.
- Resolve provider settings.
- Grant provider capabilities.
- Import or execute provider code.
- Schedule tests.
- Create results, evidence, or receipts.

Those functions belong to later phases.

## Proof

The provider-registry test proves:

- Discovery through the existing plugin system.
- Two independent providers in one package.
- Stable contract lookup.
- Exact package version and digest.
- Configuration schema digest.
- Deeply frozen registrations and read-only maps.
- Stable snapshot digest.
- Snapshot stability when package discovery order changes.
- Snapshot changes when provider package or schema content changes.
- Valid and invalid provider configuration.
- Duplicate contract rejection.
- Invalid evidence-default rejection.
- Duplicate port rejection.
- Invalid schema rejection.
- Missing provider module and schema rejection.

The external installation test also proves that invalid test-provider module
syntax blocks installation without executing provider code. The installer
checks JavaScript as module input. It strips supported TypeScript syntax before
the same check because Node's direct file check does not reliably validate ES
module files in the supported runtime.

## Later Execution Check

The registry locks the package digest in the snapshot. Phase 5 must verify this
locked digest again before it imports provider code. This prevents a package
file change after discovery from changing an active run. Phase 3 does not
import provider code.

The complete plugin-system verification proves that the new surface does not
break the existing Nova plugin registry, capability system, package installer,
or plugin runtime.

## Proof Commands

```text
npm run verify:test-gate:provider-registry
npm run verify:plugin-system-v2
```
