# Nova demo handoff producer — bounded local integration

The new opt-in `kubeclaw.demo-handoff` stages use the original current-run qualified project-summary manifest and verified Buster import to create an immutable candidate, deliver full pipeline-generated demo access details privately, then request controller readiness. Every readiness invocation revalidates the original candidate, manifest/import and original durable operator request/receipt. The lifecycle core has no demo-specific stage semantics.

The compiler requires the explicit full build-image → checked manifest/deployment → generated credentials/exposure → blocking coverage-qualified authentication graph. Normalized demo policy (target, auth selector/protocol and initial retention) is included in the original source contract/approval digest, not merely downstream stage inputs. Omitted retention and explicit 604800 normalize identically; target/duration changes change source binding. Null, fractions, zero and technical overflow reject. No-demo runs retain technical-only semantics, explicitly identified in project CLI output. Ready-for-Acceptance is not Accepted.

The original operator adapter adds read-only `operator.receipt/lookup`. It verifies the original v2 durable request owner (run and delivery stage), stable delivery identity, configured target and exact rendered HTTP transport body, then requires the original completed Discord message receipt. The Discord renderer is extracted unchanged into a shared helper. Cross-stage delivery identity uses the already committed neutral SDK option; no further Core identity change is included here. An arbitrary receipt-shaped return or foreign original request cannot authorize Ready.

The controller client uses the fixed configured HTTPS endpoint, CA and projected service-account token, a bounded total deadline, bounded regular-file reads and bounded response-body reading. It durably stores exact serialized request bytes before the first POST. Lost response, later attempt and recovery use status only, without resend, timestamp refresh or retention renewal. Controller response digest, lease identity, request identity, state and selected retention interval must match. Controller persisted v2 retention handling is separately owned/committed; this producer requests and validates the selected duration. Authenticated human extension remains unimplemented.

Explicit endpoint/token mounting/adapter activation is the trust choice. Controller TokenReview identifies the configured whole runtime/service account; mounting in the same container does not isolate credentials from agents/plugins. Platform/SA/webhook tokens remain confidential. D01 explicitly permits and requires unredacted pipeline-generated demo credentials in the private notification and durable candidate/effect/artifact logs. The payload carries full tested URL, username and password; it does not silently clip them.

## Frozen source scope

- `skills/nova/plugins/demo-handoff/`: package/strict owning config, closed schemas, original candidate/delivery/ready stages, binding and controller client, README and three regression files.
- `skills/nova/project/demo.ts`, `compiler.ts`, `source.ts`, `cli.ts`, `README.md`: optional demo graph, normalized source policy binding, explicit technical-only reporting.
- `skills/common/plugins/operator-messaging/plugin.json`, `src/adapter.ts`, `src/delivery-records.ts`, new `src/discord-payload.ts`: read-only original receipt lookup and exact renderer extraction.
- Only new `operator.receipt` and `demo.handoff` entries in capability vocabulary and authorization map; the existing evidence resource correction is the separately frozen prerequisite documented in `evidence-resource-lock.md`.
- `package-lock.json`: new legitimate workspace package/link entry only.
- `skills/buster/plugins/demo-auth-smoke/tests/live-function.test.ts`: optional actual local TLS fixture and export of original generated demo Secret proof, preserving ordinary original test behavior.
- New test-only `cmd/buster-namespace-controller/demo-producer-interop_test.go`: actual original controller handler on TLS, original generated Secret and explicit Kubernetes/TokenReview contract vectors. Deliberately loses first successful POST response only after original durable CAS, then serves original status reconciliation. Its default Go test also invokes the original handler without a hidden skip.

No other authors' runtime, chart, readiness or generator changes belong to this slice.

## Evidence and limits

`docs/review/evidence/demo-handoff-interop.txt`: original local HTTPS app authentication, original Nova pipeline/import/effects/artifact stores, original Discord-shaped local HTTP receipt and original Go controller TLS/CAS pass. Exactly one notification; lost response reconciles; repeat status preserves timestamps/duration; foreign candidate/receipt run/stage and changed receipt payload reject; actual latest manifest replacement rejects. Build/deployment/source-terminal results and Kubernetes/TokenReview objects are explicitly contract vectors. This is not native deployed Ready E2E, genuine GitHub publication, real Discord delivery or deployed token authorization proof.

