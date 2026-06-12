# OpenClaw Config

Status: current
Audience: reference reader, operator

## Purpose

Document how `openclaw.json` is rendered, persisted, and materialized at runtime.

## Current Behavior

The chart renders `openclaw.json` in `ConfigMap/<release>-config`. The init container copies it to `/config/openclaw.json` only when the persisted source file is absent. The main container mounts the retained config PVC at `/home/node/.openclaw`, exposes the same retained source at `/home/node/.openclaw-persisted`, and overlays the runtime `openclaw.json` from an `emptyDir` volume.

The rendered config includes:

- auth profiles for Anthropic, LiteLLM, and OpenAI Codex
- ACP enabled with backend `acpx`
- LiteLLM provider model definitions from values
- agent defaults and model fallbacks
- memory search settings with vector store enabled
- compaction/context pruning defaults
- tool policy for coding profile, sessions, session spawn, and full exec
- Discord channel configuration when enabled

Init normalizes persisted `openclaw.json` so LiteLLM and Discord token fields remain placeholders. It then renders `/runtime-config/openclaw.json` with the current `LITELLM_API_KEY` and `DISCORD_TOKEN`, which the main container sees at `/home/node/.openclaw/openclaw.json`. Init also removes an obsolete `plugins.load.paths` entry for `/app/openclaw-plugins/kubeclaw-agent-observer` from persisted config.

## Source And Runtime Paths

| Layer | Owner | Path or key | When it runs | Output |
| --- | --- | --- | --- | --- |
| Chart source config | `charts/kubeclaw/templates/configmap-gateway.yaml` | ConfigMap key `openclaw.json`; values `litellm.endpoint`, `litellm.defaultModel`, `litellm.models`, `discord.enabled`, `commands.allowFromDiscord`, `gateway.port` | Helm render | secret-free source config with placeholders |
| Persistent source config | init block in `charts/kubeclaw/templates/deployment.yaml` | `/config/openclaw.json`; exposed as `/home/node/.openclaw-persisted/openclaw.json` | pod start; first write only unless operator edits PVC | retained source config with `__LITELLM_API_KEY__` and `__DISCORD_TOKEN__` placeholders |
| Runtime overlay config | init block in `charts/kubeclaw/templates/deployment.yaml` | `/runtime-config/openclaw.json`; mounted at `/home/node/.openclaw/openclaw.json` | every pod start | current Secret values substituted for runtime use |
| Secret inputs | `charts/kubeclaw/templates/deployment.yaml`; `my-values/setup-secrets.sh` | `LITELLM_API_KEY`, `DISCORD_TOKEN`, `OPENCLAW_GATEWAY_TOKEN`, `ANTHROPIC_API_KEY`, `STITCH_API_KEY` | environment creation from Kubernetes Secrets | runtime credentials available to gateway/container |
| Health and gateway | deployment template health script; OpenClaw gateway command | `/runtime-config/kubeclaw-health.mjs`, gateway port `18789`, bridge port `18790` | readiness/liveness and runtime command start | dependency-aware health checks and `openclaw gateway status` |

## Config Keys To Treat As Current Behavior

- `acp.enabled`, `acp.backend`, `acp.allowedAgents`, and `acp.maxConcurrentSessions` define ACP availability in the rendered OpenClaw config.
- `models.providers.litellm.baseUrl`, `models.providers.litellm.apiKey`, and `agents.defaults.model.primary` connect the pod to the configured LiteLLM-compatible endpoint.
- `agents.defaults.memorySearch.remote.baseUrl` and `agents.defaults.memorySearch.remote.apiKey` reuse the LiteLLM endpoint/API key for remote memory search.
- `tools.profile`, `tools.sessions.visibility`, `tools.sessions_spawn.attachments.enabled`, and `tools.exec.security` configure the runtime tool posture.
- `channels.discord.enabled`, `channels.discord.threadBindings.spawnAcpSessions`, and `channels.discord.execApprovals.approvers` are rendered from chart values and Discord values.

## Verification

```bash
helm template kubeclaw charts/kubeclaw -f my-values/nova-values.yaml | rg 'openclaw.json|__LITELLM_API_KEY__|__DISCORD_TOKEN__'
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- openclaw gateway status
```

## Open Issues

- Runtime edits to `/home/node/.openclaw/openclaw.json` are pod-local. Persistent operator edits should target `/home/node/.openclaw-persisted/openclaw.json` and keep token fields as placeholders.
- Existing PVC config is preserved unless migration or manual override changes it, so chart config changes may not apply automatically.
