#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import type { ResumeSignal } from '@kubeclaw/plugin-sdk';
import { loadPlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';
import {
  loadPipelineDefinition,
  recoverPipelineV2,
  resumePipelineV2,
  runPipelineV2,
} from './execution/engine.ts';

function usage(): never {
  process.stderr.write('Usage: node skills/nova/core/cli.ts --platform <platform.json> --pipeline <pipeline.json> [--run-id <id> | --recover <id>] [--signal <resume-signal.json>]\\n');
  process.exit(2);
}

function argumentsOf(values: readonly string[]): {
  readonly platform: string;
  readonly pipeline: string;
  readonly runId?: string;
  readonly recover?: string;
  readonly signal?: string;
} {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith('--') || value === undefined) usage();
    parsed[flag.slice(2)] = value;
  }
  if (!parsed.platform || !parsed.pipeline) usage();
  return {
    platform: path.resolve(parsed.platform),
    pipeline: path.resolve(parsed.pipeline),
    ...(parsed['run-id'] === undefined ? {} : { runId: parsed['run-id'] }),
    ...(parsed.recover === undefined ? {} : { recover: parsed.recover }),
    ...(parsed.signal === undefined ? {} : { signal: path.resolve(parsed.signal) }),
  };
}

try {
  const args = argumentsOf(process.argv.slice(2));
  const platform = loadPlatformConfig(args.platform);
  const definition = loadPipelineDefinition(args.pipeline);
  if (args.runId && args.recover) usage();
  if (args.signal && args.recover) usage();
  let result: Awaited<ReturnType<typeof runPipelineV2>>;
  if (args.recover) result = await recoverPipelineV2(platform, definition, args.recover);
  else if (args.signal === undefined) result = await runPipelineV2(platform, definition, args.runId);
  else {
    result = await resumePipelineV2(
      platform,
      definition,
      args.runId ?? usage(),
      JSON.parse(fs.readFileSync(args.signal, 'utf8')) as ResumeSignal,
    );
  }
  process.stdout.write(`${JSON.stringify({
    runId: result.runId,
    status: result.status,
    stages: Object.fromEntries(result.stages),
  })}\n`);
  process.exitCode = result.status === 'succeeded' ? 0 : 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    status: 'error',
    error: error instanceof Error ? error.message : String(error),
  })}\n`);
  process.exitCode = 1;
}
