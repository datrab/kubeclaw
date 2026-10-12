#!/usr/bin/env node
import path from 'node:path';
import { Socket } from 'node:net';
import { NativeWorkerControlChannel } from '@kubeclaw/worker-core';
import { loadSwarmSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';
import { preparationSourceRoot } from './test-gates/preparation-config.ts';
import { BusterPreparationClient } from './test-gates/preparation-client.ts';
import { preparationServiceChannelLimits } from './test-gates/preparation-channel.ts';
import process from 'node:process';
import { loadProductionBusterRemotePlanRuntime } from './test-gates/production.ts';

function configArgument(values: readonly string[]): string {
  if (values.length !== 2 || values[0] !== '--config' || !values[1]) {
    throw new Error('Usage: remote-plan-cli --config <buster-runtime.json>');
  }
  return path.resolve(values[1]);
}

try {
  if (process.getuid?.() !== 1000 || process.getgid?.() !== 1000) throw new Error('BUSTER_SERVICE_IDENTITY_REQUIRED');
  const snapshot = loadSwarmSettings(process.env);
  const settings = snapshot.buster;
  const client = new BusterPreparationClient(new NativeWorkerControlChannel(
    new Socket({ fd: 3, readable: true, writable: true, allowHalfOpen: true }),
    preparationServiceChannelLimits(settings.preparation)), settings.preparation, preparationSourceRoot);
  const runtime = loadProductionBusterRemotePlanRuntime(configArgument(process.argv.slice(2)), client, settings, snapshot.workerCore.localRuntime, process.env);
  const address = await runtime.start();
  process.stdout.write(`${JSON.stringify({ schemaVersion: 'buster-remote-runtime-ready.v1',
    host: address.address, port: address.port })}\n`);
  try {
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
}
