# End-to-end test security model

## Trust boundary

Project Playwright tests are executable project code. Buster runs them only in a private attempt workspace after Nova signs the immutable source archive and grants `browser.playwright` to the exact node.

The capability accepts only an operator-approved origin or an origin derived from that node's typed fixture input. Project and config paths stay inside the attempt repository. Attachment paths must also stay inside it.

The operator controls browser binaries, runtime modules, the read-only filesystem roots, target ports, browser storage, workers, total time, output bytes, report bytes, attachment bytes, attachment files, process count, memory, and CPU time. Cancellation terminates the Playwright process group. Temporary runtime dependency links, JSON reports, and canonical artifact directories are removed after the run.

Project tests can make the browser perform application actions. Use a dedicated test deployment and test credentials. Do not point an E2E node at production.

## Executable-code boundary

Project Playwright configuration and test files are executable code. They can import packages from the pinned runtime and can create browser traffic. They cannot select the Playwright binary, browser bundle, runtime package root, result contract, evidence destination, or hard limits. Buster uses an immutable source snapshot and a private attempt directory. Landlock gives the process write access only to that attempt workspace and read access only to declared runtime and operating-system roots. Chromium needs `/proc`, so the trusted launcher changes the complete test process tree to UID `1001` before Landlock applies. The trusted worker uses UID `1000`. Linux process permissions therefore deny access to the worker environment and file descriptors. The capability launcher is outside every project read root. Seccomp blocks privileged kernel operations. Kubernetes pod limits bound the worker. A native subreaper supervises the browser command and terminates adopted descendants, including processes that create a new session. In production, one delegated cgroup per attempt enforces process, memory, swap, and CPU controls. Its cumulative CPU counter includes descendants that exit between samples. Browser supervision does not use `RLIMIT_AS` because Chromium reserves a large virtual address range.

## Network boundary

The typed fixture authorizes the target origin. Production uses a dedicated service port, `18080`. Buster creates one loopback proxy for the provider attempt. The proxy forwards only the exact authorized origin. The Playwright overlay forces every browser project through that proxy. Landlock permits the untrusted process tree to connect only to the proxy's temporary TCP port. Seccomp permits Unix-domain sockets and Internet-domain stream sockets only. It denies Internet datagram/raw sockets and all other socket families, including direct DNS, QUIC, packet, and netlink access.

For each lease, the namespace controller creates an Egress NetworkPolicy in the Buster namespace. The policy preserves Kubernetes DNS and permits Buster to reach the declared Service port and its manifest-resolved backend container port only on pods labelled `kubeclaw/e2e-target: "true"` in the namespace whose lease name and lease UID match that run. Production exposes Service port `18080`; the current nginx fixture resolves it to backend port `80`. Cleanup deletes this lease-scoped policy. The installed KubeClaw namespace baseline supplies the shared worker's other required egress rules; Kubernetes combines those rules instead of replacing them. Kubernetes policies are additive across concurrent leases, but project code cannot use those routes directly: its native Landlock rule permits only the attempt-local loopback proxy port, and the trusted proxy accepts only its exact target origin. Runtime package and browser downloads are forbidden. A project that needs an extra service must declare it as a controlled test fixture; it must not open general Internet egress.

## Evidence boundary

The capability writes report and attachment data only below a random attempt-owned path. It accepts only regular report files and contained attachment files or canonical Base64 bodies. It applies file, decoded-byte, output, raw-report, and complete-result limits before the provider imports evidence. The provider returns the common `kubeclaw.e2e-result.v1` contract. Buster verifies its real schema digest, exact counts, unique case IDs, and case outcomes before Nova receives it.
