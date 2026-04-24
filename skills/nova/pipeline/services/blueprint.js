import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { log } from '../core/logger.js';
import { loadStatus } from './status-store.js';
import { STATUS } from '../core/constants.js';
import { getRunId } from '../core/runtime.js';
import { relPath, modulePath, swarmRoot } from '../core/paths.js';
import { discord } from '../integrations/discord.js';
import { gitExec } from '../integrations/git.js';

const BLUEPRINT_POLICY = Object.freeze({
  include: Object.freeze({
    moduleControlFiles: ['FORGE.md', 'BUSTER.md', 'ECHO.md', 'test-spec.json'],
    gateControlFilesByDir: Object.freeze({
      'buster-test': ['FINAL-BUSTER.md', 'final-test-spec.json'],
    }),
  }),
});

function nothingToCommit(text = '') {
  return /nothing to commit|nothing added to commit/i.test(text);
}

function getConflictFiles(repoRoot) {
  const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=U'], { cwd: repoRoot, encoding: 'utf8' });
  return (result.stdout || '').split('\n').map(s => s.trim()).filter(Boolean);
}

function buildBlueprintDiscordFields(identity = {}, extra = []) {
  const fields = [];
  if (identity.runId || identity.run_id) fields.push({ name: 'Run ID', value: identity.runId || identity.run_id, inline: true });
  return [...fields, ...extra];
}

function pushWithRecovery(config, branch) {
  const repoRoot = config.repo_root;
  const pushResult = spawnSync('git', ['push', '--force-with-lease', 'origin', branch], { cwd: repoRoot, encoding: 'utf8' });
  if (pushResult.status === 0) return;

  const errText = `${pushResult.stderr || ''}\n${pushResult.stdout || ''}`;
  if (/CONFLICT|rebase conflict/i.test(errText)) {
    const conflictFiles = getConflictFiles(repoRoot);
    const codeFileExtensions = /\.(js|ts|tsx|py|go|rs|json|yaml|yml|sh)$/;
    const swarmDir = '.swarm/';
    const hasCodeConflict = conflictFiles.some(f => !f.startsWith(swarmDir) && codeFileExtensions.test(f));
    if (!hasCodeConflict) {
      spawnSync('git', ['rebase', '--abort'], { cwd: repoRoot, encoding: 'utf8' });
      spawnSync('git', ['pull', '--rebase', 'origin', branch], { cwd: repoRoot, encoding: 'utf8' });
      const retryPush = spawnSync('git', ['push', 'origin', branch], { cwd: repoRoot, encoding: 'utf8' });
      if (retryPush.status === 0) {
        log('INFO', 'Auto-recovered from pipeline-file-only rebase conflict');
        return;
      }
    }
    throw new Error(`Git rebase conflict detected before push. Involved files: ${conflictFiles.join(', ')}`);
  }
  throw new Error(errText.trim() || 'git push failed');
}

function commitSelectedPaths(config, message, addPaths) {
  const repoRoot = config.repo_root;
  spawnSync('git', ['add', ...addPaths], { cwd: repoRoot, encoding: 'utf8' });
  const staged = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: repoRoot, encoding: 'utf8' });
  if (!(staged.stdout || '').trim()) return { committed: false };

  const commitResult = spawnSync('git', ['commit', '-m', message], { cwd: repoRoot, encoding: 'utf8' });
  const commitText = `${commitResult.stderr || ''}\n${commitResult.stdout || ''}`;
  if (commitResult.status !== 0) {
    if (nothingToCommit(commitText)) return { committed: false, skipped: true, reason: 'already_committed' };
    throw new Error(commitText.trim() || 'git commit failed');
  }

  const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim();
  const pullResult = spawnSync('git', ['pull', '--rebase', 'origin', branch], { cwd: repoRoot, encoding: 'utf8' });
  if (pullResult.status !== 0) {
    const pullText = `${pullResult.stderr || ''}\n${pullResult.stdout || ''}`;
    if (/CONFLICT|rebase conflict/i.test(pullText)) {
      const conflictFiles = getConflictFiles(repoRoot);
      const codeFileExtensions = /\.(js|ts|tsx|py|go|rs|json|yaml|yml|sh)$/;
      const swarmDir = '.swarm/';
      const hasCodeConflict = conflictFiles.some(f => !f.startsWith(swarmDir) && codeFileExtensions.test(f));
      if (!hasCodeConflict) {
        spawnSync('git', ['rebase', '--abort'], { cwd: repoRoot, encoding: 'utf8' });
        spawnSync('git', ['pull', '--rebase', 'origin', branch], { cwd: repoRoot, encoding: 'utf8' });
      } else {
        throw new Error(`Git rebase conflict detected before push. Involved files: ${conflictFiles.join(', ')}`);
      }
    } else {
      throw new Error(pullText.trim() || 'git pull --rebase failed');
    }
  }
  pushWithRecovery(config, branch);
  return { committed: true };
}

