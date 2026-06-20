export async function registerRepoDocsArea({
  record,
  sourceRoot,
  overlayRoot,
  contractPath,
  installFakeRedis,
  xaddEvents,
  flushAsync,
  startGatewayServer,
  fs,
  os,
  path,
  assert,
  execFileSync,
  readOverlayText,
  materializeRuntimeTree,
  importRuntimeModule,
  ensureDir,
  writeExecutable,
  runtimeRoot,
  sandboxRuntimeRoot,
  pipelineEntryMod,
  pipelineIndexMod,
  pipelineRunnerMod,
  orchestrationMod,
  pipelineRedisMod,
  runtimeMod,
  gatewayMod,
  discordMod,
  lifecycleMod,
  lifecycleStateMod,
  monitorMod,
  redisLogMod,
  pathsMod,
  busterPipelineMod,
}) {
await record('behavior verification doc reflects the live repo-based workflow', async () => {
  const behaviorDoc = fs.readFileSync(path.join(sourceRoot, 'tests', 'verification', 'behavior-verification.md'), 'utf8');
  const verificationReadme = fs.readFileSync(path.join(sourceRoot, 'tests', 'verification', 'README.md'), 'utf8');
  const statusArtifactsReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'reference', 'status-and-artifacts.md'), 'utf8');
  const modulesAndGatesDoc = fs.readFileSync(path.join(sourceRoot, 'docs', 'pipeline', 'modules-and-gates.md'), 'utf8');

  assert.equal(behaviorDoc.includes('use the live repo root as the source of truth'), true);
  assert.equal(statusArtifactsReference.includes('`.swarm/<gate_id>-gate-status.json`'), true, 'status/artifact reference must list approval gate persisted state');
  assert.equal(modulesAndGatesDoc.includes('persist approval state in `.swarm/<gate_id>-gate-status.json`'), true, 'modules/gates docs must list approval gate persisted state');
  assert.equal(behaviorDoc.includes('`<repo-root>/docs/archive/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`'), true);
  assert.equal(behaviorDoc.includes('treat `docs/archive/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` as the authoritative inventory, stream-identity, and contract-boundary spec'), true);
  assert.equal(behaviorDoc.includes('treat `docs/archive/legacy-root-docs/telemetry-event-schema.md` as the authoritative event-by-event payload reference, kept in exact inventory parity with that contract'), true);
  assert.equal(behaviorDoc.includes('`pipeline:telemetry:<project>:<run_id>`'), true);
  assert.equal(behaviorDoc.includes('run verifiers against current source'), true);
  assert.equal(behaviorDoc.includes('take pass totals from the live JSON output of `tests/verification/behavior/verify.mjs`'), true);
  assert.equal(behaviorDoc.includes('`tests/verification/run-full-verification.sh` is the canonical exhaustive fail-fast local wrapper'), true);
  assert.equal(behaviorDoc.includes('It includes deployment truth, runtime collision, live subagent and ACP launch smokes, required live Redis smoke, telemetry contract, focused contract guards, docs checks, whitespace checks, and the default behavior harness.'), true);
  assert.equal(behaviorDoc.includes('`tests/verification/run-fast-verification.sh` is the default local feedback wrapper'), true);
  assert.equal(behaviorDoc.includes('It includes startup smokes, runtime guards, deterministic contracts, docs checks, and selected behavior areas without Helm, kubeconform, live subagent, ACP, Redis, or cluster dependencies.'), true);
  assert.equal(behaviorDoc.includes('Fast/full wrappers are silent on clean passes unless a step emits warning output.'), true);
  assert.equal(behaviorDoc.includes('A failed step prints its buffered output and exits red.'), true);
  assert.equal(behaviorDoc.includes('Coverage includes:'), true);
  assert.equal(behaviorDoc.includes('module and gate terminal result identity, including `run_id`, `module_id`, `gate_id`, `attempt`, `dispatch_id`, `gateway_label`, and `session_key`'), true);
  assert.equal(behaviorDoc.includes('Latest live repo rerun summary'), false);
  assert.equal(behaviorDoc.includes('Final closure-gate snapshot'), false);
  assert.equal(/\bnow\b/i.test(behaviorDoc), false, 'behavior verification doc should use current-state language, not changelog phrasing');
  assert.equal(/\bno longer\b/i.test(behaviorDoc), false, 'behavior verification doc should not describe removed old behavior');
  assert.equal(/\bpreviously\b/i.test(behaviorDoc), false, 'behavior verification doc should not preserve historical comparison phrasing');
  assert.equal(/\breplaced\b/i.test(behaviorDoc), false, 'behavior verification doc should not use replacement phrasing');
  assert.equal(behaviorDoc.includes('Passed: `263`'), false);
  assert.equal(behaviorDoc.includes('Failed: `0`'), false);
  assert.equal(behaviorDoc.includes('kubeclaw-main-updated.zip'), false);
  assert.equal(behaviorDoc.includes('_audit_lifecycle_unification/rebuilt-artifact'), false);
  assert.equal(behaviorDoc.includes('/home/node/.openclaw/workspace/git-repo/TELEMETRY_CONTRACT_V1.md'), false);
  assert.equal(behaviorDoc.includes('`memory.recalled` verified compatibility-only and still a no-op exporter'), false);
  assert.equal(behaviorDoc.includes('Passed: `9`'), false);
  assert.equal(behaviorDoc.includes('Passed: `193`'), false);

  assert.equal(verificationReadme.includes('`docs/archive/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` is the authoritative telemetry contract for canonical inventory, stream identity, and compatibility boundaries'), true);
  assert.equal(verificationReadme.includes('`docs/archive/legacy-root-docs/telemetry-event-schema.md` is the event-by-event payload reference and stays in inventory parity with that contract'), true);
});

