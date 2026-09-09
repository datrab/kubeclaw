import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { verifyActionPins } from '../../../scripts/check-action-pins.mjs';

test('all actual active workflows and source action manifests are immutable and have provenance', () => {
  const result = verifyActionPins();
  assert(result.files >= 10); assert(result.external > 50); assert(result.local > 0);
});
test('original guard catches floating references, missing provenance and nested local composite actions', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'action-pins-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  fs.copyFileSync('.github/action-pins.json', path.join(root, '.github/action-pins.json'));
  const workflow = path.join(root, '.github/workflows/preserve.yaml');
  const original = fs.readFileSync('.github/workflows/publish-image-receipts.yaml', 'utf8');
  fs.writeFileSync(workflow, original);
  assert.equal(verifyActionPins(root).external, 3);
  fs.writeFileSync(workflow, original.replace(/actions\/download-artifact@[a-f0-9]{40}/u, 'actions/download-artifact@v4'));
  assert.throws(() => verifyActionPins(root), /NOT_IMMUTABLE/u);
  fs.writeFileSync(workflow, original.replace(/actions\/download-artifact@[a-f0-9]{40}/u, `actions/download-artifact@${'a'.repeat(40)}`));
  assert.throws(() => verifyActionPins(root), /PROVENANCE_MISSING/u);
  fs.writeFileSync(workflow, original);
  fs.mkdirSync(path.join(root, 'local-action'));
  const composite = path.join(root, 'local-action/action.yml');
  fs.writeFileSync(composite, 'runs:\n  using: composite\n  steps:\n    - uses: actions/checkout@v6\n');
  assert.throws(() => verifyActionPins(root), /NOT_IMMUTABLE/u);
  fs.writeFileSync(composite, 'runs:\n  using: composite\n  steps:\n    - uses: ./local-action\n');
  assert.equal(verifyActionPins(root).local, 1);
  fs.writeFileSync(composite, 'runs:\n  using: composite\n  using: node24\n');
  assert.throws(() => verifyActionPins(root), /YAML_INVALID/u);
});
