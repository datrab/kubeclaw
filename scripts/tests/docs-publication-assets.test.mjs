import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { publicationAssets, copyPublicationAssets } from '../lib/docs-publication-assets.mjs';

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
