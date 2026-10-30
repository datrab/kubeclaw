# Common error catalogue

Status: generated source-backed reference
Audience: operator, developer, maintainer
Owner: documentation automation
Evidence: docs/config/common-error-catalogue.json; scripts/docs-common-error-catalogue.mjs
Applies to: current workspace-owned diagnostic families; source-bound descriptions, not execution evidence
Last verified: generation checks the declared source digests

<!-- BEGIN GENERATED: common error catalogue -->

Use the exact code, constructor or message text to search this catalogue. Start with the first owning boundary, not the last wrapper error.

Current workspace-owned runtime and operator-facing failure families. Messages, typed codes, returned reasons, exit/status translations and control outcomes remain distinct. This is not a finite list of arbitrary dependency messages or every data-dependent detail. Documentation-tool internals and test-fixture assertions are not runtime failure families.

## Choose the owning component

| Component | Diagnostic families |
| --- | --- |
| [Foundation, plugins and shared contracts](common-errors-foundation.md) | 22 |
| [Nova projects and review](common-errors-nova.md) | 31 |
| [Worker processes, resources and isolation](common-errors-worker.md) | 30 |
| [Prism, storage, backup and browser operations](common-errors-prism.md) | 45 |
| [Ops and platform services](common-errors-platform.md) | 23 |
| [Helm rendering and configuration](common-errors-configuration.md) | 22 |

## Use a diagnostic safely

1. Preserve the first diagnostic, cause chain, target and run/attempt identity. Remove credentials before sharing evidence.
2. Check the representation: an exception message, typed code, returned reason, HTTP status and process exit are different fields. A control outcome is not necessarily a failure.
3. Read the trigger and effect together. A timeout or failed acknowledgement does not prove that the external action did not occur.
4. Follow the owning retry and reconciliation rule. Do not bypass trust, claims, replay protection or unresolved cleanup to clear an error.

## Scope and maintenance

Representative owning and consuming source links; not an exhaustive call graph. A source match does not prove execution or safe retry.

Source examples are representative construction sites, not an exhaustive vocabulary or evidence that an operation ran. Dependency messages and data-dependent suffixes can vary. Family counts describe this index, not acceptance criteria.

The catalogue data contains the maintained meaning and source bindings. Run `node scripts/docs-common-error-catalogue.mjs` to render it and `node scripts/docs-common-error-catalogue.mjs --check` to check output and declared source drift. A source change requires checking its actual meaning before updating a binding.

For existing detailed procedures, use [diagnostic routing](errors.md), [configuration errors](configuration-errors.md), [Buster error codes](buster-error-codes.md), and [diagnosis](../use/diagnose.md).

<!-- END GENERATED: common error catalogue -->
