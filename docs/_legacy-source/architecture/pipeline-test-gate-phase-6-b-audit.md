# Pipeline Test-Gate Phase 6-B Audit

Status: complete
Date: 2026-08-09

## Purpose

Phase 6-B implements report adapters as normal plugin registrations. It does
not add a compiled list of report formats to Buster.

## Implemented Registration

A plugin can declare zero or more report adapters. Each declaration contains:

- A package-local adapter ID.
- A report format.
- A contract version.
- A module and exported function.
- Accepted media types.

Discovery verifies the package, module path, manifest shape, and immutable
package digest. The registry converts the plugin declaration into the shared
report-adapter registration contract.

The registry stores:

- Every adapter by `package-id:adapter-id`.
- Every format with all installed candidate adapters.

Multiple adapters can support the same format. This is required for
replacement and imported adapters. Discovery order does not select an
adapter. A resolved plan must later select one exact registration.

## Architecture Check

- D-054 applies the same independent registration rule used by providers.
- D-069 locks package version and content digest.
- D-090 is implemented without a Buster format switch.
- Built-in and imported adapters use one registration surface.
- Report adapters receive no stage, gate, or pipeline authority.

## Proof

The registry proof verifies:

- Several adapters in one package.
- Several adapters for one report format.
- Stable registry identity independent of package discovery order.
- Frozen registrations and maps.
- Package provenance and report-adapter provenance.
- Missing module rejection.
- Duplicate package-local registration rejection.
- TypeScript and generated SDK agreement.
