# Size-Budget Security Model

Status: current

## Trust Boundary

Nova owns the plan and gate decision.
Buster owns provider execution and artifact transfer.
The installed provider package owns measurement logic.
Project configuration and artifact bytes are untrusted.

## Artifact Boundary

The runner supplies one immutable artifact reference.
The provider verifies its byte length and SHA-256 digest.
The provider accepts only local artifact URLs and declared media types.

## Provider Isolation

The provider declares no capability.
The child process receives read access to exact input files.
It receives write access to private scratch and evidence directories.
It receives no network permission.

## Archive Boundary

The provider reads archive headers and skips file content.
It does not extract files.
It rejects unsafe paths, duplicate paths, links, devices, and unsupported records.
It verifies each USTAR header checksum and terminal zero blocks.

## Resource Boundary

Input artifacts are limited to 512 MiB.
Expanded streams are limited to 2 GiB.
Archives are limited to 100,000 regular files.
Paths are limited to 512 bytes.
Project rules and result details are bounded.

## Baseline Integrity

The baseline is a typed artifact with a fixed media type.
The provider verifies its size and SHA-256 digest.
The provider validates its schema before growth calculation.

## Cancellation and Cleanup

Cancellation destroys the active file or GZIP stream.
The runner removes private attempt workspaces after evidence storage.
A cancelled attempt cannot produce a passing blocking result.

## Known Boundary

Version 1 accepts strict USTAR records.
It rejects PAX and GNU extension records.
Projects must create compatible archives or use one single-file artifact.

## Final External Proof

The final deployment proof must use the selected Buster and artifact store.
It must confirm provider isolation, evidence retention, restart recovery, and Nova authority.
