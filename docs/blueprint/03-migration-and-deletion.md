# 3. Old-document migration and deletion ledger

## Exhaustive ledger

The row-level ledger is generated at [generated/migration-ledger.csv](generated/migration-ledger.csv). Its summary is [generated/migration-ledger-summary.md](generated/migration-ledger-summary.md).

Every file currently under `docs/`, excluding this blueprint, receives exactly one disposition and replacement destination. The generator fails if a file is left with the generic `review` disposition.

## Allowed dispositions

| Disposition | Meaning |
| --- | --- |
| `rewrite-and-keep` | The subject remains public, but the page is replaced with a source-backed page in the new structure. |
| `merge-into-operator-track` | Deployment material becomes task-oriented operator documentation. |
| `replace-with-generated-reference` | Mechanical facts are generated from code; authored text only explains use and boundaries. |
| `split-rewrite-then-delete` | Mixed architecture/design material is split into current documentation, decisions, and clearly labeled proposals; the old mixed page is then removed. |
| `extract-then-delete` | Current facts and durable reasoning are extracted; phase/audit/plan bookkeeping is deleted. |
| `extract-decisions-then-delete` | Durable decisions are promoted to concise decision records; the old ledger is removed from product docs. |
| `replace-then-delete` | SVG content is replaced by accessible responsive HTML before the source vector is removed. |
| `internal-only` | Tooling or contributor workflow remains in the repository but is excluded from publication. |
| `regenerate-internal` | Raw generated inventory remains build input/output, not a navigable public page. |
| `move-out-of-product-docs` | Planning or project governance is retained outside current product documentation. |
| `keep-and-verify` | A useful example remains only after schema, compilation, or execution verification. |

## Extraction procedure

For each old page:

1. Split statements into current fact, durable decision, proposal, historical result, procedure, or obsolete claim.
2. Verify current facts against the evidence hierarchy in artifact 1.
3. Place each fact in its canonical track or generated reference owner.
4. Convert durable reasoning into a decision record from artifact 5.
5. Put proposals in an explicitly designed/not-implemented location or project planning outside product docs.
6. Rewrite procedures as verified operator or developer tasks.
7. Migrate incoming links.
8. Update the ledger’s completion proof with destination URLs, source/test evidence, and verification command.
9. Delete the old page only when the deletion gate passes.

## Deletion gate

Deletion requires all of these conditions:

- The ledger row names a final destination.
- Every current claim has implementation or contract evidence.
- Every durable decision has a decision-record disposition.
- Every useful example is retained and verified.
- Every incoming link has a valid replacement.
- No published navigation points to the old page.
- Search has indexed the replacement.
- The documentation coverage check passes after deletion.
- The change is reviewed as a documentation migration, not a bulk cleanup.

“Archived just in case” is not the default. Git retains history. A separate archive is justified only for legally, operationally, or historically necessary material and must remain outside published navigation.

## Content specifically removed from the public site

- Phase-by-phase audits and closeouts.
- Implementation plans and completion checklists.
- Temporary baselines and migration roadmaps.
- Internal topic maps, generator notes, and author templates.
- Raw generated JSON inventories.
- Superseded SVG diagrams.
- Duplicate pages whose canonical content has moved.
- Stale claims that cannot be proved from current code.

## Decision preservation

Deletion never erases useful reasoning. The decision catalogue identifies which mixed documents contain durable choices, the target record, current status, and code/test evidence. Historical sequence, task lists, temporary phase names, and “next step” text are not copied into decision records unless they explain a lasting constraint.

## Completion proof

The generated completeness report must show that every existing documentation file is classified. Actual deletion is a later migration phase; the blueprint deliberately performs no deletion while unrelated work and merge conflicts exist.
