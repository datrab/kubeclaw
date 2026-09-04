import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const [role, outputValue, commit, contractVersion, builtAt] = process.argv.slice(2);
if (!['nova', 'buster', 'prism'].includes(role) || !outputValue || !commit || !contractVersion || !builtAt) {
  throw new Error('Usage: build-runtime-role-bundle.mjs <nova|buster|prism> <output-directory> <commit> <contract-version> <built-at>');
}
const output = path.resolve(outputValue);
assert.equal(fs.existsSync(output), false, `bundle output already exists: ${output}`);
execFileSync(process.execPath, [path.join(root, 'scripts/check-runtime-role-manifests.mjs')], { stdio: 'inherit' });

const ownership = JSON.parse(fs.readFileSync(path.join(root, 'packaging/runtime/package-ownership.json'), 'utf8'));
const roleManifest = JSON.parse(fs.readFileSync(path.join(root, `packaging/runtime/roles/${role}.json`), 'utf8'));
const packages = new Map(ownership.packages.map((entry) => [entry.id, entry]));
const written = new Set();
const finalSourceChecks = [];
const isolationLauncher = path.join(root, 'skills/common/plugin-runtime/foundation/isolation/plugin-sandbox');
assert(fs.existsSync(isolationLauncher), 'plugin isolation launcher is not built');
assert(fs.statSync(isolationLauncher).isFile() && (fs.statSync(isolationLauncher).mode & 0o111) !== 0,
  'plugin isolation launcher is not executable');

function selectedFiles(sourceRoot, singleFile, excludedDirectories = ['dist', 'node_modules', 'tests', 'test-results', 'playwright-report', '.playwright']) {
  if (singleFile) return [singleFile];
  const result = [];
  function visit(relative) {
    const directory = path.join(sourceRoot, relative);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isDirectory() && excludedDirectories.includes(entry.name)) continue;
      const child = path.posix.join(relative.split(path.sep).join('/'), entry.name);
      const absolute = path.join(sourceRoot, child);
      assert.equal(entry.isSymbolicLink(), false, `runtime package cannot contain a symbolic link: ${absolute}`);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && !entry.name.endsWith('.tsbuildinfo')) result.push(child);
    }
  }
  visit('');
  return result;
}

function contentDigest(sourceRoot, files) {
  const hash = crypto.createHash('sha256');
  for (const relative of files) {
    hash.update(String(fs.statSync(path.join(sourceRoot, relative)).mode & 0o777));
    hash.update('\0');
    hash.update(relative);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(sourceRoot, relative)));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function assertSelectionUnchanged(sourceRoot, files, digest, label, singleFile, excludedDirectories) {
  const currentFiles = selectedFiles(sourceRoot, singleFile, excludedDirectories);
  assert.deepEqual(currentFiles, files, `${label} file set changed during assembly`);
  assert.equal(contentDigest(sourceRoot, currentFiles), digest, `${label} changed during assembly`);
}

function trackSelection(sourceRoot, files, digest, label, singleFile, excludedDirectories) {
  finalSourceChecks.push({ sourceRoot, files, digest, label, singleFile, excludedDirectories });
}

function writeFile(relativeTarget, content, mode = 0o644) {
  const normalized = path.posix.normalize(relativeTarget);
  assert(!normalized.startsWith('../') && normalized !== '..' && !path.posix.isAbsolute(normalized), `bundle target escapes: ${relativeTarget}`);
  assert(!written.has(normalized), `bundle target collision: ${normalized}`);
  written.add(normalized);
  const target = path.join(output, ...normalized.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, { mode });
  fs.chmodSync(target, mode);
}

function writeSymlink(relativeTarget, relativeSource) {
  const normalized = path.posix.normalize(relativeTarget);
  assert(!normalized.startsWith('../') && !path.posix.isAbsolute(normalized), `bundle link target escapes: ${relativeTarget}`);
  assert(!written.has(normalized), `bundle target collision: ${normalized}`);
  written.add(normalized);
  const target = path.join(output, ...normalized.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(relativeSource, target);
}

function copySelection(sourceRoot, files, targetRoot) {
  for (const relative of files) {
    const source = path.join(sourceRoot, relative);
    writeFile(path.posix.join(targetRoot, relative), fs.readFileSync(source), fs.statSync(source).mode & 0o777);
  }
}

function internalPackageTarget(sourceRoot) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8'));
  assert.equal(typeof packageJson.name, 'string', `node package has no name: ${sourceRoot}`);
  return { name: packageJson.name };
}

