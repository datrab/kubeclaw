import { preparationCleanupReconciliation } from './preparation-cleanup.ts';
import { runHistoricalImport } from './preparation-historical-import.ts';
import { recoverPreparationLedger } from './preparation-recovery.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Duplex } from 'node:stream';
import {
  FileWorkerOwnershipStore, NativeWorkerOwnership, NativeAttemptJournal,
  NativeWorkerControlChannel, recoverNativeWorkerAttempts, requireNativeWorkerSupervisorAuthority,
} from '@kubeclaw/worker-core';
import { rejectLegacyAuthors } from '@kubeclaw/plugin-foundation/config/swarm';
import { verifyPipelineBootReceipt, captureBusterParentStartupHandoff } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';
import { projectBusterSettings, selectedWorkerCorePolicy } from '@kubeclaw/plugin-foundation/config/pipeline-composition';
import { publishBusterStartupFile, type BusterStartupFileCapture } from '@kubeclaw/plugin-foundation/config/buster-startup-file.mjs';
import { captureProductiveBusterLifetimeDescriptor, type BusterLifetimeDescriptor } from '@kubeclaw/plugin-foundation/config/buster-lifetime.mjs';
import { nativeBusterPreparationConfig, preparationSourceRoot, preparationRuntimeConfig } from './preparation-config.ts';
import { PreparationSourceLedger } from './preparation-ledger.ts';
import { preparationServiceChannelLimits } from './preparation-channel.ts';
import { servePreparationRequests } from './preparation-parent-channel.ts';
import { executeBusterPreparation, type PreparationExecutionOptions } from './preparation-execution.ts';
import { extractBusterPreparation } from './preparation-extraction.ts';
import { receiveBusterStartupAssociation } from './preparation-startup-channel.ts';

/** No provider or HTTP-runtime module is imported into this privileged parent. */
export async function runBusterPreparationSupervisor(): Promise<void> {
  requireNativeWorkerSupervisorAuthority();
  const lifetime = captureProductiveBusterLifetimeDescriptor();
  try {
    await runLockedBusterPreparationSupervisor(lifetime);
  } finally {
    // Release only this process's copy. A failed drain remains unresolved in the
    // existing ownership store; lock release must never authorize publication.
    lifetime.close();
  }
}

