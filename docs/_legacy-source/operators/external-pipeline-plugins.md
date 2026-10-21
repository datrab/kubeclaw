# External pipeline plugins

External packages are disabled unless an operator explicitly stages them with
the canonical installer. Project configuration cannot add installation roots,
establish trust, grant authority, or install code.

An installation request must name an authorized operator, an immutable
canonical source, and the expected package digest. Trust requires either that
exact source/digest pair in the operator policy or a verified publisher
attestation for the digest. Local and `file:` source identities are rejected.

External packages are prebuilt. Host lifecycle scripts, host builds,
`node_modules`, symlinks, special files, oversized packages, invalid schemas,
invalid modules, and external adapter registrations are rejected before the
staged directory is atomically renamed into the installation root. A failed
install cannot create a discoverable package.

External stages and observers run in a dedicated Linux process. The process
receives only:

- the immutable invocation argument and public plugin context contract;
- read access to its own package;
- RPC access to the capabilities granted to that registration.

It receives no inherited credentials or general environment, filesystem write,
network, subprocess, native-addon, core-state, or host-process authority.
Linux resource limits and seccomp enforce CPU, memory, process, file, socket,
and privileged-system-call boundaries. Core terminates the process on
cancellation, timeout, protocol violation, or completion.

External capability adapters remain rejected. A long-lived adapter owns
connections, readiness, receipts, and shutdown state and therefore needs a
separate persistent isolated lifecycle protocol before it can be admitted
safely.

Run the complete isolation and installation gate with:

```bash
npm run verify:plugin-system:phase11
```
