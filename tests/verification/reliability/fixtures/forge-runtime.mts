import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import * as core from '../../../../skills/nova/core/src/index.ts';
import { compileProject } from '../../../../skills/nova/project/compiler.ts';

export const repository = path.resolve(import.meta.dirname, '../../../..');
export const git = (root: string, args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

export async function forgeFixture(mode: 'parallel' | 'locked-worktree' | 'branch-only') {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-workspace-'));
  const repo = path.join(temporary, 'repository'), workspaces = path.join(temporary, 'workspaces');
  fs.mkdirSync(repo); fs.mkdirSync(workspaces);
  git(repo, ['init', '-q']); git(repo, ['config', 'user.name', 'Workspace Test']); git(repo, ['config', 'user.email', 'workspace@example.invalid']);
  fs.writeFileSync(path.join(repo, 'README.md'), 'baseline\n'); git(repo, ['add', '.']); git(repo, ['commit', '-qm', 'baseline']);
  const baseline = git(repo, ['rev-parse', 'HEAD']);
  const spawns: Array<{ cwd: string; input: any; resultFile: string }> = [];
  const sessions = new Map<string, string>();
  let serverError: unknown;
  const server = http.createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const { tool, args } = JSON.parse(Buffer.concat(chunks).toString());
      let output: unknown;
      if (tool === 'sessions_spawn') {
        const input = JSON.parse(args.task.slice(args.task.indexOf('\n\n{') + 2));
        const resultFile = /^Write the exact raw JSON result atomically to (.+)\.$/m.exec(args.task)?.[1];
        assert(resultFile); assert(args.cwd.startsWith(`${workspaces}/`)); assert.notEqual(args.cwd, repo);
        const module = input.identity.moduleId;
        const content = mode !== 'parallel' && input.identity.attempt === 1 ? 'const unused = 1;\n' : 'export const ready = true;\n';
        const completion = { status: 'ready_for_testing', summary: 'Transport fixture wrote the requested workspace.', changedPaths: [`${module}.js`], checks: [{ name: 'native file read', passed: true }] };
        const code = `const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');fs.writeFileSync(${JSON.stringify(`${module}.js`)},${JSON.stringify(content)});assert.equal(fs.readFileSync(${JSON.stringify(`${module}.js`)},'utf8'),${JSON.stringify(content)});const file=${JSON.stringify(resultFile)};fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',${JSON.stringify(JSON.stringify(completion))});fs.renameSync(file+'.tmp',file);`;
        execFileSync(process.execPath, ['-e', code], { cwd: args.cwd });
        const session = `session:${spawns.length}`; sessions.set(session, args.model);
        spawns.push({ cwd: args.cwd, input, resultFile });
        output = { status: 'accepted', childSessionKey: session, runId: `runtime:${spawns.length}`, model: args.model };
      } else if (tool === 'session_status') output = { state: 'completed', model: sessions.get(args.sessionKey) };
      else if (tool === 'sessions_send') output = { status: 'ok' };
      else throw new Error(`unexpected gateway tool ${tool}`);
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ok: true, output: { details: output } }));
    } catch (error) { serverError = error; response.writeHead(500); response.end(String(error)); }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  server.unref();
  const address = server.address(); assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const roots = ['common', 'nova', 'buster'].map(role => path.join(repository, 'skills', role, 'plugins'));
  const snapshot = core.buildRegistry(core.discoverPackages({ installationRoots: roots, trustPolicy: {
    trustedBuiltinRoots: roots, allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'forge-regression',
  } }));
  const policy = JSON.parse(fs.readFileSync(path.join(repository, 'charts/kubeclaw/files/config/lint-policy.json'), 'utf8'));
  const eslintConfig = path.join(temporary, 'eslint.config.mjs'); fs.writeFileSync(eslintConfig, 'export default [{rules:{"no-unused-vars":"error"}}];');
  fs.writeFileSync(path.join(temporary, 'lint-baseline.json'), JSON.stringify({ schema_version: 'pipeline_lint_baseline.v2', groups: [] }));
  policy.baseline_path = 'lint-baseline.json'; policy.kubernetes_policy_packs = [];
  policy.projects = [{ id: 'fixture', root: '.', discovery_max_depth: 4, languages: ['javascript'], language_evidence: { javascript: ['**/*.js'] }, go: { modules: [] }, terraform: { roots: [] } }];
  policy.architecture = { layers: [{ id: 'fixture', roots: ['.'], may_depend_on: ['fixture'] }] };
  policy.experimental_tools = policy.tools.map((tool: any) => tool.id).filter((id: string) => id !== 'eslint');
  policy.tools = policy.tools.map((tool: any) => ({ ...tool, targets: tool.languages.length === 1 && ['go', 'terraform'].includes(tool.languages[0]) ? [] : ['.'], config_path: tool.id === 'eslint' ? eslintConfig : null, ...(['go-vet', 'go-imports', 'staticcheck', 'govulncheck'].includes(tool.id) ? { arguments: [] } : {}) }));
  const policyPath = path.join(temporary, 'lint-policy.json'); fs.writeFileSync(policyPath, JSON.stringify(policy));
  const providers = new Map([['runtime.dispatch', 'kubeclaw.runtime-dispatch:openclaw'], ['network.http', 'kubeclaw.network-http:http'], ['secrets.read', 'kubeclaw.secret-resolver:secrets'], ['artifacts.read', 'kubeclaw.artifact-store:artifact-store'], ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'], ['git.repository.read', 'kubeclaw.repository-adapter:repository'], ['lint.execute', 'kubeclaw.lint:executor'], ...['git.workspace.create', 'git.workspace.remove', 'git.commit', 'git.merge'].map(cap => [cap, 'kubeclaw.git-workspace:git'])]);
  const artifact = { allowedNamespaces: ['kubeclaw.implementation-agent', 'kubeclaw.lint'] };
  const granted = core.resolveCapabilityGrants(snapshot, { enabledRegistrations: new Set(['kubeclaw.implementation-agent:implementation', 'kubeclaw.lint:full']), providers,
    grants: new Map([
      ['kubeclaw.implementation-agent:implementation', new Map([['runtime.dispatch', { allowedAgents: ['forge'] }], ['artifacts.read', artifact], ['artifacts.write', artifact], ...['git.workspace.create', 'git.workspace.remove', 'git.commit', 'git.merge'].map(cap => [cap, { allowedRoots: [temporary], ...(cap.startsWith('git.workspace.') ? { allowedWorkspaceRoots: [workspaces] } : {}) }])])],
      ['kubeclaw.runtime-dispatch:openclaw', new Map([['network.http', { allowedOrigins: [origin] }], ['secrets.read', { allowedNames: ['forge.token'] }], ['git.repository.read', { allowedPrefixes: ['.'] }]])],
      ['kubeclaw.lint:full', new Map([['lint.execute', { allowedRoots: [repo], allowedPolicyRoots: [temporary], allowedProjects: ['fixture'] }], ['artifacts.read', artifact], ['artifacts.write', artifact]])],
    ]),
  });
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const secret = `FORGE_WORKSPACE_TOKEN_${process.pid}`; process.env[secret] = 'local-gateway-token';
  const effectsPath = path.join(temporary, 'effects.jsonl');
  const journal = new core.FileEffectJournal(effectsPath), locks = new core.FileResourceLockManager(path.join(temporary, 'locks'));
  const retained: any[] = [];
  const audit = { requested() {}, accepted() {}, completed(request: any, receipt: any) {
    if (mode === 'parallel' || request.capability !== 'git.merge' || request.attempt.attemptNumber !== 1 || receipt.status !== 'completed') return;
    const ref = request.payload.workspaceReference; retained.push(ref);
    if (mode === 'locked-worktree') git(repo, ['worktree', 'lock', ref.workspacePath]);
    else { const lock = path.join(repo, '.git/refs/heads', `${ref.branch}.lock`); fs.mkdirSync(path.dirname(lock), { recursive: true }); fs.writeFileSync(lock, 'held by native regression'); }
  } };
  const configs = new Map([
    ['kubeclaw.runtime-dispatch:openclaw', { targets: { forge: { endpoint: `${origin}/tools/invoke`, tokenSecret: 'forge.token', runtime: 'acp', agentId: 'forge', agentRole: 'forge', model: 'test/declared', cwd: repo, repositoryRoot: repo, workspaceRoot: workspaces, resultPathPrefix: '.pipeline/results', spawnIntervalMs: 0, pollMs: 10, maxPollMs: 10 } } }],
    ['kubeclaw.network-http:http', { allowedOrigins: [origin], allowedMethods: ['POST'], allowedHeaders: ['authorization', 'content-type'] }],
    ['kubeclaw.secret-resolver:secrets', { environment: { 'forge.token': secret } }],
    ['kubeclaw.artifact-store:artifact-store', { artifactRoot: path.join(temporary, 'artifacts') }],
    ['kubeclaw.repository-adapter:repository', { repositoryRoot: repo }],
    ['kubeclaw.lint:executor', { allowedRepositoryRoots: [repo], allowedPolicyRoots: [temporary] }],
    ['kubeclaw.git-workspace:git', { allowedRepositoryRoots: [temporary], workspaceRoot: workspaces, gitExecutable: fs.realpathSync('/usr/bin/git'), authorName: 'Workspace Test', authorEmail: 'workspace@example.invalid', maxExecutionMs: 5000, maxOutputBytes: 65536, terminationGraceMs: 100 }],
  ]);
  const adapters = new core.AdapterRuntime({ granted, activated, configs, effects: new core.EffectCoordinator(journal, undefined, audit, locks), shutdownTimeoutMs: 1000, async emitDomainEvent() {} });
  await adapters.start();
  const runId = `run:forge:${mode}`;
  const module = (id: string) => {
    const limits = { cpuMillis: 30000, memoryBytes: 512 * 1024 * 1024, logBytes: 1024 * 1024, artifactBytes: 1024 * 1024, artifactFiles: 16, processes: 16 };
    const plan = core.resolveTestPlan({ planId: `plan:${id}`, runId, project: 'fixture', scope: { moduleId: id, gateId: null }, createdAt: '2026-09-06T00:00:00Z', registry: snapshot,
      declaration: { suites: { unit: { uses: 'kubeclaw.unit-suite@1', add: { assertion: { uses: 'kubeclaw.direct-command@1', mode: 'blocking', config: { executable: 'node', args: ['--test'], workingDirectory: '.', resultMode: 'exit-code' } } } } } },
      suiteTemplates: [JSON.parse(fs.readFileSync(path.join(repository, 'contracts/pipeline-test-gate/v1/suites/unit.v1.json'), 'utf8'))], facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' }, policy: { defaultTimeoutMs: 30000, maximumTimeoutMs: 60000, defaultLimits: limits, maximumLimits: limits, maximumRetryCount: 1, maximumMatrixSize: 4, maximumNodes: 8, defaultConcurrencyLimit: 1, maximumConcurrencyLimits: { unit: 4 } } });
    return { id, dependsOn: [], task: `Implement ${id}`, ownedPaths: [`${id}.js`], requirements: [{ id: `${id}-ready`, statement: 'Native fixture file exists' }], implementation: { agent: 'forge' }, review: { agent: 'echo' }, lint: { policyPath, policyProject: 'fixture' }, test: { agent: 'buster', providerPlan: { repositoryId: 'fixture', plan, grants: Object.fromEntries(plan.nodes.map((node: any) => [node.id, ['command.execute']])), maximumConcurrency: 1, submittedAt: plan.createdAt, timeoutMs: 60000 } } };
  };
  const compiled = compileProject({ schemaVersion: 'nova-project.v1', id: 'fixture', runId, repositoryRoot: repo, workspaceRoot: workspaces, baseRevision: baseline, modules: (mode === 'parallel' ? ['a', 'b'] : ['a']).map(module) });
  const selected = compiled.definition.stages.filter(stage => stage.type === 'kubeclaw.agent.implementation' || mode !== 'parallel' && stage.type === 'kubeclaw.lint.full');
  const stages = selected.map(stage => ({ ...stage, dependsOn: stage.type === 'kubeclaw.agent.implementation' ? [] : stage.dependsOn, execution: { ...stage.execution, timeoutMs: 15000 } }));
  const eventsPath = path.join(temporary, 'events.jsonl');
  const runner = new core.PipelineRunner({ definition: { ...compiled.definition, maxConcurrency: 2, stages }, registry: granted, activated, adapters, journal: new core.FileJournal(eventsPath) });
  return { temporary, repo, workspaces, baseline, spawns, retained, effectsPath, eventsPath, configs, runId, runner, journal, locks,
    assertServer() { if (serverError) throw serverError; },
    async close() { await adapters.shutdown(); await new Promise<void>(resolve => server.close(() => resolve())); delete process.env[secret]; fs.rmSync(temporary, { recursive: true, force: true }); },
  };
}
