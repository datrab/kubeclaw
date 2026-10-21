# Generated Reference Support

Status: generated-support
Audience: maintainers, documentation agents

## Purpose

This is an internal generator-support note, not a second reader reference.
`scripts/docs-generate.mjs` writes the generated reader pages into
`docs/site/reference/`. The [canonical reference index](../../site/reference/README.md)
links the reader reference pages. This directory does not contain a separate
published reference or reserve a second output tree.

## Regenerate and check

The general inventory command and the configuration inventory command have
separate output sets. Run the applicable inventory command before reference
rendering:

```bash
npm run docs:inventory
npm run docs:inventory:config
npm run docs:generate
```

Check the corresponding inventories and renderer without rewriting outputs:

```bash
npm run docs:inventory:check
npm run docs:inventory:config:check
npm run docs:generate:check
```

The renderer checks the source revision recorded in
`docs/generated/inventory/documentation-source-revision.json`. An inventory
update does not authorize changing that revision or claim independent content
acceptance. A source mismatch must be resolved at the owning source and revision
workflow; do not bypass it by changing generated text.

## Owned outputs and inputs

| Owner | Inputs | Outputs |
| --- | --- | --- |
| `scripts/docs-inventory.mjs` | Deployment script, secret setup script, Helm values and workflow definitions | `docs/generated/inventory/deploy-script.json`, `docs/generated/inventory/secret-setup.json`, `docs/generated/inventory/helm-values.json`, `docs/generated/inventory/workflows.json` |
| `scripts/docs-configuration-inventory.mjs` | Configuration sources, schemas and runtime consumers | `docs/generated/inventory/configuration-values.json`, `docs/generated/inventory/configuration-schemas.json`, `docs/generated/inventory/configuration-runtime-inputs.json` |
| `scripts/docs-generate.mjs` | The deploy, secret, configuration-values, configuration-schemas, configuration-runtime-inputs, platform-surfaces and workflows inventories; SDK reference generation from its source authority | The nine reader pages below and `docs/generated/inventory/sdk-reference.json` |

The reference renderer owns these reader page outputs:

- [CLI](../../site/reference/cli.md)
- [Secrets](../../site/reference/secrets.md)
- [Helm, GitOps, and infrastructure configuration](../../site/reference/helm-values.md)
- [Environment variables](../../site/reference/environment-variables.md)
- [Plugin configuration](../../site/reference/plugin-configuration.md)
- [Endpoints](../../site/reference/endpoints.md)
- [Verification commands](../../site/reference/verification-commands.md)
- [Workflows](../../site/reference/workflows.md)
- [SDK exports](../../site/reference/sdk-exports.md)

The platform-surface inventory has its own producer,
`scripts/docs-platform-surface-inventory.mjs`; it is not an output of
`npm run docs:inventory`. See the [inventory support note](../inventory/README.md)
for the inventory directory's role.

## Maintenance rules

- Do not hand-edit sections between `<!-- BEGIN GENERATED: source-backed reference -->` and `<!-- END GENERATED -->`. Correct the owning source, inventory or renderer.
- When a source changes, regenerate its affected inventory before reference rendering. Check source-revision consistency before changing the generated outputs.
- If generation fails, inspect the relevant inventory and its producer. A generated schema or table does not by itself prove runtime behavior or live acceptance.
- Keep this note aligned with the output map in `scripts/docs-generate.mjs`. Do not create duplicate reader pages here.
