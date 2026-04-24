#!/usr/bin/env node

// =============================================================================
// VERIFY-TASK.JS — Agent Scope Firewall + Controlled Push
// =============================================================================
//
// Validates that an agent only modified files within its allowed scope,
// reverts violations, then commits and pushes.
//
// Called by redis.js (complete action) as part of the completion chain:
//   Subagent → redis.js → verify-task.js → git push → Redis completion
//
// Security: All external commands use execFileSync (array args, no shell).
//
// Agent scope rules:
//   forge  → project code + .swarm/{STATUS.md, FORGE.md}
//   buster → .swarm/ only (anything inside, NO app code outside)
//   echo   → .swarm/echo-reviews/ only
//
// =============================================================================

import process from 'process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { gitExec, getRepoRoot, getCurrentBranch, gitPushWithRetry } from './pipeline/services/git.js';

// ─── Main ───────────────────────────────────────────────────────────────────

async function verifyAndPush(agentRole, currentProject, opts = {}) {
  const logs = [];
  const log = (msg) => logs.push(msg);

  const commitMessage = opts.commitMessage
    || `[${agentRole.toUpperCase()}] Update task via verify-task.js`;

  const projectRoot = `Projects/${currentProject}`;
  const swarmRoot = `${projectRoot}/src/.swarm`;
  const echoRoot = `${swarmRoot}/echo-reviews`;

  log(`[Verify] Validating task for role: '${agentRole}' in project: '${currentProject}'`);

  // ── 1. Get changed files via Git ──

  let changedFiles = [];
  let repoRoot = '';
  try {
    repoRoot = getRepoRoot();
    const statusOut = gitExec(repoRoot, ['status', '--porcelain']);

    if (statusOut) {
      changedFiles = statusOut.split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => {
          // Git porcelain: XY filename  or  XY old -> new (on rename)
          const filePart = line.substring(3).trim();
          if (filePart.includes(' -> ')) return filePart.split(' -> ')[1].replace(/^"|"$/g, '');
          return filePart.replace(/^"|"$/g, '');
        })
        .filter(Boolean);
    }
  } catch (e) {
    throw new Error(`Critical error reading Git status: ${e.message}`);
  }

  if (changedFiles.length === 0) {
    log('⚠️ [Verify] No uncommitted changes found. Nothing to do.');
    return { status: 'success', action: 'none', logs };
  }

  // ── 2. STAGE 1: Hard Firewall Rules (Selective Revert) ──

  const violations = [];
  const badFiles = [];

  for (const file of changedFiles) {
    let isViolation = false;
    let reason = '';

    // Cross-project check — universal for all roles
    if (!file.startsWith(projectRoot)) {
      isViolation = true;
      reason = `[CROSS-PROJECT] Only files within ${projectRoot}/ are allowed.`;
    } else {
      const isSwarmFile = file.startsWith(swarmRoot);

      if (agentRole.includes('forge')) {
        // Forge may modify project code AND specific .swarm files
        if (isSwarmFile && !file.endsWith('/STATUS.md') && !file.endsWith('/FORGE.md')) {
          isViolation = true;
          reason = `[FORGE-RESTRICTION] Forge may only edit STATUS.md and FORGE.md within .swarm/.`;
        }
      }
      else if (agentRole.includes('buster') || agentRole.includes('test')) {
        // Buster may modify ANYTHING within .swarm/ (status.json, test results, BUSTER.md, etc.)
        // But NO application code outside of .swarm/
        if (!isSwarmFile) {
          isViolation = true;
          reason = `[BUSTER-RESTRICTION] Buster must not modify application code. Only files within ${swarmRoot}/ are allowed.`;
        }
      }
      else if (agentRole.includes('echo') || agentRole.includes('review')) {
        // Echo may only modify echo-reviews/
        if (!file.startsWith(echoRoot)) {
          isViolation = true;
          reason = `[ECHO-RESTRICTION] Echo may only operate within the ${echoRoot}/ directory.`;
        }
      }
    }

    if (isViolation) {
      violations.push(`${file} -> ${reason}`);
      badFiles.push(file);
    }
  }

  // Selective revert of forbidden files
  if (badFiles.length > 0) {
    log('⚠️ STAGE 1 WARNING: OUT OF SCOPE MODIFICATIONS DETECTED.');
    violations.forEach(v => log(`  - ${v}`));
    log('[Verify] Cleaning up forbidden changes...');

    for (const file of badFiles) {
      try {
        const absPath = path.join(repoRoot, file);
        // Attempt 1: Git checkout (for tracked files)
        try {
          gitExec(repoRoot, ['checkout', 'HEAD', '--', file], { stdio: 'ignore' });
        } catch {
          // Attempt 2: Delete file (for untracked files)
          if (fs.existsSync(absPath)) {
            fs.rmSync(absPath, { force: true, recursive: true });
          }
        }
        log(`  -> ⏪ Reverted/Deleted: ${file}`);
      } catch (e) {
        log(`  -> ❌ Could not clean up ${file}: ${e.message}`);
      }
    }
  } else {
    log('✅ [Verify] Stage 1 Passed (Scope Check).');
  }

  // ── 3. Scoped Git Add + Commit + Push ──

  log('✅ [Verify] All conditions met. Running commit and push...');
  try {
    const remainingChanges = gitExec(repoRoot, ['status', '--porcelain']);
    if (!remainingChanges) {
      log('⚠️ [Verify] No changes remaining after cleanup. Nothing to push.');
      return { status: 'success', action: 'reverted_all_bad_files', logs };
    }

    const currentBranch = getCurrentBranch(repoRoot);
    log(`[Verify] Current branch: ${currentBranch}`);

    // Scoped add — only the project directory, not the entire repo
    gitExec(repoRoot, ['add', projectRoot], { stdio: 'ignore' });
    gitExec(repoRoot, ['commit', '-m', commitMessage], { stdio: 'ignore' });

    // Push with rebase-before-each-attempt strategy (via shared utility).
    const gitLogger = { warn: (_, msg) => log(`⚠️ [Verify] ${msg}`), info: (_, msg) => log(msg) };
    const { hash: commitHash } = await gitPushWithRetry(repoRoot, currentBranch, { logger: gitLogger });

    log(`✅ [Verify] Push successful! (${commitHash})`);
    return {
      status: 'success',
      action: 'pushed',
      files_pushed: remainingChanges.split('\n').filter(l => l.trim()).length,
      commit_hash: commitHash,
      logs,
    };
  } catch (gitErr) {
    throw new Error(`Error during Git push (conflicts?): ${gitErr.message}`);
  }
}

// ─── CLI Wrapper ────────────────────────────────────────────────────────────

const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = (process.argv[1] && fs.existsSync(process.argv[1]))
  ? fs.realpathSync(process.argv[1])
  : process.argv[1];

if (currentPath === entryPath) {
  const args = process.argv.slice(2);

  const getArg = (name) => {
    const i = args.indexOf(`--${name}`);
    return i > -1 && args[i + 1] ? args[i + 1] : null;
  };
  const hasFlag = (name) => args.includes(`--${name}`);

  const agentRole = (getArg('role') || process.env.AGENT_ROLE || process.env.AGENT_NAME || 'unknown').toLowerCase();
  const currentProject = getArg('project') || process.env.CURRENT_PROJECT;
  const commitMessage = getArg('message');

  if (!currentProject) {
    console.log(JSON.stringify({ status: 'error', error: 'No project defined. Use --project <name>.' }));
    process.exit(1);
  }

  verifyAndPush(agentRole, currentProject, { commitMessage }).then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }).catch(err => {
    console.log(JSON.stringify({ status: 'error', error: err.message }));
    process.exit(1);
  });
}

export default verifyAndPush;
