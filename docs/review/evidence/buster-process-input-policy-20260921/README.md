# Private ProcessInput policy draft

Status: private source candidate, not integrated or executed. Parent approved the three-field design and caller boundary before authoring. `manifest-v1.json` binds 29 before/after files; all existing before bytes match the current live 41-field generation at capture. No original snapshot was replaced. `change.patch` is the corresponding review delta.

The single author is `buster-engine.config.json` under execution.processInput: cleanupTimeoutMs=1500, terminationGraceMs=250, acknowledgementPollMs=10. Closed schema, typed decoder and shared Helm enforce positive timer-safe integer values, grace strictly less than cleanup, and poll no greater than cleanup. Both charts consume the same shared template. No schema defaults or plugin-file copies are introduced.

## Required acceptance

PI1: all three settings required, immutable and validated before spawn; missing, wrong type, out-of-range, extra fields and incoherent timers reject through loader and both charts. Shipping values preserve old behavior; two distinct valid profiles must work.

PI2: real ProcessInput child lifecycle demonstrates selected TERM-to-KILL grace, actual-close cleanup deadline and real group acknowledgement scan spacing. The new seven-case module uses real child processes and forward-only OS observations. The cleanup-deadline test delays delivery of an actual close notification; it is a local notification-boundary test, not a claim of delayed kernel termination. Original process-input assertions and deadlines remain unchanged. Cleanup kills only the exact captured child process group and awaits actual close with a bound. No native proof is claimed.

PI3: registered report adapter runtime, Kubernetes fixture invoker and Tailscale exposure invoker receive the same central snapshot, including the remote-prepared-execution factory route. Direct constructors require explicit settings. Default execution wrappers pass existing explicit command timeout/output caps without fallback or coercion. All known direct original fixtures are migrated with explicit historical policy; new report runtime-policy callers are included. No fixture loads current config to repair missing caller options.

PI4: execute all affected original modules, maintained type/lint scopes and the new maintained test; retain failures. Require semantic mutants restoring each old lifecycle constant, each wrapper fallback and disconnecting each production forwarding route to be detected. Both-chart parity must include missing/invalid/extra/timing cases. These mutants/parity additions and executions remain outstanding; the draft does not claim complete test coverage merely from static wiring.

PI-DOC: maintained execution reference documents 44 fields, units, coherence, owners, exact consumer boundaries and remaining authorities. No full CONFIG/D17 closure.

## Source scope

Three direct production runProcessInput callers: report-adapter-runtime.ts, kubernetes-fixture-runtime.ts and tailscale-exposure-runtime.ts. Factory: capability-runtime.ts, called by remote-prepared-execution.ts plus two original HTTP authority fixture calls. Report construction: runner.ts and the report runtime/JUnit/runtime-policy modules. Two direct ProcessInput original test modules retain their assertions with explicit policy. Seven original Kubernetes/Tailscale modules receive explicit policy. Shared chart aliases must remain symlinks during eventual integration; only canonical targets are staged.

New test command is appended to the existing verify:buster:execution-config command; no original module is removed. No command was run here, including syntax, lint, types or runtime checks.

## Explicit remaining boundaries

This draft does not centralize the Tailscale caller's explicit 1 MiB output cap, Kubernetes maxManifestBytes*2 relationship, separate invoker polling policy, Foundation process-group capture deadline 250 ms, or native C stop policy. Classification grants no exception to D17. Per-caller real forwarding mutants and full chart parity are required before acceptance. Existing lifecycle signal-error behavior is preserved; this is not a cleanup redesign. Complete runtime/source dependency binding belongs to the later authorized execution window.
