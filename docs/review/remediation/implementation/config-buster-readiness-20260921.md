# Buster dependency readiness: file authority and acceptance

Status: BR1–BR3 and BR-DOC locally accepted by [fresh independent review](independent-config-buster-readiness-implementation-20260921.md). The local BR4 regression slice is verified; full BR4 remains open for historical compaction and external verticals. No full BR, BuildKit isolation, image/live or overall CONFIG acceptance is claimed.

## Historical source assessment before implementation

Before this change, the real image entrypoint wrote `dependencyReadiness` into its generated runtime
JSON: `maximumExecutionMs: 1000`, `maximumOutputBytes: 65536`.
`production.ts` optionally reads that object and passes its two integers to
`BusterRemotePlanService`. The service supplies the same two code fallbacks if
the object or either field is missing. These were competing policy authors.

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
  The initial source-observed fixture gap is historical; the corrected original readiness module has now passed unchanged assertions, as recorded below.
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


## Implemented author checkpoint and retained failures

The 35-file integration used `integration-candidate/manifest.json`: every original/draft hash and alias matched before application, `git apply --check` passed, and all resulting identities matched. The two LC-rebased files preserve the combined settings structure and LC helper. Source and tool bindings for each actual run are under [review-runner](../../evidence/config-buster-readiness-20260921/review-runner/README.md); each completed/aborted run has its own before/after manifests and empty drift list. No earlier pass is retroactively attributed to later source bytes.

- `author-run1`: first full 30-command run, failed. It exposed the new stderr observer overload annotation and missing absolute GNU-tar mapping, plus original runtime prerequisites. Both queue/replay cases timed out before execution because extraction could not launch the configured tar. These raw failures remain retained.
- `author-run2`: deliberately interrupted with exit 130 before further runs with the identified chart-alias weakness. Its postbinding had zero drift; chart hashes/device/inode checks are retained separately. The new Helm module had not run because the type gate failed first. No aborted aggregate is treated as success.
- `author-run3`: corrected exact optional tuple types and genuine tar mappings. All nine new loader/process/service cases and all five original readiness cases passed; the two new Helm cases correctly rejected copied source aliases before mutation. Original admission/CLI/render, unchanged remote-plan runtime (including original timing assertions), shutdown-storage, coverage-remote and all eleven Nova dispatch projection cases passed. New types and canonical lint passed. All four private fallback/consumer mutants produced actual assertion failures, preserved individually.
- `author-run4`: after safe private-file alias detachment, the complete maintained BR verifier passed 16/16, zero skips/cancellations, including both Helm charts and all original readiness assertions. Scoped canonical lint passed. The corrected original compaction caller still failed at its missing preparation dependency; it is not counted as green.

The chart fixture now checks private parent containment before detaching aliases, creates replacement files exclusively, then checks every bundle/schema target's realpath and device/inode against the original source. It repeats those checks before bundle mutation. This is fixture protection, not a weakened chart validation rule.

The stderr observer preserves both real write overloads and forwards arguments unchanged. The harness maps only absolute executable paths to genuine bound GNU flock/tar, retaining arguments/options; it does not replace sandbox or process semantics. The real lock contention and archive probe passed. Earlier tool failures are not retroactively converted into passes.

The compaction fixture's two previously omitted admission options were migrated explicitly to its actual historical direct-constructor policy 2 active / 16 queued / 64 concurrent attempts. `compaction-admission-provenance.json` binds the prior constructor source and proves the test body unchanged after removing the two insertions. This is distinct from the production image's canonical queue limit 8. Further source review shows a genuine historical contract mismatch: the public FileBusterPlanJobStore now aliases PreparedBusterPlanJobStore, which has no compactCompletedArchive. The manual historical implementation remains in historical-plan-store.ts. Simply changing this test to the modeled prepared-store helper cannot preserve its archive-compaction assertions. Correct migration needs real historical records and manual compaction plus the legitimate historical-import-to-prepared HTTP replay path; no restored legacy service, fake method or weakened assertion is authorized. This entire original regression remains open.

Affected original modules are fully listed in `review-runner/coverage.json`. Container-build production requires live configuration; security vertical requires a real Trivy database; several provider verticals require their expected installed runtime/library/browser layout, including the unavailable `/lib/x86_64-linux-gnu` observed by phase8. Other failing verticals have retained failed/null-result oracles and require precise diagnosis before any stronger cause or acceptance claim. None was skipped or reclassified as a passing test. The full affected-original acceptance remains open until those prerequisites/fixture gaps are handled without changing original assertions or deadlines.

No readiness budget, production guard, original assertion or original deadline was relaxed. BR-DOC has now passed the linked independent review. Full affected-original coverage, actual BuildKit/image/deployment and the larger CONFIG migration remain separate obligations.

Independent reviewer results: maintained BR16, admission8, local callers18, packaging9, original scripts, three type scopes and touched-file lint passed; four genuine mutants were detected with zero recorded source/dependency/tool drift. These results do not close the historical compaction or external vertical gates.
