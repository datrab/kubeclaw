# Prism OpenClaw runtime

Prism is one logical agent with several separately secured components. Only
`agent-prism` runs OpenClaw and performs model reasoning. The other workloads
are ordinary application services.

Nova's `archviewer` sidecar is not part of Prism. It serves Nova-authored HTML
architecture presentations, while Prism Studio previews and edits Prism Design
Documents. Both may operate at the same time because they have separate data and
authority boundaries.

| Component | Responsibility | LLM access |
| --- | --- | --- |
| `agent-prism` / `kubeclaw` | OpenClaw gateway, persistent project sessions, Discord | OpenAI through OpenClaw; LiteLLM only for memory-search embeddings |
| `prism-agent-bridge` | Turns Nova and Studio HTTP requests into `openclaw agent --session-key ...` sends | None; talks to the local gateway |
| `prism-control` | Validates contracts, revisions, approvals, and durable state | None |
| `prism-worker` | Deterministic rendering, evaluation, and evidence | None |
| `prism-studio` | Human review and editing UI | None |
| Envoy sidecars | SPIFFE mTLS, exact peer authorization, and trust-boundary routing | None |

The new-design path is:

```text
Nova runtime.dispatch
  -> Nova Envoy 127.0.0.1:28080
  -> SPIFFE mTLS
  -> agent-prism Envoy :18082
  -> prism-agent-bridge :18080
  -> OpenClaw agent send, session prism-<project-id>
  -> prism_create_design_set
  -> agent-prism Envoy 127.0.0.1:28080
  -> SPIFFE mTLS
  -> prism-control
  -> exactly three validated directions in PostgreSQL
  -> Prism Studio
```

Studio feedback follows the reverse application path: Control sends a revision
request through Envoy to the bridge, the bridge reuses the exact project session,
and the agent must commit the complete next document through
`prism_apply_revision`. The control plane enforces the revision number and project
ownership; a prose-only model answer cannot mutate state.

Envoy is required because the OpenClaw gateway and the application APIs solve
different problems. OpenClaw owns sessions, tools, Discord, and model routing.
Envoy owns workload identity and encrypted service-to-service transport. Nova
cannot reach the bridge directly, and the Prism agent cannot reach Control without
presenting the `agent-prism` SPIFFE identity.

The bridge binds only to loopback. Its Kubernetes health checks run inside the
container against `127.0.0.1:18080`; pod-IP HTTP probes cannot reach that listener.
The Prism agent also requires TCP 6379 to the same-namespace Redis workload for
the shared agent stream. Its dedicated network policy permits that exact peer
and port without granting the broader egress policy used by other agents.

The worker has no `PRISM_PROVIDER_*` environment variables, provider Secret, or
LiteLLM/internet egress rule. `agent-prism` uses the same managed OpenAI model
policy as Nova and Buster: `openai/gpt-5.6-sol` with `openai/gpt-5.5` fallback.
It is the only Prism workload allowed to reach LiteLLM, and only OpenClaw memory
search uses that path for embeddings. External TCP 443 remains available to the
agent for OpenAI, Discord, and versioned runtime-bundle retrieval. The current
project checkout uses the separate SSH remote
`git@github.com:datrab/kubeclaw.git`; it is not the source of Prism's runtime
schema or fixture. Those contract assets are part of the commit-pinned Prism
code bundle mounted under `/app/skills/packages/prism-contract`. No application
service bypasses the OpenClaw gateway for model calls.
