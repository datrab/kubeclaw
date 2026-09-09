import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { verifyReleaseConfiguration } from '../../../scripts/updates/release-configuration.mjs';

function repository(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-configuration-'));
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (name, content) => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), content); };
  const commit = () => { git(['add', '.']); git(['-c', 'user.name=Release Test', '-c', 'user.email=release@example.invalid', 'commit', '-qm', 'Configuration fixture']); return git(['rev-parse', 'HEAD']); };
  try {
    git(['init', '-q']);
    for (const chart of ['kubeclaw', 'prism', 'ops-pod']) write(`charts/${chart}/values.yaml`, 'enabled: true\n');
    for (const role of ['nova', 'buster', 'prism-agent', 'prism']) write(`my-values/${role}-values.yaml`, 'enabled: true\n');
    const source = commit();
    run({ root, git, write, commit, source });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('unchanged release configuration survives unrelated later commits, but new chart or values cannot qualify old images', () => repository(({ root, write, commit, source }) => {
  verifyReleaseConfiguration(root, source, 'runtime');
  write('docs/note.md', 'Unrelated new documentation\n');
  commit();
  verifyReleaseConfiguration(root, source, 'runtime');
  write('charts/prism/values.yaml', 'newIncompatibleProtocol: 2\n');
  commit();
  assert.throws(() => verifyReleaseConfiguration(root, source, 'runtime'), /RELEASE_CONFIGURATION_CHANGED: charts\/prism\/values.yaml/u);
  verifyReleaseConfiguration(root, source, 'ops');
  write('charts/prism/values.yaml', 'enabled: true\n');
  write('my-values/nova-values.yaml', 'newUnknownRuntimeOption: true\n');
  assert.throws(() => verifyReleaseConfiguration(root, source, 'runtime'), /RELEASE_CONFIGURATION_CHANGED: my-values\/nova-values.yaml/u);
}));

test('deleted, added, symlinked, and unavailable source configurations fail explicitly', () => repository(({ root, git, write, source }) => {
  const value = 'charts/kubeclaw/values.yaml';
  fs.unlinkSync(path.join(root, value));
  assert.throws(() => verifyReleaseConfiguration(root, source, 'runtime'), /RELEASE_CONFIGURATION_FILESET_CHANGED/u);
  git(['restore', value]);
  write('charts/kubeclaw/new-template.yaml', 'kind: Deployment\n');
  assert.throws(() => verifyReleaseConfiguration(root, source, 'runtime'), /RELEASE_CONFIGURATION_FILESET_CHANGED/u);
  fs.unlinkSync(path.join(root, 'charts/kubeclaw/new-template.yaml'));
  fs.unlinkSync(path.join(root, value));
  fs.symlinkSync('../prism/values.yaml', path.join(root, value));
  assert.throws(() => verifyReleaseConfiguration(root, source, 'runtime'), /RELEASE_CONFIGURATION_SYMLINK/u);
  fs.unlinkSync(path.join(root, value));
  git(['restore', value]);
  assert.throws(() => verifyReleaseConfiguration(root, 'f'.repeat(40), 'runtime'), /not a tree object/u);
}));

test('ops chart has its own source binding, independent of runtime-only changes', () => repository(({ root, write, commit, source }) => {
  write('charts/ops-pod/values.yaml', 'incompatibleConfig: true\n');
  commit();
  assert.throws(() => verifyReleaseConfiguration(root, source, 'ops'), /RELEASE_CONFIGURATION_CHANGED/u);
  verifyReleaseConfiguration(root, source, 'runtime');
}));
