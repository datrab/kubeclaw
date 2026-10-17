# Pipeline Test-Gate Phase 6-C Audit

Status: complete
Date: 2026-08-09

## Purpose

Phase 6-C executes one selected report adapter against one durable report
artifact. It gives the adapter no pipeline or provider authority.

## Runtime Flow

1. Require a `test-report` artifact.
2. Match the report media type to the selected registration.
3. Read the report only from an allowed durable artifact root.
4. Verify the declared byte size and SHA-256 digest.
5. Verify and copy the immutable adapter package into a private snapshot.
6. Start one bounded adapter process.
7. Pass the report bytes and detail limits through the private protocol.
8. Validate the returned normalized facts with the shared contract.
9. Attach the trusted adapter and source-artifact identities.
10. Remove the private package snapshot.

## Isolation

The adapter process can read only:

- Its immutable package snapshot.
- The small adapter child program.

The runtime snapshot directory is owner-only. Its parent must either prevent
other users from writing or use sticky-directory protection owned by the
worker or the privileged system owner.

The report bytes arrive through standard input. The adapter does not receive a
report file path. It receives no filesystem write, network, subprocess,
worker, native-addon, capability, pipeline-state, or gate-decision authority.
The runtime also disables the experimental `node:sqlite` built-in because it
does not use Node's filesystem permission checks.

The host enforces source bytes, result bytes, time, memory, CPU, open files, case,
report-finding, and case-finding limits. Cancellation terminates the process.
Every limit is required and validated again at the runtime boundary.
One invocation deadline covers artifact reads, package checks, snapshot work,
and adapter execution. The host enforces that deadline even when an artifact
reader does not process cancellation.

## Artifact Safety

The first driver supports `file:` artifacts under explicit roots. It opens
files without following symbolic links. It compares the open file to its
canonical path, verifies size, and verifies the content digest. Other durable
storage drivers can implement the same reader interface later. The runtime
repeats the size and digest checks after every driver read.

## Architecture Check

- D-078 keeps the original report as explicit durable evidence.
- D-081 requires third-party execution outside the Buster host process.
- D-090 keeps report adapters replaceable and fact-only.
- The runtime does not add a report workflow or a second gate authority.

## Proof

The runtime proof covers:

- Successful isolated normalization.
- Trusted adapter and source-artifact identity attachment.
- Non-report artifact rejection before any bytes are read.
- Unsupported media types.
- Size and digest mismatch.
- Sources outside allowed roots.
- Symbolic-link rejection.
- Invalid normalized output.
- Forbidden filesystem reads.
- Rejected `node:sqlite` filesystem-boundary bypass.
- Denied network system calls through the native sandbox seccomp filter.
- Time limits.
- Cancellation.
- Snapshot cleanup.
