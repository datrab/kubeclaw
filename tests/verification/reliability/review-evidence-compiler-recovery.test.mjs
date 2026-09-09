import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { projectSourceFixture } from './project-source-fixture.mjs';
import { materializeCurrentCore } from './repair-identity-historical.mjs';
import { compileProjectRecovery } from '../../../skills/nova/project/recovery.ts';
import { graphSnapshot, writeRunSnapshots } from '../../../skills/nova/core/execution/engine-snapshots.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';

test('original compiler module-review graph remains recoverable under its existing source version', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'review-compiler-recovery-')); let fixture;
  try {
    const overlay = materializeCurrentCore(path.join(temporary, 'original'));
    const original = JSON.parse(fs.readFileSync(new URL('../../fixtures/repair-budget/legacy-review-compiler.json', import.meta.url), 'utf8'));
    const bytes = Buffer.from(original.content);
    assert.equal(crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), original.gitBlob);
    const target = path.join(overlay.destination, original.path); fs.writeFileSync(target, bytes);
    const { compileProject } = await import(pathToFileURL(target).href);
    const root = path.join(temporary, 'case'); fs.mkdirSync(root);
    fixture = await projectSourceFixture(root, { review: true, clean: false });
    fixture.project.modules[0].review = { agent: 'echo' };
    const compiled = compileProject(fixture.project);
    const review = compiled.definition.stages.find(stage => stage.id === `review-${fixture.project.modules[0].id}`);
    assert(review); assert(review.input.evidence.every(item => !Object.hasOwn(item, 'encoding')));
    const storageRoot = path.join(root, 'stored'); const directory = runRoot(storageRoot, compiled.runId);
    fs.mkdirSync(directory, { recursive: true }); writeRunSnapshots(directory, graphSnapshot(compiled.definition), {});
    const before = fs.readFileSync(path.join(directory, 'run-snapshot.json'));
    assert.deepEqual(compileProjectRecovery(fixture.project, storageRoot), compiled);
    assert.deepEqual(fs.readFileSync(path.join(directory, 'run-snapshot.json')), before);
  } finally { await fixture?.close(); fs.rmSync(temporary, { recursive: true, force: true }); }
});
