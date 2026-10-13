# Independent Ops namespace deduplication correction recheck

## Bounded verdict: PASS

OPS-RESUMED-001 is corrected in additive delivery/batch-38 for `SRC-1885e83d3f76b091`. This accepts the specific static correction, not global C0, deployment, runtime/native behavior, or implementation.

Actual source inspected: `tools/ops-mcp/src/config.mjs:1–7,16–19`, `charts/ops-pod/templates/workload.yaml:87–93`, and `charts/ops-pod/templates/rbac.yaml:28–41`. Helm comma-joins the original namespace list. MCP splits without trimming, validates Argo namespace, every list member and default membership before returning `[...new Set(namespaces)]`. Thus duplicate valid entries survive validation and are then deduplicated; malformed/whitespace entries are not repaired first. Helm RoleBindings independently range the original list and are not affected by MCP's later in-process deduplication. No rendered/native permission result is inferred.

Both batch-38's generator definition and generated JSON state this ordering correctly. A read-only AST literal comparison confirmed the generator's workload-line-91 description exactly equals the JSON description; static inspection confirmed the generator adds actual config line7 and RBAC line28 references. The generator was not executed.

## Preservation and source checks

- All 31 original candidate IDs and full original candidate bodies retained; exactly 30 rows unchanged. Only the named candidate's `currentDomainAndRelations` and `relatedConsumerRefs` differ.
- All 149 source-pin occurrences in batch-38 match actual file SHA-256 and exact line bytes (147 prior occurrences plus two correction pins).
- All eight batch-37/batch-38 manifest file entries and all five recorded original-batch-37 file identities match: 13 hash comparisons. Original batch-37 manifest SHA-256 remains `575e5344d35329e66d6a916f3f9d790027d588b59b6afa3e873b9d64a9882413`, also matching correction metadata.
- All 26 identities recorded by the preceding independent source reviewer still match, including all five frozen batch-37 files and inspected production sources.
- No additional finding in this bounded correction recheck. The other 30 clauses' semantic review remains attributable to `independent-ops-chart-source-resumed/README.md`; it is not newly claimed as a full independent re-review here.

## Method and limits

Read frozen batch-37/batch-38 JSON, generator, README, local-check and manifests and prior review/identities; inspected actual MCP loader and Helm projection/binding source. Used `rg --files`, `cat`, `rg -n`, `nl`/`sed`, and inline Python for read-only JSON/body/hash/exact-line/AST comparisons. One mistyped inspection path (`charts/codex-ops/templates/rbac.yaml`) did not exist; inspection was corrected to the actual `charts/ops-pod/templates/rbac.yaml` and the checks above passed.

Only this report was written. No generator, production/deploy/verification script, MCP runtime, credentials, API, network, or broad tests were executed. Historical evidence and production/test inputs were not edited. Remaining global C0/schema/profile/role/provider/module/native/live joins and implementation acceptance remain open.
