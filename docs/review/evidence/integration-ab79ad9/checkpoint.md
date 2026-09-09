# Exact committed integration checkpoint

Source: `ab79ad928cbf54072fe0b3eaabd8b5ee60dea7d1`. Detached checkout: `/workspace/scratch/4e25cf57c177/kubeclaw-integration-ab79ad9`.
The checkout is clean after all verification. Existing real dependencies were copied
with relative workspace links resolving to this checkout; no shared dirty source
was tested. No absolute dependency links were present.

All 14 selected commands passed. The Node test suites contain 112 passing cases,
zero failures and zero skips; additional original contract scripts and TypeScript
gates also passed. No new integration regression was found in this bounded set.

Original commands and per-command complete output are listed below. `manifest.json`
records each log SHA-256 digest. The first failing gate is none in this selected set.

- `npm run verify:worker-core:contracts` — exit 0; [core-1.log](core-1.log)
- `npm run verify:worker-core:attempt-executor` — exit 0; [core-2.log](core-2.log)
- `npm run verify:worker-core:local-runtime` — exit 0; [core-3.log](core-3.log)
- `npm run verify:worker-core:role-surfaces` — exit 0; [core-4.log](core-4.log)
- `npm run verify:test-gate:remote-import` — exit 0; [core-5.log](core-5.log)
- `node tests/verification/contracts/check-pipeline-committed-source-snapshot.mts` — exit 0; [core-6.log](core-6.log)
- `node --test skills/prism/tests/engine.test.mts skills/prism/tests/engine-cache.test.mts skills/prism/tests/worker-service.test.mts skills/prism/tests/worker-cancellation.test.mts skills/prism/tests/provider-cancellation.test.mts tests/verification/reliability/worker-deadline.test.mts` — exit 0; [prism-1.log](prism-1.log)
- `node --test skills/prism/tests/design-rounds.test.mts skills/prism/tests/design-round-client.test.mts skills/prism/tests/preferences-generation.test.mts skills/prism/tests/pipeline-preference-subject.test.mts skills/prism/tests/preference-bridge.test.mjs` — exit 0; [prism-2.log](prism-2.log)
- `npm run typecheck --workspace @kubeclaw/prism` — exit 0; [prism-3.log](prism-3.log)
- `node --test tests/verification/deployment/deployment-release.test.mjs tests/verification/deployment/release-configuration.test.mjs tests/verification/deployment/release-images.test.mjs` — exit 0; [release-scaffold-source-1.log](release-scaffold-source-1.log)
- `node tests/verification/contracts/check-deploy-prism-command.mts` — exit 0; [release-scaffold-source-2.log](release-scaffold-source-2.log)
- `node --test tests/skills/nova/project_setup/progress-scaffold.test.mjs tests/skills/nova/project_setup/scaffold-regeneration.test.mjs` — exit 0; [release-scaffold-source-3.log](release-scaffold-source-3.log)
- `npm run progress:scaffold:typecheck` — exit 0; [release-scaffold-source-4.log](release-scaffold-source-4.log)
- `node --test tests/verification/reliability/approval-source.test.mjs tests/verification/reliability/admin-repair.test.mjs` — exit 0; [release-scaffold-source-5.log](release-scaffold-source-5.log)

## Scope and limits

This covers WorkerCore contracts, execution/local-runtime/role boundaries, the
JUnit-aware remote import gate, committed source snapshots, Prism engine/cache,
worker cancellation and actual HTTP bodies, design-round/preference consumers,
actual Git/Helm release selection, scaffold regeneration and source-bound approval
and administrative repair. PGlite-backed tests do not establish live PostgreSQL
locking/DDL acceptance. Shape-valid image receipt fixtures establish rendering
contracts, not built/pulled production images.

Known native Chromium/process-observation/delegated-cgroup prerequisite failures
were not reinstalled or repeatedly exercised. This is not a full-suite green claim,
live browser/cgroup isolation proof, concurrent per-attempt CPU attribution, live
Pod imageID/startup/migration acceptance, CI or deployment. No source edits, commits,
external messages or deployment actions were performed.
