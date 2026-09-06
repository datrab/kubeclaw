import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';

const root = path.resolve('.');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-project-proof-'));
try {
  const archive = process.argv[2];
  let runtime = path.join(root, 'skills/nova');
  let pluginRoots = ['common', 'nova'].map(role => path.join(root, `skills/${role}/plugins`));
  if (archive) {
    const extracted = path.join(temporary, 'runtime'); fs.mkdirSync(extracted);
    execFileSync('tar', ['-xzf', path.resolve(archive), '-C', extracted]);
    const entries = fs.readdirSync(extracted); assert.equal(entries.length, 1);
    runtime = path.join(extracted, entries[0]!, 'skills'); pluginRoots = [path.join(runtime, 'plugins')];
  }
  const compilerFile = archive ? path.join(runtime, 'packages/nova-project/compiler.ts') : path.join(runtime, 'project/compiler.ts');
  const { compileProject } = await import(pathToFileURL(compilerFile).href);
  const repo = path.join(temporary, 'repository'); const workspaces = path.join(temporary, 'workspaces');
  fs.mkdirSync(repo); fs.mkdirSync(workspaces);
  fs.writeFileSync(path.join(repo, 'README.md'), 'compiler proof\n');
  execFileSync('git', ['init', '-q', repo]);
  execFileSync('git', ['-C', repo, 'add', '.']);
  execFileSync('git', ['-C', repo, '-c', 'user.name=Proof', '-c', 'user.email=proof@example.invalid', 'commit', '-qm', 'baseline']);
  const baseline = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const providersRoot = path.join(root, 'skills/buster/plugins');
  const registry = buildRegistry(discoverPackages({ installationRoots: [providersRoot], trustPolicy: {
    trustedBuiltinRoots: [providersRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'project-proof' } }));
  const limits = { cpuMillis: 30000, memoryBytes: 512 * 1024 * 1024, logBytes: 1024 * 1024, artifactBytes: 1024 * 1024, artifactFiles: 16, processes: 16 };
  const runId = 'run:project-proof';
  const module = (id: string, dependsOn: string[]) => {
    const plan = resolveTestPlan({ planId: `plan:${id}`, runId, project: 'proof', scope: { moduleId: id, gateId: null },
      createdAt: '2026-09-06T00:00:00Z', registry,
      declaration: { suites: { unit: { uses: 'kubeclaw.unit-suite@1', add: {
        assertion: { uses: 'kubeclaw.direct-command@1', mode: 'blocking', config: {
          executable: 'node', args: ['--test'], workingDirectory: '.', resultMode: 'exit-code' } },
      } } } },
      suiteTemplates: [JSON.parse(fs.readFileSync(path.join(root, 'contracts/pipeline-test-gate/v1/suites/unit.v1.json'), 'utf8'))],
      facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' },
      policy: { defaultTimeoutMs: 30000, maximumTimeoutMs: 60000, defaultLimits: limits, maximumLimits: limits,
        maximumRetryCount: 1, maximumMatrixSize: 4, maximumNodes: 8, defaultConcurrencyLimit: 1, maximumConcurrencyLimits: { unit: 4 } } });
    return { id, dependsOn, task: `Implement ${id}.`, ownedPaths: [id], requirements: [{ id: `${id}-works`, statement: `${id} must satisfy its source assertions.` }],
      implementation: { agent: 'forge' }, review: { agent: 'echo' }, lint: { policyPath: path.join(temporary, 'lint.json'), policyProject: 'proof' },
      test: { agent: 'buster', providerPlan: { repositoryId: 'proof', plan,
        grants: Object.fromEntries(plan.nodes.map(node => [node.id, ['command.execute']])), maximumConcurrency: 1, submittedAt: plan.createdAt, timeoutMs: 60000 } } };
  };
  const project = { schemaVersion: 'nova-project.v1', id: 'proof', runId, repositoryRoot: repo, workspaceRoot: workspaces,
    baseRevision: baseline, modules: [module('app', ['library']), module('library', [])] };
  const compiled = compileProject(project);
  assert.deepEqual(compiled, compileProject({ ...project, modules: [...project.modules].reverse() }));
  assert.equal(compiled.definition.stages.length, 8);
  assert.deepEqual(compiled.definition.stages.find((stage: any) => stage.id === 'implement-app').dependsOn, ['test-library']);
  for (const moduleId of ['library', 'app']) {
    assert.deepEqual(compiled.definition.stages.find((stage: any) => stage.id === `review-${moduleId}`).input.revisions, { sourceStageId: `implement-${moduleId}` });
    for (const phase of ['lint', 'review', 'test']) assert.equal(compiled.definition.stages.find((stage: any) => stage.id === `${phase}-${moduleId}`).on.request_fix, `implement-${moduleId}`);
    assert.equal(compiled.definition.stages.find((stage: any) => stage.id === `test-${moduleId}`).input.providerPlan.sourceStageId, `implement-${moduleId}`);
  }
  for (const [change, error] of [
    [(p: any) => p.modules[1].dependsOn.push('app'), /DEPENDENCY_CYCLE/],
    [(p: any) => p.modules[1].dependsOn.push('missing'), /DEPENDENCY_UNKNOWN/],
    [(p: any) => p.modules[1].ownedPaths = ['app/nested'], /OWNERSHIP_OVERLAP/],
    [(p: any) => p.modules[0].ownedPaths = ['../escape'], /OWNERSHIP_INVALID/],
    [(p: any) => p.modules[0].test.providerPlan.plan.runId = 'foreign', /PLAN_DIGEST/],
    [(p: any) => p.modules[0].test.providerPlan.revision = baseline, /OBJECT_INVALID/],
    [(p: any) => p.modules[0].test.suiteEvidence = [{ passed: true }], /OBJECT_INVALID/],
  ] as const) {
    const invalid = structuredClone(project); change(invalid); assert.throws(() => compileProject(invalid), error);
  }
  const artifact = (namespace: string) => ({ allowedNamespaces: [namespace] });
  const origins = ['http://127.0.0.1:9'];
  const platform = {
    schemaVersion: 'pipeline-platform.v2', installationRoots: pluginRoots, trustedBuiltinRoots: pluginRoots,
    externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
    providers: {
      'runtime.dispatch': 'kubeclaw.runtime-dispatch:runtime', 'network.http': 'kubeclaw.network-http:http',
      'secrets.read': 'kubeclaw.secret-resolver:secrets', 'artifacts.read': 'kubeclaw.artifact-store:artifact-store', 'artifacts.write': 'kubeclaw.artifact-store:artifact-store',
      'git.workspace.create': 'kubeclaw.git-workspace:git', 'git.workspace.remove': 'kubeclaw.git-workspace:git', 'git.commit': 'kubeclaw.git-workspace:git', 'git.merge': 'kubeclaw.git-workspace:git',
      'git.repository.read': 'kubeclaw.repository-adapter:repository', 'lint.execute': 'kubeclaw.lint:executor', 'test.plan.execute': 'kubeclaw.remote-test-gate:plan',
    },
    grants: {
      'kubeclaw.implementation-agent:implementation': { 'runtime.dispatch': { allowedAgents: ['forge'] }, 'artifacts.write': artifact('kubeclaw.implementation-agent'),
        'git.workspace.create': { allowedRoots: [repo, workspaces], allowedWorkspaceRoots: [workspaces] },
        'git.workspace.remove': { allowedRoots: [repo, workspaces], allowedWorkspaceRoots: [workspaces] },
        'git.commit': { allowedRoots: [repo, workspaces] }, 'git.merge': { allowedRoots: [repo, workspaces] } },
      'kubeclaw.lint:full': { 'lint.execute': { allowedRoots: [repo], allowedPolicyRoots: [temporary], allowedProjects: ['proof'] }, 'artifacts.write': artifact('kubeclaw.lint') },
      'kubeclaw.review:review': { 'runtime.dispatch': { allowedAgents: ['echo'] }, 'git.repository.read': { allowedPrefixes: ['.'] }, 'artifacts.read': { allowedNamespaces: ['kubeclaw.review', 'kubeclaw.implementation-agent'] }, 'artifacts.write': artifact('kubeclaw.review') },
      'kubeclaw.buster-quality-gate:quality': { 'runtime.dispatch': { allowedAgents: ['buster'] }, 'test.plan.execute': { allowedRoots: [repo] }, 'artifacts.read': artifact('kubeclaw.implementation-agent'), 'artifacts.write': artifact('kubeclaw.buster-quality-gate') },
      'kubeclaw.runtime-dispatch:runtime': { 'network.http': { allowedOrigins: origins }, 'secrets.read': { allowedNames: ['worker'] } },
      'kubeclaw.remote-test-gate:plan': { 'secrets.read': { allowedNames: ['worker', 'source-key'] } },
    },
    adapters: {
      'kubeclaw.runtime-dispatch:runtime': { targets: Object.fromEntries(['forge', 'echo', 'buster'].map(agent => [agent, { endpoint: `${origins[0]}/dispatch`, tokenSecret: 'worker' }])) },
      'kubeclaw.network-http:http': { allowedOrigins: origins, allowedMethods: ['POST'], allowedHeaders: ['authorization', 'content-type', 'idempotency-key'] },
      'kubeclaw.secret-resolver:secrets': { environment: { worker: 'PROJECT_TEST_TOKEN', 'source-key': 'PROJECT_TEST_SOURCE_KEY' } },
      'kubeclaw.artifact-store:artifact-store': { artifactRoot: path.join(temporary, 'artifacts') },
      'kubeclaw.git-workspace:git': { allowedRepositoryRoots: [repo], workspaceRoot: workspaces, gitExecutable: '/usr/bin/git', authorName: 'Proof', authorEmail: 'proof@example.invalid', maxExecutionMs: 30000, maxOutputBytes: 1048576, terminationGraceMs: 1000 },
      'kubeclaw.repository-adapter:repository': { repositoryRoot: repo },
      'kubeclaw.lint:executor': { allowedRepositoryRoots: [repo], allowedPolicyRoots: [temporary] },
      'kubeclaw.remote-test-gate:plan': { endpoint: origins[0], authentication: 'bearer', tokenSecret: 'worker', sourcePrivateKeySecret: 'source-key', sourceAuthority: 'nova:production', stateRoot: path.join(temporary, 'gates'), allowedRepositoryRoots: [repo] },
    },
    activeAdapters: [], observers: {}, storageRoot: path.join(temporary, 'state'), shutdownTimeoutMs: 1000, orchestratorIssuerId: 'proof', administrativeDecisionIssuers: [],
  };
  const projectFile = path.join(temporary, 'project.json'); const platformFile = path.join(temporary, 'platform.json');
  const output = path.join(temporary, 'compiled.json');
  fs.writeFileSync(projectFile, JSON.stringify(project)); fs.writeFileSync(platformFile, JSON.stringify(platform));
  const launch = () => spawnSync(process.execPath, [path.join(runtime, 'pipeline.ts'), '--platform', platformFile, '--project', projectFile, '--compile', output], { cwd: temporary, encoding: 'utf8', timeout: 30000 });
  const result = launch(); assert.equal(result.status, 0, result.stderr); assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), compiled.definition);
  // A real unsupported stage config must fail before the compiler publishes output.
  fs.rmSync(output); const invalid = structuredClone(project); invalid.modules[0].review.agent = '';
  fs.writeFileSync(projectFile, JSON.stringify(invalid)); const rejected = launch(); assert.notEqual(rejected.status, 0); assert.equal(fs.existsSync(output), false);
  assert.equal(fs.existsSync(platform.storageRoot), false, 'compilation must not start execution or write a run');
  console.log(JSON.stringify({ ok: true, scope: archive ? 'extracted-production-launcher' : 'source-launcher', modules: 2, executedStages: 0 }));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
