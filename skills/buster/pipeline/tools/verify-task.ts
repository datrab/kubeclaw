#!/usr/bin/env node
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import process from 'process';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { fileURLToPath } from 'url';
import { parseCliFlagValues } from '../cli-args.ts';
import { gitExec, getRepoRoot, getCurrentBranch, gitPushWithRetry } from '../services/git-workflows.ts';

// KEEP_TYPED_POLICY: role is presentation only, true no-change success is a
// terminal helper success, and scope cleanup handles tracked and untracked
// forbidden paths.
// DELETE_LEGACY: cleanup failures are terminal typed failures; helper success
// means all intended cleanup actions completed or there were no changes.

type AnyRecord = Record<string, any>;

interface VerifyOptions {
  commitMessage?: string;
}

interface VerifyResult {
  status: 'success' | 'error';
  action: 'none' | 'reverted_all_bad_files' | 'pushed' | 'cleanup_failed';
  logs: string[];
  error?: string;
  cleanup_proof?: Record<string, unknown>;
  files_pushed?: number;
  commit_hash?: string;
}

export interface CleanupAction {
  file: string;
  cleaned: boolean;
  method?: 'checkout' | 'delete';
  error?: string;
}

export function validateProjectSlug(currentProject: unknown): string {
  const project = String(currentProject || '').trim();
  if (!/^[A-Za-z0-9._-]+$/.test(project) || project === '.' || project === '..') {
    throw new Error('Invalid project id. Expected a safe project slug without path separators.');
  }
  return project;
}

export function normalizeGitPath(value: unknown): string {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
}

export function isGitPathInside(file: string, root: string): boolean {
  const normalizedFile = normalizeGitPath(file);
  const normalizedRoot = normalizeGitPath(root);
  return normalizedFile === normalizedRoot || normalizedFile.startsWith(`${normalizedRoot}/`);
}

export function buildSwarmScope(currentProject: unknown): { project: string; projectRoot: string; swarmRoot: string } {
  const project = validateProjectSlug(currentProject);
  const projectRoot = `Projects/${project}`;
  const swarmRoot = `${projectRoot}/src/.swarm`;
  return { project, projectRoot, swarmRoot };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error');
}

function uniqueFiles(files: string[]): string[] {
  return [...new Set(files.map(normalizeGitPath).filter(Boolean))];
}

export function parsePorcelainStatusPaths(statusOut: string): string[] {
  const entries = statusOut.split('\0').filter((entry: string) => entry.length > 0);
  const files: string[] = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    const file = entry.substring(3);
    if (!file) continue;

    files.push(file);

    const indexStatus = entry[0];
    const worktreeStatus = entry[1];
    if (indexStatus === 'R' || indexStatus === 'C' || worktreeStatus === 'R' || worktreeStatus === 'C') {
      const source = entries[i + 1];
      if (source) {
        files.push(source);
        i += 1;
      }
    }
  }

  return uniqueFiles(files);
}

function listChangedFiles(repoRoot: string): string[] {
  const statusOut = gitExec(repoRoot, ['status', '--porcelain=v1', '-z']);
  if (!statusOut) return [];
  return parsePorcelainStatusPaths(statusOut);
}

function findScopeViolations(files: string[], projectRoot: string, swarmRoot: string): { violations: string[]; badFiles: string[] } {
  const violations: string[] = [];
  const badFiles: string[] = [];

  for (const file of files) {
    let reason = '';

    if (!isGitPathInside(file, projectRoot)) {
      reason = `[CROSS-PROJECT] Only files within ${projectRoot}/ are allowed.`;
    } else if (!isGitPathInside(file, swarmRoot)) {
      reason = `[SWARM-SCOPE] This verifier only permits writes inside ${swarmRoot}/.`;
    }

    if (reason) {
      violations.push(`${file} -> ${reason}`);
      badFiles.push(file);
    }
  }

  return { violations, badFiles };
}

export function cleanupForbiddenFile(repoRoot: string, file: string): CleanupAction {
  const absPath = path.join(repoRoot, file);
  try {
    gitExec(repoRoot, ['checkout', 'HEAD', '--', file], { stdio: 'ignore' } as AnyRecord);
    return { file, cleaned: true, method: 'checkout' };
  } catch (_checkoutError) {
    gitExec(repoRoot, ['rm', '--cached', '--ignore-unmatch', '-r', '--', file], { stdio: 'ignore' } as AnyRecord);
    if (fs.existsSync(absPath)) {
      fs.rmSync(absPath, { force: true, recursive: true });
    }
    return { file, cleaned: true, method: 'delete' };
  }
}

