// services/validation.js — Preflight contract and delivery lint validation
//
// Two validation stages:
//   preflight_contract  — before Forge spawn: checks test_config file references
//                         are declared in the module FORGE.md blueprint
//   delivery_lint       — after Forge output, before Buster: checks produced
//                         artifacts are internally consistent
//
// Both functions return { passed: boolean, failures: ValidationFailure[] }
//
// ValidationFailure shape:
//   {
//     stage:       'preflight_contract' | 'delivery_lint',
//     code:        string,   // stable machine-friendly failure code
//     explanation: string,   // operator-facing description of what is wrong
//     next_step:   string,   // actionable fix instruction
//   }

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { modulePath, projectSrcPath } from '../core/paths.js';

// Stable machine-friendly failure codes
export const VALIDATION_CODES = {
  SERVE_DOCKERFILE_NOT_DECLARED: 'SERVE_DOCKERFILE_NOT_DECLARED',
  API_SPEC_NOT_DECLARED:         'API_SPEC_NOT_DECLARED',
  SERVE_DOCKERFILE_MISSING:      'SERVE_DOCKERFILE_MISSING',
  STATIC_PATH_MISMATCH:          'STATIC_PATH_MISMATCH',
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Normalize a path for comparison (remove trailing slash). */
function normalizeDirPath(p) {
  return typeof p === 'string' ? p.replace(/\/$/, '') : '';
}

/**
 * Parse COPY instructions from Dockerfile text content.
 * Handles optional flags: COPY [--chown=...] <src> <dest>
 * Returns array of { src, dest } pairs.
 */
function parseDockerfileCopies(content) {
  const copies = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // Match COPY followed by zero or more --flag args, then src and dest
    const match = trimmed.match(/^COPY(?:\s+--\S+)*\s+(\S+)\s+(\S+)/i);
    if (match) copies.push({ src: match[1], dest: match[2] });
  }
  return copies;
}

/**
 * Read FORGE.md content for the given module directory.
 * Returns null if the file does not exist or cannot be read.
 */
