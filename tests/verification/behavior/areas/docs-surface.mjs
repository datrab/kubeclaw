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
await record('pipeline README points to canonical tracked docs instead of stale governance project paths', async () => {
  const readmePath = path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'README.md');
  const readme = fs.readFileSync(readmePath, 'utf8');
  assert.equal(readme.includes('Projects/governance/src/docs/'), false);
  for (const relPath of [
    'docs/observability-reference.md',
    'docs/architecture-validator-reference.md',
    'docs/telemetry-event-schema.md',
    'docs/pipeline-reference-v10.md',
  ]) {
    assert.equal(readme.includes(`\`${relPath}\``), true);
    assert.equal(fs.existsSync(path.join(sourceRoot, relPath)), true);
  }
});

await record('observability docs expose latest.json as the operator pointer to the newest run-scoped audit tree', async () => {
  const observabilityDoc = fs.readFileSync(path.join(sourceRoot, 'docs', 'observability-reference.md'), 'utf8');
  const readme = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'README.md'), 'utf8');
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');

  assert.equal(observabilityDoc.includes('.swarm/logs/pipeline/latest.json'), true);
  assert.equal(observabilityDoc.includes('Pointer to the most recent run-scoped audit tree'), true);
  assert.equal(observabilityDoc.includes('telemetry_stream_key'), true);
  assert.equal(observabilityDoc.includes('## Pipeline Event Stream (`.swarm/logs/pipeline/pipeline.jsonl`)'), true);
  assert.equal(observabilityDoc.includes('## Discord Audit Log (`.swarm/logs/pipeline/discord.jsonl`)'), true);
  assert.equal(observabilityDoc.includes('## Model/Thinking Policy Log (`.swarm/logs/pipeline/model-policy.jsonl`)'), true);
  assert.equal(observabilityDoc.includes('If writing `.swarm/logs/pipeline/discord.jsonl` or the run-scoped `discord.jsonl` mirror fails'), true);
  assert.equal(observabilityDoc.includes('`nova-injections.jsonl`'), true);
  assert.equal(readme.includes('.swarm/logs/pipeline/latest.json'), true);
  assert.equal(readme.includes('telemetry_stream_key'), true);
  assert.equal(readme.includes('discord.jsonl'), true);
  assert.equal(readme.includes('nova-injections.jsonl'), true);
  assert.equal(telemetrySchema.includes('.swarm/logs/pipeline/latest.json'), true);
  assert.equal(telemetrySchema.includes('telemetry_stream_key'), true);
  assert.equal(telemetrySchema.includes('`discord.jsonl`'), true);
  assert.equal(telemetrySchema.includes('`nova-injections.jsonl`'), true);
});

await record('pipeline flow semgrep card documents portable platform config discovery instead of a stale app path', async () => {
  const pipelineFlow = fs.readFileSync(path.join(sourceRoot, 'docs', 'pipeline-flow.html'), 'utf8');

  assert.equal(pipelineFlow.includes("path: '/app/config/.semgrep.yml'"), false);
  assert.equal(pipelineFlow.includes("path: 'writable platform config surface (.semgrep.yml neben swarm.config.json)'"), true);
  assert.equal(pipelineFlow.includes('Helm liefert das Beispiel unter charts/kubeclaw/files/config/.semgrep.yml; lint-report.js auto-detectet zuerst die Plattformdatei neben swarm.config.json, dann ~/.openclaw/.semgrep.yml, danach <repo>/.semgrep.yml, sonst auto.'), true);
  assert.equal(pipelineFlow.includes('Helm-Beispiel: <code>charts/kubeclaw/files/config/.semgrep.yml</code> → writable platform config surface'), true);
  assert.equal(pipelineFlow.includes('Override via <code>pre_check.semgrep_config_path</code>, sonst auto-detect (plattformweit → <code>~/.openclaw</code> → Repo → auto)'), true);
});

await record('initLogDir writes a live latest.json pointer with the canonical replay artifact bundle', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-live-latest-pointer-'));
  const swarmDir = path.join(root, '.swarm');
  const statusStoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/status-store.js');

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

  config._pipelineLogFd?.end();
  config._runPipelineLogFd?.end();
});

await record('latest.json points replay consumers at telemetry, Discord, and run-scoped summary artifacts for the same run', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-latest-pointer-'));
  const logDir = path.join(root, '.swarm', 'logs');
  const runId = 'run-latest-1';
  const runtimeCoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/runtime.js');
  const config = {
    project: 'behavior-latest',
    repo_root: root,
    _logDir: logDir,
    _runLogDir: path.join(logDir, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
  };

  const summaryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/summary.js');
  summaryMod.writeSummary(config, 0, 'completed');

  const latest = JSON.parse(fs.readFileSync(path.join(logDir, 'pipeline', 'latest.json'), 'utf8'));
  assert.equal(latest.run_id, runId);
  assert.equal(latest.status, 'completed');
  assert.equal(latest.telemetry_stream_key, `pipeline:telemetry:${config.project}:${runId}`);
  assert.equal(latest.pipeline_jsonl, `runs/${runId}/pipeline.jsonl`);
  assert.equal(latest.discord_jsonl, `runs/${runId}/discord.jsonl`);
  assert.equal(latest.summary_json, `runs/${runId}/summary.json`);
  assert.equal(latest.nova_injections_jsonl, `runs/${runId}/nova-injections.jsonl`);

  const summary = JSON.parse(fs.readFileSync(path.join(logDir, 'pipeline', 'runs', runId, 'summary.json'), 'utf8'));
  assert.equal(summary.run_id, runId);
  assert.equal(summary.telemetry_stream_key, `pipeline:telemetry:${config.project}:${runId}`);
  assert.equal(summary.completed_at != null, true);
  assert.equal(summary.artifacts.pipeline_jsonl, `runs/${runId}/pipeline.jsonl`);
  assert.equal(summary.artifacts.discord_jsonl, `runs/${runId}/discord.jsonl`);
  assert.equal(summary.artifacts.summary_json, `runs/${runId}/summary.json`);
  assert.equal(summary.artifacts.nova_injections_jsonl, `runs/${runId}/nova-injections.jsonl`);
  assert.equal(summary.artifacts.pipeline_summary_json, 'summary.json');
  assert.equal(summary.artifacts.latest_json, 'latest.json');
});
}
