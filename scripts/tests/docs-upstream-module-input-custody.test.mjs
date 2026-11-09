import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { documentationModuleInputAuthority } from '../docs-api-output-discovery.mjs';

const repository = path.resolve(import.meta.dirname, '../..');
const source = 'scripts/check-platform-specialist-guides.mjs';
const manifest = 'scripts/ops-mcp-docs-upstream.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upstream-module-custody-'));
  const registry = JSON.parse(fs.readFileSync(path.join(repository,
    'scripts/docs-api-producer-adapter-authorities.json'), 'utf8'));
  const recipe = registry.documentationToolBoundary.unresolvedModuleInputAuthorities
    .find(record => record.source === source);
  const boundary = { unresolvedModuleInputAuthorities: [structuredClone(recipe)] };
  const operation = recipe.operations[0];
  const graph = { dynamicOperations: [{ source, expression: operation.expression,
    operation: operation.expression }] };
  try {
    for (const file of [source, ...recipe.authorityInputs.map(input => input.path),
      ...recipe.inputConstraints.modulePaths]) {
      const target = path.join(root, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(repository, file), target);
    }
    const verify = () => documentationModuleInputAuthority(root, boundary, graph);
    const original = verify(); // genuine positive before every mutation
    assert.match(original, /^[a-f0-9]{64}$/u);
    run({ root, boundary, graph, verify, original });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('same graph reacquires the passive upstream authority before reuse', () => {
  for (const mode of ['change', 'remove', 'symlink']) fixture(({ root, verify, original }) => {
    assert.equal(verify(), original);
    const file = path.join(root, manifest);
    if (mode === 'change') fs.appendFileSync(file, '\n');
    else if (mode === 'remove') fs.unlinkSync(file);
    else {
      fs.renameSync(file, file + '.moved');
      fs.symlinkSync(file + '.moved', file);
    }
    assert.throws(verify, /GRAPH_UNQUALIFIED.*input\/caller authority changed.*ops-mcp-docs-upstream/);
  });
});

test('mutable manifest digest refresh cannot replace independent recipe authority', () => fixture(({ root, boundary, verify }) => {
  const file = path.join(root, manifest);
  fs.appendFileSync(file, '\n');
  boundary.unresolvedModuleInputAuthorities[0].authorityInputs
    .find(input => input.path === manifest).sha256 = hash(fs.readFileSync(file));
  assert.throws(verify, /GRAPH_UNQUALIFIED.*no reviewed semantic input authority/);
}));

test('caller and helper edits remain denied under the exact finite successor', () => {
  for (const file of [source, 'scripts/docs-source-evidence-pin.mjs']) fixture(({ root, verify }) => {
    fs.appendFileSync(path.join(root, file), '\n// changed source\n');
    assert.throws(verify, /GRAPH_UNQUALIFIED.*input\/caller authority changed/);
  });
});

test('new modules and changed import receipts cannot expand the sealed four-module domain', () => {
  fixture(({ boundary, verify }) => {
    boundary.unresolvedModuleInputAuthorities[0].inputConstraints.modulePaths.push('new.mjs');
    assert.throws(verify, /GRAPH_UNQUALIFIED.*no reviewed semantic input authority/);
  });
  fixture(({ graph, verify }) => {
    graph.dynamicOperations[0].operation += ' ';
    assert.throws(verify, /GRAPH_UNQUALIFIED.*outside its semantic input recipe/);
  });
});
