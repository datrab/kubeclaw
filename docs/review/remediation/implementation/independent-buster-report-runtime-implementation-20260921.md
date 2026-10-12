# Independent 41-field report-runtime implementation review

Status: bounded local implementation and runtime evidence accepted for the integrated41-field generation; Kubeclaw four-field raw negative parity remains open. No full CONFIG/D17, all14 workstream, native isolation, recovery/compaction, image or external-service acceptance. All review jobs ended; explicit HOLD. The subsequent44-field proposal is outside this review.

## Bound current results

Evidence resides under `docs/review/evidence/independent-buster-runner-execution-child-20260921/`. Fast session24948 passed three canonical type projects and all affected canonical lint targets, including the three new report test modules and both migrated original adapter tests. No source drift. V2 eleven-file production integration and V3 two-test manifests were independently checked against actual hashes before execution.

Positive session93011 passed the actual maintained13-module command165/165, unchanged substantive original ReportAdapterRuntime and JUnitAdapter contracts, full original Runner and RealProvider, original capabilities, maintained Discipline/Delivery and Components649/649. Exact commands/logs are in report41-runtime1. There was no unexpected source/dependency drift. Actual sandbox compilation used the bound real cached Alpine GCC/sysroot wrapper; expected sandbox output replacement is recorded separately, not hidden as unchanged identity.

Controls session85106 passed with empty source drift. The private exact-source transformations were applied with hash/unique-match checks, stored before/after bytes and application logs; no production source was rewritten. Manual review confirms semantic assertion failures, not startup errors:

| Field restored to old literal | Actual failing consumer assertion |
|---|---|
| minimumHeapMiB→16 | Actual DefaultRunner report child argv no longer includes the selected expected max-old-space setting |
| heapFraction→0.7 | Same real child argv assertion fails for selected profiles |
| runtimeMemoryReserveBytes→67108864 | Direct adapter128MiB reserve profile incorrectly succeeds; missing expected REPORT_ADAPTER_MEMORY_LIMIT_INCOMPATIBLE rejection |
| minimumOpenFiles→16 | Direct adapterselected96/request64 incorrectly succeeds; missing expected REPORT_ADAPTER_OPEN_FILE_LIMIT_TOO_LOW rejection |

Positive heap cases additionally require real V8 heap capacity growth, actual completed report outputs, retained source identity and observed child closure. Negative controls test lost selected-policy consumption, not the general correctness of all V8 resource accounting.

## Scope and original preservation

The four new mandatory report-runtime values reside in the existing single Buster execution owner: report minimum descriptor floor, heap floor/fraction and runtime memory reserve. Required typed policy reaches the actual registered ReportAdapterRuntime. No optional constructor fallback remains in the reviewed path. Invalid/missing settings and incoherent memory/descriptor ranges fail before runtime-directory or process effects; snapshots are immutable.

The two original adapter modules were independently diffed against their before snapshots. Only the explicit policy import and required constructor argument were added; original assertions, error expectations and deadlines remain. They both ran in full. No original Runner/Provider/Capability/Component module was replaced by a new test or a selected happy-path subset. The earlier37-generation report and all previous failures remain historical evidence.

V3 adds actual defaultRunner heap profiles and early coherence checks, with true registered provider/report children. Narrower direct-adapter request probes separately establish reserve and descriptor admission effects. The new Helm/schema negative matrix actually renders only the Prism chart: it validates missing/invalid fields, coherent exact rendered profiles and incoherent ranges there. Shared physical helper plus positive Component tests establish separate wiring evidence for Kubeclaw, but do not prove that chart's raw four-field negative matrix. The both-chart negative criterion therefore remains open pending its own actual run. Extreme schema-valid values are only envelope validation evidence, not a claim that those extremes can launch a feasible process.

Fixtures detach chart aliases before writes and assert regular private paths and distinct inode/device identity. Runtime fixtures observe exact owned process groups, require real close, use finite cleanup bounds, and retain/fail on unresolved ownership. No fixture cleanup claim substitutes for general native isolation acceptance.

## Remaining limits and release

The41-field result supersedes the runtime-pending status of this generation only. It does not close historical compaction, native preparation/restart, complete physical attempt accounting, all plugin configuration migration, built images, deployment or external provider prerequisites. The new44-field process-input work is private/separate and receives no acceptance from these runs.

No product/test edits were made by this reviewer in this41-field cycle. No jobs remain active. Sources released; HOLD until an explicit concrete delta.
