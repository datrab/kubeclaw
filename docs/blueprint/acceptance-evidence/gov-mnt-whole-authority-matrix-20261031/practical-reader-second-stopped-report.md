# Reader-only practical report — second candidate attempt

Candidate: **23e19f457aa263d6c96c531d2cccbcffa283e306** in the same isolated detached checkout. No Source correctness, Quality, rendering, fresh installation or whole-gate award.

## Previous-stop disposition

Attempt 1 at 61c0a5505010950bc40d5d58f4a2b3c0158a4421 remains stopped/failed at required `npm run docs:generate:check` (exit 1, source revision mismatch; workflows/.gitignore and owned scratch compile-cache named). Governance had passed. Mutation/restoration was not attempted. The parent preserved that original report separately. This attempt neither erases nor turns that failure into a pass. My previous brief final incorrectly stated 117 reverse identities; the exact machine query/report and this rerun give **480**, not 117.

## Per-outcome results

- **PASS** — typed public identity, authority/consumer, canonical destination, owner, owning route and reverse lookup derived by actual JSON query.
- **PASS** — high-level family authority and coverage limits interpreted.
- **PASS** — explicit fixture classification and consequential nondeployment boundary.
- **FAIL** — required baseline: governance and refs passed; site-boundary failed.
- **incomplete** — summary mutation, drift diagnosis, generator restoration and restored-state checks not executed because the baseline stop rule applied.
- **PASS** — no tracked documentation mutation; final selected-file diff empty, exit 0.

## Actual navigation / assistance ledger

Started again substantively at Product Surface Map. Followed full identity index into generated-documentation-map.json and queried authorityMatrix records, authorityPolicies, families and inverse. Used governance's maintenance link and searched only allowed published pages for governance/summary/bounded. Read maintenance lines 320–420 and 190–215, governance 74–104, and selected canonical platform guide 367–385. Handbook was searched, not used to override current selected-route text. No external source URL followed. No implementation, blueprint, other evidence, review or history read. No network or other-agent help; parent received status updates only. Existing copied dependencies were supplied, no install performed; Node v24.22.1. Initial and final status both `?? .reader-tmp/`.

Navigation command list and exits are in evidence JSON. All commands used this isolated checkout as cwd. Check wrapper invoked each exact selected command with `TMPDIR=$PWD/.reader-tmp`, captured stdout/stderr/status to .reader-tmp/attempt2-baseline.json, and stopped at first nonzero child status. Wrapper itself exited 0; this does **not** turn the failing child check into a pass.

## Selected typed identity

`platform:helm%3Afixture%2Fbuster-runtime-registry:dependencySignals:Deployment%2Fkubeclaw%2Fagent-buster%23buster-v2-runtime%20-%3E%20registry-local%20%5BKUBECLAW_REGISTRY_CONFIG%3D%7B%22dockerHubMirror%22%3A%7B%22caSecretKey%22%3A%22ca.crt%22%2C%22caSecretName%22%3A%22%22%2C%22endpoint%22%3A%22%22%2C%22nodeCaFile%22%3A%22%22%2C%22transport%22%3A%22%22%7D%2C%22registry%22%3A%7B%22authSecretName%22%3A%22%22%2C%22caSec%E2%80%A6%20%5B375%20chars%20sha256%3Afd1ca4fba975%5D%5D:helm%3Abuster:Deployment%2Fkubeclaw%2Fagent-buster%23buster-v2-runtime:render-fixture:`

Family: SUR-DEP-08. Authority: `helm:fixture/buster-runtime-registry`. Canonical target: `docs/site/understand/platform-and-operations.md#runtime-dependency-contracts`. Documentation owner: **platform architecture and operations**. Policy: `a8785231bbbcedfb106bc08f6a5d18d33109c4ce033c21d0c78a91530fc8777a`. Inventory `docs/generated/inventory/platform-surfaces.json`; generator `scripts/docs-platform-surface-inventory.mjs`; owning checks `npm run docs:ap09:platform-inventory:check ; npm run docs:ap09:platform-drift:mutations`. These checks were identified, not awarded or executed: this is a governance-owned summary-only exercise with no underlying source/inventory change.

