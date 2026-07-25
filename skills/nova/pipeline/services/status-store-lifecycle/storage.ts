import fs from "fs";
import path from "path";

import { ensurePipelineRunLogDir } from "../../core/paths.ts";
import {
  inspectContendedLock,
  requireConfiguredNumber as requireNumber,
  sleepSync,
  writeJsonAtomic as writeJsonAtomicFile,
} from "../file-lock-primitives.ts";

import {
  selectDefinedValue,
  selectTruthyValue,
} from "../../optional-absence.ts";
function ensureRunLogDir(config: any) {
  const runLogDir =
    config?._lifecycleReadOnly === true
      ? selectTruthyValue(
          () => config?._lifecycleReadOnlyRunLogDir,
          () => null,
        )
      : ensurePipelineRunLogDir(config);
  if (!runLogDir) {
    if (config?._lifecycleReadOnly === true) return null;
    throw new Error(
      "lifecycle storage requires an initialized pipeline run log directory",
    );
  }
  return runLogDir;
}

export function lifecycleDir(config: any) {
  const runLogDir = ensureRunLogDir(config);
  if (!runLogDir) return null;
  const dir = path.join(runLogDir, "lifecycle");
  if (config?._lifecycleReadOnly !== true)
    fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function lifecycleEventsPath(config: any) {
  const dir = lifecycleDir(config);
  return dir ? path.join(dir, "canonical-events.jsonl") : null;
}

export function lifecycleReadModelsPath(config: any) {
  const dir = lifecycleDir(config);
  return dir ? path.join(dir, "read-models.json") : null;
}

export function lifecycleAppendLockPath(config: any) {
  const dir = lifecycleDir(config);
  return dir ? path.join(dir, "append.lock") : null;
}

export function readJsonIfPresent(filePath: any, fallback: any = null) {
  if (!filePath)
    throw new Error("lifecycle read requires an initialized file path");
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJsonAtomic(filePath: any, value: any) {
  writeJsonAtomicFile(
    filePath,
    value,
    "lifecycle write requires an initialized file path",
  );
}

export function appendJsonLine(filePath: any, value: any) {
  if (!filePath)
    throw new Error("lifecycle append requires an initialized file path");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(value) + "\n");
}

export function readJsonLines(filePath: any) {
  if (!filePath)
    throw new Error("lifecycle read requires an initialized file path");
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line: any) => JSON.parse(line));
}

function readLockOwner(lockPath: any) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    /* INTENTIONAL_NONCRITICAL(best_effort_cleanup_failed): cleanup is idempotent or a primary failure remains authoritative. */
    return null;
  }
}

function removeOwnedLock(lockPath: any, ownerToken: any) {
  const owner = readLockOwner(lockPath);
  if (owner?.token === ownerToken) {
    try {
      fs.unlinkSync(lockPath);
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

export function withLifecycleAppendLock(config: any, fn: any) {
  const lockPath = lifecycleAppendLockPath(config);
  if (!lockPath) return fn();
  const lockConfig = config?.locks?.lifecycle_append;
  const staleMs = requireNumber(
    lockConfig,
    "stale_ms",
    "config.locks.lifecycle_append",
  );
  const timeoutMs = requireNumber(
    lockConfig,
    "timeout_ms",
    "config.locks.lifecycle_append",
  );

  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const ownerToken = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const startedAt = Date.now();
  const ownerJson =
    JSON.stringify({
      pid: process.pid,
      token: ownerToken,
      acquired_at: new Date().toISOString(),
    }) + "\n";
  while (true) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      try {
        fs.writeFileSync(fd, ownerJson);
      } finally {
        fs.closeSync(fd);
      }
      break;
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
      const lockState = inspectContendedLock(lockPath, lockPath, staleMs);
      if (lockState === "missing") continue;
      if (lockState === "remove") {
        fs.rmSync(lockPath, { force: true });
        continue;
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(
          `timed out waiting for lifecycle append lock: ${lockPath}`,
        );
      }
      sleepSync(25);
    }
  }

  try {
    return fn();
  } finally {
    removeOwnedLock(lockPath, ownerToken);
  }
}
