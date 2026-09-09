import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const configurationPaths = {
  runtime: ['charts/kubeclaw', 'charts/prism', ...['nova', 'buster', 'prism-agent', 'prism'].map(role => `my-values/${role}-values.yaml`)],
  ops: ['charts/ops-pod'],
};

function filesUnder(root, relative) {
  const stat = fs.lstatSync(path.join(root, relative));
  if (stat.isSymbolicLink()) throw new Error(`RELEASE_CONFIGURATION_SYMLINK: ${relative}`);
  if (stat.isFile()) return [relative];
  if (!stat.isDirectory()) throw new Error(`RELEASE_CONFIGURATION_FILE_REQUIRED: ${relative}`);
  return fs.readdirSync(path.join(root, relative)).flatMap(name => filesUnder(root, `${relative}/${name}`));
}

// The preserved image receipt supplies the source commit. Identical configuration
// bytes may survive later unrelated commits; unqualified chart/value drift may not.
export function verifyReleaseConfiguration(root, commit, family) {
  if (!/^[a-f0-9]{40}$/u.test(commit) || !configurationPaths[family]) throw new Error('RELEASE_CONFIGURATION_IDENTITY_INVALID');
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const top = git(['rev-parse', '--show-toplevel']).trim();
  if (fs.realpathSync(top) !== fs.realpathSync(root)) throw new Error('RELEASE_CONFIGURATION_REPOSITORY_ROOT_REQUIRED');
  const entries = git(['ls-tree', '-rz', commit, '--', ...configurationPaths[family]])
    .split('\0').filter(Boolean).map(record => {
      const separator = record.indexOf('\t');
      const [mode, type, digest] = record.slice(0, separator).split(' ');
      const name = record.slice(separator + 1);
      if (type !== 'blob' || !['100644', '100755'].includes(mode)) throw new Error(`RELEASE_CONFIGURATION_SOURCE_FILE_INVALID: ${name}`);
      return { name, digest };
    });
  const names = configurationPaths[family].flatMap(relative => filesUnder(root, relative)).sort();
  const expected = entries.map(entry => entry.name).sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error('RELEASE_CONFIGURATION_FILESET_CHANGED');
  for (const { name, digest } of entries) {
    const actual = git(['hash-object', '--no-filters', '--', name]).trim();
    if (actual !== digest) throw new Error(`RELEASE_CONFIGURATION_CHANGED: ${name}; select a successful image build using this configuration`);
  }
  return { sourceCommit: commit, paths: configurationPaths[family] };
}