function readForgeBlueprint(config, moduleDir) {
  const forgePath = path.join(modulePath(config, moduleDir), 'FORGE.md');
  try {
    return fs.readFileSync(forgePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Resolve a test_config file path to an absolute filesystem path.
 * Relative paths are resolved against the project source root.
 */
function resolveTestConfigPath(config, filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(projectSrcPath(config), filePath);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run preflight contract validation before Forge spawn.
 *
 * Verifies that file references declared in test_config (such as serve.dockerfile
 * and api.spec_file) are also listed in the module's FORGE.md blueprint. If the
 * FORGE.md does not exist, all checks are skipped (pass-through).
 *
 * @param {object} mod       - Module config entry from progress.json
 * @param {string} moduleDir - Module directory name (e.g. '05-preflight-...')
 * @param {object} config    - Pipeline config (must have paths.modules_dir)
 * @returns {{ passed: boolean, failures: object[] }}
 */
export function runPreflightValidation(mod, moduleDir, config) {
  const testConfig = mod?.test_config || {};
  const failures = [];

  const forgeContent = readForgeBlueprint(config, moduleDir);
  if (forgeContent === null) {
    log('INFO', `Preflight: no FORGE.md for ${moduleDir} — contract checks skipped`);
    return { passed: true, failures: [] };
  }

  // Rule: serve.dockerfile must be named in FORGE.md
  const serveDockerfile = testConfig.serve?.dockerfile;
  if (serveDockerfile) {
    const filename = path.basename(serveDockerfile);
    if (!forgeContent.includes(filename)) {
      failures.push({
        stage: 'preflight_contract',
        code: VALIDATION_CODES.SERVE_DOCKERFILE_NOT_DECLARED,
        explanation: `test_config.serve.dockerfile references '${filename}' but this file is not declared as a required deliverable in FORGE.md.`,
        next_step: `Add '${filename}' to the required deliverables section of FORGE.md before retrying Forge.`,
      });
    }
  }

  // Rule: api.spec_file must be named in FORGE.md
  const apiSpecFile = testConfig.api?.spec_file;
  if (apiSpecFile) {
    const filename = path.basename(apiSpecFile);
    if (!forgeContent.includes(filename)) {
      failures.push({
        stage: 'preflight_contract',
        code: VALIDATION_CODES.API_SPEC_NOT_DECLARED,
        explanation: `test_config.api.spec_file references '${filename}' but this file is not declared as a required deliverable in FORGE.md.`,
        next_step: `Add '${filename}' to the required deliverables section of FORGE.md before retrying Forge.`,
      });
    }
  }

  if (failures.length > 0) {
    log('WARN', `Preflight contract validation failed for ${moduleDir}: ${failures.map(f => f.code).join(', ')}`);
  } else {
    log('INFO', `Preflight contract validation passed for ${moduleDir}`);
  }

  return { passed: failures.length === 0, failures };
}

/**
 * Run delivery lint validation after Forge output exists, before Buster dispatch.
 *
 * Checks that produced delivery artifacts are internally consistent. Currently
 * enforces two deterministic rules:
 *   1. Dockerfile must exist at the path declared in test_config.serve.dockerfile.
 *   2. If test_config.serve.static_path is set, a Dockerfile COPY destination
 *      must match the declared static_path (prevents silent static-asset 404s).
 *
 * Only active when test_config.serve.dockerfile is configured. If it is absent,
 * all checks are skipped (pass-through).
 *
 * @param {object} mod       - Module config entry from progress.json
 * @param {string} moduleDir - Module directory name
 * @param {object} config    - Pipeline config (must have paths.swarm_dir for project src resolution)
 * @returns {{ passed: boolean, failures: object[] }}
 */
export function runDeliveryLintValidation(mod, moduleDir, config) {
  const testConfig = mod?.test_config || {};
  const failures = [];

  const serveDockerfile = testConfig.serve?.dockerfile;
  if (!serveDockerfile) {
    log('INFO', `Delivery lint: no serve.dockerfile for ${moduleDir} — checks skipped`);
    return { passed: true, failures: [] };
  }

  const dockerfilePath = resolveTestConfigPath(config, serveDockerfile);
  if (!dockerfilePath) {
    return { passed: true, failures: [] };
  }

  // Rule 1: Dockerfile must exist after Forge completes
  if (!fs.existsSync(dockerfilePath)) {
    failures.push({
      stage: 'delivery_lint',
      code: VALIDATION_CODES.SERVE_DOCKERFILE_MISSING,
      explanation: `test_config.serve.dockerfile references '${serveDockerfile}' but the file was not produced at '${dockerfilePath}' after Forge completed.`,
      next_step: `Ensure Forge creates the Dockerfile at '${serveDockerfile}' relative to the project source root.`,
    });
    log('WARN', `Delivery lint: ${VALIDATION_CODES.SERVE_DOCKERFILE_MISSING} — ${dockerfilePath} not found`);
    return { passed: false, failures };
  }

  // Rule 2: COPY destinations must include the declared static_path (when configured)
  const staticPath = testConfig.serve?.static_path;
  if (staticPath) {
    let dockerfileContent;
    try {
      dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
    } catch (e) {
      log('WARN', `Delivery lint: could not read Dockerfile at ${dockerfilePath}: ${e.message}`);
      return { passed: true, failures: [] };
    }

    const copies = parseDockerfileCopies(dockerfileContent);
    if (copies.length > 0) {
      const normalizedStaticPath = normalizeDirPath(staticPath);
      const matched = copies.some(c => normalizeDirPath(c.dest) === normalizedStaticPath);
      if (!matched) {
        const copyDests = copies.map(c => c.dest).join(', ');
        failures.push({
          stage: 'delivery_lint',
          code: VALIDATION_CODES.STATIC_PATH_MISMATCH,
          explanation: `test_config.serve.static_path is '${staticPath}' but no Dockerfile COPY destination matches. COPY destinations found: ${copyDests}.`,
          next_step: `Align the Dockerfile COPY destination with '${staticPath}', or correct test_config.serve.static_path in progress.json to match what the Dockerfile actually copies.`,
        });
      }
    }
  }

  if (failures.length > 0) {
    log('WARN', `Delivery lint validation failed for ${moduleDir}: ${failures.map(f => f.code).join(', ')}`);
  } else {
    log('INFO', `Delivery lint validation passed for ${moduleDir}`);
  }

  return { passed: failures.length === 0, failures };
}

/**
 * Format an array of validation failures into an operator-facing summary string.
 *
 * @param {object[]} failures - Array of ValidationFailure objects
 * @returns {string}
 */
export function formatValidationFailures(failures) {
  if (!failures || failures.length === 0) return '';
  const header = `VALIDATION FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`;
  const body = failures.map(f => [
    `\n[${f.stage}] ${f.code}`,
    `  Why:  ${f.explanation}`,
    `  Fix:  ${f.next_step}`,
  ].join('\n')).join('\n');
  return `${header}${body}`;
}
