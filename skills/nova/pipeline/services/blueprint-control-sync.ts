import fs from 'fs';
import path from 'path';
import { STATUS } from '../core/constants.ts';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import {
  gateInstructionsPathRef,
  gateInstructionsTopLevelRef,
  modulePath,
  relPath,
  swarmRoot,
} from '../core/paths.ts';
import { discord } from '../integrations/discord.ts';
import { gitExec } from '../integrations/git-worktree.ts';
import { getPipelineArtifactBundle } from './artifact-bundle.ts';
import { projectModuleSchedulerState } from './status-store.ts';

type AnyRecord = Record<string, any>;
type SyncedControlFile = { path: string; action: 'created' | 'updated' };

function record(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readRemoteControlFile(context: AnyRecord, archPath: string): string | null {
  try {
    gitExec(context.config.repo_root, ['cat-file', '-e', `${context.branchRef}:${archPath}`], { stdio: 'ignore' });
  } catch (_error: unknown) {
    /* INTENTIONAL_NONCRITICAL(optional_probe_failed): absence means the architecture branch does not declare this optional control file. */
    return null;
  }
  try {
    return gitExec(context.config.repo_root, ['show', `${context.branchRef}:${archPath}`]);
  } catch (error: unknown) {
    log('WARN', `[blueprint-sync] could not read declared architecture control file ${archPath}: ${errorMessage(error)}`);
    return null;
  }
}

function localControlFile(config: AnyRecord, archPath: string): string | null {
  try {
    return fs.readFileSync(path.join(config.repo_root, archPath), 'utf8');
  } catch (error: unknown) {
    if ((error as AnyRecord)?.code !== 'ENOENT') {
      log('DEBUG', `[blueprint-sync] could not read local ${archPath}: ${errorMessage(error)}`);
    }
    return null;
  }
}

function syncOneControlFile(context: AnyRecord, archPath: string) {
  const remoteContent = readRemoteControlFile(context, archPath);
  if (remoteContent === null) return;
  const localContent = localControlFile(context.config, archPath);
  if (localContent !== null && localContent.trim() === remoteContent.trim()) return;
  try {
    gitExec(context.config.repo_root, ['checkout', context.branchRef, '--', archPath], { stdio: 'ignore' });
    const action = localContent === null ? 'created' : 'updated';
    context.synced.push({ path: archPath, action });
    log('OK', `[blueprint-sync] ${action}: ${archPath}`);
  } catch (error: unknown) {
    context.degraded.push(context.buildDegraded(
      'blueprint_control_checkout_failed',
      'sync_control_files',
      error,
      { path: archPath },
    ));
    log('WARN', `[blueprint-sync] checkout failed for ${archPath}: ${errorMessage(error)}`);
  }
}

function syncModuleControlFiles(context: AnyRecord) {
  const modules = record(context.progress?.modules);
  for (const [moduleId, module] of Object.entries(modules) as [string, AnyRecord][]) {
    const status = projectModuleSchedulerState(context.config, moduleId, module);
    if (!status) continue;
    if (status.status === STATUS.PENDING) continue;
    const moduleRel = relPath(context.config, modulePath(context.config, module.dir));
    for (const file of context.policy.include.moduleControlFiles) {
      syncOneControlFile(context, `${moduleRel}/${file}`);
    }
    if (!Array.isArray(module.substeps)) continue;
    for (const stepId of module.substeps) {
      syncOneControlFile(context, `${moduleRel}/${stepId}/FORGE.md`);
    }
  }
}

function syncGateControlFiles(context: AnyRecord) {
  const processed = new Set<string>();
  for (const gate of Object.values(record(context.progress?.gates)) as AnyRecord[]) {
    if (!gate.instructions_file) continue;
    const instructionPath = gateInstructionsPathRef(context.config, gate);
    if (!instructionPath) throw new Error('Gate instructions path could not be resolved');
    syncOneControlFile(context, instructionPath);
    const gateDir = gateInstructionsTopLevelRef(context.config, gate);
    if (!gateDir) throw new Error('Gate instructions directory could not be resolved');
    if (processed.has(gateDir)) continue;
    processed.add(gateDir);
    const extraFiles = context.policy.include.gateControlFilesByDir[gateDir] ?? [];
    for (const file of extraFiles) {
      syncOneControlFile(context, `${context.swarmRel}/${gateDir}/${file}`);
    }
  }
}

async function persistSyncOutcome(context: AnyRecord) {
  if (context.synced.length === 0) {
    log('DEBUG', '[blueprint-sync] All control files up to date — no changes');
  } else {
    try {
      context.commitSelectedPaths(
        context.config,
        `[blueprint-sync] Sync ${context.synced.length} control file(s) from architecture`,
        context.synced.map((file: SyncedControlFile) => file.path),
      );
    } catch (error: unknown) {
      context.degraded.push(context.buildDegraded(
        'blueprint_control_commit_failed',
        'sync_control_files',
        error,
        { path: context.synced.map((file: SyncedControlFile) => file.path).join(',') },
      ));
      log('WARN', `[blueprint-sync] commit/push failed (non-critical): ${errorMessage(error)}`);
    }
    await discord(
      context.config,
      'INFO',
      'Blueprint Sync',
      `${context.synced.length} control file(s) updated from architecture branch`,
      [
        ...(getRunId(context.config) ? [{ name: 'Run ID', value: getRunId(context.config), inline: true }] : []),
        {
          name: 'Files',
          value: context.synced.map((file: SyncedControlFile) => `${file.action} ${file.path.split('/').pop()}`).join(', ').slice(0, 200),
        },
      ],
    );
  }
  const artifacts = getPipelineArtifactBundle(context.config);
  const outputDir = artifacts.run_log_dir ?? artifacts.pipeline_dir;
  if (!outputDir) return;
  try {
    fs.writeFileSync(
      path.join(outputDir, 'blueprint-sync.json'),
      JSON.stringify({ ts: new Date().toISOString(), synced: context.synced.length, files: context.synced }, null, 2),
    );
  } catch (error: unknown) {
    log('DEBUG', `[blueprint-sync] failed to write sync summary: ${errorMessage(error)}`);
  }
}

export async function syncControlFilesImplementation(
  config: AnyRecord,
  progress: AnyRecord,
  dependencies: AnyRecord,
) {
  const branch = `${config.project}/architecture`;
  let branchRef: string;
  try {
    branchRef = dependencies.ensureRemoteBranchRef(config, branch, 'control file sync');
  } catch (error: unknown) {
    log('WARN', `syncControlFiles: could not fetch architecture branch — skipping without local-cache fallback: ${errorMessage(error)}`);
    return {
      synced: 0,
      files: [],
      degraded: [dependencies.buildDegraded('blueprint_control_fetch_failed', 'sync_control_files', error)],
    };
  }
  const context = {
    config,
    progress,
    branchRef,
    swarmRel: relPath(config, swarmRoot(config)),
    synced: [] as SyncedControlFile[],
    degraded: [] as AnyRecord[],
    ...dependencies,
  };
  syncModuleControlFiles(context);
  syncGateControlFiles(context);
  await persistSyncOutcome(context);
  return { synced: context.synced.length, files: context.synced, degraded: context.degraded };
}