export function listBlueprints(config) {
  const branch = `${config.project}/architecture`;
  const dir = relPath(config, config.paths.modules_dir);
  try { gitExec(config.repo_root, ['fetch', 'origin', branch], { stdio: 'ignore' }); } catch {}
  try {
    const out = gitExec(config.repo_root, ['ls-tree', '-d', '--name-only', `origin/${branch}`, `${dir}/`]);
    return out.split('\n').filter(Boolean).map(f => path.basename(f));
  } catch (e) {
    throw new Error(`Cannot read architecture branch '${branch}': ${e.message}`);
  }
}

export async function releaseBlueprint(config, progress, moduleId, moduleDir, stages = ['forge', 'buster']) {
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
  catch { log('WARN', `Could not fetch origin/${branch}, using local cache`); }

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
    catch { throw new Error(`Blueprint incomplete: ${file} not found for ${moduleId} in architecture branch at ${targetPath}`); }
  }

  try { gitExec(config.repo_root, ['checkout', `origin/${branch}`, '--', targetPath], { stdio: 'ignore' }); }
  catch (e) { throw new Error(`Blueprint checkout failed: ${e.message}`); }

  const blueprintFilePath = targetPath;
  const statusResult = spawnSync('git', ['status', '--porcelain', blueprintFilePath], { cwd: config.repo_root, encoding: 'utf8' });
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

export async function releaseGateFiles(config, progress) {
  const gates = progress.gates;
  if (!gates || Object.keys(gates).length === 0) return;
  const branch = `${config.project}/architecture`;

  try { gitExec(config.repo_root, ['fetch', 'origin', branch], { stdio: 'ignore' }); }
  catch { log('WARN', `Could not fetch origin/${branch} for gate files`); return; }

  const gateDirs = new Set();
  for (const gate of Object.values(gates)) {
    if (gate.instructions_file) gateDirs.add(gate.instructions_file.split('/')[0]);
    if (gate.review_output_dir) gateDirs.add(gate.review_output_dir);
  }
  if (gateDirs.size === 0) return;

  const swarmRelPath = relPath(config, swarmRoot(config));
  const checkedOut = [];
  const checkedOutPaths = [];
  for (const dir of gateDirs) {
    const targetPath = `${swarmRelPath}/${dir}`;
    try { gitExec(config.repo_root, ['cat-file', '-e', `origin/${branch}:${targetPath}`], { stdio: 'ignore' }); }
    catch { log('DEBUG', `Gate dir '${dir}' not found in architecture branch — skipping`); continue; }

    const localPath = path.join(swarmRoot(config), dir);
    if (fs.existsSync(localPath) && fs.readdirSync(localPath).length > 0) {
      log('DEBUG', `Gate dir '${dir}' already exists locally — skipping`);
      continue;
    }
    try {
      gitExec(config.repo_root, ['checkout', `origin/${branch}`, '--', targetPath], { stdio: 'ignore' });
      checkedOut.push(dir);
      checkedOutPaths.push(targetPath);
      log('OK', `Gate files released: ${dir}/`);
    } catch (e) {
      log('WARN', `Failed to checkout gate dir '${dir}': ${e.message}`);
    }
  }

  if (checkedOut.length > 0) {
    try {
      commitSelectedPaths(config, `[blueprint] Release gate files: ${checkedOut.join(', ')}`, checkedOutPaths);
      log('OK', `Gate files committed and pushed: ${checkedOut.join(', ')}`);
    } catch (e) {
      log('WARN', `Gate files commit/push failed (non-critical): ${e.message}`);
    }
  }
}

