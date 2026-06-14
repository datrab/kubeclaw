export async function registerTelemetryDocsArea({
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
await record('lifecycle contract docs keep canonical Redis audit artifact paths', async () => {
  const telemetryContract = fs.readFileSync(contractPath, 'utf8');

  assert.equal(telemetryContract.includes('`redis.jsonl`'), false);
  assert.equal(telemetryContract.includes('.swarm/logs/redis/redis-exchanges.jsonl'), true);
  assert.equal(telemetryContract.includes('.swarm/logs/redis/redis-ops.jsonl'), true);
  assert.equal(telemetryContract.includes('.swarm/logs/pipeline/runs/<run_id>/redis/redis-exchanges.jsonl'), true);
  assert.equal(telemetryContract.includes('.swarm/logs/pipeline/runs/<run_id>/redis/redis-ops.jsonl'), true);
});

await record('lifecycle contract docs do not preserve stale explicit buster stream literals', async () => {
  const telemetryContract = fs.readFileSync(contractPath, 'utf8');

  assert.equal(telemetryContract.includes('buster:telemetry:<project>:<run_id>'), false);
});

await record('implementation companion keeps legacy Buster stream notes compatibility-only', async () => {
  const implementationChecklist = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'root-docs', 'lifecycle-unification', 'TELEMETRY_V1_IMPLEMENTATION_CHECKLIST.md'), 'utf8');

  assert.equal(implementationChecklist.includes('Buster runtime currently documented/emitted as: `buster:telemetry:<project>:<module>`'), false);
  assert.equal(implementationChecklist.includes('Buster runtime now also treats `pipeline:telemetry:<project>:<run_id>` as the only canonical live stream'), true);
  assert.equal(implementationChecklist.includes('legacy `buster:telemetry:*` reads as compatibility-only transport input, not as canonical runtime ownership'), true);
});

await record('summary telemetry docs keep summary.started/completed canonical and drop case-study-only event names', async () => {
  const telemetryContract = fs.readFileSync(contractPath, 'utf8');
  const observabilityReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'observability-reference.md'), 'utf8');

  assert.equal(telemetryContract.includes('`summary.started`'), true);
  assert.equal(telemetryContract.includes('`summary.completed`'), true);
  assert.equal(telemetryContract.includes('`case_study.started`'), false);
  assert.equal(telemetryContract.includes('`case_study.completed`'), false);
  assert.equal(observabilityReference.includes('| `summary.started` | Post-run summary flow begins (`summary_type`: `pipeline`, `pipeline_review`, `case_study`, or `project_summary`) |'), true);
  assert.equal(observabilityReference.includes('| `summary.completed` | Post-run summary flow completes with typed `terminal_status`/`reason_code`, artifact/session identity when relevant, and pipeline summary join fields like `summary_json_path`, `pipeline_summary_path`, and `latest_json_path` |'), true);
  assert.equal(observabilityReference.includes('| `case_study.started` |'), false);
  assert.equal(observabilityReference.includes('| `case_study.completed` |'), false);
});

