import fs from 'node:fs';
import path from 'node:path';
import { validateJsonSchema } from '../services/telemetry/payload-schema.ts';
import { bundleHash, json, jsonl, required, safeRelative, sha } from './observability-readiness-io.ts';

const REQUIRED_FILES = [
  'run-manifest.json', 'terminal-closure.json', 'archive-manifest.json', 'producer-health.json',
  'artifacts.jsonl', 'lifecycle/canonical-events.jsonl', 'lifecycle/read-models.json',
  'pipeline.jsonl', 'evaluation-facts.jsonl', 'commands.jsonl', 'runtime-logs.jsonl',
  'quarantine.jsonl', 'expected-source-facts.json',
];

function contractManifest(runDir: string, errors: string[], checks: string[]) {
  const file = path.join(runDir, 'contract-manifest.json');
  if (!required(file, errors, checks, 'contract_manifest')) return null;
  const manifest = json(file);
  if (manifest.schema_version !== 'telemetry_contract_manifest.v1') errors.push('invalid contract manifest version');
  if (!Array.isArray(manifest.files) || !manifest.files.length) errors.push('contract manifest files are empty');
  return manifest;
}

function typedRecords(data: any, contractRoot: string, errors: string[], checks: string[]) {
  checks.push('typed_bundle_records');
  for (const [name, value] of [['run_manifest', data.manifest], ['producer_health_snapshot', data.health],
    ['pipeline_lifecycle_read_models', data.readModels], ['expected_source_facts', data.expected]]) {
    errors.push(...validateJsonSchema(value, json(path.join(contractRoot, 'bundle', `${name}.v1.schema.json`)), name));
  }
  const schema = json(path.join(contractRoot, 'bundle', 'pipeline_command_evidence.v1.schema.json'));
  data.commands.forEach((command: any, index: number) => errors.push(...validateJsonSchema(command, schema, `commands[${index}]`)));
}

function archiveSources(runDir: string, archive: any, errors: string[], checks: string[]) {
  checks.push('archive_sources');
  for (const source of archive.sources ?? []) {
    const file = safeRelative(runDir, source.reference);
    if (!fs.existsSync(file)) errors.push(`archive source missing: ${source.reference}`);
    else {
      const bytes = fs.readFileSync(file);
      const sourceCorrupt = [
        bytes.length !== source.byte_length,
        sha(bytes) !== source.sha256,
      ].includes(true);
      if (sourceCorrupt) errors.push(`archive source corrupt: ${source.reference}`);
    }
  }
}

function artifactCatalog(runDir: string, artifacts: any[], errors: string[], checks: string[]) {
  checks.push('artifact_catalog');
  const logical = new Map<string, string>();
  for (const item of artifacts) {
    const file = safeRelative(runDir, item.reference);
    if (!fs.existsSync(file)) errors.push(`artifact missing: ${item.artifact_id}`);
    else {
      const bytes = fs.readFileSync(file);
      if (bytes.length !== item.byte_length || sha(bytes) !== item.sha256) errors.push(`artifact corrupt: ${item.artifact_id}`);
    }
    const prior = logical.get(item.logical_id);
    if (prior && prior !== item.sha256) errors.push(`logical artifact identity changed hash: ${item.logical_id}`);
    logical.set(item.logical_id, item.sha256);
    if (item.completeness === 'full' && item.transformation) errors.push(`full artifact declares transformation: ${item.artifact_id}`);
  }
}

function expectedSources(data: any, errors: string[], checks: string[]) {
  checks.push('expected_source_facts');
  const eventTypes = [...new Set(data.telemetry.map((event: any) => event.type).filter(Boolean))].sort();
  const readiness = data.telemetry.filter((event: any) => (event.extensions?.evidence_provenance ?? 'production') !== 'synthetic');
  const readinessTypes = [...new Set(readiness.map((event: any) => event.type).filter(Boolean))].sort();
  const artifactKinds = [...new Set(data.artifacts.map((item: any) => item.kind).filter(Boolean))].sort();
  if (JSON.stringify(data.expected.event_types) !== JSON.stringify(eventTypes)) errors.push('expected source event types drift');
  if (JSON.stringify(data.expected.readiness_event_types) !== JSON.stringify(readinessTypes)) errors.push('readiness event types drift');
  if (JSON.stringify(data.expected.artifact_kinds) !== JSON.stringify(artifactKinds)) errors.push('expected source artifact kinds drift');
  return readiness;
}

