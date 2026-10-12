# Independent Buster readiness configuration review

Status: BR1–BR3 and the bounded documentation requirements pass independent local review. The local BR4 regression, type, lint and packaging checks below pass; **full affected-original BR4 coverage remains open** because the historical compaction contract and external vertical prerequisites are unresolved. No overall CONFIG, BuildKit isolation, native preparation, image or deployment acceptance is claimed.

The reviewer did not author this readiness migration. Earlier Buster admission work is prior baseline, not newly self-reviewed implementation. Criteria remain [the original BR contract](config-buster-readiness-20260921.md). Evidence is in [the independent review directory](../../evidence/independent-config-buster-readiness-implementation-20260921/).

## Actual independent checks

The reviewer wrote separate orchestration and checked the final 35-path author integration plus report hashes before execution. `run1` (session 21779) exits 0:

- Full maintained readiness verifier: 16/16, including all five original readiness cases, three configuration cases, six actual consumer cases and both Helm charts.
- Original admission/config/CLI/render group: 8/8. Original shutdown-storage, coverage-remote and Nova projection modules: 18/18.
- Full original remote-plan runtime, remote-runtime configuration, actual remote-provider and default production replay scripts: exit 0. Deployment-truth: exit 0.
- Complete component packaging module: 9/9. All three affected type projects and the canonical frozen touched-file lint scope: exit 0.
- Real separate GNU flock exclusion/reacquisition and GNU tar archive roundtrip: exit 0.

No TAP case is skipped or cancelled. These are complete selected local modules, not filtered successes. They do not replace the explicitly outstanding original vertical and compaction cases.

`controls1` (session 29334) exits 0 because all four bad variants are detected. Each mutation is uniquely targeted, source-hash checked, actually loaded, and archived beside its original bytes. Manual review of the named TAP failures confirms:

| Mutation | Actual distinguishing failure |
| --- | --- |
| Restore missing-policy default | Direct service invalid-policy case no longer throws: `Missing expected exception`. |
| Restore individual field defaults | The same strict direct-service boundary admits an incomplete policy. |
| Ignore execution policy and use 1000 ms | The actual 2500-ms profile returns HTTP 503 instead of 200 for the 1200-ms executable. |
| Ignore output policy and use 65536 bytes | The actual 64-byte profile returns HTTP 200 instead of 503 for 256-byte output; direct immutable-capture case also incorrectly reports ready. |

Each control runs the full six-case consumer module. Failures are concrete behavior/exception assertions, not loader, syntax or missing-tool errors. `semantic-review.json` retains the named failures and expected/actual observations.

Both runs have source drift `[]`; no diagnostic source-write violation was observed. The broad positive manifest binds 35,326 source, dependency, GNU-tool and observed dynamic-library identities, including global npm dependencies. The module trace observes 2,550 unique file/hash pairs with no bound mismatch. Two temporary modules are exact hash-equal copies of bound artifact-store and stage fixture sources; neither is an unclassified dependency. All final author hashes still match at the post-run check.

The exact pathname hook maps `/usr/bin/flock` and `/usr/bin/tar` to real bound GNU executables for spawn/execFile variants without changing arguments, options, descriptors or results. It does not replace the provider/sandbox or use PRoot around actual Node. Provider children with intentionally clean environments do not inherit tracing; their source/tools are broadly bound, not falsely claimed dynamically observed. The write guard diagnoses selected Node APIs and aliases; it is not a complete filesystem sandbox.

## Authority, consumer and fixture review

`buster-engine.config.json` is the single owner of the required readiness object. Schema and both Helm paths enforce the exact two fields and existing integer ranges. The existing complete bundle projects them into typed settings; the factory validates before registry/store creation, and the service retains a frozen copy. The real `BuildkitReadiness` passes both explicit values to unchanged `runDependencyProcess`. The generated/runtime JSON author is removed and its presence is rejected even for null, empty and equal values. No code fallback or separate loader was introduced. Worker Core policy forwarding remains intact.

The four profiles use a genuine executable process, not a substituted readiness checker: 300/2500-ms budgets around a 1200-ms fixture, and 64/1024-byte ceilings around 256-byte output. They verify HTTP readiness, real diagnostic causes, exact invocation arguments, PID/start identity and termination. File mutation after settings loading and direct options mutation after construction preserve captured values. Invalid settings reject before a probe; disabled capability never starts one. New admission and accepted replay are fenced on unavailable dependency, while terminal replay returns without another invocation.

These profiles establish the specified authored-limit effects, not millisecond-precise scheduling. Original process timeout/shutdown assertions remain unchanged and pass. The PID check permits an exact-identity zombie, so it establishes termination rather than an independent universal reaping guarantee. The executable is explicitly a Node fixture, not a running BuildKit daemon; availability and process bounds do not prove build isolation.

The initial static review found unsafe reliance on `fs.cpSync(dereference:true)` plus a symlink-only check before chart mutation. The corrected test first validates private parent containment, detaches symlink or original-inode aliases, creates replacement files exclusively, and verifies every target's realpath/device/inode against every original. It repeats those checks before every bundle write. Both actual chart cases now pass with unchanged canonical author hashes. This repairs fixture isolation rather than weakening production guards. The original Helm fixture uses the real native-policy generator, explicit namespace and a valid-shaped immutable image reference; it remains render-only evidence.

The independent TypeScript AST assertion mapping covers all 18 listed caller files: all 411 original assertion calls remain, including 31 in the five-case original readiness module and 76 in the still-unresolved compaction module. Only whitespace and explicit readiness-policy insertions are normalized. Assertion preservation alone is not successful execution. Original deadlines and contract checks were not weakened to obtain these results.

## Documentation, history and remaining gates

The operator documentation identifies the sole owner, units/ranges, required policy even when disabled, rejection of the retired JSON field, immutable capture and restart/rollout instructions. It distinguishes `/healthz`, `/bootstrapz`, `/readyz` and readiness from isolation. The author report now separates historical competing authors from implementation and retains the failed/aborted type, GNU-tar, queue and alias checkpoints. None is retroactively converted to a pass.

The original compaction regression still targets the old full-wire/manual-compaction contract while the public store alias now resolves to PreparedStore. A modeled wrapper cannot recreate `compactCompletedArchive`; the real historical-store/import/prepared-replay obligation remains open. External container-build, browser, security and other vertical runs have unresolved prerequisites or retained failures; they are not counted as independent passes here. Their original assertions remain present. Thus this report does not close full affected-original BR4 coverage.

The BR touched lint scope is green. This does not close the previously recorded wider 31 Runner/test and 12 child quality findings, the separate execution-policy migration, or any new private refactor. Actual built images, real BuildKit and cluster activation remain unexecuted. No further runtime job is active at this checkpoint.
