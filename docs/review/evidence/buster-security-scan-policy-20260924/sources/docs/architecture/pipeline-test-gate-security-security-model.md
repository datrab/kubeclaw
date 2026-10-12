# Security suite security model

Project configuration is data, not code. Providers receive only typed inputs and named capabilities.

Trivy runs in a trusted capability with a minimal environment, bounded time, bounded output, offline databases, repository containment, and a registry allowlist. Image references must be immutable digests. Static policy verifies the manifest bytes against the supplied digest before execution.

Header checks can call only the exact endpoint from the current deployment input. The shared network capability applies method, origin, header, request-size, response-size, and deadline policy.

Runtime Kubernetes inspection is brokered by the namespace controller. The controller already owns namespace observation. It reports normalized findings on the lease. Submitted provider code cannot list the namespace and cannot receive Kubernetes credentials.

Exact acceptances change the blocking decision only until expiry. They never delete evidence. Scanner errors fail closed as provider errors.
