// services/validation.ts — Preflight contract and delivery lint validation
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
import { log } from '../core/logger.ts';
import { modulePath, resolveRepoRelativePath, resolveRepoRealPath } from '../core/paths.ts';

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Stable machine-friendly failure codes
export const VALIDATION_CODES = {
  FORGE_BLUEPRINT_MISSING:       'FORGE_BLUEPRINT_MISSING',
  FORGE_BLUEPRINT_READ_FAILED:   'FORGE_BLUEPRINT_READ_FAILED',
  FORGE_SUBSTEP_INVALID:         'FORGE_SUBSTEP_INVALID',
  SERVE_DOCKERFILE_NOT_DECLARED: 'SERVE_DOCKERFILE_NOT_DECLARED',
  API_SPEC_NOT_DECLARED:         'API_SPEC_NOT_DECLARED',
  SERVE_DOCKERFILE_PATH_INVALID: 'SERVE_DOCKERFILE_PATH_INVALID',
  SERVE_DOCKERFILE_MISSING:      'SERVE_DOCKERFILE_MISSING',
  SERVE_DOCKERFILE_READ_FAILED:  'SERVE_DOCKERFILE_READ_FAILED',
  STATIC_PATH_INVALID:           'STATIC_PATH_INVALID',
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
 * Modules with configured substeps must provide every substep FORGE.md.
 */
function readForgeBlueprint(config, moduleDir, mod = {}) {
  const forgePath = path.join(modulePath(config, moduleDir), 'FORGE.md');
  if (mod?.substeps) {
    if (!Array.isArray(mod.substeps) || mod.substeps.length === 0) {
      return {
        content: null,
        failure: validationFailure(
          'preflight_contract',
          VALIDATION_CODES.FORGE_SUBSTEP_INVALID,
          `Module '${moduleDir}' declares substeps but none are configured.`,
          'Configure at least one explicit substep id, or remove substeps and provide a top-level FORGE.md.',
        ),
      };
    }
    const parts = [];
    for (const stepId of mod.substeps) {
      if (typeof stepId !== 'string' || !stepId.trim()) {
        return {
          content: null,
          failure: validationFailure(
            'preflight_contract',
            VALIDATION_CODES.FORGE_SUBSTEP_INVALID,
            `Module '${moduleDir}' has an invalid substep id.`,
            'Use non-empty string substep ids and provide each <substep>/FORGE.md artifact.',
          ),
        };
      }
      const substepForgePath = path.join(modulePath(config, moduleDir), stepId, 'FORGE.md');
      if (!fs.existsSync(substepForgePath)) {
        return {
          content: null,
          failure: validationFailure(
            'preflight_contract',
            VALIDATION_CODES.FORGE_BLUEPRINT_MISSING,
            `Configured substep '${stepId}' is missing '${path.join(stepId, 'FORGE.md')}'.`,
            `Create ${path.join(moduleDir, stepId, 'FORGE.md')} before retrying Forge.`,
          ),
        };
      }
      try {
        parts.push(fs.readFileSync(substepForgePath, 'utf8'));
      } catch (error) {
        return {
          content: null,
          failure: validationFailure(
            'preflight_contract',
            VALIDATION_CODES.FORGE_BLUEPRINT_READ_FAILED,
            `Configured substep '${stepId}' FORGE.md could not be read: ${error.message}`,
            `Fix file permissions or replace ${path.join(moduleDir, stepId, 'FORGE.md')} before retrying Forge.`,
          ),
        };
      }
    }
    return { content: parts.join('\n\n---\n\n'), failure: null };
  }

  if (!fs.existsSync(forgePath)) {
    return {
      content: null,
      failure: validationFailure(
        'preflight_contract',
        VALIDATION_CODES.FORGE_BLUEPRINT_MISSING,
        `Module '${moduleDir}' is missing FORGE.md, so Forge cannot be spawned with typed implementation instructions.`,
        `Create ${path.join(moduleDir, 'FORGE.md')} before retrying Forge.`,
      ),
    };
  }
  try {
    return { content: fs.readFileSync(forgePath, 'utf8'), failure: null };
  } catch (error) {
    return {
      content: null,
      failure: validationFailure(
        'preflight_contract',
        VALIDATION_CODES.FORGE_BLUEPRINT_READ_FAILED,
        `Module '${moduleDir}' FORGE.md could not be read: ${error.message}`,
        `Fix file permissions or replace ${path.join(moduleDir, 'FORGE.md')} before retrying Forge.`,
      ),
    };
  }
}

function validationFailure(stage, code, explanation, nextStep) {
  return {
    stage,
    code,
    explanation,
    next_step: nextStep,
  };
}

function invalidServeDockerfileFailure(serveDockerfile, error) {
  return validationFailure(
    'delivery_lint',
    VALIDATION_CODES.SERVE_DOCKERFILE_PATH_INVALID,
    `test_config.serve.dockerfile references '${serveDockerfile}' but it is not a repository-root-relative file path: ${error.message}`,
    'Set test_config.serve.dockerfile to a path relative to the repository root that resolves inside the repository, with no symlink escape.',
  );
}

function validateStaticPath(config, staticPath) {
  if (staticPath === undefined || staticPath === null || staticPath === '') return null;
  if (typeof staticPath !== 'string' || !staticPath.trim()) {
    throw new Error('test_config.serve.static_path must be a non-empty string when set');
  }
  if (staticPath.includes('\0')) throw new Error('test_config.serve.static_path contains a null byte');
  if (/[\r\n]/.test(staticPath)) throw new Error('test_config.serve.static_path contains a newline');
  if (path.isAbsolute(staticPath)) throw new Error('test_config.serve.static_path must not be absolute');
  const segments = staticPath.split(/[\\/]+/).filter(Boolean);
  if (segments.includes('..')) throw new Error('test_config.serve.static_path must not contain parent traversal');

  const candidatePath = resolveRepoRelativePath(config, staticPath, 'test_config.serve.static_path');
  if (fs.existsSync(candidatePath)) resolveRepoRealPath(config, staticPath, 'test_config.serve.static_path');

  return staticPath.replace(/\\/g, '/');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run preflight contract validation before Forge spawn.
 *
 * Verifies that file references declared in test_config (such as serve.dockerfile
 * and api.spec_file) are also listed in the module's FORGE.md blueprint.
 *
 * @param {object} mod       - Module config entry from progress.json
 * @param {string} moduleDir - Module directory name (e.g. '05-preflight-...')
 * @param {object} config    - Pipeline config (must have paths.modules_dir)
 * @returns {{ passed: boolean, failures: object[] }}
 */
export function runPreflightValidation(mod, moduleDir, config) {
  const testConfig = mod?.test_config || {};
  const failures = [];

  const forgeBlueprint = readForgeBlueprint(config, moduleDir, mod);
  if (forgeBlueprint.failure) {
    log('WARN', `Preflight contract validation failed for ${moduleDir}: ${forgeBlueprint.failure.code}`);
    return { passed: false, failures: [forgeBlueprint.failure] };
  }
  const forgeContent = forgeBlueprint.content;

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
 * Checks that produced delivery artifacts are internally consistent. The
 * Dockerfile check is contextual: modules without test_config.serve.dockerfile
 * skip delivery lint, while declared Dockerfiles must be repository-relative,
 * realpath-jailed inside config.repo_root, present, and readable.
 *
 * @param {object} mod       - Module config entry from progress.json
 * @param {string} moduleDir - Module directory name
 * @param {object} config    - Pipeline config (must have repo_root)
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

  let dockerfilePath;
  try {
    dockerfilePath = resolveRepoRelativePath(config, serveDockerfile, 'test_config.serve.dockerfile');
  } catch (error) {
    failures.push(invalidServeDockerfileFailure(serveDockerfile, error));
    log('WARN', `Delivery lint: ${VALIDATION_CODES.SERVE_DOCKERFILE_PATH_INVALID} — ${error.message}`);
    return { passed: false, failures };
  }

  if (!fs.existsSync(dockerfilePath)) {
    failures.push(validationFailure(
      'delivery_lint',
      VALIDATION_CODES.SERVE_DOCKERFILE_MISSING,
      `test_config.serve.dockerfile references '${serveDockerfile}' but the file was not produced at '${dockerfilePath}' after Forge completed.`,
      `Ensure Forge creates the Dockerfile at '${serveDockerfile}' relative to the repository root.`,
    ));
    log('WARN', `Delivery lint: ${VALIDATION_CODES.SERVE_DOCKERFILE_MISSING} — ${dockerfilePath} not found`);
    return { passed: false, failures };
  }

  let dockerfileRealPath;
  try {
    dockerfileRealPath = resolveRepoRealPath(config, serveDockerfile, 'test_config.serve.dockerfile');
  } catch (error) {
    failures.push(invalidServeDockerfileFailure(serveDockerfile, error));
    log('WARN', `Delivery lint: ${VALIDATION_CODES.SERVE_DOCKERFILE_PATH_INVALID} — ${error.message}`);
    return { passed: false, failures };
  }

  let dockerfileContent;
  try {
    dockerfileContent = fs.readFileSync(dockerfileRealPath, 'utf8');
  } catch (error) {
    failures.push(validationFailure(
      'delivery_lint',
      VALIDATION_CODES.SERVE_DOCKERFILE_READ_FAILED,
      `test_config.serve.dockerfile references '${serveDockerfile}' but the file could not be read at '${dockerfileRealPath}': ${error.message}`,
      'Make the declared Dockerfile a readable regular file inside the repository root before retrying.',
    ));
    log('WARN', `Delivery lint: ${VALIDATION_CODES.SERVE_DOCKERFILE_READ_FAILED} — ${error.message}`);
    return { passed: false, failures };
  }

  const staticPath = testConfig.serve?.static_path;
  let normalizedStaticPath = null;
  try {
    normalizedStaticPath = validateStaticPath(config, staticPath);
  } catch (error) {
    failures.push(validationFailure(
      'delivery_lint',
      VALIDATION_CODES.STATIC_PATH_INVALID,
      error.message,
      'Set test_config.serve.static_path to a relative, traversal-free COPY destination or remove it.',
    ));
  }

  if (normalizedStaticPath) {
    const copies = parseDockerfileCopies(dockerfileContent);
    if (copies.length > 0) {
      const matched = copies.some(c => normalizeDirPath(c.dest) === normalizeDirPath(normalizedStaticPath));
      if (!matched) {
        const copyDests = copies.map(c => c.dest).join(', ');
        failures.push(validationFailure(
          'delivery_lint',
          VALIDATION_CODES.STATIC_PATH_MISMATCH,
          `test_config.serve.static_path is '${staticPath}' but no Dockerfile COPY destination matches. COPY destinations found: ${copyDests}.`,
          `Align the Dockerfile COPY destination with '${staticPath}', or correct test_config.serve.static_path in progress.json to match what the Dockerfile actually copies.`,
        ));
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
