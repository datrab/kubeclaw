import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Invoked inside the original check-project-compiler fixture, before its own
// legacy cases. All acceptance/rejection calls use the original product CLI.
export async function reviewLegacy({ project, platformFile, temporary, runtime }) {
  const legacyFile = path.join(project.repositoryRoot, 'review-progress.json');
  const authoringFile = path.join(temporary, 'review-authoring.json');
  const legacy = { version: 1, project: project.id, run_id: 'old-authoritative-run',
    status: 'passed', approved: true, approval: { actor: 'legacy', decision: 'approved' },
    modules: Object.fromEntries(project.modules.map(module => [module.id, {
      dir: module.id, depends_on: module.dependsOn, status: 'passed', approved: true,
      attempts: 9, result: { accepted: true },
    }])), gates: { final: { status: 'passed', approved: true } } };
  const authored = structuredClone(project);
  for (const module of authored.modules) { delete module.dependsOn; delete module.blueprint.modulePath; }
  const authoring = { schemaVersion: 'nova-project-legacy-import.v1', project: authored,
    moduleIds: Object.fromEntries(project.modules.map(module => [module.id, module.id])),
    gateDecisions: { final: 'Reauthor cumulative checks; do not import the old passed verdict.' },
    acknowledgeLegacyPolicy: true };
  const cases = [];
  let sequence = 0;
  function launch({ input = legacy, authoredInput = authoring, source = legacyFile, output,
    writeSource = true, extra = [] } = {}) {
    const destination = output ?? path.join(temporary, `review-import-${sequence++}.json`);
    if (writeSource) fs.writeFileSync(source, JSON.stringify(input));
    fs.writeFileSync(authoringFile, JSON.stringify(authoredInput));
    const result = spawnSync(process.execPath, [path.join(runtime, 'pipeline.ts'),
      '--import-legacy', source, '--authoring', authoringFile, '--platform', platformFile,
      '--output', destination, ...extra], { cwd: temporary, encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.error, undefined);
    return { ...result, destination };
  }
  function rejected(name, options, pattern) {
    const result = launch(options);
    assert.notEqual(result.status, 0, name);
    assert.match(result.stderr, pattern, name);
    if (!options?.output) assert.equal(fs.existsSync(result.destination), false, name);
    cases.push({ name, status: result.status, error: JSON.parse(result.stderr).error });
  }
  const accepted = launch();
  assert.equal(accepted.status, 0, accepted.stderr);
  const imported = JSON.parse(fs.readFileSync(accepted.destination, 'utf8'));
  assert.equal(imported.runId, project.runId);
  assert.notEqual(imported.runId, legacy.run_id);
  assert.equal(imported.approved, undefined);
  assert.equal(imported.status, undefined);
  for (const module of imported.modules) {
    assert.equal(module.status, undefined); assert.equal(module.attempts, undefined);
    assert.equal(module.result, undefined); assert.equal(module.approved, undefined);
  }
  const report = JSON.parse(accepted.stdout);
  assert.equal(report.discardedRuntimeState, true);
  assert.equal(report.completionScope, 'authoring-only');
  const definition = path.join(temporary, 'review-compiled.json');
  const compiled = spawnSync(process.execPath, [path.join(runtime, 'pipeline.ts'),
    '--project', accepted.destination, '--platform', platformFile, '--compile', definition],
  { cwd: temporary, encoding: 'utf8', timeout: 30_000 });
  assert.equal(compiled.status, 0, compiled.stderr);
  const graph = JSON.parse(fs.readFileSync(definition, 'utf8'));
  assert(graph.stages.some(stage => stage.id === 'source-preflight'));
  assert(graph.stages.some(stage => stage.id === 'final-test'));
  assert.equal(fs.existsSync(path.join(temporary, 'state')), false);
  cases.push({ name: 'legacy verdicts discarded; original CLI recompile succeeds without execution', status: 0 });

  const sameRun = structuredClone(authoring); sameRun.project.runId = legacy.run_id;
  rejected('same legacy run rejected', { authoredInput: sameRun }, /NEW_RUN_REQUIRED/u);
  const approval = structuredClone(authoring); approval.project.approved = true;
  rejected('authoring cannot inject project approval', { authoredInput: approval }, /PROJECT_OBJECT_INVALID/u);
  const moduleState = structuredClone(authoring); moduleState.project.modules[0].status = 'passed';
  rejected('authoring cannot inject module state', { authoredInput: moduleState }, /PROJECT_OBJECT_INVALID/u);
  const coverage = structuredClone(authoring); coverage.project.final.test.requiredChecks = [];
  rejected('missing cumulative coverage rejected', { authoredInput: coverage }, /gateCoverage.*requiredChecks/u);
  const mapping = structuredClone(authoring); delete mapping.moduleIds[project.modules[0].id];
  rejected('incomplete module map rejected', { authoredInput: mapping }, /KEYS_MISMATCH/u);
  const policy = structuredClone(authoring); policy.gateDecisions = {};
  rejected('old gate cannot disappear without explicit decision', { authoredInput: policy }, /KEYS_MISMATCH/u);
  const traversal = structuredClone(legacy); traversal.modules[project.modules[0].id].dir = '../outside';
  rejected('module path traversal rejected', { input: traversal }, /SEGMENT_INVALID/u);
  const substep = structuredClone(legacy); substep.modules[project.modules[0].id].substeps = ['../outside'];
  rejected('substep path traversal rejected', { input: substep }, /SEGMENT_INVALID/u);

  const outside = path.join(temporary, 'outside-progress.json'); fs.writeFileSync(outside, JSON.stringify(legacy));
  const sourceLink = path.join(project.repositoryRoot, 'outside-progress-link.json'); fs.symlinkSync(outside, sourceLink);
  rejected('source symlink escaping repository rejected', { source: sourceLink, writeSource: false }, /SOURCE_OUTSIDE_REPOSITORY/u);
  const alias = path.join(temporary, 'repository-alias'); fs.symlinkSync(project.repositoryRoot, alias);
  const aliasInput = structuredClone(authoring); aliasInput.project.repositoryRoot = alias;
  rejected('noncanonical repository alias rejected', { authoredInput: aliasInput }, /CANONICAL_REPOSITORY/u);

  const sentinel = path.join(temporary, 'review-existing'); fs.writeFileSync(sentinel, 'preserve me');
  rejected('existing output is never overwritten', { output: sentinel }, /EEXIST/u);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve me');
  const outputLink = path.join(temporary, 'review-output-link'); fs.symlinkSync(sentinel, outputLink);
  rejected('existing output symlink is not followed', { output: outputLink }, /EEXIST/u);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve me');
  const missing = path.join(temporary, 'review-missing-target');
  const dangling = path.join(temporary, 'review-dangling-output'); fs.symlinkSync(missing, dangling);
  rejected('dangling output symlink is not followed', { output: dangling }, /EEXIST/u);
  assert.equal(fs.existsSync(missing), false);
  rejected('output cannot overwrite source', { output: legacyFile }, /EEXIST/u);
  assert.deepEqual(JSON.parse(fs.readFileSync(legacyFile, 'utf8')), legacy);
  rejected('import cannot be combined with project execution', { extra: ['--project', accepted.destination] }, /ARGUMENT_INVALID/u);
  assert.equal(fs.existsSync(path.join(temporary, 'state')), false);
  console.log(JSON.stringify({ review: 'independent-legacy-import', sourceCommit: 'ba999e2', cases,
    compilerAndFilesystem: 'original', executedStages: 0, runtimeAcceptance: false }));
}
