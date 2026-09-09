import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Deterministic graph fixture using real Git commits and the production artifact capability. */
export async function execute(_input, context) {
  const { repository, mode } = context.contract.config;
  const git = (...args) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
  if (mode === 'source') {
    fs.writeFileSync(path.join(repository, 'architecture.md'), `Architecture revision ${context.contract.lease.attempt.attemptNumber}\n`);
    git('add', 'architecture.md');
    git('-c', 'user.name=Regression', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Update architecture');
  }
  const revision = git('rev-parse', 'HEAD');
  const value = { verdict: 'passed', summary: `${mode}:${revision}`, revision, checkedFiles: ['architecture.md'],
    findings: [{ id: 'review:constraint', severity: 'warn', explanation: 'Operator must review the current architecture.', remediation: 'Confirm this revision.' }],
    repairRequest: context.contract.guidance?.repairRequest ?? null };
  const stored = await context.invoke('artifacts.write', { operation: 'put_json',
    resource: { type: 'artifact.object', canonicalId: `report:${mode}` },
    payload: { namespace: 'test.admin-repair', mediaType: 'application/json', value } });
  return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [stored.artifact], facts: { 'test.source_revision': revision } };
}
