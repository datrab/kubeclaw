#!/usr/bin/env node
import { captureBusterOriginalExecution } from './test-gates/original-execution.ts';
import path from 'node:path';
import { Socket } from 'node:net';
import { NativeWorkerControlChannel } from '@kubeclaw/worker-core';
import { rejectLegacyAuthors } from '@kubeclaw/plugin-foundation/config/swarm';
import { verifyBusterChildBootReceipt } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';
import { captureProductiveBusterLifetimeWitness } from '@kubeclaw/plugin-foundation/config/buster-lifetime.mjs';
import { selectedWorkerCorePolicy, projectBusterSettings, projectBusterWorkerCore } from '@kubeclaw/plugin-foundation/config/pipeline-composition';
import { preparationSourceRoot } from './test-gates/preparation-config.ts';
import { BusterPreparationClient } from './test-gates/preparation-client.ts';
import { preparationServiceChannelLimits } from './test-gates/preparation-channel.ts';
import { sendBusterStartupAssociation } from './test-gates/preparation-startup-channel.ts';
import process from 'node:process';

function configArgument(values: readonly string[]): string {
  if (values.length !== 2 || values[0] !== '--config' || !values[1]) {
    throw new Error('Usage: remote-plan-cli --config <buster-runtime.json>');
  }
  return path.resolve(values[1]);
}

let lifetime: ReturnType<typeof captureProductiveBusterLifetimeWitness> | undefined;
let boot: ReturnType<typeof verifyBusterChildBootReceipt> | undefined;
let channel: NativeWorkerControlChannel | undefined;
try {
  if (process.getuid?.() !== 1000 || process.getgid?.() !== 1000) throw new Error('BUSTER_SERVICE_IDENTITY_REQUIRED');
  rejectLegacyAuthors(process.env);
  const runtimeConfig = configArgument(process.argv.slice(2));
  // Only effect-free policy/provenance reads precede the parent's exact fd3 acknowledgement.
  lifetime = captureProductiveBusterLifetimeWitness();
  boot = verifyBusterChildBootReceipt();
  const settings = projectBusterSettings(boot.capture, 'buster-runtime');
  channel = new NativeWorkerControlChannel(
    new Socket({ fd: 3, readable: true, writable: true, allowHalfOpen: true }),
    preparationServiceChannelLimits(settings.preparation));
  const messages = channel.messages();
  lifetime.assertCurrent(); boot.startup.assertCurrent();
  await sendBusterStartupAssociation(channel, messages, boot.startup.handoff);
  lifetime.assertCurrent(); boot.startup.assertCurrent();
  const { loadProductionBusterRemotePlanRuntime } = await import('./test-gates/production.ts');
  lifetime.assertCurrent(); boot.startup.assertCurrent();
  const client = new BusterPreparationClient(channel, settings.preparation, preparationSourceRoot, messages);
  const runtime = loadProductionBusterRemotePlanRuntime(runtimeConfig, client, settings,
    projectBusterWorkerCore(boot.capture).localRuntime, process.env, selectedWorkerCorePolicy(boot.capture), captureBusterOriginalExecution(boot.capture));
  try {
    const address = await runtime.start();
    process.stdout.write(`${JSON.stringify({ schemaVersion: 'buster-remote-runtime-ready.v1',
      host: address.address, port: address.port })}\n`);
    await Promise.race([client.disconnected(), new Promise<void>((resolve) => {
      const stop = (): void => resolve();
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    })]);
  } finally {
    try { await runtime.stop(); } finally { await client.close(); }
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ status: 'error', error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
} finally {
  // Close only the non-owning O_PATH witness; the privileged guardian owns the lock.
  channel?.destroy();
  boot?.startup.close();
  lifetime?.close();
}