`demo-handoff-input-tests.txt`: original compiler source-binding/retention/graph regression and actual TLS client body-deadline/oversize/FIFO admission regression pass. `demo-handoff-package-tests.txt` records the actual owning package command including all three tests. `demo-handoff-compiler-compatibility.txt` records the existing original compiler check passing.

`demo-handoff-types.txt`, `demo-handoff-nova-types.txt`, `demo-handoff-shared-types.txt`: owning new package, Nova and original shared-consumer TypeScript pass with exact optional/no-unchecked rules retained. `demo-handoff-production-lint.txt`: scoped changed/new production passes. Whole selected lint in `demo-handoff-lint.txt` additionally reports the same six existing CLI diagnostics, confirmed against HEAD in `demo-handoff-cli-baseline-lint.txt`; no suppression or new lint defect is claimed away.

`demo-handoff-packages.txt` records an attempted existing package verifier which unexpectedly executes all native plugin tests: API-flow passed, then the pre-existing missing Chromium executable blocked axe. No browser installation or rerun was attempted. This does not constitute a passing all-package gate.

The first ordinary nonconfidential handoff test exposed a real nested resource-lock collision that prior direct confidential projection vectors did not cover. Its narrowly approved logical-resource correction (`test.plan.evidence`, `demo.candidate`) leaves original artifact locks intact. That prerequisite is separately reviewable. Native build, cluster deployment, Tailscale exposure and real service-account/receiver integration remain explicit open gates. No deployment, external notification or commit was performed by this author.

## Resumed package review — 2026-09-09

The interrupted working-tree package was reread against D01/D02/D06/D08 and the
controller/retention contracts. The unchanged original package test command
passed all three cases, including actual TLS app authentication, original Nova
stores/effects/import, exact original operator receipt lookup and original Go
controller CAS/status reconciliation. Wrong original receipt run, stage and
payload were each rejected without a second notification. Source/deployment and
Kubernetes objects remain explicit contract vectors, not deployed proof.

An additional live counterprobe disproved an initially suspected CLI defect:
recovery of a successful completed pipeline is rejected with
`RECOVERY_RUN_TERMINAL`, rather than returning a successful old snapshot and
claiming readiness again. The failed probe is preserved in
`package-tests-final.txt`. The speculative CLI output change was fully reverted.
The original handoff regression now explicitly verifies that terminal recovery
rejects and leaves the actual credential delivery count at one. No production
fix is claimed for this disproved suspicion.

Fresh logs are under `docs/review/evidence/resume-20260909/demo/` for orchestration integration:

- `package-tests.txt`: `npm test --workspace @kubeclaw/plugin-demo-handoff`, exit 0,
  three passing tests, no skip (before the additional completed recovery check).
- `build.txt`: `npm run build --workspace @kubeclaw/plugin-demo-handoff`, exit 0.
- `nova-types.txt`: `npx --no-install tsc --noEmit -p skills/nova/tsconfig.json`, exit 0.
- `controller-race.txt`: `go test -race -count=1 ./cmd/buster-namespace-controller`,
  exit 0; original controller package including producer interoperability.
- `production-lint-configured.txt`: canonical ESLint config over handoff source,
  project demo/compiler/source, capability vocabulary and authorization, exit 0.
- `cli-lint.txt`: canonical CLI ESLint, exit 1 with the same six existing loader/
  nesting errors recorded in `demo-handoff-cli-baseline-lint.txt`; no suppression.
- `production-lint.txt`: first lint command omitted the repository's explicit
  config path and exited 2; corrected command above passed. This invocation error
  is preserved rather than hidden.

PATH used the supplied `/workspace/scratch/4e25cf57c177/toolchains/bin` and
`toolchains/go/bin`. No deployment, real recipient send, CI run or commit was
performed. The producer package still does not close native infrastructure,
authenticated human acceptance or authenticated retention-extension gates.

Final resumed regression: `package-tests-terminal-recovery.txt` records the
original package command with the added original terminal-recovery assertion,
exit 0 (3 tests, 0 failed, 0 skipped). `handoff-test-lint.txt` records canonical
ESLint over that changed test, exit 0. Scoped `git diff --check` also passed.
This resume changed only the additional recovery assertion and this review note;
the earlier uncommitted implementation remains the package under review.