function stableIdentities(telemetry: any[], errors: string[], checks: string[]) {
  checks.push('stable_source_identity');
  const identities = new Map<string, string>();
  for (const event of telemetry) {
    if (!event.source_event_id) errors.push(`event missing source_event_id: ${event.type}`);
    if (!event.event_id) errors.push(`event missing event_id: ${event.type}`);
    const prior = identities.get(event.source_event_id);
    if (prior && prior !== event.event_id) errors.push(`source event identity drift: ${event.source_event_id}`);
    identities.set(event.source_event_id, event.event_id);
  }
}

function canonicalSchemas(telemetry: any[], contractRoot: string, errors: string[], checks: string[]) {
  checks.push('canonical_event_schemas');
  for (const event of telemetry) {
    const schemaFile = path.join(contractRoot, 'events', `${event.type}.schema.json`);
    if (!fs.existsSync(schemaFile)) { errors.push(`event schema missing: ${event.type}`); continue; }
    errors.push(...validateJsonSchema(event, json(schemaFile), event.type));
    if (event.module_id && event.work_id !== event.module_id) errors.push(`${event.type} module_id/work_id mismatch`);
    if (event.gate_id && event.work_id !== event.gate_id) errors.push(`${event.type} gate_id/work_id mismatch`);
    if (event.cursor !== `${event.project}/${event.run_id}/${event.seq}`) errors.push(`${event.type} cursor mismatch`);
  }
}

function fixtureProvenance(telemetry: any[], expected: any, errors: string[], checks: string[]) {
  checks.push('fixture_provenance');
  for (const event of telemetry) {
    const provenance = event.extensions?.evidence_provenance ?? 'production';
    if (!['production', 'recorded', 'synthetic'].includes(provenance)) errors.push(`${event.type} has invalid evidence provenance`);
  }
  for (const fact of expected.scenario_facts ?? []) {
    if (fact.provenance === 'synthetic' && fact.status === 'covered') errors.push(`synthetic scenario cannot satisfy readiness: ${fact.scenario_id}`);
  }
}

function causalIdentity(event: any) {
  return { session_id: event.session_id ?? null, model_call_id: event.model_call_id ?? null,
    work_id: event.work_id ?? null, attempt: event.attempt ?? null, dispatch_id: event.dispatch_id ?? null };
}

function nativeToolPairing(events: any[], errors: string[], checks: string[]) {
  checks.push('native_tool_pairing');
  const starts = events.filter((event) => event.type === 'agent.tool.started');
  const finishes = events.filter((event) => event.type === 'agent.tool.finished');
  const startById = new Map<string, any>();
  const finishById = new Map<string, any[]>();
  const causal = ['session_id', 'model_call_id', 'work_id', 'attempt', 'dispatch_id'];
  for (const event of [...starts, ...finishes]) {
    if (!event.tool_call_id) errors.push(`${event.type} missing tool_call_id`);
    const identity = causalIdentity(event);
    for (const field of causal) {
      const value = identity[field as keyof typeof identity];
      if ([value == null, value === ''].includes(true)) errors.push(`${event.type} missing ${field}`);
    }
  }
  for (const event of starts) {
    if (startById.has(event.tool_call_id)) errors.push(`duplicate tool start: ${event.tool_call_id}`);
    startById.set(event.tool_call_id, event);
  }
  for (const event of finishes) {
    const list = finishById.get(event.tool_call_id) ?? [];
    list.push(event); finishById.set(event.tool_call_id, list);
    const toolFinishIncomplete = [
      !event.outcome,
      !event.content_completeness,
      event.result_bytes == null,
      event.error === undefined,
    ].includes(true);
    if (toolFinishIncomplete) errors.push(`tool finish incomplete: ${event.tool_call_id}`);
  }
  pairToolEvents(startById, finishById, causal, errors);
}

function pairToolEvents(starts: Map<string, any>, finishes: Map<string, any[]>, causal: string[], errors: string[]) {
  for (const [id, start] of starts) {
    const paired = finishes.get(id) ?? [];
    if (paired.length !== 1) { errors.push(paired.length ? `duplicate tool finish: ${id}` : `orphan tool start: ${id}`); continue; }
    const finish = paired[0];
    const left = causalIdentity(start); const right = causalIdentity(finish);
    for (const field of causal) if (left[field as keyof typeof left] !== right[field as keyof typeof right]) errors.push(`tool pair ${id} mismatched ${field}`);
    if (Date.parse(finish.occurred_at) < Date.parse(start.occurred_at)) errors.push(`tool finish precedes start: ${id}`);
  }
  for (const id of finishes.keys()) if (!starts.has(id)) errors.push(`orphan tool finish: ${id}`);
}

