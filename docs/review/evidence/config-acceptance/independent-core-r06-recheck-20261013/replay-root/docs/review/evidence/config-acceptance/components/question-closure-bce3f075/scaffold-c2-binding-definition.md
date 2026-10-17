# Standalone scaffold work unit: C2 proposal only

Current `progress-scaffold.ts` parses project/repo/swarm/scaffold and apply/check/print/help, not platform or system CONFIG. Its `applyScaffold` calls `publishJsonPair` at line142; that is the only in-repository productive call. The pair is **project** `progress.json` / `pipeline.json`, not publication of system CONFIG. The library is publicly exported through `foundation/package.json` wildcard `./config/*`; external installed wrappers are an external roster input, not disproved.

`scaffold-caller-wrapper-search.log` retains all current direct references, tests, source/skill instructions and generated packaging/ESLint copies. No current registered factory or package wrapper constructs another publisher. Tests directly invoke the CLI and the public pair function; discovery reads a retained pair. Generated Chart/release strings are ESLint path exclusions, not another publisher. The CLI source is shipped as a direct Node tool, not a registered shared foundation CONFIG writer.

Target authority is the **sole `pipeline.config.json` system entry**, selecting the existing Nova author and immutable materialization. The proposed Nova `projectScaffold.lockWaitSeconds` is a field of that selected author, NOT a second editable platform index. The existing `PlatformConfig` loader/schema is reused for the materialized Nova payload and proposed required field. The generated `--platform` locator, if retained for this tool, must resolve to exactly the entry-selected immutable member with generation/owner/profile/source/schema/content hashes validated; a different separately edited platform file rejects. No source default, cwd guessing, ambient ENV, loose author or mutable alias fallback.

Exact **proposed** invocation (not current CLI support):

```
node skills/nova/project_setup/tools/progress-scaffold.ts --config CASE_ROOT/pipeline.config.json --platform CASE_ROOT/generations/GEN/nova-platform.json --swarm CASE_ROOT/project/.swarm --repo CASE_ROOT/project --apply
```

`--config` selects the system entry; `--platform` is a generated checked projection locator, never an independent author. Existing Nova core `--platform` migration must likewise be defined by parent C2: `--pipeline` remains the project/workflow graph and is never repurposed as system configuration.

The standalone scaffold work unit captures the selected owner/profile/generation and source/schema/full projection hashes before attempting its real project-pair lock. Check/print are read-only paths; apply is the bounded publication operation. It is not an accepted remote test-gate R claim or a Buster cleanup effect. A claimed/started scaffold invocation keeps its selected wait5/1 and never takes latest while waiting. Genuine kernel contention/release cannot be bypassed, reset or broken. Compatible new invocations may select B after policy publication; their selected wait does not change the existing A holder. A different author for the same root rejects. No permanent-generation rule forbids an independently valid subsequent operation merely because wait differs.

Proposed project-pair manifest version/binding must account for the captured publication policy identity and retain prior generation references; the current manifest only hashes members and has no policy binding. Quiescent migration/replay/history/Eval clauses must be tested at approved implementation, not inferred from current atomic rename. Failed contention leaves both member bytes and current pointer unchanged; missing generated locator/edited projection/unknown field/hash mismatch reject before publication. Fixed Eval selects its own complete immutable profile, never latest.

Required cases: `QC-FOUNDATION-FLOCK-WAIT-VAL`, `...-REAL-LOCK`, `...-HISTORY`. Each exercises direct tool invocation and direct library callers/aliases; package strings are source dispositions, not extra business consumers. Current numeric-domain controls genuinely invoke `/usr/bin/flock --timeout 5/1`; they do not prove the new CLI or policy projection exists.
