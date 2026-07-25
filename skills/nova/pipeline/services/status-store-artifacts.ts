import fs from "fs";
import path from "path";
import { moduleLogDir, relPath, gateLogDir } from "../core/paths.ts";
import { log } from "../core/logger.ts";
import { copyTranscriptArtifact, writePromptArtifact } from "../egress.ts";
import { emitPromptArtifactWriteWarning } from "./system-io-warning.ts";
import { publishPromptEvidence } from "./evidence-plane.ts";
import { resolveModuleIdForDir } from "./status-store-io.ts";
import { selectTruthyValue } from "../optional-absence.ts";

function requiredPath(value: string | null, label: string): string {
  if (value) return value;
  throw new Error(`Missing required ${label} path`);
}

const GATE_ARCHIVE_DEFAULT_EXTENSION = ".json";

export function savePrompt(
  config: any,
  dir: any,
  agentType: any,
  attempt: any,
  prompt: any,
) {
  const logDir = moduleLogDir(config, dir);
  if (!logDir) {
    throw new Error("savePrompt requires canonical module log directory");
  }
  if (typeof prompt !== "string") {
    log(
      "DEBUG",
      "Prompt save skipped (non-critical): missing log dir, module dir, or prompt content",
    );
    return;
  }
  let filePath = path.join(logDir, `${agentType}-prompt-attempt-${attempt}.md`);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writePromptArtifact(filePath, prompt, {
      agent_type: agentType,
      attempt,
      module_dir: dir,
    });
    const moduleId = resolveModuleIdForDir(config, dir);
    publishPromptEvidence(config, {
      prompt,
      agent_type: agentType,
      work_id: moduleId,
      attempt,
    });
    log(
      "DEBUG",
      `Prompt artifact saved: ${relPath(config, filePath)} (${prompt.length} chars)`,
    );
  } catch (e: any) {
    log("DEBUG", `Prompt save failed (non-critical): ${e.message}`);
    let moduleId = dir;
    try {
      moduleId = resolveModuleIdForDir(config, dir);
    } catch (_resolveError: any) {
      moduleId = dir;
    }
    emitPromptArtifactWriteWarning(config, filePath, e, {
      module_id: moduleId,
      attempt,
    });
  }
}

export function saveStreamLog(
  config: any,
  dir: any,
  agentType: any,
  attempt: any,
  streamLogPath: any,
) {
  if (!streamLogPath) return;
  try {
    if (!fs.existsSync(streamLogPath)) {
      log("DEBUG", `Stream log not found: ${streamLogPath}`);
      return;
    }
    const logDir = requiredPath(moduleLogDir(config, dir), "module log");
    fs.mkdirSync(logDir, { recursive: true });
    const destPath = path.join(
      logDir,
      `${agentType}-transcript-attempt-${attempt}.jsonl`,
    );
    copyTranscriptArtifact(streamLogPath, destPath);
    const size = fs.statSync(destPath).size;
    log(
      "OK",
      `Stream log metadata saved: ${relPath(config, destPath)} (${(size / 1024).toFixed(1)} KB)`,
    );
  } catch (e: any) {
    log("DEBUG", `Stream log save failed (non-critical): ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Archive helpers
// ---------------------------------------------------------------------------

function gateArchiveDir(config: any, gateId: any) {
  return path.join(
    requiredPath(gateLogDir(config, gateId), "gate log"),
    "archive",
  );
}

export function archiveGateOutputIfPresent(
  config: any,
  gateId: any,
  sourcePath: any,
  { attempt = null, label = null }: any = {},
) {
  if (!fs.existsSync(sourcePath)) return null;

  const archiveDir = gateArchiveDir(config, gateId);
  fs.mkdirSync(archiveDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const parsed = path.parse(sourcePath);
  const attemptSuffix = attempt ? `-attempt-${attempt}` : "";
  const labelSuffix = label ? `-${label}` : "";
  const archivedPath = path.join(
    archiveDir,
    `${parsed.name}${labelSuffix}${attemptSuffix}-${ts}${selectTruthyValue(
      () => parsed.ext,
      () => GATE_ARCHIVE_DEFAULT_EXTENSION,
    )}`,
  );
  fs.copyFileSync(sourcePath, archivedPath);
  return archivedPath;
}
