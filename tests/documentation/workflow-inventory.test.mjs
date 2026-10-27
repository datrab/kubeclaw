import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildWorkflowInventory } from '../../scripts/docs-inventory.mjs';

test('workflow trigger filters are not published as executable commands', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-workflow-commands-'));
  try {
    const directory = path.join(root, '.github/workflows');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'promote.yaml'), `name: Promotion
on:
  workflow_run:
    workflows: [Build Runtime Images And Skill Bundles]
    types: [completed]
jobs:
  publish:
    steps:
      - run: node scripts/promote.mjs
      - name: Validate
        run: |
          npm run docs:check
      - uses: actions/checkout@0000000000000000000000000000000000000000
`);
    const [workflow] = buildWorkflowInventory(root).workflows;
    assert.deepEqual(workflow.triggers, ['workflow_run']);
    assert.deepEqual(workflow.commandAndActionRefs, [
      'node scripts/promote.mjs',
      'npm run docs:check',
      'uses: actions/checkout@0000000000000000000000000000000000000000',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
