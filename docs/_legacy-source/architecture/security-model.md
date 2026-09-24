# Plugin Security Model

Trusted first-party packages are imported only after inert discovery, schema
validation, content-digest verification, and import-side-effect auditing.
Restricted external packages are installed transactionally and execute through
`skills/common/plugin-runtime/foundation/isolation/runner.ts`.

Security invariants:

- trust roots and grants are operator-owned;
- each invocation receives only registration-specific capabilities;
- secrets are resolved through a capability and are redacted from journals;
- filesystem, network, command, environment, time, and resource boundaries are
  enforced for restricted packages;
- failed installation or activation leaves no partial package state;
- cancellation and crashes are contained at the registration boundary;
- only core commits lifecycle transitions.

Run the malicious-package and isolation suite with:

```bash
npm run verify:plugin-system:phase11
```

External execution requires platform `isolation.cgroupRoot` pointing to an
operator-delegated cgroup-v2 subtree. Missing delegation fails closed; a V8 heap
limit alone is not a memory guarantee. The host fixes each invocation's
memory.max to its lease rounded down to the actual host page size, verifies
exact readback, disables swap, and pins the isolation policy for
recovery. The native supervisor remains outside the workload group for
termination/reaping and handles parent death; sessions wait for process closure
and group cleanup before reporting completion. Cleanup failure is an error.

Validate the native resource/process boundary on a provisioned Linux x86-64 host:

```bash
npm run plugin-system:sandbox:build
node tests/verification/contracts/check-plugin-system-v2-isolation-kernel.mjs /sys/fs/cgroup/kubeclaw-external 65534 65534
```

This gate requires readable proc task-children files and actual writable cgroup-v2
delegation and host authority to drop to the supplied nonzero UID/GID (choose IDs
appropriate to the deployment). It reports blocked prerequisites explicitly. Protocol-only tests
exercise real child pipes, not kernel isolation, and must not substitute for this
gate when asserting deployed containment.
