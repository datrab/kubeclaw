# Glossary

Status: shared architecture and operator terminology; recovery and workload-credential definitions are source-backed
Audience: all readers
Owner: documentation
Evidence: docs/site/understand/components-and-authority.md; docs/site/understand/request-state-recovery.md; docs/site/understand/deployment-and-trust.md; my-values/infra/spire-values.yaml; charts/prism/templates/configmap-worker-trust.yaml; skills/worker/core/worker/trust.ts; skills/prism/server/internal-auth.ts; skills/prism/server/control-server.ts; skills/prism/control/agent-jobs.ts; skills/prism/engine/render-operation.ts; skills/nova/plugins/prism-design/src/stage.ts; skills/nova/core/execution/engine-run.ts
Applies to: KubeClaw platform terminology
Last verified: 2026-10-09 for RPO, RTO, and SVID; 2026-10-10 for Prism request protection, job fence, ARIA, and approval definitions; source definitions checked, deployment and live behavior unverified

## Purpose

This glossary gives one plain meaning to each KubeClaw term.
The architecture and operator pages use these meanings consistently.
Use the same definition at the first operational use of each term, and link
that use to its canonical section below. Keep target values,
measured results, identity verification, and application permission distinct.

| Term | Plain meaning |
| --- | --- |
| Activated registration | A registration that current configuration selected and the runtime loaded. Presence in a package is not activation. |
| Adapter | A plugin registration that performs a controlled external effect for a named capability. |
| [Approval](#approval-publication-and-resume) | An authorization decision for a specified action. Prism records human approval for a design revision; publication and the Nova resume signal are separate. |
| [ARIA snapshot](#aria-snapshot) | A record of a rendered view's accessibility tree, including roles, names, and states exposed to assistive software. |
| Artifact | Stored output with an identity, namespace, content digest, size, and media information. |
| Attempt | One bounded execution of one stage or worker operation. A retry creates another attempt. |
| Buster | The test engine and role that executes fixed plans and returns facts and evidence. |
| Capability | A named type of permitted external action, such as artifact write or runtime dispatch. |
| Capability grant | Permission for one capability, one provider, and stated resource limits. |
| <a id="capability-provider"></a>Capability provider | An adapter registration selected for a named Nova capability. A mapping alone does not start the adapter. |
| Canonical state | The authoritative state used to decide what can happen next. Nova owns canonical pipeline state. |
| [cgroup](#cgroup) | Linux control group: a group of processes with shared resource controls. |
| Claim | A time-limited assignment of a worker attempt to one worker identity. |
| Cleanup state | Evidence that attempt-owned resources were removed, retained, or need reconciliation. |
| [Compare-and-swap (CAS)](#compare-and-swap) | Commit a change only if the stored value still matches the expected value. |
| Content digest | A value calculated from content. It detects changed bytes and binds stored evidence to an identity. |
| Core | Nova Core when the text discusses pipeline lifecycle. “Worker Core” always names the neutral worker layer. |
| [CSI](#csi) | Container Storage Interface: the interface Kubernetes uses for volume drivers. |
| [CSRF](#csrf) | Cross-site request forgery: another site tries to make the browser submit an unwanted change. A separate token protects Prism session writes. |
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
| [HMAC](#hmac-and-nonce) | Shared-secret message authentication that checks the sender's possession of a secret and protects message content from changes. |
| Idempotency key | An identity that lets the receiver recognize a repeated request for the same intended operation. |
| Invocation | One call to an activated stage, observer, adapter, provider, or specialist. |
| [Job fence](#job-fence) | The durable identity of a job's current claim, which must still match before Control can commit its result. |
| Lease | A short-lived contract that binds an attempt to its identity, deadline, grants, and limits. |
| Lifecycle | The permitted movement from pending work to success, failure, blockage, cancellation, retry, or wait. |
| Live acceptance | Evidence from the target running environment. Static implementation evidence and local tests do not replace it. |
| Mutual TLS | A protected connection in which both endpoints authenticate with certificates. |
| [Nonce](#hmac-and-nonce) | A one-use request value whose digest is retained to reject replay. |
| Nova | The role and engine that compile and control the canonical pipeline lifecycle. |
| Observer | A plugin registration that receives committed events for telemetry, notification, or another derived view. |
| Pipeline | The complete controlled route from admitted input through stages to one terminal run state. |
| Plugin | A package that declares extension registrations and requested capabilities. |
| Present | Available as source, package content, or a role declaration. Present does not mean active or reachable. |
| Prism | The design engine and product surface that creates revisioned design work and approved baselines. |
| Provider | Use a qualified name: [Nova capability provider](pipeline-platform.md#adapter-selection-and-validation) or [Buster test provider](../extend/buster.md#implement-a-test-provider). Their permissions and runtime contracts are separate. |
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
| Test provider | A Buster registration that performs one declared test or fixture operation and returns typed facts. |
| Typed result | A result that must match the declared versioned schema before Core uses it. |
| Uncertain effect | An external request that might have succeeded, although no trustworthy receipt is available. |
| Wait | A durable pause that needs a matching signal, approval, orchestrator action, or cooldown. |
| Worker Core | The neutral layer that controls worker attempts, claims, capacity, limits, cancellation, resources, recovery, and result binding. |

## cgroup

A Linux control group groups processes for resource accounting and control,
such as CPU and memory limits. Version 2 uses one hierarchy for these controls.
See the [native worker recovery boundary](../use/prism-studio.md#worker-not-ready)
for the host policy and process ownership requirements.

## CSI

The Container Storage Interface lets Kubernetes use an external volume driver.
The selected SPIFFE CSI driver delivers the Workload API socket used to obtain
workload credentials. See [SVID](#svid) for that identity path.

## Compare-and-swap

A compare-and-swap commits a change only if the stored value matches the value
the caller expected. For a Prism document edit, the expected value is the base
revision. A mismatch stops the edit with a revision conflict.
See [typed visual edits](../use/prism-studio.md#typed-visual-edits).

## Approval, publication, and resume

Approval is an authorization decision for a specified action. In Prism,
Control stores the human decision for a design revision and returns its approval
ID. This write does not publish a Baseline Bundle or answer a Nova wait.
Publication is a separate write that checks the approved design before it
creates or returns the bundle receipt. A separate Nova resume signal identifies
the wait and carries the approved bundle references. Its issuer fields are
caller-supplied and unsigned; matching those fields does not authenticate the
caller. Use the owning runtime's allowed transition rather than editing
lifecycle state directly.

Source: [Prism approval record](https://github.com/datrab/kubeclaw/blob/93ca75a4694084e5bc216f9aa9c7d52c13b965c6/skills/prism/server/control-server.ts#L521-L565),
[separate publication checks](https://github.com/datrab/kubeclaw/blob/93ca75a4694084e5bc216f9aa9c7d52c13b965c6/skills/prism/server/control-server.ts#L567-L609),
[Prism wait and approval payload](https://github.com/datrab/kubeclaw/blob/93ca75a4694084e5bc216f9aa9c7d52c13b965c6/skills/nova/plugins/prism-design/src/stage.ts#L8-L34),
and [Nova resume validation and transition](https://github.com/datrab/kubeclaw/blob/93ca75a4694084e5bc216f9aa9c7d52c13b965c6/skills/nova/core/execution/engine-run.ts#L82-L95).
Follow the [Prism journey](../use/prism-studio.md) for the distinct operator steps
and uncertain-outcome stop conditions.

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

## HMAC and Nonce

HMAC means hash-based message authentication code. The sender and receiver share
a secret. The sender calculates a code from the message and the secret; the
receiver checks that code before it accepts the message. This authenticates
possession of that shared secret and detects changed content. It does not
identify a particular human, grant application permission, or prevent replay
by itself.

A nonce is a one-use request value. In Prism's HMAC worker path,
`x-prism-timestamp`, `x-prism-nonce`, and the body digest are bound by
`x-prism-signature`. The receiver checks the time and signature, then retains
the nonce digest in `prism.worker_request_nonce`. A previously consumed nonce
is rejected. This replay check explains why HMAC-mode worker `/ready` must
check the nonce table. SPIFFE-mode `/ready` does not run that database check.

> **Source evidence — message authentication and replay state**
>
> **Claim:** HMAC binds time, nonce, and body; nonce storage rejects replay.
>
> **Implementation:** [`signInternalRequest`](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/internal-auth.ts#L5-L16) ·
> [`PostgresNonceStore.consume`](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/internal-auth.ts#L35-L51) ·
> [`verifyInternalRequest`](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/internal-auth.ts#L52-L87).
>
> **Contract or setting:** [`serveReadiness`](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/worker-service.ts#L72-L86)
> selects the nonce check only in HMAC mode.
>
> **Test evidence:** The [connection-refusal fixture](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/tests/worker-readiness.test.mts#L8-L21)
> checks safe dependency diagnostics. No new executed authentication or replay
> result is claimed here.
>
> **Revision:** `ec2a42ed215a2fa7dbd3172ef70ef446084963a9`.
>
> **Limit:** A health response does not prove an authenticated worker attempt or
> a human's identity. See [worker diagnosis](../use/prism-studio.md#worker-not-ready).

## CSRF

CSRF means cross-site request forgery. It is an attempt by another site to make
the browser send an unwanted state-changing request through an existing session.
Prism uses a separate `prism_csrf` cookie and `x-prism-csrf` request header.
Control requires matching values on session writes. The token supplements
session authentication; it does not replace caller permission checks. Keep its
value, session cookies, and access tokens out of retained evidence.

> **Source evidence — separate session-write protection**
>
> **Claim:** Control checks the signed session and a separate CSRF cookie/header.
>
> **Implementation:** [`authenticated`](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L108-L123).
>
> **Contract or setting:** The [session route creates the separate token and cookies](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L152-L172).
>
> **Test evidence:** Browser cookie/header handling and private-ingress access
> remain unverified in a running deployment.
>
> **Revision:** `ec2a42ed215a2fa7dbd3172ef70ef446084963a9`.
>
> **Limit:** Token matching alone does not prove the human's identity or private
> access. See [Open Studio](../use/prism-studio.md#step-2-open-studio-and-choose-the-project).

## Job Fence

A job fence is the durable identity of the current job claim. Prism stores a
new `fence` when a runner claims a job. Before Control commits the returned
document or directions, it locks that job and checks the returned `jobId` and
`fence` against the current record. The claim must be running and unexpired
for a new result. An old runner therefore cannot commit work through a later
claim. Exact replay of an already committed matching result is a separate case;
the result digest must also match. A fence is a concurrency guard, not caller
authentication or human approval.

> **Source evidence — current claim and committed result**
>
> **Claim:** The stored fence identifies the claim permitted to commit a result.
>
> **Implementation:** [claim creation](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/control/agent-jobs.ts#L47-L53) ·
> [`lockAgentResult`](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/control/agent-jobs.ts#L84-L97).
>
> **Contract or setting:** [Control passes the job and fence into the direction transaction](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L249-L262).
>
> **Test evidence:** Provider completion and result commit through a running
> agent remain unverified here.
>
> **Revision:** `ec2a42ed215a2fa7dbd3172ef70ef446084963a9`.
>
> **Limit:** A matching fence does not establish approval or resolve an uncertain
> external launch. See [direction completion](../use/prism-studio.md#step-3-wait-for-exactly-three-directions).

## ARIA Snapshot

ARIA means Accessible Rich Internet Applications. An ARIA snapshot records the
rendered view's accessibility tree: the roles, names, and states exposed to
assistive software. A screenshot records visible pixels. Prism retains both
forms of evidence for each published preview. The snapshot is not a substitute
for interactive accessibility checks or human preview review.

> **Source evidence — separate visual and accessibility evidence**
>
> **Claim:** Browser capture records both a screenshot and the body's ARIA tree.
>
> **Implementation:** [screenshot and `ariaSnapshot` capture](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/engine/render-operation.ts#L118-L128).
>
> **Contract or setting:** [publication requires and stores the matching ARIA evidence](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L711-L734).
>
> **Test evidence:** Actual browser capture and publication remain unverified
> here; no captured preview is established by this definition.
>
> **Revision:** `ec2a42ed215a2fa7dbd3172ef70ef446084963a9`.
>
> **Limit:** A snapshot alone does not establish complete accessibility. See
> [Test the preview](../use/prism-studio.md#step-8-test-the-preview).

## Technical Verbs

These definitions describe computer operations, not ordinary uses of difficult words.
They do not claim formal ASD-STE100 certification or prove that an operation ran.

At the first dependent instruction, give the object name and consumer/process. Give this scoped meaning or link to this shared entry. Do not replace exact API/CLI/wire identifiers. The linked canonical page gives actual operation-specific conditions, not a new grant.

| Verb | Scoped meaning and limits | Operation-specific explanation |
| --- | --- | --- |
| <a id="technical-verb-compile"></a>compile | Change governed source input into the selected resolved graph or executable representation. Compilation does not execute that result. Give the compilation type: project compilation or programming-language compilation. | [Operation and conditions](../use/workflows/README.md#materialize-and-compile-a-first-project) |
| <a id="technical-verb-render"></a>render | Change templates into manifests, or change a design into browser/screen output. Give the transformation type. Rendering does not prove deployment, rollout completion, human approval or complete accessibility. | [Operation and conditions](../use/maintenance.md#render-and-compare) |
| <a id="technical-verb-validate"></a>validate | Apply the named schema, grammar, identity or invariant checks to input. Give the actual validator and boundary. Validation does not imply target admission, authorization or execution without error. | [Operation and conditions](schemas.md) |
| <a id="technical-verb-dispatch"></a>dispatch | Send identity-bound work through the selected capability/transport. Submission, remote acceptance, completion and result import are different facts. | [Operation and conditions](../understand/communication.md) |
| <a id="technical-verb-reconcile"></a>reconcile | Give the reconciliation type. For an uncertain external effect, find the original outcome through its owning supported method before permitted continuation. Do not replace uncertainty with a blind retry or edited state. For a controller, compare desired and observed state. Do the permitted provisioning/update/deletion work to get the desired state, with actual ownership, retry and cleanup rules. Controller reconciliation can include first provisioning and is not limited to earlier uncertain effects. | [Operation and conditions](../use/operate.md#recover-after-interruption); [Operation and conditions](../understand/buster-namespace-controller.md) |
| <a id="technical-verb-authenticate"></a>authenticate | Check the evidence that binds a caller or message to the asserted identity or shared credential. This does not grant application permission or necessarily identify a human. | [Operation and conditions](glossary.md#hmac-and-nonce) |
| <a id="technical-verb-authorize"></a>authorize | Check if the identified caller has permission for the specified operation/resource. Authentication alone does not give that permission. | [Operation and conditions](glossary.md#svid) |
| <a id="technical-verb-commit"></a>commit | Make a named transaction or version-control change durable at its owning boundary. Give the commit type: database commit, Git commit or canonical-event commit. No type implies that all later effects succeeded. | [Operation and conditions](../understand/data-and-state.md) |
| <a id="technical-verb-claim"></a>claim | Get the current bounded job/worker assignment through its identity and concurrency checks. A claim is not caller authentication, final result acceptance or a Kubernetes volume claim. | [Operation and conditions](glossary.md#job-fence) |
| <a id="technical-verb-fetch"></a>fetch | Get the selected remote/Git objects through the named transport. This operation alone does not validate content, authorize its use or prove import without error. | [Git fetch and immutable-ref conditions](../use/diagnose.md#git-revision-unavailable) |
| <a id="technical-verb-import"></a>import | Admit the selected project/artifact representation into its named consumer after its actual checks. Give a different explanation for programming-language module import: loading a module can execute initialization code. Project/artifact admission alone does not execute the admitted pipeline. Do not apply this no-execution limit to all imports. | [Operation and conditions](project-pipeline-publication.md) |
| <a id="technical-verb-resume"></a>resume | Give the actual continuation path. Journal/run recovery continues the original retained run through its permitted recovery path and does not always need a signal. An active durable wait needs its matching qualified signal and allowed transition before continuation. An unresolved wait stops the ordinary journal-recovery path. A command given again does not necessarily do a resolved wait again. Keep original identities and retained records in each case. | [Operation and conditions](../use/operate.md); [Operation and conditions](../understand/nova-core.md) |
| <a id="technical-verb-route"></a>route | Select the declared endpoint, adapter or control-flow path for a request. Routing does not grant authority or prove delivery/completion. | [Operation and conditions](../understand/communication.md) |
| <a id="technical-verb-append"></a>append | Add a record or bytes after the existing content in the named journal/stream/file. Give its durability/atomicity boundary. Append alone is not receiver acceptance. | [Operation and conditions](../understand/data-and-state.md) |
| <a id="technical-verb-admit"></a>admit | Accept an input/job at the named service or runtime boundary after its actual required checks. Admission at one boundary does not imply admission or success at another. | [Operation and conditions](../understand/nova-core.md) |
| <a id="technical-verb-allocate"></a>allocate | Give bounded capacity or a resource to its named owner for its named lifetime. Allocation does not prove target readiness or final cleanup. | [Operation and conditions](../understand/buster-namespace-controller.md) |
| <a id="technical-verb-execute"></a>execute | Do the selected code/task with the named runtime and granted authority. Execution does not itself mean success, safe retry or final lifecycle acceptance. | [Operation and conditions](../understand/worker-core.md) |
| <a id="technical-verb-build"></a>build | Change selected source and dependencies into a named software/image output. Keep source/tool/image identities. A build does not prove a push or deployment without error. | [Operation and conditions](../use/workflows/build-image.md) |
| <a id="technical-verb-push"></a>push | Send selected Git objects or image content to the named remote. Give the push type: Git or registry. If a response is lost, the remote effect can still be complete. Its outcome needs reconciliation. | [Operation and conditions](../use/workflows/build-image.md) |
| <a id="technical-verb-store"></a>store | Keep the specified bytes/record through its named storage owner. Give the durability condition. Storage does not by itself make the record authoritative. | [Operation and conditions](../understand/data-and-state.md) |
| <a id="technical-verb-reserve"></a>reserve | Reserve the named identifier, capacity or effect identity through its specific owner. Give different explanations for an in-memory runner-log identifier reservation, a durable Core effect record and an actual resource reservation. A reserved identifier alone proves neither durable effect admission nor available runtime capacity, execution or completion. | [Operation and conditions](../understand/nova-core.md) |
| <a id="technical-verb-verify"></a>verify | Compare bytes, identity, digest or cryptographic evidence against the named expected authority and algorithm. Give the specified checks. Do not use the word as an unbounded correctness or trust claim. | [Operation and conditions](glossary.md#hmac-and-nonce) |
| <a id="technical-verb-release"></a>release | End the named owned reservation/lease/resource through its supported operation. A release request does not prove finalizer completion or removal of retained/external data. | [Operation and conditions](buster-namespace-lease.md) |
| <a id="technical-verb-lock"></a>lock | Get the named concurrency/ownership lock before its protected operation. Give the lock name and lifetime. A lock is not authentication or proof that unrelated writers stopped. | [Operation and conditions](glossary.md#job-fence) |
| <a id="technical-verb-return"></a>return | Give the caller the named result through a function/protocol boundary. Returning an acknowledgment is not necessarily durable completion of the requested operation. | [Operation and conditions](contracts.md) |
| <a id="technical-verb-parse"></a>parse | Read a representation according to the named syntax into a structure. Syntax acceptance does not prove schema validity or target behavior. | [Operation and conditions](schemas.md) |
| <a id="technical-verb-serialize"></a>serialize | Change a value to the named byte/text representation. Give the codec/domain and side-effect limits. Serialization alone is not validation or trust. | [Operation and conditions](sdk.md) |
| <a id="technical-verb-normalize"></a>normalize | Change a supported input representation into the specified canonical form. Give permitted changes and rejection conditions. Normalization is not permission to repair arbitrary invalid input. | [Operation and conditions](sdk.md) |
| <a id="technical-verb-hash"></a>hash | Calculate a digest from the selected bytes with the named algorithm. Matching digests bind content, not human identity or general trust. | [Operation and conditions](glossary.md) |
| <a id="technical-verb-decode"></a>decode | Interpret bytes with the specified encoding/format into a value. Decoding does not prove that the value satisfies its schema or authority. | [Operation and conditions](sdk.md) |
| <a id="technical-verb-encode"></a>encode | Change a value or bytes to the specified encoding. Encoding does not add encryption, authentication or validation unless those are different stated operations. | [Operation and conditions](sdk.md) |
| <a id="technical-verb-resolve"></a>resolve | Select the specified reference, path, dependency or identity through its named rules. Give the object type. Reference resolution is not automatically an allowed wait/run transition. | [Operation and conditions](configuration-precedence.md) |
| <a id="technical-verb-sign"></a>sign | Calculate the named cryptographic signature over the specified domain/payload with the selected key. Signing is distinct from human approval, issuer authorization and receiver acceptance. | [Operation and conditions](contracts.md) |
| <a id="technical-verb-replay"></a>replay | Read retained events/results again or do a named protocol operation again with its actual identity/replay rules. Give the path type: projection of existing facts or a path that can send effects. | [Operation and conditions](../use/workflows/redis-replay-recovery.md) |
| <a id="technical-verb-follow"></a>follow | Traverse a named HTTP redirect, symbolic link, source-call/dependency edge or declared graph edge. This technical computer-process sense is not ordinary obedience to instructions, logical implication, or a generic justification. | [Operation and conditions](../understand/plugin-runtime.md) |
| <a id="technical-verb-open"></a>open | Show the named computer application/view, or start access to the named file/connection through its permitted route. Opening a UI is not authentication or permission to change protected state. | [Operation and conditions](../use/prism-studio.md#step-2-open-studio-and-choose-the-project) |
| <a id="technical-verb-terminate"></a>terminate | End the named operating-system process through the specified termination mechanism. Process termination is not durable run cancellation or proof that remote effects stopped. | [Operation and conditions](../use/workflows/interruption-recovery.md) |
| <a id="technical-verb-restart"></a>restart | Start the named process/runtime again from its explicitly selected retained inputs/state. Restarting is not a new run identity or evidence that old effects are safe to repeat. | [Operation and conditions](../use/workflows/interruption-recovery.md) |
| <a id="technical-verb-create"></a>create | Make a new named computer object, file, database record or session through its owning creation operation. Give identity, existence/replacement and retained-write rules. Creation of one object does not prove deployment or later-operation completion. Use make for ordinary preparation if it gives the same instruction. | [Operation and conditions](../use/workflows/examples/request-trace-success.json) |
| <a id="technical-verb-bind"></a>bind | Connect selected values/content/identity to the specified record, digest, scope or consumer through the named mechanism. Give the fields and comparisons/signatures used. Binding supplied identity fields does not by itself authenticate a caller or authorize an operation. | [Operation and conditions](glossary.md) |
| <a id="technical-verb-pin"></a>pin | Select and keep a specified source/content/version identity for the named consumer. Give the pin type: recorded selection, immutable byte reference or enforced runtime comparison. A pin claim alone does not prove that each later path checks it or that a mutable name cannot change. | [Operation and conditions](configuration.md) |

## Similar Terms

Do not use these terms as synonyms.

| Terms | Difference |
| --- | --- |
| Present, activated, reachable | Present means the source, package content, or declaration exists. Activated means configuration selected the registration and the runtime loaded it. Reachable needs the running environment. |
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
