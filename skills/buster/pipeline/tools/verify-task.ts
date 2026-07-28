#!/usr/bin/env node
import process from 'process';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { parseCliFlagValues } from '../cli-args.ts';
import { getRepoRoot } from '../services/git-workflows.ts';
import { errorMessage } from '../value-boundary.ts';
import { readBusterEnvironment } from '../buster-environment.ts';
import {
  buildSwarmScope,
  isGitPathInside,
  listChangedFiles,
  normalizeExplicitAddPaths,
  requireNonEmptyString,
} from './verify-task-scope.ts';

export {
  buildSwarmScope,
  cleanupForbiddenFile,
  isGitPathInside,
  normalizeGitPath,
  parsePorcelainStatusPaths,
  validateProjectSlug,
} from './verify-task-scope.ts';
export type { CleanupAction } from './verify-task-scope.ts';
import type { CleanupAction } from './verify-task-scope.ts';
import { cleanScopeViolations, commitVerifiedScope } from './verify-task-execution.ts';
import type { VerifyResult } from './verify-task-execution.ts';
// KEEP_TYPED_POLICY: role is presentation only, true no-change success is a
// terminal helper success, and scope cleanup handles tracked and untracked
// forbidden paths.
// DELETE_LEGACY: cleanup failures are terminal typed failures; helper success
// means all intended cleanup actions completed or there were no changes.

interface VerifyOptions {
  commitMessage?: string;
  addPaths?: string[];
}

async function verifyAndPush(agentRole: string, currentProject: string, opts: VerifyOptions = {}): Promise<VerifyResult> {
  const logs: string[] = [];
  const log = (msg: string): void => { logs.push(msg); };
  const agentName = requireNonEmptyString(agentRole, 'agent role');
  const { project, projectRoot, swarmRoot } = buildSwarmScope(currentProject);

  const commitMessage = requireNonEmptyString(opts.commitMessage, 'commit message');
  const explicitAddPaths = normalizeExplicitAddPaths(opts.addPaths, projectRoot, swarmRoot);

  log(`[Verify] Validating swarm-scoped task for agent: '${agentName}' in project: '${project}'`);

  let changedFiles: string[] = [];
  let repoRoot = '';
  try {
    repoRoot = getRepoRoot();
    changedFiles = listChangedFiles(repoRoot);
  } catch (error) {
    throw new Error(`Critical error reading Git status: ${errorMessage(error)}`);
  }

  const projectChangedFiles = changedFiles.filter((file) => isGitPathInside(file, projectRoot));
  const ignoredOutOfProjectFiles = changedFiles.filter((file) => !isGitPathInside(file, projectRoot));
  if (ignoredOutOfProjectFiles.length > 0) {
    log(`[Verify] Ignoring ${ignoredOutOfProjectFiles.length} dirty file(s) outside ${projectRoot}/ while committing scoped Buster artifact.`);
  }

  if (projectChangedFiles.length === 0) {
    log('⚠️ [Verify] No uncommitted changes found. Nothing to do.');
    return { status: 'success', action: 'none', logs };
  }

  log('✅ [Verify] All conditions met. Running commit and push...');
  const execution = { repoRoot, projectRoot, swarmRoot, commitMessage, explicitAddPaths, logs, log };
  const cleanup = cleanScopeViolations(execution, projectChangedFiles);
  if (cleanup.failure) return cleanup.failure;
  try {
    return await commitVerifiedScope(execution, cleanup);
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

  const roleInput = flags.role
    ? flags.role
    : readBusterEnvironment('AGENT_ROLE')
      ? readBusterEnvironment('AGENT_ROLE')
      : readBusterEnvironment('AGENT_NAME');
  if (!roleInput) throw new Error('agent role required via --role, AGENT_ROLE, or AGENT_NAME');
  const agentRole = roleInput.toLowerCase();
  const currentProject = flags.project ? flags.project : readBusterEnvironment('CURRENT_PROJECT');
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