async function runLockedBusterPreparationSupervisor(lifetime: BusterLifetimeDescriptor): Promise<void> {
  lifetime.assertCurrent();
  rejectLegacyAuthors(process.env);
  const boot = verifyPipelineBootReceipt('/run/pipeline-delivery', 'buster-preparation');
  const settings = projectBusterSettings(boot, 'buster-preparation').preparation;
  const handoff = captureBusterParentStartupHandoff(boot);
  const native = nativeBusterPreparationConfig(settings, process.env, selectedWorkerCorePolicy(boot));
  const source = await fs.lstat(preparationSourceRoot);
  if (!source.isDirectory() || source.uid !== 0 || (source.mode & 0o022) !== 0
    || await fs.realpath(preparationSourceRoot) !== preparationSourceRoot) throw new Error('BUSTER_NATIVE_SOURCE_ROOT_NOT_TRUSTED');
  const store = new FileWorkerOwnershipStore(native.pool.ownershipRoot, {
    maximumRecords: settings.maximumRecords, maximumBytes: settings.maximumOwnershipBytes,
  }, undefined, selectedWorkerCorePolicy(boot));
  await NativeWorkerOwnership.supervise({ store, cgroupRoot: native.pool.cgroupRoot,
    nodeIdentity: native.nodeIdentity, drainTimeoutMs: settings.drainTimeoutMs,
    maximumActiveScopes: native.pool.maximumActiveScopes, poolLimits: native.pool.limits }, async owner => {
    const journal = new NativeAttemptJournal(path.join(native.pool.ownershipRoot, 'preparation-journal'), {
      maximumRecords: settings.maximumRecords, maximumStateBytes: settings.maximumMetadataBytes,
      maximumTotalBytes: settings.maximumJournalBytes, maximumInputBytes: settings.maximumInputBytes,
      maximumOutputBytes: settings.maximumOutputBytes, maximumResultBytes: settings.maximumResultBytes,
    }, undefined, selectedWorkerCorePolicy(boot));
    if (selectedWorkerCorePolicy(boot)) await owner.withJournalRoutingFence(authority => journal.configureRouting(authority, boot.selectionReceipt.generationDigest));
    const execution: PreparationExecutionOptions = {
      owner, journal, settings, ledger: new PreparationSourceLedger(preparationSourceRoot, settings),
      engineContentDigest: native.engineContentDigest,
      command: { launcher: native.launcher, sourceRoot: preparationSourceRoot,
        cgroupRoot: native.pool.cgroupRoot, tarExecutable: native.tarExecutable,
        trustedSourceAuthority: native.trustedSourceAuthority, sourceAttestationPublicKey: native.sourceAttestationPublicKey },
    };
    await recoverNativeWorkerAttempts(journal, owner, preparationCleanupReconciliation(execution));
    if (selectedWorkerCorePolicy(boot)) await owner.withJournalRoutingFence(authority => journal.configureRouting(authority, boot.selectionReceipt.generationDigest, true));
    await runHistoricalImport(execution, native.stateRoot);
    await recoverPreparationLedger(execution);
    await owner.assertRecoveryQuiescent();
    lifetime.assertCurrent();
    const startup = publishBusterStartupFile('/run/kubeclaw-buster', handoff);
    try { await serveUnprivilegedBuster(execution, lifetime, startup, native.serviceShutdownTimeoutMs); }
    finally { startup.close(); }
  });
}

async function serveUnprivilegedBuster(execution: PreparationExecutionOptions, lifetime: BusterLifetimeDescriptor,
  startup: BusterStartupFileCapture, shutdownTimeoutMs: number): Promise<void> {
  lifetime.assertCurrent();
  startup.assertCurrent();
  const child = spawn('/usr/local/libexec/kubeclaw-buster-lifetime-guardian', ['/run/kubeclaw-buster/lifetime.lock',
    String(shutdownTimeoutMs), String(process.pid), '/usr/bin/setpriv', '--reuid=1000', '--regid=1000', '--groups', '1000,1002',
    process.execPath, fileURLToPath(new URL('../remote-plan-cli.ts', import.meta.url)),
    '--config', preparationRuntimeConfig], { stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', lifetime.descriptor], env: process.env });
  const pipe = child.stdio[3] as Duplex;
  const channel = new NativeWorkerControlChannel(pipe, preparationServiceChannelLimits(execution.settings));
  const messages = channel.messages();
  const stop = () => { execution.owner.fenceAdmission(); child.kill('SIGTERM'); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const closed = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      channel.destroy();
      if (code === 0 || signal === 'SIGTERM') resolve();
      else reject(new Error(`BUSTER_SERVICE_EXIT:${code}:${signal}`));
    });
  });
  void closed.catch(() => {});
  try {
    lifetime.assertCurrent(); startup.assertCurrent();
    await receiveBusterStartupAssociation(channel, messages, startup.handoff, async () => {
      await execution.owner.assertRecoveryQuiescent();
      lifetime.assertCurrent(); startup.assertCurrent();
    });
    lifetime.assertCurrent(); startup.assertCurrent();
    await servePreparationRequests(channel, {
      maximumActivePreparations: execution.settings.maximumActivePreparations,
      maximumRequestBytes: execution.settings.maximumRequestBytes,
      prepare: (input, signal, admit) => executeBusterPreparation(execution, input, signal, admit),
      extract: (staged, signal) => extractBusterPreparation(execution, staged, signal),
    }, messages);
    await closed;
  } finally {
    stop();
    channel.destroy();
    await closed;
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
