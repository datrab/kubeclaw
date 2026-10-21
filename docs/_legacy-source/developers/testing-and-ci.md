# Testing And CI

Permanent release checks:

```bash
export KUBECLAW_TEST_CGROUP_ROOT=/sys/fs/cgroup/kubeclaw-verification
npm run verify:plugin-system-v2
npm run typecheck:skills
npm run docs:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

Before running the plugin-system verifier, have the host administrator provision
the path in `KUBECLAW_TEST_CGROUP_ROOT` as a writable, delegated cgroup-v2 subtree.
The example path above is a placeholder for that real host-provided delegation;
exporting it does not create or configure the subtree. The root must be absolute,
must not be `/sys/fs/cgroup` itself, must contain no processes in `cgroup.procs`,
and must have `memory` enabled in `cgroup.subtree_control`. The verifier creates
per-invocation children and requires writable memory controls and `cgroup.kill`,
plus readable memory and population event files. The host must also support the
native sandbox and process-tree interfaces used by the isolation checks.

The npm chain passes this required root explicitly to the phase11, isolation,
and external-engine gates. A missing or empty variable fails with a configuration
error; an invalid root fails the unchanged isolation validator. An ordinary
directory cannot substitute for cgroup-v2 delegation. If the host cannot provide
these facilities, report the affected verification as blocked and run the same
unmodified gates on a host that can; do not skip or simulate isolation checks.

The real model-backed harness is
`tests/verification/e2e/run-real-pipeline-e2e.mjs` and is run deliberately at
release cutover because it consumes external agent capacity.
