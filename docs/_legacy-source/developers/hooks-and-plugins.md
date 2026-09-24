# Hooks And Plugins

Pipeline packages use inert `plugin.json` manifests and register stages,
observers, or adapters. OpenClaw host plugins use `openclaw.plugin.json`.

Pipeline observers consume immutable canonical events. Host-hook ingress is
normalized by `skills/common/plugins/openclaw-agent-observer/` and
`skills/common/plugins/openclaw-agent-events/`.
