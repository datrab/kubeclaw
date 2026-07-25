#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { bundleHash, gitState, json, jsonl, sha } from './observability-readiness-io.ts';
import { verifyRun } from './observability-readiness-verify.ts';

function args(argv: string[] = process.argv.slice(2)) {
  const out: any = { command: 'verify' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value) continue;
    if (['verify', 'export', 'pin', 'replay'].includes(value)) out.command = value;
    else if (value.startsWith('--')) out[value.slice(2).replaceAll('-', '_')] = argv[index += 1];
  }
  return out;
}

function assertPinnedSource(runDir: string, contractsDir: string, manifest: any, expected: any) {
  const repoRoot = path.resolve(contractsDir, '../../..');
  const sourceGit = gitState(repoRoot);
  if (!sourceGit.clean) throw new Error('pinned bundle export requires a clean pipeline worktree');
  if (manifest.git?.dirty !== false || manifest.git?.commit !== sourceGit.commit) {
    throw new Error('pinned bundle must be recorded from the current clean pipeline commit');
  }
  if (!(expected.scenario_facts ?? []).some((fact: any) => fact.provenance === 'recorded' && fact.status === 'covered')) {
    throw new Error('pinned bundle requires recorded scenario evidence');
  }
  return sourceGit;
}

function writeExportRecord(output: string, check: any, sourceGit: any) {
  const record = {
    schema_version: 'pipeline_evidence_export.v1', exported_at: new Date().toISOString(),
    source_run_id: check.run_id, verification: check, contracts_reference: 'contracts/telemetry/v1',
    contract_manifest_reference: 'contract-manifest.json', expected_source_facts_reference: 'expected-source-facts.json',
    source_git_commit: sourceGit.commit, source_git_clean: sourceGit.clean,
    bundle_sha256: bundleHash(output), hash_algorithm: 'sha256-path-content-v1',
  };
  fs.writeFileSync(path.join(output, 'bundle-export.json'), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

function copyBundle(runDir: string, output: string, contractsDir: string, pinned = false) {
  const check = verifyRun(runDir);
  if (!check.ok) throw new Error(`source run is not exportable: ${check.errors.join('; ')}`);
  const manifest = json(path.join(runDir, 'run-manifest.json'));
  const expected = json(path.join(runDir, 'expected-source-facts.json'));
  const sourceGit = pinned
    ? assertPinnedSource(runDir, contractsDir, manifest, expected)
    : gitState(path.resolve(contractsDir, '../../..'));
  if (fs.existsSync(output)) throw new Error(`output already exists: ${output}`);
  fs.cpSync(runDir, output, { recursive: true, errorOnExist: true });
  if (!fs.existsSync(contractsDir)) throw new Error(`contracts directory missing: ${contractsDir}`);
  fs.cpSync(contractsDir, path.join(output, 'contracts', 'telemetry', 'v1'), { recursive: true });
  const runCatalog = path.resolve(runDir, '..', '..', 'run-catalog.jsonl');
  if (fs.existsSync(runCatalog)) fs.copyFileSync(runCatalog, path.join(output, 'run-catalog.jsonl'));
  const record = writeExportRecord(output, check, sourceGit);
  return { ...verifyRun(output), contracts: true, run_catalog: fs.existsSync(path.join(output, 'run-catalog.jsonl')),
    pinned, bundle_sha256: record.bundle_sha256, source_git_commit: sourceGit.commit };
}

function lifecycleProjection(events: any[]) {
  const projection: any = { pipeline: null, modules: {}, gates: {}, generators: {}, validators: {}, pipeline_steps: {} };
  const kinds: Record<string, string> = { module: 'modules', gate: 'gates', generator: 'generators', validator: 'validators', pipeline_step: 'pipeline_steps' };
  for (const event of events) {
    const kind = kinds[event.work_type] ?? 'pipeline';
    if (kind === 'pipeline') projection.pipeline = event.new_state ?? null;
    else if (event.work_id) projection[kind][event.work_id] = event.new_state ?? null;
  }
  return projection;
}

function projectionMismatches(projection: any, expected: any) {
  const mismatches: any[] = [];
  const expectedPipeline = expected.pipeline?.status ?? null;
  if (projection.pipeline !== expectedPipeline) mismatches.push({ target: 'pipeline', expected: expectedPipeline, actual: projection.pipeline });
  for (const kind of ['modules', 'gates', 'generators', 'validators', 'pipeline_steps']) {
    for (const [id, model] of Object.entries(expected[kind] ?? {})) {
      const expectedState = (model as any)?.status ?? null;
      if (projection[kind][id] !== expectedState) mismatches.push({ target: `${kind}/${id}`, expected: expectedState, actual: projection[kind][id] ?? null });
    }
  }
  return mismatches;
}

function replay(runDir: string) {
  const check = verifyRun(runDir);
  if (!check.ok) return check;
  const lifecycle = jsonl(path.join(runDir, 'lifecycle', 'canonical-events.jsonl'));
  const projection = lifecycleProjection(lifecycle);
  const expected = json(path.join(runDir, 'lifecycle', 'read-models.json'));
  const mismatches = projectionMismatches(projection, expected);
  return { ...check, ok: mismatches.length === 0, replay: { projection, mismatches,
    expected_sha256: sha(JSON.stringify(expected)), event_count: lifecycle.length } };
}

function executeCommand(options: any) {
  if (!options.run_dir) throw new Error('--run-dir is required');
  const runDir = path.resolve(options.run_dir);
  if (['export', 'pin'].includes(options.command)) {
    if (!options.output) throw new Error('--output is required');
    return copyBundle(runDir, path.resolve(options.output), path.resolve(options.contracts_dir ?? 'contracts/telemetry/v1'), options.command === 'pin');
  }
  return options.command === 'replay' ? replay(runDir) : verifyRun(runDir);
}

const result = executeCommand(args());
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
