#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { loadProductionBusterRemotePlanRuntime } from './test-gates/production.ts';

function configArgument(values: readonly string[]): string {
  if (values.length !== 2 || values[0] !== '--config' || !values[1]) {
    throw new Error('Usage: remote-plan-cli --config <buster-runtime.json>');
  }
  return path.resolve(values[1]);
}

try {
  const runtime = loadProductionBusterRemotePlanRuntime(configArgument(process.argv.slice(2)));
  const address = await runtime.start();
  process.stdout.write(`${JSON.stringify({ schemaVersion: 'buster-remote-runtime-ready.v1',
    host: address.address, port: address.port })}\n`);
  await new Promise<void>((resolve) => {
    const stop = (): void => resolve();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  await runtime.stop();
} catch (error) {
  process.stderr.write(`${JSON.stringify({ status: 'error', error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
}
