# Real Pipeline E2E Verification Plan

## Goal

Build one canonical end-to-end verification path that proves the pipeline works as it is expected to work in production.

The test must run the real Nova pipeline contracts, state transitions, Redis streams, Git operations, agent launches, gate flow, Buster handoff envelope, Discord operator surface, and Kubernetes namespace/deployment path. It must not be shaped around the current implementation just to produce a green result. If the pipeline cannot complete the real production-like run, verification should fail and expose the mismatch.

## Non-Negotiables

- One canonical path. No parallel fallback harness.
- No hidden mocks, shortcuts, or special success paths.
- Real Redis, with run-scoped test streams and keys.
- Real OpenClaw gateway calls.
- Real ACP/Codex agent launches.
- Real Git operations on a disposable verification branch.
- Real control stream and payload stream assertions.
- Real Discord delivery to the configured test surface.
- Real Buster task handoff contract.
- Real Kubernetes namespace lease/deployment path where permissions exist.
- Real architecture validator, deterministic checks, and architecture-validator agent path.
- Real pipeline review agent path.
- Real pipeline summary generation.
- Real Buster gates.
- Real Echo gate.
- Real approval gate outcomes, including auto accept, auto deny, and commentary.
- Real Needs Nova escalation path.
- Real infra-failure blocking path.
- Mock only the unavailable Buster external execution boundary, and only by making Nova act as a contained Buster-compatible worker that consumes and emits the real Buster contracts.

## Current State

`tests/verification/run-full-verification.sh` currently runs useful checks, but it is not a full production simulation. It aggregates deployment truth checks, runtime smokes, ACP launch, live Redis smoke, contract checks, docs checks, whitespace checks, and the behavior harness.

The existing behavior harness is broad, but much of it is isolated or contract-oriented. It verifies many surfaces, but it does not currently run one real pipeline request through the full lifecycle.

The Buster Kubernetes suite already has the right primitive shape:

- `skills/buster/pipeline/suites/k8s.ts`
- `tests/skills/buster/pipeline/suites/k8s.test.mjs`
- `scripts/buster-namespace-controller.mjs`
- `charts/kubeclaw/templates/buster-namespace-lease-crd.yaml`
- `charts/kubeclaw/templates/buster-namespace-controller.yaml`

That suite already builds an image, pushes to `registry-local.kubeclaw.svc.cluster.local:5001`, requests a Buster namespace lease, applies manifests into the test namespace, waits for pods, and checks the service health endpoint. The real E2E harness should reuse that production path rather than inventing another Kubernetes testing mechanism.

## Target Shape

Create:

```text
tests/verification/e2e/
  README.md
  run-real-pipeline-e2e.mjs
  fixtures/
    nginx-project/
      Dockerfile
      package.json
      src/...
      k8s/deployment.yaml
```

Then wire:

```text
tests/verification/run-fast-verification.sh
tests/verification/run-full-verification.sh
```

Fast verification should run the same canonical harness in a minimal mode. Full verification should run the same canonical harness in strict mode with all required production surfaces enabled.

There should not be two meanings of pipeline verification.

## Repository Path Map

Use these paths as the canonical implementation map. Do not create a second test tree or duplicate pipeline runner elsewhere.

Repository root:

- `/home/node/.openclaw/workspace/git-repo`

Current plan:

- `/home/node/.openclaw/workspace/git-repo/tests/verification/REAL_PIPELINE_E2E_PLAN.md`

New real E2E test suite must be created under:

- `/home/node/.openclaw/workspace/git-repo/tests/verification/e2e/README.md`
- `/home/node/.openclaw/workspace/git-repo/tests/verification/e2e/check-real-e2e-capabilities.mjs`
- `/home/node/.openclaw/workspace/git-repo/tests/verification/e2e/run-real-pipeline-e2e.mjs`
- `/home/node/.openclaw/workspace/git-repo/tests/verification/e2e/buster-simulator.mjs`
- `/home/node/.openclaw/workspace/git-repo/tests/verification/e2e/fixtures/nginx-project/`

Verification wrappers to wire to the new canonical harness:

- `/home/node/.openclaw/workspace/git-repo/tests/verification/run-fast-verification.sh`
- `/home/node/.openclaw/workspace/git-repo/tests/verification/run-full-verification.sh`

Existing Buster Kubernetes production path to reuse:

- `/home/node/.openclaw/workspace/git-repo/skills/buster/pipeline/suites/k8s.ts`
- `/home/node/.openclaw/workspace/git-repo/tests/skills/buster/pipeline/suites/k8s.test.mjs`
- `/home/node/.openclaw/workspace/git-repo/scripts/buster-namespace-controller.mjs`

Kubernetes broker/chart path:

- `/home/node/.openclaw/workspace/git-repo/charts/kubeclaw/templates/buster-namespace-lease-crd.yaml`
- `/home/node/.openclaw/workspace/git-repo/charts/kubeclaw/templates/buster-namespace-controller.yaml`
- `/home/node/.openclaw/workspace/git-repo/charts/kubeclaw/templates/rbac.yaml`
- `/home/node/.openclaw/workspace/git-repo/charts/kubeclaw/values.yaml`

Environment values to update when Nova needs broker-client permissions:

- `/home/node/.openclaw/workspace/git-repo/my-values/nova-values.yaml`
- `/home/node/.openclaw/workspace/git-repo/my-values/buster-values.yaml`

Tailscale operator deployment/configuration path:

- `/home/node/.openclaw/workspace/git-repo/my-values/infra/tailscale-operator-values.yaml`
- `/home/node/.openclaw/workspace/git-repo/scripts/deploy.sh`
- `/home/node/.openclaw/workspace/git-repo/my-values/setup-secrets.sh`

Deployment truth and existing infra assertions:

- `/home/node/.openclaw/workspace/git-repo/tests/verification/deployment/check-deployment-truth.mjs`

Runtime OpenClaw config for the current pod:

- `/home/node/.openclaw/openclaw.json`

## Canonical Scenario

The E2E test starts from a real user-style pipeline request:

> Build and verify a small nginx-backed deployment project through the Nova pipeline.

The fixture should be intentionally small, but production-shaped:

- Dockerfile uses the configured local mirror/cache path where the production Buster suite expects it.
- Kubernetes manifest contains a namespaced Deployment and Service.
- Container exposes a health endpoint.
- App image is rewritten by the Buster k8s suite to the locally built registry tag.
- Namespace name is run-scoped and uses the existing safe `test-*` prefix.

The expected lifecycle:

1. Create run id and isolated test project copy.
2. Create disposable Git branch, for example `verification/e2e/<runId>`.
3. Submit one real pipeline request through the same entrypoint production uses.
4. Observe module dispatch through real Redis streams.
5. Launch real ACP/Codex worker sessions for pipeline stages.
6. Assert forge artifacts are created through the normal module path.
7. Reach the Buster handoff phase through the real Nova contract.
8. Have the contained Buster simulator consume the task as Buster would.
9. Run the real Buster suite runner for allowed suites, including `manifest`, `build`, `health`, and `k8s` where available.
10. Emit the real Buster completion event and artifact.
11. Run architecture validation through the production validator path.
12. Run deterministic checks and the architecture-validator agent where configured.
13. Run Buster gates through the real gate task contract.
14. Run Echo gate through a real Echo ACP session.
15. Run approval gate through production approval request/resolution state.
16. Run pipeline review agent through the real review spawn path.
17. Generate pipeline summary and governance summary artifacts.
18. Continue through finalization using the production control path.
19. Assert Discord operator notifications landed on the configured test surface.
20. Assert final status, Redis lifecycle, Git branch/artifacts, and cleanup behavior.
21. Delete the disposable Git branch and test namespace unless retention is requested for debugging.

## Required Production Stages

The E2E harness must prove every production stage that can block, continue, or escalate the pipeline. These are not optional contract checks; they are part of the real run.

### Architecture Validator

The harness must run the production architecture validator path, including deterministic checks and the architecture-validator agent when enabled.

Required evidence:

