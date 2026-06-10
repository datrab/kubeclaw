export async function registerDocsSurfaceArea({
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
await record('public docs root stays reserved for active control files and generated target docs', async () => {
  const rootFiles = fs.readdirSync(path.join(sourceRoot, 'docs'), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(rootFiles, [
    'CONTRIBUTING.md',
    'DOCUMENTATION_AUDIT.md',
    'DOCUMENTATION_HANDOFF_PROMPT.md',
    'DOCUMENTATION_PLAN.md',
    'DOCUMENTATION_REBUILD_PLAN.md',
    'DOCUMENTATION_TARGET_PAGE_LIST.md',
    'DOCUMENTATION_WORKFLOW.md',
    'README.md',
    'ROADMAP.md',
    'future-implementation-ideas.md',
    'open-issues.md',
  ]);
});

await record('documentation handoff prompt requires completing every phase before stopping', async () => {
  const prompt = fs.readFileSync(path.join(sourceRoot, 'docs', 'DOCUMENTATION_HANDOFF_PROMPT.md'), 'utf8');

  assert.equal(prompt.includes('Do not voluntarily stop until every phase in docs/DOCUMENTATION_PLAN.md is complete.'), true);
  assert.equal(prompt.includes('Stop early only if genuinely blocked or forced to hand off because context is getting large.'), true);
  assert.equal(prompt.includes('Do not stop at a proposal, partial phase, or partial documentation set unless genuinely blocked or forced to hand off at a completed-file boundary.'), true);
});

await record('pipeline README points to archived source docs instead of stale governance project paths', async () => {
  const readmePath = path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'README.md');
  const readme = fs.readFileSync(readmePath, 'utf8');
  assert.equal(readme.includes('Projects/governance/src/docs/'), false);
  for (const relPath of [
    'docs/archive/legacy-root-docs/observability-reference.md',
    'docs/archive/legacy-root-docs/architecture-validator-reference.md',
    'docs/archive/legacy-root-docs/telemetry-event-schema.md',
    'docs/archive/legacy-root-docs/pipeline-reference-v10.md',
  ]) {
    assert.equal(readme.includes(`\`${relPath}\``), true);
    assert.equal(fs.existsSync(path.join(sourceRoot, relPath)), true);
  }
});

await record('project setup progress docs keep ACP monitor config platform-owned', async () => {
  const progressJsonGuide = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'project_setup', 'progress-json.md'), 'utf8');
  const swarmConfig = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'charts', 'kubeclaw', 'files', 'config', 'swarm.config.json'), 'utf8'));

  assert.equal(progressJsonGuide.includes('## ACP Monitor'), false);
  assert.equal(progressJsonGuide.includes('payload.acp_monitor'), false);
  assert.equal(progressJsonGuide.includes('| `acp_monitor` |'), false);
  assert.equal(progressJsonGuide.includes('ACP monitor timing is platform-owned and belongs in `swarm.config.json`, not `progress.json`.'), true);
  assert.deepEqual(Object.keys(swarmConfig.acp_monitor).sort(), [
    'max_transcript_extensions',
    'monitor_poll_ms',
    'stale_poll_limit',
    'transcript_grace_ms',
    'unknown_poll_limit',
  ]);
});

await record('project setup and Prism docs use current visual-reg baseline authority and screenshot entrypoint', async () => {
  const docs = {
    moduleFiles: fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'project_setup', 'module-files.md'), 'utf8'),
    progressJson: fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'project_setup', 'progress-json.md'), 'utf8'),
    prismConventions: fs.readFileSync(path.join(sourceRoot, 'skills', 'prism', 'prism-conventions.md'), 'utf8'),
  };

  for (const [name, doc] of Object.entries(docs)) {
    assert.equal(doc.includes('screenshot.cjs'), false, `${name} should not reference stale screenshot.cjs`);
    assert.equal(doc.includes('visual-reg.cjs'), false, `${name} should not reference stale visual-reg.cjs`);
    assert.equal(doc.includes('baseline_dir'), false, `${name} should not document removed visual-reg path config`);
    assert.equal(doc.includes('.swarm/buster-test/baselines'), false, `${name} should not document old gate-level visual baselines`);
  }

  assert.equal(docs.moduleFiles.includes('Buster derives the baseline directory as `.swarm/modules/<module-dir>/baselines/`'), true);
  assert.equal(docs.moduleFiles.includes('node /app/skills/pipeline/tools/screenshot.ts --generate-baselines'), true);
  assert.equal(docs.progressJson.includes('Buster derives them from module identity at `.swarm/modules/<module-dir>/baselines/`'), true);
  assert.equal(docs.prismConventions.includes('`skills/buster/pipeline/tools/screenshot.ts --generate-baselines` in repo source'), true);
  assert.equal(docs.prismConventions.includes('`/app/skills/pipeline/tools/screenshot.ts --generate-baselines` in the Buster runtime image'), true);
});