await record('verification docs and hardening trackers point at tests-owned verifier entrypoints, not stale scripts wrappers', async () => {
  const verificationReadme = fs.readFileSync(path.join(sourceRoot, 'tests', 'verification', 'README.md'), 'utf8');
  const behaviorDoc = fs.readFileSync(path.join(sourceRoot, 'tests', 'verification', 'behavior-verification.md'), 'utf8');
  const deploymentReadme = fs.readFileSync(path.join(sourceRoot, 'tests', 'verification', 'deployment', 'README.md'), 'utf8');
  const pipelineReadme = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'README.md'), 'utf8');
  const phase4Tracker = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'root-docs', 'archive', 'pipeline-hardening', 'pre-plugin', 'PHASE4_EXECUTION_TRACKER.md'), 'utf8');
  const readinessChecklist = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'root-docs', 'archive', 'pipeline-hardening', 'pre-plugin', 'PIPELINE_PRODUCTION_READINESS_CHECKLIST.md'), 'utf8');
  const openPoints = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'root-docs', 'archive', 'pipeline-hardening', 'pre-plugin', 'PIPELINE_OPEN_POINTS.md'), 'utf8');
  const executionPlan = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'root-docs', 'archive', 'pipeline-hardening', 'phase3', 'PHASE3_PHASE4_EXECUTION_PLAN.md'), 'utf8');
  const phasePlan = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'root-docs', 'archive', 'pipeline-hardening', 'pre-plugin', 'PIPELINE_HARDENING_PHASE_PLAN.md'), 'utf8');
  const phaseCompletionChecklist = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'root-docs', 'archive', 'pipeline-hardening', 'pre-plugin', 'PHASE_COMPLETION_REVIEW_CHECKLIST.md'), 'utf8');

  assert.equal(fs.existsSync(path.join(sourceRoot, 'scripts', 'phase8-verify.mjs')), false);
  assert.equal(verificationReadme.includes('This directory is the canonical home for repo verification entrypoints and verification docs.'), true);
  assert.equal(verificationReadme.includes('The full wrapper is exhaustive and fail-fast.'), true);
  assert.equal(verificationReadme.includes('It runs Nova/Buster startup smokes, local runtime guards, contract checks, docs checks, and selected fast behavior areas.'), true);
  assert.equal(verificationReadme.includes('clean pass: no output'), true);
  assert.equal(verificationReadme.includes('warning output from a passing step: warning lines only'), true);
  assert.equal(verificationReadme.includes('failed step: failed step name plus buffered output'), true);
  assert.equal(verificationReadme.includes('`tests/verification/run-local-acp-verification.sh`: direct ACP/provider smoke wrapper'), true);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'tests', 'verification', 'run-local-acp-verification.sh')), true);
  assert.equal(verificationReadme.includes('live launch smokes are explicit gate surfaces, not implicit proof hidden inside the repo-only behavior harness'), false);
  assert.equal(verificationReadme.includes('`scripts/` is the home for operator utilities like `deploy.sh` and `setup.sh`'), true);
  assert.equal(verificationReadme.includes('`scripts/deploy.sh image [nova|buster|both]`, `scripts/deploy.sh code [nova|buster|both]`, `scripts/deploy.sh smoke`, and `scripts/deploy.sh smoke-agent <nova|buster>` are the live deployment command surface'), true);
  assert.equal(verificationReadme.includes('`.swarm/logs/pipeline/latest.json` is the canonical pointer into the run-scoped replay bundle under `.swarm/logs/pipeline/runs/<run_id>/`'), true);
  assert.equal(verificationReadme.includes('`.swarm/logs/pipeline/runs/<run_id>/{pipeline.jsonl,discord.jsonl,nova-injections.jsonl,buster-telemetry-fallback.jsonl,redis/redis-exchanges.jsonl,redis/redis-ops.jsonl,summary.json}` is the replay/audit bundle for deploy, replay, and operator handoff evidence'), true);
  assert.equal(verificationReadme.includes('`.swarm/logs/redis/{redis-exchanges.jsonl,redis-ops.jsonl}` plus `.swarm/logs/pipeline/runs/<run_id>/redis/` is the Redis audit artifact layout'), true);
  assert.equal(verificationReadme.includes('the small verifier shims under `scripts/` are retired in this cleanup slice'), false);
  assert.equal(behaviorDoc.includes('treat `.swarm/logs/pipeline/latest.json` plus `.swarm/logs/pipeline/runs/<run_id>/{pipeline.jsonl,discord.jsonl,nova-injections.jsonl,buster-telemetry-fallback.jsonl,redis/redis-exchanges.jsonl,redis/redis-ops.jsonl,summary.json}` as the canonical replay/audit bundle, with Redis audit artifacts also mirrored under `.swarm/logs/redis/{redis-exchanges.jsonl,redis-ops.jsonl}`'), true);
  assert.equal(deploymentReadme.includes('live deployment/build/smoke commands live under `.github/workflows/build-images.yaml`, `scripts/deploy.sh image [nova|buster|both]`, `scripts/deploy.sh code [nova|buster|both]`, and `scripts/deploy.sh smoke` / `scripts/deploy.sh smoke-agent <nova|buster>`'), true);
  assert.equal(deploymentReadme.includes('destructive teardown commands live under `scripts/deploy.sh teardown`, `scripts/deploy.sh teardown-agents`, and `scripts/deploy.sh teardown-all`'), true);
  assert.equal(deploymentReadme.includes('`teardown` and `teardown-all` share one destructive implementation surface and differ only on whether the namespace is preserved or deleted'), true);
  assert.equal(deploymentReadme.includes('`scripts/deploy.sh` remains tracked executable so that canonical live deployment commands are directly runnable from the repo checkout'), true);
  assert.equal(deploymentReadme.includes('replay/audit artifacts live under `.swarm/logs/pipeline/latest.json` and the run-scoped `.swarm/logs/pipeline/runs/<run_id>/{pipeline.jsonl,discord.jsonl,nova-injections.jsonl,buster-telemetry-fallback.jsonl,redis/redis-exchanges.jsonl,redis/redis-ops.jsonl,summary.json}` bundle'), true);
  assert.equal(deploymentReadme.includes('Redis audit artifacts remain under `.swarm/logs/redis/{redis-exchanges.jsonl,redis-ops.jsonl}` plus the run-scoped `.swarm/logs/pipeline/runs/<run_id>/redis/` mirror'), true);
  assert.equal(pipelineReadme.includes('`.github/workflows/build-images.yaml`, `scripts/deploy.sh image [nova|buster|both]`, `scripts/deploy.sh code [nova|buster|both]`, and `scripts/deploy.sh smoke` / `scripts/deploy.sh smoke-agent <nova|buster>` are the canonical live deployment command surface; `.swarm/logs/pipeline/latest.json` plus the run-scoped audit bundle are the canonical replay/audit surface for that deployment path.'), true);
  assert.equal(phase4Tracker.includes('node scripts/phase8-verify.mjs'), false);
  assert.equal(phase4Tracker.includes('tests/verification/behavior/verify.mjs'), true);
  assert.equal(phase4Tracker.includes('Verification explainers and the pipeline README now also describe one canonical operator evidence split'), true);
  assert.equal(phase4Tracker.includes('Accepted Phase 4 items so far: `OP-PERF-01`, `OP-PERF-02`, `OP-PERF-03`, `OP-DEP-02`, `OP-DEP-05`.'), true);
  assert.equal(phase4Tracker.includes('Remaining Phase 4 blockers: `OP-DEP-03`.'), true);
  assert.equal(phase4Tracker.includes('Remaining Phase 4 blockers: `OP-PERF-01`, `OP-PERF-03`, `OP-DEP-03`, `OP-DEP-05`.'), false);
  assert.equal(phase4Tracker.includes('`OP-DEP-05` is accepted: deploy, replay, and audit evidence paths are now documented, aligned, and verifier-pinned on one canonical layout.'), true);
  assert.equal(openPoints.includes('**Decision:** Completed in current hardening round'), true);
  assert.equal(openPoints.includes('`OP-DEP-05` is accepted because deploy, replay, and audit provenance now point at one canonical layout across active operator docs, verification docs, and the main hardening trackers, with behavior verification still green.'), true);
  assert.equal(openPoints.includes('Accepted Phase 4 items so far: `OP-PERF-01`, `OP-PERF-02`, `OP-PERF-03`, `OP-DEP-02`, `OP-DEP-05`'), true);
  assert.equal(openPoints.includes('### Next focus after Phase 3 acceptance, remaining Phase 4 blockers\n- `OP-DEP-03`'), true);
  assert.equal(openPoints.includes('- `OP-DEP-05` artifact-path and docs provenance cleanup landed'), false);
  assert.equal(executionPlan.includes('Accepted Phase 4 items: `OP-PERF-01`, `OP-PERF-02`, `OP-PERF-03`, `OP-DEP-02`, `OP-DEP-05`'), true);
  assert.equal(phasePlan.includes('`OP-PERF-01` inefficient transcript polling (accepted 2026-04-16)'), true);
  assert.equal(phasePlan.includes('`OP-PERF-03` poll cadence / loop efficiency still needs hardening (accepted 2026-04-16)'), true);
  assert.equal(phasePlan.includes('`OP-DEP-05` source-to-artifact provenance cleanup (accepted 2026-04-16)'), true);
  assert.equal(phasePlan.includes('Remaining blocker before full Phase 4 acceptance: `OP-DEP-03`'), true);
  assert.equal(phasePlan.includes('`OP-DEP-05` messy source-to-artifact provenance'), false);
  assert.equal(phaseCompletionChecklist.includes('Accepted inside this Phase 4 scope already:\n- `OP-PERF-01`\n- `OP-PERF-02`\n- `OP-PERF-03`\n- `OP-DEP-02`\n- `OP-DEP-05`'), true);
  assert.equal(/retained only as a compatibility\s+shim/i.test(readinessChecklist), false);
  assert.equal(readinessChecklist.includes('`kubeclaw-main/scripts/*.mjs` wrappers remain in place as the stable operator and automation command surface'), false);
  assert.equal(readinessChecklist.includes('there is no remaining `scripts/phase8-verify.mjs`'), true);
  assert.equal(readinessChecklist.includes('`tests/verification/behavior/verify.mjs`'), true);
  assert.equal(readinessChecklist.includes('`tests/verification/deployment/check-deployment-truth.mjs`'), true);
  assert.equal(readinessChecklist.includes('Verification explainers and the pipeline README now describe the same canonical operator evidence split'), true);
  assert.equal(readinessChecklist.includes('Accepted items already covered inside Phase 4 scope: `OP-PERF-01`, `OP-PERF-02`, `OP-PERF-03`, `OP-DEP-02`, `OP-DEP-05`'), true);
  assert.equal(readinessChecklist.includes('Still blocking Phase 4 acceptance: `OP-DEP-03`'), true);
  assert.equal(readinessChecklist.includes('Still blocking Phase 4 acceptance: broader `OP-PERF-01`, `OP-PERF-03`, plus `OP-DEP-03`'), false);
  assert.equal(readinessChecklist.includes('Still blocking Phase 4 acceptance: broader `OP-PERF-01`, `OP-PERF-03`, plus `OP-DEP-03` and `OP-DEP-05`'), false);
});

