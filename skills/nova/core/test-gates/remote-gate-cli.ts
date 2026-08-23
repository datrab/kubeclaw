#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { ResolvedTestPlanV1 } from '@kubeclaw/pipeline-test-gate-contract';
import { loadProductionNovaTestGate } from './runtime-config.ts';

function argumentsOf(values: readonly string[]): { config: string; job: string; timeoutMs: number } {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index]; const value = values[index + 1];
    if (!flag?.startsWith('--') || !value) throw new Error('NOVA_REMOTE_GATE_CLI_ARGUMENTS_INVALID');
    parsed[flag.slice(2)] = value;
  }
  const timeoutMs = Number(parsed['timeout-ms']);
  if (!parsed.config || !parsed.job || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('Usage: remote-gate-cli --config <nova-runtime.json> --job <job.json> --timeout-ms <milliseconds>');
  }
  return { config: path.resolve(parsed.config), job: path.resolve(parsed.job), timeoutMs };
}

try {
  const args = argumentsOf(process.argv.slice(2));
  const request = JSON.parse(fs.readFileSync(fs.realpathSync(args.job), 'utf8')) as {
    idempotencyKey: string; pipelineStageId: string; plan: ResolvedTestPlanV1;
    repositoryRoot: string; repositoryId: string; revision?: string;
    grants: Record<string, string[]>; maximumConcurrency: number; submittedAt: string;
  };
  if (!request.grants || typeof request.grants !== 'object' || Array.isArray(request.grants)) {
    throw new Error('NOVA_REMOTE_GATE_REQUEST_GRANTS_INVALID');
  }
  const gate = loadProductionNovaTestGate(args.config);
  const result = await gate.execute({ ...request, grants: new Map(Object.entries(request.grants)),
    timeoutMs: args.timeoutMs, legacySuites: [] });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.remote.stageResult.outcome === 'passed' ? 0 : 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ status: 'error', error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
}
