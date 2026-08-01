import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
// ═══════════════════════════════════════════════════════════════
// Buster Git Workflows — repo synchronization and push policy
// ═══════════════════════════════════════════════════════════════
//
// Buster-specific Git workflows built on shared Git primitives.
// Destructive sync/push policy remains Buster-owned.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getRepoRoot, gitExec, getCurrentBranch } from '../git-primitives.js';
import { sleep } from '../timing.js';
import { isRuntimeStatePath } from '../runtime-state-paths.js';
import { busterEnvironmentSnapshot } from '../buster-environment.js';
import { ensureGitIdentity, hasScopedStagedChanges } from './git-identity.js';
import { logGit } from './git-workflow-contracts.js';
import { normalizeNonNegativeNumber, normalizePositiveInteger, normalizePushBranch, normalizeScopedAddPaths } from './git-push-policy.js';
export { getRepoRoot, gitExec, getCurrentBranch };
function firstLine(error) {
    const detail = error instanceof Error && error.message ? error.message : String(error || 'missing_error_detail');
    return detail.split('\n').at(0) || 'missing_error_detail';
}
function normalizeGitTargetHash(expectedHash) {
    if (typeof expectedHash !== 'string')
        return null;
    const trimmed = expectedHash.trim();
    return trimmed ? trimmed : null;
}
function gitHashMatchesTarget(actualHash, targetHash) {
    const normalizedActual = actualHash.toLowerCase();
    const normalizedTarget = targetHash.toLowerCase();
    return selectTruthyValue(() => (normalizedActual === normalizedTarget), () => ((/^[0-9a-f]+$/i.test(targetHash) && normalizedActual.startsWith(normalizedTarget))));
}
function trackedRuntimeStatePaths(repoRoot) {
    const output = gitExec(repoRoot, ['ls-files', '-z', '--cached', '--modified', '--others', '--exclude-standard']);
    return [...new Set(output
            .split('\0')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .filter((entry) => isRuntimeStatePath(entry))
            .filter((entry) => fs.existsSync(path.join(repoRoot, entry))))];
}
function preserveRuntimeState(repoRoot) {
    const paths = trackedRuntimeStatePaths(repoRoot);
    if (paths.length === 0)
        return null;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-runtime-state-'));
    for (const relPath of paths) {
        const source = path.join(repoRoot, relPath);
        const target = path.join(root, relPath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
    }
    return { root, paths };
}
function restoreRuntimeState(repoRoot, snapshot) {
    if (!snapshot)
        return;
    try {
        for (const relPath of snapshot.paths) {
            const source = path.join(snapshot.root, relPath);
            const target = path.join(repoRoot, relPath);
            if (!fs.existsSync(source))
                continue;
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(source, target);
        }
    }
    finally {
        fs.rmSync(snapshot.root, { recursive: true, force: true });
    }
}
// ─── gitSync ─────────────────────────────────────────────────────────────────
/**
 * Sync the repo to a deterministic task commit: fetch + reset-hard.
 *
 * DELETE_LEGACY: task repo sync must be tied to an explicit typed commit
 * identity; branch-derived sync is not accepted.
 *
 * STRICTIFY_TS_SLICE: Git failures stay nonthrowing for task lifecycle cleanup,
 * but return typed failure metadata instead of a magic null sentinel.
 */
export async function gitSync(repoRoot, expectedHash, opts = {}) {
    const logger = opts.logger ? opts.logger : null;
    const targetHash = normalizeGitTargetHash(expectedHash);
    if (!targetHash) {
        const detail = 'gitSync requires explicit expectedHash; branch-derived sync is deleted';
        logGit(logger, 'warn', detail);
        return {
            ok: false,
            target_hash: null,
            actual_hash: null,
            error: 'missing_target_hash',
            detail,
        };
    }
    let runtimeState = null;
    try {
        runtimeState = preserveRuntimeState(repoRoot);
        gitExec(repoRoot, ['fetch', 'origin'], { stdio: 'ignore', timeout: 30000 });
        logGit(logger, 'info', 'Fetched from origin');
        gitExec(repoRoot, ['reset', '--hard', targetHash], { stdio: 'ignore' });
        restoreRuntimeState(repoRoot, runtimeState);
        runtimeState = null;
        logGit(logger, 'info', `Reset to expected hash: ${targetHash}`);
        const actualHash = gitExec(repoRoot, ['rev-parse', 'HEAD']);
        if (!gitHashMatchesTarget(actualHash, targetHash)) {
            throw new Error(`gitSync HEAD mismatch: expected ${targetHash}, got ${actualHash}`);
        }
        logGit(logger, 'info', `Git sync complete: ${actualHash}`);
        return {
            ok: true,
            target_hash: targetHash,
            actual_hash: actualHash,
            error: null,
            detail: null,
        };
    }
    catch (error) {
        restoreRuntimeState(repoRoot, runtimeState);
        const detail = firstLine(error);
        logGit(logger, 'warn', `Git sync failed: ${detail}`);
        return {
            ok: false,
            target_hash: targetHash,
            actual_hash: null,
            error: 'git_sync_failed',
            detail,
        };
    }
}
// ─── gitPushWithRetry ────────────────────────────────────────────────────────
function normalizeRepoRelativePath(value) {
    return String(selectDefinedValue(() => (value), () => ('')))
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/^(?:\.\/)+/, '')
        .trim();
}
function pathMatchesScopedPathspec(filePath, pathspecs = []) {
    const normalizedFilePath = normalizeRepoRelativePath(filePath);
    if (!normalizedFilePath)
        return false;
    return pathspecs.some((pathspec) => selectTruthyValue(() => (normalizedFilePath === pathspec), () => (normalizedFilePath.startsWith(`${pathspec}/`))));
}
function isRebaseInProgress(repoRoot) {
    try {
        const rebaseMergePath = gitExec(repoRoot, ['rev-parse', '--git-path', 'rebase-merge']);
        const rebaseApplyPath = gitExec(repoRoot, ['rev-parse', '--git-path', 'rebase-apply']);
        if (fs.existsSync(rebaseMergePath))
            return true;
        return fs.existsSync(rebaseApplyPath);
    }
    catch (_error) {
        return false;
    }
}
function getConflictedPaths(repoRoot) {
    try {
        return gitExec(repoRoot, ['diff', '--name-only', '--diff-filter=U'])
            .split('\n')
            .map((line) => normalizeRepoRelativePath(line))
            .filter(Boolean);
    }
    catch (_error) {
        return [];
    }
}
function tryAutoResolveRebaseForScopedPaths(repoRoot, addPaths, logger) {
    const conflicts = getConflictedPaths(repoRoot);
    if (conflicts.length === 0)
        return false;
    if (conflicts.some((file) => !pathMatchesScopedPathspec(file, addPaths))) {
        const nonScoped = conflicts.filter((file) => !pathMatchesScopedPathspec(file, addPaths));
        logGit(logger, 'warn', `Scoped Buster rebase has out-of-scope conflicts: ${nonScoped.join(', ')}`);
        return false;
    }
    logGit(logger, 'warn', `Auto-resolving ${conflicts.length} scoped Buster rebase conflict(s) in favor of local task output`);
    while (true) {
        const activeConflicts = getConflictedPaths(repoRoot);
        if (activeConflicts.length === 0)
            break;
        if (activeConflicts.some((file) => !pathMatchesScopedPathspec(file, addPaths)))
            return false;
        for (const file of activeConflicts) {
            gitExec(repoRoot, ['checkout', '--theirs', '--', file], { stdio: 'ignore' });
            gitExec(repoRoot, ['add', '--', file], { stdio: 'ignore' });
        }
        try {
            gitExec(repoRoot, ['rebase', '--continue'], {
                stdio: 'ignore',
                env: {
                    ...busterEnvironmentSnapshot(),
                    GIT_EDITOR: 'true',
                },
            });
        }
        catch (error) {
            if (!isRebaseInProgress(repoRoot))
                break;
            const stillConflicted = getConflictedPaths(repoRoot);
            if (stillConflicted.length === 0)
                return false;
            if (stillConflicted.some((file) => !pathMatchesScopedPathspec(file, addPaths)))
                return false;
        }
        if (!isRebaseInProgress(repoRoot))
            break;
    }
    logGit(logger, 'info', 'Scoped Buster rebase auto-resolved');
    return true;
}
function rebuildScopedCommitOnOrigin(repoRoot, branch, addPaths, commitMessage, logger) {
    try {
        gitExec(repoRoot, ['rebase', '--abort'], { stdio: 'ignore' });
    }
    catch (_error) { /* INTENTIONAL_NONCRITICAL(best_effort_cleanup_failed): cleanup is idempotent or a primary failure remains authoritative. */ /* best-effort abort */ }
    gitExec(repoRoot, ['fetch', 'origin'], { stdio: 'ignore', timeout: 30000 });
    gitExec(repoRoot, ['reset', '--soft', `origin/${branch}`], { stdio: 'ignore' });
    gitExec(repoRoot, ['reset'], { stdio: 'ignore' });
    gitExec(repoRoot, ['add', '--', ...addPaths]);
    if (!hasScopedStagedChanges(repoRoot, addPaths)) {
        logGit(logger, 'info', 'Scoped Buster output already matches origin after rebase rebuild');
        return false;
    }
    gitExec(repoRoot, ['commit', '-m', commitMessage]);
    logGit(logger, 'info', 'Rebuilt scoped Buster artifact commit on current origin');
    return true;
}
function prepareScopedCommit(repoRoot, options, logger) {
    if (!options.commitMessage)
        return null;
    const addPaths = normalizeScopedAddPaths(options.addPaths);
    ensureGitIdentity(repoRoot, logger);
    gitExec(repoRoot, ['add', '--', ...addPaths]);
    if (!hasScopedStagedChanges(repoRoot, addPaths))
        return { pushed: false, hash: gitExec(repoRoot, ['rev-parse', '--short', 'HEAD']) };
    gitExec(repoRoot, ['commit', '-m', options.commitMessage]);
    return null;
}
async function recoverRebase(error, context) {
    const { repoRoot, branch, attempt, maxAttempts, retryDelayMs, options, logger } = context;
    const detail = firstLine(error);
    logGit(logger, 'warn', `Rebase attempt ${attempt}/${maxAttempts}: ${detail}`);
    const addPaths = options.commitMessage ? normalizeScopedAddPaths(options.addPaths) : [];
    if (tryAutoResolveRebaseForScopedPaths(repoRoot, addPaths, logger))
        return 'push';
    if (options.commitMessage) {
        const rebuilt = rebuildScopedCommitOnOrigin(repoRoot, branch, addPaths, options.commitMessage, logger);
        return rebuilt ? 'push' : { pushed: false, hash: gitExec(repoRoot, ['rev-parse', '--short', 'HEAD']) };
    }
    try {
        gitExec(repoRoot, ['rebase', '--abort'], { stdio: 'ignore' });
    }
    catch (_error) { /* INTENTIONAL_NONCRITICAL(best_effort_cleanup_failed): cleanup is idempotent or a primary failure remains authoritative. */ }
    if (attempt >= maxAttempts)
        throw new Error(`gitPushWithRetry rebase failed after ${maxAttempts} attempt(s): ${detail}`);
    await sleep(retryDelayMs * Math.pow(2, attempt - 1), { budget: options.budget || null, signal: options.signal || null });
    return 'retry';
}
/**
 * Push to origin with rebase-before-push strategy and bounded retry.
 *
 * If opts.commitMessage is provided, opts.addPaths must contain explicit
 * pathspecs. Commit mode performs `git add -- <addPaths...>` + `git commit`
 * before pushing. Each attempt: pull --rebase → push. On rebase failure with
 * attempts remaining, aborts and retries with exponential backoff.
 *
 * STRICTIFY_TS_SLICE: after the final rebase failure, fail closed. Do not push
 * over unresolved upstream/rebase state.
 */