await record('packaging verification doc reflects the live repo-based workflow', async () => {
  const packagingDoc = fs.readFileSync(path.join(sourceRoot, 'tests', 'verification', 'packaging-verification.md'), 'utf8');

  assert.equal(packagingDoc.includes('use the live repo root as the source of truth'), true);
  assert.equal(packagingDoc.includes('unpacked audit artifacts as historical reference only, not authoritative evidence'), true);
  assert.equal(packagingDoc.includes('`check-runtime-collisions.mjs` against the current repo, not historical rebuilt-artifact trees'), true);
  assert.equal(packagingDoc.includes('The packaging guard is the authoritative executable check for packaged runtime ownership and import validity.'), true);
  assert.equal(packagingDoc.includes('Latest rerun summary'), false);
  assert.equal(packagingDoc.includes('general image collisions: `0`'), false);
  assert.equal(packagingDoc.includes('broken packaged relative imports: `0`'), false);
  assert.equal(/\bnow\b/i.test(packagingDoc), false, 'packaging verification doc should use current-state language');
  assert.equal(packagingDoc.includes('kubeclaw-main-updated.zip'), false);
  assert.equal(packagingDoc.includes('_audit_lifecycle_unification/rebuilt-artifact'), false);
  assert.equal(packagingDoc.includes('/home/node/.openclaw/workspace/git-repo/kubeclaw-main'), false);
});