await record('observability docs expose latest.json as the operator pointer to the newest run-scoped audit tree', async () => {
  const observabilityDoc = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'observability-reference.md'), 'utf8');
  const readme = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'README.md'), 'utf8');
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'telemetry-event-schema.md'), 'utf8');

  assert.equal(observabilityDoc.includes('.swarm/logs/pipeline/latest.json'), true);
  assert.equal(observabilityDoc.includes('Pointer to the most recent run-scoped audit tree'), true);
  assert.equal(observabilityDoc.includes('telemetry_stream_key'), true);
  assert.equal(observabilityDoc.includes('## Pipeline Event Stream (`.swarm/logs/pipeline/pipeline.jsonl`)'), true);
  assert.equal(observabilityDoc.includes('## Discord Audit Log (`.swarm/logs/pipeline/discord.jsonl`)'), true);
  assert.equal(observabilityDoc.includes('## Model/Thinking Policy Log (`.swarm/logs/pipeline/model-policy.jsonl`)'), true);
  assert.equal(observabilityDoc.includes('If writing `.swarm/logs/pipeline/discord.jsonl` or the run-scoped `discord.jsonl` mirror fails'), true);
  assert.equal(observabilityDoc.includes('`nova-injections.jsonl`'), true);
  assert.equal(observabilityDoc.includes('## Buster Telemetry Fallback (`buster-telemetry-fallback.jsonl`)'), true);
  assert.equal(observabilityDoc.includes('artifact_fallback: true'), true);
  assert.equal(observabilityDoc.includes('Each line is a normal JSON object, not a JSON string nested inside JSONL'), true);
  assert.equal(readme.includes('.swarm/logs/pipeline/latest.json'), true);
  assert.equal(readme.includes('telemetry_stream_key'), true);
  assert.equal(readme.includes('discord.jsonl'), true);
  assert.equal(readme.includes('nova-injections.jsonl'), true);
  assert.equal(readme.includes('buster-telemetry-fallback.jsonl'), true);
  assert.equal(readme.includes('redis/redis-exchanges.jsonl'), true);
  assert.equal(readme.includes('redis/redis-ops.jsonl'), true);
  assert.equal(telemetrySchema.includes('.swarm/logs/pipeline/latest.json'), true);
  assert.equal(telemetrySchema.includes('telemetry_stream_key'), true);
  assert.equal(telemetrySchema.includes('`discord.jsonl`'), true);
  assert.equal(telemetrySchema.includes('`nova-injections.jsonl`'), true);
  assert.equal(telemetrySchema.includes('`buster-telemetry-fallback.jsonl`'), true);
  assert.equal(telemetrySchema.includes('redis/redis-exchanges.jsonl'), true);
  assert.equal(telemetrySchema.includes('redis/redis-ops.jsonl'), true);
});

