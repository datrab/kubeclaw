import fs from "fs";
import path from "path";
import {
  ensureProjectLogDir,
  ensurePipelineRunLogDir,
  pipelineLogDir,
} from "../core/paths.ts";
import { log, initContextLogging } from "../core/logger.ts";
import { buildLatestPointer } from "./artifact-bundle.ts";
import {
  resetLifecycleStore,
  getLifecycleModuleState,
  loadLifecycleReadModels,
} from "./status-store-lifecycle.ts";
import { projectModuleRuntimeState } from "./status-store-read-models.ts";
import { selectDefinedValue, selectTruthyValue } from "../optional-absence.ts";
import { objectRecord } from "./status-store-guard.ts";

function requiredPath(value: string | null, label: string): string {
  if (value) return value;
  throw new Error(`Missing required ${label} path`);
}

export function initLogDir(config: any, ctx: any, opts: any = {}) {
  const logDir = requiredPath(ensureProjectLogDir(config), "project log");
  const pipelineDir = requiredPath(pipelineLogDir(config), "pipeline log");
  fs.mkdirSync(pipelineDir, { recursive: true });
  fs.mkdirSync(path.join(logDir, "modules"), { recursive: true });
  fs.mkdirSync(path.join(logDir, "gates"), { recursive: true });
  const runLogDir = requiredPath(
    ensurePipelineRunLogDir(config),
    "pipeline run log",
  );
  if (ctx && typeof ctx.setLogDirs === "function") {
    ctx.setLogDirs({ logDir, runLogDir });
  } else if (ctx) {
    ctx.logDir = logDir;
    ctx.runLogDir = runLogDir;
  }

  const pipelineLogFd = fs.createWriteStream(
    path.join(pipelineDir, "pipeline.jsonl"),
    { flags: "a" },
  );
  const runPipelineLogFd = fs.createWriteStream(
    path.join(runLogDir, "pipeline.jsonl"),
    { flags: "a" },
  );
  config._pipelineLogFd = pipelineLogFd;
  config._runPipelineLogFd = runPipelineLogFd;
  if (ctx && typeof ctx.setPipelineLogStreams === "function") {
    ctx.setPipelineLogStreams({ pipelineLogFd, runPipelineLogFd });
  }

  fs.writeFileSync(
    path.join(pipelineDir, "latest.json"),
    JSON.stringify(
      buildLatestPointer(config, {
        status: "running",
        startedAt: new Date().toISOString(),
        completedAt: null,
        terminalStatus: null,
      }),
      null,
      2,
    ),
  );

  if (opts.resume !== true && config?._resume !== true) {
    resetLifecycleStore(config);
  }
  initContextLogging(ctx, pipelineLogFd, runPipelineLogFd);
  log("INFO", `Log directory initialized: ${logDir}`);
}

function closeWriteStream(stream: any) {
  if (
    selectTruthyValue(
      () => !stream,
      () => typeof stream.end !== "function",
    )
  )
    return Promise.resolve();
  if (
    selectTruthyValue(
      () => stream.destroyed,
      () => stream.closed,
    )
  )
    return Promise.resolve();
  return new Promise((resolve: any) => {
    stream.end(resolve);
  });
}

export async function closeLogDir(config: any, ctx: any = null) {
  const streams = [
    config?._pipelineLogFd,
    config?._runPipelineLogFd,
    ctx?._pipelineLogFd,
    ctx?._runPipelineLogFd,
  ].filter(Boolean);
  for (const stream of [...new Set(streams)]) {
    await closeWriteStream(stream);
  }
  if (config) {
    config._pipelineLogFd = null;
    config._runPipelineLogFd = null;
  }
  if (ctx) {
    ctx._pipelineLogFd = null;
    ctx._runPipelineLogFd = null;
  }
}

// ---------------------------------------------------------------------------
// Status operations
// ---------------------------------------------------------------------------

export function resolveModuleIdForDir(config: any, dir: any) {
  if (!dir) return null;
  const modules = objectRecord(config?._progress?.modules);
  const direct = modules[dir] ? dir : null;
  if (direct) return direct;
  const match = Object.entries(modules).find(
    ([, mod]: any) => mod?.dir === dir,
  );
  if (match?.[0]) return match[0];
  const readModelMatch = Object.entries(
    objectRecord(loadLifecycleReadModels(config)?.modules),
  ).find(([, entry]: any) => entry?.module_dir === dir);
  return selectDefinedValue(
    () => readModelMatch?.[0],
    () => null,
  );
}

export function loadStatus(config: any, dir: any, _opts: any = {}) {
  const moduleId = resolveModuleIdForDir(config, dir);
  if (!moduleId) return null;
  return projectModuleRuntimeState(
    config,
    moduleId,
    config?._progress?.modules?.[moduleId],
  );
}