- `.swarm/logs/architecture-validator/results.json`
- `.swarm/logs/architecture-validator/summary.md`
- validator lifecycle events on the run stream
- Discord/operator notification when the validator blocks or reports findings
- governance summary records the validator outcome

Acceptance:

- clean validator result allows the run to continue
- validator findings that are configured as blockers stop the run with `ARCH_VALIDATION_BLOCKED`
- validator execution failure is classified separately from code failure
- deterministic checks cannot be skipped by the E2E harness
- agent-backed architecture review uses a real ACP session and records session identity

### Buster Gates

The harness must run real Buster gate tasks, not only module test tasks.

Required evidence:

- `task_type=gate_test` payload emitted to the real Buster task stream
- contained Buster-compatible simulator consumes the gate task
- production Buster gate output schema is written to the configured `output_file`
- completion stream carries the gate completion identity
- gate read model consumes the Buster evidence

Acceptance:

- gate `PASS` continues
- gate `FAIL` blocks or escalates according to production gate policy
- invalid Buster gate output fails verification
- missing output file fails verification
- repeated Buster gate infra failure blocks as infra, not as code

### Echo Gate

The harness must run Echo gate review through a real Echo ACP launch.

Required evidence:

- Echo session is spawned with the configured agent id/model/cwd
- Echo gate prompt includes the run id and target evidence
- Echo result is captured through the normal gate result path
- Redis lifecycle and Discord surfaces include Echo session identity

Acceptance:

- Echo `PASS` continues
- Echo `FAIL` blocks/escalates according to gate policy
- Echo spawn failure is an infra failure
- Echo malformed output becomes Needs Nova or blocked according to production policy

### Approval Gate

The harness must exercise production approval gates, including automatic test decisions.

Required evidence:

- approval request artifact under `.swarm/logs/gates/<gate-id>/`
- `approval.requested` telemetry
- persisted approval wait state/read model
- `approval.resolved` telemetry
- governance summary includes approval outcome
- Discord approval notification includes run id and gate id

Acceptance scenarios:

- auto accept resolves as approved and continues
- auto deny resolves as rejected and blocks
- commentary resolves with operator text preserved in artifacts, telemetry, and summary
- timeout with `BLOCK` blocks
- timeout with `CONTINUE` continues only when production policy says it may
- conflicting approval state fails closed

### Pipeline Review Agent

The harness must run the pipeline review agent through the real review spawn path.

Required evidence:

- review agent ACP session spawned
- review input references real run artifacts
- review output saved in summary/review artifacts
- review Discord fields include explicit gateway/session identity

Acceptance:

- review success contributes to final summary
- review failure is visible and classified
- review spawn failure is infra, not code
- review output cannot silently pass if malformed

### Pipeline Summary

The harness must generate the production pipeline summary, not a test summary.

Required evidence:

- `.swarm/logs/pipeline/runs/<run-id>/summary.json`
- pipeline summary markdown/operator artifact where configured
- `summary.started` telemetry
- `summary.completed` telemetry
- governance section includes architecture validator and approval gates
- final Discord message references the summary artifacts

Acceptance:

- summary reflects terminal status and reason code
- summary references real replay logs and artifacts
- summary generation failure is classified according to production policy
- no terminal success is accepted without summary evidence

### Needs Nova Path

The harness must prove the real Needs Nova path.

Required evidence:

- `NEEDS_NOVA` terminal or paused state where production expects it
- reason code and last failure preserved
- Discord/operator message includes remediation context
- Redis lifecycle records the escalation
- run artifacts preserve the evidence that caused escalation

Acceptance:

- malformed agent output triggers Needs Nova when policy says review is needed
- repeated code failure triggers Needs Nova after retries are exhausted
- human/action-required states do not masquerade as successful completion

### Infra Failure Blocking

The harness must prove infra failures block the pipeline instead of becoming code failures.

Required evidence:

- failure classification identifies infra source
- terminal/paused state is `BLOCKED` or the configured infra-blocking status
- Discord/operator message names the infra dependency
- no retry loop hides a persistent infra failure

Acceptance examples:

- Redis unavailable or stream write/read failure blocks
- ACP spawn unavailable blocks
- gateway tool invocation unavailable blocks
- Kubernetes namespace lease denied blocks
- local registry unavailable blocks
- Discord delivery unavailable blocks strict full verification
- Git branch/create/delete failure blocks strict full verification

## Real Infrastructure Requirements

### Redis

Use the real configured Redis instance. The harness must create a unique `runId` and either:

- use the production stream names with run-scoped payloads, or
- use explicitly configured verification stream names that production code can consume without alternate logic.

Assertions must check:

- control stream receives lifecycle transitions in order
- payload stream contains the expected task envelopes
- completion stream receives Buster-compatible completion records
- no unrelated run ids are consumed
- no terminal state is reached without required evidence

### ACP / Agents

Use real ACP/Codex launches through the gateway.

Assertions must check:

- sessions are created with expected agent id, model, cwd, label, and timeout
- transcript/progress evidence is captured
- session lifecycle reaches terminal state
- no test-only spawn path exists

Claude should not be required while no Claude subscription/API is configured. Codex is the canonical ACP verifier for now.

### Git

Use real Git commands against the repository.

The harness must:

- create a disposable branch from the current branch
- commit/push only run-scoped verification artifacts when the production pipeline would do so
- verify commit scope
- verify no unrelated worktree changes are touched
- delete local and remote verification branches during cleanup

If remote delete is not available, the test should fail in strict mode and keep a clear cleanup command in the final report.

### Discord

Use the real Discord connector/gateway path and a configured verification channel or thread.

Assertions must check:

- pipeline-start notification
- Buster handoff/testing notification
- gate/review notification
- final success/failure notification
- correlation/run id appears in every message

The test must not post to production user-facing channels unless the verification config explicitly points there.

### Kubernetes

Use the existing Buster namespace lease path.

The E2E test should first verify capability, not silently skip:

- `kubectl` available
- current pod can reach Kubernetes API
- Buster namespace lease CRD exists
- namespace controller is running/ready
- service account can request `test-*` namespace leases
- registry mirror/local registry is reachable
- image pull path works for the fixture image

If these are missing, full verification fails with the exact missing capability. It should not downgrade to a mock.

The Kubernetes leg should use the existing `k8s` suite path:

- build fixture image
- push to local registry
- request namespace lease
- apply Deployment and Service
- wait for pod readiness
- call service health endpoint
- delete namespace through lease cleanup

### Buster

Real Buster-in-Kubernetes may not be available inside Nova. That is the only allowed simulated boundary.

The simulator must not invent a new contract. It must:

- consume the real Buster task payload
- validate with the same Buster task validation
- call the real Buster suite runner where local permissions allow
- emit the real Buster output artifact
- emit the real task completion signal shape
- write telemetry with `source=buster-compatible-simulator` or another explicit identity that is accepted only for verification mode

The simulator must fail if Nova emits an invalid Buster task envelope.

## Implementation Steps

### Step 1: Define The Contract Of "Real E2E"

Add a short spec under `tests/verification/e2e/README.md`.

Define:

- required infra
- allowed simulated boundary
- required lifecycle events
- cleanup guarantees
- failure policy

Acceptance:

- no code yet, just the contract
- Davide can read it and confirm it matches the production expectation

### Step 2: Add A Capability Probe

Create `tests/verification/e2e/check-real-e2e-capabilities.mjs`.

It should check the actual environment:

- gateway health
- ACP/Codex spawn
- Redis ping and stream write/read
- Git branch create/delete dry run on local test branch
- Discord test target configured and reachable
- Kubernetes API reachable
- Buster namespace CRD present
- namespace controller ready
- local registry reachable

Acceptance:

- no skips in strict mode
- every missing capability has a direct remediation message
- no pipeline run starts if capabilities are missing

### Step 3: Add The Fixture Project

Create a minimal fixture under `tests/verification/e2e/fixtures/nginx-project`.

The fixture should include:

- Dockerfile based on the configured mirror/local image path
- static nginx content with run-id placeholder
- Kubernetes Deployment
- Kubernetes Service
- health endpoint or static page route suitable for the k8s suite

