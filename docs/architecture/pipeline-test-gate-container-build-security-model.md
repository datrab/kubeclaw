# Container Build Security Model

Status: current

## Trust Boundary

Nova owns the pipeline graph and final gate decision. Buster owns execution.
The installed provider package supplies reusable build logic.

Project configuration and committed project files are untrusted input. BuildKit
and the registry are operator-owned external services.

## Source Boundary

Nova sends a signed archive from one committed Git revision. The provider reads
only the extracted repository and its private scratch directory.

The provider rejects absolute paths, parent traversal, and symbolic-link
escapes. The capability runtime repeats containment checks before it invokes
BuildKit.

## Execution Boundary

The provider cannot execute a shell. It can request only the
`container.build` capability. The capability accepts one operation:
`build_push_verify`.

The capability invokes the configured `buildctl` executable with literal
arguments. Projects cannot select the BuildKit address, registry, executable,
or capability operation.

## Credential Boundary

The operator stores registry credentials in named environment variables. The
project cannot read or name those variables.

The capability creates a private temporary Docker configuration. It removes
the directory after success, failure, or cancellation.

Authenticated remote registries require HTTPS. Loopback HTTP is allowed for
contained tests.

## Build-Argument Boundary

Build arguments can leak through metadata or image layers. The default operator
allowlist is empty.

The operator can allow exact non-secret names. The provider rejects names that
contain token, secret, password, key, or credential terms.

## Registry Integrity

BuildKit returns a manifest digest after push. Buster downloads that manifest
by digest. Buster limits the response size and hashes the received bytes.

The build passes only when the downloaded digest equals the BuildKit digest.
A mutable tag cannot replace this check.

## Resource Boundary

The operator sets maximum execution time, log bytes, and manifest bytes. The
test node can request smaller values. It cannot exceed operator ceilings.

BuildKit worker CPU, memory, disk, and process controls belong to the operator
deployment. They are outside the provider process.

## Network Boundary

The provider has no direct network capability. The operator BuildKit daemon
needs network access for base-image pulls and registry pushes. The capability
runtime accesses only the configured registry endpoint for verification.

## Cancellation and Cleanup

Cancellation aborts the BuildKit client request. The capability removes
temporary metadata and credential files in a final cleanup step.

## Contained Proof Boundary

The Nova pod has `buildctl` but no BuildKit daemon. The contained proof uses a
contract emulator for that unavailable daemon boundary.

The proof uses the real provider, capability validation, registry HTTP path,
digest verification, result contract, and gate route. It does not prove the
selected host daemon, worker limits, service manager, or registry deployment.

The final external proof must use the selected BuildKit and registry services.
