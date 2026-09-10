import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const sourceRoot = process.env.KUBECLAW_REVIEW_SOURCE_ROOT;
const baselineRoot = process.env.KUBECLAW_REVIEW_BASELINE_ROOT;
assert(sourceRoot && path.isAbsolute(sourceRoot), 'KUBECLAW_REVIEW_SOURCE_ROOT must be absolute');
assert(baselineRoot && path.isAbsolute(baselineRoot), 'KUBECLAW_REVIEW_BASELINE_ROOT must be absolute');

const from = async (root, relative) => import(pathToFileURL(path.join(root, relative)).href);
const [{ compileProject }, { compileProject: compileBaseline }, { compileProjectRecovery }, snapshots, roots, fixtureModule, sdk] = await Promise.all([
  from(sourceRoot, 'skills/nova/project/compiler.ts'),
  from(baselineRoot, 'skills/nova/project/compiler.ts'),
  from(sourceRoot, 'skills/nova/project/recovery.ts'),
  from(sourceRoot, 'skills/nova/core/execution/engine-snapshots.ts'),
  from(sourceRoot, 'skills/nova/core/execution/run-root.ts'),
  from(sourceRoot, 'tests/verification/reliability/project-source-fixture.mjs'),
  import('@kubeclaw/plugin-sdk'),
]);

const DELIVERY = 'delivery-manifest.utf16-v1';
const REVIEW = 'review-semantics.utf16-v1';
const PORTABLE = sdk.PORTABLE_JSON_ENCODING;

test('legacy delivery defaults preserve the exact pre-v3 compiler graph for every prior identity tuple', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-v3-parity-'));
  let fixture;
  try {
    fixture = await fixtureModule.projectSourceFixture(temporary, { review: true, clean: false });
    fixture.project.modules[0].review = { agent: 'echo' };
    fixture.project.final.review = { agent: 'echo' };
    for (const source of ['legacy', PORTABLE]) {
      for (const report of ['legacy', PORTABLE]) {
        for (const semantic of ['legacy', REVIEW]) {
          if (semantic !== 'legacy' && report === 'legacy') continue;
          const before = compileBaseline(fixture.project, source, report, semantic);
          assert.deepEqual(compileProject(fixture.project, source, report, semantic), before);
          assert.deepEqual(compileProject(fixture.project, source, report, semantic, 'legacy'), before);
        }
      }
    }
  } finally {
    await fixture?.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('delivery identity composes with all prior identities and recovery reconstructs the exact graph', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-v3-recovery-'));
  let fixture;
  try {
    fixture = await fixtureModule.projectSourceFixture(temporary, { review: true, clean: false });
    fixture.project.modules[0].review = { agent: 'echo' };
    fixture.project.final.review = { agent: 'echo' };
    for (const source of ['legacy', PORTABLE]) {
      for (const report of ['legacy', PORTABLE]) {
        for (const semantic of ['legacy', REVIEW]) {
          if (semantic !== 'legacy' && report === 'legacy') continue;
          for (const delivery of ['legacy', DELIVERY]) {
            const compiled = compileProject(fixture.project, source, report, semantic, delivery);
            const summary = compiled.definition.stages.find(stage => stage.id === 'project-summary');
            assert.deepEqual(summary.config, delivery === 'legacy' ? {} : { deliveryManifestEncoding: DELIVERY });
            const storage = path.join(temporary, `${source}-${report}-${semantic}-${delivery}`);
            const directory = roots.runRoot(storage, compiled.runId);
            fs.mkdirSync(directory, { recursive: true });
            snapshots.writeRunSnapshots(directory, snapshots.graphSnapshot(compiled.definition), {});
            const before = fs.readFileSync(path.join(directory, 'run-snapshot.json'));
            assert.deepEqual(compileProjectRecovery(fixture.project, storage), compiled);
            assert.deepEqual(fs.readFileSync(path.join(directory, 'run-snapshot.json')), before);
          }
        }
      }
    }
  } finally {
    await fixture?.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('delivery recovery rejects absent, unknown, duplicate and foreign selectors without changing stored bytes', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-v3-recovery-negative-'));
  let fixture;
  try {
    fixture = await fixtureModule.projectSourceFixture(temporary, { review: true, clean: false });
    const compiled = compileProject(fixture.project, PORTABLE, PORTABLE, REVIEW, DELIVERY);
    const duplicate = structuredClone(compiled.definition);
    duplicate.stages.push(structuredClone(duplicate.stages.find(stage => stage.id === 'project-summary')));
    assert.throws(() => snapshots.graphSnapshot(duplicate), /GRAPH_DUPLICATE_STAGE/);
    const cases = [
      ['missing', stages => { stages.splice(stages.findIndex(stage => stage.id === 'project-summary'), 1); }, /PROJECT_RECOVERY_SUMMARY_NODE_INVALID/],
      ['unknown', stages => { stages.find(stage => stage.id === 'project-summary').config.deliveryManifestEncoding = 'future'; }, /PROJECT_RECOVERY_DELIVERY_MANIFEST_ENCODING_INVALID/],
      ['foreign', stages => { stages.find(stage => stage.id !== 'project-summary').config.deliveryManifestEncoding = DELIVERY; }, /PROJECT_RECOVERY_DELIVERY_SELECTOR_FOREIGN/],
    ];
    for (const [name, mutate, expected] of cases) {
      const definition = structuredClone(compiled.definition);
      mutate(definition.stages);
      const storage = path.join(temporary, name);
      const directory = roots.runRoot(storage, compiled.runId);
      fs.mkdirSync(directory, { recursive: true });
      snapshots.writeRunSnapshots(directory, snapshots.graphSnapshot(definition), {});
      const before = fs.readFileSync(path.join(directory, 'run-snapshot.json'));
      assert.throws(() => compileProjectRecovery(fixture.project, storage), expected);
      assert.deepEqual(fs.readFileSync(path.join(directory, 'run-snapshot.json')), before);
    }
  } finally {
    await fixture?.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
