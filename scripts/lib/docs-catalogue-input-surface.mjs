/** Conservative review admission, not diagnostic discovery or semantic approval. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const catalogueInputPolicy = {
  roots: ['contracts', 'skills/common', 'skills/nova', 'skills/worker', 'skills/prism', 'skills/buster', 'cmd/buster-namespace-controller', 'ops/pod', 'tools/native-worker-nri', 'tools/ops-mcp', 'charts/gitops', 'charts/kubeclaw', 'charts/ops-pod', 'charts/prism'],
  files: ['package.json', 'package-lock.json', 'docker/Dockerfile.namespace-controller'],
  // Deployment/build entry membership is conservative; documentation tooling is not selected.
  scriptPrefixes: ['deploy', 'build-', 'render-', 'prepare-', 'native-worker-', 'infrastructure-', 'gitops-', 'check-runtime-role', 'check-role-image', 'check-built-runtime'],
  extensions: ['.ts', '.tsx', '.mts', '.cts', '.jsx', '.mod', '.sum', '.js', '.mjs', '.cjs', '.go', '.py', '.c', '.h', '.sh', '.sql', '.lua', '.json', '.yaml', '.yml', '.tpl'],
  excludedDirectories: ['node_modules', 'vendor', '.git', 'dist', 'build', 'coverage', 'tmp', 'temp', '__pycache__', 'test', 'tests', '__tests__', 'fixtures', '__fixtures__', 'samples', '__snapshots__'],
};
export function catalogueInputSurface(root) {
  const owned = (relative, kind) => {
    const parts = relative.split('/');
    for (let i = 1; i <= parts.length; i += 1) {
      const name = parts.slice(0, i).join('/');
      let stat;
      try { stat = fs.lstatSync(path.join(root, name)); }
      catch (error) { if (error.code === 'ENOENT') return false; throw error; }
      if (stat.isSymbolicLink()) throw new Error(`CATALOGUE_INPUT_SYMLINK:${name}`);
      const directory = i < parts.length || kind === 'directory';
      if (directory ? !stat.isDirectory() : !stat.isFile()) throw new Error(`CATALOGUE_INPUT_PATH_INVALID:${name}`);
    }
    return true;
  };
  const selected = new Set(catalogueInputPolicy.files.filter(name => owned(name, 'file')));
  const visit = relative => {
    if (!owned(relative, 'directory')) return;
    for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = relative + '/' + item.name;
      if (item.isDirectory()) {
        if (!catalogueInputPolicy.excludedDirectories.includes(item.name)) visit(name);
      } else if (item.isSymbolicLink()) throw new Error(`CATALOGUE_INPUT_SYMLINK:${name}`);
      else if (item.isFile() && !/(?:\.(?:test|spec)\.[^.]+|_test\.go|_test\.py)$/u.test(item.name)
        && (catalogueInputPolicy.extensions.includes(path.extname(item.name)) || item.name.startsWith('Dockerfile'))) selected.add(name);
    }
  };
  for (const directory of catalogueInputPolicy.roots) visit(directory);
  if (owned('scripts', 'directory')) for (const item of fs.readdirSync(path.join(root, 'scripts'), { withFileTypes: true })) {
    if (catalogueInputPolicy.scriptPrefixes.some(prefix => item.name.startsWith(prefix))
      && catalogueInputPolicy.extensions.includes(path.extname(item.name))) {
      const name = 'scripts/' + item.name;
      if (owned(name, 'file')) selected.add(name);
    }
  }
  return Object.fromEntries([...selected].sort().map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex')]));
}
export function checkCatalogueInputSurface(root, expected) {
  const actual = catalogueInputSurface(root);
  for (const name of [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()) {
    if (expected[name] !== actual[name]) throw new Error(`CATALOGUE_INPUT_SURFACE_DRIFT:${!(name in expected) ? 'added' : !(name in actual) ? 'removed' : 'changed'}:${name}`);
  }
  return actual;
}
