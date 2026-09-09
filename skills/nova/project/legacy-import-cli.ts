import fs from 'node:fs';
import path from 'node:path';
import { loadPlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';
import { validatePipelineRuntimeV2 } from '@kubeclaw/nova-core';
import { canonicalJson } from '@kubeclaw/plugin-sdk';
import { importLegacyProject } from './legacy-import.ts';

export async function runLegacyImportCLI(values: string[]): Promise<void> {
try {
  const args: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index]!; const value = values[index + 1];
    if (!['--import-legacy', '--authoring', '--platform', '--output'].includes(flag)
      || value === undefined || value.startsWith('--') || Object.hasOwn(args, flag)) throw new Error(`LEGACY_IMPORT_ARGUMENT_INVALID:${flag}`);
    args[flag] = value;
  }
  if (Object.keys(args).length !== 4) throw new Error('LEGACY_IMPORT_ARGUMENTS_REQUIRED');
  const legacyFile = fs.realpathSync(path.resolve(args['--import-legacy']!));
  const authoring = JSON.parse(fs.readFileSync(path.resolve(args['--authoring']!), 'utf8'));
  // Resolve the actual repository root before checking the imported file boundary.
  if (authoring.project.repositoryRoot !== fs.realpathSync(authoring.project.repositoryRoot)) throw new Error('LEGACY_IMPORT_CANONICAL_REPOSITORY_REQUIRED');
  const imported = importLegacyProject(JSON.parse(fs.readFileSync(legacyFile, 'utf8')), authoring, legacyFile);
  await validatePipelineRuntimeV2(loadPlatformConfig(path.resolve(args['--platform']!)), imported.definition);
  fs.writeFileSync(path.resolve(args['--output']!), `${canonicalJson(imported.project)}\n`, { flag: 'wx' });
  process.stdout.write(`${canonicalJson(imported.report)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ status: 'error', error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
}
}
