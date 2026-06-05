// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { spawnSync } from 'child_process';
import { log } from '../core/logger.ts';
import { loadStatus } from './status-store.ts';
import { STATUS } from '../core/constants.ts';
import { getRunId } from '../core/runtime.ts';
import { gateInstructionsPathRef, gateInstructionsTopLevelRef, modulePath, relPath, reviewGateOutputDirRef, swarmRoot } from '../core/paths.ts';
import { discord } from '../integrations/discord.ts';
import { gitExec } from '../integrations/git-worktree.ts';
import { buildSubprocessEnv } from '../security.ts';
import { getPipelineArtifactBundle } from './artifact-bundle.ts';

type AnyRecord = Record<string, any>;
type BlueprintDegradedEvidence = { code: string; surface: string; message: string; path?: string | null };
type SyncedControlFile = { path: string; action: 'created' | 'updated' };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildBlueprintDegradedEvidence(code: string, surface: string, error: unknown, extra: AnyRecord = {}): BlueprintDegradedEvidence {
  return { code, surface, message: errorMessage(error), ...extra };
}

const BLUEPRINT_POLICY = Object.freeze({
  include: Object.freeze({
    moduleControlFiles: ['FORGE.md', 'BUSTER.md', 'ECHO.md', 'test-spec.json'],
    gateControlFilesByDir: Object.freeze({
      'buster-test': ['FINAL-BUSTER.md', 'final-test-spec.json'],
    }),
  }),
});

function nothingToCommit(text = ''): boolean {
  return /nothing to commit|nothing added to commit/i.test(text);
}

function gitSpawnSync(repoRoot: string, args: string[], opts: AnyRecord = {}) {
  return spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: buildSubprocessEnv(),
    ...opts,
  });
}

function getConflictFiles(repoRoot: string): string[] {
  const result = gitSpawnSync(repoRoot, ['diff', '--name-only', '--diff-filter=U']);
  return (result.stdout || '').split('\n').map((line: string) => line.trim()).filter(Boolean);
}

function buildBlueprintDiscordFields(identity: AnyRecord = {}, extra: AnyRecord[] = []) {
  return [...(identity.run_id ? [{ name: 'Run ID', value: identity.run_id, inline: true }] : []), ...extra];
}

function pushWithRecovery(config: AnyRecord, branch: string) {
  const repoRoot = config.repo_root;
  const pushResult = gitSpawnSync(repoRoot, ['push', '--force-with-lease', 'origin', branch]);
  if (pushResult.status === 0) return;

  const errText = `${pushResult.stderr || ''}\n${pushResult.stdout || ''}`;
  if (/CONFLICT|rebase conflict/i.test(errText)) {
    const conflictFiles = getConflictFiles(repoRoot);
    throw new Error(`Git rebase conflict detected before push. Involved files: ${conflictFiles.join(', ')}`);
  }
  throw new Error(errText.trim() || 'git push failed');
}

