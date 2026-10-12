# Independent JUnit child-context review

Accepted within the test-harness scope, 2026-09-21. Reviewer
`release_alias_fresh_review` did not implement this correction.

The complete current test file, after reversing only the copied environment,
`NODE_TEST_CONTEXT` deletion and `spawnSync` environment option, is byte-identical
to the original snapshot. This preserves all six scenarios, both modes, original
assertions, real Node-generated XML cases, explicit XML contract vectors, HTTP
imports and durable recovery checks.

Independent execution of the complete original direct invocation and aggregate
`node --test` invocation both passed on the provisionally frozen Store extraction.
Both used the actual cached GNU flock through a proot path binding. A temporary
sibling containing the original pre-correction file failed under `node --test`
with `ENOENT` for `all-skipped.xml`. The negative control was removed afterward;
no production or original test file was modified by the reviewer.

Evidence, executable review driver, exact before/after identity, commands, raw
output and dependency identities:
`../../evidence/junit-child-context-independent-20260921/`.
The Store's separate extraction review and native Buster integration remain
separate work. This review proves neither native execution nor resource isolation.
