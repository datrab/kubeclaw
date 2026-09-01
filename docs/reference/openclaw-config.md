# OpenClaw Config

Status: current
Audience: reference reader, operator

## Purpose

Document how `openclaw.json` is rendered, persisted, and materialized at runtime.

## Current Behavior

The chart renders `openclaw.json` in `ConfigMap/<release>-config`. The init container copies it to `/config/openclaw.json` only when the persisted source file is absent, then refreshes retained configs in place. The main container mounts the retained config PVC at `/home/node/.openclaw`, leaves `/home/node/.openclaw/openclaw.json` as the real writable runtime file, and exposes the same retained source at `/home/node/.openclaw-persisted`.

The rendered config includes:

- auth profiles for Anthropic, LiteLLM, and canonical OpenAI OAuth
- ACP enabled with backend `acpx`
- LiteLLM provider model definitions from values
- agent defaults and model fallbacks, including Codex runtime metadata on canonical OpenAI model refs
- memory search settings with vector store enabled
- compaction/context pruning defaults
- tool policy for coding profile, sessions, session spawn, and full exec
- Discord channel configuration when enabled

Init refreshes persisted `openclaw.json` so LiteLLM, memory search, and Discord token fields use env SecretRefs instead of literal secrets. It also removes the obsolete `plugins.load.paths` entry for `/app/openclaw-plugins/kubeclaw-agent-observer` and seeds official external plugins from the image-baked npm cache using pinned `npm:@openclaw/*` provenance. This allows trusted official plugins such as Discord to use protected state APIs without runtime network access. Existing non-secret runtime edits stay in the persistent file across redeploys. The `kubeclaw-prism` plugin entry belongs only to the logical `agent-prism`; startup migration removes it from other persistent agent homes before validation. The startup doctor runs as a blocking init migration against that persistent OpenClaw home while the gateway is stopped; this lets required SQLite schema migrations complete before gateway readiness. SQLite staging uses the writable `/tmp` volume instead of the read-only image home. `swarm.config.json` is still rendered through `/runtime-config` because it can receive `DISCORD_WEBHOOK`.

Managed multi-agent rosters assign `agents.defaults.systemAgent.agentId` to
`main`. Startup migration adds that owner only when neither a system owner nor a
heartbeat owner already exists. This gives memory reconciliation, cron jobs,
and ambient heartbeat work an unambiguous owner without overwriting an explicit
operator choice.

## Source And Runtime Paths

| Layer | Owner | Path or key | When it runs | Output |
| --- | --- | --- | --- | --- |
| Chart source config | `charts/kubeclaw/templates/configmap-gateway.yaml` | ConfigMap key `openclaw.json`; values `litellm.endpoint`, `litellm.defaultModel`, `litellm.models`, `discord.enabled`, `commands.ownerAllowFrom`, `commands.allowFromDiscord`, `gateway.port` | Helm render | source config with env SecretRefs |
| Persistent source config | init block in `charts/kubeclaw/templates/deployment.yaml` | `/config/openclaw.json`; mounted as `/home/node/.openclaw/openclaw.json`; exposed as `/home/node/.openclaw-persisted/openclaw.json` | pod start; first write plus migrations | writable retained config with canonical model refs and SecretRefs |
| Secret inputs | `charts/kubeclaw/templates/deployment.yaml`; `my-values/setup-secrets.sh` | `LITELLM_API_KEY`, `DISCORD_TOKEN`, `OPENCLAW_GATEWAY_TOKEN`, `ANTHROPIC_API_KEY`, `STITCH_API_KEY` | environment creation from Kubernetes Secrets | runtime credentials available to gateway/container |
| Health and gateway | deployment template health script; OpenClaw gateway command | `/runtime-config/kubeclaw-health.mjs`, gateway port `18789`, bridge port `18790` | readiness/liveness and runtime command start | dependency-aware health checks and `openclaw gateway status` |

## Config Keys To Treat As Current Behavior

- `acp.enabled`, `acp.backend`, `acp.allowedAgents`, and `acp.maxConcurrentSessions` define ACP availability in the rendered OpenClaw config.
- `models.providers.litellm.baseUrl` and `models.providers.litellm.apiKey` connect the pod to the configured LiteLLM-compatible endpoint while the default model policy prefers OpenAI profiles and keeps LiteLLM as a chart-driven fallback. The API key is an env SecretRef to `LITELLM_API_KEY`.
- `agents.defaults.memorySearch.remote.baseUrl` and `agents.defaults.memorySearch.remote.apiKey` reuse the LiteLLM endpoint/API key for remote memory search. The API key is also an env SecretRef.
- `commands.ownerAllowFrom` configures OpenClaw owner-only command authority from chart values.
- `tools.profile`, `tools.sessions.visibility`, `tools.sessions_spawn.attachments.enabled`, and `tools.exec.security` configure the runtime tool posture.
- `channels.discord.enabled`, `channels.discord.token`, `channels.discord.threadBindings.spawnSessions`, and `channels.discord.execApprovals.approvers` are rendered from chart values and Discord values. The token is an env SecretRef to `DISCORD_TOKEN`.

## Verification

```bash
helm template kubeclaw charts/kubeclaw -f my-values/nova-values.yaml | rg 'openclaw.json|ownerAllowFrom|LITELLM_API_KEY|DISCORD_TOKEN'
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- openclaw gateway status
```

## Open Issues

- Operator and runtime edits should target `/home/node/.openclaw/openclaw.json`, which is the same durable retained file exposed again at `/home/node/.openclaw-persisted/openclaw.json`. Token fields should stay as SecretRef objects.
- Existing PVC config is preserved unless migration or manual override changes it, so chart config changes may not apply automatically.
