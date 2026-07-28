import { execFileSync } from 'child_process';
import { log } from '../core/logger.ts';
import { modulePath, relPath } from '../core/paths.ts';
import { buildSubprocessEnv } from '../security.ts';
import { textValue } from '../value-boundary.ts';

function execText(command: string, args: string[], opts: Record<string, any> = {}) {
  const defaults = {
    encoding: 'utf8' as BufferEncoding,
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
    env: buildSubprocessEnv(),
  };
  const result = execFileSync(command, args, { ...defaults, ...opts });
  return typeof result === 'string' ? result.trim() : '';
}

function changedFilesFromDiffStat(forgeDiffStat: any = '') {
  return textValue(forgeDiffStat)
    .split('\n')
    .map((line: string) => line.trim().split(/\s+\|/)[0]?.trim())
    .filter((filePath: string | undefined) => (
      filePath
      && !filePath.includes('changed')
      && !filePath.includes('insertion')
      && !filePath.includes('deletion')
    ));
}

function changedFilesFromCommit(config: any, commitHash: any = null) {
  if (typeof commitHash !== 'string' || !commitHash.trim()) return [];
  try {
    return execText('git', ['-C', config.repo_root, 'show', '--pretty=format:', '--name-only', commitHash])
      .split('\n')
      .map((line: string) => line.trim())
      .filter(Boolean);
  } catch (error: any) {
    log('WARN', `Unable to derive changed files from commit ${commitHash}: ${error.message}`);
    return [];
  }
}

function normalizedRepoPath(filePath: any = '') {
  return textValue(filePath).replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '');
}

function scopeToModule(moduleDir: any, changedFiles: string[]) {
  if (!moduleDir || changedFiles.length === 0) return changedFiles;
  const normalizedModuleDir = normalizedRepoPath(moduleDir).replace(/\/+$/, '');
  if (!normalizedModuleDir) return changedFiles;
  const modulePrefix = `${normalizedModuleDir}/`;
  return changedFiles.filter((filePath) => {
    const normalizedFilePath = normalizedRepoPath(filePath);
    return [
      normalizedFilePath === normalizedModuleDir,
      normalizedFilePath.startsWith(modulePrefix),
    ].some(Boolean);
  });
}

function changedFileScope(config: any, opts: any): string[] {
  const explicit = Array.isArray(opts.changedFiles) ? opts.changedFiles.filter(Boolean) : [];
  let discovered = explicit;
  if (discovered.length === 0 && opts.forgeDiffStat) {
    discovered = changedFilesFromDiffStat(opts.forgeDiffStat);
  } else if (discovered.length === 0) {
    discovered = changedFilesFromCommit(config, opts.commitHash);
  }
  return scopeToModule(opts.moduleDir, discovered);
}

export function buildLintInvocation(
  config: any,
  cliTier: string,
  lintPolicyPath: string,
  outputPath: string,
  opts: any,
) {
  const scope = opts.moduleDir ? relPath(config, modulePath(config, opts.moduleDir)) : 'full';
  const changedFiles = changedFileScope(config, opts);
  const args = [
    '--repo', config.repo_root,
    '--tier', cliTier,
    '--project', config.project,
    '--policy', lintPolicyPath,
    '--policy-project', config.pre_check.lint_policy_project,
    '--output', outputPath,
  ];
  if (opts.logPath) args.push('--log-path', opts.logPath);
  if (opts.moduleDir) args.push('--module-path', scope);
  if (changedFiles.length > 0) args.push('--changed-files', changedFiles.join(','));
  return { args, scope, changedFiles };
}
