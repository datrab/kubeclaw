# Run and Diagnose a Buster Suite

Status: implemented; live dependencies vary by suite
Audience: pipeline author and operator
Owner: buster
Evidence: contracts/pipeline-test-gate/v1/examples; skills/nova/core/test-gates/resolver.ts; skills/buster/engine/test-gates; skills/buster/plugins
Evidence revision: `3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f`
Applies to: one pipeline test-gate scope
Last verified: source and contract inspection on 2026-09-19

## Goal

Select a shipped suite, make its project-specific work explicit, resolve one
immutable plan, run it remotely in Buster, and diagnose the result without
confusing a transport status with a quality decision.

This workflow uses the unit suite because it runs without Kubernetes,
Tailscale, a browser, or a scanner. The same lifecycle applies to all twelve
suites. Their additional prerequisites are in the
[suite reference](../../reference/buster-suites.md).

## Before You Start

Confirm these facts:

- the project is in Git and the revision to test is committed;
- Nova and Buster use compatible pipeline-test-gate contracts;
- the Buster role contains the selected provider and report adapter packages;
- the operator catalogue maps `npm` to an approved executable;
- the project command creates the declared JUnit file inside its workspace;
- Nova can authenticate to the Buster endpoint; and
- Buster has enough state, result, archive, and evidence capacity.

Do not use an uncommitted working tree as input. Nova sends a `git archive` of
the committed tree. A local file that is not in that tree cannot appear in the
remote workspace.

## 1. Start From The Maintained Example

The repository has two executable declaration examples:

> **Blocking unit test**
>
> [Open the complete `pytest` suite declaration](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/examples/unit-suite-blocking.json).
>
> **Unit test plus coverage budget**
>
> [Open the complete test, LCOV output link, and coverage node](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/examples/unit-suite-with-coverage.json).

Copy the structure into the selected test scope in `.swarm/pipeline.json`, then
change the executable, arguments, working directory, and evidence paths to the
project. Keep `uses: kubeclaw.unit-suite@1`. Add project work under `add` because
the shipped unit template is intentionally empty.

**Why this shape:** The stable suite supplies a reusable contract and group.
The project supplies the command because only the project knows its test tool
and report location. Buster does not discover or guess either one.

For the complete fixture, matrix, and report path, use the maintained
[full pipeline example](examples/buster-fixture-matrix-report.pipeline.json).
It contains one JUnit-producing unit node, one checked-manifest producer, one
Kubernetes deployment fixture, and an HTTP node expanded for `/health` and
`/ready`. The fixture link uses `unit/checked-manifest` because nodes added to a
selected suite receive the suite-instance prefix. The HTTP node links the
fixture's typed deployment output. The JUnit report causes resolution to bind
the installed JUnit adapter.

The example uses placeholder image digest `sha256:aaaa…`. Replace the complete
reference and digest with a real immutable image. `manifest-check` is also an
operator-catalog name, not an assumed host executable. Map it to the project's
checked-manifest producer before execution. Keep these substitutions explicit;
otherwise admission must fail.

## 2. Make The Decision Explicit

Use `mode: blocking` when a failed test must fail the gate. Use `advisory` only
when the result must remain visible but cannot stop the gate. Choose
`junit-required` whenever the tool can create JUnit. It gives Buster case counts
and protects against the false-green case where a process exits zero without
running tests.

Set Buster `retries` separately from test-runner retries. Buster retry repeats
the complete provider attempt and keeps both attempt records. A test-runner
retry happens inside one attempt and appears in its report. Direct command is
contractually retry-safe, but stateful providers such as Playwright, API flow,
OpenAPI, fixtures, and exposure are not.

## 3. Link Outputs Instead Of Sharing Paths

The coverage example links the direct-command output `coverage-1` to the
coverage-budget input with the same media type. This link is part of the plan.
The coverage provider does not search the repository or another attempt's
directory.

Use the same rule for images, checked manifests, deployments, credentials,
public endpoints, build archives, and baselines. If data crosses a node
boundary, declare a compatible output and input. `needs` controls order but does
not move data.

## 4. Resolve Before You Run

Run the repository's suite resolver check after changing a suite declaration:

```text
npm run verify:test-gate:suite-resolver
```

Resolution must reject, before remote execution:

- unknown suite or provider identities;
- unknown configuration fields or invalid values;
- excluded or overridden node names that do not exist;
- a retry on a provider that is not retry-safe;
- missing, incompatible, or cyclic links;
- an unsupported matrix field or oversized expansion;
- a missing required coverage target; and
- a concurrency value above policy.

A successful resolution freezes suite-template digest, provider package
digest, node configuration, dependency graph, links, conditions, matrices,
limits, and plan digest. Changing any one of them requires a new plan identity.

## 5. Submit and Observe