Acceptance:

- fixture can be copied to a temp run directory
- manifest is accepted by existing manifest/k8s suite logic
- image is built and pushed by the existing k8s suite

### Step 4: Add Real Run Workspace Management

Create run-scoped workspace helpers.

Responsibilities:

- create run id
- copy fixture/project
- prepare `.swarm` directory
- create Git branch
- record cleanup manifest
- restore original branch
- delete branch/namespace/artifacts

Acceptance:

- cleanup is idempotent
- retained artifacts are possible only with explicit `REAL_E2E_KEEP_ARTIFACTS=1`
- no untracked production files are left behind on success

### Step 5: Drive The Real Nova Pipeline Entry Point

Use the production entrypoint, not direct internal runner calls, unless the production entrypoint is currently missing.

If the entrypoint is missing, this step must create it rather than bypass it. The harness should submit the same kind of request a real operator/user would submit.

Acceptance:

- pipeline run starts through the same public/CLI/gateway surface production uses
- run id is visible in Redis, artifacts, logs, and Discord
- no test-only code path marks a module successful

### Step 6: Observe Redis Control And Payload Streams

Add stream observers that validate the run.

Required assertions:

- run accepted
- module started
- worker dispatched
- worker terminal result
- Buster task emitted
- Buster completion accepted
- architecture validator started/completed
- Buster gate started/completed
- Echo gate started/completed
- approval gate requested/resolved
- pipeline review agent started/completed
- pipeline summary started/completed
- review/gate started
- final terminal state

Acceptance:

- events are ordered
- every event references the same run id
- required evidence path exists before terminal transitions
- unexpected error/degraded/manual states fail the run
- every blocking/escalation state has a matching reason code and evidence artifact

### Step 7: Implement The Buster-Compatible Simulator

Create a contained simulator under `tests/verification/e2e/buster-simulator.mjs`.

It should:

- subscribe to the real Buster task stream/group used by Nova
- claim only the current run id
- validate payload with production Buster validation
- run the production Buster suite runner
- include `manifest`, `build`, `health`, and `k8s` in strict mode
- write the normal Buster output artifact
- emit the normal completion signal

Acceptance:

- no alternate Nova completion hook
- no fake pass artifact
- Buster task validation failures fail E2E
- k8s failures fail E2E with namespace/pod diagnostics

### Step 8: Verify Kubernetes Namespace Deployment

Use the existing Buster `k8s` suite, not a new Kubernetes client.

The E2E harness should assert:

- lease object created
- namespace created with expected labels
- image pushed to local registry
- deployment applied
- pod ready
- service health check passed
- cleanup happened or retained intentionally

Acceptance:

- real namespace appears in cluster
- real nginx pod runs
- image comes from local registry/mirror path
- cleanup deletes namespace by default

### Step 9: Verify Tailscale Operator Preview Reachability

Verify that the real deployed nginx pod can be reached through the production Tailscale preview URL.

This must use the existing Buster namespace lease exposure contract, not a separate preview mechanism. The lease CRD already exposes:

- `spec.exposure.provider=tailscale-ingress`
- `spec.exposure.hostname`
- `spec.exposure.serviceName`
- `spec.exposure.servicePort`
- `spec.exposure.path`
- `status.previewUrl`
- `status.exposurePhase`
- `status.exposureHostname`

The test can be written before the Tailscale operator is installed, but strict full verification must fail with a clear missing capability until the operator exists and is ready.

Capability probe requirements:

- Tailscale operator deployment exists and is Ready.
- `IngressClass/tailscale` exists.
- required Tailscale OAuth Secret exists in the operator namespace.
- Buster namespace controller has RBAC to create/update preview Ingress resources.
- the created verification namespace allows the preview Ingress path.

Run requirements:

- Buster namespace lease requests `exposure.provider=tailscale-ingress`.
- namespace controller creates the real preview Ingress for the nginx Service.
- lease status reports a non-empty `previewUrl`.
- the production k8s suite performs a real HTTP request to `status.previewUrl`.
- `preview.expected_text` is set to a run-scoped nginx marker.
- response body proves the request reached the run-scoped nginx fixture.
- Discord/operator output includes the preview URL and run id.

