# Examples

Status: examples
Audience: operators, developers

## Purpose

This section holds safe, source-backed examples for values, secret templates, swarm config, and progress JSON. Examples are starting points, not production defaults.

## Example Sets

- [Values](values/README.md) for local/dev and staging-like deployment shapes.
- [Secrets](secrets/README.md) for placeholder-only secret creation commands.
- [Swarm config](swarm-config/README.md) for runtime config examples.
- [Progress JSON](progress-json/README.md) for minimal success, richer end-to-end workflow, in-progress, failed, and partial artifact states.

## Verification Notes

Examples avoid real credentials. Before using one:

```bash
npm run docs:check
jq . docs/examples/progress-json/success.json
jq . docs/examples/swarm-config/local-dev.json
```

For live deployment, pair examples with the operator guides in `../deployment/` and `../operators/`.
