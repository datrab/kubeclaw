# Bounded Ops diagram registration Source review

**PASS — exact directed relationship/text-alternative/registration correction. No remaining material Source findings in this changed responsibility.**

Baseline HEAD: `52c5bc0f6fdd2be5810ad78829ef9fc9e7882615`. Current Ops page SHA-256: `1eff5e5078921e8ec0b7fdc7c29541c2a1f45b50b001e6064cef7a8f2b73d42c`. Current registry SHA-256: `34c59ec47799fe7526d63eba3cda291808ba0b9b888793a6cba4d92c2ac1441a`. Exact fields, all five page hashes, diagram hashes, raw-record identity results, directed-edge inventory and source read ranges are recorded in `source-review.json`.

## Complete changed relationship inventory

The complete Ops fence and adjacent visible text alternative were read. Their nine directed edges agree:

1. Codex → MCP: HTTPS with its own bearer.
2. Nova gateway → its local adapter.
3. Buster gateway → its local adapter.
4. Nova adapter → MCP: HTTPS and Nova bearer.
5. Buster adapter → MCP: HTTPS and Buster bearer.
6. MCP → Kubernetes API: MCP ServiceAccount.
7. Buster worker → API: lease CR and granted lease-bound workload/test operations.
8. Namespace controller → API: polling lease resources.
9. Namespace controller → API: namespace/RBAC reconciliation.

The last two remain distinct invocations to the same destination. At pinned upstream `34cf38ef53ee41381543785d0ffae90a37fac9ca`, `cmd/buster-namespace-controller/main.go:122–131` actually loops `reconcileAll` then sleeps; `231–240` actually GETs the lease collection and reconciles returned items. The corrected controller→API polling direction represents that request, not a watch stream or a permission mistaken for invocation. The unchanged namespace/RBAC reconciliation and worker direct-API effects retain the prior complete source/invocation traces. The alternative covers both gateways/adapters separately through its paired wording, separates worker credentials from MCP bearers, and retains both failure limits: configured source paths do not prove live traffic, and lease completion does not prove subsequent workload success.

## Registry fields and exact conservation

Baseline registry contains 27 records; current registry contains 28. Independent raw-object byte comparison confirms **26 old records are byte-identical** in the same positions. Only the existing platform record at index 11 changes, and replacing its old `sourceSha256` with its current value reproduces that record byte-for-byte. No other old field changes. Its current fence SHA-256 is `105b49a2ea4415cfd63dcf7200eae9e75b74cabbb556fe037d967fdb88ea197a`, matching the actual already-reviewed platform fence; that page is unchanged by this delta.

The single appended Ops record selects `understand/ops-mcp.md`, Mermaid index 0, owner `Ops MCP maintainers`, a specific credentials/worker-boundary reader question, and an adjacent text-alternative description consistent with the page. The actual fence SHA-256 is `c1c9dd770a063bee7d52074991920f78be324f4ee3fb399a348e0e80f69f445f`, matching the record. `diagram-3b61c09b1f7672db` equals the page/index identity hash prefix and is unique; page/index is also unique. Source inspection of the owning collector at `scripts/docs-reader/diagrams.mjs:50–74` confirms the selected fields bind page/index, owner, fence hash and adjacent-alternative marker. This is not a whole-renderer or SVG validation verdict.

## Coverage bridge and limits

All five baseline page hashes equal the prior e63 editorial Source bridge's accepted current hashes, which bridge to the complete five-page correction2 Source review and separate refs correction. Only the Ops diagram/text-alternative changes now; Codex/platform/security/communication remain byte-identical. Complete ordered link destination/range vectors remain unchanged for all five pages. Thus unchanged whole-page responsibilities retain that exact prior coverage, and this review supplies only the newly changed directed edge, full adjacent alternative and registry responsibilities. Zero unread changed scope.

No repository code/tests/build/generator/getter, SVG rendering, browser, endpoint or credential was executed/read by this reviewer. No publication result, SVG/layout, Reader, Quality, runtime adoption, live success or acceptance/gate verdict is inferred. The upstream-not-adopted disclosure and all existing source-versus-execution limitations remain intact. Later changes require a bounded exact-delta follow-up.