function pluginCatalog() {
  const result = new Map();
  for (const relativeRoot of ['skills/common/plugins', 'skills/nova/plugins', 'skills/buster/plugins', 'skills/prism/plugins']) {
    if (!fs.existsSync(path.join(root, relativeRoot))) continue;
    const directory = path.join(root, relativeRoot);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const manifestPath = path.join(directory, entry.name, 'plugin.json');
      if (!entry.isDirectory() || !fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      result.set(manifest.id, path.dirname(manifestPath));
    }
  }
  return result;
}

const catalog = pluginCatalog();
const packageRecords = [];
const internalPackageNames = new Set([...ownership.packages.flatMap((entry) => {
  if (entry.bundle.kind !== 'node-package') return [];
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, entry.source, 'package.json'), 'utf8'));
  return [packageJson.name];
}), ...[...catalog.values()].flatMap((sourceRoot) => {
  const manifestPath = path.join(sourceRoot, 'package.json');
  if (!fs.existsSync(manifestPath)) return [];
  const packageJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return packageJson.name ? [packageJson.name] : [];
})]);
const dependencyQueue = [];
function collectDependencies(sourceRoot) {
  const manifestPath = path.join(sourceRoot, 'package.json');
  if (!fs.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (!internalPackageNames.has(name)) dependencyQueue.push(name);
  }
  for (const name of Object.keys(manifest.optionalDependencies ?? {})) {
    if (!internalPackageNames.has(name) && fs.existsSync(path.join(root, 'node_modules', name, 'package.json'))) dependencyQueue.push(name);
  }
}
for (const packageId of roleManifest.packages) {
  const entry = packages.get(packageId);
  assert(entry, `unknown runtime package: ${packageId}`);
  const sourceRoot = path.resolve(root, entry.source);
  if (entry.bundle.kind === 'entrypoint') {
    const relative = roleManifest.entrypoint.path;
    const files = selectedFiles(sourceRoot, relative);
    const before = contentDigest(sourceRoot, files);
    assertSelectionUnchanged(sourceRoot, files, before, `runtime entrypoint ${packageId}`, relative);
    trackSelection(sourceRoot, files, before, `runtime entrypoint ${packageId}`, relative);
    packageRecords.push({ id: packageId, kind: 'entrypoint', sourceDigest: before, files: files.length });
    continue;
  }
  const files = selectedFiles(sourceRoot);
  collectDependencies(sourceRoot);
  const before = contentDigest(sourceRoot, files);
  const nodePackage = entry.bundle.kind === 'node-package' ? internalPackageTarget(sourceRoot) : null;
  const target = nodePackage ? path.posix.join('skills/packages', packageId) : entry.bundle.target;
  copySelection(sourceRoot, files, target);
  if (nodePackage) {
    const link = path.posix.join('skills/node_modules', nodePackage.name);
    writeSymlink(link, path.posix.relative(path.posix.dirname(link), target));
  }
  assertSelectionUnchanged(sourceRoot, files, before, `runtime package ${packageId}`);
  trackSelection(sourceRoot, files, before, `runtime package ${packageId}`);
  packageRecords.push({ id: packageId, kind: entry.bundle.kind, sourceDigest: before, files: files.length, target,
    ...(nodePackage ? { packageName: nodePackage.name } : {}) });
}

const pluginRecords = [];
for (const pluginId of roleManifest.plugins) {
  const sourceRoot = catalog.get(pluginId);
  assert(sourceRoot, `unknown runtime plugin: ${pluginId}`);
  const files = selectedFiles(sourceRoot);
  collectDependencies(sourceRoot);
  const before = contentDigest(sourceRoot, files);
  const target = path.posix.join('skills/plugins', path.basename(sourceRoot));
  copySelection(sourceRoot, files, target);
  const packageManifestPath = path.join(sourceRoot, 'package.json');
  const nodePackage = fs.existsSync(packageManifestPath) ? internalPackageTarget(sourceRoot) : null;
  if (nodePackage) {
    const link = path.posix.join('skills/node_modules', nodePackage.name);
    writeSymlink(link, path.posix.relative(path.posix.dirname(link), target));
  }
  assertSelectionUnchanged(sourceRoot, files, before, `runtime plugin ${pluginId}`);
  trackSelection(sourceRoot, files, before, `runtime plugin ${pluginId}`);
  pluginRecords.push({ id: pluginId, sourceDigest: before, files: files.length, target,
    ...(nodePackage ? { packageName: nodePackage.name } : {}) });
}

