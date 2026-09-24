# End-to-end test operator guide

## Runtime requirements

Buster must contain the pinned Playwright package, its approved browser builds, and the native `plugin-sandbox` supervisor. Configure the executable paths, read-only roots, runtime modules, browser directory, target ports, and worker limit in `browserPlaywright`. Also configure the time, log, report, attachment, process, memory, and CPU limits. Set the termination grace time and the dedicated cgroup v2 root. Production uses Service port `18080`. The fixture capability resolves that Service port to its numeric backend port from the checked manifest. The E2E deployment pod must have `kubeclaw/e2e-target: "true"`. The namespace controller creates and deletes the lease-scoped Egress NetworkPolicy that matches the lease name, lease UID, pod label, Service port, and backend port.

The capability starts an attempt-local exact-origin HTTP proxy and forces every Playwright browser project through it. The supervisor permits only that temporary loopback TCP port to the untrusted process tree. Seccomp rejects Internet datagram and raw sockets. The supervisor also applies filesystem Landlock rules, acts as a Linux child subreaper, and terminates descendants that detach from the original process group. Each production attempt runs in its own delegated cgroup. Kernel `pids.max`, `memory.max`, `memory.swap.max`, and `cpu.max` controls enforce limits. The cumulative `cpu.stat` counter retains CPU use from short-lived descendants. The Kubernetes pod limit remains the outer boundary.

Mount only `/sys/fs/cgroup/kubeclaw-buster-browser` at `/var/run/kubeclaw-browser-cgroup`. The runtime canonicalizes both sides of this path check because Debian resolves `/var/run` to `/run`; this does not broaden the accepted subtree. Do not mount the host cgroup root. Startup fails if the directory contains processes or does not delegate the `pids`, `memory`, and `cpu` controllers. Contained development checks can explicitly use sampled accounting when the test environment has a read-only cgroup mount. Production has no sampled fallback.

The project can request fewer workers. It cannot exceed the operator maximum or the plan process limit. The capability supplies runtime Playwright modules only when the immutable source snapshot does not contain `node_modules`. It removes that temporary link after execution.

Grant `browser.playwright` only to the Playwright node. Do not grant `command.execute` or a general network capability to that node.

Use a dedicated test deployment and dedicated test accounts. Project tests are executable code and can change application state.

Before source cutover, run:

```bash
npm run verify:test-gate:e2e-cutover
npm run verify:migration:workflow
npm run docs:publish-check
```

The contained gate must use the real Playwright binary and a real browser. It must not use a mocked browser, a synthetic report, or a compatibility wrapper.

## Restart and recovery

Nova uses one idempotency key for one submitted plan. Buster stores the job before execution. A worker restart resumes the durable job. A duplicate submission returns the stored job and cannot start a second browser run. Cancellation stops the complete process group. The runner keeps terminal evidence and removes the temporary module link, report file, and artifact directory.

## Removal and rollback

The old `e2e` selector and `test_config.e2e` are retired. Rollback cannot restore that authority. To stop using Playwright, remove the `kubeclaw.playwright@1` node from `.swarm/pipeline.json`. To replace it, register another provider that emits `kubeclaw.e2e-result.v1`, prove parity, and complete a new source cutover. Do not re-enable the legacy suite.

If deployment acceptance fails, keep `productionAcceptance` pending. Restore the prior Nova and Buster images only if they use the same signed contract and do not restore deleted legacy authority. Retain the failed receipt and evidence for diagnosis.

## Runtime fetch and network rules

Production images contain Playwright and approved browser builds. The provider does not download packages or browsers during a run. The test browser receives only the network access allowed to the Buster workload and the authorized target. Use cluster network policy and a dedicated test namespace to prevent access to production services. Do not put general cloud credentials in the Buster container.

## Two-test minimum proof

The contained proof runs an assertion test, an independent test, and a project-owned skipped test. It then makes the assertion fail. The independent test still passes after the failure and after the configured retry. This proves `--max-failures=0` and strict aggregation.

## Production acceptance

After all 13 source cutovers, deploy the exact Nova and Buster revisions. Run `./scripts/deploy.sh nova-e2e-preflight IMAGE@sha256:DIGEST`. The proof must deploy the digest-bound fixture, send a signed plan through Nova and Buster, run real Playwright, import evidence, observe namespace and lease deletion, and store a signed receipt.

Do not mark production acceptance complete from a contained test.

Store the signed receipt at `dist/verification/e2e-production-receipt.json`. The receipt binds the Nova revision, Buster revision, plan, result, evidence, workload image digest, browser projects, `cgroup-v2` enforcement, and observed cleanup.