await record('reference docs use the current telemetry envelope and event names', async () => {
  const pipelineReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'pipeline-reference-v10.md'), 'utf8');
  const configReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'PIPELINE-CONFIG-REFERENCE.md'), 'utf8');
  const progressJsonReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'progress-json-reference.md'), 'utf8');
  const configurationReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'configuration-reference.md'), 'utf8');
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'telemetry-event-schema.md'), 'utf8');
  const telemetryContract = fs.readFileSync(contractPath, 'utf8');

  assert.equal(pipelineReference.includes("type: string,         // z.B. 'module.started', 'plugin.event', 'module.status_changed'"), true);
  assert.equal(pipelineReference.includes('seq: number,'), true);
  assert.equal(pipelineReference.includes('ts: string,'), true);
  assert.equal(pipelineReference.includes('Das kanonische Event-Inventar lebt in `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`; `docs/telemetry-event-schema.md` dokumentiert die event-spezifischen Payload-Felder und Beispiele.'), true);
  assert.equal(pipelineReference.includes("event_type: string,   // z.B. 'module_started', 'buster_dispatched', 'module_passed'"), false);
  assert.equal(pipelineReference.includes("emitTelemetryEvent('buster_dispatched', ...)"), false);

  assert.equal(configReference.includes('Telemetrie: module.started + agent.spawned, später module.status_changed'), true);
  assert.equal(configReference.includes('Telemetrie: nach Task-Annahme plugin.event (`plugin_id: buster`, `plugin_event: task_started/task_completed`)'), true);
  assert.equal(configReference.includes('Telemetrie: module.status_changed (PASS) → Nächstes Modul'), true);
  assert.equal(configReference.includes('**Emittierte Event-Typen:** Kanonisches Event-Inventar in `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`, event-spezifische Payload-Felder und Beispiele in `docs/telemetry-event-schema.md`.'), true);
  assert.equal(pipelineReference.includes('| `onSummaryCompleted` | `summary.completed` | Summary-Agent beendet; für `summary_type: pipeline` auch mit `terminal_status`, `reason_code`, `summary_json_path`, `pipeline_summary_path` und `latest_json_path` |'), true);
  assert.equal(configReference.includes('Telemetrie: module_started + forge_completed Events'), false);
  assert.equal(configReference.includes('Telemetrie: buster_dispatched Event'), false);
  assert.equal(configReference.includes('Telemetrie: module_passed → Nächstes Modul'), false);
  assert.equal(pipelineReference.includes('| `emitTelemetryEvent(ctx, eventType, payload)` | services/telemetry.js | Sendet strukturiertes Event an Redis Stream. |'), false);
  assert.equal(pipelineReference.includes('| `emitTelemetryEvent` | v9 NEU (exportiert) |'), false);
  assert.equal(progressJsonReference.includes('See `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` for the canonical event inventory and `docs/telemetry-event-schema.md` for event-by-event payload fields and examples.'), true);
  assert.equal(configurationReference.includes('See `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` for the canonical event inventory and `docs/telemetry-event-schema.md` for event-by-event payload fields and examples.'), true);
  assert.equal(progressJsonReference.includes('See `docs/telemetry-event-schema.md` for the full event catalog.'), false);
  assert.equal(configurationReference.includes('See `docs/telemetry-event-schema.md` for the full event catalog.'), false);
  assert.equal(telemetryContract.includes('This contract is the authoritative owner of:'), true);
  assert.equal(telemetryContract.includes('`docs/telemetry-event-schema.md` is the authoritative event-by-event payload reference for those canonical event names, including authoritative field tables, payload examples, and event-specific correlation notes.'), true);
  assert.equal(telemetryContract.includes('the envelope is intentionally flat: event-specific fields live at the top level beside `v`, `type`, `ts`, `project`, `run_id`, and `seq`'), true);
  assert.equal(telemetryContract.includes('do not wrap canonical payloads in legacy nested `data` / `refs` objects'), true);
  assert.equal(telemetryContract.includes('`source` and `emitter` are strings, not object-shaped provenance wrappers'), true);
  assert.equal(telemetrySchema.includes('Canonical event inventory, stream identity, envelope invariants, and compatibility boundaries live in `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`.'), true);
  assert.equal(telemetrySchema.includes('This schema is the authoritative event-by-event payload reference for those canonical event names, including authoritative field tables, payload examples, and event-specific correlation notes.'), true);
  assert.equal(telemetrySchema.includes('For the high-value lifecycle and observability events below, the field table is the authoritative payload surface. Examples and prose illustrate common combinations, but the field table owns the canonical payload field list and meanings.'), true);
  assert.equal(telemetrySchema.includes('Envelope rule: canonical events are intentionally flat.'), true);
  assert.equal(telemetrySchema.includes('legacy nested `data` / `refs` objects or object-shaped `source` / `emitter` provenance wrappers'), true);
});

await record('project setup telemetry docs keep canonical stream ownership explicit', async () => {
  const progressJsonGuide = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'project_setup', 'progress-json.md'), 'utf8');
  assert.equal(progressJsonGuide.includes('| `telemetry` | no | — | Redis telemetry enable/config |'), true);
  assert.equal(progressJsonGuide.includes('"stream_key"'), false);
  assert.equal(progressJsonGuide.includes('Legacy-compatible enable flag'), false);
  assert.equal(progressJsonGuide.includes('published to the canonical run-scoped stream `pipeline:telemetry:<project>:<run_id>`'), true);
  assert.equal(progressJsonGuide.includes('Override stream key'), false);
});

