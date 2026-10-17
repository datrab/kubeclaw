import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const configurationPaths = {
  runtime: ['charts/kubeclaw', 'charts/prism', ...['nova', 'buster', 'prism-agent', 'prism'].map(role => `my-values/${role}-values.yaml`)],
  ops: ['charts/ops-pod'],
};

const configurationAliases = {
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

function assertNoLinkedAncestors(root, relative) {
  const parts = relative.split('/');
  for (let index = 1; index < parts.length; index++) {
    const ancestor = parts.slice(0, index).join('/');
    if (!fs.lstatSync(path.join(root, ancestor)).isDirectory()) throw new Error(`RELEASE_CONFIGURATION_DIRECTORY_REQUIRED: ${ancestor}`);
  }
}

function filesUnder(root, relative) {
  const stat = fs.lstatSync(path.join(root, relative));
  if (stat.isSymbolicLink()) {
    if (configurationAliases[relative] !== fs.readlinkSync(path.join(root, relative))) throw new Error(`RELEASE_CONFIGURATION_SYMLINK: ${relative}`);
    return [relative];
  }
  if (stat.isFile()) return [relative];
  if (!stat.isDirectory()) throw new Error(`RELEASE_CONFIGURATION_FILE_REQUIRED: ${relative}`);
  return fs.readdirSync(path.join(root, relative)).flatMap(name => filesUnder(root, `${relative}/${name}`));
}

function sourceAliasTargets(entries, readEntries, git) {
  const targets = [];
  for (const entry of entries) {
    if (entry.mode !== '120000') continue;
    const target = configurationAliases[entry.name];
    if (!target || git(['cat-file', 'blob', entry.digest]) !== target) throw new Error(`RELEASE_CONFIGURATION_SOURCE_FILE_INVALID: ${entry.name}`);
    const canonical = path.posix.normalize(path.posix.join(path.posix.dirname(entry.name), target));
    const source = readEntries([canonical]);
    if (source.length !== 1 || source[0].name !== canonical || source[0].mode === '120000') throw new Error(`RELEASE_CONFIGURATION_SOURCE_FILE_INVALID: ${canonical}`);
    targets.push(source[0]);
  }
  return targets;
}

function verifyWorkingFiles(root, entries, git) {
  for (const { name, digest, mode } of entries) {
    assertNoLinkedAncestors(root, name);
    const stat = fs.lstatSync(path.join(root, name));
    if (mode === '120000') {
      if (!stat.isSymbolicLink() || fs.readlinkSync(path.join(root, name)) !== configurationAliases[name]) throw new Error(`RELEASE_CONFIGURATION_ALIAS_CHANGED: ${name}`);
      continue;
    }
    if (!stat.isFile()) throw new Error(`RELEASE_CONFIGURATION_FILE_REQUIRED: ${name}`);
    const actual = git(['hash-object', '--no-filters', '--', name]).trim();
    if (actual !== digest) throw new Error(`RELEASE_CONFIGURATION_CHANGED: ${name}; select a successful image build using this configuration`);
  }
}

// The preserved image receipt supplies the source commit. Identical configuration
// bytes may survive later unrelated commits; unqualified chart/value drift may not.
export function verifyReleaseConfiguration(root, commit, family) {
  if (!/^[a-f0-9]{40}$/u.test(commit) || !configurationPaths[family]) throw new Error('RELEASE_CONFIGURATION_IDENTITY_INVALID');
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const top = git(['rev-parse', '--show-toplevel']).trim();
  if (fs.realpathSync(top) !== fs.realpathSync(root)) throw new Error('RELEASE_CONFIGURATION_REPOSITORY_ROOT_REQUIRED');
  const readEntries = paths => git(['ls-tree', '-rz', commit, '--', ...paths])
    .split('\0').filter(Boolean).map(record => {
      const separator = record.indexOf('\t');
      const [mode, type, digest] = record.slice(0, separator).split(' ');
      const name = record.slice(separator + 1);
      if (type !== 'blob' || !['100644', '100755', '120000'].includes(mode)) throw new Error(`RELEASE_CONFIGURATION_SOURCE_FILE_INVALID: ${name}`);
      return { name, digest, mode };
    });
  const entries = readEntries(configurationPaths[family]);
  const targets = sourceAliasTargets(entries, readEntries, git);
  for (const relative of configurationPaths[family]) assertNoLinkedAncestors(root, relative);
  const names = configurationPaths[family].flatMap(relative => filesUnder(root, relative)).sort();
  const expected = entries.map(entry => entry.name).sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error('RELEASE_CONFIGURATION_FILESET_CHANGED');
  verifyWorkingFiles(root, [...entries, ...targets], git);
  return { sourceCommit: commit, paths: configurationPaths[family] };
}
