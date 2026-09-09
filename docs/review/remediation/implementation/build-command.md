# Container build and direct-command corrections

Addresses PCR-CONTAINER-BUILD-001, PCR-CONTAINER-BUILD-002, and PCR-DIRECT-COMMAND-001 from the original remediation register.

## Changes

The Buster runner enforces required outputs when a provider reports `passed`. A failed build may therefore finish with `completed`/`failed` and no image, while a passed result missing its required image still fails output validation. Every supplied output is still validated on failure, including declaration identity, schema identity, evidence existence, and artifact media type. Downstream artifact/value resolution still rejects absent linked outputs. The container manifest's required image declaration is unchanged.

The container capability now measures one absolute deadline from invocation start, subtracts elapsed setup time from the subprocess timeout, and uses the same combined caller/deadline signal for BuildKit and registry manifest verification. It checks expiration before BuildKit, before verification, and before publishing success. The deadline timer is cleared during cleanup. Manifest readers are cancelled and released, including oversized/rejected response paths.

A completed nonzero BuildKit process remains a failed build result. Launch/resource failures and metadata/registry verification errors throw execution errors instead of becoming failed test outcomes. The invoker's own deadline throws `CONTAINER_BUILD_TIMEOUT`; caller cancellation retains `CONTAINER_BUILD_CANCELLED`. These codes distinguish the causes, but an operator deadline is represented by the existing worker error path (`errored`), not a new worker `timed_out` mapping. Buildctl nonzero exit codes do not themselves distinguish Dockerfile failure from every possible daemon/push-side error; this change does not claim that additional classification.

Execution-error conversion preserves the complete original diagnostic in the top-level `Error.message`, as well as `cause`, because runner serialization does not retain the cause chain. Thus registry HTTP 503 stays `CONTAINER_BUILD_REGISTRY_READ_FAILED:503`, and an OS launch failure becomes `CONTAINER_BUILD_EXECUTION_ERROR:<original spawn ENOENT message>`. The previous draft lost the status suffix/launch diagnostic when it emitted only the classification code; this regression is corrected. Execution diagnostics do not pass through the existing 4096-character failed-build message helper. That pre-existing bound still applies to nonzero BuildKit failure result messages, and is not claimed to preserve arbitrarily long failed-build diagnostics.

All eight generic direct-command artifact outputs now declare the same six media types accepted by the configuration schema and provider. This includes checked Kubernetes YAML and size-budget baseline JSON in positions two through eight.

## Verification and limits

Passed:

- `node skills/buster/plugins/container-build/tests/deadline.test.mts`: actual local HTTP manifest hashing, digest mismatch, HTTP 503, excessive declared length, a stalled response body consuming only the remaining absolute budget, observed response closure, caller cancellation, and already-expired budget. It also takes the actual HTTP 503 error and an actual OS `execFile` ENOENT failure through the production error-conversion function, asserting complete top-level diagnostics and retained causes; a 5000-character diagnostic vector verifies that this conversion does not silently truncate. This exercises the production deadline and registry verification functions directly; it does not simulate a successful BuildKit invocation.
- `node skills/buster/plugins/direct-command/tests/output-contract.test.mts`: actual package discovery/registry/resolver, actual `FileEvidenceStore` copies and hashes, and the production output validator used by the runner. Covers all eight slots across all six configured media types, successful omission rejection, failed omission acceptance, failed value-schema rejection, and both missing evidence and unsupported media on passed/failed outputs. These are explicitly contract input vectors, not claimed provider executions.
- `node tests/verification/contracts/check-pipeline-container-build-implementation.mts`: original registry/resolver and source implementation checks.
- Scoped `git diff --check`.

Blocked or failed, not replaced:

- `node skills/buster/plugins/direct-command/tests/runner-artifacts.test.mts` uses the original registered provider, original runner, and native command capability. The local native provider process fails before command execution (`errored`, `write EPIPE`). It remains an assertion failure, not a skipped or accepted result. The test covers a real command producing two files, with checked YAML and size-baseline respectively in the second output, when the native launcher is available.
- `node tests/verification/contracts/check-pipeline-direct-command-provider.mts` reproduces the original native execution blocker: first command exit 70 instead of 0.
- `node tests/verification/contracts/check-pipeline-container-build-production.mts` stops with `CONTAINER_BUILD_LIVE_CONFIGURATION_REQUIRED`. Neither `buildctl` nor `docker` is installed. Real successful/failed Dockerfile builds through the full runner and a build followed by stalled registry verification therefore remain unverified here.
- `node_modules/.bin/tsc --noEmit -p skills/common/plugin-runtime/tsconfig.json` reports existing errors only in `skills/buster/engine/test-gates/kubernetes-manifest.ts`: TS2554 at line 12 and TS7006 at line 13. No changed-file diagnostic was reported; this is not a passing global typecheck.

New local regressions are included in their respective package test commands. Native artifact acceptance is separately runnable with the direct-command package's `test:native-artifacts` command. No mock executor, fake BuildKit, replacement sandbox, fabricated provider report, CI run, deployment, external write, staging, or commit was performed.