const extensionSources = new Map([
  ['kubeclaw-agent-observer', path.join(root, 'skills/common/plugins/openclaw-agent-observer')],
]);
for (const extensionId of roleManifest.extensions) {
  const sourceRoot = extensionSources.get(extensionId);
  assert(sourceRoot, `unknown runtime extension: ${extensionId}`);
  const files = selectedFiles(sourceRoot);
  collectDependencies(sourceRoot);
  const before = contentDigest(sourceRoot, files);
  const target = path.posix.join('skills/plugins', path.basename(sourceRoot));
  copySelection(sourceRoot, files, target);
  assertSelectionUnchanged(sourceRoot, files, before, `runtime extension ${extensionId}`);
  trackSelection(sourceRoot, files, before, `runtime extension ${extensionId}`);
  pluginRecords.push({ id: extensionId, sourceDigest: before, files: files.length, target });
}

const dependencyRecords = [];
const installedDependencies = new Set();
while (dependencyQueue.length > 0) {
  const name = dependencyQueue.shift();
  if (installedDependencies.has(name)) continue;
  installedDependencies.add(name);
  const sourceRoot = path.join(root, 'node_modules', name);
  assert(fs.existsSync(path.join(sourceRoot, 'package.json')), `runtime dependency is not installed: ${name}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8'));
  const files = selectedFiles(sourceRoot, undefined, ['node_modules', 'test', 'tests', '.github']);
  const before = contentDigest(sourceRoot, files);
  const target = path.posix.join('skills/node_modules', name);
  copySelection(sourceRoot, files, target);
  assertSelectionUnchanged(sourceRoot, files, before, `runtime dependency ${name}`, undefined,
    ['node_modules', 'test', 'tests', '.github']);
  trackSelection(sourceRoot, files, before, `runtime dependency ${name}`, undefined,
    ['node_modules', 'test', 'tests', '.github']);
  dependencyRecords.push({ name, version: manifest.version, sourceDigest: before, files: files.length, target });
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    if (!internalPackageNames.has(dependency)) dependencyQueue.push(dependency);
  }
  for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) {
    if (!internalPackageNames.has(dependency) && fs.existsSync(path.join(root, 'node_modules', dependency, 'package.json'))) dependencyQueue.push(dependency);
  }
}

const facadeLines = [
  role === 'nova' ? '#!/usr/bin/env node' : '',
  "import path from 'node:path';",
  "import { pathToFileURL } from 'node:url';",
  `export * from '${roleManifest.entrypoint.import}';`,
  ...(roleManifest.entrypoint.execute ? [
    "if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {",
    `  await import('${roleManifest.entrypoint.execute}');`,
    '}',
  ] : []),
  '',
];
const facade = `${facadeLines.filter(Boolean).join('\n')}\n`;
writeFile(path.posix.join('skills', roleManifest.entrypoint.output), facade, role === 'nova' ? 0o755 : 0o644);

for (const check of finalSourceChecks) {
  assertSelectionUnchanged(check.sourceRoot, check.files, check.digest, check.label,
    check.singleFile, check.excludedDirectories);
}

const bundleManifest = {
  schemaVersion: 'pipeline-runtime-bundle.v1',
  contractVersion,
  bundleKind: 'app-skills-package-set',
  runtimeSurface: '/app/skills',
  role,
  commit,
  builtAt,
  entrypoint: `/app/skills/${roleManifest.entrypoint.output}`,
  packages: packageRecords,
  plugins: pluginRecords,
  dependencies: dependencyRecords,
  externalCapabilities: roleManifest.externalCapabilities,
};
writeFile('manifest.json', `${JSON.stringify(bundleManifest, null, 2)}\n`);

function normalizeDirectoryModes(directory) {
  fs.chmodSync(directory, 0o755);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) normalizeDirectoryModes(path.join(directory, entry.name));
  }
}
normalizeDirectoryModes(output);

console.log(JSON.stringify({ ok: true, phase: '5.6-D', role, files: written.size, packages: packageRecords.length, plugins: pluginRecords.length }));
