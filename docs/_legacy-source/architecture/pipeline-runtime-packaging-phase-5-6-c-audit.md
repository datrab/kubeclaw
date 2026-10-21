# Pipeline Runtime Packaging Phase 5.6-C Audit

Status: complete

## Purpose

Phase 5.6-C defines the exact package and plugin set for each runtime role.

## Result

Nova selects the orchestrator packages and Nova plugins. Buster selects the
worker core, Buster engine, and Buster plugins. Both roles can select a shared
package from its one source.

Each external capability has a named source and a reason. Nova requests test
execution from Buster. Buster receives repository read access through its
read-only worker workspace.

The role proof checks package dependency closure, plugin ownership, plugin
capability closure, entrypoints, extensions, and duplicate selections.

## Proof

Run:

```bash
node scripts/check-runtime-role-manifests.mjs
```

Independent review used Codex `gpt-5.6-terra` with high reasoning. It found four
accepted validation issues. The fixes reject escaping entrypoints, duplicate
extensions, unknown internal dependencies, and undeclared external providers.
The final review was clean.

## Next Step

Phase 5.6-D builds a role bundle from these manifests. It will not copy a
whole source directory by convention.
