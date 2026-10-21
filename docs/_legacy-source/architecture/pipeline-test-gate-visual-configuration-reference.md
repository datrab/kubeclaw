# Visual Regression Configuration Reference

## Node fields

| Field | Owner | Type | Default | Bounds and failure |
|---|---|---|---|---|
| `manifestFile` | project | repository-relative string | none | Required; regular file inside repository; max 1 MiB document |
| `profileFile` | project | repository-relative string | none | Required; strict `kubeclaw.browser-profiles.v1` document |
| `targets` | project | unique string array | none | 1–64 explicit manifest IDs |
| `comparisonProfile` | project | enum | `strict-v1` | `strict-v1` or `balanced-v1` |
| `overrides.maximumDifferencePercent` | project | number | profile value | 0–100 percent |
| `overrides.pixelThreshold` | project | number | profile value | 0–1 Pixelmatch threshold |
| `overrides.uncertaintyMarginPercent` | project | number | profile value | 0–100 percent; uncertainty still fails without review |
| `masks` | project | target/selector records | empty | At most 64 targets and 32 unique selectors per target |
| `masks.target` | project | target ID | none | Must select one configured target; one mask record per target |
| `masks.selectors` | project | unique CSS selector array | none | 1–32 values, each 1–512 characters |
| `timeoutMs` | project within operator maximum | integer | 30000 | 1000–120000 ms |
| `endpointName` | project | identifier | first endpoint | Selects one typed deployment endpoint |
| `url` | project only when no fixture input exists | HTTP(S) origin | none | Mutually exclusive with fixture inputs |

## Manifest identity

Each entry requires `id`, `route`, `profile`, `baselineFile`, `sha256`, `browser`, `viewport`, and `pageConditions`. Page conditions record color scheme, reduced motion, locale, time zone, scale factor, touch, mobile mode, and full-page capture. Unknown fields fail.

## Operator fields

`allowedOrigins` and `allowedBrowsers` define authority. `browserExecutables` pins engine paths. `maximumCombinations`, `maximumConcurrency`, `maximumExecutionMs`, `maximumResultBytes`, `maximumScreenshotBytes`, and `maximumMasksPerCombination` are mandatory bounded runtime limits.

## Example

See `contracts/pipeline-test-gate/v1/examples/visual-config.json`, `visual-baselines.json`, and `browser-profiles.json`.
