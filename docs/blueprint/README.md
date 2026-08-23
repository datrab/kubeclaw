# Documentation transformation blueprint

Status: approved planning baseline

This blueprint defines the complete migration from the current repository documentation to a clean, code-backed website. It does not rewrite or delete the current documentation. Deletion starts only after the migration ledger proves that current facts and durable decisions have replacement homes.

The six required artifacts are:

1. [Verified platform inventory](01-platform-inventory.md)
2. [Three-track site map](02-three-track-site-map.md)
3. [Old-document migration and deletion ledger](03-migration-and-deletion.md)
4. [Documentation-to-code evidence matrix](04-evidence-matrix.md)
5. [Decision-record catalogue](05-decision-record-catalogue.md)
6. [Automation and publication specification](06-automation-and-publication.md)

Generated proof is under [`generated/`](generated/). Run:

```bash
node scripts/docs-blueprint-generate.mjs
```

The generator fails if one of the six artifacts is missing, an existing documentation file is unclassified, a plugin manifest is not inventoried, or a contract family has no evidence-matrix entry.

## Governing rules

- The public site has three independent entrances: **Understand**, **Use**, and **Extend**.
- Each track is sufficient for its audience. Optional detail is linked, not required.
- A fact has one canonical owner. Duplication is limited to the minimum context required to complete a task.
- Current behavior, proposed behavior, and historical behavior are never mixed.
- Technical claims link to release-pinned source, contracts, configuration, or verification.
- Generated facts are not manually copied into prose.
- Operator instructions use direct technical English that a technically competent reader can understand. The publication gate applies an ASD-STE100-inspired language check.
- Implementation plans, phase audits, temporary inventories, migration bookkeeping, and internal documentation workflows are not part of the published product documentation.
- Durable reasoning is retained in concise decision records before source planning documents are removed.

## Verified baseline caveat

The generator records the repository commit and working-tree state. At blueprint creation time, unrelated work introduced unresolved conflicts in several files. Those files are not modified by this blueprint and are listed in the generated inventory. Publication must regenerate and reverify the inventory after the conflicts are resolved.
