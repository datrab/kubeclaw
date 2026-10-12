# Independent RuntimeSecurity V2 source review

Decision: changes required before integration. All 23 frozen candidate and before hashes match manifest SHA-256 `1904280df6c9df66847e04b61d7de36736e39359929ae45dc4139e959615dfe3`. No tests, commands against the candidate, integration or live changes were performed.

The authority migration and early constructor capture are straightforward. The intentional output-limit causal fix is explicit and preserves the selected failure cause. The existing security assertions were retained. New tests use genuine child processes with delegated spawn and explicit close observations; they do not prove production process ownership.

One source correction is required: RuntimeSecurity prefix validation borrows a 42-character limit despite not generating namespaces. A 50-character prefix with its legal 52-character namespace previously matched. The DNS-label regex also rejects a trailing-hyphen prefix that can match a valid namespace under the unchanged `prefix + '-'` relation. Derive validation from the actual inspection contract and preserve valid namespace selection, with regression tests and DOC changes.

Two evidence gaps remain: actual service execution through the production runtime loader (already honestly disclosed), and a newly loaded consumer proving changed file bytes take effect as the positive counterpart to old-generation capture. Helper composition and an old consumer remaining unchanged cannot replace those checks.

The prepared nine mutation specifications and all positive/original scopes remain unexecuted. This review is not local implementation acceptance or closure of CONFIG/any original finding. The exact references and remaining checks are in `source-review-v2.json`.
