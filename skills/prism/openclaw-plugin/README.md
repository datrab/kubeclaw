# Prism OpenClaw Extension

`kubeclaw-prism` exposes two OpenClaw tools for the single logical Prism design
agent:

- `prism_create_design_set` creates a validated design-set request.
- `prism_apply_revision` applies a validated revision request.

The extension sends requests to the configured Prism control service. It does
not own pipeline scheduling, test decisions, repository access, or deployment.
OpenClaw owns tool registration and activation. The operator owns the control
service URL.

Run its direct verification with:

```bash
node --test skills/prism/openclaw-plugin/index.test.mjs
```

Run the complete plugin-system verification with:

```bash
npm run verify:plugin-system-v2
```

