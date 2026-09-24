# Size-Budget Implementation Plan

Status: complete

## Objective

Replace the old `bundle` directory scan with `kubeclaw.size-budget@1`.
The replacement remains shadow-only during implementation and parity.

## Contracts

- The provider consumes one named `build-output` artifact.
- The provider accepts a single file, USTAR archive, or GZIP-compressed USTAR archive.
- The provider emits one typed `baseline` artifact.
- A blocking node declares one or more limits.
- An advisory node can report measurements without a limit.
- Exact bytes are authoritative. Rounded kilobytes are not authoritative.

## Security Boundary

- The provider reads only runner-approved artifact files.
- The provider has no capability and no network access.
- The provider does not extract archive content.
- The provider rejects links, devices, duplicate paths, and unsafe paths.
- Fixed limits bound input bytes, expanded bytes, file count, and path length.

## Real Proof

The contained proof uses the real command sandbox and real `tar` executable.
It transfers the real archive through a typed artifact link.
The real isolated provider measures the stored artifact.
No mock or capability emulator is used.

## Stop Conditions

- The corrected 35-item baseline passes.
- Provider and typed-link tests pass.
- Current unit, manifest, and container-build tests pass.
- User, operator, configuration, error, and security documents pass their gates.
- Terra review reports no actionable finding.
- The implementation commit is pushed before parity begins.
