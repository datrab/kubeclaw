# Manifest-to-Lint Parity Final Audit

Status: historical parity audit; cutover and legacy deletion are complete

This audit records the last shadow-only state. The cutover final audit records
the authoritative current state.

## Result

All 28 manifest baseline items are proved. Five behaviors are preserved,
seventeen are improved, and six accepted legacy defects are removed. No item
is deferred or blocked.

## Authority

The legacy Buster `manifest` suite remains authoritative. The replacement
`kubernetes-schema` and `kubernetes-policy` tools remain experimental and
shadow-only. Shadow findings, crashes, timeouts, and blocked shadow stages
cannot change the legacy gate result.

## Real proof

The parity proof uses real YAML parsing, Helm rendering, kubeconform, local
schemas, policy packs, Nova plugin discovery, capability grants, the lint
adapter, PipelineRunner, durable journals, and the artifact store. Original
evidence is read back from the content-addressed blob store.

The fixtures cover raw YAML, Helm, Deployment, StatefulSet, DaemonSet, Job,
CronJob, several workloads, several containers, init containers, Secrets,
ConfigMaps, ServiceAccounts, invalid schemas, invalid YAML, path denial,
limits, policy findings, shadow crashes, and shadow timeouts.

## Accepted differences

- Explicit input lists replace hidden manifest discovery.
- Raw and rendered resources use one pinned local schema authority.
- Each container and workload is evaluated separately.
- All declared Secret and ConfigMap sources can be resolved.
- ServiceAccount pull secrets count as credentials.
- Findings and bounded original evidence replace console-only summaries.
- Operator-approved declarative policy packs replace project policy code.

## Scope boundary

This phase does not activate the replacement, mark `manifest` migrated, delete
legacy code, apply resources, contact a Kubernetes cluster, or prove runtime
health. Those actions belong to cutover or later runtime suites.

## Verification

The following checks passed on 2026-08-15:

- `npm run verify:test-gate:manifest-lint-parity`
- `npm run verify:contracts`
- `npm run verify:plugin-packages`
- `npm run docs:check`
- `npm run progress:scaffold:typecheck`
- `npm audit --omit=dev`
- `git diff --check`

The proof covers 119 architecture decisions, 93 unit parity items, 28 manifest
parity items, 35 live plugin packages, and 40 executable plugin registrations.
The production dependency audit found zero vulnerabilities.

The first full contract run stopped because the pod npm configuration omitted
locked development dependencies. The dependencies were installed from the
lockfile with `npm ci --include=dev`. The full contract run then passed. This
was a worktree environment problem, not a product defect.

## Terra review

The review used Codex with `gpt-5.6-terra` and high reasoning in local mode.
The review found three valid test gaps. First, the parity test declared a Helm
chart but did not prove that the chart was rendered and processed. The test now
requires non-empty `helm-render` evidence from both schema and policy tools.
Second, a whitespace mismatch prevented the legacy-valid fixture from adding
the intended explicit environment variable. The shared fixture now uses the
exact Deployment indentation and asserts that the required variable is
present. Third, the controlled valid comparison did not assert a legacy pass
on the same file used by the replacement. Both paths now consume the shared
valid fixture, and the test requires a legacy pass plus clean replacement
schema and policy results.
The focused parity gate passed after each fix. Three findings were accepted and
fixed. No findings were rejected. The final review reported no actionable
findings and classified the patch as correct.

## Closeout

The machine ledger, generated parity report, focused proofs, full regressions,
and Terra review are the closeout authority. Cutover may start only while all
28 items remain proved and the old bridge still reports `unmigrated`.
