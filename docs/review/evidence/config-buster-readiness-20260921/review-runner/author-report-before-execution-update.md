# Buster dependency readiness: file authority and acceptance

Status: preimplementation source assessment and acceptance criteria. No migration,
runtime acceptance, BuildKit isolation or CONFIG completion is claimed.

## Existing authors and consumers

The real image entrypoint writes `dependencyReadiness` into its generated runtime
JSON: `maximumExecutionMs: 1000`, `maximumOutputBytes: 65536`.
`production.ts` optionally reads that object and passes its two integers to
`BusterRemotePlanService`. The service supplies the same two code fallbacks if
the object or either field is missing. These are competing policy authors.

When `container.build` is enabled, the service constructs `BuildkitReadiness`,
using the configured buildctl executable and BuildKit address. Its actual
`runDependencyProcess` call enforces a timeout and combined stdout/stderr byte
ceiling. Existing validation requires safe integers in 1–30000 ms and
1–1048576 bytes. Concurrent callers share the in-flight check; completed checks
are not cached. Bootstrap, functional readiness and liveness remain distinct.
Submission checks this dependency before accepting new work and before starting
an accepted replay; terminal replays do not trigger that check. Shutdown cancels
the check and waits for process closure. `remote-plan-http.ts` routes `/healthz`,
`/bootstrapz` and `/readyz` to their distinct existing semantics.

With `container.build` disabled there is no BuildKit probe. Requiring a complete
operator configuration must not accidentally enable this capability or launch
the executable. The process helper's fixed environment/PATH is a separate
remaining D17 classification item, not removed by relocating these two limits.
Readiness establishes availability only; it does not establish build isolation.

## Intended change

The existing `buster-engine.config.json` becomes the sole author through required
`settings.dependencyReadiness` with both fields. Keep the currently effective
1000/65536 values explicit in that file. Use the existing bundle snapshot and
typed Buster settings; do not add a loader, include graph or generated policy
copy. Remove the entrypoint author, optional production-JSON decoding and service
fallbacks. Reject the former runtime-JSON key when present, including null,
empty and equal-valued objects, so stale operator inputs cannot be ignored.

Direct service callers must supply and validate the explicit policy even when
the capability is disabled; validation alone must not start a dependency check.
The service captures immutable validated values. Existing timer/output bounds,
error redaction, process closure and cancellation semantics remain intact.

## Acceptance criteria recorded before implementation

- BR1: Required fields, exact object shape and original numeric bounds agree in
  the canonical schema, both actual Helm render paths, bundle loader and direct
  service boundary. Missing/null/boolean/string/fraction/zero/overflow inputs
  fail; exact endpoints pass. There is no default or numeric coercion.
- BR2: The real production factory passes the bundle policy to its real service
  and dependency process. A real executable fixture with controlled output and
  duration proves both independent limits with two authored values each. Do not
  replace the service, readiness checker or process runner. Clearly identify the
  executable as a fixture, not real BuildKit. Missing/invalid policy fails before
  probe execution; disabled capability never starts the probe.
  Prove unavailable dependencies reject new admission before accept/start and
  prevent an accepted replay from starting; retain terminal replay behavior.
- BR3: Presence of the retired generated/runtime-JSON author is rejected; the
  actual entrypoint no longer writes it. Restoring either service fallback or
  ignoring either authored limit is detected by meaningful assertions. Preserve
  immutable capture when the caller or file changes after construction.
- BR4: Keep the complete original `buster-readiness.test.mts`, original remote
  runtime contract script, admission/CLI tests and relevant deployment-truth
  assertions. Preserve original assertions and deadlines. Check packaging and
  rollout sensitivity for the updated Buster owner, plus the affected type and
  canonical lint scopes. A fixture migration does not excuse a failed original
  module; retain failures and rerun the full corrected module.
  The existing readiness Helm fixture currently lacks the generated native
  namespace/node/policy binding and digest-pinned image required by the chart.
  Migrate its inputs using the real policy generator and explicit fixture
  identity; keep all probe assertions and production chart guards intact.
  This source-observed gap has not yet been reproduced by a runtime test here.
- BR-DOC: Update the operator field table, bounds, migration/restart instructions
  and the distinction between readiness and isolation. Independent nonauthor
  review must verify implementation simplicity, removed authors, actual
  consumer behavior, original scope and raw evidence. Keep actual built-image,
  BuildKit and cluster activation evidence separate and open when unexecuted.

## Source checkpoint and remaining scope

The [initial source manifest](../../evidence/config-buster-readiness-20260921/source-identities.json)
and [review additions](../../evidence/config-buster-readiness-20260921/source-identities-v2.json)
retain both document versions and bind the added HTTP/Helm sources. They bind
this assessment only and are not runtime evidence.
The concurrently integrated Worker Core configuration is a separate change.
Other Buster runtime-JSON authors, runner store quotas, provider execution policy,
plugin configuration and complete CONFIG F1–F6 remain open.
