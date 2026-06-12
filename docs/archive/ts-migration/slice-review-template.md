# Slice Review Template

Use this checklist for every TypeScript migration slice. Fill it in before committing the slice so reviewers can see the runtime boundary, authority decisions, fallback-ledger impact, and validation evidence without re-reading the whole migration map.

```text
Slice:
Phase/batch:
Files read/migrated:
Runtime entrypoints affected:
Incoming callers:
Outgoing dependencies:
Dynamic imports:
Exported symbols:
Canonical authority used:
Fallback/legacy/shim hits found:
Fallback-ledger rows resolved:
  - DELETE_LEGACY:
  - STRICTIFY_TS_SLICE:
  - KEEP_TYPED_POLICY:
  - external adapter/facade:
Deleted legacy behavior:
Behavior invariants preserved:
Simplifications/optimizations:
Node type stripping compatibility:
  - explicit .ts/.js relative imports:
  - import type for type-only imports:
  - no enums/runtime namespaces/parameter properties/decorators/path aliases:
Typecheck command:
Tests/checks run:
Docs updated:
Deleted files:
Open questions:
```

Minimum rule: do not merge a migrated slice with unresolved `needs user decision` or `rename as canonical` ledger language. Resolve the row as `DELETE_LEGACY`, `STRICTIFY_TS_SLICE`, `KEEP_TYPED_POLICY`, or an explicit external adapter/facade decision before implementation lands.
