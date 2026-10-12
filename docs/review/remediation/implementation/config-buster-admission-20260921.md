# Buster service admission configuration

Status: BA1–BA6/BA-DOC locally accepted after fresh independent review. No overall CONFIG, D17 component-file migration or native acceptance.

## Preimplementation criteria

- BA1: `operator.buster.admission` solely authors required positive safe integers `maximumActiveJobs` (2 jobs), `maximumQueuedJobs` (8 waiting jobs), and `maximumConcurrentAttempts` (64 declared concurrent attempts). Strict unknown/missing/type/range rejection; no PID-to-task reinterpretation.
- BA2: Actual CLI loads one immutable startup snapshot for preparation and admission. Production composition passes explicit required admission policy to the service. No per-request reload, duplicated default or optional production fallback.
- BA3: Remove three entrypoint ENV authors and runtime JSON authors. Reject the three retired ENV keys and JSON fields even when equal to canonical values. Keep credentials, trust, version and other unconverted settings separate.
- BA4: Two authored profiles exercise actual service queue admission, active-job and weighted attempt scheduling, replay and restart rejection through the production loader. Preserve original shutdown, reservation and remote-runtime assertions; explicit modeled preparation does not prove native isolation.
- BA5: Meaningful private mutations detect restored local admission defaults or ignored queue/concurrency policy. Preserve original cases and record any fixture adaptation. Canonical chart config remains the mounted author without a second values override.
- BA6: Required scoped types/lint and relevant originals pass; source snapshots, failures and limitations retained. Fresh nonauthor review required. Preparation slot limits and service job lifetime differ; no arbitrary active-jobs-to-slot comparison or global F6 claim.
- BA-DOC: Document units/defaults, consumers, restart effects, migration errors and exact inventory lineage without rewriting historical counts. No cluster/native/live CONFIG acceptance.

## Baseline and scope

The baseline manifest is `docs/review/evidence/config-buster-admission-20260921/before-identities.json`.
There are three author layers: entrypoint ENV-to-runtime JSON, production runtime JSON fallback, and optional service constructor defaults. Consumers are submit admission, weighted queue drain and startup recovery. The constructor validates positive safe integers already. The shared Buster preparation policy remains a separate responsibility.

No AGENTS.md was found in this checkout or its parent scan. Acceptance F1–F6/F-DOC in `acceptance-20260920.md` governs this bounded migration. Shared source edits wait for the independently running Wait/Operator provenance-bound test run to finish.

## Preimplementation default correction from the image author

Before changing the canonical value, a complete image/entrypoint search found
`docker/Dockerfile.buster-runtime` sets `BUSTER_V2_MAX_QUEUED_JOBS=8`. This overrode
all three fallback values of 16 in actual image startup. Root authorized preserving
the effective image value 8, removing that ENV author, and documenting 16 only as
the displaced historical fallback. BA1 therefore requires 8; no capacity is raised.
The image baseline is added to the before manifest before its ENV removal.

## Coherent decoder extraction and fixture changes

The canonical baseline lint found four production.ts violations (310-line loader,
complexity 97, 414 logical file lines and implicit environment access). The
configuration assembly now calls direct decoders for command/network/scanner,
browser and cluster capabilities. Shared scalar/secret validators and capability
source-presence checks retain their original policy. No generic execution
framework, alternate production constructor or capability-policy migration is
introduced. The CLI explicitly supplies its environment for external secrets and
build revision. Canonical admission fields remain separate from those inputs.

The original runtime-configuration test predates the already-required preparation
argument. Its configuration-only adapter supplies a rejecting preparation object
(no preparation operation is expected), the canonical startup settings and the
original explicit secret environment. Retired archive fields are removed from
that fixture, not re-enabled in production. PEM exports are converted to strings
for strict typing, and a duplicate identical maximumResultBytes property is
removed. Original assertions are retained. Shutdown's deliberate active-job=1
profile now derives from the canonical admission policy; its assertions/deadlines
are unchanged. Existing modeled service fixtures obtain canonical admission via
the original author loader, without hand-copied defaults.

