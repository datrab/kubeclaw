# Explicit resource-aware WorkerCore V2

The independent real Node child counterprobe found that AgentProcess incorrectly
certified child CPU use with bridge-parent CPU counters. A child consuming over
1500 ms completed against a 200 ms budget with a reported 49 ms. Those counters
are removed. The current unprivileged Prism deployment has no delegated cgroup;
adding mandatory cgroup enforcement would disable every existing action. No
mounts, privileges, resource allowances or rollout defaults were changed.

D09 keeps every worker on the same shared executor while allowing per-worker
resource configuration. The explicitly opted-in V2 profile, attempt and result
schemas implement this distinction. Each CPU/memory/process capability declares
its metric scope, exact unit and measured/sampled/unavailable mode; unavailable
mode requires a reason and sampled mode requires a sampling interval. Every
budget is explicitly requested with a positive limit or explicitly unrequested.
The profile digest covers capabilities, and the attempt digest covers the
profile and budgets. Terminal receipts bind both digests, the exact capability
and budget policy, and each observed value or unavailable reason. Numeric
resource fields are absent when unavailable, never substituted with zero.

V1 schema, types, required budgets and strict failure on missing measurements
remain unchanged. Old V1 validators reject V2. Existing remote registration,
transport and consumers remain V1; this change does not silently upgrade them.
The new generated schema exposes only the V2 profile/attempt/result graph and
reuses the original schema definitions through its checked generator. TypeScript
uses Omit from the original common types rather than copied generated types.
The local agent declares core contract @2; ordinary log/progress transport still
uses its unchanged worker-protocol.v1 fields.

There is one WorkerAttemptExecutor. V2 preflight rejects a requested budget whose
profile says measurement is unavailable before preparing or launching work.
At completion every requested budget still requires an actual valid observation
within its limit; missing, invalid or excessive observations fail. An unrequested
budget is not a statement that a limit was satisfied. Measured/sampled modes
represent declared observations and post-operation checks, not a new claim of
kernel hard isolation. The provider remains responsible for truthful scope and
sampling declarations. Existing timeout, cancellation, claim fencing, bounded
cleanup, logs, evidence and result validation use the same execution path.

The actual AgentProcess declares all three local CLI process-tree measurements
unavailable and all three budgets unrequested. No arbitrary process/thread
allowance is introduced. Bridge-parent counters and separately running gateway
resources are not attributed to that tree. The original default deployment can
still launch actions, but its receipt cannot be read as V1 bounded evidence.
Control constructs and stores the exact accepted envelope in the claim
transaction; its policy is not selected or replaceable by the runner. The runner
uses that envelope and checks its local launcher content/profile digest before
launch. Both runner and Control validate exact V2 result-to-attempt binding.
Control rejects schema/digest, worker/fence, policy and evidence-accounting
mismatches before completion. A bare completed object is rejected. The narrowly
shaped startup diagnostic can only produce NeedsNova. Durable completion still
also requires the fenced tool receipt.
The existing container ceiling is not a per-attempt guarantee.

## Frozen source scope

- `contracts/pipeline-worker-core/v1/src/resource-types-v2.ts`
- `contracts/pipeline-worker-core/v1/src/resource-validation-v2.ts`
- `contracts/pipeline-worker-core/v1/scripts/generate-resource-schema-v2.mjs`
- Generated `contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v2.schema.json`
- Contract `src/index.ts` exports and `src/validation.ts` shared relation function export only
- `skills/worker/core/worker/resource-accounting.ts`
- Existing `skills/worker/core/worker/attempt-executor.ts` generic same executor
- Existing bridge-slice `skills/prism/server/agent-{attempt,process}.ts` and `agent-job-runner.mjs`
- `skills/prism/storage/migrations/014_agent_jobs.sql` accepted-envelope column and invariant
- `skills/prism/control/agent-jobs.ts` trusted claim construction and receiver binding
- `skills/prism/tests/agent-resource-contract.test.mts`, updated `agent-jobs.test.mts` and `agent-job-http.test.mts`
- This note, corrected `prism-agent-jobs.md`, and resource-V2 evidence files

## Evidence and limits

The new five resource tests run actual production AgentProcess and WorkerCore
with real Node children, including CPU consumption and absence of a launch marker
when unsupported requested CPU is rejected. They also verify runtime unavailable
failure, original assessor overrun with actual process CPU observation, strict V1
missing-metric rejection, V2 schema rejection and result policy binding. No
OpenClaw executable, provider or engine is impersonated. The original worker
contract/executor/runtime gates and deadline regressions are run unchanged.
The actual Docker COPY relocation/import test remains an import/build-context
check; it is not a Docker build. Full OpenClaw, native PostgreSQL pool, browser
and production deployment gates remain open as recorded in prism-agent-jobs.md.

Final serial run: 29/29 pass (`prism-agent-resource-v2-tests-serial.txt`). The
concurrent run is retained separately: 28/29, with the original deadline test
receiving termination-failed instead of phase-unresolved under concurrent SQL
load. No test timeout or source was changed to obtain the serial pass. All three
unchanged V1 gates pass (`prism-agent-resource-v2-v1-contracts.txt`). Core,
contract and Prism typechecks pass; focused new-module canonical lint passes.
The existing executor's canonical lint count remains 18→18; the exact comparison
is retained in `prism-agent-resource-v2-lint-comparison.json`. Schema generator
`--check` and whitespace validation pass.

Receiver counterexample corrected: the independent real HTTP/SQL probe could
previously submit `{state:completed}` after a genuine fenced design write. The
new original HTTP test rejects that object, altered policy, foreign worker and
inconsistent evidence bytes, then accepts a genuine original Core/Node receipt.
The database reopen test verifies the exact accepted envelope survives. These
focused receiver/resource/process checks pass 9/9; the genuine store/package
checks pass 8/8. Both evidence logs remain available. The launcher content digest
now hashes the actual agent-process, agent-attempt, agent-job-runner, agent-prompt
and preference-prompt files. This is precisely that local launcher source set,
not an identity claim about installed OpenClaw, its gateway or a model bundle.
The existing Control and agent images already include these files. A code mismatch
across those deployments fails before launch; no requested policy is rewritten.

Final receiver-integrated serial suite passes 29/29 in
`prism-agent-resource-v2-final.txt`; Core/contract/Prism typechecks, focused
canonical lint, schema generation check and whitespace check pass after that
correction.

The final receiver countercheck also derives UTF-8 JSON bytes from each present
specialistResult and requires exact receipt count plus the accepted result limit.
A genuine Core receipt with a recomputed digest but falsified resultBytes=0 is
rejected through actual HTTP. Errored/null receipts retain their existing
historical operation-byte semantics. Focused HTTP/resource tests pass 6/6 in
`prism-agent-resource-v2-result-bytes.txt`; targeted lint and typechecks pass.
