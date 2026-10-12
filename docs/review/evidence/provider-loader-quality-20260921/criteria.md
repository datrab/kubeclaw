# Loader quality precriteria

Owned files: provider-loader.ts and cohesive provider-process-session.ts/provider-process-observation.ts helpers only. Preserve public interfaces, verified private package snapshots, child arguments/environment, independent message receives, RPC cancellation/drain, cleanup recovery, resource accumulation and existing deadlines/policy. No lint rules, tests, authority, sandbox or execution budgets changed.

Replace blanket process-observation catches with explicit ENOENT/ESRCH disappearance handling; unexpected observation errors enter the session failure/termination path. Signal ESRCH is expected disappearance; other signal/write errors remain observable through termination rejection after bounded stop processing. Do not throw unhandled errors from timer callbacks. Expected disappearance is not evidence of native quiescence.

Extract coherent process session and observation responsibilities; split message resource/log/capability/terminal handling without changing precedence or allowing execution replies before pending capabilities settle. Source-only implementation checkpoint; types/lint/runtime and original actual-child tests remain required after coordinator release.
