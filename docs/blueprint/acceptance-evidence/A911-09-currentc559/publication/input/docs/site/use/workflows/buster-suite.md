# Run and Diagnose a Buster Suite

Status: implemented; live dependencies vary by suite
Audience: pipeline author and operator
Owner: buster
Evidence: [contracts/pipeline-test-gate/v1/examples](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/contracts/pipeline-test-gate/v1/examples); [skills/nova/core/test-gates/resolver.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/nova/core/test-gates/resolver.ts); [skills/buster/engine/test-gates](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/buster/engine/test-gates); [skills/buster/plugins](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/buster/plugins)
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

## Supported Execution Paths

There are two different paths. Do not use them as if they prove the same fact.

1. A deployed pipeline submits work through the configured Nova test-gate
   integration. This is the supported production path. The repository does not
   ship a general-purpose `buster run` command or a command that signs an
   arbitrary job. Nova owns source attestation, durable dispatch, reconnect,
   result verification, and evidence import. Use the exact compile, start,
   audit, and recovery commands in this procedure.
2. A maintainer can run the repository's vertical proof from a clean checkout.
   This proof creates a temporary project and a local Buster service. It tests
   the real protocol and execution path, but it does not operate a deployed
   pipeline or prove an external dependency.

Do not construct a request with `curl`. A valid request needs identities,
digests, grants, a signed source snapshot, and an idempotency key that Nova
stores before transmission. A hand-written request bypasses that ownership
sequence and is not a supported operator procedure.

**Why the distinction matters:** A green repository proof establishes that the
software path works in its controlled fixture. A production run additionally
depends on the installation's authentication, package snapshot, stores,
capability policy, tools, network, and target system.

## Before You Start

Run repository proofs from the KubeClaw repository root. Run production
compile, start, audit, and recovery commands from the original KubeClaw checkout
in the Nova installation that owns the pipeline state. Its `package.json`
defines `npm run pipeline`; the project descriptor's `repositoryRoot` separately
selects the source repository. That repository can be elsewhere and does not
need a Nova npm script. Keep the command shell in the original KubeClaw checkout
and use absolute platform, project, graph, and evidence paths.

