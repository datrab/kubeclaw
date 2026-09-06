# Nova project runtime

`nova-project.v1` is a product-level input compiled into the existing v2 lifecycle graph. Its compiler and launcher ship in Nova's role bundle as `@kubeclaw/nova-project`; the lifecycle core does not own module stage names. Buster continues to own provider execution. Nova's existing quality stage orchestrates the verified remote decision and subsequent evaluator dispatch.

## Commands

```sh
node /app/skills/pipeline.ts --platform /path/platform.json --project /path/project.json --compile /path/new-pipeline.json
node /app/skills/pipeline.ts --platform /path/platform.json --project /path/project.json
node /app/skills/pipeline.ts --platform /path/platform.json --project /path/project.json --recover run:example
node /app/skills/pipeline.ts --platform /path/platform.json --project /path/project.json --signal /path/resume-signal.json
```

Compile validates the graph against the installed registrations, input/config schemas and capability grants without starting adapters or creating a run. It refuses to overwrite an existing output. Normal execution requires a clean repository at the declared baseline. Recovery retains the original project, resolved plans, run identity and platform configuration; immutable snapshot validation rejects drift. Explicit `--pipeline` graphs retain the existing core CLI and concurrency behavior.

## Project fields

| Field | Meaning |
|---|---|
| `schemaVersion` | Exactly `nova-project.v1` |
| `id` | Lowercase project identifier, up to 48 characters |
| `runId` | Explicit identity, matching every resolved provider plan |
| `repositoryRoot` | Absolute repository path |
| `workspaceRoot` | Absolute worktree parent outside the repository |
| `baseRevision` | Full 40-character committed Git baseline |
| `modules` | One to 128 module declarations |

Each module declares `id`, `dependsOn`, `task`, nonoverlapping repository-relative `ownedPaths`, and nonempty `requirements` containing `{id, statement}`. The module also supplies:

- `implementation`: `{agent, agentRole?}`.
- `lint`: `{policyPath, policyProject}`; policy path is absolute.
- `review`: `{agent}` using the normal blocking review profile.
- `test`: `{agent, agentRole?, providerPlan}`. The provider plan contains `repositoryId`, a complete resolved `plan`, per-node `grants`, `maximumConcurrency`, `submittedAt`, and `timeoutMs`. The compiler owns repository and source-stage selection. Neither a static revision nor caller-supplied success evidence belongs in this object.

Resolve provider plans from the real worker registry before compiling. Each plan's digest, run, project and module scope must match; at least one non-skipped blocking test is required. Compilation does not establish that the provider has executed or that its declared command is sufficient coverage.

## Scheduling and repair

Modules are sorted topologically with a stable identifier tie-break. A project uses one repository publication lane: implementation, full lint, scoped review, then native provider quality evaluation complete before another module starts. Explicit module dependencies remain in the graph. This prevents another module from advancing shared HEAD during those checks; it does not prevent changes by an unrelated process outside Nova.

Lint, review and test repair requests target their module's implementation. Existing durable repair invalidation clears later results and schedules the checks again. Provider execution selects the actual implementation artifact's verified source revision, never ambient HEAD. Review receives the declared baseline and digest-bound requirements. The quality stage persists the native decision before returning a nonpassing disposition or dispatching its evaluator.

## Acceptance and migration limits

The compiler regression uses real Git, resolved provider contracts, the installed stage registry and the extracted Nova launcher for two dependent modules. It executes zero implementation/review/test stages and is not an end-to-end agent acceptance test. The isolated-provider regression separately executes healthy and deliberately broken committed source through the real quality stage and remote adapter; its local evaluator is a deterministic source assertion, not an LLM quality claim.

This route does not yet replace the legacy project scaffold or all production E2E orchestration. Prism approval and baseline import, full verified evidence contents for repair/evaluation, final delivery manifests, automatic external-effect reconciliation and deployed acceptance remain open. Do not use compile success as evidence of those features.

Quality-stage graphs must migrate to `{gateId, task, providerPlan}`. `runId`, `attempt`, `suitePlan` and `suiteEvidence` are removed from that stage's public input: identity comes from the core lease and evidence from the verified remote import. Keep old runtime versions available to drain existing snapshots; do not rewrite historical authority using current inputs.