await record('active suite and summary defaults use shared repo and config authority', async () => {
  const projectSummary = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/tools/project-summary.ts');
  const repoPaths = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/suites/repo-paths.ts');

  assert.equal(projectSummary.includes('function discoverDefaultRepoDir() {'), false);
  assert.equal(projectSummary.includes('function discoverDefaultConfigPath(repoDir) {'), false);
  assert.equal(projectSummary.includes('const SOURCE_REPO_DIR ='), false);
  assert.equal(projectSummary.includes("import { getRepoRoot } from '../core/git-context.ts';"), true);
  assert.equal(projectSummary.includes("import { loadPlatformSwarmConfig } from '../core/platform-config.ts';"), true);
  assert.equal(projectSummary.includes("const repoDir    = validateAllowedPath(resolveRepoDir(opts.repoDir), 'project-summary.repoDir');"), true);

  assert.equal(repoPaths.includes("import { getRepoRoot } from '../git-primitives.ts';"), true);
  assert.equal(repoPaths.includes('export function resolveRepoDir(startDir: unknown = null): string {'), true);
  assert.equal(repoPaths.includes('return startDir ? getRepoRoot(startDir) : getRepoRoot();'), true);
  assert.equal(repoPaths.includes('export const REPO_DIR = resolveRepoDir();'), true);
  assert.equal(repoPaths.includes('function discoverDefaultRepoDir()'), false);

  for (const relPath of [
	    'skills/buster/pipeline/suites/api.ts',
	    'skills/buster/pipeline/suites/build.ts',
	    'skills/buster/pipeline/suites/e2e.ts',
	    'skills/buster/pipeline/suites/manifest.ts',
	    'skills/buster/pipeline/suites/unit.ts',
	    'skills/buster/pipeline/suites/visual-reg.ts',
	  ]) {
    const fileText = readOverlayText(sourceRoot, overlayRoot, relPath);
    assert.equal(fileText.includes('/home/node/.openclaw/workspace/git-repo'), false);
	    assert.equal(fileText.includes("./repo-paths.ts"), true);
	  }
	  const healthSuite = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/suites/health.ts');
	  assert.equal(healthSuite.includes('/home/node/.openclaw/workspace/git-repo'), false);
	});

