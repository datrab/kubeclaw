#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ledger = JSON.parse(fs.readFileSync(path.join(root, 'docs/architecture/plugin-system-migration-units.json'), 'utf8'));
const surfaces = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/generated/inventory/plugin-system-migration-surfaces.json'),
  'utf8',
));

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}
function fail(message) {
  throw new Error(`plugin parity evidence: ${message}`);
}
function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function filesBelow(target) {
  if (!fs.existsSync(target)) return [];
  if (fs.statSync(target).isFile()) return [target];
  return fs.readdirSync(target, { withFileTypes: true })
    .flatMap((entry) => filesBelow(path.join(target, entry.name)));
}
function fileEntries(relativePaths) {
  return [...new Set(relativePaths)].sort().map((relativePath) => ({
    path: relativePath,
    digest: digest(fs.readFileSync(path.join(root, relativePath))),
  }));
}
function entriesDigest(entries) {
  return digest(JSON.stringify(entries));
}
function safeId(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

const unitId = argument('--unit');
const status = argument('--status');
if (!unitId || !status) fail('usage: --unit <id> --status <implementation-in-progress|parity-proven|cutover-complete>');
const unit = ledger.units.find((candidate) => candidate.id === unitId);
if (!unit) fail(`unknown unit ${unitId}`);
if (!['implementation-in-progress', 'parity-proven', 'cutover-complete'].includes(status)) fail(`unsupported status ${status}`);
if (['parity-proven', 'cutover-complete'].includes(status) && unit.parityBlockers?.length) {
  fail(`${unitId} still has parity blockers: ${unit.parityBlockers.join('; ')}`);
}
if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) {
  fail('refusing to record evidence from a dirty worktree');
}

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const unitSurfaces = surfaces.surfaces.filter((surface) => surface.unitId === unitId);
if (unitSurfaces.length !== unit.targetOwnerIds.length) fail('generated surface ledger is incomplete for this unit');
const sourceFiles = fileEntries(unitSurfaces.flatMap((surface) => surface.legacySourceFiles));
const targetFiles = fileEntries(unitSurfaces.flatMap((surface) => surface.targetFiles));
const requiredScenarios = unit.scenarios
  .filter((scenario) => scenario.requiredBefore.includes(status))
  .sort((a, b) => a.id.localeCompare(b.id));
for (const scenario of requiredScenarios) {
  const decision = scenario.implementationDecision;
  // Baseline scenarios intentionally omit this until a migration author makes
  // the required reuse/refactor/rewrite decision. Evidence must not be
  // recordable before that decision is committed to the migration ledger.
  if (!decision
      || !['reuse', 'refactor', 'rewrite'].includes(decision.strategy)
      || !decision.legacyBehavior?.trim()
      || !decision.replacementBehavior?.trim()
      || !decision.rationale?.trim()
      || !decision.complexityImpact?.trim()
      || typeof decision.behaviorChanged !== 'boolean') {
    fail(`${scenario.id} lacks a complete implementationDecision in the migration ledger`);
  }
  const changed = ['intentionally-changed', 'approved-obsolete'].includes(scenario.disposition);
  if (decision.behaviorChanged !== changed) {
    fail(`${scenario.id} behaviorChanged conflicts with disposition ${scenario.disposition}`);
  }
  if (changed && !decision.approvalRef?.trim()) {
    fail(`${scenario.id} changes behavior without an approval reference`);
  }
  if (!changed && decision.approvalRef !== null) {
    fail(`${scenario.id} unchanged or new behavior must use a null approval reference`);
  }
}
if (['parity-proven', 'cutover-complete'].includes(status)) {
  const requiredTargets = [...new Set([...(unit.targetPackages || []), ...(unit.targetExtensions || [])])].sort();
  const coveredTargets = requiredScenarios
    .filter((scenario) => scenario.evidenceType === 'replacement' && scenario.targetPackage)
    .map((scenario) => scenario.targetPackage)
    .sort();
  const uncoveredTargets = requiredTargets.filter((target) => !coveredTargets.includes(target));
  if (uncoveredTargets.length) {
    fail(`${unitId} lacks a distinct package-local replacement scenario for: ${uncoveredTargets.join(', ')}`);
  }
}

