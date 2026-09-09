import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function budgetFixture(root, failures = {}, technical = {}) {
  const repository = path.join(root, 'repository'); fs.mkdirSync(repository);
  execFileSync('git', ['init', '-q', repository]);
  fs.writeFileSync(path.join(repository, 'version.txt'), '0\n');
  execFileSync('git', ['-C', repository, 'add', '.']);
  execFileSync('git', ['-C', repository, '-c', 'user.name=Regression', '-c', 'user.email=regression@example.invalid', 'commit', '-qm', 'Initial']);
  const installed = path.join(root, 'plugins'); fs.mkdirSync(installed);
  for (const source of ['tests/fixtures/repair-budget/plugin', 'skills/common/plugins/artifact-store']) {
    fs.cpSync(source, path.join(installed, path.basename(source)), { recursive: true, filter: file => !file.split(path.sep).includes('node_modules') });
  }
  fs.symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  const platform = budgetPlatform(root);
  const execution = { maxAttempts: 9, maxRemediationCycles: 7, maxTechnicalRetries: 1, timeoutMs: 5000 };
  const stages = ['source', 'lint', 'review', 'test'].map((id, index, ids) => ({
    id, type: 'test.repair-budget.execute', dependsOn: index ? [ids[index - 1]] : [],
    config: { repository, mode: index ? 'check' : 'source' },
    input: { repairVersions: failures[id] ?? [], retryAttempts: technical[id] ?? [] },
    execution: { ...execution, ...(index ? { repairCategory: id } : {
      repairBudget: { categories: { lint: 2, review: 2, test: 2 }, maximumOrchestratorOrders: 1 },
    }) }, ...(index ? { on: { request_fix: 'source' } } : {}),
  }));
  return { repository, platform, definition: { schemaVersion: 'pipeline-definition.v2', id: 'test:repair-budget', maxConcurrency: 1, stages } };
}

/** Reopen the same real installed fixture after a process restart. */
export function budgetPlatform(root) {
  const installed = path.join(root, 'plugins');
  const provider = 'kubeclaw.artifact-store:artifact-store';
  return { schemaVersion: 'pipeline-platform.v2', installationRoots: [installed], trustedBuiltinRoots: [installed],
    externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} }, providers: { 'artifacts.write': provider },
    grants: { 'test.repair-budget:execute': { 'artifacts.write': { allowedNamespaces: ['test.repair-budget'] } } },
    adapters: { [provider]: { artifactRoot: path.join(root, 'artifacts') } }, activeAdapters: [provider], observers: {},
    storageRoot: path.join(root, 'state'), shutdownTimeoutMs: 5000, orchestratorIssuerId: 'nova',
    administrativeDecisionIssuers: [{ type: 'administrator', id: 'admin:test' }] };
}