await record('project-summary fallback stays source-relative while Buster suite root is canonical', async () => {
  const repoPaths = fs.readFileSync(path.join(sourceRoot, 'skills', 'buster', 'pipeline', 'suites', 'repo-paths.ts'), 'utf8');
  const projectSummary = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'tools', 'project-summary.ts'), 'utf8');

  assert.equal(repoPaths.includes('export const REPO_DIR = resolveRepoDir();'), true);
  assert.equal(repoPaths.includes("import { getRepoRoot } from '../git-primitives.ts';"), true);
  assert.equal(repoPaths.includes('/home/node/.openclaw/workspace/git-repo'), false);
  assert.equal(projectSummary.includes('/home/node/.openclaw/workspace/git-repo'), false);
  assert.equal(repoPaths.includes('fileURLToPath(import.meta.url)'), false);
  assert.equal(projectSummary.includes('fileURLToPath(import.meta.url)'), true);
});

await record('operator-facing visual regression docs avoid host-specific baseline evidence paths', async () => {
  const busterReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'buster-test-platform-reference-v2.md'), 'utf8');

  assert.equal(busterReference.includes('"baseline_path": "<project-root>/.swarm/modules/15/baselines/baseline.png"'), true);
  assert.equal(busterReference.includes('"baseline_path": "/home/node/.openclaw/workspace/git-repo/.swarm/modules/15/baselines/baseline.png"'), false);
});

