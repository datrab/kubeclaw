# Replacing Agent Runtime

Agent-backed stages depend only on `runtime.dispatch`. Replace the provider by
installing an adapter for that capability and selecting it in operator-owned
provider policy.

The OpenClaw implementation is
`skills/common/plugins/runtime-dispatch/src/openclaw.ts`. It starts a session,
waits for terminal state, reads the extension-owned durable result file,
propagates cancellation, and returns durable session evidence.

## Agent output boundary

Every agent-backed registration owns one closed `outputContract`. The dispatch
request may include protocol, agent, identity, task, evidence, and rules, but
those fields are input-only. The agent writes only the domain output described
by `outputContract`; it must not echo any request-envelope field.

The runtime owns invocation identity and session evidence. After reading the
durable agent output, it attaches the protocol-specific runtime evidence before
the extension parser validates the combined completion. Extensions bind run,
stage, module, gate, project, and attempt identity from their trusted invocation
input rather than accepting identity supplied by an agent.

This separation is fail-closed:

- output contracts set `additionalProperties: false`;
- prompts state the exact required output shape;
- parsers reject request-envelope fields and unknown output fields;
- runtime evidence is added by trusted runtime code only;
- agent output is written atomically outside disposable worktrees.

`tests/verification/contracts/check-plugin-agent-output-contracts.mts` exercises
the real request builders, OpenClaw task construction, runtime evidence
attachment, and extension parsers for every agent-backed registration. A live
production E2E remains the authoritative proof that the model follows these
contracts through the complete workflow.
