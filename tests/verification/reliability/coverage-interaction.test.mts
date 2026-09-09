import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { assertCoveragePlan, gateCoverageDigest, type GateCoverageV1 } from '@kubeclaw/pipeline-test-gate-contract';

// Genuine local Node/Git regression plus original plan consumer. This is not an isolated Buster process proof.
test('M5 passes on the same commit where the M1/M2 interaction fails; its plan cannot certify cumulative coverage', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-interaction-'));
  const { NODE_TEST_CONTEXT: _parentTestContext, ...childEnvironment } = process.env;
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  try {
    for (let module = 1; module <= 5; module++) fs.mkdirSync(path.join(root, `m${module}`));
    fs.writeFileSync(path.join(root, 'm1/index.mjs'), 'export const amount = () => 100;\n');
    fs.writeFileSync(path.join(root, 'm2/index.mjs'), "import {amount} from '../m1/index.mjs'; export const price = () => amount();\n");
    for (let module = 3; module <= 5; module++) fs.writeFileSync(path.join(root, `m${module}/index.mjs`), `export const value = ${module};\n`);
    fs.writeFileSync(path.join(root, 'm5/check.test.mjs'), "import {test} from 'node:test'; import assert from 'node:assert/strict'; import {value} from './index.mjs'; test('M5',()=>assert.equal(value,5));\n");
    fs.writeFileSync(path.join(root, 'interaction.test.mjs'), "import {test} from 'node:test'; import assert from 'node:assert/strict'; import {price} from './m2/index.mjs'; test('M1 cents to M2 dollars',()=>assert.equal(price(),1));\n");
    git('init', '-q'); git('add', '.');
    git('-c', 'user.name=Coverage', '-c', 'user.email=coverage@example.invalid', 'commit', '-qm', 'integrated five modules with interaction regression');
    const revision = git('rev-parse', 'HEAD');
    const lastModule = spawnSync(process.execPath, ['--test', 'm5/check.test.mjs'], { cwd: root, encoding: 'utf8', env: childEnvironment });
    const cumulative = spawnSync(process.execPath, ['--test', 'm5/check.test.mjs', 'interaction.test.mjs'], { cwd: root, encoding: 'utf8', env: childEnvironment });
    assert.equal(lastModule.status, 0, lastModule.stdout + lastModule.stderr);
    assert.equal(cumulative.status, 1, cumulative.stdout + cumulative.stderr);
    assert.match(cumulative.stdout, /M1 cents to M2 dollars/);
    assert.equal(git('rev-parse', 'HEAD'), revision);

    const modules = Array.from({ length: 5 }, (_, index) => ({ moduleId: `m${index + 1}`, ownedPaths: [`m${index + 1}`],
      requirements: [{ id: 'works', statement: `Module ${index + 1} satisfies its contract.` }] }));
    const common = { schemaVersion: 'gate-coverage.v1' as const, projectId: 'five', baseRevision: revision };
    const moduleUnsigned = { ...common, kind: 'module' as const, modules: [modules[4]!], integrationRequirements: [],
      requiredChecks: [{ checkId: 'm5', requirementRefs: [{ moduleId: 'm5', requirementId: 'works' }], nodeIds: ['m5'] }] };
    const moduleCoverage: GateCoverageV1 = { ...moduleUnsigned, policyDigest: gateCoverageDigest(moduleUnsigned) };
    const finalUnsigned = { ...common, kind: 'cumulative' as const, modules,
      integrationRequirements: [{ id: 'price', statement: 'M1 cents are converted to M2 dollars.' }],
      requiredChecks: [{ checkId: 'integrated', requirementRefs: [...modules.map(module => ({ moduleId: module.moduleId, requirementId: 'works' })),
        { moduleId: null, requirementId: 'price' }], nodeIds: ['integrated'] }] };
    const finalCoverage: GateCoverageV1 = { ...finalUnsigned, policyDigest: gateCoverageDigest(finalUnsigned) };
    const pluginRoot = path.resolve('skills/buster/plugins');
    const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: { trustedBuiltinRoots: [pluginRoot],
      allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'coverage-interaction' } }));
    const limits = { cpuMillis: 30000, memoryBytes: 536870912, logBytes: 1048576, artifactBytes: 1048576, artifactFiles: 16, processes: 16 };
    const plan = resolveTestPlan({ planId: 'plan:m5', runId: 'run:five', project: 'five', scope: { moduleId: 'm5', gateId: null },
      createdAt: '2026-09-09T00:00:00Z', registry, suiteTemplates: [], declaration: { coverage: moduleCoverage, tests: { m5: {
        uses: 'kubeclaw.direct-command@1', config: { executable: 'node', args: ['--test', 'm5/check.test.mjs'], resultMode: 'exit-code' } } } },
      facts: { changedPaths: [], moduleType: null, pipelineStage: null }, policy: { defaultTimeoutMs: 30000, maximumTimeoutMs: 30000,
        defaultLimits: limits, maximumLimits: limits, maximumRetryCount: 1, maximumMatrixSize: 4, maximumNodes: 8,
        defaultConcurrencyLimit: 1, maximumConcurrencyLimits: {} } });
    assert.throws(() => assertCoveragePlan(plan, finalCoverage), /EXPECTED_POLICY_MISMATCH/);
    fs.writeFileSync(path.join(root, 'm2/index.mjs'), "import {amount} from '../m1/index.mjs'; export const price = () => amount()/100;\n");
    git('add', '.'); git('-c', 'user.name=Coverage', '-c', 'user.email=coverage@example.invalid', 'commit', '-qm', 'repair integration');
    const repaired = spawnSync(process.execPath, ['--test', 'm5/check.test.mjs', 'interaction.test.mjs'], { cwd: root, encoding: 'utf8', env: childEnvironment });
    assert.equal(repaired.status, 0, repaired.stdout + repaired.stderr);
    assert.notEqual(git('rev-parse', 'HEAD'), revision);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