Initial admission execution failed before startup because the private proot
runtime needed its retained libtalloc search directory. Run2 reached all four
cases, but the controlled execution fixture incorrectly granted command.execute
without its invoker settings; two cases timed out at their unchanged 30-second
bounds. Run3 fixes that fixture by granting no external capability and invokes
the same actual service callback: 4/4 pass, zero skips/cancellations. These
failures are retained. None is native execution evidence.

The first new Helm probe selected the separate namespace-controller Deployment,
which has no Buster swarm checksum, and failed before its checksum assertion. The
selector now identifies the actual Deployment containing `buster-v2-runtime`;
production rendering is unchanged. The same run's actual unprivileged CLI
probes passed all three retired ENV rejections before opening fd3.

## Cross-role Helm consumer found during independent integration

Root's unchanged private-access render suite exposed a remaining real consumer:
Prism's `_swarm-config.tpl` still accepted only `operator.buster.preparation`,
so the valid new admission object caused 4/5 passes and one render failure. That
raw failure remains in the independent Tailscale evidence. The helper now requires
exactly preparation and admission; admission keys, integer bounds and safe range
come from the canonical schema. Existing preparation checks remain unchanged.
The original Prism Helm suite is retained and 27 focused admission positive/negative
cases are appended, including missing/extra siblings. This is a strict consumer
update, not a wildcard exception for another role's configuration.

## Executed checkpoint before the final review runs

Evidence directory: `docs/review/evidence/config-buster-admission-20260921/`.
All filesystem admission executions use the existing private GNU flock/GNU tar
binaries through proot; this is not native ownership or kernel-isolation proof.

| Evidence | Executed result | Boundary |
| --- | --- | --- |
| `types-final` | exit 0 | Scoped admission, shutdown and original runtime-configuration TypeScript; whole engine check still pending. |
| `lint-final` | exit 0 | Full changed production decoder/CLI/service/shared-loader and then-present fixtures; subsequent new CLI-positive/Prism cases need final lint. |
| `preservation` | exit 0 | 21 original runtime-config assertions, 27 original shutdown assertions and 109 scalar provider bindings preserved. |
| `admission-run3` | 4/4 | Actual service queue/drain/replay and durable recovery with explicitly modeled preparation authority; later snapshot-change assertion is pending rerun. |
| `runtime-config-original` | exit 0 | Original configuration script assertions and 12 then-added legacy JSON values. Equal queue-8 cases were subsequently added and require rerun. |
| `chart-cli-final` | 2/2 | Real Buster Helm profiles/checksum/mount and retired ENV rejection; actual service CLI rejects all three inherited ENV authors before opening fd3. |
| `original-consumers` | 168/168 | Unmodified Prism loader/Control/Studio consumers, six original Buster shutdown cases and genuine competing-process result reservation; zero skips/cancellations. |
| `prism-helm-final` | 246/246 | Entire original Prism Helm module plus 27 strict admission cases; zero skips/cancellations. |

The earlier pre-review manifest remains historical.
`source-identities-pre-review-v2.json` includes the strict Prism helper correction
and freezes the current 30 scoped source/test/doc files while the independent
Wait suite runs. Positive CLI startups, original full remote-runtime script,
private admission mutants, final engine/types/lint and fresh independent review
remain pending at this checkpoint. No row above substitutes for those checks.


## Historical intermediate checkpoint: unresolved original regression

The real CLI positive startup/health/shutdown cases passed 2/2 (`cli-positive`).
The private mutation runner reran the unchanged four admission cases successfully,
including the startup snapshot-change assertion; restoring the old defaults and
removing weighted concurrency each caused an actual assertion failure. These
results supersede only their pending entries above.

