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

const aliases = {
  'charts/prism/files/config/swarm.config.json': '../../../kubeclaw/files/config/swarm.config.json',
  'charts/prism/files/config/swarm.schema.json': '../../../../skills/common/plugin-runtime/foundation/config/swarm.schema.json',
  "charts/prism/templates/_swarm-bundle.tpl": "../../kubeclaw/templates/_swarm-config.tpl",
  "charts/kubeclaw/files/config/swarm.schema.json": "../../../../skills/common/plugin-runtime/foundation/config/swarm.schema.json",
  "charts/kubeclaw/files/config/swarm-components.schema.json": "../../../../skills/common/plugin-runtime/foundation/config/swarm-components.schema.json",
  "charts/prism/files/config/swarm-components.schema.json": "../../../../skills/common/plugin-runtime/foundation/config/swarm-components.schema.json",
  "charts/prism/files/config/prism-control.config.json": "../../../kubeclaw/files/config/prism-control.config.json",
  "charts/prism/files/config/prism-studio.config.json": "../../../kubeclaw/files/config/prism-studio.config.json",
  "charts/prism/files/config/prism-worker.config.json": "../../../kubeclaw/files/config/prism-worker.config.json",
  "charts/prism/files/config/prism-execution.config.json": "../../../kubeclaw/files/config/prism-execution.config.json",
  "charts/prism/files/config/buster-engine.config.json": "../../../kubeclaw/files/config/buster-engine.config.json",
  "charts/prism/files/config/worker-core.config.json": "../../../kubeclaw/files/config/worker-core.config.json",
};
function withAliases(run) {
  return repository(context => {
    for (const [name, target] of Object.entries(aliases)) {
      context.write(path.posix.normalize(path.posix.join(path.posix.dirname(name), target)), '{}\n');
      fs.mkdirSync(path.dirname(path.join(context.root, name)), { recursive: true });
      fs.symlinkSync(target, path.join(context.root, name));
    }
    context.source = context.commit();
    run(context);
  });
}

test('canonical aliases bind both target bytes to the image source commit, including schema outside charts', () => withAliases(({ root, write, commit, source }) => {
  verifyReleaseConfiguration(root, source, 'runtime');
  write('docs/new.md', 'unrelated'); commit();
  verifyReleaseConfiguration(root, source, 'runtime');
  for (const [name, target] of Object.entries(aliases)) {
    const canonical = path.posix.normalize(path.posix.join(path.posix.dirname(name), target));
    write(canonical, JSON.stringify({ changed: name }) + '\n'); commit();
    assert.throws(() => verifyReleaseConfiguration(root, source, 'runtime'), /RELEASE_CONFIGURATION_CHANGED/u);
    verifyReleaseConfiguration(root, source, 'ops');
    write(canonical, '{}\n');
  }
  verifyReleaseConfiguration(root, source, 'runtime');
}));

test('canonical alias cannot be retargeted or replaced with an identical regular copy', () => withAliases(({ root, source }) => {
  for (const [name, target] of Object.entries(aliases)) {
    const link = path.join(root, name);
    const absolute = path.resolve(path.dirname(link), target);
    for (const replacement of [absolute, '../../../../../outside.json']) {
      fs.unlinkSync(link); fs.symlinkSync(replacement, link);
      assert.throws(() => verifyReleaseConfiguration(root, source, 'runtime'), /RELEASE_CONFIGURATION_SYMLINK/u);
      fs.unlinkSync(link); fs.symlinkSync(target, link);
    }
    fs.unlinkSync(link); fs.copyFileSync(absolute, link);
    assert.throws(() => verifyReleaseConfiguration(root, source, 'runtime'), /RELEASE_CONFIGURATION_ALIAS_CHANGED/u);
    fs.unlinkSync(link); fs.symlinkSync(target, link);
  }
}));

test('source commit cannot introduce arbitrary or retargeted aliases', () => withAliases(({ root, commit }) => {
  const link = path.join(root, Object.keys(aliases)[0]);
  fs.unlinkSync(link); fs.symlinkSync('/tmp/outside', link);
  assert.throws(() => verifyReleaseConfiguration(root, commit(), 'runtime'), /RELEASE_CONFIGURATION_SOURCE_FILE_INVALID/u);
  fs.unlinkSync(link); fs.symlinkSync(Object.values(aliases)[0], link);
  fs.symlinkSync('values.yaml', path.join(root, 'charts/prism/unknown.yaml'));
  assert.throws(() => verifyReleaseConfiguration(root, commit(), 'runtime'), /RELEASE_CONFIGURATION_SOURCE_FILE_INVALID/u);
}));

test('canonical schema cannot escape through a directory symlink or leaf symlink', () => withAliases(({ root, source }) => {
  const directory = path.join(root, 'skills/common');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'release-outside-'));
  try {
    fs.renameSync(directory, path.join(outside, 'common'));
    fs.symlinkSync(path.join(outside, 'common'), directory);
    assert.throws(() => verifyReleaseConfiguration(root, source, 'runtime'), /RELEASE_CONFIGURATION_DIRECTORY_REQUIRED/u);
    fs.unlinkSync(directory); fs.renameSync(path.join(outside, 'common'), directory);
    const schema = path.join(directory, 'plugin-runtime/foundation/config/swarm.schema.json');
    fs.renameSync(schema, path.join(outside, 'schema.json')); fs.symlinkSync(path.join(outside, 'schema.json'), schema);
    assert.throws(() => verifyReleaseConfiguration(root, source, 'runtime'), /RELEASE_CONFIGURATION_FILE_REQUIRED/u);
  } finally { fs.rmSync(outside, { recursive: true, force: true }); }
}));
