# Independent OPS27-001 correction recheck 28

Reviewer: `/root/ops_pagination_caller_recheck_28`, independent delegated bounded static correction review; no author implementation responsibility.

## Scope, identity, and method

Read `docs/review/remediation/GOAL-START.md` and `OPENCLAW-CONFIG-GOAL.md`, original review27 README/findings/checks/input identities, original batch35 and additive batch36 source definitions and manifests. Independently read current `server.mjs` tool registrations, namespace_overview and recentEvents/get_events bodies plus the full `kubernetes.mjs` transport/list implementation. The supplied correction description was treated as a claim to check, not evidence.

Checkout HEAD: `3e708800f76f72ee8508a227b69c01ab4b275cb3`; HEAD tree: `b21ed13a6e1837816b6dc9b068b25e3046fe378a`; branch `codex/config-c0-semantic-inventory-20261012`. This is a dirty evidence checkout, not a clean commit-only proof. Exact current input SHA256/size identities, including all review27 files, are in `input-identities.json`; `checkout.json` additionally records the observed tracked-patch hash. Production source hashes: server `a4fef1a5e66a45ea2885cc9a1715aba5835d77cb5219e39ac35a5f50b5bab65d`, Kubernetes `449e55709e017f53790539a83936f0471915850180ec9b08fc589251ab5e987b`.

Actual commands: read-only `pwd`, `rg --files`, `cat`, `sed`, `nl`; independent Python standard-library JSON/SHA256/exact-line comparisons; read-only git rev-parse/branch/diff called by the reviewer check. `check.py` is reviewer-authored and was executed once, without importing/executing author scripts or application modules. No server, API/network, credentials, native runtime, broad tests, or production edits. Only this review directory was written. Original review27's historical NOT ACCEPTED verdict remains intact.

## Conservation and exact-pin checks

PASS: 33 rows/33 unique IDs in the same original order; all 33 originalCandidate bodies exactly preserved; all other 24 rows fully identical; exactly nine Kubernetes rows changed, only in currentDomainAndPrecedence, productiveCallerRefs, and additive currentPaginationCallerContracts. Every original caller reference remains present. All nine carry the same two corrected caller contracts and every required added caller line.

PASS: 727 nonblank source/reader/caller/contract expression, line and whole-file SHA256 occurrences match current files exactly (repeated refs counted as occurrences, not independent semantic proofs). All 28 historical input/manifest/link comparisons match: all review27 recorded input identities, untouched batch35 manifest and its four entries, batch36's three entries, prior queue and superseded definition refs. Final `input-recheck.json` independently verifies all recorded review inputs, including the original review27 files, stayed byte-identical during this review. Candidate acceptance remains false and runtime results not-run; no global flag was promoted.

## Independent source semantics

- `server.mjs:283,298,300` identifies namespace_overview and its Promise.all. Actual calls at 301/302/303/304/313/321 cover deployments/statefulsets/pods/jobs/services/ingresses and omit maxPages. `kubernetes.mjs:66,69` therefore selects Infinity for maxPages and deadline; 91–94 aggregates mapped items until continuation is absent. Output 333–338 retains all six aggregated lists. The request 10s/8MiB limits (12–13,34–38,56) are per request, not total namespace aggregate memory/page-count/duration fences. Six concurrent calls are accurately attributed, not merely generic namespace enumeration.
- `server.mjs:396–397` is get_events' productive invocation of recentEvents (registration at 380). The helper at 107–131 uses an outer do/while, passes continuation through an inner maxPages:1 call at 117–119, then reads page.continuation at 128–129. Each new inner invocation computes a fresh Date.now()+30_000 at Kubernetes line69. No helper-wide page-count/deadline fence exists. A continuing API can cause arbitrarily many successful pages and cumulative duration even though each inner call uses one successful page.
- At server127 retained events are sorted/sliced to the requested limit; public schema387 limits it to 1..100 (default40). This bounds retained event count, not whole scan work/duration, nor a precise absolute JS heap-byte guarantee. Temporary current-page summaries and merge/sort copies also exist. Counters at122–123 and returned131 record whole scanning. The corrected wording correctly separates bounded retained-event memory from unbounded scan budget. The per-list deadline is checked at retry/loop boundaries (Kubernetes86,94), not a hard total fence.

## Findings and bounded verdict

**PASS / OPS27-001 corrected at source-definition/caller-attribution scope.** No unresolved finding in this bounded correction. The actual six namespace_overview callers, outer recentEvents continuation and get_events productive caller, fresh per-inner-call deadline and retained-array versus overall scan distinction are now explicit, exact-source-pinned, and semantically accurate in all nine rows.

This does not approve whole schema/profile/setting/requirement/future-case joins, native/runtime/module/provider/credential acceptance, global C0-A–E, production behavior, implementation/C1–C6 authorization, deployment, merge, or production-finding closure. The correction documents current behavior; it does not fix or execute it.
