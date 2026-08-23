# Echo review scalability plan

## Objective

Scale exact-source review from focused changes to million-line repositories without silent omission, mutable architecture state, or model-generated authority.

## Decisions

- Read one proven Git commit. Never derive review authority from a changing worktree.
- Publish canonical sorted JSONL streams plus a small manifest. A temporary index may accelerate execution but is not durable authority.
- Extract typed facts with language and deployment parsers. Each relation records provenance and confidence.
- Preserve strongly connected components as atomic review units. Every cut edge becomes a boundary record.
- Run component and boundary reviews. Findings cite exact frozen source; summaries are navigation only.
- Cache immutable results by complete content digests rather than a mutable invalidation ledger.
- Fail closed on uncovered files, overflow, truncation, corrupt cache, missing evidence, or incomplete review execution.

## Sequential phases

1. Immutable Git snapshot and inventory contract.
2. Canonical streamed review-map artifacts.
3. Deterministic fact extractors.
4. Typed graph and strongly connected component analysis.
5. Bounded slicing and coverage ledger.
6. Component and boundary review passes.
7. Evidence verification and deterministic reduction.
8. Content-addressed result cache.
9. KubeClaw regression, incremental invalidation, million-line scale proof, and final audit.

## Phase 1 record

The repository adapter owns Git access. `inventory_revision` returns sorted blob records tied to the attempt-private frozen revision proof. Each record contains path, object ID, mode, and byte size. The review plugin verifies the repository digest, normalizes ordering, rejects duplicate or unsafe paths, classifies file roles, and explicitly records exclusions for symlinks, vendored content, and unsupported or binary files.

The inventory digest is canonical across input order. The source snapshot never reads the live worktree.

Phase 1 gates:

- Repository-adapter live and package-boundary tests pass.
- Snapshot order, digest, duplicate, traversal, role, and exclusion tests pass.
- Both TypeScript projects pass.
- Diff checks pass.

## Phase 2 record

The canonical review map is an immutable manifest plus sorted, newline-delimited streams for files, relations, exclusions, slices, and boundaries. Each stream has an independent count and digest; the manifest binds every stream to the frozen snapshot digest. Validation rejects changed bytes, missing newline termination, non-canonical JSON, incorrect counts, and unstable ordering. Empty streams have an explicit digest and zero count.

## Phase 3 record

Fact extraction is deterministic and provenance-bearing. Initial exact or derived extractors cover TypeScript/JavaScript module resolution, Go module imports, JSON references, Docker build sources, script invocation, and source-to-test naming. Boundary markers identify secret, command, network, and persistent-state concerns as uncertain navigation facts rather than trusted behavioral claims. Every relation records its extractor, confidence, and source provenance; order does not affect output.

## Phase 4 record

The typed review graph contains included files, declared resources, relations, unresolved relations, strongly connected components, and the directed component graph. Strongly connected components are calculated without recursive traversal so deep repositories cannot overflow the JavaScript stack. Component identity is content-addressed, circular dependencies remain atomic, cross-component relations retain their exact relation keys, and security/lifecycle markers become review-priority tags without changing coverage.

## Phase 5 record

Slicing walks weakly connected component regions deterministically and packs whole SCCs under explicit file, byte, and caller-supplied exact-token budgets. A component that cannot fit becomes an overflow rather than truncated input. Every cut component edge becomes a content-addressed boundary record. The coverage ledger counts total, included, excluded, assigned, uncovered, unresolved, overflow, slice, and boundary state; `complete` is false for any uncovered file, unresolved relation, or overflow.

## Phase 6 record

Complete coverage produces two immutable job types. Component jobs carry all exact source in one slice. Boundary jobs carry only exact file endpoints for the cut relations, plus stable relation keys and both participating slice identities. Both use the closed Echo output contract, prohibit form and style findings, treat uncertain facts as navigation only, and require exact source digests. Execution is bounded-concurrency and returns results in deterministic job order; a failed dispatch makes the audit incomplete rather than clean.

## Phase 7 record

Scalable output preflight requires one result per job, exact job identity, complete requirement assessments, trusted source-only inspected evidence, in-job locations, matching source digests, and both sides of file-to-file boundary findings. Every surviving proposal receives a separate bounded semantic-verification job. Reduction binds verifier identity fields, treats missing or malformed verification as incomplete, separates confirmed from rejected or insufficient findings, fingerprints exact duplicates, clusters shared root causes, and publishes a content digest.