Acceptance:

- missing Tailscale operator blocks strict full verification as `INFRA_MISSING_TAILSCALE_OPERATOR`
- missing `IngressClass/tailscale` blocks strict full verification
- preview Ingress creation failure blocks as infra, not code
- missing `status.previewUrl` blocks
- unreachable preview URL blocks
- wrong response/run id blocks
- no alternate NodePort/port-forward/local-service fallback is allowed
- when the operator is not installed yet, this test is allowed to exist and fail honestly

### Step 10: Verify Discord Delivery

Add a Discord verification observer.

It should use a test target configured in `openclaw.json` or verification env, for example:

```text
REAL_E2E_DISCORD_TARGET=...
```

Acceptance:

- messages are sent through the real connector
- messages contain run id/correlation id
- final message includes pass/fail status
- missing Discord target fails strict full verification

### Step 11: Wire Fast And Full Verification

Update wrappers:

- `run-fast-verification.sh` runs capability probe plus a minimal real E2E profile.
- `run-full-verification.sh` runs capability probe plus strict real E2E profile.

Fast can reduce scope by using one module and shorter timeouts, but it must still use the same canonical harness and real infra.

Acceptance:

- both wrappers call `tests/verification/e2e/run-real-pipeline-e2e.mjs`
- no separate fake fast path
- full verification runs the canonical success scenario and a retry-then-success scenario before the negative matrix
- full verification fails if any real production surface is unavailable

### Step 12: Add Required Failure-Mode Matrix

The real E2E suite must include explicit negative scenarios. These scenarios should use the same canonical harness and real infrastructure, with only run-scoped fault injection.

Required failure modes:

- Forge/code failure that should retry
- repeated Forge/code failure that should become Needs Nova
- Forge malformed output
- Forge spawn/gateway failure
- Buster module test failure
- Buster module infra failure
- Buster invalid completion identity
- Buster missing output file
- Buster gate failure
- Echo gate failure
- Echo malformed output
- approval accept
- approval deny
- approval commentary
- approval timeout block
- approval timeout continue
- architecture validator block
- architecture validator execution failure
- pipeline review agent failure
- pipeline summary generation failure
- Redis unavailable
- Discord unavailable
- Git branch/cleanup failure
- Kubernetes namespace lease denied
- Kubernetes pod never ready
- registry push/pull failure
- Tailscale operator unavailable
- Tailscale preview Ingress creation failure
- Tailscale preview URL unreachable
- Tailscale preview URL reaches the wrong run/deployment

Acceptance:

- each scenario reaches the expected production terminal state
- each scenario emits the expected Redis lifecycle event
- each scenario writes the expected evidence artifact
- the Git cleanup failure scenario observes a real branch-delete refusal and
  then removes the temporary blocker so the verification repo stays clean
- each scenario posts or intentionally fails the expected Discord/operator surface
- no scenario uses mocked success or alternate completion paths

### Step 13: Add Nova Lease-Client RBAC For E2E

Nova must be able to request test namespaces when the E2E harness runs inside Nova.

Implementation:

- keep namespace controller ownership in Buster/broker mode
- add a narrow Nova lease-client chart path
- grant Nova only `create/get/list/watch/delete` for `busternamespaceleases.kubeclaw.forgestack.ai`
- do not restore the removed broad Kubernetes tester ClusterRole
- redeploy Nova after values/chart changes

Acceptance:

- Nova can create a `test-*` namespace lease
- Nova cannot directly create/delete Kubernetes namespaces
- Nova cannot use broad workload permissions outside broker-created test namespaces
- Buster namespace controller still owns namespace lifecycle
- deployment truth prevents broad fallback RBAC from returning

### Step 14: Retire Mocked Pipeline Simulation Tests

After the real E2E is stable, remove or downgrade old mocked pipeline simulation tests that only prove current implementation behavior.

Keep tests that still add value:

- pure schema/contract tests
- security boundary tests
- deterministic unit tests for small functions
- failure-classification tests

Remove or replace:

- mocked pipeline lifecycle simulations
- fake Redis pipeline state transitions
- fake Buster pass/fail handoff tests that duplicate the real E2E
- tests that assert implementation details instead of production behavior

Acceptance:

- verification remains smaller and stronger
- the real E2E is the canonical source of truth for pipeline behavior
- no fallback mock suite is kept as an equivalent pass condition

## Required Config

Add explicit verification config, not scattered env assumptions:

```json
{
  "verification": {
    "real_e2e": {
      "enabled": true,
      "redis_key_prefix": "verification",
      "git_branch_prefix": "verification/e2e",
      "namespace_prefix": "test",
      "discord_target": "...",
      "agent": {
        "runtime": "acp",
        "agent_id": "codex",
        "model": "gpt-5-codex"
      },
      "buster": {
        "mode": "contained-simulator",
        "required_suites": ["manifest", "build", "health", "k8s"],
        "required_task_types": ["module_test", "gate_test"]
      },
      "tailscale_preview": {
        "required": true,
        "provider": "tailscale-ingress",
        "health_path": "/",
        "require_run_id_response": true
      },
      "gates": {
        "architecture_validator": true,
        "buster_gate": true,
        "echo_gate": true,
        "approval_gate": true,
        "pipeline_review_agent": true,
        "pipeline_summary": true
      },
      "cleanup": {
        "delete_git_branch": true,
        "delete_namespace": true,
        "delete_redis_keys": true
      }
    }
  }
}
```

This config should validate strictly. Unknown keys should fail.

## Success Criteria

The new E2E verification is complete when a single command can prove:

```bash
tests/verification/run-full-verification.sh
```

and the run demonstrates:

- real pipeline request accepted
- real Redis streams used
- real ACP agent launched
- real Git branch created and cleaned
- real Buster task emitted
- contained Buster simulator consumed the real task
- real Buster suite runner executed
- real architecture validator and deterministic checks executed
- real architecture-validator agent executed when enabled
- real Buster gate executed
- real Echo gate executed
- real approval gate accept/deny/commentary paths are verified
- real Needs Nova path is verified
- real infra-failure blocking path is verified
- real pipeline review agent executed
- real pipeline summary generated
- real Kubernetes test namespace created
- real nginx deployment became healthy
- real Tailscale preview URL reached the deployed nginx pod
- real Discord messages delivered
- real final pipeline state reached
- cleanup completed

If any of those cannot be proven, full verification must fail.

## Open Questions

- What exact production entrypoint should the E2E use to submit the pipeline request?
- What Discord target should be reserved for destructive/real E2E verification?
- Does this pod currently have Kubernetes RBAC to create Buster namespace lease CRs?
- Is the Buster namespace controller installed and watching the expected namespace?
- Is the local registry mirror reachable from both the test pod and created namespace?
- Is the Tailscale operator installed and ready?
- Which tailnet DNS/hostname convention should the test use for run-scoped preview URLs?
- Should strict E2E push a remote verification branch, or should local branch coverage be enough until remote cleanup is proven reliable?
- What is the canonical cleanup policy when the E2E fails halfway through?
- Which negative scenarios belong in fast verification versus full verification?
- Should approval commentary use a fixed verification actor identity or the source Discord actor?
- Which architecture-validator findings are intentionally blocking for the nginx fixture?

## Recommended Work Order

1. Land this plan.
2. Implement capability probe.
3. Verify Kubernetes lease permissions before building the full harness.
4. Add fixture project.
5. Add workspace/cleanup manager.
6. Add Nova lease-client RBAC and redeploy Nova.
7. Add contained Buster simulator.
8. Add real pipeline runner.
9. Add Redis, Discord, Tailscale preview, gate, review, and summary assertions.
10. Add failure-mode matrix.
11. Wire fast/full wrappers.
12. Remove superseded mock pipeline simulations.

This keeps the migration safe: we first prove the environment can support the real test, then build the canonical E2E around production contracts, then retire mocks only after the real path is authoritative.