await record('public progress.json telemetry docs keep canonical stream ownership explicit', async () => {
  const progressJsonReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'progress-json-reference.md'), 'utf8');
  assert.equal(progressJsonReference.includes('| `telemetry` | no | — | Redis telemetry enable/config |'), true);
  assert.equal(progressJsonReference.includes('"stream_key"'), false);
  assert.equal(progressJsonReference.includes('Legacy-compatible enable flag'), false);
  assert.equal(progressJsonReference.includes('published to the canonical run-scoped stream `pipeline:telemetry:<project>:<run_id>`'), true);
  assert.equal(progressJsonReference.includes('"stream_key": "pipeline:telemetry:my-project"'), false);
});

await record('Buster telemetry_stream payload hint is removed from runtime docs and code', async () => {
  const configurationReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'configuration-reference.md'), 'utf8');
  const busterReadme = fs.readFileSync(path.join(sourceRoot, 'skills', 'buster', 'README.md'), 'utf8');
  const busterPipeline = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/buster-pipeline.ts');
  const busterTelemetry = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/telemetry.ts');

  assert.equal(configurationReference.includes('| `telemetry_stream` |'), false);
  assert.equal(busterReadme.includes('| `telemetry_stream` |'), false);
  assert.equal(busterPipeline.includes('payload?.telemetry_stream'), false);
  assert.equal(busterPipeline.includes('streamKey:'), false);
  assert.equal(busterTelemetry.includes('Legacy compatibility hint. The value does not rename the stream.'), false);
});

await record('telemetry enable docs describe explicit degraded fallback on Redis outage', async () => {
  const pipelineConfigReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'PIPELINE-CONFIG-REFERENCE.md'), 'utf8');
  const pipelineReferenceV10 = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'pipeline-reference-v10.md'), 'utf8');

  assert.equal(pipelineConfigReference.includes('Redis nicht erreichbar, bleibt die Pipeline nicht-blockierend, schreibt aber ein explizites `observability.degraded`-Fallback-Artefakt'), true);
  assert.equal(pipelineConfigReference.includes('werden Events still verworfen'), false);
  assert.equal(pipelineReferenceV10.includes('Redis nicht erreichbar, bleibt die Pipeline nicht-blockierend, schreibt aber ein explizites `observability.degraded`-Artefakt'), true);
  assert.equal(pipelineReferenceV10.includes('`projectLogDir(config)/pipeline/pipeline.jsonl` (standardmäßig `.swarm/logs/pipeline/pipeline.jsonl` als Operator-Tail)'), true);
  assert.equal(pipelineReferenceV10.includes('`resolvePipelineRunLogDir(config)/pipeline.jsonl` (die run-scoped `pipeline.jsonl` im Audit-Tree unter `.swarm/logs/pipeline/runs/<run_id>/`)'), true);
  assert.equal(pipelineReferenceV10.includes('werden Events still verworfen'), false);
});

await record('model policy docs describe defaults-only project model policy', async () => {
  const observabilityReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'observability-reference.md'), 'utf8');
  const pipelineReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'pipeline-reference-v10.md'), 'utf8');

  assert.equal(observabilityReference.includes('| `project_default` | `progress.defaults.models.<agentName>` |'), true);
  assert.equal(pipelineReference.includes('runtime override → scope policy → `progress.defaults.models` → `fallback_model`'), true);
  assert.equal(pipelineReference.includes('| Defaults | `defaults.models.<agent>`, `defaults.thinking.<agent>` (Priorität 3 in Policy-Auflösung) |'), true);
  assert.equal(pipelineReference.includes('Model-Resolution läuft über Runtime-Override, Scope-Policy, `progress.defaults.models.<agent>` und zuletzt das explizite Plattform-`fallback_model`.'), true);
  assert.equal(observabilityReference.includes('| `platform_fallback` | `fallback_model` from `swarm.config.json` |'), true);
  assert.equal(observabilityReference.includes('legacy `progress.models'), false);
  assert.equal(pipelineReference.includes('legacy `progress.models'), false);
});
}