## Phase 8 record

Review and verification results use immutable content-addressed cache records. A cache key binds the complete unit digest to policy, reviewer protocol, model, and evidence version. Each record separately binds its value and the full record. Missing entries execute; changed source, relations, policy, model, or evidence identity derive new keys automatically. Corrupt, mismatched, duplicate, missing, or unexpected records fail closed. Cache deletion affects performance only, never correctness.

## Phase 9 record

The compiler composes snapshot, facts, graph, SCC slicing, coverage, review jobs, and canonical map publication into one content-addressed result. Its input document set must exactly equal the included snapshot set. A repeatable repository evaluation script reads every included file from the pinned Git commit, never the live worktree. The scale fixture compiles 2,000 connected files and exactly one million source lines, proves complete assignment and boundary accounting, and enforces a bounded runtime. Final closeout adds full package, contract, type, lint, documentation, determinism, and independent-review evidence.

Scale-sensitive fact lookup uses indexes rather than repeated repository scans. Go imports use a directory index, test links use a filename-stem index, and Docker source trees use sorted prefix lookup. Exported review and verification dispatch functions have deterministic runtime-invocation tests, so dead-code analysis can prove that the executable paths are reachable.

## Final audit and production integration

The first independent high-reasoning audit found six valid gaps. All six were closed:

- Unresolved TypeScript, Go, and JSON references now remain explicit graph relations. Incomplete dependency coverage fails closed.
- Exact source bytes are checked against the revision-bound repository-adapter proof and its source digest. The planner uses the configured model tokenizer. It does not use byte count as a token estimate.
- Duplicate review or verification results are rejected instead of overwriting earlier results.
- Graph traversal uses cursor-based queues and set membership, avoiding quadratic array shifts and repeated linear searches.
- The production plugin now registers a separate `repository-audit` stage. It runs the complete inventory, compiler, component review, boundary review, independent verification, reduction, and immutable report path.

The repository audit is intentionally separate from the diff gate. It never changes a normal review decision and never starts a repair. It returns a non-blocking report when coverage and verification are complete. Missing source, unresolved relations, overflow, malformed model output, failed verification, or failed persistence blocks the audit itself. This preserves truthful reporting without turning pre-existing repository findings into automatic code changes.

The immutable report stores the complete canonical map: its manifest and the files, relations, exclusions, slices, and boundaries JSONL streams. A consumer can therefore validate every stream digest and use the map without rebuilding it.

Each grade has explicit file, byte, source-token, serialized-input-token, context-token, output-token, total-token, cost, wall-time, concurrency, retry, and job limits. The resolved values and their digest are part of the plan. The OpenClaw adapter also tokenizes the final prompt after it adds its runtime instructions and result path. It rejects an oversized final prompt before it creates a model session.

Source is serialized once. The task text contains protocol instructions only. It does not copy the job body. The OpenClaw adapter does not copy the task outside the input envelope. Regression tests count the assignment and each source digest in the final structure.

Component jobs review complete source once. Boundary jobs receive small exact excerpts around relation lines and contract declarations. TypeScript module and local-alias relations retain the exact import line. A boundary job can contain several concern classes because every boundary job checks the same contract, authority, and lifecycle requirements. This removes concern-only copies of the same source without removing a requirement.

Holistic jobs replace separate path jobs and repeated per-lens jobs. Each holistic job applies every enabled system lens to one bounded topology region. Its topology is losslessly encoded with one path dictionary and compact relation tuples. Relation type, endpoints, extractor, provenance, and confidence remain exact. The job can request one bounded exact-source expansion when the topology shows a possible problem. Independent verification receives complete exact source for cited paths when it fits the resolved prompt budget. If a multi-file finding would exceed that budget, verification receives deterministic exact excerpts centered on every cited line or symbol. The excerpts keep the complete frozen-source digest and exact line ranges. This prevents valid boundary findings from overflowing model context without hiding which evidence was bounded.

## Closeout audit record

Repeated independent audits found additional edge cases after the first production integration. Each accepted finding was reproduced, fixed, and covered by a regression test:

- Comment text, regular-expression literals, template text, continued strings, and post-string source no longer create false or missing imports.
- Multiline imports, TypeScript `.js` source imports, Go module references, root Docker `COPY .`, and Git submodules retain truthful coverage.
- The report identity binds policy, results, map streams, and all other report data.
- Boundary findings must cite the exact file endpoints of one real relation. Two unrelated files from the same boundary job are not sufficient.
- Boundary jobs use the same file, byte, and token limits as component jobs. Dense boundary groups split into stable parts. A single relation that cannot fit stops compilation with an explicit budget error instead of sending an oversized prompt.
- Production review and verification dispatch now use the immutable content cache. Cache artifacts are carried in the stage result. A cache hit requires exact artifact and record proof. Missing cache entries execute normally. Conflicting or corrupt cache data blocks the audit.
- Go imports use the nearest applicable `go.mod`, so repositories with nested modules keep their local dependency edges.
- Continued Docker `COPY` and `ADD` instructions are normalized before source extraction, while their original line provenance remains stable.
- TypeScript path aliases and workspace package names become explicit local import relations. A configured alias that cannot resolve remains an unresolved edge and makes coverage incomplete.
- Cached dispatch accepts exactly one result for every requested review or verification job. Unknown, missing, or duplicate job identities stop the audit before a cache record is written.
- Nested `go.mod` files remain included configuration inputs. Empty JSON Reference URIs remain local to their current schema instead of creating false unresolved directory edges.
- TypeScript alias extraction accepts standard JSON-with-comments configuration and uses the nearest applicable project root. Reused aliases in sibling packages cannot resolve through each other.
- Repository source reads are bounded before dispatch and tied to the exact inventory blob ID and byte size. A substituted or oversized response cannot become review evidence.
- Local TypeScript configuration inheritance is cycle-safe and project-scoped. A root alias cannot leak into an independent nested project.
- JavaScript and TypeScript extraction covers compact static imports, commented call spacing, import options, and `.js` specifiers that resolve to tracked TypeScript source. Property methods and regex text do not become dependency edges.
- Go extraction covers quoted and raw-string imports in direct and grouped declarations. Provenance points to the import token's real line.
- JSON-with-comments parsing accepts a UTF-8 byte-order mark, comments, and trailing commas without accepting malformed or unterminated input.
- Repository and evaluation ordering use the same code-unit comparator. Mixed-case paths cannot change identities across hosts.
- Non-wildcard TypeScript path aliases use exact-match semantics. Workspace package names alone retain package-subpath behavior.
- JSON Schema references resolve against the active root or nested `$id` base URI. Duplicate canonical schema IDs stop compilation rather than choosing one source silently.
- Docker wildcard sources expand against the frozen path set. A pattern with no deterministic match remains an unresolved edge. Go import provenance uses a precomputed newline index, which avoids repeated full-file scans.
- The production stage checks the compiled coverage ledger before any model dispatch. Unresolved relations, uncovered files, or slice overflow block the audit and cannot produce a passing report.
- Root and nested JSON Schema `$id` values are indexed against their containing file. Cross-file references to nested schema IDs therefore preserve the real source dependency.
- TypeScript aliases follow exact and longest-prefix precedence. A `baseUrl`-only local import becomes an edge only when it resolves to tracked source, so external packages do not become false unresolved dependencies.
- Docker `COPY --from=stage` inputs are produced by another build stage and are not treated as missing Git build-context files.
- Root-package alias candidates are normalized before lookup. JSON Schema `$dynamicRef` and `$recursiveRef` use the same proven base-URI resolver as `$ref`.
- Docker source extraction checks both the repository build context and the Dockerfile directory. This supports root-context builds without breaking Dockerfiles that use directory-relative sources.
- Docker directory sources normalize trailing separators before prefix lookup. Common text web assets are included source, so copied HTML, style sheets, XML, SVG, and text files remain reviewable.
- Docker prefix lookup uses the same canonical path ordering as the snapshot. Uppercase repository paths cannot fall outside a mismatched binary-search order.
- Grouped Go imports include the captured block-body offset, so provenance identifies the actual import line rather than the opening `import (` line.
- Name-based test links stay within the same package or component root. Common names such as `index` cannot create quadratic cross-repository relations.
- TypeScript alias extraction accepts standard JSON-with-comments configuration and uses the nearest applicable project root. Reused aliases in sibling packages cannot resolve through each other.

