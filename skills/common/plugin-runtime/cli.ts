#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import type { ResumeSignal } from './sdk/src/index.ts';
import { loadPlatformConfig } from './core/config/platform.ts';
import {
  loadPipelineDefinition,
  resumePipelineV2,
  runPipelineV2,
} from './core/execution/engine.ts';

function usage(): never {
  process.stderr.write('Usage: node skills/common/plugin-runtime/cli.ts --platform <platform.json> --pipeline <pipeline.json> [--run-id <id>] [--signal <resume-signal.json>]\\n');
  process.exit(2);
}

function argumentsOf(values: readonly string[]): {
  readonly platform: string;
  readonly pipeline: string;
  readonly runId?: string;
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
    ...(parsed.signal === undefined ? {} : { signal: path.resolve(parsed.signal) }),
  };
}

try {
  const args = argumentsOf(process.argv.slice(2));
  const platform = loadPlatformConfig(args.platform);
  const definition = loadPipelineDefinition(args.pipeline);
  const result = args.signal === undefined
    ? await runPipelineV2(platform, definition, args.runId)
    : await resumePipelineV2(
      platform,
      definition,
      args.runId ?? usage(),
      JSON.parse(fs.readFileSync(args.signal, 'utf8')) as ResumeSignal,
    );
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