await record('trust-boundary docs keep Buster Redis, Discord, fallback, and customSkills authority bounded', async () => {
  const observabilityDoc = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'observability-reference.md'), 'utf8');
  const repoRoot = path.dirname(sourceRoot);
  const authorityMap = fs.readFileSync(path.join(repoRoot, 'docs', 'pipeline-hardening', 'final_audits', 'RUNTIME_TRUTH_AUTHORITY_MAP.md'), 'utf8');
  const customSkillsTemplate = fs.readFileSync(path.join(sourceRoot, 'charts', 'kubeclaw', 'templates', 'configmap-skills.yaml'), 'utf8');

  assert.equal(observabilityDoc.includes('### Trust boundaries for Buster/operator surfaces'), true);
  assert.equal(observabilityDoc.includes('Redis task payloads are untrusted transport data until `validateBusterTaskPayload(...)` accepts their typed identity'), true);
  assert.equal(observabilityDoc.includes('Discord fields and embeds are operator evidence only'), true);
  assert.equal(observabilityDoc.includes('must not be parsed back into lifecycle authority'), true);
  assert.equal(observabilityDoc.includes('`artifact_fallback: true` / `seq: null`'), true);
  assert.equal(observabilityDoc.includes('Helm `customSkills` is an extension surface only'), true);
  assert.equal(observabilityDoc.includes('custom overlays must not be used as a compatibility patch path for core runtime behavior'), true);

  assert.equal(authorityMap.includes('## Cross-surface trust boundaries'), true);
  assert.equal(authorityMap.includes('Buster Redis task stream'), true);
  assert.equal(authorityMap.includes('Malformed/weak tasks are rejected with evidence'), true);
  assert.equal(authorityMap.includes('Buster Redis completion stream'), true);
  assert.equal(authorityMap.includes('not standalone scheduler truth'), true);
  assert.equal(authorityMap.includes('Discord/operator artifacts'), true);
  assert.equal(authorityMap.includes('not lifecycle authority'), true);
  assert.equal(authorityMap.includes('Telemetry fallback artifacts'), true);
  assert.equal(authorityMap.includes('not Redis ordered'), true);
  assert.equal(authorityMap.includes('Helm `customSkills` overlay'), true);
  assert.equal(authorityMap.includes('customSkills is not a compatibility patch mechanism for core runtime'), true);

  assert.equal(customSkillsTemplate.includes('extension-only'), true);
  assert.equal(customSkillsTemplate.includes('cannot be used as a compatibility patch path'), true);
});

await record('pipeline flow semgrep card documents portable platform config discovery instead of a stale app path', async () => {
  const pipelineFlow = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'static-artifacts', 'pipeline-flow.html'), 'utf8');

  assert.equal(pipelineFlow.includes("path: '/app/config/.semgrep.yml'"), false);
  assert.equal(pipelineFlow.includes("path: 'writable platform config surface (.semgrep.yml neben swarm.config.json)'"), true);
  assert.equal(pipelineFlow.includes('lint-report.ts sucht zuerst /home/node/.openclaw/.semgrep.yml, dann SWARM_CONFIG-adjacent .semgrep.yml; fehlt sie oder ist sie ungültig, meldet Semgrep die Config als fehlend/ungültig.'), true);
  assert.equal(pipelineFlow.includes('Helm-Beispiel: <code>charts/kubeclaw/files/config/.semgrep.yml</code> → writable platform config surface'), true);
  assert.equal(pipelineFlow.includes('Override via <code>pre_check.semgrep_config_path</code>, sonst auto-detect (<code>/home/node/.openclaw/.semgrep.yml</code> → SWARM_CONFIG-adjacent)'), true);
});

await record('initLogDir writes a live latest.json pointer with the canonical replay artifact bundle', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-live-latest-pointer-'));
  const swarmDir = path.join(root, '.swarm');
  const statusStoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/status-store.ts');

  const config = {
    project: 'behavior-live-latest',
    paths: { swarm_dir: swarmDir },
    _runId: 'run-live-latest-1',
    run_id: 'run-live-latest-1',
  };

  statusStoreMod.initLogDir(config, { runId: config._runId, config });

  const latest = JSON.parse(fs.readFileSync(path.join(swarmDir, 'logs', 'pipeline', 'latest.json'), 'utf8'));
  assert.equal(latest.run_id, config._runId);
  assert.equal(latest.status, 'running');
  assert.equal(latest.telemetry_stream_key, `pipeline:telemetry:${config.project}:${config._runId}`);
  assert.equal(latest.pipeline_jsonl, `runs/${config._runId}/pipeline.jsonl`);
  assert.equal(latest.discord_jsonl, `runs/${config._runId}/discord.jsonl`);
  assert.equal(latest.summary_json, `runs/${config._runId}/summary.json`);
  assert.equal(latest.nova_injections_jsonl, `runs/${config._runId}/nova-injections.jsonl`);
  assert.equal(latest.buster_telemetry_fallback_jsonl, `runs/${config._runId}/buster-telemetry-fallback.jsonl`);
  assert.equal(latest.redis_exchanges_jsonl, `runs/${config._runId}/redis/redis-exchanges.jsonl`);
  assert.equal(latest.redis_ops_jsonl, `runs/${config._runId}/redis/redis-ops.jsonl`);
  assert.equal(latest.authority.role, 'latest_pointer');
  assert.equal(latest.authority.operator_pointer_only, true);
  assert.equal(latest.authority.allow_lifecycle_authority, false);
  assert.equal(latest.authority.allow_session_authority, false);

  config._pipelineLogFd?.end();
  config._runPipelineLogFd?.end();
});

