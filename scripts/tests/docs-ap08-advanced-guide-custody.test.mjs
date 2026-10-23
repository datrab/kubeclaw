import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');

test('real advanced-guide owner accepts only the exact reviewed coverage locator', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ap08-guide-custody-'));
  const run = (command, args) => {
    const result = spawnSync(command, args, { cwd: fixture, encoding: 'utf8' });
    assert(!result.error && !result.signal, String(result.error ?? result.signal));
    return result;
  };
  const copy = relative => {
    const target = path.join(fixture, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, relative), target);
  };
  const checker = () => run(process.execPath, ['scripts/check-ap08-advanced-guides.mjs']);
  try {
    const clone = run('git', ['clone', '--shared', '--no-checkout', '--quiet', root, fixture]);
    assert.equal(clone.status, 0, clone.stderr);
    copy('scripts/check-ap08-advanced-guides.mjs');
    for (const page of ['contracts', 'effectful-plugin', 'buster', 'nova']) copy(`docs/site/extend/${page}.md`);
    for (const owner of ['nova', 'buster']) {
      const directory = `skills/${owner}/plugins`;
      for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
        const relative = `${directory}/${entry.name}/plugin.json`;
        if (entry.isDirectory() && fs.existsSync(path.join(root, relative))) copy(relative);
      }
    }
    const suites = 'contracts/pipeline-test-gate/v1/suites';
    for (const name of fs.readdirSync(path.join(root, suites))) if (name.endsWith('.json')) copy(`${suites}/${name}`);
    const baseline = checker();
    assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
    assert.equal(JSON.parse(baseline.stdout).pages, 4);
    const busterPath = path.join(fixture, 'docs/site/extend/buster.md');
    const novaPath = path.join(fixture, 'docs/site/extend/nova.md');
    const original = fs.readFileSync(busterPath, 'utf8');
    const nova = fs.readFileSync(novaPath, 'utf8');
    const locator = 'https://github.com/datrab/kubeclaw/blob/399d775e8efa7b54267af98d04463d6480e63684/skills/buster/plugins/coverage-budget/tests/live-function.test.ts#L9-L51';
    assert.equal(original.split(locator).length, 2, 'control must target exactly one real published locator');
    for (const [label, changed] of [
      ['stale assessment revision', locator.replace('399d775e8efa7b54267af98d04463d6480e63684', 'bcf032f241b432bf920baa9ee5f727947921447d')],
      ['arbitrary revision', locator.replace('399d775e8efa7b54267af98d04463d6480e63684', 'a'.repeat(40))],
      ['different range', locator.replace('#L9-L51', '#L8-L51')],
      ['different source', locator.replace('/live-function.test.ts', '/unreviewed.test.ts')],
    ]) {
      fs.writeFileSync(busterPath, original.replace(locator, changed));
      const rejected = checker();
      assert.equal(rejected.status, 1, `${label}: ${rejected.stdout}${rejected.stderr}`);
      assert.match(rejected.stderr, /uses an unreviewed revision/, label);
      fs.writeFileSync(busterPath, original);
      assert.equal(checker().status, 0, `${label}: restored baseline`);
    }
    fs.writeFileSync(novaPath, `${nova}\n[Wrong guide custody](${locator})\n`);
    const wrongGuide = checker();
    assert.equal(wrongGuide.status, 1, wrongGuide.stdout + wrongGuide.stderr);
    assert.match(wrongGuide.stderr, /uses an unreviewed revision/);
    fs.writeFileSync(novaPath, nova);
    assert.equal(checker().status, 0, 'final restored baseline');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
