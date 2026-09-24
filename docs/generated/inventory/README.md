# Generated Documentation Inventories

Status: generated-support
Audience: documentation maintainers and automation authors

## Purpose

This directory is the machine-readable bridge between the repository and the reader documentation in `docs/site`.
The generators discover facts from code, scripts, charts, manifests, schemas, workflows, and maintained deployment profiles.
The publication tools then turn those facts into stable reference pages.

Do not edit generated JSON to correct a published statement.
Correct the source parser, semantic authority, or source implementation, and regenerate the inventory.
This rule keeps the next source change from silently restoring an old error.

## Source Revision

`documentation-source-revision.json` pins every generated code link to one committed source revision.
The revision contains all cited implementation and documentation authorities.
Generated pages can be committed afterward, so their commit is intentionally different from the pinned source revision.
`scripts/docs-generate.mjs` rejects an unapproved detached source tree and rejects non-generated source changes that differ from this lock.

## Inventory Catalogue

| File | Primary source | Contents | Main reader output |
| --- | --- | --- | --- |
| `documentation-source-revision.json` | Maintainer-selected committed source revision | Immutable link and generation authority | All generated source links |
| `deploy-script.json` | `scripts/deploy.sh` | Deploy commands, cases, functions, component switches, defaults, and anchors | CLI, environment, and verification references |
| `secret-setup.json` | `my-values/setup-secrets.sh` | Secret producers, source choices, names, keys, and setup inputs | Secrets and environment references |
| `helm-values.json` | Local charts and maintained values files | Legacy concise Helm/value index retained for compatible consumers | Helm values reference |
| `workflows.json` | `.github/workflows/*.yaml` | Workflow triggers, jobs, path filters, schedules, commands, and actions | Workflow reference |
| `configuration-values.json` | Charts, values profiles, GitOps manifests, examples, and external chart authorities | Every discovered YAML leaf, type, default, required state, consumer binding, semantic authority, and blocker state | Helm values and configuration-source references |
| `configuration-schemas.json` | Plugin schemas and registered nonstandard configuration files | Schema fields, conditions, defaults, runtime contexts, consumer proofs, and semantic contracts | Plugin configuration reference |
| `configuration-runtime-inputs.json` | Runtime code, scripts, templates, manifests, CLI parsers, Secrets, and deployed policy payloads | Environment inputs, CLI flags, derived values, Secret authorities, configuration consumers, precedence, failure behavior, and delivery edges | Environment, CLI, Secrets, and plugin configuration references |
| `platform-surfaces.json` | Charts, manifests, runtime source, deployment profiles, and platform configuration | Components, endpoints, stores, events, telemetry, dependencies, ingress routes, runtime services, and optional platform systems | Endpoint, configuration-source, architecture, and operator guidance |
| `plugin-system.json` | Installed plugin manifests, registrations, schemas, and maintained plugin guidance | Plugin packages, registrations, roles, capabilities, schemas, and catalogue ownership | Plugin catalogue and operator plugin guide |
| `operator-tasks.json` | Published operator pages and their maintained command contracts | Task prerequisites, commands, success checks, failure paths, rollback, and safety links | Operator navigation and task validation |

## Generate And Check

Run these commands from the repository root:

```bash
npm run docs:inventory
npm run docs:inventory:config
npm run docs:inventory:local-helm
npm run docs:ap09:platform-inventory
npm run docs:operator-tasks:generate
npm run docs:generate
npm run docs:publication:generate
```

Use the check forms in normal development and continuous integration:

```bash
npm run docs:inventory:check
npm run docs:inventory:config:check
npm run docs:inventory:local-helm:check
npm run docs:ap09:platform-inventory:check
npm run docs:operator-tasks:check
npm run docs:generate:check
npm run docs:publication:check
npm run docs:check:refs
npm run docs:governance:check
npm run docs:site-boundary:check
```

The mutation suites prove that representative source additions, changes, and removals cannot pass with stale documentation:

```bash
npm run docs:drift:config:mutations
npm run docs:ap09:platform-drift:mutations
```

The configuration suite is intentionally broad and can take a long time because each case uses an isolated repository copy.
Use a supported focused prefix while developing one detector, and run the complete suite before acceptance.

## Published Destinations

Generated facts appear in these reader-facing locations:

- `docs/site/reference/cli.md`
- `docs/site/reference/environment-variables.md`
- `docs/site/reference/helm-values.md`
- `docs/site/reference/secrets.md`
- `docs/site/reference/plugin-configuration.md`
- `docs/site/reference/endpoints.md`
- `docs/site/reference/verification-commands.md`
- `docs/site/reference/workflows.md`
- generated matrices in `docs/site/use/plugins.md`
- generated package pages in `docs/site/extend/plugin-catalogue`

Generated sections have explicit markers.
Keep explanatory prose outside those markers unless the owning publication generator creates it.

## Failure Meaning

- A stale-inventory error means that a discovered source fact changed without regeneration.
- A semantic-gap error means that automation found a public or operator-facing setting but cannot publish a complete, source-backed explanation.
- An authority-drift error means that a schema, chart, external snapshot, or consumer proof no longer matches its locked authority.
- A publication error means that a reader page, generated matrix, catalogue page, or source link does not match the current inventories and publication rules.
- A reference error means that a local path, anchor, or pinned repository link no longer resolves.

Do not bypass a semantic or authority failure by adding generic wording.
Add the exact purpose, accepted form, required condition, default and empty behavior, invalid behavior, precedence, operational impact, failure symptom, owner, and narrow implementation evidence required by that surface.

## Coverage Boundaries

The inventories cover checked-in sources and the external chart/API snapshots that the repository explicitly locks.
They do not inspect live cluster state, unpublished container filesystems, external Secret payloads, remote service behavior, or operator choices that are absent from the repository.
Those facts require separate runtime evidence and must remain clearly marked as unexecuted until that evidence exists.

Discovery proves that a source fact is present and connected to a documented authority.
It does not by itself prove a successful installation, network connection, backup, restore, production rollout, or human approval journey.