export async function gitPushWithRetry(repoRoot, branch, opts = {}) {
    const pushBranch = normalizePushBranch(branch);
    const maxAttempts = normalizePositiveInteger(opts.maxAttempts, 'opts.maxAttempts');
    const retryDelayMs = normalizeNonNegativeNumber(opts.retryDelayMs, 'opts.retryDelayMs');
    const budget = selectTruthyValue(() => (opts.budget), () => (null));
    const signal = selectTruthyValue(() => (opts.signal), () => (null));
    const logger = opts.logger ? opts.logger : null;
    const commitResult = prepareScopedCommit(repoRoot, opts, logger);
    if (commitResult)
        return commitResult;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            gitExec(repoRoot, ['pull', '--rebase', '--autostash', 'origin', pushBranch], { stdio: 'ignore', timeout: 30000 });
        }
        catch (rebaseErr) {
            const recovery = await recoverRebase(rebaseErr, { repoRoot, branch: pushBranch, attempt, maxAttempts, retryDelayMs, options: opts, logger });
            if (recovery === 'retry')
                continue;
            if (recovery !== 'push')
                return recovery;
        }
        try {
            gitExec(repoRoot, ['push', 'origin', `HEAD:${pushBranch}`], { stdio: 'ignore', timeout: 60000 });
            const hash = gitExec(repoRoot, ['rev-parse', '--short', 'HEAD']);
            return { pushed: true, hash };
        }
        catch (error) {
            if (attempt === maxAttempts)
                throw error;
            logGit(logger, 'warn', `Push attempt ${attempt}/${maxAttempts} failed: ${firstLine(error)}`);
            await sleep(retryDelayMs * Math.pow(2, attempt - 1), { budget: budget || null, signal: signal || null });
        }
    }
    throw new Error('gitPushWithRetry exhausted without terminal push result');
}
