import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  artifactPaths,
  canonicalFingerprint,
  verifyArtifactCatalog,
  writeCanonicalJson,
} from '../portable-artifacts.ts';
import { appendEvaluationFact } from './evidence-evaluation.ts';
import {
  defaultProducerHealth,
  writeProducerHealth,
} from './evidence-health.ts';
import { buildRunManifest } from './evidence-manifest.ts';
import {
  emitLifecycleSnapshot,
  writeExpectedFacts,
} from './evidence-projection.ts';
import {
  evidenceConfig,
  readJson,
  readJsonLines,
} from './evidence-utils.ts';

function writeTerminalClosure(config: any, input: any) {
  const paths = artifactPaths(evidenceConfig(config));
  const closure = {
    schema_version: 'terminal_closure.v1',
    run_id: config._runId ?? config.run_id,
    project: config.project,
    closed_at: new Date().toISOString(),
    outcome: input.outcome,
    reason_code: input.reason_code,
    duration_ms: input.duration_ms ?? null,
    counts: input.counts ?? {},
    cost: input.cost ?? null,
    last_work_id: input.last_work_id ?? null,
    manifest_fingerprint: input.manifest_fingerprint,
    observability: input.observability ?? 'unknown',
    summary_reference: input.summary_reference ?? null,
    artifact_catalog_reference: 'artifacts.jsonl',
  };
  writeCanonicalJson(paths.closure, closure);
  if (typeof config?._emitCanonicalEvidence === 'function') {
    void Promise.resolve(config._emitCanonicalEvidence(
      'terminal.closure',
      {
        outcome: closure.outcome,
        reason_code: closure.reason_code,
        duration_ms: closure.duration_ms,
        counts: closure.counts,
        cost: closure.cost,
        last_work_id: closure.last_work_id,
        manifest_fingerprint: closure.manifest_fingerprint,
        observability: closure.observability,
        references: [
          closure.summary_reference,
          closure.artifact_catalog_reference,
        ].filter(Boolean),
      },
      { sourceEventId: `terminal-closure/${closure.run_id}` }
    ));
  }
  return closure;
}

