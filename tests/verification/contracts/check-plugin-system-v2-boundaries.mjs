import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleSpecifiers, packageName, resolveLocalModule, walkModuleFiles } from '../lib/module-graph.mjs';

function allFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? allFiles(target) : [target];
  });
}
const files = walkModuleFiles;
const coreRoot = path.resolve('skills/common/plugin-runtime/core');
const sdkRoot = path.resolve('skills/common/plugin-runtime/sdk');
const contractsRoot = path.resolve('skills/common/plugin-runtime/contracts');
const approvedSharedRuntimeRoots = [];
const roleRoots = [path.resolve('skills/nova'), path.resolve('skills/buster')];
const pluginRoots = [
  path.resolve('skills/common/plugins'),
  path.resolve('skills/nova/plugins'),
  path.resolve('skills/buster/plugins'),
];

function resolvedReference(file, specifier) {
  return specifier.startsWith('.') || specifier.startsWith('/')
    ? resolveLocalModule(path.resolve(file), specifier)
    : null;
}

function inside(candidate, root) {
  return candidate === root || candidate?.startsWith(`${root}${path.sep}`);
}

const parserFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-module-parser-'));
try {
  const parserFixture = path.join(parserFixtureRoot, 'fixture.ts');
  fs.writeFileSync(parserFixture, [
    "import type { A } from './a.js';",
    "export { value } from './b.js';",
    "const c = require('./c.cjs');",
    "const d = import('./d.mjs');",
  ].join('\n'));
  const parsed = moduleSpecifiers(parserFixture).map(({ specifier, kind, typeOnly }) => ({ specifier, kind, typeOnly }));
  assert.deepEqual(parsed, [
    { specifier: './a.js', kind: 'import', typeOnly: true },
    { specifier: './b.js', kind: 'export', typeOnly: false },
    { specifier: './c.cjs', kind: 'require', typeOnly: false },
    { specifier: './d.mjs', kind: 'dynamic-import', typeOnly: false },
  ]);
} finally {
  fs.rmSync(parserFixtureRoot, { recursive: true, force: true });
}

for (const file of files('skills/common/plugin-runtime/core')) {
  for (const reference of moduleSpecifiers(file)) {
    const resolved = resolvedReference(file, reference.specifier);
    assert(
      !pluginRoots.some((pluginRoot) => inside(resolved, pluginRoot))
      && !roleRoots.some((roleRoot) => inside(resolved, roleRoot))
      && (!packageName(reference.specifier).startsWith('@kubeclaw/')
        || packageName(reference.specifier) === '@kubeclaw/plugin-sdk'),
      `core cannot import concrete role/plugin code: ${file}:${reference.line} -> ${reference.specifier}`,
    );
    if (resolved) {
      assert(
        inside(resolved, coreRoot)
        || inside(resolved, sdkRoot)
        || inside(resolved, contractsRoot)
        || approvedSharedRuntimeRoots.some((sharedRoot) => inside(resolved, sharedRoot)),
        `core local dependency must remain inside core, SDK, contracts, or an approved shared runtime library: ${file}:${reference.line} -> ${reference.specifier}`,
      );
    }
  }
}
for (const file of files('skills/common/plugin-runtime/sdk')) {
  for (const reference of moduleSpecifiers(file)) {
    const resolved = resolvedReference(file, reference.specifier);
    assert(
      !inside(resolved, coreRoot) && reference.specifier !== '@kubeclaw/pipeline-core',
      `SDK cannot import core: ${file}:${reference.line} -> ${reference.specifier}`,
    );
    assert(
      !pluginRoots.some((pluginRoot) => inside(resolved, pluginRoot))
      && !roleRoots.some((roleRoot) => inside(resolved, roleRoot))
      && (!packageName(reference.specifier).startsWith('@kubeclaw/')
        || packageName(reference.specifier) === '@kubeclaw/plugin-sdk'),
      `SDK cannot import concrete role/plugin code: ${file}:${reference.line} -> ${reference.specifier}`,
    );
    if (resolved) {
      assert(
        inside(resolved, sdkRoot) || inside(resolved, contractsRoot),
        `SDK local dependency must remain inside SDK or contracts: ${file}:${reference.line} -> ${reference.specifier}`,
      );
    }
  }
}

const packageRoots = [
  'skills/common/plugins',
  'skills/nova/plugins',
  'skills/buster/plugins',
];
const isolatedPackageRoots = packageRoots.flatMap((packageRoot) =>
  fs.readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packageRoot, entry.name))
    .filter((packageRootPath) =>
      fs.existsSync(path.join(packageRootPath, 'plugin.json'))
      || fs.existsSync(path.join(packageRootPath, 'openclaw.plugin.json'))),
);
const pluginPackageNames = new Set(
  isolatedPackageRoots
    .map((packageRootPath) => path.join(packageRootPath, 'package.json'))
    .filter(fs.existsSync)
    .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')).name)
    .filter(Boolean),
);
assert(!fs.existsSync('pipeline'), 'role-agnostic pipeline/ scaffolding must not return');
assert(!fs.existsSync('plugins'), 'role-agnostic plugins/ scaffolding must not return');
for (const packageRoot of isolatedPackageRoots) {
  const pipelineManifestPath = path.join(packageRoot, 'plugin.json');
  if (fs.existsSync(pipelineManifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(pipelineManifestPath, 'utf8'));
    if (manifest.apiVersion !== 'pipeline-plugin-v2') continue;
  }
  const ownPackageName = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).name;
  for (const file of files(packageRoot)) {
    for (const reference of moduleSpecifiers(file)) {
      if (!reference.specifier.startsWith('.') && !reference.specifier.startsWith('/')) {
        const dependency = packageName(reference.specifier);
        assert(
          !pluginPackageNames.has(dependency) || dependency === ownPackageName,
          `v2 plugin cannot import a sibling plugin package: ${file}:${reference.line} -> ${reference.specifier}`,
        );
        continue;
      }
      const resolved = resolvedReference(file, reference.specifier);
      assert(resolved, `v2 plugin import must resolve: ${file}:${reference.line} -> ${reference.specifier}`);
      assert(
        inside(resolved, path.resolve(packageRoot)),
        `v2 plugin cannot import outside its package: ${file}:${reference.line} -> ${reference.specifier}`,
      );
    }
  }
}
for (const file of files('skills/common/plugins')) {
  for (const reference of moduleSpecifiers(file)) {
    const resolved = resolvedReference(file, reference.specifier);
    assert(
      !roleRoots.some((roleRoot) => inside(resolved, roleRoot)),
      `shared plugin cannot import a role package: ${file}:${reference.line} -> ${reference.specifier}`,
    );
  }
}

const core = await import(pathToFileURL(path.resolve('skills/common/plugin-runtime/core/src/index.ts')).href);
const kernel = core.createEmptyCoreKernel();
assert.equal(kernel.apiVersion, 'pipeline-plugin-v2');
assert.deepEqual(kernel.registry.packages, []);
assert.deepEqual(kernel.registry.registrations, []);
assert(Object.isFrozen(kernel));
assert(Object.isFrozen(kernel.registry));

console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-boundaries' }));
