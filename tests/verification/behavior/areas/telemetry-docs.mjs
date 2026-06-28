export async function registerTelemetryDocsArea({
  record,
  sourceRoot,
  overlayRoot,
  contractPath,
  fs,
  path,
  assert,
  readOverlayText,
}) {
await record('telemetry contract docs keep canonical Redis audit artifact paths', async () => {
  const telemetryContract = fs.readFileSync(contractPath, 'utf8');

  assert.equal(telemetryContract.includes('`redis.jsonl`'), false);
  assert.equal(telemetryContract.includes('.swarm/logs/redis/redis-exchanges.jsonl'), true);
  assert.equal(telemetryContract.includes('.swarm/logs/redis/redis-ops.jsonl'), true);
  assert.equal(telemetryContract.includes('.swarm/logs/pipeline/runs/<run_id>/redis/redis-exchanges.jsonl'), true);
  assert.equal(telemetryContract.includes('.swarm/logs/pipeline/runs/<run_id>/redis/redis-ops.jsonl'), true);
});

await record('telemetry contract docs keep one canonical stream and no stale Buster streams', async () => {
  const telemetryContract = fs.readFileSync(contractPath, 'utf8');
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');

  assert.equal(telemetryContract.includes('buster:telemetry:<project>:<run_id>'), false);
  assert.equal(telemetryContract.includes('`pipeline:telemetry:<project>:<run_id>` is the single canonical live stream'), true);
  assert.equal(telemetrySchema.includes('`pipeline:telemetry:<project>:<run_id>` is the single canonical live stream.'), true);
});

await record('telemetry docs keep contract and schema authority split explicit', async () => {
  const telemetryContract = fs.readFileSync(contractPath, 'utf8');
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  const telemetryReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'reference', 'telemetry-events.md'), 'utf8');

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
  assert.equal(telemetryReference.includes('Canonical inventory and stream semantics are owned by `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`.'), true);
  assert.equal(telemetryReference.includes('Event-by-event payload fields are owned by `docs/telemetry-event-schema.md`.'), true);
});

await record('telemetry docs expose latest.json as the operator pointer to the newest run-scoped audit tree', async () => {
  const pipelineReadme = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'README.md'), 'utf8');
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  const telemetryArtifacts = fs.readFileSync(path.join(sourceRoot, 'docs', 'pipeline', 'telemetry-and-artifacts.md'), 'utf8');
  const statusArtifacts = fs.readFileSync(path.join(sourceRoot, 'docs', 'reference', 'status-and-artifacts.md'), 'utf8');

  for (const doc of [pipelineReadme, telemetrySchema, telemetryArtifacts, statusArtifacts]) {
    assert.equal(doc.includes('.swarm/logs/pipeline/latest.json'), true);
    assert.equal(doc.includes('telemetry_stream_key'), true);
    assert.equal(doc.includes('nova-injections.jsonl'), true);
    assert.equal(doc.includes('buster-telemetry-fallback.jsonl'), true);
    assert.equal(doc.includes('redis/redis-exchanges.jsonl'), true);
    assert.equal(doc.includes('redis/redis-ops.jsonl'), true);
  }
});

await record('summary telemetry docs keep summary.started/completed canonical and drop case-study-only event names', async () => {
  const telemetryContract = fs.readFileSync(contractPath, 'utf8');
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');

  assert.equal(telemetryContract.includes('`summary.started`'), true);
  assert.equal(telemetryContract.includes('`summary.completed`'), true);
  assert.equal(telemetryContract.includes('`case_study.started`'), false);
  assert.equal(telemetryContract.includes('`case_study.completed`'), false);
  assert.equal(telemetrySchema.includes('### summary.started'), true);
  assert.equal(telemetrySchema.includes('### summary.completed'), true);
  assert.equal(telemetrySchema.includes('## `case_study.started`'), false);
  assert.equal(telemetrySchema.includes('## `case_study.completed`'), false);
});

await record('project setup and public progress docs keep canonical stream ownership explicit', async () => {
  const progressJsonGuide = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'project_setup', 'progress-json.md'), 'utf8');
  const progressJsonReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'reference', 'progress-json.md'), 'utf8');

  for (const doc of [progressJsonGuide, progressJsonReference]) {
    assert.equal(doc.includes('telemetry'), true);
    assert.equal(doc.includes('"stream_key"'), false);
    assert.equal(doc.includes('Legacy-compatible enable flag'), false);
    assert.equal(doc.includes('published to the canonical run-scoped stream `pipeline:telemetry:<project>:<run_id>`'), true);
    assert.equal(doc.includes('Override stream key'), false);
  }
});

await record('Buster telemetry_stream payload hint is removed from runtime docs and code', async () => {
  const busterReadme = fs.readFileSync(path.join(sourceRoot, 'skills', 'buster', 'README.md'), 'utf8');
  const busterPipeline = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/buster-pipeline.ts');
  const busterTelemetry = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/telemetry.ts');

  assert.equal(busterReadme.includes('| `telemetry_stream` |'), false);
  assert.equal(busterPipeline.includes('payload?.telemetry_stream'), false);
  assert.equal(busterPipeline.includes('streamKey:'), false);
  assert.equal(busterTelemetry.includes('Legacy compatibility hint. The value does not rename the stream.'), false);
});

await record('telemetry enable docs describe explicit degraded fallback on Redis outage', async () => {
  const telemetryArtifacts = fs.readFileSync(path.join(sourceRoot, 'docs', 'pipeline', 'telemetry-and-artifacts.md'), 'utf8');
  const operatorObservability = fs.readFileSync(path.join(sourceRoot, 'docs', 'operators', 'observability.md'), 'utf8');
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');

  assert.equal(telemetryArtifacts.includes('buster-telemetry-fallback.jsonl'), true);
  assert.equal(telemetryArtifacts.includes('observability.degraded'), true);
  assert.equal(operatorObservability.includes('buster-telemetry-fallback.jsonl'), true);
  assert.equal(telemetrySchema.includes('artifact_fallback: true'), true);
  assert.equal(telemetryArtifacts.includes('werden Events still verworfen'), false);
});
}