export async function syncControlFiles(config, progress) {
  const branch = `${config.project}/architecture`;
  try { gitExec(config.repo_root, ['fetch', 'origin', branch], { stdio: 'ignore' }); }
  catch { log('DEBUG', 'syncControlFiles: could not fetch architecture branch — skipping'); return { synced: 0 }; }

  const swarmRel = relPath(config, swarmRoot(config));
  const synced = [];
  function syncFile(archPath) {
    try { gitExec(config.repo_root, ['cat-file', '-e', `origin/${branch}:${archPath}`], { stdio: 'ignore' }); }
    catch { return; }

    let archContent;
    try { archContent = gitExec(config.repo_root, ['show', `origin/${branch}:${archPath}`]); } catch { return; }
    const localAbsPath = path.join(config.repo_root, archPath);
    let localContent = null;
    try { localContent = fs.readFileSync(localAbsPath, 'utf8'); } catch {}
    if (localContent !== null && localContent.trim() === archContent.trim()) return;
    try {
      gitExec(config.repo_root, ['checkout', `origin/${branch}`, '--', archPath], { stdio: 'ignore' });
      synced.push({ path: archPath, action: localContent === null ? 'created' : 'updated' });
      log('OK', `[blueprint-sync] ${localContent === null ? 'created' : 'updated'}: ${archPath}`);
    } catch (e) {
      log('WARN', `[blueprint-sync] checkout failed for ${archPath}: ${e.message}`);
    }
  }

  for (const [moduleId, mod] of Object.entries(progress.modules || {})) {
    const status = loadStatus(config, mod.dir);
    if (!status || status.status === STATUS.PENDING) continue;
    const moduleRel = relPath(config, modulePath(config, mod.dir));
    for (const file of BLUEPRINT_POLICY.include.moduleControlFiles) syncFile(`${moduleRel}/${file}`);
    const moduleConfig = progress.modules[moduleId] || {};
    if (moduleConfig.substeps?.length) for (const stepId of moduleConfig.substeps) syncFile(`${moduleRel}/${stepId}/FORGE.md`);
  }

  const processedGateDirs = new Set();
  for (const gate of Object.values(progress.gates || {})) {
    if (gate.instructions_file) {
      syncFile(`${swarmRel}/${gate.instructions_file}`);
      const gateDir = gate.instructions_file.split('/')[0];
      if (!processedGateDirs.has(gateDir)) {
        processedGateDirs.add(gateDir);
        const extraFiles = BLUEPRINT_POLICY.include.gateControlFilesByDir[gateDir] || [];
        for (const file of extraFiles) syncFile(`${swarmRel}/${gateDir}/${file}`);
      }
    }
  }

  if (synced.length > 0) {
    try {
      commitSelectedPaths(config, `[blueprint-sync] Sync ${synced.length} control file(s) from architecture`, synced.map(s => s.path));
    } catch (e) {
      log('WARN', `[blueprint-sync] commit/push failed (non-critical): ${e.message}`);
    }
    await discord(config, 'INFO', 'Blueprint Sync', `${synced.length} control file(s) updated from architecture branch`, [
      ...buildBlueprintDiscordFields({ run_id: getRunId(config) }),
      { name: 'Files', value: synced.map(s => `${s.action} ${s.path.split('/').pop()}`).join(', ').slice(0, 200) },
    ]);
  } else {
    log('DEBUG', '[blueprint-sync] All control files up to date — no changes');
  }

  if (config._runLogDir || config._logDir) {
    try {
      const logDir = config._runLogDir || path.join(config._logDir, 'pipeline');
      fs.writeFileSync(path.join(logDir, 'blueprint-sync.json'), JSON.stringify({ ts: new Date().toISOString(), synced: synced.length, files: synced }, null, 2));
    } catch {}
  }

  return { synced: synced.length, files: synced };
}
