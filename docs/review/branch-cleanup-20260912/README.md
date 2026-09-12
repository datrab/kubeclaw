# Consolidation and branch cleanup — 2026-09-12

User decision: integrate all branch updates into main and make every non-main branch deletable even when live acceptance remains open. Preserve the audit trail and clearly distinguish integration from passing acceptance.

## Scope and result

The frozen inventory contains 262 remote branches: main at `591e61e67e98e82d818c7d7eeb9e8ba5c5cccd2b` and 261 non-main tips. The consolidation tree integrates 111 source/configuration/test paths from the latest branch families, restores 278 missing documents and 15 historical acceptance harness files, and preserves 897 distinct historical document blobs. Superseded source versions remain in Git history; they do not overwrite newer validation, durability, trust or runtime-profile hardening already on main.

The consolidation commit uses the reviewed main as its first parent and every frozen non-main tip as an additional parent (deduplicated). Therefore all original branch histories remain reachable from main after their refs are deleted. This history preservation accompanies the source integration; it does not claim that contradictory historical implementations can all be active simultaneously.

Only main must remain. All 261 non-main refs are eligible for deletion after the published commit and a fresh ref/ancestry check. At this checkpoint **zero remote branches have been deleted**: the connected GitHub interface has no delete-ref operation, and direct Git has no credentials. No dirty historical local checkout was removed or reset.

## Integrated work

- Latest lint type-evidence policies, ESLint rules, production/test/generated file partitioning and discovery exclusions. Three-way integration retains main's repository path guards, asynchronous bounded process execution and cancellation. Fixed old synchronous callers, including the empty-target test.
- Latest Cilium/Hubble and Argo CD bootstrap changes, Ops MCP handlers and policy verification. Retains current pinned images, trusted Kubernetes request handling, Helm-owned Buster admission fence and workflow publication boundaries. Hubble build source is pinned centrally through `versions.json`.
- Latest Delivery Manifest v3 and independent review-semantic encodings, compiler selection, Summary integration, contracts, replay/cancellation and owner-boundary tests.
- Observability retention review changes and Prism concurrent worker-resource attribution harness.
- Fifteen independent historical acceptance/reproduction harness files restored under `tests/verification/historical-branch-acceptance`, with original prerequisites/assertions. Some intentionally reproduce old failures. They have an explicit package command and do not enter the default current reliability glob.
- Deployment truth checks now validate the central Cilium DNS rule for TCP/UDP 53 and correctly read quoted Cilium port numbers. The DNS/service reachability requirements remain enforced.

## Evidence map

| File | Meaning |
| --- | --- |
| `branches.json` | Every exact branch name/tip; original classification retained separately; final history-preservation decision |
| `candidate-merge-log.json` | 111 integrated candidate paths, source/base/main blob IDs, conflict decisions and final blob IDs |
| `residual-resolutions.json` | 79 residual source/test paths; restored historical harnesses or reasons for retaining newer main |
| `historical-test-imports.json` | Original branch/path/blob and destination for 15 harnesses |
| `restored-documents.json` | 278 original documents restored without overwriting existing documents |
| `historical-documents.json.gz` | 897 hash-verifiable original document blobs and 1,877 branch/path references |
| `path-decisions.json.gz` | Frozen **pre-integration** three-way inspection of 190 previously unresolved branches; superseded by final integration decisions above |
| `validation.md`, `validation/` | Actual local results, failed attempts and open prerequisites; no live acceptance claim |
| `summary.json`, `verify.py` | Machine-readable counts and read-only archive/inventory verification |

Run `python docs/review/branch-cleanup-20260912/verify.py` to verify the frozen document archive and inventory. The remote ancestry proof comes from the published consolidation parent list and the deletion script's fresh Git check. The earlier 2026-09-11 audit and restored review documents are historical records; their old branch-retention recommendations are superseded by this consolidation decision. Existing finding and remediation registers are not marked resolved merely because their branches are integrated.

## Finish remote deletion

In a complete, authenticated checkout of `datrab/kubeclaw`, update to the published main and run:

```sh
python scripts/cleanup-consolidated-branches.py
python scripts/cleanup-consolidated-branches.py --apply
```

The first command previews the exact refs. The second checks that every frozen tip is reachable from freshly fetched remote main and that each remaining remote tip still matches the audited SHA. It deletes in atomic batches with explicit expected-SHA leases, rechecking before every batch. It excludes main, ignores branches created after the inventory, stops on changed tips or protection errors, and can resume after a partial run. It never force-updates main or removes local worktrees. A shallow clone must first obtain complete history.

## Acceptance remains open

This consolidation is not a production release, live deployment, or closure of all review findings. No cluster rollout, image publication or external model run was requested as part of branch cleanup. Open native, cgroup, browser, PostgreSQL, live provider, migration and historical evidence gates remain recorded in `validation.md` and the original review documents. Their status does not require retaining non-main refs because source, tests and history are retained on main.
