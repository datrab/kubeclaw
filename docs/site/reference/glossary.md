# Glossary

Status: shared architecture and operator terminology; recovery and workload-credential definitions are source-backed
Audience: all readers
Owner: documentation
Evidence: docs/site/understand/components-and-authority.md; docs/site/understand/request-state-recovery.md; docs/site/understand/deployment-and-trust.md; my-values/infra/spire-values.yaml; charts/prism/templates/configmap-worker-trust.yaml; skills/worker/core/worker/trust.ts
Applies to: KubeClaw platform terminology
Last verified: 2026-10-09 for RPO, RTO, and SVID definitions; bounded source review only

## Purpose

This glossary gives one plain meaning to each KubeClaw term.
The architecture and operator pages use these meanings consistently.
Use the same full name and definition at the first operational use of RPO, RTO,
or SVID, and link that use to its canonical section below. Keep target values,
measured results, identity verification, and application permission distinct.

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
| [RPO](#rpo) | Recovery point objective: the owner-approved maximum data-loss time window. |
| [RTO](#rto) | Recovery time objective: the owner-approved maximum recovery duration. |
| SDK | Shared types and helper functions used by Core, plugins, adapters, and specialist integrations. |
| SPIFFE | The workload identity standard used to identify protected Kubernetes workloads. |
| SPIRE | The identity service that issues short-lived SPIFFE certificates to attested workloads. |
| Specialist | A bounded worker identity that performs one type of delegated work, such as Forge or Echo. |
| Stage | One declared unit in the pipeline graph. It has an owner, input, limits, and dependencies. |
| [SVID](#svid) | SPIFFE Verifiable Identity Document: a workload credential that proves a SPIFFE identity. |
| Terminal state | The final run state: succeeded, failed, blocked, or cancelled. |
| Typed result | A result that must match the declared versioned schema before Core uses it. |
| Uncertain effect | An external request that might have succeeded, although no trustworthy receipt is available. |
| Wait | A durable pause that needs a matching signal, approval, orchestrator action, or cooldown. |
| Worker Core | The neutral layer that controls worker attempts, claims, capacity, limits, cancellation, resources, recovery, and result binding. |

## RPO

The recovery point objective (RPO) is the maximum data-loss time window that the
data owner approves. It is a target. Actual data loss is the measured gap between
the last accepted source data and the verified restored data. Record the source
and restored points used for that measurement, then compare the gap with the
approved target. A backup schedule alone does not prove this result.

## RTO

The recovery time objective (RTO) is the maximum recovery duration that the
service owner approves. It is a target. Actual recovery time is the measured
elapsed time from the recovery start to the verified restoration of service.
Record those start and end conditions with the measurement, then compare the
duration with the approved target.

Keep each target `undecided` until its owner approves it. Keep an absent actual
result `not measured`. An approved target and a completed measurement are
different records. The [backup and recovery procedure](../use/recovery.md#define-a-backup-set)
requires both records; it supplies no target values or measured platform result.

## SVID

A SPIFFE Verifiable Identity Document (SVID) is a workload credential that proves
a SPIFFE identity. On the deployed KubeClaw paths described in
[Worker Trust](../use/worker-trust.md#canonical-worker-trust-procedure), it is a
short-lived X.509 certificate that contains the workload's SPIFFE identity.
SPIRE issues the credential, the CSI driver delivers the Workload API socket,
and Envoy uses that identity for mutual TLS. Successful identity verification
does not grant application permission. The receiving application's allowlist
must also permit that identity.

> **Source evidence — deployed identity and application permission**
>
> **Claim:** The selected SPIRE configuration assigns namespace and ServiceAccount
> identities and disables JWT-SVID support. The deployed proxy uses certificates
> and exact SPIFFE URI matching. Worker Core checks application permission after
> it reads the verified peer identity.
>
> **Implementation:** [`clusterSPIFFEIDs` and `jwtSVIDSupport`](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/my-values/infra/spire-values.yaml#L27-L40) ·
> [CSI socket volume](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/charts/kubeclaw/templates/deployment.yaml#L1637-L1640) ·
> [Prism certificate delivery and URI checks](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/charts/prism/templates/configmap-worker-trust.yaml#L17-L40) ·
> [`authorizeSpiffePeer`](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/worker/core/worker/trust.ts#L31-L41).
>
> **Contract or setting:** The selected `workerTrust.spiffe` values choose the
> active identity path. Check the certificate lifetime with the SPIRE issuance
> authority; this page supplies no fixed lifetime.
>
> **Test evidence:** [The parser and allowlist contract checks accepted and denied
> peers](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/tests/verification/contracts/check-worker-trust-spiffe.mts#L14-L36).
> The local parser and allowlist contract passed on 2026-10-09. It does not prove
> live authorization.
>
> **Revision:** `082db288f7bc5e686e47306d60cf4db7d8ba8cfc`.
>
> **Limit:** No fixed certificate lifetime, expiry exercise, or independent SPIRE
> restore result is established here. Follow the
> [certificate and SPIRE rotation boundary](../use/maintenance.md#certificate-and-spire-rotation).

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
