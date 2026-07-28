import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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

import path from 'path';
import { log } from '../core/logger.ts';
import { readForgeBlueprint } from './validation-blueprint.ts';
import { runDeliveryLintValidation } from './validation-delivery.ts';
import { VALIDATION_CODES } from './validation-contract.ts';
export { VALIDATION_CODES } from './validation-contract.ts';
export { runDeliveryLintValidation } from './validation-delivery.ts';

export function isPlainObject(value: any) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}


function normalizeComparablePath(value: any) {
  return typeof value === 'string'
    ? value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^(?:\.\/)+/, '').replace(/\/+$/, '').trim()
    : '';
}

function moduleOwnsReferencedPath(mod: any, reference: any) {
  const ref = normalizeComparablePath(reference);
  const ownedPaths = Array.isArray(mod?.owned_paths) ? mod.owned_paths : [];
  return ownedPaths
    .map(normalizeComparablePath)
    .filter(Boolean)
    .some((owned: any) => ref === owned || ref.endsWith(`/${owned}`));
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
export function runPreflightValidation(mod: any, moduleDir: any, config: any) {
  const testConfig = selectDefinedValue(() => (mod?.test_config), () => ({}));
  const failures: any[] = [];

  const forgeBlueprint = readForgeBlueprint(config, moduleDir, mod);
  if (forgeBlueprint.failure) {
    log('WARN', `Preflight contract validation failed for ${moduleDir}: ${forgeBlueprint.failure.code}`);
    return { passed: false, failures: [forgeBlueprint.failure] };
  }
  const forgeContent = forgeBlueprint.content;

  // Rule: owned serve.dockerfile artifacts must be named in FORGE.md.
  // Runtime-only Dockerfile references are delivery-lint inputs, not Forge-owned
  // deliverables for modules that do not list the Dockerfile in owned_paths.
  const serveDockerfile = testConfig.serve?.dockerfile;
  if (serveDockerfile && moduleOwnsReferencedPath(mod, serveDockerfile)) {
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
    log('WARN', `Preflight contract validation failed for ${moduleDir}: ${failures.map((f: any) => f.code).join(', ')}`);
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
/**
 * Format an array of validation failures into an operator-facing summary string.
 *
 * @param {object[]} failures - Array of ValidationFailure objects
 * @returns {string}
 */
export function formatValidationFailures(failures: any) {
  if (selectTruthyValue(() => (!failures), () => (failures.length === 0))) return '';
  const header = `VALIDATION FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`;
  const body = failures.map((f: any) => [
    `\n[${f.stage}] ${f.code}`,
    `  Why:  ${f.explanation}`,
    `  Fix:  ${f.next_step}`,
  ].join('\n')).join('\n');
  return `${header}${body}`;
}
