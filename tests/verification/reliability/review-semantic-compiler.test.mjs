import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PORTABLE_JSON_ENCODING } from '@kubeclaw/plugin-sdk';
import { compileProject } from '../../../skills/nova/project/compiler.ts';
import { compileProjectRecovery } from '../../../skills/nova/project/recovery.ts';
import { PROJECT_REVIEW_SEMANTIC_ENCODING as mode } from '../../../skills/nova/project/review-semantics.ts';
import { graphSnapshot, writeRunSnapshots } from '../../../skills/nova/core/execution/engine-snapshots.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import { projectSourceFixture } from './project-source-fixture.mjs';

test('independent semantic authority covers module-only, final-only, both and neither graph roundtrips', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-semantic-graph-')); let fixture;
  try {
    fixture = await projectSourceFixture(root, { review: true, clean: false });
    for (const moduleReview of [false, true]) for (const finalReview of [false, true]) {
      const project = structuredClone(fixture.project);
      for (const module of project.modules) { delete module.review; if (moduleReview) module.review = { agent: 'echo' }; }
      delete project.final.review; if (finalReview) project.final.review = { agent: 'echo' };
      for (const source of ['legacy', PORTABLE_JSON_ENCODING]) for (const semantic of ['legacy', mode]) {
        const compiled = compileProject(project, source, PORTABLE_JSON_ENCODING, semantic);
        const reviews = compiled.definition.stages.filter(s => s.type === 'kubeclaw.decision.review');
        assert.equal(reviews.length, (moduleReview ? project.modules.length : 0) + (finalReview ? 1 : 0));
        for (const stage of reviews) assert.equal(stage.config.reviewSemanticEncoding, semantic === 'legacy' ? undefined : mode);
        const summary = compiled.definition.stages.find(s => s.id === 'project-summary');
        assert.equal(summary.input.final.reviewSemanticEncoding, finalReview && semantic !== 'legacy' ? mode : undefined);
        const storage = path.join(root, `${moduleReview}-${finalReview}-${source}-${semantic}`);
        const directory = runRoot(storage, compiled.runId); fs.mkdirSync(directory, { recursive: true });
        writeRunSnapshots(directory, graphSnapshot(compiled.definition), {});
        const before = fs.readFileSync(path.join(directory, 'run-snapshot.json'));
        assert.deepEqual(compileProjectRecovery(project, storage), compiled);
        assert.deepEqual(fs.readFileSync(path.join(directory, 'run-snapshot.json')), before);
      }
      const old = compileProject(project);
      assert.deepEqual(old, compileProject(project, PORTABLE_JSON_ENCODING, PORTABLE_JSON_ENCODING, 'legacy'));
    }
    assert.throws(() => compileProject(fixture.project, 'legacy', 'legacy', mode), /SEMANTIC_REPORT_ENCODING_REQUIRED/);
    assert.throws(() => compileProject(fixture.project, 'legacy', PORTABLE_JSON_ENCODING, 'future'), /SEMANTIC_ENCODING_INVALID/);
  } finally { await fixture?.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('new semantic graph rejects mixed, unsupported, partial and stray Summary mode without changing stored bytes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-semantic-tamper-')); let fixture;
  try {
    fixture = await projectSourceFixture(root, { review: true, clean: false });
    fixture.project.modules[0].review = { agent: 'echo' }; fixture.project.final.review = { agent: 'echo' };
    const compiled = compileProject(fixture.project, PORTABLE_JSON_ENCODING, PORTABLE_JSON_ENCODING, mode);
    const cases = [
      ['mixed', stages => { delete stages.find(s => s.type === 'kubeclaw.decision.review').config.reviewSemanticEncoding; }, /SEMANTICS_MIXED/],
      ['unknown', stages => { for (const s of stages.filter(s => s.type === 'kubeclaw.decision.review')) s.config.reviewSemanticEncoding = 'future'; }, /SEMANTICS_INVALID/],
      ['summary-absent', stages => { delete stages.find(s => s.id === 'project-summary').input.final.reviewSemanticEncoding; }, /RECOVERY_GRAPH_DIGEST_MISMATCH/],
      ['summary-unknown', stages => { stages.find(s => s.id === 'project-summary').input.final.reviewSemanticEncoding = 'future'; }, /RECOVERY_GRAPH_DIGEST_MISMATCH/],
    ];
    for (const [name, mutate, expected] of cases) {
      const definition = structuredClone(compiled.definition); mutate(definition.stages);
      const storage = path.join(root, name), directory = runRoot(storage, compiled.runId); fs.mkdirSync(directory, { recursive: true });
      writeRunSnapshots(directory, graphSnapshot(definition), {}); const before = fs.readFileSync(path.join(directory, 'run-snapshot.json'));
      assert.throws(() => compileProjectRecovery(fixture.project, storage), expected);
      assert.deepEqual(fs.readFileSync(path.join(directory, 'run-snapshot.json')), before);
    }
    const noReview = structuredClone(fixture.project); for (const m of noReview.modules) delete m.review; delete noReview.final.review;
    const absent = compileProject(noReview, PORTABLE_JSON_ENCODING, PORTABLE_JSON_ENCODING, mode);
    absent.definition.stages.find(s => s.id === 'project-summary').input.final.reviewSemanticEncoding = mode;
    const storage = path.join(root, 'stray'), directory = runRoot(storage, absent.runId); fs.mkdirSync(directory, { recursive: true });
    writeRunSnapshots(directory, graphSnapshot(absent.definition), {});
    assert.throws(() => compileProjectRecovery(noReview, storage), /RECOVERY_GRAPH_DIGEST_MISMATCH/);
  } finally { await fixture?.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