function archiveSource(paths: any, file: string) {
  const bytes = fs.readFileSync(file);
  return {
    reference: path.relative(paths.root, file).split(path.sep).join('/'),
    byte_length: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

function archiveSourceFiles(paths: any, lifecycle: string, telemetry: string) {
  return [
    lifecycle,
    telemetry,
    paths.catalog,
    paths.manifest,
    paths.closure,
    paths.health,
    paths.evaluation,
    ...[
      'contract-manifest.json',
      'expected-source-facts.json',
      'commands.jsonl',
      'runtime-logs.jsonl',
      'quarantine.jsonl',
      'lifecycle/read-models.json',
    ].map((relative) => path.join(paths.root, relative)),
  ].filter((file) => fs.existsSync(file));
}

function buildArchiveManifest(config: any) {
  const paths = artifactPaths(evidenceConfig(config));
  const lifecycle = path.join(
    paths.root,
    'lifecycle',
    'canonical-events.jsonl'
  );
  const telemetry = path.join(paths.root, 'pipeline.jsonl');
  const eventLines = readJsonLines(lifecycle);
  const closure = readJson(paths.closure, {});
  const archive = {
    schema_version: 'run_archive_manifest.v1',
    run_id: config._runId ?? config.run_id,
    project: config.project,
    created_at: new Date().toISOString(),
    lifecycle: {
      event_count: eventLines.length,
      first_cursor: eventLines[0]?.event_id ?? null,
      last_cursor: eventLines.at(-1)?.event_id ?? null,
    },
    sources: archiveSourceFiles(paths, lifecycle, telemetry)
      .map((file) => archiveSource(paths, file)),
    manifest_reference: 'run-manifest.json',
    terminal_reference: fs.existsSync(paths.closure)
      ? 'terminal-closure.json'
      : null,
    completeness: closure.observability ?? 'unknown',
    repair_state: 'verified',
  };
  const result = {
    ...archive,
    sha256: canonicalFingerprint(archive),
  };
  writeCanonicalJson(paths.archive, result);
  return result;
}

function appendRunCatalog(config: any, archive: any) {
  const paths = artifactPaths(evidenceConfig(config));
  const catalog = path.join(
    path.dirname(path.dirname(paths.root)),
    'run-catalog.jsonl'
  );
  const existing = readJsonLines(catalog);
  if (existing.some((item) =>
    item.run_id === archive.run_id && item.sha256 === archive.sha256
  )) {
    return archive;
  }
  fs.mkdirSync(path.dirname(catalog), { recursive: true });
  fs.appendFileSync(catalog, `${JSON.stringify({
    schema_version: 'run_catalog_entry.v1',
    run_id: archive.run_id,
    project: archive.project,
    archive_reference: path.relative(
      path.dirname(catalog),
      paths.archive
    ).split(path.sep).join('/'),
    sha256: archive.sha256,
    completeness: archive.completeness,
    repair_state: archive.repair_state,
    recorded_at: new Date().toISOString(),
  })}\n`);
  return archive;
}

function ensureEvidenceFiles(paths: any) {
  fs.mkdirSync(paths.root, { recursive: true });
  for (const relative of [
    'commands.jsonl',
    'runtime-logs.jsonl',
    'quarantine.jsonl',
    'evaluation-facts.jsonl',
    'artifacts.jsonl',
    'pipeline.jsonl',
  ]) {
    const file = path.join(paths.root, relative);
    if (!fs.existsSync(file)) fs.writeFileSync(file, '');
  }
}

function copyContractManifest(config: any, paths: any) {
  const contractManifest = path.join(
    config?.repo_root ?? process.cwd(),
    'contracts',
    'telemetry',
    'v1',
    'contract-manifest.json'
  );
  if (fs.existsSync(contractManifest)) {
    fs.copyFileSync(
      contractManifest,
      path.join(paths.root, 'contract-manifest.json')
    );
  }
}

function recordTerminalFacts(config: any, closure: any, health: any) {
  appendEvaluationFact(config, {
    dimension: 'run.outcome',
    value: {
      outcome: closure.outcome,
      reason_code: closure.reason_code,
      duration_ms: closure.duration_ms,
      counts: closure.counts,
      cost: closure.cost,
      last_work_id: closure.last_work_id,
    },
  });
  appendEvaluationFact(config, {
    dimension: 'observability.completeness',
    value: {
      status: closure.observability,
      producer_statuses: health.producers.map((producer: any) => ({
        producer_id: producer.producer_id,
        status: producer.status,
      })),
    },
  });
}

export function finalizeEvidencePlane(config: any, input: any) {
  const normalized = evidenceConfig(config);
  const paths = artifactPaths(normalized);
  ensureEvidenceFiles(paths);
  copyContractManifest(config, paths);
  const manifest = fs.existsSync(paths.manifest)
    ? readJson(paths.manifest)
    : buildRunManifest(config, input.progress);
  const artifactCheck = verifyArtifactCatalog(normalized);
  const producers = input.producers
    ?? defaultProducerHealth(config, artifactCheck);
  const health = writeProducerHealth(config, producers);
  const closure = writeTerminalClosure(config, {
    ...input,
    manifest_fingerprint: manifest.fingerprint,
    observability: health.completeness,
  });
  recordTerminalFacts(config, closure, health);
  emitLifecycleSnapshot(config, paths, closure.run_id);
  const expectedFacts = writeExpectedFacts(
    input,
    paths,
    closure,
    health
  );
  const archive = buildArchiveManifest(config);
  appendRunCatalog(config, archive);
  return {
    manifest,
    health,
    closure,
    archive,
    artifact_check: artifactCheck,
    expected_facts: expectedFacts,
  };
}

function terminalOutcome(terminalStatus: string) {
  if (terminalStatus === 'succeeded') return 'success';
  if (terminalStatus === 'paused') return 'paused';
  if (terminalStatus === 'cancelled') return 'cancelled';
  return 'failure';
}

export function finalizeSummaryEvidence(config: any, input: any) {
  return finalizeEvidencePlane(config, {
    progress: input.progress,
    outcome: terminalOutcome(input.terminalStatus),
    reason_code: input.reasonCode,
    duration_ms: input.durationSeconds * 1000,
    counts: input.runStats,
    cost: input.cost,
    summary_reference: input.summaryReference,
  });
}

export function summaryEvidenceFields(evidence: any) {
  return {
    manifest_fingerprint: evidence.manifest.fingerprint,
    terminal_closure_reference: 'terminal-closure.json',
    archive_manifest_reference: 'archive-manifest.json',
    observability_completeness: evidence.closure.observability,
  };
}