The final cache identity binds policy, protocol, an explicit reviewer-model identity, evidence version, and unit content. The model identity is separate from the agent name and must change when the configured model changes. A cache hit must also come from an earlier attempt of the same stage in the same pipeline run. Cache statistics and the complete key-set digest are stored in the report. The cache is an optimization only. Deleting it cannot change review authority or coverage.

## Final scale evidence

The first pinned KubeClaw evaluation completed with 1,560 tracked files, 1,541 included text files, 19 explicit exclusions, 2,853 relations, 1,529 connected components, 65 bounded source slices, 552 cross-slice boundaries, and 623 review jobs. That result proved deterministic coverage but exposed an unacceptable one-boundary-per-call fan-out. It is retained here as historical evidence, not as the production target.

The corrected standard-grade planner keeps scope and review depth independent. It preserves every SCC and every cross-slice relation in the coverage ledger. It batches related boundary evidence. It adds bounded path and topology passes for system assessment.

The 2026-08-22 scheduler calibration included 1,724 text files and 9,896 extracted relations. Fast produced 69 jobs and 6,537,955 reserved input tokens. Standard produced 69 jobs and 6,538,707 tokens. Deep produced 254 jobs and 8,860,111 tokens. Standard had 32 component jobs, 30 boundary jobs, no separate path jobs, and 7 holistic system jobs. Its median job was 99,289 tokens. Its p95 job was 112,428 tokens. Its largest job was 113,869 tokens. All files and required relations were accounted for. All three grades stayed within their resolved job, token, context, cost, and wall-time limits.

The standard result reduced the earlier 127-job diagnostic baseline by 58 jobs, or 45.7 percent. Reserved input fell from 9,265,296 to 6,538,707 tokens, or 29.4 percent. Repeated full relation-key serialization fell from 10,357 to zero. The 9,600 compact holistic relation assignments remain explicit in semantic accounting because they are a required second review pass. Relations without exact line provenance fell from 1,738 to 40. Estimated cost fell from 115.52 US dollars to 77.81 US dollars. Estimated wall time fell from 2,640 to 1,440 seconds. The remaining repeated source assignments are measured and reported. They are mainly exact endpoint excerpts needed by distinct boundary regions, not repeated full component bodies.

These values supersede the former 69.6 million “token” report. That old value was a byte count of serialized job JSON. It was not a tokenizer result. Current reports publish serialized envelope bytes and tokenizer-derived input tokens as separate fields. They also publish median, p95, maximum, reserved output, estimated cost, estimated wall time, cache hits, context expansions, and actual dispatch calls.

Repository review supports `fast`, `standard`, and `deep` grades and `repository`, `plugin`, and explicit path scopes. Normal limits can be lowered for prompt bytes, input tokens, and context. Total input, cost, wall time, relations, slices, primary jobs, context-expansion jobs, verification jobs, concurrency, retries, and system lenses can also be overridden. The review runtime contract is fixed to `o200k_base`, 900,000 prompt bytes, 120,000 input tokens, 128,000 context tokens, and a 6,000-token output cap. Overrides above these runtime capacities fail during profile resolution, before planning. A target with incompatible settings is rejected before a model session starts. Safety authority is not configurable: pinned source, full selected-scope accounting, no silent truncation, exact source evidence, blocker verification, and fail-closed incomplete jobs remain mandatory. `plan` mode compiles and stores the complete review plan without dispatching a model; `execute` and `resume` share content-addressed review and verification cache identities.

Plan mode is safe for calibration. A deployed production release still requires its environment-specific shadow and end-to-end gates. Do not use repository findings as repair authority. Only an independently confirmed, in-scope P0 finding can ask core for repair.

The synthetic scale fixture also processes 2,000 files and exactly 1,000,000 source lines in 100 slices. Exact tokenizer accounting completed in about 35 to 37 seconds during this audit, with a 45-second regression ceiling. Token accounting caches each unique serialized source payload and multiplies its exact token count for repeated assignments. It proves complete file assignment, boundary accounting, stable output, and bounded compilation time. These numbers measure deterministic compilation only. Model review time scales with the number of jobs and is reduced by the authenticated immutable cache.
