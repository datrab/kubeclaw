import fs from 'fs';
import path from 'path';
import { modulePath } from '../core/paths.ts';
import { VALIDATION_CODES, validationFailure } from './validation-contract.ts';

function blueprintFailure(code: string, explanation: string, nextStep: string) {
  return { content: null, failure: validationFailure('preflight_contract', code, explanation, nextStep) };
}

function readBlueprintFile(filePath: string, missing: () => ReturnType<typeof blueprintFailure>, unreadable: (error: any) => ReturnType<typeof blueprintFailure>) {
  if (!fs.existsSync(filePath)) return missing();
  try {
    return { content: fs.readFileSync(filePath, 'utf8'), failure: null };
  } catch (error: any) {
    return unreadable(error);
  }
}

function invalidSubsteps(moduleDir: string) {
  return blueprintFailure(
    VALIDATION_CODES.FORGE_SUBSTEP_INVALID,
    `Module '${moduleDir}' declares substeps but none are configured.`,
    'Configure at least one explicit substep id, or remove substeps and provide a top-level FORGE.md.',
  );
}

function readSubstepBlueprints(config: any, moduleDir: string, substeps: any[]) {
  const parts: string[] = [];
  for (const stepId of substeps) {
    if (typeof stepId !== 'string' || !stepId.trim()) {
      return blueprintFailure(
        VALIDATION_CODES.FORGE_SUBSTEP_INVALID,
        `Module '${moduleDir}' has an invalid substep id.`,
        'Use non-empty string substep ids and provide each <substep>/FORGE.md artifact.',
      );
    }
    const relativePath = path.join(stepId, 'FORGE.md');
    const result = readBlueprintFile(
      path.join(modulePath(config, moduleDir), relativePath),
      () => blueprintFailure(
        VALIDATION_CODES.FORGE_BLUEPRINT_MISSING,
        `Configured substep '${stepId}' is missing '${relativePath}'.`,
        `Create ${path.join(moduleDir, relativePath)} before retrying Forge.`,
      ),
      (error) => blueprintFailure(
        VALIDATION_CODES.FORGE_BLUEPRINT_READ_FAILED,
        `Configured substep '${stepId}' FORGE.md could not be read: ${error.message}`,
        `Fix file permissions or replace ${path.join(moduleDir, relativePath)} before retrying Forge.`,
      ),
    );
    if (result.failure) return result;
    parts.push(result.content as string);
  }
  return { content: parts.join('\n\n---\n\n'), failure: null };
}

export function readForgeBlueprint(config: any, moduleDir: string, mod: any = {}) {
  if (mod?.substeps !== undefined) {
    if (!Array.isArray(mod.substeps)) return invalidSubsteps(moduleDir);
    if (mod.substeps.length === 0) return invalidSubsteps(moduleDir);
    return readSubstepBlueprints(config, moduleDir, mod.substeps);
  }
  const forgePath = path.join(modulePath(config, moduleDir), 'FORGE.md');
  return readBlueprintFile(
    forgePath,
    () => blueprintFailure(
      VALIDATION_CODES.FORGE_BLUEPRINT_MISSING,
      `Module '${moduleDir}' is missing FORGE.md, so Forge cannot be spawned with typed implementation instructions.`,
      `Create ${path.join(moduleDir, 'FORGE.md')} before retrying Forge.`,
    ),
    (error) => blueprintFailure(
      VALIDATION_CODES.FORGE_BLUEPRINT_READ_FAILED,
      `Module '${moduleDir}' FORGE.md could not be read: ${error.message}`,
      `Fix file permissions or replace ${path.join(moduleDir, 'FORGE.md')} before retrying Forge.`,
    ),
  );
}
