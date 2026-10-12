# Independent source review checkpoint

Reviewer: root, not the inventory author. This is a partial source review, not acceptance of the inventory or a configuration migration.

`source-schema-comparison.json` independently compares all 284 recorded source files with both their retained copies and SHA-256/byte identities: no drift. A fresh `rg --files skills -g plugin.json` enumeration matches the complete 48-entry roster. All 19 registrations match their actual manifest identities and complete raw config schemas; those schemas contain 116 top-level properties.

`nested-schema-comparison.json` independently derives properties through arrays, local references and conditional/composition branches from the actual schema files. All 211 field occurrences match the inventory's exact field path, schema pointer, containing-object required membership and complete schema value; no missing, extra or different entries were found. All 22 default occurrences are retained. Boolean schemas are compared without conversion. The first checker attempt failed while counting defaults in a boolean schema; `nested-checker-initial-error.txt` preserves that reviewer error and its correction. This is a source comparison, not proof of runtime behavior for every conditional branch. Semantic consumer review remains incomplete.

Direct source inspection confirms the important ownership chain:

- `skills/nova/core/test-gates/resolver.ts`, `expandNodes`: merges declaration config and matrix variation, resolves it, and stores the result in the resolved node. Requested timeout is checked against the supplied resolver policy. Retry and blocking-mode code defaults remain present.
- `skills/common/plugin-runtime/foundation/registry/configuration.ts`, `resolveTestProviderConfiguration`: uses the captured registration schema and records contract ID and schema digest with resolved values.
- `skills/common/plugin-runtime/foundation/registry/schema.ts`: normal validation compiles with defaults disabled; resolution clones the input and validates with defaults enabled. These are materially different paths.
- `skills/buster/engine/test-gates/runner.ts`: the invocation receives `node.configuration`, rather than resolving the provider again against today's operator settings.

Consequently migration must make new configurations explicit while preserving the identity and interpretation of retained plans. Classifying a value as a request default or versioned acceptance policy does not exempt a configurable fallback from D17. The final design must specify its authoritative file and historical behavior, rather than silently leaving a second code authority.

No runtime process, provider execution, typecheck, or migration acceptance is claimed by these source comparisons.

## Consumer findings requiring inventory correction

Direct inspection of the HTTP, Tailscale exposure and coverage providers confirms the request-to-capability distinction and the documented timeout capping in HTTP/exposure. It also identifies two documentation gaps; the inventory author has been asked to correct them with additive source bindings:

- HTTP `result()` accepts status codes 200–299 when `expectedStatuses` is omitted. The HTTP table currently describes optional assertions becoming null but omits this real default acceptance rule; `code-authorities.json` also omits the status-range expression. Moving method/time/byte defaults alone would leave this semantic author unaccounted for. Its migration must preserve recorded plan interpretation, not silently substitute today's defaults.
- Coverage has a 64 MiB per-input LCOV parser limit and a two-million DA-record limit. The report's coverage row should state both. `execute()` calls `fs.readFileSync` before `parseLcov` checks bytes, so the parser limit is not a demonstrated pre-allocation file-read bound. Exact size/digest checks do not change that ordering. The inventory must distinguish these limits from requested coverage percentages and avoid claiming bounded I/O from the parser check alone.

`source-occurrences.json` additionally checks all 1,449 recorded field-source references (634 distinct source lines) against actual files without mismatch. This establishes citation accuracy only; it does not turn lexical matches into semantic coverage.

The author's semantic correction now accurately states both findings in the report. `semantic-correction-review.json` retains the exact report diff and confirms that the other 283 originally bound sources remain unchanged and all original machine-authority entries are preserved. A small remaining machine-index issue was returned: the appended 64 MiB classification also labels the separate DA-record constant and a blank line. The report correction is supported; the appended expression labels need precision before inventory acceptance.

Follow-up: `code-authorities-v3.json` now labels the DA-record constant correctly and removes the blank-line/function-header additions. Root checked every added expression against its actual source line and confirmed that the full original authority list remains an unchanged prefix. These two review findings are resolved at the source-inventory level; the remaining semantic review and migration are still open.
