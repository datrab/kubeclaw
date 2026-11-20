import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const external = (name, version) => !name.startsWith('@kubeclaw/') && !/^(?:file|workspace):/u.test(version);
const key = (file, fields) => JSON.stringify([file, fields]);

function packageFiles(root, directory = '') {
  const found = [];
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['node_modules', 'dist', 'build', 'tests', 'test', 'fixtures', 'docs', '__pycache__'].includes(entry.name)) continue;
    const name = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...packageFiles(root, name));
    else if (entry.isFile() && entry.name === 'package.json') found.push(name);
  }
  return found;
}

export function bindCentralPackages(root, manifest, read, outputs) {
  const packages = manifest.runtimePackages;
  if (!packages || !Array.isArray(packages.npm)) throw new Error('CENTRAL_PACKAGE_INPUTS_REQUIRED');
  const declared = new Set();
  const documents = new Map();
  for (const item of packages.npm) {
    if (!/^(?:[\w.-]+\/)*package\.json$/u.test(item.packageFile ?? '') || item.packageFile.split('/').includes('..')
      || !Array.isArray(item.path) || item.path.length < 2 || ![...sections, 'overrides'].includes(item.path[0])
      || item.path.some(field => typeof field !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(field))
      || typeof item.version !== 'string' || !item.version || /[\r\n]/u.test(item.version)
      || typeof item.packageName !== 'string') throw new Error('CENTRAL_NPM_DECLARATION_INVALID');
    const identity = key(item.packageFile, item.path);
    if (declared.has(identity)) throw new Error('CENTRAL_NPM_DECLARATION_DUPLICATE');
    declared.add(identity);
    const document = documents.get(item.packageFile) ?? JSON.parse(outputs.get(item.packageFile) ?? read(item.packageFile));
    documents.set(item.packageFile, document);
    let target = document;
    for (const field of item.path.slice(0, -1)) {
      if (!target[field] || typeof target[field] !== 'object') throw new Error('CENTRAL_NPM_TARGET_MISSING');
      target = target[field];
    }
    if (typeof target[item.path.at(-1)] !== 'string') throw new Error('CENTRAL_NPM_TARGET_MISSING');
    target[item.path.at(-1)] = item.version;
  }
  // New direct dependencies cannot silently acquire a second version authority.
  for (const file of packageFiles(root)) {
    const document = documents.get(file) ?? JSON.parse(outputs.get(file) ?? read(file));
    for (const section of sections) for (const [name, version] of Object.entries(document[section] ?? {})) {
      if (!external(name, version) || (file === 'ops/pod/package.json' && name === '@openai/codex')) continue;
      if (!declared.has(key(file, [section, name]))) throw new Error(`UNMANAGED_NPM_PACKAGE:${file}:${name}`);
    }
    const overrides = (values, fields) => {
      for (const [name, value] of Object.entries(values)) {
        if (value && typeof value === 'object') overrides(value, [...fields, name]);
        else if (!declared.has(key(file, [...fields, name]))) throw new Error(`UNMANAGED_NPM_OVERRIDE:${file}:${name}`);
      }
    };
    overrides(document.overrides ?? {}, ['overrides']);
  }
  for (const [file, document] of documents) {
    const source = outputs.get(file) ?? read(file);
    outputs.set(file, JSON.stringify(JSON.parse(source)) === JSON.stringify(document) ? source : JSON.stringify(document, null, 2) + '\n');
  }
  const alpine = packages.alpine?.archviewer;
  if (!alpine || !Object.keys(alpine).length) throw new Error('CENTRAL_ALPINE_PACKAGES_REQUIRED');
  for (const [name, version] of Object.entries(alpine)) {
    if (!/^[a-z0-9-]+$/u.test(name) || !/^[\w.+-]+$/u.test(version)) throw new Error('CENTRAL_ALPINE_PACKAGE_INVALID');
  }
  const file = 'docker/Dockerfile.archviewer';
  const source = outputs.get(file) ?? read(file);
  if ((source.match(/^RUN apk add --upgrade --no-cache .+$/gm) ?? []).length !== 1) throw new Error('CENTRAL_ALPINE_TARGET_MISSING');
  outputs.set(file, source.replace(/^RUN apk add --upgrade --no-cache .+$/m,
    'RUN apk add --upgrade --no-cache ' + Object.entries(alpine).map(([name, version]) => `${name}=${version}`).join(' ')));
  const patch = { ...packages.semgrepPatch, replacementRequirement: `mcp==${packages.pythonOverrides?.mcp}` };
  if (!patch || !/^mcp==[\d.]+$/u.test(patch.originalRequirement ?? '')
    || !/^[\w.]+$/u.test(patch.versionSuffix ?? '') || !/^GHSA-[\w-]+$/u.test(patch.advisory ?? '')) throw new Error('CENTRAL_PYTHON_PATCH_INVALID');
  outputs.set('docker/python-tools/security-patch.json', JSON.stringify(patch, null, 2) + '\n');
  outputs.set('docker/python-tools/security-overrides.txt', '# Generated from versions.json; security overrides for our runtime tools.\n'
    + Object.entries(packages.pythonOverrides).map(([name, version]) => {
      if (!/^[\w-]+$/u.test(name) || !/^[\d.]+$/u.test(version)) throw new Error('CENTRAL_PYTHON_OVERRIDE_INVALID');
      return `${name}==${version}\n`;
    }).join(''));
  for (const item of packages.goOverrides ?? []) {
    if (!/^[\w./-]+$/u.test(item.goModule ?? '') || !/^v[\w.+-]+$/u.test(item.version ?? '')
      || !Array.isArray(item.lockDirectories)) throw new Error('CENTRAL_GO_OVERRIDE_INVALID');
    for (const directory of item.lockDirectories) {
      if (!/^[a-z-]+$/u.test(directory)) throw new Error('CENTRAL_GO_LOCK_DIRECTORY_INVALID');
      const file = `docker/runtime-binaries/${directory}/go.mod`;
      const source = outputs.get(file) ?? read(file);
      const regex = new RegExp(`^(\\s+${item.goModule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} )v[^\\s]+`, 'gm');
      if ([...source.matchAll(regex)].length !== 1) throw new Error('CENTRAL_GO_OVERRIDE_TARGET_MISSING');
      outputs.set(file, source.replace(regex, `$1${item.version}`));
    }
  }
}

// Only lockfiles are resolved here. Package version decisions already came from
// versions.json, and dependency lifecycle scripts cannot run in this updater.
export function syncCentralPackageLocks(root, changed) {
  root = path.resolve(root);
  const roots = new Set();
  for (const file of changed.filter(file => file.endsWith('/package.json') || file === 'package.json')) {
    let directory = path.dirname(path.join(root, file));
    while (!fs.existsSync(path.join(directory, 'package-lock.json'))) {
      if (directory === root) throw new Error(`CENTRAL_NPM_LOCK_REQUIRED:${file}`);
      directory = path.dirname(directory);
    }
    roots.add(directory);
  }
  for (const cwd of roots) execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd, stdio: 'inherit', timeout: 600000 });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'versions.json'), 'utf8'));
  for (const item of manifest.runtimePackages.goOverrides) for (const directory of item.lockDirectories) {
    const file = `docker/runtime-binaries/${directory}/go.mod`;
    if (!changed.includes(file)) continue;
    execFileSync('env', ['GOTOOLCHAIN=local', 'go', 'get', `${item.goModule}@${item.version}`],
      { cwd: path.join(root, 'docker/runtime-binaries', directory), stdio: 'inherit', timeout: 600000 });
  }
  return { npmLockRoots: roots.size };
}
