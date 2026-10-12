import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { bundleNames } from '../../fixtures/config/swarm-bundle.mjs';

for (const chart of ['prism', 'kubeclaw']) test(`${chart} package contains the complete canonical bundle and shared validator`, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'component-package-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  execFileSync('helm', ['package', `charts/${chart}`, '--destination', directory]);
  const archive = path.join(directory, fs.readdirSync(directory).find(name => name.endsWith('.tgz')));
  for (const name of bundleNames) {
    const actual = execFileSync('tar', ['-xzOf', archive, `${chart}/files/config/${name}`]);
    assert.deepEqual(actual, fs.readFileSync(`charts/kubeclaw/files/config/${name}`));
  }
  const helper = chart === 'prism' ? '_swarm-bundle.tpl' : '_swarm-config.tpl';
  assert.deepEqual(execFileSync('tar', ['-xzOf', archive, `${chart}/templates/${helper}`]),
    fs.readFileSync('charts/kubeclaw/templates/_swarm-config.tpl'));
});
