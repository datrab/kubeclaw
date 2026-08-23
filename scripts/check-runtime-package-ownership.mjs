import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'packaging/runtime/package-ownership.json'), 'utf8'));
const allowedRoles = new Set(['nova', 'buster', 'prism']);
const allowedOwners = new Set(['shared', 'nova', 'worker', 'buster', 'prism']);

assert.equal(inventory.schemaVersion, 'pipeline-runtime-package-ownership.v1');
const packageIds = new Set();
for (const entry of inventory.packages) {
  assert(!packageIds.has(entry.id), `duplicate package ID: ${entry.id}`);
  packageIds.add(entry.id);
  assert(fs.existsSync(path.join(root, entry.source)), `missing package source: ${entry.source}`);
  assert(allowedOwners.has(entry.owner), `invalid owner for ${entry.id}`);
  assert(Array.isArray(entry.roles) && entry.roles.length > 0, `package has no consuming role: ${entry.id}`);
  assert.equal(new Set(entry.roles).size, entry.roles.length, `duplicate consuming role for ${entry.id}`);
  assert(entry.roles.every((role) => allowedRoles.has(role)), `invalid consuming role for ${entry.id}`);
  assert(['node-package', 'entrypoint', 'assets'].includes(entry.bundle?.kind), `package has invalid bundle kind: ${entry.id}`);
  if (entry.bundle.kind === 'assets') assert.equal(typeof entry.bundle.target, 'string', `asset package has no target: ${entry.id}`);
}

function filesBelow(directory, relative = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const childRelative = path.posix.join(relative, entry.name);
    const child = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(child, childRelative) : [childRelative];
  });
}
function unitMatches(file, unitPath) {
  return file === unitPath || file.startsWith(`${unitPath}/`);
}

const legacyCoreRoot = path.join(root, 'skills/common/plugin-runtime/core');
assert.equal(fs.existsSync(legacyCoreRoot), false, 'legacy mixed runtime core must not exist');
for (const unit of inventory.legacyMixedCoreUnits) {
  assert(Boolean(unit.owner) !== Boolean(unit.disposition), `unit needs owner or disposition: ${unit.path}`);
  if (unit.owner) assert(allowedOwners.has(unit.owner), `invalid unit owner: ${unit.path}`);
  if (unit.disposition) assert(['remove', 'replace'].includes(unit.disposition), `invalid disposition: ${unit.path}`);
}
assert.equal(new Set(inventory.legacyMixedCoreUnits.map((unit) => unit.path)).size, inventory.legacyMixedCoreUnits.length);

const commonPlugins = fs.readdirSync(path.join(root, 'skills/common/plugins'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, 'skills/common/plugins', entry.name, 'package.json')))
  .map((entry) => entry.name)
  .sort();
assert.deepEqual(Object.keys(inventory.sharedPlugins).sort(), commonPlugins, 'every shared plugin must be classified once');
assert.deepEqual([...inventory.currentAssembly.roles].sort(), ['buster', 'nova', 'prism']);
assert.equal(inventory.currentAssembly.sharedPluginRule, 'role-manifest');
for (const [plugin, roles] of Object.entries(inventory.sharedPlugins)) {
  assert(Array.isArray(roles), `shared package roles must be an array: ${plugin}`);
  assert.equal(new Set(roles).size, roles.length, `shared plugin has duplicate current role: ${plugin}`);
  assert(roles.every((role) => allowedRoles.has(role)), `invalid current role for shared plugin: ${plugin}`);
}

const expectedRules = {
  shared: ['shared'],
  nova: ['nova', 'shared'],
  worker: ['shared', 'worker'],
  buster: ['buster', 'shared', 'worker'],
  prism: ['prism', 'shared', 'worker'],
};
assert.deepEqual(inventory.dependencyRules.map((rule) => rule.from).sort(), Object.keys(expectedRules).sort());
for (const rule of inventory.dependencyRules) {
  assert.deepEqual([...new Set(rule.mayDependOn)].sort(), expectedRules[rule.from], `invalid dependency rule: ${rule.from}`);
}