await record('pre-check semgrep config docs and defaults pin OpenClaw home platform paths', async () => {
  const lintReportOutput = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'tools', 'lint-report', 'output.ts'), 'utf8');
  const lintReportDiscovery = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'tools', 'lint-report', 'discovery.ts'), 'utf8');
  const pipelineConfigReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'PIPELINE-CONFIG-REFERENCE.md'), 'utf8');
  const swarmConfig = fs.readFileSync(path.join(sourceRoot, 'charts', 'kubeclaw', 'files', 'config', 'swarm.config.json'), 'utf8');

  assert.equal(lintReportOutput.includes('default: auto-detect'), true);
  assert.equal(lintReportDiscovery.includes("'/home/node/.openclaw/.semgrep.yml'"), true);
  assert.equal(lintReportOutput.includes('default: /home/node/.openclaw/.semgrep.yml'), false);
  assert.equal(pipelineConfigReference.includes('/home/node/.openclaw/.semgrep.yml'), true);
  assert.equal(pipelineConfigReference.includes('| `semgrep_config_path` | `auto-detect` |'), true);
  assert.equal(swarmConfig.includes('/home/node/.openclaw/.semgrep.yml'), false);
});

await record('portable semgrep docs match runtime discovery order', async () => {
  const lintReportRegistry = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'tools', 'lint-report', 'tool-registry.ts'), 'utf8');
  const pipelineConfigReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'PIPELINE-CONFIG-REFERENCE.md'), 'utf8');

  assert.equal(lintReportRegistry.includes('/home/node/.openclaw/.semgrep.yml'), true);
  assert.equal(lintReportRegistry.includes('SWARM_CONFIG-adjacent .semgrep.yml fallback'), true);
  assert.equal(lintReportRegistry.includes('Semgrep config missing or invalid'), true);
  assert.equal(lintReportRegistry.includes('<repo>/.semgrep.yml (tooling-only legacy repo config fallback)'), false);
  assert.equal(pipelineConfigReference.includes('Suche zuerst unter `/home/node/.openclaw/.semgrep.yml`, dann neben `SWARM_CONFIG`'), true);
  assert.equal(pipelineConfigReference.includes('`~/.openclaw/.semgrep.yml`'), false);
  assert.equal(pipelineConfigReference.includes('`<repo>/.semgrep.yml`'), false);
  assert.equal(pipelineConfigReference.includes('`charts/kubeclaw/files/config/.semgrep.yml`'), true);
  assert.equal(pipelineConfigReference.includes('`.swarm/.semgrep.yml`'), false);
});

