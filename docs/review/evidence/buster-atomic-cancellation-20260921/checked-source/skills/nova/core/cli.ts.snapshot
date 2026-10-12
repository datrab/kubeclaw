#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import { readPipelineAudit } from './telemetry/audit.ts';
import { runRoot } from './execution/run-root.ts';
import type { ResumeSignal } from '@kubeclaw/plugin-sdk';
import { loadPlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';
import {
  loadPipelineDefinition,
  recoverPipelineV2,
  resumePipelineV2,
  runPipelineV2,
} from './execution/engine.ts';

function usage(): never {
  process.stderr.write('Usage: node skills/nova/core/cli.ts --platform <platform.json> --pipeline <pipeline.json> [--run-id <id> | --recover <id>] [--signal <resume-signal.json>] | --platform <platform.json> --audit <run-id>\\n');
  process.exit(2);
}

function argumentsOf(values: readonly string[]): {
  readonly platform: string;
  readonly pipeline?: string;
  readonly audit?: string;
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
  if (!parsed.platform || (!parsed.pipeline && !parsed.audit)) usage();
  if (parsed.audit && (parsed.pipeline || parsed['run-id'] || parsed.recover || parsed.signal)) usage();
  return {
    platform: path.resolve(parsed.platform),
    ...(parsed.pipeline === undefined ? {} : { pipeline: path.resolve(parsed.pipeline) }),
    ...(parsed.audit === undefined ? {} : { audit: parsed.audit }),
    ...(parsed['run-id'] === undefined ? {} : { runId: parsed['run-id'] }),
    ...(parsed.recover === undefined ? {} : { recover: parsed.recover }),
    ...(parsed.signal === undefined ? {} : { signal: path.resolve(parsed.signal) }),
  };
}

try {
  const args = argumentsOf(process.argv.slice(2));
  const platform = loadPlatformConfig(args.platform);
  if (args.audit) {
    process.stdout.write(`${JSON.stringify(readPipelineAudit(runRoot(platform.storageRoot, args.audit), args.audit))}\n`);
    process.exit(0);
  }
  const definition = loadPipelineDefinition(args.pipeline ?? usage());
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