function normalizeGitPath(filePath: unknown): string {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function pathMatchesSelection(filePath: string, selectedPaths: string[]): boolean {
  const normalizedFile = normalizeGitPath(filePath);
  return selectedPaths.some((selectedPath: string) => {
    const normalizedSelected = normalizeGitPath(selectedPath);
    return normalizedFile === normalizedSelected || normalizedFile.startsWith(`${normalizedSelected}/`);
  });
}

function commitSelectedPaths(config: AnyRecord, message: string, addPaths: string[]) {
  const repoRoot = config.repo_root;
  const addResult = gitSpawnSync(repoRoot, ['add', ...addPaths]);
  if (addResult.status !== 0) throw new Error(`${addResult.stderr || addResult.stdout || 'git add failed'}`.trim());

  const staged = gitSpawnSync(repoRoot, ['diff', '--cached', '--name-only']);
  const stagedPaths = (staged.stdout || '').split('\n').map((line: string) => line.trim()).filter(Boolean);
  if (stagedPaths.length === 0) return { committed: false };

  const unrelatedStagedPaths = stagedPaths.filter((stagedPath: string) => !pathMatchesSelection(stagedPath, addPaths));
  if (unrelatedStagedPaths.length > 0) {
    throw new Error(
      `Blueprint commit requires staged paths to match selected paths only; ` +
      `unrelated staged paths present: ${unrelatedStagedPaths.join(', ')}`
    );
  }

  const commitResult = gitSpawnSync(repoRoot, ['commit', '-m', message, '--', ...addPaths]);
  const commitText = `${commitResult.stderr || ''}\n${commitResult.stdout || ''}`;
  if (commitResult.status !== 0) {
    if (nothingToCommit(commitText)) return { committed: false, skipped: true, reason: 'already_committed' };
    throw new Error(commitText.trim() || 'git commit failed');
  }

  const branch = gitSpawnSync(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  const pullResult = gitSpawnSync(repoRoot, ['pull', '--rebase', 'origin', branch]);
  if (pullResult.status !== 0) {
    const pullText = `${pullResult.stderr || ''}\n${pullResult.stdout || ''}`;
    if (/CONFLICT|rebase conflict/i.test(pullText)) {
      const conflictFiles = getConflictFiles(repoRoot);
      throw new Error(`Git rebase conflict detected before push. Involved files: ${conflictFiles.join(', ')}`);
    } else {
      throw new Error(pullText.trim() || 'git pull --rebase failed');
    }
  }
  pushWithRecovery(config, branch);
  return { committed: true };
}

export function listBlueprints(config: AnyRecord) {
  const branch = `${config.project}/architecture`;
  const dir = relPath(config, config.paths.modules_dir);
  try { gitExec(config.repo_root, ['fetch', 'origin', branch], { stdio: 'ignore' }); }
  catch (e) { throw new Error(`Cannot fetch architecture branch '${branch}' before listing blueprints: ${errorMessage(e)}`); }
  try {
    const out = gitExec(config.repo_root, ['ls-tree', '-d', '--name-only', `origin/${branch}`, `${dir}/`]);
    return out.split('\n').filter(Boolean).map((fileName: string) => path.basename(fileName));
  } catch (e) {
    throw new Error(`Cannot read architecture branch '${branch}': ${errorMessage(e)}`);
  }
}

export async function releaseBlueprint(config: AnyRecord, progress: AnyRecord, moduleId: string, moduleDir: string, stages: string[] = ['forge', 'buster']) {
  const branch = `${config.project}/architecture`;
  const targetPath = relPath(config, modulePath(config, moduleDir));
  const moduleConfig = progress.modules[moduleId] || {};

  log('STEP', `Releasing blueprint for ${moduleId} from ${branch}`);
  const existingStatus = loadStatus(config, moduleDir);
  if (existingStatus && existingStatus.status !== STATUS.PENDING) {
    log('WARN', `Module ${moduleId} already has status ${existingStatus.status} — skipping blueprint release`);
    return { status: 'skipped', reason: `existing status: ${existingStatus.status}`, module: moduleDir };
  }

  try { gitExec(config.repo_root, ['fetch', 'origin', branch], { stdio: 'ignore' }); }
  catch (e) { throw new Error(`Cannot fetch architecture branch '${branch}' before blueprint release: ${errorMessage(e)}`); }

  const requiredFiles = [];
  if (stages.includes('forge')) {
    if (moduleConfig.substeps && moduleConfig.substeps.length > 0) {
      for (const stepId of moduleConfig.substeps) requiredFiles.push(`${stepId}/FORGE.md`);
    } else {
      requiredFiles.push('FORGE.md');
    }
  }
  if (stages.includes('buster')) requiredFiles.push('BUSTER.md');

  for (const file of requiredFiles) {
    try { gitExec(config.repo_root, ['cat-file', '-e', `origin/${branch}:${targetPath}/${file}`], { stdio: 'ignore' }); }
    catch (e) { throw new Error(`Blueprint incomplete: ${file} not found for ${moduleId} in architecture branch at ${targetPath}: ${errorMessage(e)}`); }
  }

  try { gitExec(config.repo_root, ['checkout', `origin/${branch}`, '--', targetPath], { stdio: 'ignore' }); }
  catch (e) { throw new Error(`Blueprint checkout failed: ${errorMessage(e)}`); }

  const blueprintFilePath = targetPath;
  const statusResult = gitSpawnSync(config.repo_root, ['status', '--porcelain', blueprintFilePath]);
  const isDirty = (statusResult.stdout || '').trim().length > 0;
  if (!isDirty) {
    log('INFO', `Blueprint already released for module ${moduleId} — skipping commit`);
    return { status: 'success', action: 'no_changes', module: moduleDir, skipped: true, reason: 'already_committed' };
  }

  const result = commitSelectedPaths(config, `[blueprint] Release module ${moduleId} (${moduleDir})`, [targetPath]);
  if (result.committed) {
    log('OK', `Blueprint released and pushed: ${moduleDir}`);
    return { status: 'success', action: 'released', module: moduleDir };
  }
  log('INFO', `Blueprint already committed — treating as success`);
  return { status: 'success', action: 'no_changes', module: moduleDir, ...result };
}

export async function releaseGateFiles(config: AnyRecord, progress: AnyRecord) {
  const gates = progress.gates;
  if (!gates || Object.keys(gates).length === 0) return;
  const branch = `${config.project}/architecture`;

  try { gitExec(config.repo_root, ['fetch', 'origin', branch], { stdio: 'ignore' }); }
  catch (e) {
    const degraded = [buildBlueprintDegradedEvidence('blueprint_gate_fetch_failed', 'release_gate_files', e)];
    log('WARN', `Could not fetch origin/${branch} for gate files: ${errorMessage(e)}`);
    return { released: 0, degraded };
  }

  const gateDirRefs = new Set<string>();
  const swarmRelPath = relPath(config, swarmRoot(config));
  for (const gate of Object.values(gates) as AnyRecord[]) {
    if (gate.instructions_file) gateDirRefs.add(`${swarmRelPath}/${gateInstructionsTopLevelRef(config, gate)}`);
    const reviewOutputDir = reviewGateOutputDirRef(config, gate);
    if (reviewOutputDir) gateDirRefs.add(reviewOutputDir);
  }
  if (gateDirRefs.size === 0) return;

  const checkedOut: string[] = [];
  const checkedOutPaths: string[] = [];
  const degraded: BlueprintDegradedEvidence[] = [];
  for (const targetPath of gateDirRefs) {
    try { gitExec(config.repo_root, ['cat-file', '-e', `origin/${branch}:${targetPath}`], { stdio: 'ignore' }); }
    catch (e) { log('DEBUG', `Gate dir '${targetPath}' not found in architecture branch — skipping: ${errorMessage(e)}`); continue; }

    const localPath = path.join(config.repo_root, targetPath);
    if (fs.existsSync(localPath) && fs.readdirSync(localPath).length > 0) {
      log('DEBUG', `Gate dir '${targetPath}' already exists locally — skipping`);
      continue;
    }
    try {
      gitExec(config.repo_root, ['checkout', `origin/${branch}`, '--', targetPath], { stdio: 'ignore' });
      checkedOut.push(targetPath);
      checkedOutPaths.push(targetPath);
      log('OK', `Gate files released: ${targetPath}/`);
    } catch (e) {
      degraded.push(buildBlueprintDegradedEvidence('blueprint_gate_checkout_failed', 'release_gate_files', e, { path: targetPath }));
      log('WARN', `Failed to checkout gate dir '${targetPath}': ${errorMessage(e)}`);
    }
  }

  if (checkedOut.length > 0) {
    try {
      commitSelectedPaths(config, `[blueprint] Release gate files: ${checkedOut.join(', ')}`, checkedOutPaths);
      log('OK', `Gate files committed and pushed: ${checkedOut.join(', ')}`);
    } catch (e) {
      degraded.push(buildBlueprintDegradedEvidence('blueprint_gate_commit_failed', 'release_gate_files', e, { path: checkedOutPaths.join(',') }));
      log('WARN', `Gate files commit/push failed (non-critical): ${errorMessage(e)}`);
    }
  }

  return { released: checkedOut.length, files: checkedOutPaths, degraded };
}

export async function syncControlFiles(config: AnyRecord, progress: AnyRecord) {
  const branch = `${config.project}/architecture`;
  try { gitExec(config.repo_root, ['fetch', 'origin', branch], { stdio: 'ignore' }); }
  catch (e) {
    const degraded = [buildBlueprintDegradedEvidence('blueprint_control_fetch_failed', 'sync_control_files', e)];
    log('WARN', `syncControlFiles: could not fetch architecture branch — skipping without local-cache fallback: ${errorMessage(e)}`);
    return { synced: 0, files: [], degraded };
  }

  const swarmRel = relPath(config, swarmRoot(config));
  const synced: SyncedControlFile[] = [];
  const degraded: BlueprintDegradedEvidence[] = [];
  function syncFile(archPath: string) {
    try { gitExec(config.repo_root, ['cat-file', '-e', `origin/${branch}:${archPath}`], { stdio: 'ignore' }); }
    catch (e) { log('DEBUG', `[blueprint-sync] ${archPath} missing in architecture branch — skipping: ${errorMessage(e)}`); return; }

    let archContent;
    try { archContent = gitExec(config.repo_root, ['show', `origin/${branch}:${archPath}`]); } catch (e) { log('DEBUG', `[blueprint-sync] could not read ${archPath} from architecture branch: ${errorMessage(e)}`); return; }
    const localAbsPath = path.join(config.repo_root, archPath);
    let localContent = null;
    try { localContent = fs.readFileSync(localAbsPath, 'utf8'); } catch (e) { if ((e as AnyRecord)?.code !== 'ENOENT') log('DEBUG', `[blueprint-sync] could not read local ${archPath}: ${errorMessage(e)}`); }
    if (localContent !== null && localContent.trim() === archContent.trim()) return;
    try {
      gitExec(config.repo_root, ['checkout', `origin/${branch}`, '--', archPath], { stdio: 'ignore' });
      synced.push({ path: archPath, action: localContent === null ? 'created' : 'updated' });
      log('OK', `[blueprint-sync] ${localContent === null ? 'created' : 'updated'}: ${archPath}`);
    } catch (e) {
      degraded.push(buildBlueprintDegradedEvidence('blueprint_control_checkout_failed', 'sync_control_files', e, { path: archPath }));
      log('WARN', `[blueprint-sync] checkout failed for ${archPath}: ${errorMessage(e)}`);
    }
  }

  for (const [moduleId, mod] of Object.entries(progress.modules || {}) as [string, AnyRecord][]) {
    const status = loadStatus(config, mod.dir);
    if (!status || status.status === STATUS.PENDING) continue;
    const moduleRel = relPath(config, modulePath(config, mod.dir));
    for (const file of BLUEPRINT_POLICY.include.moduleControlFiles) syncFile(`${moduleRel}/${file}`);
    const moduleConfig = progress.modules[moduleId] || {};
    if (moduleConfig.substeps?.length) for (const stepId of moduleConfig.substeps) syncFile(`${moduleRel}/${stepId}/FORGE.md`);
  }

  const processedGateDirs = new Set<string>();
  for (const gate of Object.values(progress.gates || {}) as AnyRecord[]) {
    if (gate.instructions_file) {
      syncFile(gateInstructionsPathRef(config, gate));
      const gateDir = gateInstructionsTopLevelRef(config, gate);
      if (!processedGateDirs.has(gateDir)) {
        processedGateDirs.add(gateDir);
        const extraFiles = (BLUEPRINT_POLICY.include.gateControlFilesByDir as AnyRecord)[gateDir] || [];
        for (const file of extraFiles) syncFile(`${swarmRel}/${gateDir}/${file}`);
      }
    }
  }

  if (synced.length > 0) {
    try {
      commitSelectedPaths(config, `[blueprint-sync] Sync ${synced.length} control file(s) from architecture`, synced.map((file) => file.path));
    } catch (e) {
      degraded.push(buildBlueprintDegradedEvidence('blueprint_control_commit_failed', 'sync_control_files', e, { path: synced.map((file) => file.path).join(',') }));
      log('WARN', `[blueprint-sync] commit/push failed (non-critical): ${errorMessage(e)}`);
    }
    await discord(config, 'INFO', 'Blueprint Sync', `${synced.length} control file(s) updated from architecture branch`, [
      ...buildBlueprintDiscordFields({ run_id: getRunId(config) }),
      { name: 'Files', value: synced.map((file) => `${file.action} ${file.path.split('/').pop()}`).join(', ').slice(0, 200) },
    ]);
  } else {
    log('DEBUG', '[blueprint-sync] All control files up to date — no changes');
  }

  const artifacts = getPipelineArtifactBundle(config);
  if (artifacts.run_log_dir || artifacts.pipeline_dir) {
    try {
      fs.writeFileSync(path.join(artifacts.run_log_dir || artifacts.pipeline_dir, 'blueprint-sync.json'), JSON.stringify({ ts: new Date().toISOString(), synced: synced.length, files: synced }, null, 2));
    } catch (e) {
      log('DEBUG', `[blueprint-sync] failed to write sync summary: ${errorMessage(e)}`);
    }
  }

  return { synced: synced.length, files: synced, degraded };
}
