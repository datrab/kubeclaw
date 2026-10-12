# Independent stage/report source review checkpoint

Root is not the inventory author. This is a partial review, not inventory, runtime or migration acceptance.

`source-schema-comparison.json` independently verifies all 583 source bytes against retained copies and recorded hashes/sizes without drift. Fresh repository enumeration matches all 48 manifests. All 21 stage registrations and the one report-adapter registration match their complete actual declarations, module paths and raw config schemas. The stage schemas contain 49 top-level field occurrences.

`nested-schema-comparison.json` independently derives all 273 nested field occurrences from the actual schemas, following arrays, local references and conditional/composition branches. Field paths, schema pointers, containing-object required membership and complete field schemas match without missing, extra or differing entries. This is not proof of actual consumer behavior; the full semantic review remains pending.

Direct inspection of `skills/buster/engine/test-gates/specialist-report-finalization.ts` confirms the report policy's real author: the 16 MiB aggregate result limit, source-byte derivation bounded at 64 MiB, 5000/5000/100 detail limits, timeout capped at 300000 ms and cleanup time, 512 MiB memory, CPU rounding with a 1000 ms minimum, and 64 descriptors. The finalizer checks pinned adapter ID/format/contract/package and the declared report's retained evidence before invoking it. It checks serialized aggregate bytes both before and after adding each result. Those controls are distinct from individual adapter output limits.

This confirms that the JUnit registration's absence of a config schema does not mean it has no configurable execution policy. The finalizer is a concrete remaining code author to migrate into the central Buster execution policy. This source observation does not prove runtime sandbox enforcement or resolve the remaining report-parser capacities.

## Stage consumer checks and an additional Core author

Direct inspection confirms that `validateRuntimeRegistrationConfiguration` checks enabled stage ownership and calls the non-default-applying schema validator. `stage-executor.ts` passes `definition.config` and `definition.input` separately into the invocation. The following concrete consumers match the inventory:

- Human approval explicitly supplies the 60-minute fallback in `parseApprovalConfig`, checks safe-integer bounds, and computes the expiry from the selected value. Merely deleting its schema default would leave the code author intact.
- The Buster quality gate uses `testAgentEnabled !== false`, executes the native test plan and stores the decision before the disabled-evaluator return. Disabling evaluation does not bypass the test plan. This is a code-derived boolean default, regardless of the unused schema default.
- Both lint stages share `execute`, pass required policy path/project, and convert the two optional toggles with `=== true`. They invoke `lint.execute`; they do not acquire additional filesystem authority merely by naming a path.

An additional migration entry is needed in the stage inventory: `stage-executor.ts` authors the invocation lease's `memoryBytes` as 512 MiB. Wall time and CPU milliseconds derive from `definition.execution.timeoutMs`, but memory does not. This is a Core execution-policy author, not one of the 49 plugin schema fields and not the unrelated 512 MiB report-adapter child budget. The source observation establishes the lease value only; actual process/kernel enforcement must be traced and tested separately. Assign this to the central Core/Engine policy migration and preserve historical invocation semantics.
