# Examples

Status: examples
Audience: operators, developers

## Purpose

This section holds safe, source-backed examples for values, secret templates, swarm config, and progress JSON. Examples are starting points, not production defaults.

Use examples when you need a concrete shape to adapt, review, or compare against live state. Do not treat examples as authoritative defaults; the source of truth remains `scripts/deploy.sh`, `my-values/setup-secrets.sh`, `charts/kubeclaw/`, `charts/kubeclaw/files/config/swarm.config.json`, and project `.swarm/progress.json`.

## Example Sets

| Example set | Use when | Source to compare | Verification |
| --- | --- | --- | --- |
| [Values](values/README.md) | choosing local/dev or staging-like deployment flags before using `scripts/deploy.sh` | `scripts/deploy.sh`; `charts/kubeclaw/values.yaml`; `my-values/nova-values.yaml`; `my-values/buster-values.yaml`; `my-values/infra/*.yaml` | deployment truth and Helm render |
| [Secrets](secrets/README.md) | seeing placeholder-only Secret creation commands or reviewing required Secret names/keys | `my-values/setup-secrets.sh`; `charts/kubeclaw/templates/secret.yaml`; `charts/kubeclaw/templates/deployment.yaml` | `npm run docs:inventory:check`; live `kubectl get secret` |
| [Swarm config](swarm-config/README.md) | comparing compact platform config examples to the current standard profile | `charts/kubeclaw/files/config/swarm.config.json`; `skills/nova/pipeline/core/config-profiles/standard.json`; `skills/nova/pipeline/core/config.ts`; `skills/nova/pipeline/core/registry.ts` | JSON validation and config registry tests |
| [Progress JSON](progress-json/README.md) | understanding project workflow shape and runtime status examples | `skills/nova/pipeline/core/config.ts`; `skills/nova/pipeline/runners/*.ts`; `skills/nova/pipeline/services/status-store.ts` | pipeline behavior and status-store checks |

## Verification Notes

Examples avoid real credentials. Before using one:

```bash
npm run docs:check
jq . docs/examples/progress-json/success.json
jq . docs/examples/swarm-config/local-dev.json
jq . docs/examples/swarm-config/staging-like.json
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

For live deployment, pair examples with the operator guides in `../deployment/` and `../operators/`.

## Failure Signals

- `jq` failure means the example is not valid JSON and should not be copied into a runtime config or project `.swarm` file.
- Deployment truth failure means values or secret examples may no longer match scripts, chart templates, or expected resources.
- A missing Secret or missing key in live `kubectl get secret ... -o jsonpath=...` output means the example is incomplete for the selected deployment shape.
- A progress example that passes JSON validation can still be wrong for a real project if `project`, `execution_order`, module directories, gates, app commands, ports, or suite config do not match the actual repo.

## Rule

Never commit real credentials in examples. Keep credential material as placeholders and use Kubernetes Secrets plus `my-values/setup-secrets.sh` for live setup.
