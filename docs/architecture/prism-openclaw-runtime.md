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

## Control HTTP composition and route ownership

`server/control.ts` captures one immutable startup composition, creates the
PostgreSQL pool, and binds the authored `operator.prism.control.port`.
`createConfiguredControlServer` consumes that composition; the existing
`createControlServer(pool, environment)` convenience entrypoint loads once and
uses the same constructor. Product-authority wrapping remains outside application
routing. Credentials and SPIFFE policy retain their existing configuration owners.

The application dispatcher in `server/control-server.ts` preserves this order:
health/readiness, internal artifacts, session, signed dispatch, agent callbacks,
then session/CSRF authentication for every remaining application route, including
unknown paths. Authenticated routes cover projects, documents, directions, document
history, engine operations, approvals/baselines, corpus, preferences and artifacts.
Each matching route returns an explicit handled result after its response; a void
HTTP write is never interpreted as an unmatched route. One catch maps syntax errors
to 400 and other application errors to 422 and retains request-failure diagnostics.
The explicit Node Console uses the original `ignoreErrors:true` behavior. A real
closed-descriptor regression test checks that this failure preserves responses
and availability; this is not a guarantee for every broken-pipe condition.

`control-context.ts` owns the stable pool/repository/artifact-store/native-operation
references. Individual route modules accept only their required context properties;
the actor is created per request after authentication. `control-http.ts` owns the
original bounded JSON reader, response headers and identity helpers. Dispatch
retains raw-byte signature verification before parsing and the existing design
request transaction. Baseline publication separates validation/specification from
archive assets/previews and persistence; an existing publication returns before
new rendering or writes. Corpus acquisition retains publication and cleanup error
precedence and activates only the persisted governed revision after cleanup.

These boundaries are source and local HTTP/SQL regression guarantees. They do not
establish native isolation, live SPIFFE/Envoy behavior or cluster deployment.

### Studio configuration authority

The Studio server reads `operator.prism.studio` through the same validated swarm
loader as Control and Worker, once before binding its listener. Its port, Control
origin and full-response deadline have no environment/default fallback. The
Studio-specific retired environment keys are rejected; other roles' separate
uses of `PORT` or `PRISM_CONTROL_URL` are preserved.

The installed asset root and ingress Secret remain distinct inputs. The image
uses the repository-relative `skills/prism/server` and `dist-studio` layout so the
real shared loader and schema resolve without a copied alternate implementation.
Its runtime dependency closure contains Ajv and the four required dependency
packages. Build-time actual-service tests consume an explicitly mounted authored
fixture; no swarm default is baked into the final image. The existing image gate
has a Studio role that loads the installed production configuration with inherited
image environment. Source tests of that contract do not establish that a Docker
image has actually been built or run.

Helm delivers the same read-only author and checksum rollout trigger to Studio.
Its Service remains port 80 while probes, Service target and ingress policy use
the authored listener. Studio reaches Control through the stable HTTP Service
port 8080, independently of Control's backend listener. Standalone external
origins are valid runtime inputs, but the existing Helm topology deliberately
rejects them instead of broadening the Control-only egress policy.
