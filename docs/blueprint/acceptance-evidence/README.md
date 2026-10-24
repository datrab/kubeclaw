# AP09 acceptance evidence

This directory is the only permitted location for the final AP09 evidence
bundle. Keep it empty until the documentation revision is frozen and the
acceptance runs start. The later bundle contains the ledger, reviewer reports,
command logs, reader observations, render results, and mutation results.

Files here are verification records. They are not part of the reader site and
must not be used as a prerequisite for a task in `docs/site`.


## Reviewed dependency aggregate checkpoint — 2026-10-24

Source: `c0d892fb2ea7f88994e53ea29de0fdce2d87d89e`. Adds the supported deterministic `plugin-dependency-aggregate.json` generator, reusable complete native report and local raw schema/reference closure; no schema-fragment semantics, runtime grant, operational owner or DATA qualification is inferred. Mandatory fresh inventory and ownership assertions are retained. New schema keyword coverage includes `contentSchema` and `$recursiveRef`; resolution remains local/contained.

Exactly 31 existing acceptance scopes are preserved, not accepted anew. All original summaries, limits, review verdicts, historical checks and other 67 records remain unchanged; only reviewed revision and append-only check/impact/history metadata change. Stored acceptance remains 58/89 gates and 225/261 requirements. Full original scope vectors and complete original contracts were supplied losslessly; each semantic review used one complete pass, pinned upstream `fe588b1a6267eb47f785d0c748db9f6f3e9a3b4f`, Codex `gpt-5.6-terra`, high, P2. Reviewer tools/tests were not used to claim checkout inspection or fresh practical exercises.

| Group | Original records | Verdict SHA-256 | Result |
| --- | ---: | --- | --- |
| extension | 1 | `0f9fc69917ce5a770fc7b85ec555d54f3de7e5188c92142caa8448c3b9c6358d` | Independent clean |
| publication-a | 10 | `a19cd46fa5c7887134b20b62c13a51e4a0a8d3438f012b8db14fbaad6b55b6b8` | Independent clean |
| publication-b1 | 5 | `29155bf2c9badef9fb5adf7a290de97bd2946281b95ee7118f7fc6f9b605b4c8` | Independent clean |
| publication-b2-corrected | 5 | `574675edccd1abcad1e0d2181f3cd710babfae89bd617a79be3627bd40989151` | Independent clean |
| publication-c1 | 5 | `cef5d53936312824d2884b6f7a12ab9d4beed0900f8202a59745c9bf210e7282` | Independent clean |
| publication-c2 | 5 | `a19cd46fa5c7887134b20b62c13a51e4a0a8d3438f012b8db14fbaad6b55b6b8` | Independent clean |

Actual committed Reader:177canonical/187HTML,241outputdigests,40887localLinks;12searchquestions;15062verifiedSourceLinks/4082objects;435previewboxes/2000excerpts/1070objects;28deterministicSVGs. All six separate original commands pass. Supported aggregate drift check and ownership checker pass. Reused unchanged reviewed Source156controls/original110role guards and exact106native/193ordinary/1252selected/1009caller finite-vector reconstruction;28preexisting ordinary mismatches remain.

The actual unchanged original receiver terminates at **`API_PRODUCT_SCRIPT_OUTPUT_ROLE_UNQUALIFIED: skills/buster/engine/test-gates/artifacts.ts:41: content`**. All five DATA slots remain UNKNOWN. Knip/release, live/runtime, human/screenreader and independent participant limits remain; no new A910-05 or whole-PR acceptance.

Initial B2 P1 claimed the ownership export contaminates the JSON report. Rejected with actual execution: `docs-publication.mjs dependency-authority-report` returns one valid JSON document with51packages; publication does not import ownership. Only the aggregate CLI imports it deliberately to run the required assertions, and acquires JSON through a separate child. Complete missing producer/consumer sources and actual report proof supplied; corrected independent B2 review clean. No code changed or gate waived. Initial missing scanner/executable/default-auth and oversized raw-log attempts are retained outside repository; existing main-agent authenticated Codex home recovered execution.

Exact command pattern: `CODEX_HOME=<existing-main-agent-codex-home> PATH=<installed-trufflehog>:$PATH bash <autoreview-terra>/scripts/run-autoreview.sh --mode local --codex-bin /app/extensions/codex/node_modules/.bin/codex --max-priority P2 --json-output <operations-verdict>`, executed on six explicit source-only snapshots, not clean local diff. Complete verdicts/manifests/raw logs/failure dispositions/full vectors: operations evidence `pr13/evidence/a91005-20261024/aggregate-2011/`; original Source and finite qualification reviews remain in `aggregate-1931/`.
