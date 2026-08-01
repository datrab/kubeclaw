# Running The Pipeline

## Start A Run

Use the v2 CLI entrypoint:

```bash
npm run pipeline -- --help
```

Provide an operator-owned platform configuration and graph through the CLI
arguments described by `skills/common/plugin-runtime/cli.ts`.

## Check Status

Inspect the run journal, canonical events, artifacts, and observer outputs under
the configured durable roots. A run is terminal only when the core lifecycle
projection says so.

## Common Failures

- Registry rejection: fix the manifest, trust, provider, or grant configuration.
- Stage crash: inspect the attempt record and plugin-domain evidence.
- Adapter unavailable: repair its dependency and restart activation.
- Ambiguous external effect: reconcile the provider receipt before recovery.
