import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export async function checkLegacyProjectImport({ project, platformFile, temporary, runtime, compilerFile }: any) {
  const { compileProject } = await import(pathToFileURL(compilerFile).href);
  const { importLegacyProject } = await import(pathToFileURL(path.join(path.dirname(compilerFile), 'legacy-import.ts')).href);
  const legacyFile = path.join(project.repositoryRoot, 'progress.json');
  fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
  const legacy = { project: project.id, version: 1, run_id: 'old-run', status: 'passed', approved: true,
    modules: Object.fromEntries(project.modules.map((module: any) => [`old-${module.id}`, {
      dir: module.id, depends_on: module.dependsOn.map((id: string) => `old-${id}`), status: 'passed',
    }])), gates: { 'old-final': { status: 'passed' } } };
  const authored = structuredClone(project);
  for (const module of authored.modules) { delete module.dependsOn; delete module.blueprint.modulePath; }
  const authoring = { schemaVersion: 'nova-project-legacy-import.v1', project: authored,
    moduleIds: Object.fromEntries(project.modules.map((module: any) => [`old-${module.id}`, module.id])),
    gateDecisions: { 'old-final': 'Replaced by explicitly authored cumulative final-test coverage.' }, acknowledgeLegacyPolicy: true };
  const imported = importLegacyProject(legacy, authoring, legacyFile);
  assert.deepEqual(imported.definition, compileProject(imported.project).definition,
    'legacy authoring import preserves the exact old compiler API definition');
  assert(imported.definition.stages.filter((stage: any) => stage.type === 'kubeclaw.decision.review')
    .every((stage: any) => !Object.hasOwn(stage.config, 'reviewSemanticEncoding')));
  assert.equal(imported.project.runId, project.runId);
  assert.equal(imported.project.approved, undefined); assert.equal(imported.project.status, undefined);
  assert.equal(imported.report.completionScope, 'authoring-only');
  for (const module of imported.project.modules) {
    assert.deepEqual(module.dependsOn, project.modules.find((item: any) => item.id === module.id).dependsOn);
    assert.equal(module.blueprint.modulePath, `modules/${module.id}`);
    assert.equal(module.status, undefined);
  }
  for (const [modify, expected] of [
    [(input: any) => { delete input.project.modules[0].requirements; }, /PROJECT_REQUIREMENTS_REQUIRED/],
    [(input: any) => { delete input.project.final; }, /PROJECT_/],
    [(input: any) => { input.project.modules[0].dependsOn = ['unrelated']; }, /STRUCTURAL_CONFLICT/],
    [(input: any) => { delete input.moduleIds[Object.keys(input.moduleIds)[0]]; }, /KEYS_MISMATCH/],
    [(input: any) => { input.gateDecisions = {}; }, /KEYS_MISMATCH/],
    [(input: any) => { input.acknowledgeLegacyPolicy = false; }, /POLICY_ACKNOWLEDGEMENT/],
    [(input: any) => { input.project.runId = 'old-run'; }, /NEW_RUN_REQUIRED/],
  ] as const) {
    const invalid = structuredClone(authoring); modify(invalid);
    assert.throws(() => importLegacyProject(legacy, invalid, legacyFile), expected);
  }
  const foreign = structuredClone(legacy); foreign.modules['old-app'].depends_on = ['old-final'];
  assert.throws(() => importLegacyProject(foreign, authoring, legacyFile), /NONMODULE_DEPENDENCY/);
  assert.throws(() => importLegacyProject(legacy, authoring, path.join(temporary, 'outside.json')), /SOURCE_OUTSIDE_REPOSITORY/);
  const authoringFile = path.join(temporary, 'authoring.json'), output = path.join(temporary, 'imported-project.json');
  fs.writeFileSync(legacyFile, JSON.stringify(legacy)); fs.writeFileSync(authoringFile, JSON.stringify(authoring));
  const launch = () => spawnSync(process.execPath, [path.join(runtime, 'pipeline.ts'), '--import-legacy', legacyFile,
    '--authoring', authoringFile, '--platform', platformFile, '--output', output], { cwd: temporary, encoding: 'utf8', timeout: 30000 });
  const result = launch(); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), imported.project);
  const before = fs.readFileSync(output, 'utf8'); const repeated = launch();
  assert.notEqual(repeated.status, 0); assert.match(repeated.stderr, /EEXIST/); assert.equal(fs.readFileSync(output, 'utf8'), before);
  fs.rmSync(output);
  const platform = JSON.parse(fs.readFileSync(platformFile, 'utf8'));
  delete platform.grants['kubeclaw.implementation-agent:implementation'];
  fs.writeFileSync(platformFile, JSON.stringify(platform));
  const rejected = launch(); assert.notEqual(rejected.status, 0); assert.equal(fs.existsSync(output), false);
  console.log(JSON.stringify({ ok: true, scope: 'legacy-authoring-import', executedStages: 0, nativeAcceptance: false }));
}
