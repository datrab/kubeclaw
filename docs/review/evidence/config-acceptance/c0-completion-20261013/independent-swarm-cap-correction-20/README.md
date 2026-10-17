# Independent SWARM19-001 correction recheck 20

Reviewer/task: `/root/swarm_cap_recheck_20`, fresh independent correction review without author conversation. Date: 2026-10-13. Exact checkout HEAD/tree and SHA-256/byte identities of every inspected input are recorded in `input-identities.json`; dirty tracked patch and complete untracked status are retained in `patch.stdout` and `status.stdout`. HEAD alone is not the input identity.

## Verdict

**PASS for the bounded SWARM19-001 definition correction only.** Batch28 explicitly records the effective renderer maximum **2147483647** for exactly maximumRequestBytes, maximumArchiveBytes, maximumHeaderBytes, maximumInputBytes, maximumOutputBytes and maximumResultBytes. Both the aggregate contract and every member pin the actual template expressions at lines214–215 and its current source hash. The six truthful schema maxima **9007199254740991** remain separate and unchanged. The effective maximum is the minimum of schema maximum and renderer cap; other relational constraints still apply.

This resolves the specific omission in review19. It does not accept all twenty definitions, full preparation/profile/schema/case coverage, current native behavior, complete C0, or any implementation package.

## Actual checks

Read GOAL-START.md and OPENCLAW-CONFIG-GOAL.md, review19's original finding, all batch28 artifacts, batch27 definition and prior identities, actual schema and preparation validation/adjacent renderer clauses. Compared batch27 historical hashes against review19's retained identities. Independently executed only this directory's static `review.py`:

```sh
python3 docs/review/evidence/config-acceptance/c0-completion-20261013/independent-swarm-cap-correction-20/review.py > docs/review/evidence/config-acceptance/c0-completion-20261013/independent-swarm-cap-correction-20/review.stdout
```

Result: **100 checks passed, 0 failed**; individual checks and raw summary are retained in `checks.json` and `review.stdout`. Checked exact twenty candidate IDs/order and all twenty unchanged originalCandidate bodies; exactly one changed row `SRC-ea5d74692fd5fcdd`, with the other nineteen rows structurally identical. All26 preparation member schemaDomain objects join the actual schema and remain unchanged. Twenty uncapped preparation members are untouched, and stripping only the six per-member cap additions plus the aggregate cap and relation clarification recovers the original preparation row exactly. The batch27 artifacts pinned by review19 and the renderer/schema identities remain unchanged. Batch28 manifest and superseded-definition hashes match actual bytes.

Manually read line130's schema minimum/maximum/integer gate alongside the separate line214 six-key loop and line215 strict `gt` rejection; line217's six storage inequalities remain distinct. In particular increasing only maximumRequestBytes to2147483648 satisfies its scalar schema domain and cannot make the archive<=request storage relation fail, while the static line215 predicate rejects it. This is **source reasoning**, not an executed Helm/render/native positive or negative proof. The recorded witness expressly sets executedHelmOrNativeResult=false.

## Preserved limits

No author package, queue, canonical inventory/matrix, production or test file was edited. No author define script, general validator, broad test suite, Helm/native operation or production operation was executed. Only this new reviewer evidence directory was written. Original review19 and batch27 remain historical evidence. Existing definitionAccepted=false, runtimeResult=not-run, globalC0Accepted=false and pending full gates are appropriate; no global acceptance or C1–C6 authorization is granted.
