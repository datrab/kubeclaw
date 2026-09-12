import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PORTABLE_JSON_ENCODING } from '@kubeclaw/plugin-sdk';
import { compileProject } from '../../../skills/nova/project/compiler.ts';
import { compileProjectRecovery } from '../../../skills/nova/project/recovery.ts';
import { DELIVERY_MANIFEST_ENCODING } from '../../../skills/nova/project/delivery-manifest.ts';
import { PROJECT_REVIEW_SEMANTIC_ENCODING } from '../../../skills/nova/project/review-semantics.ts';
import { graphSnapshot, writeRunSnapshots } from '../../../skills/nova/core/execution/engine-snapshots.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import { projectSourceFixture } from './project-source-fixture.mjs';

test('delivery mode is independent across source, report, Review and topology and recovers the whole graph', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-v3-graph-')); let fixture;
  try {
    fixture = await projectSourceFixture(root, { review: true, clean: false });
    let combinations = 0;
    for (const moduleReview of [false, true]) for (const finalReview of [false, true]) {
      const project = structuredClone(fixture.project);
      for (const module of project.modules) { delete module.review; if (moduleReview) module.review = { agent: 'echo' }; }
      delete project.final.review; if (finalReview) project.final.review = { agent: 'echo' };
      for (const source of ['legacy', PORTABLE_JSON_ENCODING]) {
        for (const [report, semantic] of [['legacy', 'legacy'], [PORTABLE_JSON_ENCODING, 'legacy'],
          [PORTABLE_JSON_ENCODING, PROJECT_REVIEW_SEMANTIC_ENCODING]]) {
          for (const delivery of ['legacy', DELIVERY_MANIFEST_ENCODING]) {
            const compiled = compileProject(project, source, report, semantic, delivery);
            const summary = compiled.definition.stages.find(stage => stage.id === 'project-summary');
            assert.deepEqual(summary.config, delivery === 'legacy' ? {} : { deliveryManifestEncoding: DELIVERY_MANIFEST_ENCODING });
            assert.equal(summary.input.final.reviewArtifactEncoding,
              delivery !== 'legacy' && finalReview && report !== 'legacy' ? PORTABLE_JSON_ENCODING : undefined);
            assert.equal(summary.input.final.reviewSemanticEncoding,
              finalReview && semantic !== 'legacy' ? PROJECT_REVIEW_SEMANTIC_ENCODING : undefined);
            const storage = path.join(root, `${moduleReview}-${finalReview}-${source}-${report}-${semantic}-${delivery}`);
            const directory = runRoot(storage, compiled.runId); fs.mkdirSync(directory, { recursive: true });
            writeRunSnapshots(directory, graphSnapshot(compiled.definition), {});
            const before = fs.readFileSync(path.join(directory, 'run-snapshot.json'));
            assert.deepEqual(compileProjectRecovery(project, storage), compiled);
            assert.deepEqual(fs.readFileSync(path.join(directory, 'run-snapshot.json')), before);
            combinations += 1;
          }
        }
      }
    }
    assert.equal(combinations, 48);
    assert.deepEqual(compileProject(fixture.project),
      compileProject(fixture.project, PORTABLE_JSON_ENCODING, PORTABLE_JSON_ENCODING, 'legacy', 'legacy'));
    assert.throws(() => compileProject(fixture.project, 'legacy', 'legacy', 'legacy', 'future'),
      /PROJECT_DELIVERY_MANIFEST_ENCODING_INVALID/);
  } finally { await fixture?.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('recovery rejects missing, swapped, junk, unknown and foreign delivery selector authority', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-v3-tamper-')); let fixture;
  try {
    fixture = await projectSourceFixture(root, { review: true, clean: false });
    const compiled = compileProject(fixture.project, PORTABLE_JSON_ENCODING, PORTABLE_JSON_ENCODING,
      PROJECT_REVIEW_SEMANTIC_ENCODING, DELIVERY_MANIFEST_ENCODING);
    const cases = [
      ['missing', stages => stages.splice(stages.findIndex(stage => stage.id === 'project-summary'), 1), /SUMMARY_NODE_INVALID/],
      ['swapped', stages => { stages.find(stage => stage.id === 'project-summary').type = 'kubeclaw.lint.full'; }, /SUMMARY_NODE_INVALID/],
      ['junk', stages => { stages.find(stage => stage.id === 'project-summary').config.junk = true; }, /DELIVERY_MANIFEST_ENCODING_INVALID/],
      ['unknown', stages => { stages.find(stage => stage.id === 'project-summary').config.deliveryManifestEncoding = 'future'; }, /DELIVERY_MANIFEST_ENCODING_INVALID/],
      ['foreign', stages => { stages.find(stage => stage.id === 'final-lint').config.deliveryManifestEncoding = DELIVERY_MANIFEST_ENCODING; }, /DELIVERY_SELECTOR_FOREIGN/],
    ];
    for (const [name, mutate, expected] of cases) {
      const definition = structuredClone(compiled.definition); mutate(definition.stages);
      const storage = path.join(root, name), directory = runRoot(storage, compiled.runId); fs.mkdirSync(directory, { recursive: true });
      writeRunSnapshots(directory, graphSnapshot(definition), {});
      const before = fs.readFileSync(path.join(directory, 'run-snapshot.json'));
      assert.throws(() => compileProjectRecovery(fixture.project, storage), expected);
      assert.deepEqual(fs.readFileSync(path.join(directory, 'run-snapshot.json')), before);
    }
  } finally { await fixture?.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
