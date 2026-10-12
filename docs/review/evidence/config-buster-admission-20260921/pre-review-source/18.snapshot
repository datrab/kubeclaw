/** Actual signed source/parser/store/service; native preparation ownership is modeled. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildCommittedSourceSnapshot, buildRegistry, createRemotePlanJob, discoverPackages,
  resolveTestPlan } from '@kubeclaw/nova-core';
import { loadBusterSettings, type BusterAdmissionSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { ModeledPreparedPlanJobStore, ModeledBusterRemotePlanService } from './modeled-preparation.mts';

export function authoredBusterProfile(root: string, admission?: BusterAdmissionSettings) {
  const document = JSON.parse(fs.readFileSync('charts/kubeclaw/files/config/swarm.config.json', 'utf8'));
  if (admission) document.operator.buster.admission = admission;
  const file = path.join(root, 'swarm.json');
  fs.writeFileSync(file, JSON.stringify(document));
  return { file, document, settings: loadBusterSettings({ SWARM_CONFIG: file }) };
}

export async function admissionFixture(admission: BusterAdmissionSettings) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-admission-'));
  const profile = authoredBusterProfile(root, admission);
  const repository = path.join(root, 'repository');
  fs.mkdirSync(repository); fs.writeFileSync(path.join(repository, 'source.txt'), 'genuine committed input');
  execFileSync('git', ['-C', repository, 'init', '-q']);
  execFileSync('git', ['-C', repository, 'add', '.']);
  execFileSync('git', ['-C', repository, '-c', 'user.name=Admission', '-c', 'user.email=admission@example.invalid', 'commit', '-qm', 'source']);
  const keys = crypto.generateKeyPairSync('ed25519');
  const snapshot = await buildCommittedSourceSnapshot({ repositoryRoot: repository, repositoryId: 'repository:admission',
    pipelineStageId: 'test', creatorAuthority: 'nova:admission',
    attestationPrivateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), maximumArchiveBytes: 1048576 });
  const providers = path.resolve('skills/buster/plugins');
  const registry = buildRegistry(discoverPackages({ installationRoots: [providers], trustPolicy: {
    trustedBuiltinRoots: [providers], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'admission' } }));
  const limits = { cpuMillis: 1000, memoryBytes: 134217728, logBytes: 1024, artifactBytes: 1024, artifactFiles: 1, processes: 4 };
  const plan = resolveTestPlan({ planId: 'plan:admission', runId: 'run:admission', project: 'admission',
    scope: { moduleId: 'module', gateId: null }, createdAt: new Date().toISOString(), registry, suiteTemplates: [],
    declaration: { tests: { check: { uses: 'kubeclaw.direct-command@1', mode: 'blocking', config: {
      executable: 'node', args: ['--version'], workingDirectory: '.', resultMode: 'exit-code' } } } },
    facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' }, policy: {
      defaultTimeoutMs: 1000, maximumTimeoutMs: 1000, defaultLimits: limits, maximumLimits: limits,
      maximumRetryCount: 1, maximumMatrixSize: 1, maximumNodes: 1, defaultConcurrencyLimit: 1, maximumConcurrencyLimits: {} } });
  const store = new ModeledPreparedPlanJobStore(path.join(root, 'state'), {
    recordLimits: { maximumRecords: 20, maximumBytes: 1048576, maximumRecordBytes: 131072 },
    maximumArchiveBytes: 1048576, maximumResultBytes: 65536, maximumResultStoreBytes: 1048576,
    trustedSourceAuthority: 'nova:admission', sourceAttestationPublicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }) });
  const started = new Map<string, ReturnType<typeof Promise.withResolvers<void>>>();
  const service = new ModeledBusterRemotePlanService({ store, registry, admission: profile.settings.admission,
    workerRevision: 'a'.repeat(40), runtimeRoot: path.join(root, 'runs'), tarExecutable: '/usr/bin/tar',
    maximumExtractedBytes: 1048576, allowedCapabilities: new Set(),
    execute: async (job, _paths, signal) => {
      started.get(job.jobId)!.resolve();
      return new Promise<never>((_resolve, reject) => {
        signal.throwIfAborted();
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    } });
  const job = (id: string, maximumConcurrency: number) => {
    const value = createRemotePlanJob({ idempotencyKey: id, pipelineStageId: 'test', plan, ...snapshot,
      grants: new Map([['check', []]]), maximumConcurrency, submittedAt: new Date().toISOString() });
    started.set(value.jobId, Promise.withResolvers<void>());
    return value;
  };
  return { root, profile, store, service, job, started,
    close: async () => { await service.shutdown(5000); fs.rmSync(root, { recursive: true, force: true }); } };
}
