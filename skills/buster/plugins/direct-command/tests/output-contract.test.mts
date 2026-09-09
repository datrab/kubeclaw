import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { validateAndMapOutputs } from '../../../engine/test-gates/runner.ts';
import { FileEvidenceStore } from '../../../engine/test-gates/artifacts.ts';

const plugins = path.resolve(import.meta.dirname, '../..');
const registry = buildRegistry(discoverPackages({ installationRoots: [plugins], trustPolicy: {
  trustedBuiltinRoots: [plugins], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'output-contract-regression',
} }));
const entry = registry.testProviderContracts.get('kubeclaw.direct-command@1')!;
const container = registry.testProviderContracts.get('kubeclaw.container-build@1')!;
const schema = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../schemas/config.schema.json'), 'utf8'));
const types: string[] = schema.$defs.artifact.properties.mediaType.enum;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'output-contract-'));
const limits = { cpuMillis: 5000, memoryBytes: 512 * 1024 * 1024, logBytes: 4096, artifactBytes: 4096, artifactFiles: 16, processes: 8 };
const store = new FileEvidenceStore(path.join(temporary, 'stored'));
// Contract input vectors exercise the same production validator called by both runner paths.
// They are not represented as BuildKit executions or fabricated provider reports.
const result = (outcome: 'passed' | 'failed', outputs: any[] = []): any => ({
  schemaVersion: 'provider-result.v1', outcome, outputs,
});
try {
  assert.deepEqual(validateAndMapOutputs(container, result('failed'), new Map()), []);
  assert.throws(() => validateAndMapOutputs(container, result('passed'), new Map()), /OUTPUT_REQUIRED:image/u);
  assert.throws(() => validateAndMapOutputs(container, result('failed', [
    { name: 'image', kind: 'value', schemaId: 'wrong', value: {} },
  ]), new Map()), /OUTPUT_SCHEMA_INVALID:image/u);
  for (const [typeIndex, mediaType] of types.entries()) {
    const artifacts = Array.from({ length: 8 }, (_, index) => ({ id: `file-${index}`, path: `file-${index}`, mediaType }));
    const plan = resolveTestPlan({ planId: `plan:outputs:${typeIndex}`, runId: `run:outputs:${typeIndex}`, project: 'outputs',
      scope: { moduleId: 'app', gateId: null }, createdAt: '2026-09-09T00:00:00Z',
      declaration: { tests: { command: { uses: 'kubeclaw.direct-command@1', config: { executable: 'node', resultMode: 'exit-code', artifacts } } } },
      suiteTemplates: [], registry, facts: { changedPaths: [], moduleType: 'web', pipelineStage: 'test' },
      policy: { defaultTimeoutMs: 5000, maximumTimeoutMs: 5000, defaultLimits: limits, maximumLimits: limits,
        maximumRetryCount: 1, maximumMatrixSize: 1, maximumNodes: 1, defaultConcurrencyLimit: 1, maximumConcurrencyLimits: {} } });
    assert.equal(plan.nodes.length, 1);
    const evidence = new Map();
    for (const item of artifacts) {
      fs.writeFileSync(path.join(temporary, item.path), `actual file ${item.id}\n`);
      const stored = await store.store(`attempt:${typeIndex}`, temporary,
        { evidenceId: item.id, file: item.path, type: 'artifact', mediaType }, 4096);
      evidence.set(item.id, { evidenceId: item.id, artifact: stored.artifact });
    }
    const outputs = artifacts.map((item, index) => ({ name: `artifact-${index + 1}`, kind: 'artifact', evidenceId: item.id }));
    for (const outcome of ['passed', 'failed'] as const) {
      assert.equal(validateAndMapOutputs(entry, result(outcome, outputs), evidence).length, 8);
      assert.throws(() => validateAndMapOutputs(entry, result(outcome, outputs), new Map()), /OUTPUT_ARTIFACT_INVALID/u);
      const invalid = new Map(evidence);
      const first = invalid.get('file-0');
      invalid.set('file-0', { ...first, artifact: { ...first.artifact, mediaType: 'application/unsupported' } });
      assert.throws(() => validateAndMapOutputs(entry, result(outcome, outputs), invalid), /OUTPUT_ARTIFACT_INVALID/u);
    }
  }
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, suite: 'output-contract', artifactSlots: 8, mediaTypes: types.length, scope: 'resolver-validator-real-files' }));