async function verifyAndPush(agentRole: string, currentProject: string, opts: VerifyOptions = {}): Promise<VerifyResult> {
  const logs: string[] = [];
  const log = (msg: string): void => { logs.push(msg); };
  const agentName = String(agentRole || 'unknown').trim() || 'unknown';
  const { project, projectRoot, swarmRoot } = buildSwarmScope(currentProject);

  const commitMessage = opts.commitMessage || `[${agentName.toUpperCase()}] Update task via verify-task.ts`;

  log(`[Verify] Validating swarm-scoped task for agent: '${agentName}' in project: '${project}'`);

  let changedFiles: string[] = [];
  let repoRoot = '';
  try {
    repoRoot = getRepoRoot();
    changedFiles = listChangedFiles(repoRoot);
  } catch (error) {
    throw new Error(`Critical error reading Git status: ${errorMessage(error)}`);
  }

  if (changedFiles.length === 0) {
    log('⚠️ [Verify] No uncommitted changes found. Nothing to do.');
    return { status: 'success', action: 'none', logs };
  }

  const { violations, badFiles } = findScopeViolations(changedFiles, projectRoot, swarmRoot);

  const cleanupActions: CleanupAction[] = [];
  if (badFiles.length > 0) {
    log('⚠️ STAGE 1 WARNING: OUT OF SCOPE MODIFICATIONS DETECTED.');
    violations.forEach((v) => log(`  - ${v}`));
    log('[Verify] Cleaning up forbidden changes...');

    for (const file of badFiles) {
      try {
        cleanupActions.push(cleanupForbiddenFile(repoRoot, file));
        log(`  -> ⏪ Reverted/Deleted: ${file}`);
      } catch (error) {
        const message = errorMessage(error);
        cleanupActions.push({ file, cleaned: false, error: message });
        log(`  -> ❌ Could not clean up ${file}: ${message}`);
      }
    }

    const remainingAfterCleanup = listChangedFiles(repoRoot);
    const remainingBadFiles = badFiles.filter((file) => remainingAfterCleanup.includes(file));
    const failedCleanup = cleanupActions.filter((action) => !action.cleaned);
    if (failedCleanup.length > 0 || remainingBadFiles.length > 0) {
      const error = 'Forbidden file cleanup failed; refusing commit/push.';
      log(`❌ [Verify] ${error}`);
      return {
        status: 'error',
        action: 'cleanup_failed',
        error,
        logs,
        cleanup_proof: {
          intended_cleanup_count: badFiles.length,
          actions: cleanupActions,
          remaining_forbidden_files: remainingBadFiles,
        },
      };
    }

    log('✅ [Verify] Forbidden file cleanup completed with proof.');
  } else {
    log('✅ [Verify] Stage 1 Passed (Scope Check).');
  }

  log('✅ [Verify] All conditions met. Running commit and push...');
  try {
    const remainingChanges = gitExec(repoRoot, ['status', '--porcelain']);
    if (!remainingChanges) {
      log('⚠️ [Verify] No changes remaining after cleanup. Nothing to push.');
      return {
        status: 'success',
        action: 'reverted_all_bad_files',
        logs,
        cleanup_proof: {
          intended_cleanup_count: badFiles.length,
          actions: cleanupActions,
          remaining_forbidden_files: [],
        },
      };
    }

    const finalChangedFiles = listChangedFiles(repoRoot);
    const finalScope = findScopeViolations(finalChangedFiles, projectRoot, swarmRoot);
    if (finalScope.badFiles.length > 0) {
      const error = 'Out-of-scope changes remain after cleanup; refusing commit/push.';
      finalScope.violations.forEach((v) => log(`  - ${v}`));
      log(`❌ [Verify] ${error}`);
      return {
        status: 'error',
        action: 'cleanup_failed',
        error,
        logs,
        cleanup_proof: {
          intended_cleanup_count: badFiles.length,
          actions: cleanupActions,
          remaining_forbidden_files: finalScope.badFiles,
        },
      };
    }

    const currentBranch = getCurrentBranch(repoRoot);
    log(`[Verify] Current branch: ${currentBranch}`);

    const gitLogger = {
      warn: (_scope: unknown, msg: string) => log(`⚠️ [Verify] ${msg}`),
      info: (_scope: unknown, msg: string) => log(msg),
    };
    const { hash: commitHash } = await gitPushWithRetry(repoRoot, currentBranch, {
      logger: gitLogger,
      commitMessage,
      addPaths: [swarmRoot],
    });

    log(`✅ [Verify] Push successful! (${commitHash})`);
    return {
      status: 'success',
      action: 'pushed',
      files_pushed: remainingChanges.split('\n').filter((line: string) => line.trim()).length,
      commit_hash: commitHash,
      logs,
      ...(badFiles.length > 0 ? {
        cleanup_proof: { intended_cleanup_count: badFiles.length, actions: cleanupActions, remaining_forbidden_files: [] },
      } : {}),
    };
  } catch (error) {
    throw new Error(`Error during Git push (conflicts?): ${errorMessage(error)}`);
  }
}

const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = (process.argv[1] && fs.existsSync(process.argv[1]))
  ? fs.realpathSync(process.argv[1])
  : process.argv[1];

if (currentPath === entryPath) {
  const flags = parseCliFlagValues(process.argv.slice(2), {
    flags: {
      role: { type: 'string' },
      project: { type: 'string' },
      message: { type: 'string' },
    },
  }) as Record<string, string | undefined>;

  const agentRole = (flags.role || process.env.AGENT_ROLE || process.env.AGENT_NAME || 'unknown').toLowerCase();
  const currentProject = flags.project || process.env.CURRENT_PROJECT;
  const commitMessage = flags.message;

  if (!currentProject) {
    console.log(JSON.stringify({ status: 'error', error: 'No project defined. Use --project <name>.' }));
    process.exit(1);
  }

  verifyAndPush(agentRole, currentProject, commitMessage ? { commitMessage } : {}).then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'success' ? 0 : 1);
  }).catch((error: unknown) => {
    console.log(JSON.stringify({ status: 'error', error: errorMessage(error) }));
    process.exit(1);
  });
}

export default verifyAndPush;
