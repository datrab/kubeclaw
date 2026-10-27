# Buster-internal fixture failure diagnosis

## Ownership and execution order

Nova owns the pipeline graph, native gate decision import and Forge remediation.
`skills/nova/plugins/buster-quality-gate/src/stage.ts` invokes the existing quality
agent only **after** native success. It is not the deployment-failure diagnostic
hook: by then a failed fixture previously had already released its lease.

The Kubernetes fixture lifecycle belongs to Buster's
`KubernetesFixtureCapabilityInvoker`. Its readiness-failure path now runs:

1. Collect bounded, existing failure evidence.
2. While the namespace/lease still exists, invoke one configured diagnostic agent.
3. Validate and filter its structured report.
4. Release the lease in `finally`, including on agent failure, timeout/cancellation.
5. Return the original failed fixture with the report in
   `failureEvidence.diagnosis`; the provider's existing finding/summary and failure
   artifact carry it through the ordinary Buster result/import path to Nova.

Successful deployment remains deterministic. Existing optional downstream agent
tests remain unchanged. Diagnosis never changes failure to success, repairs code,
spawns Forge, retries deployment, or adds a new Nova graph round-trip. Nova decides
whether the returned failed gate requires Forge using its existing graph policy.

## Agent dispatch and result contract

`fixture-diagnosis-agent.ts` reuses the common runtime-dispatch plugin's actual
`dispatchOpenClaw`, collector session/result transport, and cancellation protocol.
There is no second agent launcher or project-specific error catalogue.
The operator chooses the target; project manifests cannot choose credentials,
agents, gateways or permissions. The agent receives the immutable fixture identity
and existing sanitized evidence. It may inspect the indicated namespace using its
operator-authorized **read-only** tools. Logs are untrusted data, not instructions.

The closed result contains `status` (diagnosed/inconclusive/unavailable),
`component`, `errorMessage`, nullable `cause`, `evidence` and `nextStep`.
A diagnosed report must provide a cause; an unknown cause must not be invented.
Fields and total output are bounded; existing credential-pattern filtering applies
before publication. Gateway tokens/private-key output are rejected. This does not
make arbitrary unknown secret values safe: the dedicated agent's tool policy and
log-access/redaction boundary remain an operator prerequisite.

## Operator configuration (not automatically enabled)

Under the Buster runtime config's `kubernetesFixture`, optional `failureDiagnosis`
accepts only:

- `targetId`: operator-selected runtime target name;
- `target`: existing common OpenClaw runtime target configuration;
- `tokenEnvironmentVariable`: name of a privately supplied Gateway token;
- `timeoutMs`: 1,000..120,000;
- `readOnlyPolicyReference`: reference to the independently enforced agent policy.

The target must use a dedicated `agentRole: buster-diagnosis`, subagent runtime,
no writable workspaceReference/root, no controller session and no remote result
endpoint. HTTPS is required except on loopback. The shared target parser validates
budgets/model/polling/path configuration. Buster permits only that exact Gateway
endpoint and token; redirect and oversized response bodies are rejected. Result
transport is collector-based, not arbitrary repository file reads.

A nonempty policy reference is **not** proof of enforcement. Before enabling:
configure/verify a dedicated agent with namespace-bound read-only pod/status/event
and bounded log access, no shell/exec, no Secret read, no mutations or delegation.
Do not reuse an unrestricted implementation/test agent and rely on prompt text.
This change deliberately does not modify production agent permissions or activate
a permissive fallback. Absent configuration preserves existing behavior.

## Time, cleanup and reporting

Reserve time in the node execution budget and lease lifetime for readiness,
diagnosis and cleanup. Diagnosis is single-attempt and bounded. Cancellation uses
the shared dispatch reconciliation path; a bounded settlement grace (default10s)
precedes release. An uncooperative dispatcher cannot strand a namespace: release
still happens and termination is explicitly reported as unconfirmed. Such a report
is not permission to launch another diagnostic agent blindly. Reconcile first.
Lease release and observed namespace/PVC deletion are distinct; existing TTL and
cleanup evidence obligations still apply. A failed or invalid diagnosis returns a
fixed unavailable message, not a raw exception or success.

## Verification and remaining live qualification

Focused tests exercise failure→diagnosis→cleanup ordering, no diagnosis on success
or admission validation errors, invalid output, timeout, cancellation and stubborn
callbacks. A local mock Gateway exercises the **real shared dispatch transport**
(idempotent spawn, collector wait/result, token exclusion and report filtering).
These tests do not prove a deployed agent policy, live Gateway activation or live
namespace diagnosis. Those require the operator-configured target and one isolated
live failure with report delivery and cleanup observation.
