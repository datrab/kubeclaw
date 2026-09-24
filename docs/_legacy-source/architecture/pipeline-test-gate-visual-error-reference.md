# Visual Regression Error Reference

| Error family | Meaning and effect | Retry guidance | Evidence |
|---|---|---|---|
| `VISUAL_CONFIG_*` | Node configuration is invalid; execution stops | Fix reviewed pipeline data | Runner log |
| `VISUAL_MANIFEST_*` | Manifest shape, size, or path is invalid; execution stops | Fix the manifest | Runner log |
| `VISUAL_BASELINE_DIGEST_MISMATCH` | PNG bytes do not match the entry | Regenerate and review the baseline commit | Runner log |
| `VISUAL_BASELINE_BUNDLE_DIGEST_MISMATCH` | The baseline set does not match the manifest | Update the bundle digest with all reviewed PNGs | Runner log |
| `VISUAL_BASELINE_IDENTITY_MISMATCH` | Route or rendering identity differs | Create a reviewed baseline for the selected profile | Runner log |
| `BROWSER_VISUAL_ORIGIN_DENIED` | Target origin is not authorized | Fix fixture wiring or operator policy; do not widen project authority | Runner log |
| `BROWSER_VISUAL_SUBRESOURCE_ORIGIN_DENIED` | The page attempted disallowed egress | Remove the dependency or approve an architecture change | Runner log |
| `BROWSER_VISUAL_*_EXCEEDED` | Operator time, count, or byte limit was exceeded | Reduce scope or review operator limits | Runner log and retained prior evidence |
| `visual-difference` | Pixel difference exceeds policy; test fails | Inspect baseline/current/difference evidence | Three PNG files and JSON report |
| `visual-difference-uncertain` | Difference is in the uncertainty band; blocking test fails safely | Use the separate approved review workflow if enabled | Three PNG files and JSON report |

## Exact code index

Configuration and identity: `VISUAL_CONFIG_INVALID`, `VISUAL_WORKSPACE_INVALID`, `VISUAL_PROFILE_FILE_INVALID`, `VISUAL_PROFILE_INVALID`, `VISUAL_MANIFEST_INVALID`, `VISUAL_BASELINE_FILE_DENIED`, `VISUAL_BASELINE_BYTES_EXCEEDED`, `VISUAL_BASELINE_DECODED_IMAGE_LIMIT_EXCEEDED`, `VISUAL_BASELINE_PNG_INVALID`, `VISUAL_CAPABILITY_RESULT_INVALID`, `VISUAL_COMPARISON_PROFILE_INVALID`, `VISUAL_COMPARISON_OVERRIDE_INVALID`, `VISUAL_EVIDENCE_BYTES_EXCEEDED`, `VISUAL_EVIDENCE_FILE_LIMIT_EXCEEDED`, `VISUAL_MASK_INVALID`, `VISUAL_TARGETS_INVALID`, `VISUAL_TARGET_NOT_FOUND`, `VISUAL_TARGET_REQUIRED`, `VISUAL_TARGET_INVALID`, `VISUAL_TARGET_AMBIGUOUS`, `VISUAL_ENDPOINT_NOT_FOUND`, `VISUAL_INPUT_UNKNOWN`, and `VISUAL_INPUT_INVALID`.

Browser policy and execution: `BROWSER_VISUAL_BROWSER_DENIED`, `BROWSER_VISUAL_BROWSER_POLICY_INVALID`, `BROWSER_VISUAL_CANCELLED`, `BROWSER_VISUAL_CAPTURE_INVALID`, `BROWSER_VISUAL_COMBINATION_INVALID`, `BROWSER_VISUAL_COMBINATION_LIMIT_EXCEEDED`, `BROWSER_VISUAL_COMBINATION_LIMIT_INVALID`, `BROWSER_VISUAL_COMPARE_INVALID`, `BROWSER_VISUAL_CONCURRENCY_INVALID`, `BROWSER_VISUAL_DECODED_IMAGE_LIMIT_EXCEEDED`, `BROWSER_VISUAL_MASK_INVALID`, `BROWSER_VISUAL_MASK_LIMIT_INVALID`, `BROWSER_VISUAL_OPERATION_DENIED`, `BROWSER_VISUAL_ORIGIN_INVALID`, `BROWSER_VISUAL_PROFILE_INVALID`, `BROWSER_VISUAL_REQUEST_INVALID`, `BROWSER_VISUAL_RESOURCE_INVALID`, `BROWSER_VISUAL_RESULT_BYTES_EXCEEDED`, `BROWSER_VISUAL_RESULT_LIMIT_INVALID`, `BROWSER_VISUAL_SCREENSHOT_BYTES_EXCEEDED`, `BROWSER_VISUAL_SCREENSHOT_LIMIT_INVALID`, `BROWSER_VISUAL_TIMEOUT_EXCEEDED`, and `BROWSER_VISUAL_TIMEOUT_INVALID`.

Project migration: `LEGACY_VISUAL_CONFIGURATION_RETIRED`.
