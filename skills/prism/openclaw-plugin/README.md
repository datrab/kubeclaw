# Prism OpenClaw Extension

`kubeclaw-prism` exposes two OpenClaw tools for the single logical Prism design
agent:

- `prism_create_design_set` creates a validated design-set request.
- `prism_apply_revision` applies a validated revision request.

The extension sends requests to the configured Prism control service. It does
not own pipeline scheduling, test decisions, repository access, or deployment.
OpenClaw owns tool registration and activation. The sole URL author is `config/components/prism-control.config.json` selected
profile `settings.agentToolControlUrl`. Run `npm run config:prism:sync` to emit
the gateway ConfigMap projection. Normal release checks reject projection drift.
OpenClaw passes that required URL as `api.pluginConfig.controlUrl` at startup;
the plugin captures it once. Missing values, legacy `PRISM_CONTROL_URL` (even
equal/empty), and credential/path-bearing origins reject. Per-tool-call context
is task input and cannot override the endpoint. The gateway projection is not
an authenticated role boot receipt or evidence of full-chart/native acceptance.

Run its direct verification with:

```bash
node --test skills/prism/openclaw-plugin/index.test.mjs
```

Run the complete plugin-system verification with:

```bash
npm run verify:plugin-system-v2
```