The full original remote-plan-runtime script failed at its unchanged lost-submit
fault oracle: expected `TIMEOUT:REMOTE_STATE_CANCELLED`, observed
`TIMEOUT:REMOTE_STATE_UNKNOWN` with transport abort classification. Both the
uninstrumented failure (`remote-runtime-original`) and diagnostic failure
(`remote-runtime-observed-run2`) are retained. The latter observed DELETE arriving
and returning HTTP 200 with `cancelling` in approximately 111 ms; this establishes
neither terminal cancellation within the original 300-ms cleanup budget nor its
underlying cause. A separate observer for terminal store transitions and GET
responses is prepared but has not run. No deadline, original assertion or production
behavior was changed to obtain a pass. This original regression remains open and
prevents completed BA acceptance. Final whole-engine types, expanded lint,
preservation checks and independent review also remain pending.


The subsequent unchanged original diagnostic (`remote-runtime-persistence-observed`)
also failed and narrows that observation: relative to DELETE start, the service
returned durable `cancelling` at 125.6 ms, the terminal store transition returned
`cancelled` at 286.0 ms, and the concurrent GET returned `cancelled` at 300.48 ms.
The transport aborted at 301.16 ms under the unchanged 300-ms cleanup deadline.
Thus this run proves terminal persistence occurred before that boundary but the
terminal HTTP observation missed it. It does not establish a general latency
guarantee or resolve the failing original test. Exact events and the separate
observer are retained in `cancellation-persistence-timing.json` and
`trace-cancellation-persistence.mjs`; production/test bytes were unchanged.


## Separate atomic-cancellation correction

The real status-read/transition race is addressed in the separately specified
[atomic cancellation slice](buster-atomic-cancellation-20260921.md). Its author
checks now pass the entire unchanged original remote-runtime script, including
the 600-/300-ms fault assertions. The prior timing failures remain retained, and
no deadline was increased. The correction keeps existing writer fences and CAS,
while making the terminal-state decision atomic. This does not alone complete
BA: its remaining final whole-engine/expanded lint/config checks and independent
review are still pending.


## Final author checkpoint

The remaining checks executed serially on the independently accepted atomic
cancellation source: whole Buster engine TypeScript, maintained admission test
TypeScript, complete touched TS/MTS/MJS lint, extended preservation comparison,
and original runtime-config script all exited 0 (`completion-results.json`).
The latter includes rejection of retired JSON values equal to canonical queue 8.
The comparison retains all 21 original runtime-config assertions, 27 shutdown
assertions, 101 Prism Helm assertions and 109 original provider scalar bindings.

The latest unchanged admission cases also passed in the cancellation slice's
10/10 shutdown/admission run. Actual CLI startup/health/stop profiles passed 2/2;
Buster render plus retired-ENV CLI cases passed 2/2; full Prism Helm passed 246/246;
the separate original consumer set passed 168/168. These are distinct recorded
runs, not one fabricated aggregate. Both private admission mutations caused
actual assertions on the pre-cancellation-correction source; their current-source
independent repetition remains part of fresh review. All initial failures,
including the missed Prism consumer and full remote timing failures, remain
recorded. The original full remote-runtime script now passes after the separately
reviewed correctness fix, with its original deadlines and assertions unchanged.

The final source manifest binds the current admission scope together with the
cancellation slice's source/test closure. Production and tests are frozen for
fresh review. No image was built, no deployment occurred, and modeled preparation
is not native ownership proof.

D17 now requires a coherent component-file configuration structure. This bounded
migration currently has one author at operator.buster.admission; it does not
claim the subsequent per-engine/core/plugin/orchestrator file migration is done.
That migration must replace the current author through explicit references, not
introduce a parallel default or second editable values copy.


## Independent bounded acceptance

The [fresh independent review](independent-config-buster-admission-20260921.md)
accepts BA1–BA6/BA-DOC locally after its own actual admission/CLI/config checks
and both meaningful admission mutants on the final source. Its execution ended
with exit 0 and no source drift. Earlier pending statements above describe the
explicitly dated intermediate/author checkpoints; their failures remain retained.

Only this three-setting migration is accepted. The complete CONFIG inventory,
D17 component-file migration, host-capacity agreement and real deployment/native
proof remain open.
