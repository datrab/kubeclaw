import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BUILTINS,
  moduleSpecifiers,
  nonLiteralModuleLoads,
  packageName,
  resolveLocalModule,
  walkModuleFiles,
} from '../lib/module-graph.mjs';

function allFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? allFiles(target) : [target];
  });
}
const files = walkModuleFiles;
const coreRoot = path.resolve('skills/nova/core');
const sdkRoot = path.resolve('skills/common/plugin-runtime/sdk');
const contractsRoot = path.resolve('contracts');
const approvedSharedRuntimeRoots = [path.resolve('skills/common/plugin-runtime/foundation')];
const approvedCorePackages = new Set([
  '@kubeclaw/plugin-foundation',
  '@kubeclaw/plugin-sdk',
  '@kubeclaw/pipeline-test-gate-contract',
  '@kubeclaw/pipeline-observability-contract',
  '@kubeclaw/pipeline-worker-core-contract',
]);
const approvedSdkPackages = new Set([
  '@kubeclaw/plugin-sdk',
  '@kubeclaw/pipeline-test-gate-contract',
]);
const roleRoots = [path.resolve('skills/nova'), path.resolve('skills/worker'), path.resolve('skills/buster')];
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

const privilegedRuntimeModules = new Set([
  'node:child_process',
  'node:cluster',
  'node:dgram',
  'node:dns',
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:https',
  'node:module',
  'node:net',
  'node:process',
  'node:tls',
  'node:worker_threads',
  'axios',
  'execa',
  'ioredis',
  'redis',
  'undici',
]);
const safeRegistrationBuiltins = new Set(['node:path', 'path']);
const safeRegistrationPackages = new Set(['@kubeclaw/plugin-sdk']);
// These exact exports carry data/decision code, never package-root validators.
const safeContractEntries = new Map([
  ['@kubeclaw/prism-contracts-v1', {
    root: path.resolve('contracts/prism/v1'), export: '.', file: './src/index.ts', helpers: true,
  }],
  ['@kubeclaw/pipeline-test-gate-contract/gate-decision', {
    root: path.resolve('contracts/pipeline-test-gate/v1'), export: './gate-decision', file: './src/gate-decision.ts',
  }],
  ['@kubeclaw/pipeline-observability-contract/canonical-json', {
    root: path.resolve('contracts/pipeline-observability/v1'), export: './canonical-json', file: './src/canonical-json.ts',
  }],
]);

// Standalone Prism validators use exactly these dependency runtime helpers.
// This grant travels with the Prism graph, never with an ordinary stage.
const prismRuntimeHelpers = new Map([
  ['ajv/dist/runtime/ucs2length.js', 'node_modules/ajv/dist/runtime/ucs2length.js'],
  ['ajv/dist/runtime/equal.js', 'node_modules/ajv/dist/runtime/equal.js'],
  ['ajv-formats/dist/formats.js', 'node_modules/ajv-formats/dist/formats.js'],
  ['fast-deep-equal', 'node_modules/fast-deep-equal/index.js'],
].map(([specifier, file]) => [specifier, path.resolve(file)]));

function resolveRuntimeHelper(specifier, importer, helperEntries) {
  const expected = helperEntries.get(specifier);
  if (!expected) return null;
  const file = fs.realpathSync(createRequire(pathToFileURL(importer)).resolve(specifier));
  assert.equal(file, fs.realpathSync(expected), 'approved runtime helper resolves to a different file');
  return { file, root: path.dirname(file), contract: true, helpers: true, helper: true };
}

function resolveSafeContract(specifier, entries, importer) {
  const entry = entries.get(specifier);
  if (!entry) return null;
  const manifest = JSON.parse(fs.readFileSync(path.join(entry.root, 'package.json'), 'utf8'));
  assert.equal(manifest.name, packageName(specifier), 'approved contract package identity changed');
  assert.equal(manifest.exports?.[entry.export], entry.file, 'approved contract export target changed');
  const file = fs.realpathSync(path.resolve(entry.root, entry.file));
  assert(inside(file, fs.realpathSync(entry.root)), 'approved contract export escapes its package');
  assert.equal(fs.realpathSync(createRequire(pathToFileURL(importer)).resolve(specifier)), file,
    'approved contract import resolves to a different package');
  return { file, root: fs.realpathSync(entry.root), contract: true, helpers: entry.helpers === true };
}