The [pipeline npm script](https://github.com/datrab/kubeclaw/blob/5de04728653e7b4c350850e5fbeb6218b25ba5c3/package.json#L42)
loads the [Nova dispatcher](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/nova/pipeline.ts#L1-L14).
The [project CLI](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/nova/project/cli.ts#L46-L51)
checks the selected project's HEAD and clean working tree with `git -C` before
starting a new run. Compilation does not perform those two source checks.

For a production run, the operator needs permission to start and inspect that
Nova pipeline. The Buster service account, token, source key, and capability credentials remain
service-owned; a project author does not need direct access to them.

Confirm these facts before either path:

- the project is in Git and the revision to test is committed;
- Nova and Buster use compatible pipeline-test-gate contracts;
- the Buster role contains the selected provider and report adapter packages;
- the operator catalogue maps `npm` to an approved executable;
- the project command creates the declared JUnit file inside its workspace;
- Nova can authenticate to the Buster endpoint; and
- Buster has enough state, result, archive, and evidence capacity.

For a repository proof, first complete the canonical
[Locked Dependency Installation](../quickstart.md#locked-dependency-installation),
confirm the checkout is clean, and confirm that the current Node.js version
satisfies `package.json`. The vertical proof also needs a C compiler, GNU `flock`,
`/usr/bin/tar`, and permission to start child processes.

Stop before submission when resolution fails, the source revision is not the
intended committed revision, the Buster readiness endpoint is not ready, or a
required live dependency is absent. Do not use a smaller check to waive one of
these conditions.

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

## 5. Submit and Observe in Production

There is no separate manual Buster submission command. Compile the project
first. Replace `<platform.json>` with the operator-owned platform file,
`<project.json>` with the project descriptor, and `<new-pipeline.json>` with a
new absolute path that does not exist. Run this command from the original
KubeClaw checkout, with absolute platform and project paths:

```text
npm run pipeline -- \
  --platform "<platform.json>" \
  --project "<project.json>" \
  --compile "<new-pipeline.json>"
```

Stop if compilation does not return `status: compiled`, or if the graph does
not contain the intended Buster quality stage and test scope. Record its
`definitionDigest`, derived `runId`, and completion scope. Compilation checks
registration and grants. It does not contact Buster.

Before starting, check that the repository selected by the descriptor's
`repositoryRoot` has committed HEAD equal to its intended `baseRevision` and a
clean working tree. Stop on either mismatch. Run the start command from the
same original KubeClaw checkout used for compilation:

```text
npm run pipeline -- \
  --platform "<platform.json>" \
  --project "<project.json>"
```

Expected output is one JSON object with `runId`, `status`, `completionScope`,
`acceptanceReadiness`, and stage states. Preserve that object. Exit zero means
the returned pipeline status is `succeeded`; it does not by itself prove human
acceptance or every external live prerequisite.

Nova records dispatch intent before it contacts Buster. Buster verifies source
signature, archive digest, derived job ID, request digest, plan digest, provider
identity, and store capacity before it returns `accepted`.

Observe the states in order: `accepted`, `running`, and one terminal state.
`completed` means that Buster produced a complete result object. It does not
mean that every blocking test passed. Nova must fetch the exact result digest,
verify its identities and receipts, import every referenced evidence digest,
and then calculate the gate decision.

Before audit, complete [Inspect a Run](../operate.md#inspect-a-run) at the
original Nova repository in Bash. Use the original platform path and the run
ID from the retained start command. Confirm that the run owner has exited,
stop new writes to that run and the owning adapter stores, and preserve
verified raw run and adapter copies. Audit can create append locks and truncate
an incomplete journal tail before parsing. Require successful strict parsing
of every copied run journal. Keep rejected raw bytes and stop on copy,
identity, or parse failure. Define the canonical `preserve_run_state` helper
in this shell; do not duplicate or replace it with a storage-opening reader.

If a run is still active, retain its command output and use supported component
or provider observations. Stop before audit when stopped-writer ownership and
preservation cannot be established. Process containment is not a successful
suite result. With all preservation checks complete, audit the returned identity:

```bash
export RUN_CONTROL_PLATFORM="<original-platform.json>"
export RUN_CONTROL_RUN_ID="<run-id>"
preserve_run_state || exit 1
audit_status=0
npm --silent run pipeline -- \
  --platform "$RUN_CONTROL_PLATFORM" \
  --audit "$RUN_CONTROL_RUN_ID" \
  > "$RUN_CONTROL_OBSERVATION_ROOT/audit.json" \
  2> "$RUN_CONTROL_OBSERVATION_ROOT/audit.stderr" || audit_status=$?
printf '%s\n' "$audit_status" > "$RUN_CONTROL_OBSERVATION_ROOT/audit.exit" || exit 1
test "$audit_status" -eq 0 || exit 1
```

Record the Nova run and operation IDs, Buster job ID, plan digest, source revision, and
submission time. Stop and investigate if the job identity changes for the same
operation, the state moves outside `accepted`, `running`, and a terminal state,
or Nova reports an identity or digest mismatch. A transport retry can reuse the
stored request only when its bytes and idempotency key are unchanged.

After process interruption, repeat [Inspect a Run](../operate.md#inspect-a-run)
with stopped run and adapter writers before audit or recovery. Retain original
raw bytes, require strict copied-journal inspection, and reconcile accepted
external effects through their owning contracts. Unknown outcomes or absent
reconciliation methods stop recovery. If an incident owner later authorizes
canonical tail repair, retain original bytes first and record the command and
its actual file changes. Then follow
[Recover After Interruption](../operate.md#recover-after-interruption) with the
same original project, platform, graph, package snapshot, and run identity.
Run the recovery command from the original KubeClaw checkout:

```text
npm run pipeline -- \
  --platform "<platform.json>" \
  --project "<project.json>" \
  --recover "<run-id>"
```

Recovery must use the original graph and package snapshot. It reconnects to
accepted Buster work through durable Nova state. Start a new run when governed
configuration must change. The complete core procedure and explicit-pipeline
forms are in [Operate KubeClaw](../operate.md#validate-before-starting).

## 6. Run the Local Vertical Proof

The repository includes an executable vertical proof for the protocol path.
It creates a temporary Git repository and resolves a unit-suite plan. It then
starts a real local Buster service and submits the signed source snapshot. The
proof runs the provider through Worker Core, parses JUnit, imports evidence, and
checks the Nova decision.

```text
npm run verify:test-gate:phase8
```

Run this command from the repository root after completing the linked locked
dependency installation. It creates its own
temporary repository, ports, state, source keys, and service. It does not need
a deployed Nova or Buster instance. Stop if `plugin-system:sandbox:build`
fails. Do not treat a smaller registry or resolver check as execution evidence.
The
[vertical proof source](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/tests/verification/contracts/check-pipeline-phase8-vertical.mts)
shows the temporary project, runtime, submission, expected result, and negative
controls.

Observe the final JSON line. A valid proof has `"ok": true`, `"remote": true`,
provider `direct-command`, report `junit`, and coverage `lcov`. The command
must exit zero. Preserve the full terminal output and current Git revision as
the evidence record. An exit zero without the stated fields is not the expected
proof.

The fixture-and-matrix example is a configuration template. It proves loading,
resolution, port links, matrix expansion, and JUnit-adapter binding. It cannot
prove a live Kubernetes run until you replace its image and command placeholders
and supply the broker described in [Before You Start](#before-you-start).

> [Buster status and result are separate remote objects](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/engine/test-gates/remote-plan-http.ts#L80-L178).
>
> [Nova verifies and imports each result and evidence digest](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/nova/core/test-gates/remote-result-import.ts#L156-L207).

## 7. Read The Result In The Correct Order

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

## 8. Diagnose By Boundary

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

## 9. Recover and Clean Up

For a failed local proof, keep the first error and full output. Correct the
missing host dependency, run the same command again, and compare the new Git
revision and output. The proof owns temporary directories and removes them in
its finalizer. If the process is killed, inspect only operating-system temporary
storage for a directory with the proof prefix. Do not remove project files.

For production, complete [Inspect a Run](../operate.md#inspect-a-run) before
any audit or interrupted-run recovery. Preserve verified raw run and adapter
copies with writers stopped; strict copied-journal failure preserves raw bytes
and stops the task. Do not resubmit different content with an existing job ID.
Reconnect through Nova when Buster has accepted the job. The current pipeline
CLI has no supported operator cancellation command. Process termination is not
durable cancellation. For urgent containment, preserve evidence, stop new
admission at the owning service, follow the approved incident process, and
reconcile each accepted external effect. Do not claim `cancelled` unless the
durable lifecycle record says so. See the [cancellation
boundary](../operate.md#cancellation-boundary).

Direct-command workspaces are attempt-owned and removed through Worker Core
cleanup. Fixture suites add external resources. Confirm that each fixture
cleanup is successful or that an intentional retained lease has a bounded
expiry. Retain the operation and job identities, plan and result digests,
attempt errors, evidence receipts, cleanup result, and lease expiry. Do not call
a test run complete while cleanup or retention is unknown.

## Deployment Success Exercise

This is the maintained healthy deployment exercise. It executes one
operator-supplied `nova-project.v2` descriptor through the project CLI. The
same descriptor is compiled, inspected, run, and audited. It must have no
architecture review or approval stage, and its final provider plan must contain
one executable chain from container build through a Kubernetes fixture and
Tailscale exposure to the blocking demo authentication check.

This exercise does not prove the conceptual
[20-step showcase trace](examples/request-trace-success.json). Prism is proved
separately by `prism-smoke` and the
[Studio journey](../prism-studio.md#the-complete-studio-journey). Discord and
Redis are reporter checks. Cilium and Hubble are network-enforcement and
observability checks. None of those separate checks is same-run Prism, human
channel, network-flow, or lifecycle evidence for this Nova project run.

Run only in a registered non-production acceptance environment during an
approved window. The descriptor must already contain independently resolved
plans and grants for this installation. Run every npm and deployment-script
command below from the original KubeClaw checkout, with its installed locked
dependencies. Keep this location through compile, start, preservation, and
audit. The descriptor's source repository can be a separate checkout; its HEAD
must equal `baseRevision` and its working tree must be clean. External credentials
and signing keys remain in their owning stores.

Create a new evidence directory outside both the project repository and the
original KubeClaw checkout. Refuse an existing directory so an earlier run cannot
be overwritten or mixed with this one.

```bash
set -euo pipefail
export NOVA_REPOSITORY="<absolute-path-to-original-kubeclaw-checkout>"
cd "$NOVA_REPOSITORY"
test "$NOVA_REPOSITORY" = "$(pwd -P)"
test -f package.json
test -f skills/nova/pipeline.ts
assert_cluster_binding
: "${NAMESPACE:?Complete the installation cluster binding first}"
: "${PRISM_NAMESPACE:?Complete the installation cluster binding first}"
export PLATFORM_FILE="<absolute-path>/platform.json"
export PROJECT_FILE="<absolute-path>/nova-project.v2.json"
export SOURCE_REF="<immutable-release-ref>"
export RELEASE_COMMIT="<full-git-commit>"
export TAILSCALE_PROBE_IMAGE="<registry>/<repository>@sha256:<64-hex-digest>"
export EVIDENCE_DIR="<new-absolute-path-outside-project>/platform-success-evidence"
export COMPILED_PIPELINE="$EVIDENCE_DIR/compiled-pipeline.json"
test -f "$PLATFORM_FILE"
test -f "$PROJECT_FILE"
export PROJECT_REPOSITORY="$(node -e '
const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
if (value.schemaVersion !== "nova-project.v2" || typeof value.repositoryRoot !== "string"
  || value.baseRevision !== process.env.RELEASE_COMMIT) process.exit(1);
process.stdout.write(value.repositoryRoot);
' "$PROJECT_FILE")"
test "$PROJECT_REPOSITORY" = "$(cd "$PROJECT_REPOSITORY" && pwd -P)"
evidence_parent="$(cd "$(dirname "$EVIDENCE_DIR")" && pwd -P)"
test "$EVIDENCE_DIR" = "$evidence_parent/$(basename "$EVIDENCE_DIR")"
case "$EVIDENCE_DIR" in
  "$PROJECT_REPOSITORY"|"$PROJECT_REPOSITORY"/*|"$NOVA_REPOSITORY"|"$NOVA_REPOSITORY"/*) exit 1 ;;
esac
test ! -e "$EVIDENCE_DIR"
mkdir -m 0700 "$EVIDENCE_DIR"
test "$(git -C "$PROJECT_REPOSITORY" rev-parse --verify HEAD)" = "$RELEASE_COMMIT"
test -z "$(git -C "$PROJECT_REPOSITORY" status --porcelain)"
git -C "$PROJECT_REPOSITORY" fetch --no-tags origin "$SOURCE_REF"
test "$(git -C "$PROJECT_REPOSITORY" rev-parse --verify FETCH_HEAD^{commit})" = "$RELEASE_COMMIT"
git -C "$PROJECT_REPOSITORY" merge-base --is-ancestor "$RELEASE_COMMIT" HEAD
```

Compile to the new outside-repository file. Compilation validates installed
registrations, schemas, and grants without starting a run.

```bash
test ! -e "$COMPILED_PIPELINE"
npm --silent run pipeline -- \
  --platform "$PLATFORM_FILE" \
  --project "$PROJECT_FILE" \
  --compile "$COMPILED_PIPELINE" \
  > "$EVIDENCE_DIR/compile.json"
sha256sum "$PROJECT_FILE" > "$EVIDENCE_DIR/project-descriptor.sha256"
```

Inspect the actual compiled final plan. This check records the exact plan,
stage, and provider node identities that the terminal audit must later return.
It also rejects skipped providers, a source mismatch, an architecture approval
path, missing demo stages, or a plan that merely contains the provider names
without the required links.

The Kubernetes fixture output is named `demo-credentials`. The demo
authentication input is named `credentials`. Use these different port names
when checking the link; the shared schema ID does not replace either name.
[The fixture emits the named output](https://github.com/datrab/kubeclaw/blob/d271cf712e1f882c0c64e0c6d9e8a5cd36f18508/skills/buster/plugins/kubernetes-fixture/src/provider.js#L123-L126),
and [the authentication package declares its input](https://github.com/datrab/kubeclaw/blob/d271cf712e1f882c0c64e0c6d9e8a5cd36f18508/skills/buster/plugins/demo-auth-smoke/plugin.json#L22-L28).

```bash
node --input-type=module - "$PROJECT_FILE" "$COMPILED_PIPELINE" \
  "$EVIDENCE_DIR/compile.json" "$EVIDENCE_DIR/expected-provider-chain.json" <<'NODE'
import fs from 'node:fs';
const [projectFile, graphFile, compileFile, outputFile] = process.argv.slice(2);
const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
const graph = JSON.parse(fs.readFileSync(graphFile, 'utf8'));
const compile = JSON.parse(fs.readFileSync(compileFile, 'utf8'));
if (project.schemaVersion !== 'nova-project.v2' || project.baseRevision !== process.env.RELEASE_COMMIT
  || project.architecture?.review !== undefined || project.demo === undefined) {
  throw new Error('descriptor must select the release, omit architecture review, and declare demo');
}
if (compile.status !== 'compiled' || compile.runId !== project.runId
  || compile.stageCount !== graph.stages?.length) throw new Error('compile identity mismatch');
if (graph.stages.some(stage => stage.type === 'kubeclaw.decision.architecture-approval'
  || stage.type.includes('human-approval'))) throw new Error('compiled graph contains a human wait');
for (const id of ['demo-candidate', 'demo-delivery', 'demo-ready']) {
  if (!graph.stages.some(stage => stage.id === id)) throw new Error(`missing ${id}`);
}
const finalStages = graph.stages.filter(stage => stage.id === 'final-test'
  && stage.type === 'kubeclaw.test.quality-evaluation');
if (finalStages.length !== 1) throw new Error('one final-test stage is required');
const stage = finalStages[0];
const plan = stage.input?.providerPlan?.plan;
if (plan?.runId !== project.runId || plan?.planDigest === undefined
  || plan?.coverage?.policy?.baseRevision !== process.env.RELEASE_COMMIT) {
  throw new Error('final plan identity or coverage source mismatch');
}
const one = packageId => {
  const nodes = plan.nodes.filter(node => node.provider?.packageId === packageId && node.skipReason === null);
  if (nodes.length !== 1) throw new Error(`one executable ${packageId} node is required`);
  return nodes[0];
};
const build = one('kubeclaw.container-build');
const deployment = one('kubeclaw.kubernetes-fixture');
const exposure = one('kubeclaw.tailscale-exposure');
const auth = plan.nodes.find(node => node.id === project.demo.authNodeId
  && node.provider?.packageId === 'kubeclaw.demo-auth-smoke' && node.kind === 'test'
  && node.mode === 'blocking' && node.skipReason === null);
if (!auth) throw new Error('blocking demo authentication node is missing');
if (exposure.configuration?.values?.retentionMode !== 'await-readiness') {
  throw new Error('Tailscale exposure must retain the fixture through demo readiness');
}
const linked = (from, output, to, input, kind, type) => plan.links.some(link =>
  link.from.nodeId === from.id && link.from.output === output
  && link.to.nodeId === to.id && link.to.input === input && link.kind === kind
  && (kind === 'value' ? link.schemaId === type : link.mediaType === type));
if (!linked(build, 'image', deployment, 'image', 'value', 'kubeclaw.container-image@1')
  || !plan.links.some(link => link.to.nodeId === deployment.id && link.to.input === 'checked-manifest'
    && link.kind === 'artifact' && link.mediaType === 'application/vnd.kubeclaw.checked-kubernetes-yaml')
  || !linked(deployment, 'deployment', exposure, 'deployment', 'value', 'kubeclaw.kubernetes-deployment-fixture@1')
  || !linked(deployment, 'deployment', auth, 'deployment', 'value', 'kubeclaw.kubernetes-deployment-fixture@1')
  || !linked(deployment, 'demo-credentials', auth, 'credentials', 'value', 'kubeclaw.generated-demo-credentials@1')
  || !linked(exposure, 'exposure', auth, 'exposure', 'value', 'kubeclaw.public-endpoint-fixture@1')) {
  throw new Error('BuildKit, Kubernetes, Tailscale, and demo links are incomplete');
}
if (!plan.coverage.policy.requiredChecks.some(check => check.nodeIds.includes(auth.id))) {
  throw new Error('demo authentication is outside mandatory coverage');
}
const expected = { runId: project.runId, stageId: stage.id, planId: plan.planId,
  planDigest: plan.planDigest, sourceRevision: project.baseRevision,
  repositoryRoot: project.repositoryRoot,
  nodes: { build: build.id, deployment: deployment.id, exposure: exposure.id, auth: auth.id } };
fs.writeFileSync(outputFile, `${JSON.stringify(expected)}\n`, { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify(expected));
NODE
```

Run deployment and dependency preflights before the project. They prove only
their named boundaries. In particular, `prism-smoke` is not a stage in this
project run. Use the bound administration shell from
[Bind Cluster Authority](../install.md#bind-cluster-authority); keep its
read-only `KUBECONFIG`, expected context, API server, and kube-system UID in the
same shell. Stop on a binding mismatch and never fall back to the default
kubeconfig.

```bash
assert_cluster_binding
kubectl config current-context | tee "$EVIDENCE_DIR/context.txt"
kubectl -n "$NAMESPACE" get deploy,statefulset,pods,svc,pvc -o wide \
  | tee "$EVIDENCE_DIR/platform-objects.txt"
kubectl -n "$PRISM_NAMESPACE" get deploy,statefulset,pods,svc,pvc,ingress -o wide \
  | tee "$EVIDENCE_DIR/prism-objects.txt"
./scripts/deploy.sh status | tee "$EVIDENCE_DIR/deploy-status.txt"
./scripts/deploy.sh smoke-agent nova | tee "$EVIDENCE_DIR/nova-smoke.txt"
./scripts/deploy.sh smoke-agent buster | tee "$EVIDENCE_DIR/buster-smoke.txt"
./scripts/deploy.sh prism-smoke | tee "$EVIDENCE_DIR/prism-smoke.txt"
kubectl -n "$NAMESPACE" rollout status statefulset/postgresql --timeout=120s
kubectl -n "$NAMESPACE" rollout status deployment/litellm --timeout=120s
kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- node -e '
const response = await fetch(`${process.env.LITELLM_URL}/v1/embeddings`, {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.LITELLM_API_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({ model: "gemini-embedding-001", input: "kubeclaw acceptance prerequisite" }),
  signal: AbortSignal.timeout(60000)
});
const body = await response.json();
const vector = body?.data?.[0]?.embedding;
if (!response.ok || !Array.isArray(vector) || !vector.length || !vector.every(Number.isFinite)) process.exit(1);
console.log(JSON.stringify({ model: body.model ?? "gemini-embedding-001", dimensions: vector.length }));
' | tee "$EVIDENCE_DIR/litellm-route.json"
./scripts/deploy.sh nova-buildkit-preflight \
  | tee "$EVIDENCE_DIR/container-build-prerequisite.txt"
./scripts/deploy.sh nova-tailscale-preflight "$TAILSCALE_PROBE_IMAGE" \
  | tee "$EVIDENCE_DIR/tailscale-prerequisite.txt"
test "$(git -C "$PROJECT_REPOSITORY" rev-parse --verify HEAD)" = "$RELEASE_COMMIT"
test -z "$(git -C "$PROJECT_REPOSITORY" status --porcelain)"
```

Execute the same project descriptor exactly once. This no-human-wait exercise
must return terminal success directly; a `waiting` result is a failure of the
declared scope, not an invitation to synthesize a signal.

```bash
sha256sum --check "$EVIDENCE_DIR/project-descriptor.sha256"
npm --silent run pipeline -- \
  --platform "$PLATFORM_FILE" \
  --project "$PROJECT_FILE" \
  > "$EVIDENCE_DIR/run-terminal.json" \
  2> "$EVIDENCE_DIR/run-terminal.stderr"
export RUN_ID="$(node -e '
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (value.status !== "succeeded" || value.completionScope !== "demo-handoff"
  || value.acceptanceReadiness !== "ready-for-acceptance") process.exit(1);
process.stdout.write(value.runId);
' "$EVIDENCE_DIR/run-terminal.json")"
```

The returned terminal result is required before preservation. Do not stop an
active pipeline and call that a successful exercise. Before the final audit,
complete [Inspect a Run](../operate.md#inspect-a-run) in the same shell, using
this original `PLATFORM_FILE` and `RUN_ID`. Verify that all run and owning-adapter
writers stopped, retain verified adapter copies through their declared backup
procedures, and define the canonical `preserve_run_state` helper. Audit can
change locks and truncate an incomplete tail before parsing. Keep rejected raw
bytes and stop on failed preservation or strict copied-journal inspection.
Unknown ownership or an unavailable adapter backup stops the audit and leaves
the exercise incomplete.

```bash
export RUN_CONTROL_PLATFORM="$PLATFORM_FILE"
export RUN_CONTROL_RUN_ID="$RUN_ID"
preserve_run_state || exit 1
printf '%s\n' "$RUN_CONTROL_OBSERVATION_ROOT" > "$EVIDENCE_DIR/raw-terminal.txt" || exit 1
npm --silent run pipeline -- \
  --platform "$RUN_CONTROL_PLATFORM" \
  --audit "$RUN_CONTROL_RUN_ID" \
  > "$EVIDENCE_DIR/audit-terminal.json"
```

Require the audit to contain the exact final-plan effect and decision. A passed
container-build decision means the provider completed BuildKit push and an OCI
manifest digest read. A passed fixture or exposure node also means Buster did
not reduce a cleanup error for that node; any cleanup error becomes
`execution_error`. This is the cleanup meaning supported by the decision. It
does not expose a separate registry transaction log or Tailscale controller
release object, so retain those external receipts when the installation makes
them available and do not invent them from Pod readiness.

```bash
node - "$EVIDENCE_DIR/audit-terminal.json" "$COMPILED_PIPELINE" \
  "$EVIDENCE_DIR/expected-provider-chain.json" <<'NODE'
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const [auditFile, graphFile, expectedFile] = process.argv.slice(2);
const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
const graph = JSON.parse(fs.readFileSync(graphFile, 'utf8'));
const expected = JSON.parse(fs.readFileSync(expectedFile, 'utf8'));
if (audit.runId !== expected.runId || process.env.RUN_ID !== expected.runId) throw new Error('audit run mismatch');
const events = audit.events;
const requested = events.filter(event => event.type === 'effect.requested'
  && event.identity?.stageId === expected.stageId
  && event.payload?.capability === 'test.plan.execute');
if (requested.length !== 1) throw new Error('one final-plan dispatch is required');
const completed = events.filter(event => event.type === 'effect.completed'
  && event.identity?.effectId === requested[0].identity?.effectId);
if (completed.length !== 1) throw new Error('one final-plan receipt is required');
const decision = completed[0].payload?.result;
if (decision?.schemaVersion !== 'test-gate-decision.v2' || decision.runId !== expected.runId
  || decision.planId !== expected.planId || decision.state !== 'passed'
  || !/^sha256:[a-f0-9]{64}$/.test(decision.resultDigest ?? '')
  || !/^sha256:[a-f0-9]{64}$/.test(decision.decisionDigest ?? '')
  || typeof decision.jobId !== 'string' || !decision.jobId) {
  throw new Error('exact passed Buster decision is missing or externalized');
}
const stage = graph.stages.find(item => item.id === expected.stageId);
const plan = stage?.input?.providerPlan?.plan;
if (plan?.planDigest !== expected.planDigest || plan?.coverage?.policy?.baseRevision !== expected.sourceRevision) {
  throw new Error('compiled plan or selected release changed');
}
if (decision.nodes.length !== plan.nodes.length
  || plan.nodes.some(node => !decision.nodes.some(item => item.nodeId === node.id))) {
  throw new Error('Buster decision does not cover the exact compiled node set');
}
const effects = new Map(decision.nodes.map(node => [node.nodeId, node.effect]));
for (const [role, nodeId] of Object.entries(expected.nodes)) {
  if (effects.get(nodeId) !== 'passed') throw new Error(`${role} node did not pass: ${nodeId}`);
}
const coverage = decision.coverage;
if (!/^git:[a-f0-9]{40}$/.test(coverage?.sourceRevision ?? '')
  || !/^git:[a-f0-9]{40}$/.test(coverage.sourceTree ?? '')
  || !/^sha256:[a-f0-9]{64}$/.test(coverage.archiveContentDigest ?? '')
  || coverage.planDigest !== expected.planDigest || coverage.pipelineStageId !== expected.stageId
  || coverage.policy?.baseRevision !== expected.sourceRevision
  || !/^sha256:[a-f0-9]{64}$/.test(coverage.coverageDigest ?? '')
  || !Array.isArray(coverage.checks) || coverage.checks.length === 0
  || coverage.checks.some(check => check.state !== 'passed')) {
  throw new Error('source coverage is incomplete or bound to another release');
}
execFileSync('git', ['-C', expected.repositoryRoot, 'merge-base', '--is-ancestor',
  expected.sourceRevision, coverage.sourceRevision.slice(4)]);
const terminal = [...events].reverse().find(event =>
  ['run.succeeded', 'run.failed', 'run.blocked', 'run.cancelled'].includes(event.type));
if (terminal?.type !== 'run.succeeded' || !(requested[0].sequence < completed[0].sequence
  && completed[0].sequence < terminal.sequence)) throw new Error('terminal ordering is invalid');
console.log(JSON.stringify({ runId: expected.runId, stageId: expected.stageId,
  planId: expected.planId, planDigest: expected.planDigest, jobId: decision.jobId,
  resultDigest: decision.resultDigest, nodes: expected.nodes, terminal: terminal.type }));
NODE
```

Pass only when the exact plan and node identities, source coverage, passed
effects, Buster result digest, and terminal event correlate to `RUN_ID`. The
Nova terminal journal is pipeline authority. On an uncertain external outcome,
do not start a replacement run. Reconcile the original effect, Buster job,
registry digest, and lease identities. Keep the descriptor, compiled graph,
verified raw run and adapter copies, manifests, strict inspection results,
audit, decision, and external receipts under their retention policies. Any
later authorized canonical repair must keep the original bytes and record the
command and its actual changes. Remove
no unidentified namespace, lease, image, or registry blob.

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
- For service authentication, stores, limits, and capability allowlists, use
  [Buster runtime configuration](../../reference/buster-runtime-configuration.md).
- For a new provider, fixture, report format, or suite, use [Extend Buster](../../extend/buster.md).
- For engine or controller changes, use [Develop Buster](../../extend/platform/buster.md).
