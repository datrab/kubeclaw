# Glossary

Status: implemented for the architecture track
Audience: all readers
Owner: documentation
Evidence: docs/site/understand/components-and-authority.md; docs/site/understand/request-state-recovery.md; docs/site/understand/deployment-and-trust.md
Applies to: current documentation
Last verified: 2026-09-15

## Purpose

This glossary gives one plain meaning to each KubeClaw term.
The architecture pages use these meanings consistently.

| Term | Plain meaning |
| --- | --- |
| Activated registration | A registration that current configuration selected and the runtime loaded. Presence in a package is not activation. |
| Adapter | A plugin registration that performs a controlled external effect for a named capability. |
| Approval | An authorized signal that answers a stored wait. Approval is not a direct edit of lifecycle state. |
| Artifact | Stored output with an identity, namespace, content digest, size, and media information. |
| Attempt | One bounded execution of one stage or worker operation. A retry creates another attempt. |
| Buster | The test engine and role that executes fixed plans and returns facts and evidence. |
| Capability | A named type of permitted external action, such as artifact write or runtime dispatch. |
| Capability grant | Permission for one capability, one provider, and stated resource limits. |
| Canonical state | The authoritative state used to decide what can happen next. Nova owns canonical pipeline state. |
| Claim | A time-limited assignment of a worker attempt to one worker identity. |
| Cleanup state | Evidence that attempt-owned resources were removed, retained, or need reconciliation. |
| Content digest | A value calculated from content. It detects changed bytes and binds stored evidence to an identity. |
| Core | Nova Core when the text discusses pipeline lifecycle. “Worker Core” always names the neutral worker layer. |
| Durable | Stored so that the applicable process can restart without losing the record. Durability still depends on the storage system. |
| Echo | The review specialist identity. Echo proposes findings but does not own lifecycle verdicts. |
| Effect | An action outside the pure stage calculation, such as a network call, Git change, artifact write, or runtime dispatch. |
| Effect receipt | A durable record of the known outcome of one effect request. |
| Engine | Code that interprets one class of work. Buster interprets test plans, and Prism interprets design operations. |
| Evidence | A bound record or artifact that supports a fact or decision. A raw log alone is not authoritative lifecycle evidence. |
| Failure domain | The set of functions that one failure can directly stop or corrupt. |
| Forge | The implementation specialist identity used through Nova runtime dispatch. Forge is not a current runtime role manifest. |
| Foundation | Shared runtime code for configuration, registry, validation, isolation, packages, artifacts, and observability. |
| Graph | The fixed set of pipeline stages and their dependency, activation, and repair edges. |
| Idempotency key | An identity that lets the receiver recognize a repeated request for the same intended operation. |
| Invocation | One call to an activated stage, observer, adapter, provider, or specialist. |
| Lease | A short-lived contract that binds an attempt to its identity, deadline, grants, and limits. |
| Lifecycle | The permitted movement from pending work to success, failure, blockage, cancellation, retry, or wait. |
| Live acceptance | Evidence from the target running environment. Static implementation evidence and local tests do not replace it. |
| Mutual TLS | A protected connection in which both endpoints authenticate with certificates. |
| Nova | The role and engine that compile and control the canonical pipeline lifecycle. |
| Observer | A plugin registration that receives committed events for telemetry, notification, or another derived view. |
| Pipeline | The complete controlled route from admitted input through stages to one terminal run state. |
| Plugin | A package that declares extension registrations and requested capabilities. |
| Present | Available as source, package content, or a role declaration. Present does not mean active or reachable. |
| Prism | The design engine and product surface that creates revisioned design work and approved baselines. |
| Provider | A Buster registration that performs one declared test operation and returns typed facts. |
| Reachable | Usable through the configured running process and network path in one environment. |
| Reconciliation | Work that determines the outcome of earlier activity before the system permits new activity. |
| Registration | One declared extension surface inside a plugin package. |
| Remediation | A declared path that sends a product defect to a stage that can repair it. |
| Repair budget | A limit on automatic and authorized remediation orders, grouped by defect category. |
| Result binding | Checks that connect a returned result to the exact run, plan, node, attempt, claim, and source that produced it. |
| Resume signal | A typed, attributable, and idempotent answer that permits Nova to continue a stored wait. |
| Retry | Another attempt after a retryable technical result. It is different from product repair. |
| Role bundle | The declared packages, plugins, entry point, and external capabilities for one runtime purpose. |
| SDK | Shared types and helper functions used by Core, plugins, adapters, and specialist integrations. |
| SPIFFE | The workload identity standard used to identify protected Kubernetes workloads. |
| SPIRE | The identity service that issues short-lived SPIFFE certificates to attested workloads. |
| Specialist | A bounded worker identity that performs one type of delegated work, such as Forge or Echo. |
| Stage | One declared unit in the pipeline graph. It has an owner, input, limits, and dependencies. |
| Terminal state | The final run state: succeeded, failed, blocked, or cancelled. |
| Typed result | A result that must match the declared versioned schema before Core uses it. |
| Uncertain effect | An external request that might have succeeded, although no trustworthy receipt is available. |
| Wait | A durable pause that needs a matching signal, approval, orchestrator action, or cooldown. |
| Worker Core | The neutral layer that controls worker attempts, claims, capacity, limits, cancellation, resources, recovery, and result binding. |

## Similar Terms

Do not use these terms as synonyms.

| Terms | Difference |
| --- | --- |
| Present, activated, reachable | Present concerns installed content. Activated concerns runtime selection. Reachable concerns the running environment. |
| Retry, repair | Retry repeats work after a technical problem. Repair changes the product after a detected defect. |
| Failure, uncertainty | Failure is a known unsuccessful outcome. Uncertainty means that the outcome is not known. |
| Role, engine, specialist, plugin | A role is a bundle. An engine interprets work. A specialist performs delegated work. A plugin declares extension points. |
| Authentication, authorization | Authentication identifies the caller. Authorization decides what that identity may do. |
| Test evidence, quality verdict | Buster returns execution evidence. Nova-owned policy determines the pipeline effect. |
| Local verification, live acceptance | Local checks prove source behavior in their test scope. Live acceptance proves a configured target environment. |

## Read More

- [Components and Authority](../understand/components-and-authority.md) places these terms in the system.
- [Request, State, and Recovery](../understand/request-state-recovery.md) shows how the terms interact over time.
- [Deployment and Trust](../understand/deployment-and-trust.md) maps them to running workloads.