const scopedSafeRegistrationPackages = new Map([
  [path.resolve('skills/nova/plugins/review'), new Set(['js-tiktoken'])],
]);
for (const specifier of [...privilegedRuntimeModules]) {
  if (specifier.startsWith('node:')) privilegedRuntimeModules.add(specifier.slice('node:'.length));
}
const privilegedRuntimeGlobals = [
  /\bprocess\b/u,
  /\bfetch\b/u,
  /\bglobalThis\b/u,
  /\bglobal\b/u,
  /\beval\b/u,
  /\bFunction\b/u,
  /\bDeno\./u,
  /\bBun\.(?:spawn|spawnSync|file|write)\b/u,
];

function assertStaticHelperLoaders(file, surface) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === 'require') {
      assert(ts.isCallExpression(node.parent) && node.parent.expression === node
        && node.parent.arguments.length === 1 && ts.isStringLiteralLike(node.parent.arguments[0]),
      `${surface} runtime helper loaders must use literal direct calls: ${file}`);
    }
    if (ts.isIdentifier(node) && node.text === 'module') {
      assert(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node
        && node.parent.name.text === 'exports', `${surface} runtime helpers cannot access module loader authority: ${file}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function assertNoDirectPrivilegedAccess(file, surface, contract = false, entries = safeContractEntries, helpers = false, helper = false, helperEntries = prismRuntimeHelpers) {
  for (const reference of moduleSpecifiers(file)) {
    assert(
      !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(reference.specifier)
      || reference.specifier.startsWith('node:'),
      `${surface} cannot load URL or scheme-based modules: ${file}:${reference.line} -> ${reference.specifier}`,
    );
    assert(
      !BUILTINS.has(reference.specifier)
      || safeRegistrationBuiltins.has(reference.specifier)
      || (contract && ['node:crypto', 'crypto'].includes(reference.specifier)),
      `${surface} must use a capability adapter instead of Node built-in import: ${file}:${reference.line} -> ${reference.specifier}`,
    );
    assert(
      !privilegedRuntimeModules.has(packageName(reference.specifier))
      && !privilegedRuntimeModules.has(reference.specifier),
      `${surface} must use a capability adapter instead of privileged import: ${file}:${reference.line} -> ${reference.specifier}`,
    );
    if (
      !reference.specifier.startsWith('.')
      && !reference.specifier.startsWith('/')
      && !BUILTINS.has(reference.specifier)
    ) {
      assert(
        (entries.has(reference.specifier)
          || (helpers && helperEntries.has(reference.specifier))
          || (!contract && safeRegistrationPackages.has(packageName(reference.specifier))))
        || (!contract && [...scopedSafeRegistrationPackages].some(([root, packages]) => inside(file, root)
          && packages.has(packageName(reference.specifier)))),
        `${surface} cannot import an unapproved runtime package: ${file}:${reference.line} -> ${reference.specifier}`,
      );
    }
  }
  if (contract) {
    assert(!moduleSpecifiers(file).some(({ kind }) => kind === 'dynamic-import' || (kind === 'require' && !helper)),
      `${surface} approved contract graphs must use static ESM imports: ${file}`);
  }
  for (const reference of nonLiteralModuleLoads(file)) {
    assert.fail(
      `${surface} module loads must use string literals: ${file}:${reference.line} -> ${reference.kind}`,
    );
  }
  const source = fs.readFileSync(file, 'utf8');
  for (const pattern of privilegedRuntimeGlobals) {
    assert(
      !pattern.test(source),
      `${surface} must use a capability adapter instead of privileged global access: ${file} -> ${pattern}`,
    );
  }
}

function assertRegistrationGraphHasNoPrivilegedAccess(entrypoint, packageRoot, surface, entries = safeContractEntries, helperEntries = prismRuntimeHelpers) {
  const pending = [{ file: entrypoint, root: packageRoot, contract: false }];
  const visited = new Set();
  while (pending.length > 0) {
    const { file, root, contract, helpers = false, helper = false } = pending.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    assert(helper || path.extname(file) !== '.cjs', `${surface} executable graphs must use ESM, not CommonJS: ${file}`);
    assertNoDirectPrivilegedAccess(file, surface, contract, entries, helpers, helper, helperEntries);
    if (helper) assertStaticHelperLoaders(file, surface);
    for (const reference of moduleSpecifiers(file)) {
      const runtime = helpers && resolveRuntimeHelper(reference.specifier, file, helperEntries);
      if (runtime) { pending.push(runtime); continue; }
      const approved = resolveSafeContract(reference.specifier, entries, file);
      if (approved) { pending.push(approved); continue; }
      if (!reference.specifier.startsWith('.') && !reference.specifier.startsWith('/')) continue;
      assert(!helper, `${surface} runtime helpers cannot import unapproved relative files: ${file}`);
      const resolved = resolvedReference(file, reference.specifier);
      assert(resolved, `${surface} graph import must resolve: ${file} -> ${reference.specifier}`);
      const canonical = fs.realpathSync(resolved);
      assert(inside(canonical, fs.realpathSync(root)),
        `${surface} executable graph cannot import outside its package: ${file}:${reference.line} -> ${reference.specifier}`);
      pending.push({ file: canonical, root, contract, helpers });
    }
  }
}

const parserFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-module-parser-'));
try {
  const contractRoot = path.join(parserFixtureRoot, 'contract');
  const registrationRoot = path.join(parserFixtureRoot, 'registration');
  fs.mkdirSync(contractRoot);
  fs.mkdirSync(registrationRoot);
  fs.mkdirSync(path.join(registrationRoot, 'node_modules/@fixture'), { recursive: true });
  fs.symlinkSync(contractRoot, path.join(registrationRoot, 'node_modules/@fixture/contract'));
  const fixtureSpecifier = '@fixture/contract/decision';
  const fixtureEntries = new Map([[fixtureSpecifier, { root: contractRoot, export: './decision', file: './decision.js' }]]);
  const fixtureManifest = { name: '@fixture/contract', exports: { './decision': './decision.js' } };
  fs.writeFileSync(path.join(contractRoot, 'package.json'), JSON.stringify(fixtureManifest));
  const fixtureEntry = path.join(registrationRoot, 'stage.js');
  fs.writeFileSync(fixtureEntry, `export { value } from '${fixtureSpecifier}';`);
  fs.writeFileSync(path.join(contractRoot, 'decision.js'), "export { value } from './leaf.js';");
  const leaf = path.join(contractRoot, 'leaf.js');
  fs.writeFileSync(leaf, "import crypto from 'node:crypto'; export const value = crypto.createHash('sha256').update('a').digest('hex');");
  const checkFixture = () => assertRegistrationGraphHasNoPrivilegedAccess(fixtureEntry, registrationRoot, 'stage', fixtureEntries);
  assert.doesNotThrow(checkFixture, 'approved exact contract export must traverse a pure digest graph');
  for (const source of [
    "import fs from 'node:fs'; export const value = fs.readFileSync('/secret');",
    "export const value = globalThis['process'].env;",
    "export const value = import('./hidden.js');",
    "export { value } from '@fixture/contract';",
    "export { value } from '@kubeclaw/plugin-sdk';",
  ]) {
    fs.writeFileSync(leaf, source);
    assert.throws(checkFixture, /capability adapter|static ESM|unapproved runtime package/,
      'approved exports must not hide transitive authority or a misleading root import');
  }
  fs.writeFileSync(leaf, 'export const value = 1;');
  fs.writeFileSync(fixtureEntry, "import crypto from 'node:crypto'; export const value = crypto.randomBytes(1);");
  assert.throws(checkFixture, /capability adapter/, 'ordinary registration authority is unchanged');
  fs.writeFileSync(fixtureEntry, `export { value } from '${fixtureSpecifier}';`);
  const runtimeRoot = path.join(contractRoot, 'node_modules/fixture-runtime');
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const runtimeFile = path.join(runtimeRoot, 'index.cjs');
  fs.writeFileSync(path.join(runtimeRoot, 'package.json'), JSON.stringify({ main: 'index.cjs' }));
  const runtimeEntries = new Map([['fixture-runtime', runtimeFile]]);
  fixtureEntries.get(fixtureSpecifier).helpers = true;
  fs.writeFileSync(leaf, "import value from 'fixture-runtime'; export { value };");
  fs.writeFileSync(runtimeFile, 'module.exports = 1;');
  const checkRuntime = () => assertRegistrationGraphHasNoPrivilegedAccess(fixtureEntry, registrationRoot, 'stage', fixtureEntries, runtimeEntries);
  assert.doesNotThrow(checkRuntime, 'exact audited CJS helper is traversed inside the approved graph');
  for (const source of [
    "module.exports = require('node:fs');",
    "module.exports = require(['node','fs'].join(':'));",
    "module.exports = import('./hidden.cjs');",
    "module.exports = require('./hidden.cjs');",
    "module.exports = process.env;",
    "const loader = require; module.exports = loader('node:fs');",
    "module.exports = module['require']('node:fs');",
  ]) {
    fs.writeFileSync(runtimeFile, source);
    assert.throws(checkRuntime, /capability adapter|static ESM|string literals|unapproved relative|literal direct|loader authority/,
      'audited helpers cannot gain IO, dynamic loads, globals, or arbitrary CJS dependencies');
  }
  fs.writeFileSync(runtimeFile, 'module.exports = 1;');
  fixtureEntries.get(fixtureSpecifier).helpers = false;
  assert.throws(checkRuntime, /unapproved runtime package/, 'helper grants cannot escape their approved contract graph');
  fs.writeFileSync(leaf, 'export const value = 1;');
  fixtureManifest.exports['./decision'] = './index.js';
  fs.writeFileSync(path.join(contractRoot, 'package.json'), JSON.stringify(fixtureManifest));
  assert.throws(checkFixture, /export target changed/, 'approved package exports cannot silently retarget');
  for (const specifier of ['@kubeclaw/pipeline-test-gate-contract', '@kubeclaw/pipeline-observability-contract']) {
    fs.writeFileSync(fixtureEntry, `export * from '${specifier}';`);
    assert.throws(checkFixture, /unapproved runtime package/, 'package roots retain their original authority boundary');
  }
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
  const privilegedFixture = path.join(parserFixtureRoot, 'privileged-stage.ts');
  fs.writeFileSync(privilegedFixture, "import fs from 'node:fs';\nfs.readFileSync('/tmp/value');\n");
  assert.throws(
    () => assertNoDirectPrivilegedAccess(privilegedFixture, 'stage'),
    /must use a capability adapter/,
    'stage direct privileged imports must fail boundary verification',
  );
  const barePrivilegedFixture = path.join(parserFixtureRoot, 'bare-privileged-stage.ts');
  fs.writeFileSync(barePrivilegedFixture, "import fs from 'fs';\nfs.readFileSync('/tmp/value');\n");
  assert.throws(
    () => assertNoDirectPrivilegedAccess(barePrivilegedFixture, 'stage'),
    /must use a capability adapter/,
    'bare Node built-in imports must fail boundary verification',
  );
  const processAliasFixture = path.join(parserFixtureRoot, 'process-alias-stage.ts');
  fs.writeFileSync(processAliasFixture, "import { env } from 'node:process';\nexport const value = env.SECRET;\n");
  assert.throws(
    () => assertNoDirectPrivilegedAccess(processAliasFixture, 'stage'),
    /must use a capability adapter/,
    'Node process imports must not bypass secrets.read',
  );
  const vmFixture = path.join(parserFixtureRoot, 'vm-stage.ts');
  fs.writeFileSync(vmFixture, "import vm from 'node:vm';\nexport const value = vm.runInThisContext('1');\n");
  assert.throws(
    () => assertNoDirectPrivilegedAccess(vmFixture, 'stage'),
    /Node built-in import/,
    'Node VM imports must not bypass capability adapters',
  );
  const computedImportFixture = path.join(parserFixtureRoot, 'computed-import-stage.ts');
  fs.writeFileSync(
    computedImportFixture,
    "export const value = import(['node', 'fs'].join(':'));\n",
  );
  assert.throws(
    () => assertNoDirectPrivilegedAccess(computedImportFixture, 'stage'),
    /module loads must use string literals/,
    'computed dynamic imports must not bypass capability adapters',
  );
  const dataImportFixture = path.join(parserFixtureRoot, 'data-import-stage.ts');
  fs.writeFileSync(
    dataImportFixture,
    "export const value = import('data:text/javascript,export default process.env.SECRET');\n",
  );
  assert.throws(
    () => assertNoDirectPrivilegedAccess(dataImportFixture, 'stage'),
    /cannot load URL or scheme-based modules/,
    'URL module imports must not bypass the package boundary',
  );
  const packageImportFixture = path.join(parserFixtureRoot, 'package-import-stage.ts');
  fs.writeFileSync(
    packageImportFixture,
    "import client from 'some-http-client';\nexport const value = client.get('/secret');\n",
  );
  assert.throws(
    () => assertNoDirectPrivilegedAccess(packageImportFixture, 'stage'),
    /cannot import an unapproved runtime package/,
    'unapproved third-party packages must not bypass capability adapters',
  );
  const computedGlobalFixture = path.join(parserFixtureRoot, 'computed-global-stage.ts');
  fs.writeFileSync(
    computedGlobalFixture,
    "export const value = globalThis['process']['env']['SECRET'];\n",
  );
  assert.throws(
    () => assertNoDirectPrivilegedAccess(computedGlobalFixture, 'stage'),
    /must use a capability adapter/,
    'computed global access must not bypass capability adapters',
  );
  const cleanSource = path.join(parserFixtureRoot, 'source.ts');
  const fixtureDist = path.join(parserFixtureRoot, 'dist');
  const fixtureShared = path.join(parserFixtureRoot, 'shared');
  fs.mkdirSync(fixtureDist);
  fs.mkdirSync(fixtureShared);
  const unsafeDist = path.join(fixtureDist, 'stage.js');
  const unsafeShared = path.join(fixtureShared, 'unsafe.js');
  fs.writeFileSync(cleanSource, 'export const execute = () => ({});\n');
  fs.writeFileSync(unsafeDist, "export { execute } from '../shared/unsafe.js';\n");
  fs.writeFileSync(unsafeShared, "import fs from 'node:fs';\nexport const execute = () => fs.readFileSync('/tmp/value');\n");
  assert.doesNotThrow(
    () => assertRegistrationGraphHasNoPrivilegedAccess(cleanSource, parserFixtureRoot, 'stage'),
  );
  assert.throws(
    () => assertRegistrationGraphHasNoPrivilegedAccess(unsafeDist, parserFixtureRoot, 'stage'),
    /must use a capability adapter/,
    'the executable dist registration graph must be scanned independently from source',
  );
  const isolatedPackage = path.join(parserFixtureRoot, 'isolated-package');
  fs.mkdirSync(isolatedPackage);
  const escapingEntrypoint = path.join(isolatedPackage, 'stage.js');
  fs.writeFileSync(escapingEntrypoint, "export { execute } from '../shared/unsafe.js';\n");
  assert.throws(
    () => assertRegistrationGraphHasNoPrivilegedAccess(escapingEntrypoint, isolatedPackage, 'stage'),
    /cannot import outside its package/,
    'registration graphs must reject imports outside the package boundary',
  );
  const commonJsEntrypoint = path.join(isolatedPackage, 'stage.cjs');
  fs.writeFileSync(
    commonJsEntrypoint,
    "module.exports.execute = () => module.require('node:fs').readFileSync('/tmp/value');\n",
  );
  assert.throws(
    () => assertRegistrationGraphHasNoPrivilegedAccess(commonJsEntrypoint, isolatedPackage, 'stage'),
    /must use ESM, not CommonJS/,
    'CommonJS loader globals must not bypass capability adapters',
  );
} finally {
  fs.rmSync(parserFixtureRoot, { recursive: true, force: true });
}

for (const file of files('skills/nova/core')) {
  for (const reference of moduleSpecifiers(file)) {
    const resolved = resolvedReference(file, reference.specifier);
    assert(
      !pluginRoots.some((pluginRoot) => inside(resolved, pluginRoot))
      && !roleRoots.some((roleRoot) => inside(resolved, roleRoot) && !inside(resolved, coreRoot))
      && (!packageName(reference.specifier).startsWith('@kubeclaw/')
        || approvedCorePackages.has(packageName(reference.specifier))),
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
      !roleRoots.some((roleRoot) => inside(resolved, roleRoot)),
      `SDK cannot import core: ${file}:${reference.line} -> ${reference.specifier}`,
    );
    assert(
      !pluginRoots.some((pluginRoot) => inside(resolved, pluginRoot))
      && !roleRoots.some((roleRoot) => inside(resolved, roleRoot))
      && (!packageName(reference.specifier).startsWith('@kubeclaw/')
        || approvedSdkPackages.has(packageName(reference.specifier))),
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
// Root plugins/ contains Codex operations extensions, whose manifest contract
// is .codex-plugin/plugin.json. Pipeline discovery reads package/plugin.json
// (foundation/registry/discovery.ts) and must stay under the role roots above.
function assertOnlyCodexPlugins(root) {
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    assert(entry.isDirectory(), `root plugins/ entry must be a Codex plugin directory: ${entry.name}`);
    const packageRoot = path.join(root, entry.name);
    const codexManifest = path.join(packageRoot, '.codex-plugin', 'plugin.json');
    assert(fs.existsSync(codexManifest), `root plugin requires a Codex manifest: ${packageRoot}`);
    const manifest = JSON.parse(fs.readFileSync(codexManifest, 'utf8'));
    assert.equal(typeof manifest.name, 'string');
    assert.notEqual(manifest.apiVersion, 'pipeline-plugin-v2', 'Codex manifest cannot declare a pipeline plugin');
    for (const file of allFiles(packageRoot)) {
      if (file === codexManifest) continue;
      assert(!['plugin.json', 'openclaw.plugin.json'].includes(path.basename(file)),
        `role-agnostic pipeline/plugin registration must not return: ${file}`);
    }
  }
}
assertOnlyCodexPlugins('plugins');
const rootPluginFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-root-plugin-boundary-'));
try {
  const codexRoot = path.join(rootPluginFixture, 'operations');
  fs.mkdirSync(path.join(codexRoot, '.codex-plugin'), { recursive: true });
  fs.writeFileSync(path.join(codexRoot, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'operations' }));
  assertOnlyCodexPlugins(rootPluginFixture);
  fs.writeFileSync(path.join(codexRoot, 'plugin.json'), JSON.stringify({ apiVersion: 'pipeline-plugin-v2' }));
  assert.throws(() => assertOnlyCodexPlugins(rootPluginFixture), /role-agnostic pipeline\/plugin registration/);
  fs.rmSync(path.join(codexRoot, 'plugin.json'));
  fs.mkdirSync(path.join(rootPluginFixture, 'role-agnostic'));
  assert.throws(() => assertOnlyCodexPlugins(rootPluginFixture), /requires a Codex manifest/);
} finally {
  fs.rmSync(rootPluginFixture, { recursive: true, force: true });
}
for (const packageRoot of isolatedPackageRoots) {
  const pipelineManifestPath = path.join(packageRoot, 'plugin.json');
  if (fs.existsSync(pipelineManifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(pipelineManifestPath, 'utf8'));
    if (manifest.apiVersion !== 'pipeline-plugin-v2') continue;
  }
  const packageMetadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const ownPackageName = packageMetadata.name;
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
  if (fs.existsSync(pipelineManifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(pipelineManifestPath, 'utf8'));
    if ((manifest.stages?.length ?? 0) > 0 || (manifest.observers?.length ?? 0) > 0) {
      assert.equal(
        packageMetadata.type,
        'module',
        `stage and observer packages must use ESM so CommonJS loader globals are unavailable: ${packageRoot}`,
      );
    }
    for (const [surface, registrations] of [
      ['stage', manifest.stages ?? []],
      ['observer', manifest.observers ?? []],
    ]) {
      for (const registration of registrations) {
        const sourceRelative = registration.module
          .replace(/^dist\//u, 'src/')
          .replace(/\.js$/u, '.ts');
        const sourceEntrypoint = path.join(packageRoot, sourceRelative);
        const executableEntrypoint = path.join(packageRoot, registration.module);
        assert(fs.existsSync(sourceEntrypoint), `${surface} source entrypoint must exist: ${sourceEntrypoint}`);
        assert(fs.existsSync(executableEntrypoint), `${surface} executable entrypoint must exist: ${executableEntrypoint}`);
        assertRegistrationGraphHasNoPrivilegedAccess(
          sourceEntrypoint,
          path.resolve(packageRoot),
          surface,
        );
        assertRegistrationGraphHasNoPrivilegedAccess(
          executableEntrypoint,
          path.resolve(packageRoot),
          surface,
        );
      }
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

const core = await import(pathToFileURL(path.resolve('skills/nova/core/src/index.ts')).href);
const kernel = core.createEmptyCoreKernel();
assert.equal(kernel.apiVersion, 'pipeline-plugin-v2');
assert.deepEqual(kernel.registry.packages, []);
assert.deepEqual(kernel.registry.registrations, []);
assert(Object.isFrozen(kernel));
assert(Object.isFrozen(kernel.registry));

console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-boundaries' }));
