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

## Open Issues

- Runtime edits to `/home/node/.openclaw/openclaw.json` are pod-local. Persistent operator edits should target `/home/node/.openclaw-persisted/openclaw.json` and keep token fields as placeholders.
- Existing PVC config is preserved unless migration or manual override changes it, so chart config changes may not apply automatically.
