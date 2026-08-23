# Size-Budget Error Reference

Status: current

Each error fails the current attempt unless the runner records cancellation.
Correct immutable input or configuration before retry.

| Code | Cause | Effect | Correction | Retry | Evidence |
| --- | --- | --- | --- | --- | --- |
| `SIZE_BUDGET_CONFIG_INVALID` | Configuration has an invalid object, format, or largest-file count. | Measurement does not start. | Use the documented schema. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_LIMIT_INVALID` | A byte or percentage limit is invalid. | Measurement does not start. | Use a finite nonnegative value in range. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_MATCHING_FILES_INVALID` | The matching-file list is not an array or exceeds 32 rules. | Measurement does not start. | Use a bounded rule array. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_RULE_ID_INVALID` | A rule identifier is unsafe or duplicated. | Measurement does not start. | Use one unique stable identifier. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_PATTERN_INVALID` | A pattern is empty, oversized, or invalid. | Measurement does not start. | Use a bounded glob pattern. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_BLOCKING_LIMIT_REQUIRED` | A blocking node declares no limit. | The attempt errors. | Add one limit or use advisory mode. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_INPUT_REQUIRED` | The `build-output` input is absent. | The attempt errors. | Add a typed artifact link. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_INPUT_DUPLICATE` | An input name appears more than once. | The attempt errors. | Keep one link for each input. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_INPUT_INVALID` | An input is not an artifact. | The attempt errors. | Link an artifact output. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_INPUT_UNKNOWN` | The node supplies an unsupported input name. | The attempt errors. | Use `build-output` or `baseline`. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_INPUT_URL_INVALID` | An artifact URL is not local. | The attempt errors. | Use runner-managed artifact storage. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_INPUT_SIZE_INVALID` | Declared input size is invalid or exceeds 512 MiB. | The attempt errors. | Produce a bounded artifact. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_INPUT_SIZE_MISMATCH` | Stored bytes differ from declared size. | The attempt errors. | Repair artifact storage or producer output. | Do not retry unchanged input. | Attempt result. |
| `SIZE_BUDGET_INPUT_DIGEST_MISMATCH` | Stored bytes differ from the declared digest. | The attempt errors. | Investigate artifact integrity. | Do not retry unchanged input. | Attempt result. |
| `SIZE_BUDGET_INPUT_MEDIA_TYPE_INVALID` | The input media type is unsupported. | The attempt errors. | Produce a supported artifact type. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_FORMAT_MISMATCH` | Configured format conflicts with media type. | The attempt errors. | Use `auto` or the matching format. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_ARCHIVE_INVALID` | A USTAR numeric field is invalid. | The attempt errors. | Recreate the USTAR archive. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_ARCHIVE_CHECKSUM_INVALID` | A USTAR header checksum is wrong. | The attempt errors. | Recreate or repair the artifact. | Do not retry unchanged input. | Attempt result. |
| `SIZE_BUDGET_ARCHIVE_PATH_INVALID` | An archive path is unsafe. | The attempt errors. | Remove absolute paths, traversal, and empty segments. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_ARCHIVE_DUPLICATE` | Two archive entries use the same path. | The attempt errors. | Create one entry per path. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_ARCHIVE_ENTRY_DENIED` | The archive contains a link, device, or unsupported record. | The attempt errors. | Create a strict USTAR archive with files and directories. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_ARCHIVE_FILE_LIMIT` | The archive exceeds 100,000 files. | The attempt errors. | Split or reduce the artifact. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_ARCHIVE_EXPANDED_LIMIT` | The expanded stream exceeds 2 GiB. | The attempt errors. | Split or reduce the artifact. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_ARCHIVE_TRAILING_DATA` | Nonzero data follows the archive terminator. | The attempt errors. | Recreate the archive. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_ARCHIVE_TRUNCATED` | The archive ends before a complete terminator or file block. | The attempt errors. | Recreate or retransmit the artifact. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_TOTAL_LIMIT` | Measured bytes exceed the internal safe bound. | The attempt errors. | Split or reduce the artifact. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_BASELINE_REQUIRED` | A growth limit has no baseline input. | The attempt errors. | Link a prior baseline artifact. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_BASELINE_MEDIA_TYPE_INVALID` | The baseline media type is wrong. | The attempt errors. | Link the provider baseline output. | Retry after correction. | Attempt result. |
| `SIZE_BUDGET_BASELINE_INVALID` | Baseline JSON or fields are invalid. | The attempt errors. | Use an intact typed baseline. | Do not retry unchanged input. | Attempt result. |
| `SIZE_BUDGET_BASELINE_OUTPUT_LIMIT` | Generated baseline evidence exceeds its fixed limit. | The attempt errors. | Report a provider defect. | Do not retry unchanged input. | Attempt result. |
| `SIZE_BUDGET_EVIDENCE_PATH_DENIED` | Evidence path leaves the private workspace. | The attempt errors. | Fix the runner workspace contract. | Do not retry unchanged input. | Attempt result. |
| `SIZE_BUDGET_CANCELLED` | Nova or the runner cancels archive reading. | The attempt is cancelled. | Inspect the cancellation source. | Retry only when policy requests it. | Attempt result and events. |