await record('latest.json points replay consumers at telemetry, Discord, and run-scoped summary artifacts for the same run', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-latest-pointer-'));
  const swarmDir = path.join(root, '.swarm');
  const logDir = path.join(swarmDir, 'logs');
  const runId = 'run-latest-1';
  const runtimeCoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const config = {
    project: 'behavior-latest',
    repo_root: root,
    paths: { swarm_dir: swarmDir },
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
  };

  const summaryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/summary.ts');
  summaryMod.writeSummary(config, 0, 'completed');

  const latest = JSON.parse(fs.readFileSync(path.join(logDir, 'pipeline', 'latest.json'), 'utf8'));
  assert.equal(latest.run_id, runId);
  assert.equal(latest.status, 'completed');
  assert.equal(latest.telemetry_stream_key, `pipeline:telemetry:${config.project}:${runId}`);
  assert.equal(latest.pipeline_jsonl, `runs/${runId}/pipeline.jsonl`);
  assert.equal(latest.discord_jsonl, `runs/${runId}/discord.jsonl`);
  assert.equal(latest.summary_json, `runs/${runId}/summary.json`);
  assert.equal(latest.nova_injections_jsonl, `runs/${runId}/nova-injections.jsonl`);
  assert.equal(latest.buster_telemetry_fallback_jsonl, `runs/${runId}/buster-telemetry-fallback.jsonl`);
  assert.equal(latest.redis_exchanges_jsonl, `runs/${runId}/redis/redis-exchanges.jsonl`);
  assert.equal(latest.redis_ops_jsonl, `runs/${runId}/redis/redis-ops.jsonl`);

  const summary = JSON.parse(fs.readFileSync(path.join(logDir, 'pipeline', 'runs', runId, 'summary.json'), 'utf8'));
  assert.equal(summary.run_id, runId);
  assert.equal(summary.telemetry_stream_key, `pipeline:telemetry:${config.project}:${runId}`);
  assert.equal(summary.completed_at != null, true);
  assert.equal(summary.artifacts.pipeline_jsonl, `runs/${runId}/pipeline.jsonl`);
  assert.equal(summary.artifacts.discord_jsonl, `runs/${runId}/discord.jsonl`);
  assert.equal(summary.artifacts.summary_json, `runs/${runId}/summary.json`);
  assert.equal(summary.artifacts.nova_injections_jsonl, `runs/${runId}/nova-injections.jsonl`);
  assert.equal(summary.artifacts.buster_telemetry_fallback_jsonl, `runs/${runId}/buster-telemetry-fallback.jsonl`);
  assert.equal(summary.artifacts.redis_exchanges_jsonl, `runs/${runId}/redis/redis-exchanges.jsonl`);
  assert.equal(summary.artifacts.redis_ops_jsonl, `runs/${runId}/redis/redis-ops.jsonl`);
  assert.equal(summary.artifacts.pipeline_summary_json, 'summary.json');
  assert.equal(summary.artifacts.latest_json, 'latest.json');
  assert.equal(summary.artifacts.authority.pipeline_jsonl.role, 'run_scoped_replay');
  assert.equal(summary.artifacts.authority.pipeline_jsonl.authority.operator_replay_authority, true);
  assert.equal(summary.artifacts.authority.latest_json.role, 'latest_pointer');
  assert.equal(summary.artifacts.authority.latest_json.authority.allow_lifecycle_authority, false);
  assert.equal(summary.artifacts.authority.buster_telemetry_fallback_jsonl.role, 'diagnostic_fallback');
  assert.equal(summary.artifacts.authority.buster_telemetry_fallback_jsonl.authority.diagnostic_evidence_only, true);
});
}
