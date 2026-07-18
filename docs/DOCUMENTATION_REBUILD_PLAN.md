# Documentation Structure And Maintenance

Status: current
Audience: maintainers, documentation contributors

## Active Structure

- `getting-started/`: orientation and first deployment
- `concepts/`: mental models and intended extension direction
- `architecture/`: runtime components, topology, state, security, and observability
- `deployment/`: images, Helm, infrastructure, configuration, networking, storage, and verification
- `pipeline/`: scheduler, modules, gates, workers, artifacts, recovery, and real E2E contracts
- `operators/`: run, inspect, recover, maintain, and secure the platform
- `developers/`: extend and verify source-owned behavior
- `reference/`: exact operator/developer contracts
- `examples/`: safe source-backed examples
- `generated/`: checked source inventory and generated reference slices
- `decisions/`: current architecture and policy decisions
- `archive/`: historical material outside current docs authority

## Page Standard

Every active page should answer:

- Who is this for?
- What is true now?
- Which source owns the behavior?
- How is it verified?
- What fails, and what should the reader inspect next?

Procedure pages should include prerequisites, commands, expected state, failure signals, and recovery. Reference pages should prefer generated or source-linked exact fields. Architecture pages should distinguish authority, evidence, and presentation surfaces.

## Maintenance Workflow

1. Find the canonical source and focused verifier.
2. Replace stale prose instead of preserving both paths.
3. Update indexes, examples, diagrams, and generated inventory affected by the same contract.
4. Run `npm run docs:check`.
5. Run the focused runtime/deployment contract for protected claims.
6. Review the diff for duplicated facts and historical residue.

## Definition Of Done

- Active pages describe only current or explicitly planned behavior.
- Archived files are not cited as current authority.
- Exact paths, commands, values, and schemas match source.
- Links, repository references, generated inventory, and topic coverage pass.
- Current limitations are concise and unresolved only.
