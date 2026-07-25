import path from 'node:path';
import { writeCanonicalJson } from '../portable-artifacts.ts';
import { readJson, readJsonLines } from './evidence-utils.ts';

export function emitLifecycleSnapshot(
  config: any,
  paths: any,
  runId: string
) {
  if (typeof config?._emitCanonicalEvidence !== 'function') return;
  const readModels = readJson(
    path.join(paths.root, 'lifecycle', 'read-models.json'),
    {}
  );
  const lifecycleEvents = readJsonLines(
    path.join(paths.root, 'lifecycle', 'canonical-events.jsonl')
  );
  void Promise.resolve(config._emitCanonicalEvidence(
    'lifecycle.snapshot',
    {
      lifecycle_version: 'pipeline_lifecycle.v1',
      read_models: readModels,
      event_count: lifecycleEvents.length,
      last_cursor: lifecycleEvents.at(-1)?.event_id ?? null,
    },
    { sourceEventId: `lifecycle-snapshot/${runId}/terminal` }
  ));
}

function uniqueSorted(values: any[]) {
  return [...new Set(values.filter(Boolean))].sort();
}

export function writeExpectedFacts(
  input: any,
  paths: any,
  closure: any,
  health: any
) {
  const telemetryEvents = readJsonLines(
    path.join(paths.root, 'pipeline.jsonl')
  );
  const artifacts = readJsonLines(paths.catalog);
  const productionEvents = telemetryEvents.filter((event) =>
    (event.extensions?.evidence_provenance ?? 'production') !== 'synthetic'
  );
  const expectedFacts = {
    schema_version: 'expected_source_facts.v1',
    run_id: closure.run_id,
    project: closure.project,
    event_types: uniqueSorted(telemetryEvents.map((event) => event.type)),
    readiness_event_types: uniqueSorted(
      productionEvents.map((event) => event.type)
    ),
    artifact_kinds: uniqueSorted(artifacts.map((item) => item.kind)),
    lifecycle_projection: readJson(
      path.join(paths.root, 'lifecycle', 'read-models.json'),
      {}
    ),
    scenario_facts: Array.isArray(input.scenario_facts)
      ? input.scenario_facts
      : [],
    capabilities: health.producers.flatMap(
      (producer: any) => producer.capabilities ?? []
    ),
  };
  writeCanonicalJson(
    path.join(paths.root, 'expected-source-facts.json'),
    expectedFacts
  );
  return expectedFacts;
}
