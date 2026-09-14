# Native test entrypoint type coverage

The extra strict check added during the registry slice exposed six pre-existing
errors. RealE2ERunWorkspace declared only projectName and worktreePath, leaving
actually returned runId/artifactRoot/swarmDir as unknown. The declaration now
includes those concrete string fields. The Kubernetes fixture's heterogeneous
capability Map explicitly uses the existing TestProviderCapabilityInvoker contract.
No runtime behavior, fixture assertion or provider was changed.

Both original native HTTP/Kubernetes entrypoints are now included in
`tests/verification/integration/tsconfig.registry-live.json`, appended to the
normal `typecheck:integration` command and executed by the PR static job. The
entire existing integration typecheck command plus the new entrypoints exits 0.
This supersedes the unresolved type-error note in the earlier registry slice;
the original failed before/baseline outputs remain unchanged in its evidence.

Two actual, unchanged Playwright Chromium installation attempts targeted the
required browser151.0.7922.34/revision1234. Both exited1 because the installer's
mtime ownership check raised ECOMPROMISED before installation completed. The
second attempt used normal stale-lock acquisition, with no lock removal, package
patch, flag disabling checks, browser substitution or changed security settings.
Simple synchronous/asynchronous timestamp probes did not reproduce the mismatch;
the underlying cause is unknown. Both installer sessions have terminated.
No browser test or native Studio/renderer acceptance is claimed.

Evidence: `docs/review/evidence/pr6-native-entry-types/`. The finding statuses and
39-ID scope remain unchanged.