Consumer: Deployment/kubeclaw/agent-buster#buster-v2-runtime. Classification fixture-only; authorityKind native-render-fixture. Inventory injects a render-only registry value because checked-in optional client contract remains unresolved. It proves neither active registry routing nor selected deployment/runtime grant. Canonical guide says registry endpoint and transport must be set, injected lab values demonstrate template structure only, and /v2/ proves reachability, while push/digest-read/pull are stronger actual-path evidence.

Reverse lookup matched exact canonicalTarget in inverse, found **480** identities, selected identity membership **true**. This demonstrates anchor-qualified reverse lookup, not full source discovery.

## Selected high-level family

SUR-COM-01: Nova dispatch to Buster, Prism, Forge and Echo; target communication.md#complete-connection-matrix, owner runtime and platform maintainers. authorityAvailability disposition **no-admitted-typed-inventory-for-high-level-surface**, typedIdentities empty, selected event/platform inventories cover only finite declarations/relations. Named source/consumer review remains mandatory for whole lifecycle. This is not repository-wide absence, completed review, source completeness or runtime readiness. Detailed label is guide depth.

## Applicable governance-owned workflow and execution

Current published maintenance text explicitly selects governance:generate/check **instead of** global docs:generate/docs:generate:check when only page metadata, authority relation and marked Product Surface summary change, retaining reference, site-boundary and publication checks. This applies because no product source or owning inventory changed. Thus this candidate did not rerun attempt 1's global-reference command or alter its source lock. Product page map confirms authored-with-generated-region; owner documentation architecture; governance/publication/refs checks.

For actual stale summary recovery the documented owner would be `npm run docs:governance:generate` followed by `npm run docs:governance:check`, inspecting both relation JSON and marked summary together, never authored SUR roster. I did not reach that action.

Baseline commands in order:

1. `TMPDIR=$PWD/.reader-tmp npm run docs:governance:check` — **exit 0**, documentation governance passed (184 pages mapped).
2. `TMPDIR=$PWD/.reader-tmp npm run docs:check:refs` — **exit 0**, 10925 local links, 4774 local anchors, 12686 repository path refs, 49125 pinned source links.
3. `TMPDIR=$PWD/.reader-tmp npm run docs:site-boundary:check` — **exit 1**, first required failure. First finding: docs/site/decisions/acceptance.md:49: pinned link targets documentation outside docs/site. Many further findings include other outside-site pinned links, work-package labels, bookkeeping and non-reader-area references.
4. `npm run docs:publication:check` — **not executed**, required sequence stopped.

Terminal result was truncated owing to extensive native findings; full stdout/stderr is preserved in companion evidence JSON. This output limit is not a missing instruction or an absent failure diagnostic. I did not follow forbidden targets, inspect checker implementation, fix unrelated pages, skip the failing check, mutate summary or continue to publication.

No restoration was needed because no documentation bytes changed. Final `git diff --exit-code -- docs/site/product-surfaces.md docs/site/reference/generated-documentation-map.json` exited 0; final git status is `?? .reader-tmp/`. Scratch retains this attempt's selection and complete baseline evidence.

## Discoverability, clarity, sufficiency

Map-to-record-to-policy and exact inverse are discoverable through named JSON object paths; size favors JSON query over broad rg. Fixture and family limitations are explicit and sufficient to avoid claiming deployed behavior or complete discovery. Current maintenance text clearly publishes the governance-only substitution and keeps remaining stable checks mandatory. It supplies ownership and recovery commands, but the current required site-boundary baseline prevents this exercise reaching mutation/restoration. This is an observed reader execution blocker, not a Source/Quality judgment or detected summary-drift proof.