await record('platform swarm config discovery is runtime-config first with explicit SWARM_CONFIG override', async () => {
  const coreConfig = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'core', 'config.ts'), 'utf8');
  const platformConfig = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'core', 'platform-config.ts'), 'utf8');
  const lintReportDiscovery = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'tools', 'lint-report', 'discovery.ts'), 'utf8');
  const cli = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'cli.ts'), 'utf8');
  const pipelineConfigReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'PIPELINE-CONFIG-REFERENCE.md'), 'utf8');
  const configurationReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'configuration-reference.md'), 'utf8');
  const pipelineReferenceV10 = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'pipeline-reference-v10.md'), 'utf8');
  const swarmConfig = fs.readFileSync(path.join(sourceRoot, 'charts', 'kubeclaw', 'files', 'config', 'swarm.config.json'), 'utf8');
  const configMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/config.ts');

  assert.equal(coreConfig.includes('loadPlatformSwarmConfig'), true);
  assert.equal(platformConfig.includes('export function discoverPlatformSwarmConfigCandidates() {'), true);
  assert.equal(platformConfig.includes("'/home/node/.openclaw/swarm.config.json'"), true);
  assert.equal(platformConfig.includes('SOURCE_SWARM_CONFIG'), false);
  assert.equal(platformConfig.includes('Swarm config missing:'), true);
  assert.equal(platformConfig.includes('Swarm config invalid:'), true);
  assert.equal(lintReportDiscovery.includes("import { discoverPlatformSwarmConfigCandidates } from '../../core/platform-config.ts';"), true);
  assert.equal(lintReportDiscovery.includes('SOURCE_SWARM_CONFIG'), false);
  assert.equal(cli.includes('/home/node/.openclaw/swarm.config.json (SWARM_CONFIG secondary candidate)'), true);
  assert.equal(pipelineConfigReference.includes('`/home/node/.openclaw/swarm.config.json`'), true);
  assert.equal(pipelineConfigReference.includes('`SWARM_CONFIG` als Fallback'), false);
  assert.equal(configurationReference.includes('| `SWARM_CONFIG` | fallback for `/home/node/.openclaw/swarm.config.json` |'), false);
  assert.equal(pipelineReferenceV10.includes('/home/node/.openclaw/swarm.config.json'), true);
  assert.equal(pipelineReferenceV10.includes('auto-detected swarm.config.json'), false);
  assert.equal(swarmConfig.includes('/home/node/.openclaw/swarm.config.json'), true);
  assert.equal(swarmConfig.includes('portable platform auto-detect'), false);

  const previousSwarmConfig = process.env.SWARM_CONFIG;
  const overrideConfigPath = path.join(os.tmpdir(), `swarm-config-override-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  try {
	    process.env.SWARM_CONFIG = overrideConfigPath;
	    const candidates = configMod.discoverPlatformSwarmConfigCandidates();
	    assert.deepEqual(candidates, [path.resolve('/home/node/.openclaw/swarm.config.json'), path.resolve(overrideConfigPath)]);
	    assert.equal(candidates.some(candidate => candidate.includes('charts/kubeclaw/files/config/swarm.config.json')), false);
  } finally {
    if (previousSwarmConfig === undefined) delete process.env.SWARM_CONFIG;
    else process.env.SWARM_CONFIG = previousSwarmConfig;
  }

  const firstMissing = path.join(os.tmpdir(), `swarm-config-missing-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const firstExisting = path.join(os.tmpdir(), `swarm-config-existing-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(firstExisting, '{"ok":true}\n');
  try {
    assert.equal(configMod.discoverSwarmConfigPath([firstMissing, firstExisting]), path.resolve(firstExisting));
    fs.rmSync(firstExisting, { force: true });
    assert.equal(configMod.discoverSwarmConfigPath([firstMissing, firstExisting]), path.resolve(firstMissing));
  } finally {
    fs.rmSync(firstExisting, { force: true });
  }
});
}
