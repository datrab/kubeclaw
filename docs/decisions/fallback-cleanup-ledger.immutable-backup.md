# Fallback Cleanup Ledger

Status: classified inventory drafted

This ledger inventories runtime fallback-like expressions under `skills/`, excluding TypeScript declaration files. It does not include test files, docs, generated reports, project fixtures, plugins, or scripts.

Exhaustive ledger: [fallback-cleanup-ledger.tsv](fallback-cleanup-ledger.tsv)

## Classification Rules Applied

- Required authority missing: fail loudly with a typed error.
- Real product default: define it once in config/schema normalization, never at random runtime callsites.
- Display placeholders such as `unknown`: do not treat as acceptable; replace with typed absence, omit the field, or fail typed.
- Dependency injection defaults: test harness or explicit composition boundary only, not runtime implementation code.
- Multiple field names: never canonical; choose one field and migrate callers.

## Scope

- Included: `skills/**/*.ts`, `skills/**/*.js`, `skills/**/*.mjs`
- Excluded: `*.d.ts`, tests, docs, scripts, plugins, project fixtures
- Patterns: `||`, `??`, `||=`, `??=`, `firstPresent(...)`

## Counts

- Ledger rows: 7035
- Rows containing `||`: 5104
- Rows containing `??`: 1858
- Rows containing logical assignment fallback: 25
- Rows containing `firstPresent(...)`: 111

## Classification Counts

- model_optional_absence_explicitly: 2629
- move_local_default_to_config_normalization_or_fail: 1766
- fail_typed_required_authority_if_missing: 1062
- keep_pure_boolean_predicate: 854
- delete_legacy_alias_choose_canonical_field: 356
- replace_placeholder_with_typed_absence: 200
- remove_runtime_dependency_injection_default: 104
- move_env_default_to_config_normalization: 29
- remove_runtime_assignment_fallback: 25
- config_schema_normalization_default: 10

## Notes

Every row has been classified from the matched expression plus nearby source context. The classification is intentionally strict: when the code is ambiguous, it is treated as required authority until a later file-level cleanup proves the value is optional or config-normalized.

The next step is implementation review by batch, not blanket editing. Start with high-authority runtime paths and commit each clean batch separately.