const ownerForAbsoluteFile = (file) => {
  const absolute = path.resolve(file);
  const mappings = [
    ['skills/common/plugin-runtime/foundation', 'shared'],
    ['skills/common/plugin-runtime/sdk', 'shared'],
    ['skills/common/plugins', 'shared'],
    ['contracts', 'shared'],
    ['skills/nova/core', 'nova'],
    ['skills/worker/core', 'worker'],
    ['skills/buster/engine', 'buster'],
    ['skills/prism', 'prism'],
    ['skills/nova', 'nova'],
    ['skills/buster', 'buster'],
  ];
  return mappings.find(([source]) => absolute === path.join(root, source) || absolute.startsWith(`${path.join(root, source)}${path.sep}`))?.[1];
};

const scanRoots = [
  path.join(root, 'skills/common/plugin-runtime/foundation'),
  path.join(root, 'skills/common/plugin-runtime/sdk'),
  path.join(root, 'skills/common/plugins'),
  path.join(root, 'skills/nova'),
  path.join(root, 'skills/worker'),
  path.join(root, 'skills/buster'),
  path.join(root, 'skills/prism'),
  path.join(root, 'contracts'),
];
const packageOwners = new Map();
const packageManifests = [];
for (const scanRoot of scanRoots) {
  for (const relative of filesBelow(scanRoot).filter((entry) => entry.endsWith('package.json'))) {
    const packagePath = path.join(scanRoot, relative);
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (packageJson.name) {
      const owner = ownerForAbsoluteFile(packagePath);
      packageOwners.set(packageJson.name, owner ?? 'unowned-internal');
      packageManifests.push({ packagePath, packageJson, owner });
    }
  }
}
for (const { packagePath, packageJson, owner } of packageManifests) {
  if (!owner) continue;
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const dependency of Object.keys(packageJson[field] ?? {})) {
      const targetOwner = packageOwners.get(dependency);
      if (targetOwner === 'unowned-internal') throw new Error(`dependency targets transitional mixed-core package: ${path.relative(root, packagePath)} -> ${dependency}`);
      if (targetOwner) assert(expectedRules[owner].includes(targetOwner), `forbidden package dependency: ${path.relative(root, packagePath)} (${owner}) -> ${dependency} (${targetOwner})`);
    }
  }
}
function resolveRelativeImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const withoutRuntimeExtension = base.replace(/\.(?:mjs|cjs|js)$/, '');
  return [base, `${base}.ts`, `${base}.mts`, `${base}.mjs`, `${base}.js`, `${withoutRuntimeExtension}.ts`, `${withoutRuntimeExtension}.mts`, `${withoutRuntimeExtension}.cts`, path.join(base, 'index.ts')]
    .find((candidate) => fs.existsSync(candidate));
}
function importedSpecifiers(source, file) {
  const result = new Set(ts.preProcessFile(source, true, true).importedFiles.map((entry) => entry.fileName));
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteralLike(argument)) result.add(argument.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return result;
}
for (const scanRoot of scanRoots) {
  for (const relative of filesBelow(scanRoot).filter((entry) => /\.[cm]?[jt]s$/.test(entry))) {
    const file = path.join(scanRoot, relative);
    const fromOwner = ownerForAbsoluteFile(file);
    if (!fromOwner) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const specifier of importedSpecifiers(source, file)) {
      const targetOwner = specifier.startsWith('.')
        ? ownerForAbsoluteFile(resolveRelativeImport(file, specifier) ?? '')
        : packageOwners.get(specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/'));
      if (targetOwner === 'unowned-internal') throw new Error(`import targets transitional mixed-core package: ${path.relative(root, file)} -> ${specifier}`);
      if (targetOwner) assert(expectedRules[fromOwner].includes(targetOwner), `forbidden dependency: ${path.relative(root, file)} (${fromOwner}) -> ${specifier} (${targetOwner})`);
    }
  }
}

console.log(JSON.stringify({ ok: true, phase: '5.6-B', packages: inventory.packages.length, sharedPlugins: commonPlugins.length, legacyCoreUnits: inventory.legacyMixedCoreUnits.length }));
