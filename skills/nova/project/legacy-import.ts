import path from 'node:path';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { compileProject } from './compiler.ts';

type RecordValue = Record<string, any>;
function record(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`LEGACY_IMPORT_OBJECT_REQUIRED:${label}`);
  return value as RecordValue;
}
function segment(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/u.test(value) || value.includes('..')) throw new Error('LEGACY_IMPORT_SEGMENT_INVALID');
  return value;
}
function sameKeys(actual: string[], expected: string[], label: string): void {
  if (canonicalJson([...actual].sort()) !== canonicalJson([...expected].sort())) throw new Error(`LEGACY_IMPORT_KEYS_MISMATCH:${label}`);
}

function legacyGateDecisions(legacy: RecordValue, authoring: RecordValue): RecordValue {
  const gates = record(legacy.gates ?? {}, 'legacy.gates');
  const gateDecisions = record(authoring.gateDecisions, 'gateDecisions');
  sameKeys(Object.keys(gateDecisions), Object.keys(gates), 'gateDecisions');
  for (const reason of Object.values(gateDecisions)) if (typeof reason !== 'string' || !reason.trim()) throw new Error('LEGACY_IMPORT_GATE_DECISION_REQUIRED');
  return gateDecisions;
}

function validateLegacyIdentity(legacy: RecordValue, project: RecordValue): void {
  if (legacy.version !== 1 || typeof legacy.project !== 'string' || legacy.project !== project.id) throw new Error('LEGACY_IMPORT_PROJECT_MISMATCH');
  if (legacy.run_id !== undefined && legacy.run_id === project.runId) throw new Error('LEGACY_IMPORT_NEW_RUN_REQUIRED');
}

/** Explicit authoring migration only. Runtime state, verdicts and approvals never migrate. */
export function importLegacyProject(legacyValue: unknown, authoringValue: unknown, legacyFile: string) {
  const legacy = record(legacyValue, 'legacy');
  const authoring = record(authoringValue, 'authoring');
  sameKeys(Object.keys(authoring), ['schemaVersion', 'project', 'moduleIds', 'gateDecisions', 'acknowledgeLegacyPolicy'], 'authoring');
  if (authoring.schemaVersion !== 'nova-project-legacy-import.v1' || authoring.acknowledgeLegacyPolicy !== true) throw new Error('LEGACY_IMPORT_POLICY_ACKNOWLEDGEMENT_REQUIRED');
  const project = structuredClone(record(authoring.project, 'project'));
  validateLegacyIdentity(legacy, project);
  const legacyModules = record(legacy.modules, 'legacy.modules');
  const moduleIds = record(authoring.moduleIds, 'moduleIds');
  sameKeys(Object.keys(moduleIds), Object.keys(legacyModules), 'moduleIds');
  if (!Object.keys(moduleIds).length || new Set(Object.values(moduleIds)).size !== Object.keys(moduleIds).length) throw new Error('LEGACY_IMPORT_MODULE_MAPPING_INVALID');
  const gateDecisions = legacyGateDecisions(legacy, authoring);
  if (typeof project.repositoryRoot !== 'string' || !path.isAbsolute(project.repositoryRoot)) throw new Error('LEGACY_IMPORT_REPOSITORY_REQUIRED');
  const swarm = path.relative(project.repositoryRoot, path.dirname(legacyFile));
  if (swarm.startsWith('..') || path.isAbsolute(swarm)) throw new Error('LEGACY_IMPORT_SOURCE_OUTSIDE_REPOSITORY');
  if (!Array.isArray(project.modules)) throw new Error('LEGACY_IMPORT_MODULE_AUTHORING_REQUIRED');
  sameKeys(project.modules.map((module: RecordValue) => module.id), Object.values(moduleIds), 'modules');
  project.modules = project.modules.map((input: unknown) => {
    const module = record(input, 'module');
    const legacyId = Object.keys(moduleIds).find(key => moduleIds[key] === module.id)!;
    const old = record(legacyModules[legacyId], `modules.${legacyId}`);
    if (!Array.isArray(old.depends_on)) throw new Error(`LEGACY_IMPORT_DEPENDENCIES_REQUIRED:${legacyId}`);
    const dependsOn = old.depends_on.map((dependency: unknown) => {
      if (typeof dependency !== 'string' || !Object.hasOwn(moduleIds, dependency)) throw new Error(`LEGACY_IMPORT_NONMODULE_DEPENDENCY:${legacyId}`);
      return moduleIds[dependency];
    });
    const blueprint = record(module.blueprint, `blueprint.${legacyId}`);
    const modulePath = path.posix.join(swarm.split(path.sep).join('/'), 'modules', segment(old.dir));
    const substeps = old.substeps === undefined ? undefined : (Array.isArray(old.substeps) ? old.substeps.map(segment) : (() => { throw new Error('LEGACY_IMPORT_SUBSTEPS_INVALID'); })());
    for (const [field, supplied, imported] of [['dependsOn', module.dependsOn, dependsOn], ['modulePath', blueprint.modulePath, modulePath], ['substeps', blueprint.substeps, substeps]] as const) {
      if (supplied !== undefined && canonicalJson(supplied) !== canonicalJson(imported ?? null)) throw new Error(`LEGACY_IMPORT_STRUCTURAL_CONFLICT:${legacyId}:${field}`);
    }
    return { ...module, dependsOn, blueprint: { ...blueprint, modulePath, ...(substeps === undefined ? {} : { substeps }) } };
  });
  const compiled = compileProject(project);
  return { project, definition: compiled.definition, report: {
    schemaVersion: 'nova-project-legacy-import-report.v1', legacyDigest: sha256Text(canonicalJson(legacy)),
    authoringDigest: sha256Text(canonicalJson(authoring)), projectDigest: sha256Text(canonicalJson(project)),
    imported: ['moduleIds', 'moduleDependencies', 'blueprintPaths', 'substeps'],
    gateDecisions, discardedRuntimeState: true, completionScope: 'authoring-only',
    ignoredLegacyModuleFields: Object.fromEntries(Object.entries(legacyModules).map(([key, value]) => [key, Object.keys(record(value, key)).filter(field => !['dir', 'depends_on', 'substeps'].includes(field)).sort()])),
    ignoredLegacyFields: Object.keys(legacy).filter(key => !['project', 'version', 'modules', 'gates'].includes(key)).sort(),
  } };
}
