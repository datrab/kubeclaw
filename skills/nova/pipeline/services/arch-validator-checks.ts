import fs from 'node:fs';
import path from 'node:path';
import { gateInstructionsPath, moduleBusterMdPath, modulePath } from '../core/paths.ts';
import { checkModelConfig } from './arch-validator-models.ts';
import { checkProgress } from './arch-validator-progress.ts';
import { FINDING_CODES, makeFinding, SCOPE, SEVERITY } from './arch-validator-values.ts';

export { FINDING_CODES, SCOPE } from './arch-validator-values.ts';

type AnyRecord = Record<string, any>;
const MODULE_DEFAULT_STAGES = Object.freeze(['forge', 'buster']);

function objectRecord(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function progressFilePath(config: any) {
  return config.paths?.progress_file ?? 'progress.json';
}

function checkTestSpec(moduleId: string, testSpec: AnyRecord, relativePath: string) {
  const findings: any[] = [];
  if (!testSpec.module_id) {
    findings.push(makeFinding(
      FINDING_CODES.TEST_SPEC_MISSING_FIELD,
      SEVERITY.WARN,
      SCOPE.TEST_SPEC,
      [relativePath],
      `test-spec.json for module '${moduleId}' is missing module_id field`,
      `Add "module_id": "${moduleId}" to test-spec.json.`,
    ));
  } else if (testSpec.module_id !== moduleId) {
    findings.push(makeFinding(
      FINDING_CODES.TEST_SPEC_MODULE_ID_MISMATCH,
      SEVERITY.WARN,
      SCOPE.TEST_SPEC,
      [relativePath],
      `test-spec.json module_id '${testSpec.module_id}' does not match module ID '${moduleId}'`,
      `Update module_id in test-spec.json to "${moduleId}".`,
    ));
  }
  if (!testSpec.focus && !testSpec.required_checks) {
    findings.push(makeFinding(
      FINDING_CODES.TEST_SPEC_MISSING_FIELD,
      SEVERITY.WARN,
      SCOPE.TEST_SPEC,
      [relativePath],
      `test-spec.json for module '${moduleId}' has neither 'focus' nor 'required_checks'`,
      "Add at least one of 'focus' or 'required_checks' to test-spec.json.",
    ));
  }
  return findings;
}

function readTestSpec(moduleId: string, module: AnyRecord, moduleDir: string) {
  const relativePath = path.join('modules', module.dir, 'test-spec.json');
  const testSpecPath = path.join(moduleDir, 'test-spec.json');
  if (!fs.existsSync(testSpecPath)) return [];
  try {
    return checkTestSpec(moduleId, JSON.parse(fs.readFileSync(testSpecPath, 'utf8')), relativePath);
  } catch (_error) {
    return [makeFinding(
      FINDING_CODES.MODULE_TEST_SPEC_INVALID_JSON,
      SEVERITY.BLOCKING,
      SCOPE.TEST_SPEC,
      [relativePath],
      `Module '${moduleId}' has invalid JSON in test-spec.json`,
      `Fix the JSON syntax in modules/${module.dir}/test-spec.json.`,
    )];
  }
}

function moduleDirectoryFinding(moduleId: string, module: AnyRecord, config: any, error: any) {
  return makeFinding(
    FINDING_CODES.MODULE_MISSING_DIR,
    SEVERITY.BLOCKING,
    SCOPE.MODULE,
    [progressFilePath(config)],
    `Module '${moduleId}' has unsafe dir '${module.dir}': ${error.message}`,
    `Set modules.${moduleId}.dir to a relative path inside the modules root.`,
  );
}

function moduleFileFindings(moduleId: string, module: AnyRecord, moduleDir: string, config: any) {
  const findings: any[] = [];
  if (!fs.existsSync(path.join(moduleDir, 'FORGE.md'))) {
    findings.push(makeFinding(
      FINDING_CODES.MODULE_FORGE_MISSING,
      SEVERITY.BLOCKING,
      SCOPE.MODULE,
      [path.join('modules', module.dir, 'FORGE.md')],
      `Module '${moduleId}' is missing FORGE.md`,
      `Create FORGE.md in modules/${module.dir}/ with Forge implementation instructions.`,
    ));
  }
  const stages = Array.isArray(module.stages) ? module.stages : [...MODULE_DEFAULT_STAGES];
  if (stages.includes('buster') && !fs.existsSync(moduleBusterMdPath(config, module.dir))) {
    findings.push(makeFinding(
      FINDING_CODES.MODULE_BUSTER_MISSING,
      SEVERITY.WARN,
      SCOPE.MODULE,
      [path.join('modules', module.dir, 'BUSTER.md')],
      `Module '${moduleId}' has buster stage but is missing BUSTER.md`,
      `Create BUSTER.md in modules/${module.dir}/ with Buster test instructions.`,
    ));
  }
  return [...findings, ...readTestSpec(moduleId, module, moduleDir)];
}

function checkModuleFiles(progress: any, config: any) {
  const findings: any[] = [];
  if (!config.paths?.modules_dir) return findings;
  for (const [moduleId, module] of Object.entries(objectRecord(progress?.modules)) as [string, AnyRecord][]) {
    if (!module.dir) continue;
    try {
      findings.push(...moduleFileFindings(moduleId, module, modulePath(config, module.dir), config));
    } catch (error: any) {
      findings.push(moduleDirectoryFinding(moduleId, module, config, error));
    }
  }
  return findings;
}

function checkGateFiles(progress: any, config: any) {
  const findings: any[] = [];
  for (const [gateId, gate] of Object.entries(objectRecord(progress?.gates)) as [string, AnyRecord][]) {
    if (!gate.instructions_file) continue;
    try {
      const instructionPath = gateInstructionsPath(config, gate);
      if (instructionPath && fs.existsSync(instructionPath)) continue;
      findings.push(makeFinding(
        FINDING_CODES.GATE_INSTRUCTIONS_MISSING,
        SEVERITY.BLOCKING,
        SCOPE.GATE,
        [gate.instructions_file],
        `Gate '${gateId}' references instructions_file '${gate.instructions_file}' but the file does not exist`,
        `Create the instructions file at '${gate.instructions_file}', or correct the path in progress.json.`,
      ));
    } catch (error: any) {
      findings.push(makeFinding(
        FINDING_CODES.GATE_INSTRUCTIONS_MISSING,
        SEVERITY.BLOCKING,
        SCOPE.GATE,
        [progressFilePath(config)],
        `Gate '${gateId}' has unsafe instructions_file '${gate.instructions_file}': ${error.message}`,
        `Set gate '${gateId}' instructions_file to a relative path inside .swarm with no parent traversal.`,
      ));
    }
  }
  return findings;
}

function dependencyFinding(moduleId: string, dependency: any, modules: Set<string>, gates: AnyRecord, progressFile: string) {
  if (typeof dependency === 'string' && dependency.startsWith('gate:')) {
    const gateId = dependency.slice('gate:'.length);
    if (gates[gateId]) return null;
    return makeFinding(
      FINDING_CODES.DEP_UNDEFINED_REF,
      SEVERITY.BLOCKING,
      SCOPE.GATE,
      [progressFile],
      `Module '${moduleId}' depends on gate '${gateId}' which is not defined in gates`,
      `Add gate '${gateId}' to progress.json gates, or remove '${dependency}' from '${moduleId}'.depends_on.`,
    );
  }
  if (dependency === moduleId) {
    return makeFinding(
      FINDING_CODES.DEP_SELF_REFERENCE,
      SEVERITY.BLOCKING,
      SCOPE.DEPENDENCY_GRAPH,
      [progressFile],
      `Module '${moduleId}' depends on itself`,
      `Remove '${moduleId}' from its own depends_on list.`,
    );
  }
  if (modules.has(dependency)) return null;
  return makeFinding(
    FINDING_CODES.DEP_UNDEFINED_REF,
    SEVERITY.BLOCKING,
    SCOPE.DEPENDENCY_GRAPH,
    [progressFile],
    `Module '${moduleId}' depends on '${dependency}' which is not defined in modules`,
    `Add module '${dependency}' to progress.json modules, or remove it from '${moduleId}'.depends_on.`,
  );
}

export function checkDependencyGraph(progress: any, config: any) {
  const modules = objectRecord(progress?.modules);
  const gates = objectRecord(progress?.gates);
  const knownModules = new Set(Object.keys(modules));
  const progressFile = progressFilePath(config);
  const findings: any[] = [];
  for (const [moduleId, module] of Object.entries(modules) as [string, AnyRecord][]) {
    const dependencies = Array.isArray(module.depends_on) ? module.depends_on : [];
    for (const dependency of dependencies) {
      const finding = dependencyFinding(moduleId, dependency, knownModules, gates, progressFile);
      if (finding) findings.push(finding);
    }
  }
  return findings;
}

export function runDeterministicArchitectureChecks(progress: any, config: any) {
  return [
    ...checkProgress(progress, config),
    ...checkModuleFiles(progress, config),
    ...checkGateFiles(progress, config),
    ...checkDependencyGraph(progress, config),
    ...checkModelConfig(config, progress),
  ];
}