Nova records dispatch intent before it contacts Buster. Buster verifies source
signature, archive digest, derived job ID, request digest, plan digest, provider
identity, and store capacity before it returns `accepted`.

Observe the states in order: `accepted`, `running`, and one terminal state.
`completed` means that Buster produced a complete result object. It does not
mean that every blocking test passed. Nova must fetch the exact result digest,
verify its identities and receipts, import every referenced evidence digest,
and then calculate the gate decision.

The repository includes an executable vertical proof for this complete path.
It creates a temporary Git repository and resolves a unit-suite plan. It then
starts a real local Buster service and submits the signed source snapshot. The
proof runs the provider through Worker Core, parses JUnit, imports evidence, and
checks the Nova decision.

```text
npm run verify:test-gate:phase8
```

This command needs a C compiler, GNU `flock`, `/usr/bin/tar`, and a sandbox that
can start child processes. Stop if `plugin-system:sandbox:build` fails. Do not
treat a smaller registry or resolver check as execution evidence. The
[vertical proof source](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/tests/verification/contracts/check-pipeline-phase8-vertical.mts)
shows the temporary project, runtime, submission, expected result, and negative
controls.

The fixture-and-matrix example is a configuration template. It proves loading,
resolution, port links, matrix expansion, and JUnit-adapter binding. It cannot
prove a live Kubernetes run until you replace its image and command placeholders
and supply the broker described in [Before You Start](#before-you-start).

> [Buster status and result are separate remote objects](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/engine/test-gates/remote-plan-http.ts#L80-L178).
>
> [Nova verifies and imports each result and evidence digest](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/nova/core/test-gates/remote-result-import.ts#L156-L207).

## 6. Read The Result In The Correct Order

1. Check job identity, plan digest, source revision, and terminal state.
2. Check the gate decision and required coverage.
3. Find the first blocking node that is not passed.
4. Read every attempt, including earlier retries.
5. Separate provider `failed` assertions from `errored` execution.
6. Check fixture cleanup and retained resources.
7. Open normalized report facts, then the original report evidence when detail
   was capped or parsing failed.
8. Verify that Nova's evidence import is complete.

For a unit node, common `failed` facts are failing JUnit cases or a coverage
percentage below its minimum. Common `errored` facts are an unknown executable,
missing report, invalid XML, unsafe path, timeout, signal, output limit, or
evidence digest mismatch.

## 7. Diagnose By Boundary

| Observation | Boundary | Action |
| --- | --- | --- |
| Plan never resolves | Project declaration, suite, provider schema, graph, or policy | Read the exact resolver error. Correct the declaration; do not retry transport. |
| Submission is rejected | Source/request identity, authentication, capacity, or installed registry | Compare the stored Nova job with Buster admission. Reuse the same idempotency key only for identical bytes. |
| Job remains accepted | Buster scheduler or recovery | Check readiness, durable record, concurrency, and recovered-job state. |
| Provider errors before process start | Package snapshot, grant, executable catalogue, or Worker admission | Check exact package digest, role closure, capability grant, and worker profile. |
| Process exits but node errors | Required report/evidence missing or invalid | Inspect attempt log and declared path. Do not change to exit-code mode merely to hide the report error. |
| Node is skipped | Condition or upstream outcome | Read the skip cause and coverage rule. A skip is not a pass. |
| Job completed but Nova does not decide | Result/evidence fetch, digest, receipt, or import | Preserve both stores. Repair transport or missing blob; do not rerun under the same identity with different content. |
| Cancellation appears late | Cooperative stop crossed a terminal transition | Trust the guarded terminal record. Inspect descendant cleanup before another run. |

## 8. Clean Up

Direct-command workspaces are attempt-owned and removed through Worker Core
cleanup. Fixture suites add external resources. Confirm that each fixture
cleanup is successful or that an intentional retained lease has a bounded
expiry. Do not call a test run complete while a cleanup result is unknown.

## Expected Result

A successful run has one immutable plan, a committed source identity, a
terminal Buster result, passed required nodes, satisfied coverage, complete
evidence import, and proved cleanup or bounded retention. The audit path can
connect each fact to the exact provider package and attempt.

For the executable vertical proof, the command prints a JSON object with
`"ok": true`, `"remote": true`, provider `direct-command`, report `junit`, and
coverage `lcov`. A missing compiler, incompatible lock program, absent archive
tool, or denied process launch is an environment failure. It is not a passed or
failed test result.

## Extend The Workflow

- For API selection, use the [maintained API override example](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/examples/api-suite.json).
- For all provider fields and live prerequisites, use the [suite reference](../../reference/buster-suites.md).
- For a new provider, fixture, report format, or suite, use [Extend Buster](../../extend/buster.md).
- For engine or controller changes, use [Develop Buster](../../extend/platform/buster.md).
