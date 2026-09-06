import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadPlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';
import { runPipelineV2, recoverPipelineV2, resumePipelineV2, validatePipelineRuntimeV2 } from '@kubeclaw/nova-core';
import { canonicalJson, sha256Text, type ResumeSignal } from '@kubeclaw/plugin-sdk';
import { compileProject } from './compiler.ts';

// Explicit pipeline graphs retain the existing core command surface.
if (!process.argv.includes('--project')) {
  await import('@kubeclaw/nova-core/cli');
} else {
  try {
    const args: Record<string, string> = {};
    const values = process.argv.slice(2);
    for (let index = 0; index < values.length; index += 2) {
      const flag = values[index]!;
      const value = values[index + 1];
      if (!['--project', '--platform', '--compile', '--recover', '--signal'].includes(flag)
        || value === undefined || value.startsWith('--') || Object.hasOwn(args, flag)) throw new Error(`PROJECT_ARGUMENT_INVALID:${flag}`);
      args[flag] = value;
    }
    if (!args['--project'] || !args['--platform']) throw new Error('PROJECT_AND_PLATFORM_REQUIRED');
    if ([args['--compile'], args['--recover'], args['--signal']].filter(Boolean).length > 1) throw new Error('PROJECT_COMMAND_CONFLICT');
    const project = JSON.parse(fs.readFileSync(path.resolve(args['--project']), 'utf8'));
    const { runId, definition } = compileProject(project);
    const platform = loadPlatformConfig(path.resolve(args['--platform']));
    // Validate every stage's input, registration and grants from the actual
    // installed role before writing a graph or starting any external operation.
    await validatePipelineRuntimeV2(platform, definition);
    if (args['--compile']) {
      fs.writeFileSync(path.resolve(args['--compile']), `${canonicalJson(definition)}\n`, { flag: 'wx' });
      process.stdout.write(`${JSON.stringify({ status: 'compiled', runId, stageCount: definition.stages.length, definitionDigest: sha256Text(canonicalJson(definition)) })}\n`);
    } else {
      if (args['--recover'] && args['--recover'] !== runId) throw new Error('PROJECT_RECOVERY_RUN_MISMATCH');
      if (!args['--recover'] && !args['--signal']) {
        const head = execFileSync('git', ['-C', project.repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
        if (head !== project.baseRevision) throw new Error('PROJECT_BASELINE_CHANGED');
        const dirty = execFileSync('git', ['-C', project.repositoryRoot, 'status', '--porcelain'], { encoding: 'utf8' });
        if (dirty.trim()) throw new Error('PROJECT_REPOSITORY_DIRTY');
      }
      const result = args['--recover'] ? await recoverPipelineV2(platform, definition, runId)
        : args['--signal'] ? await resumePipelineV2(platform, definition, runId,
          JSON.parse(fs.readFileSync(path.resolve(args['--signal']), 'utf8')) as ResumeSignal)
        : await runPipelineV2(platform, definition, runId);
      process.stdout.write(`${JSON.stringify({ runId: result.runId, status: result.status, stages: Object.fromEntries(result.stages) })}\n`);
      process.exitCode = result.status === 'succeeded' ? 0 : 1;
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: 'error', error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  }
}
