import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { publicationAssets, copyPublicationAssets, publicationPages } from '../lib/docs-publication-assets.mjs';

function classification(...paths) {
  return { schemaVersion: 'kubeclaw-documentation-tree-classification.v1', files: paths.map(name => ({
    path: `docs/site/${name}`, expectedPath: `docs/site/${name}`, class: 'canonical-reader-documentation',
  })) };
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-publication-assets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const site = path.join(root, 'site');
  fs.mkdirSync(site);
  const write = (name, content) => {
    const target = path.join(site, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  return { root, site, write };
}

test('published reader links retain exact runnable input and example dependency bytes', t => {
  const { root, site, write } = fixture(t);
  write('use/workflows/wait-resume.md', '[Signal](wait-resume/signal.template.json)\n');
  write('use/workflows/wait-resume/signal.template.json', '{"waitId":"replace-me"}\n');
  write('extend/examples/minimal-stage/src/stage.js', 'export const execute = () => ({ok:true});\n');
  write('reference/documentation-route-registry.json', '{"routes":[]}\n');
  const output = path.join(root, 'output');
  const assets = publicationAssets(site);
  assert.equal(assets.length, 3);
  copyPublicationAssets(site, output, assets);
  for (const relative of assets) {
    assert.deepEqual(fs.readFileSync(path.join(output, relative)), fs.readFileSync(path.join(site, relative)));
  }
  assert.equal(fs.existsSync(path.join(output, 'use/workflows/wait-resume.md')), false);
});

test('an internal record under the reader root cannot silently enter or disappear from publication', t => {
  const { site, write } = fixture(t);
  write('reference/private-review.json', '{"internal":true}\n');
  assert.throws(() => publicationAssets(site), /no publication allowance: reference\/private-review.json/u);
});

for (const directory of ['extend/examples/minimal-stage', 'use/workflows/examples', 'use/workflows/wait-resume']) {
  test(`unapproved artifacts inside ${directory} stop publication`, t => {
    const { site, write } = fixture(t);
    write('use/workflows/wait-resume/signal.template.json', '{}\n');
    write(`${directory}/nested/private-review.json`, '{"internal":true}\n');
    assert.throws(() => publicationAssets(site), /no publication allowance: .*\/nested\/private-review.json/u);
  });
}

test('an allowed-looking symlink cannot publish data outside the reader tree', t => {
  const { root, site, write } = fixture(t);
  write('use/workflows/wait-resume/signal.template.json', '{}\n');
  const external = path.join(root, 'private.json');
  fs.writeFileSync(external, '{"private":true}\n');
  fs.symlinkSync(external, path.join(site, 'use/workflows/wait-resume/leaked.json'));
  assert.throws(() => publicationAssets(site), /must not be a symlink/u);
});

test('publication includes exactly the registered canonical reader pages', t => {
  const { site, write } = fixture(t);
  write('README.md', '# Reader\n');
  write('use/task.md', '# Task\n');
  assert.deepEqual(publicationPages(site, classification('README.md', 'use/task.md')),
    [path.join(site, 'README.md'), path.join(site, 'use/task.md')]);
  write('use/private.md', '# Internal notes\nStatus: current\nAudience: operator\n');
  assert.throws(() => publicationPages(site, classification('README.md', 'use/task.md')),
    /no publication allowance: use\/private.md/u);
});

test('missing and noncanonical reader pages stop publication', t => {
  const { site, write } = fixture(t);
  write('README.md', '# Reader\n');
  assert.throws(() => publicationPages(site, classification('README.md', 'use/missing.md')),
    /Registered reader pages are missing: use\/missing.md/u);
  const registry = classification('README.md');
  registry.files[0].class = 'internal-documentation-input';
  assert.throws(() => publicationPages(site, registry), /no canonical publication classification/u);
});

test('invalid classification cannot broaden the publication boundary', t => {
  const { site, write } = fixture(t);
  write('README.md', '# Reader\n');
  assert.throws(() => publicationPages(site, {}), /explicit documentation classification/u);
  assert.throws(() => publicationPages(site, classification('README.md', 'README.md')), /duplicate/u);
  assert.throws(() => publicationPages(site, classification('../private.md')), /no canonical/u);
  const registry = classification('README.md');
  registry.files[0].expectedPath = 'docs/site/other.md';
  assert.throws(() => publicationPages(site, registry), /no canonical/u);
});