const commands = [
  ...ledger.parityGates.filter((gate) => gate.requiredBefore.includes(status))
    .map((gate) => ({ id: gate.id, command: gate.command })),
  ...requiredScenarios.map((scenario) => ({ id: `scenario:${scenario.id}`, command: scenario.command })),
].sort((a, b) => a.id.localeCompare(b.id));
const commandOutputs = [];
for (const command of commands) {
  const result = spawnSync('bash', ['-lc', command.command], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  process.stdout.write(output);
  if (result.status !== 0) fail(`${command.id} failed with exit code ${result.status ?? 'unknown'}`);
  commandOutputs.push({ ...command, output });
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-plugin-parity-'));
const pinnedRoot = path.join(tempRoot, 'pinned');
const bundleDigests = {};
try {
  fs.mkdirSync(pinnedRoot);
  const archive = execFileSync('git', ['archive', '--format=tar', commit], {
    cwd: root,
    maxBuffer: 512 * 1024 * 1024,
  });
  const extract = spawnSync('tar', ['-xf', '-', '-C', pinnedRoot], {
    input: archive,
    maxBuffer: 512 * 1024 * 1024,
  });
  if (extract.status !== 0) fail(`cannot extract pinned evidence commit ${commit}`);
  for (const role of ['nova', 'buster']) {
    const archive = path.join(tempRoot, `${role}.tgz`);
    execFileSync('bash', [
      path.join(pinnedRoot, 'scripts/package-agent-skill-bundle.sh'),
      role,
      archive,
      commit,
      'v1',
      '1970-01-01T00:00:00Z',
    ], { cwd: pinnedRoot, stdio: 'pipe' });
    bundleDigests[role] = digest(fs.readFileSync(archive));
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

const scenarios = requiredScenarios.map((scenario) => {
  const paths = filesBelow(path.join(root, scenario.path))
    .filter((file) => fs.statSync(file).isFile())
    .map((file) => path.relative(root, file).split(path.sep).join('/'));
  const entries = fileEntries(paths);
  return {
    id: scenario.id,
    path: scenario.path,
    targetPackage: scenario.targetPackage ?? null,
    disposition: scenario.disposition,
    implementationDecision: scenario.implementationDecision,
    pathDigest: entriesDigest(entries),
  };
});
const evidenceDirectory = path.join(root, 'docs/architecture/plugin-system-parity-evidence');
const outputDirectory = path.join(evidenceDirectory, 'outputs');
const previous = fs.existsSync(evidenceDirectory)
  ? filesBelow(evidenceDirectory)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({ file, record: JSON.parse(fs.readFileSync(file, 'utf8')) }))
    .filter((entry) => entry.record.unitId === unitId)
    .sort((a, b) => Date.parse(a.record.recordedAt) - Date.parse(b.record.recordedAt))
    .at(-1)
  : null;
const prefix = `${unitId}.${status}.${commit}`;
fs.mkdirSync(outputDirectory, { recursive: true });
const results = commandOutputs.map((entry) => {
  const relativeOutput = `docs/architecture/plugin-system-parity-evidence/outputs/${prefix}.${safeId(entry.id)}.log`;
  fs.writeFileSync(path.join(root, relativeOutput), entry.output, { flag: 'wx' });
  return {
    gateId: entry.id,
    command: entry.command,
    exitCode: 0,
    outputPath: relativeOutput,
    outputDigest: digest(entry.output),
  };
});
const record = {
  schemaVersion: 'plugin-system-parity-evidence-v2',
  unitId,
  status,
  commit,
  recordedAt: new Date().toISOString(),
  previousEvidenceDigest: previous ? digest(fs.readFileSync(previous.file)) : null,
  sourceFiles,
  sourceDigest: entriesDigest(sourceFiles),
  targetFiles,
  targetDigest: entriesDigest(targetFiles),
  bundleDigests,
  scenarios,
  scenarioDispositionDigest: digest(JSON.stringify(scenarios)),
  results,
};
fs.mkdirSync(evidenceDirectory, { recursive: true });
const outputPath = path.join(evidenceDirectory, `${prefix}.json`);
fs.writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
console.log(path.relative(root, outputPath).split(path.sep).join('/'));
