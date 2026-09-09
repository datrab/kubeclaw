import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Native Git and production artifact writes; deterministic checker findings. */
export async function execute(input, context) {
  const { repository, mode } = context.contract.config;
  const owner = context.contract.lease.attempt;
  const git = (...args) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
  const file = path.join(repository, 'version.txt');
  let version = Number(fs.readFileSync(file, 'utf8'));
  const retry = input.retryAttempts?.includes(owner.attemptNumber);
  if (mode === 'source' && !retry) {
    version += 1; fs.writeFileSync(file, `${version}\n`);
    git('add', 'version.txt'); git('-c', 'user.name=Regression', '-c', 'user.email=regression@example.invalid', 'commit', '-qm', `Source ${version}`);
  }
  const revision = git('rev-parse', 'HEAD');
  const outcome = retry ? 'retry' : input.failedVersions?.includes(version) ? 'failed' : input.blockedVersions?.includes(version) ? 'blocked'
    : input.repairVersions?.includes(version) ? 'request_fix' : 'passed';
  const value = { version, revision, outcome, guidance: context.contract.guidance ?? null };
  const stored = await context.invoke('artifacts.write', { operation: 'put_json',
    resource: { type: 'artifact.object', canonicalId: `evidence:${owner.stageId}:${owner.attemptNumber}` },
    payload: { namespace: 'test.repair-budget', mediaType: 'application/json', value } });
  return { schemaVersion: 'stage-result.v2', outcome, artifacts: [stored.artifact],
    ...(outcome === 'passed' ? { facts: { 'test.source_revision': revision, 'test.source_version': version } }
      : { reason: { code: `test.${outcome}`, message: `${owner.stageId} at source ${version}`, details: { version, revision } } }) };
}