function remainingChecks(runDir: string, data: any, errors: string[], checks: string[]) {
  checks.push('manifest_closure_fingerprint');
  if (data.manifest.fingerprint !== data.closure.manifest_fingerprint) errors.push('manifest fingerprint differs from terminal closure');
  checks.push('observability_completeness');
  if (!['complete', 'partial', 'degraded', 'unknown'].includes(data.closure.observability)) errors.push('invalid observability completeness');
  checks.push('lifecycle_archive_count');
  if (data.archive.lifecycle?.event_count !== data.lifecycle.length) errors.push('lifecycle event count drift');
  checks.push('producer_health');
  if (!Array.isArray(data.health.producers) || !data.health.producers.length) errors.push('producer health is empty');
  checks.push('capability_availability');
  for (const producer of data.health.producers ?? []) for (const capability of producer.capabilities ?? []) {
    const capabilityMalformed = [
      !capability.capability,
      !capability.status,
      capability.reason_code === undefined,
    ].includes(true);
    if (capabilityMalformed) errors.push(`producer capability malformed: ${producer.producer_id}`);
  }
  const versions = [data.manifest.schema_version, data.closure.schema_version, data.archive.schema_version,
    data.health.schema_version, data.expected.schema_version, ...data.artifacts.map((x: any) => x.schema_version),
    ...jsonl(path.join(runDir, 'evaluation-facts.jsonl')).map((x) => x.schema_version),
    ...data.commands.map((x: any) => x.schema_version), ...jsonl(path.join(runDir, 'quarantine.jsonl')).map((x) => x.schema_version)];
  checks.push('bundle_record_versions');
  if (versions.some((version) => typeof version !== 'string' || !version.endsWith('.v1'))) errors.push('bundle record schema version missing or unsupported');
}

function immutableExport(runDir: string, contractRoot: string, errors: string[], checks: string[]) {
  const file = path.join(runDir, 'bundle-export.json');
  if (!fs.existsSync(file)) return;
  checks.push('immutable_bundle_export');
  const exported = json(file);
  errors.push(...validateJsonSchema(exported, json(path.join(contractRoot, 'bundle', 'pipeline_evidence_export.v1.schema.json')), 'bundle_export'));
  if (exported.bundle_sha256 !== bundleHash(runDir)) errors.push('bundle export immutable hash mismatch');
}

export function verifyRun(runDir: string) {
  const errors: string[] = []; const checks: string[] = [];
  for (const name of REQUIRED_FILES) required(path.join(runDir, name), errors, checks, name.replaceAll('/', '_'));
  const manifestContract = contractManifest(runDir, errors, checks);
  if (errors.length) return { ok: false, errors, contracts_checked: checks.length, contract_manifest_files: manifestContract?.files?.length ?? 0 };
  const data = {
    manifest: json(path.join(runDir, 'run-manifest.json')), closure: json(path.join(runDir, 'terminal-closure.json')),
    archive: json(path.join(runDir, 'archive-manifest.json')), health: json(path.join(runDir, 'producer-health.json')),
    expected: json(path.join(runDir, 'expected-source-facts.json')), artifacts: jsonl(path.join(runDir, 'artifacts.jsonl')),
    lifecycle: jsonl(path.join(runDir, 'lifecycle', 'canonical-events.jsonl')), telemetry: jsonl(path.join(runDir, 'pipeline.jsonl')),
    readModels: json(path.join(runDir, 'lifecycle', 'read-models.json')), commands: jsonl(path.join(runDir, 'commands.jsonl')),
  };
  const contractRoot = fs.existsSync(path.join(runDir, 'contracts', 'telemetry', 'v1')) ? path.join(runDir, 'contracts', 'telemetry', 'v1') : path.resolve('contracts/telemetry/v1');
  typedRecords(data, contractRoot, errors, checks); archiveSources(runDir, data.archive, errors, checks);
  artifactCatalog(runDir, data.artifacts, errors, checks); const readiness = expectedSources(data, errors, checks);
  stableIdentities(data.telemetry, errors, checks); canonicalSchemas(data.telemetry, contractRoot, errors, checks);
  fixtureProvenance(data.telemetry, data.expected, errors, checks); nativeToolPairing(readiness, errors, checks);
  remainingChecks(runDir, data, errors, checks); immutableExport(runDir, contractRoot, errors, checks);
  return { ok: errors.length === 0, errors, run_id: data.archive.run_id, contracts_checked: checks.length, checks,
    contract_manifest_files: manifestContract.files.length, events: data.lifecycle.length,
    canonical_events: data.telemetry.length, artifacts: data.artifacts.length };
}
