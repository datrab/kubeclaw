# Pipeline Runtime Packaging Phase 5.6-A Audit

Status: complete

## Purpose

Phase 5.6-A classifies the current runtime source before files move.

## Result

The inventory defines four owners:

- Shared packages have no role authority.
- Nova packages own orchestration and pipeline policy.
- Worker packages own one neutral attempt lifecycle.
- Buster packages own test execution meaning.

Every package under `skills/common/plugins` records its current role list. The
proof builds the current Nova and Buster archives and checks their real
contents. Target plugin selection starts in Phase 5.6-C, where role manifests
can prove it. A plugin has one source even when more than one role installs it.

Every file in the mixed core has one owner or one removal action. The proof
also follows local imports and rejects forbidden owner dependencies.
It checks package-manifest dependencies against the same rules.

The dependency rules are:

- Shared code can depend only on shared code.
- Nova can depend on shared and Nova code.
- Worker can depend on shared and worker code.
- Buster can depend on shared, worker, and Buster code.

## Proof

Run:

```bash
node scripts/check-runtime-package-ownership.mjs
```

The check rejects missing sources, duplicate package IDs, unclassified shared
plugins, plugins with no consuming role, and invalid ownership classes.
It also verifies each declared package against the current role archives.

Independent review used Codex `gpt-5.6-terra` with high reasoning. Six review passes
found issues in the new proof. All accepted findings were fixed. The final
review was clean.

## Next Step

Phase 5.6-B moves the mixed core into real source packages. It moves code. It
does not copy implementations.
