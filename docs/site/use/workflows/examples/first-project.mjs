#!/usr/bin/env node
// Compile-only reader example. No adapter activation or pipeline execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildRegistry, discoverPackages, resolveTestPlan } from '../../../../../skills/nova/core/src/index.ts';
import { compileProject } from '../../../../../skills/nova/project/compiler.ts';
import { PROJECT_REVIEW_SEMANTIC_ENCODING } from '../../../../../skills/nova/project/review-semantics.ts';
import { DELIVERY_MANIFEST_ENCODING } from '../../../../../skills/nova/project/delivery-manifest.ts';
import { canonicalJson, PORTABLE_JSON_ENCODING, sha256Text } from '../../../../../skills/common/plugin-runtime/sdk/src/index.ts';
import { gateCoverageDigest } from '../../../../../contracts/pipeline-test-gate/v1/src/index.ts';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const destination = process.argv[2];
if (process.argv.length !== 3 || !destination || !path.isAbsolute(destination)
    || path.normalize(destination) !== destination || destination === '/') {
  throw new Error('Usage: node docs/site/use/workflows/examples/first-project.mjs NEW_ABSOLUTE_DIRECTORY');
}
if (fs.existsSync(destination)) throw new Error('An item is at the example path. Do not use it again.');
fs.mkdirSync(destination, { mode: 0o700 });
const repositoryRoot = path.join(destination, 'repository');
const workspaceRoot = path.join(destination, 'workspaces');
fs.mkdirSync(repositoryRoot); fs.mkdirSync(workspaceRoot);
fs.mkdirSync(path.join(repositoryRoot, 'modules/app'), { recursive: true });
fs.mkdirSync(path.join(repositoryRoot, 'app'));
fs.writeFileSync(path.join(repositoryRoot, 'README.md'), '# First project\n\nA compile-only example, not an executed implementation.\n');
fs.writeFileSync(path.join(repositoryRoot, 'modules/app/FORGE.md'), '# Application blueprint\n\nThe greeting function must return hello.\n\n```kubeclaw-deliverables\n'+JSON.stringify({schemaVersion:'forge-deliverables.v1',moduleId:'app',substep:null,deliverables:[]})+'\n```\n');
fs.writeFileSync(path.join(repositoryRoot, 'app/greeting.mjs'), "export const greeting = () => 'hello';\n");
fs.writeFileSync(path.join(repositoryRoot, 'app/greeting.test.mjs'), "import assert from 'node:assert/strict';\nimport {greeting} from './greeting.mjs';\nassert.equal(greeting(), 'hello');\n");
const git = (...args) => execFileSync('git', ['-C', repositoryRoot, ...args], { encoding: 'utf8' }).trim();
git('init', '-q'); git('add', '.');
git('-c', 'user.name=Documentation Example', '-c', 'user.email=example@example.invalid', 'commit', '-qm', 'First project baseline');
const baseRevision = git('rev-parse', 'HEAD');
const id = 'first-project';
const runId = 'run:first-project-001';
const createdAt = '2026-10-20T00:00:00Z'; // Plan creation input, not evidence of execution.
const providersRoot = path.join(sourceRoot, 'skills/buster/plugins');
const registry = buildRegistry(discoverPackages({ installationRoots: [providersRoot], trustPolicy: {
  trustedBuiltinRoots: [providersRoot], allowedSourceDigests: new Map(),
  verifiedAttestations: new Map(), verifierId: 'documentation-first-project' } }));
const limits = { cpuMillis: 30000, memoryBytes: 536870912, logBytes: 1048576,
  artifactBytes: 1048576, artifactFiles: 16, processes: 16 };
const policy = { defaultTimeoutMs: 30000, maximumTimeoutMs: 60000,
  defaultLimits: limits, maximumLimits: limits, maximumRetryCount: 1,
  maximumMatrixSize: 1, maximumNodes: 2, defaultConcurrencyLimit: 1,
  maximumConcurrencyLimits: {} };
const requirements = [{ id: 'greeting', statement: 'The greeting function returns hello.' }];
const modules = [{ moduleId: 'app', ownedPaths: ['app'], requirements }];
const node = { uses: 'kubeclaw.direct-command@1', retries: 0,
  config: { executable: 'node', args: ['--test', 'app/greeting.test.mjs'],
    workingDirectory: '.', resultMode: 'exit-code' } };
function testConfiguration(kind) {
  const cumulative = kind === 'cumulative';
  const nodeId = cumulative ? 'integrated' : 'greeting';
  const requiredChecks = [{ checkId: nodeId,
    requirementRefs: [{ moduleId: 'app', requirementId: 'greeting' }], nodeIds: [nodeId] }];
  const unsigned = { schemaVersion: 'gate-coverage.v1', projectId: id, kind,
    baseRevision, modules, integrationRequirements: [], requiredChecks };
  const coverage = { ...unsigned, policyDigest: gateCoverageDigest(unsigned) };
  const plan = resolveTestPlan({ planId: `plan:first-project:${kind}`, runId, project: id,
    scope: { moduleId: cumulative ? null : 'app', gateId: cumulative ? 'final-test' : null },
    createdAt, registry, declaration: { coverage, tests: { [nodeId]: node } },
    suiteTemplates: [], facts: { changedPaths: [], moduleType: null, pipelineStage: null }, policy });
  return { testAgentEnabled: false, requiredChecks,
    providerPlan: { repositoryId: id, plan, grants: { [nodeId]: ['command.execute'] },
      maximumConcurrency: 1, submittedAt: createdAt, timeoutMs: 60000 } };
}
// This is a future lint-policy selection. It is not a full policy or a live input.
const lint = { policyPath: path.join(destination, 'operator-selected-lint-policy.json'), policyProject: id };
const project = { schemaVersion: 'nova-project.v2', id, runId, repositoryRoot,
  workspaceRoot, baseRevision, architecture: { ref: 'HEAD', requiredFiles: ['README.md'] },
  modules: [{ id: 'app', dependsOn: [], task: 'Maintain the greeting function and its assertion.',
    ownedPaths: ['app'], requirements, implementation: { agent: 'forge' }, lint,
    blueprint: { modulePath: 'modules/app', serveDockerfile: null, apiSpecFile: null },
    test: testConfiguration('module') }],
  final: { lint, integrationRequirements: [], test: testConfiguration('cumulative') } };
const compile = value => compileProject(value, PORTABLE_JSON_ENCODING, PORTABLE_JSON_ENCODING,
  PROJECT_REVIEW_SEMANTIC_ENCODING, DELIVERY_MANIFEST_ENCODING);
const { definition } = compile(project);
assert.deepEqual(compile(project).definition, definition);
const expected = ['source-preflight', 'blueprint-sync', 'implement-app', 'lint-app',
  'test-app', 'final-lint', 'final-test', 'project-summary'];
assert.deepEqual(definition.stages.map(stage => stage.id), expected);
assert.equal(git('status', '--porcelain'), '');
fs.writeFileSync(path.join(destination, 'project.json'), `${JSON.stringify(project, null, 2)}\n`, { flag: 'wx' });
fs.writeFileSync(path.join(destination, 'compiled.json'), `${canonicalJson(definition)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ status: 'compiled-example', execution: false,
  platformAdmission: false, runId, baseRevision, stageCount: definition.stages.length,
  definitionDigest: sha256Text(canonicalJson(definition)), outputDirectory: destination })}\n`);
