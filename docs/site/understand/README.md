# Understand KubeClaw

Status: implemented with stated limits
Audience: new reader, operator, maintainer, security reviewer, plugin author
Owner: platform architecture
Evidence: packaging/runtime/roles; skills/nova/core; skills/worker/core
Evidence revision: `85e73b1885f04a9494f388cf6622ad0bde2db447`
Applies to: current source and declared runtime roles
Last verified: source review on 2026-09-15

## What KubeClaw Does

KubeClaw turns a declared software task into a controlled sequence of work.
It records each important decision before it moves to the next step.

A specialist can write code, review code, design an experience, or run tests.
The specialist does not control the full delivery process.
Nova keeps that control.

This separation answers a difficult question after a failure:
what happened, who decided it, and what can safely happen next?

## Who Should Read This Track

Read this track when you need to understand the system before you operate or extend it.
You do not need academic or distributed-systems knowledge.

You should know these basic ideas:

- A repository contains the product source.
- A task states the required change.
- A test checks a stated condition.
- A process can fail after it starts external work.
- A durable record remains available after a process restarts.

The [glossary](../reference/glossary.md) defines all KubeClaw terms used in this track.

## The Short Architecture Story

The Nova runtime role contains the project compiler, Nova Core, and selected plugins.
The project compiler turns the declared project into a fixed graph.
Each graph stage names its owner, inputs, limits, and permitted actions.
Nova Core then selects ready stages and gives each stage a short-lived lease.

Forge can implement the requested change.
Echo can review the result and propose findings.
Prism can prepare and publish an approved design baseline.
Buster can execute a fixed test plan and return evidence.

Worker Core supplies common worker controls below Buster and Prism.
It checks attempt identity, capacity, deadlines, cancellation, resources, and result binding.

The plugin runtime connects these parts.
It discovers packages, validates declarations, activates selected registrations, and checks capability grants.

Nova Core alone changes the canonical pipeline state.
A specialist returns a typed result, but cannot declare the full run successful.

> **Source evidence — one lifecycle authority**
>
> **Implementation:** [`PipelineLoop.run()` records stage decisions and finalizes the run](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/skills/nova/core/execution/pipeline-loop.ts#L20-L37).
>
> **Result rules:** [`applyStageResult()` maps each typed result to one lifecycle action](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/skills/nova/core/lifecycle/reducer.ts#L106-L135).
>
> **Decision record:** [ADR-001 explains why Core owns lifecycle state](../decisions/core-and-plugins.md#adr-001-core-owns-canonical-lifecycle-authority).
>
> **Revision:** `85e73b1885f04a9494f388cf6622ad0bde2db447`.

## One Representative Request

Assume that a team requests a new account page.
The project declares one module, its owned paths, its requirements, and its test plan.

The normal path is:

1. Nova checks the project and the unchanged source revision.
2. Nova compiles a fixed graph for the module and final checks.
3. Forge receives one bounded implementation task and a separate workspace.
4. Forge returns commits and artifacts. Nova records the stage result.
5. The lint stage checks the complete module change.
6. Echo reviews the fixed revision and returns evidence-backed findings.
7. Nova applies review policy. Echo does not apply the lifecycle verdict.
8. Nova sends an immutable test plan and source identity to Buster.
9. Buster runs declared providers through Worker Core and stores evidence.
10. Nova verifies the returned identity and imports the result once.
11. Final checks cover the integrated project, not only one module.
12. Nova writes the terminal run state and the project summary.

The path can include Prism before implementation.
Prism produces an approved design baseline.
Forge then implements against that fixed baseline.

The detailed [request, state, and recovery guide](request-state-recovery.md) follows this example through normal and failed paths.

## Architecture Scope

The architecture covers the complete learning-lab platform, not only the stage graph.
It uses three scopes so that infrastructure does not look like pipeline authority.

| Scope | Included systems | Requirement |
| --- | --- | --- |
| Pipeline control and work | Nova, Nova Core, plugins, Forge, Echo, Buster, Prism, and Worker Core. | Required for their declared roles and stages. |
| Showcase baseline | Kubernetes, storage, DNS, SPIRE, Git, Redis, Qdrant, PostgreSQL, BuildKit, both registries, and Tailscale. | Required before the complete lab claims readiness. |
| Optional platform extensions | Argo CD, Cilium, monitoring, and the Ops Pod. | Valuable platform capabilities, but not pipeline prerequisites. |

Kubernetes networking remains required.
The platform can use Flannel without Cilium when it preserves the documented network boundaries.
Direct Helm deployment can replace Argo CD when one controller retains exclusive ownership.

## Three Questions That Prevent False Claims

KubeClaw uses three separate status questions.

| Question | Meaning | Proof |
| --- | --- | --- |
| Is it present? | Source, a package, or a role declaration exists. | Repository inventory and package manifest. |
| Is it activated? | Current configuration selected the registration and granted its needs. | Resolved platform configuration and activation snapshot. |
| Is it reachable? | A caller can use the running path in the target environment. | Environment-specific connection and acceptance checks. |

Presence does not prove activation.
Activation does not prove network reachability.
A local test does not prove a live cluster.

For example, Prism has source and a runtime-role manifest.
This fact does not prove that every Prism workflow is deployed in a given cluster.

Forge and Echo have registered Nova stage plugins.
They are not separate runtime roles in the current role inventory.

> **Source evidence — declared roles**
>
> **Nova:** [role manifest and selected plugins](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/packaging/runtime/roles/nova.json#L1-L61).
>
> **Buster:** [role manifest, Worker Core dependency, and external capabilities](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/packaging/runtime/roles/buster.json#L1-L60).
>
> **Prism:** [role manifest, Worker Core dependency, and source access](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/packaging/runtime/roles/prism.json#L1-L28).
>
> **Current limit:** Role membership proves packaging intent. It does not prove live deployment or acceptance.

## What This Documentation Claims

This track describes the inspected implementation at the stated revision.
It explains current code, current declarations, known limits, and preserved design decisions.

It does not claim that all configured paths passed a live-cluster test.
It does not turn a package manifest into evidence of use.
It does not turn a test result into operator acceptance.

The writing follows ASD-STE100 Issue 9 principles.
It uses short sentences, active voice, defined technical nouns, and one meaning per sentence.
AP11 still owns the formal language review and the human-reader acceptance review.

## Choose Your Next Page

- [Components and authority](components-and-authority.md) explains each part and each decision boundary.
- [Request, state, and recovery](request-state-recovery.md) follows success, retry, repair, wait, cancellation, and uncertain effects.
- [Pipeline dependencies](pipeline-dependencies.md) explains Git, Redis, PostgreSQL, BuildKit, registries, mirrors, and Tailscale.
- [Deployment and trust](deployment-and-trust.md) maps processes, identities, storage, grants, networks, and failure domains.
- [Platform and operations architecture](platform-and-operations.md) explains K3s, Cilium, Argo CD, and the optional Ops Pod.
- [Worker Trust](worker-trust.md) gives the detailed SPIFFE and Envoy trust path.
- [Operate KubeClaw](../use/README.md) contains the complete operator procedure track and its stated limits.
- [Extend KubeClaw](../extend/README.md) contains plugin guidance. AP08 will complete this track.
- [Current status](../status/current.md) separates implemented work from open and live acceptance work.
