import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ownership = JSON.parse(fs.readFileSync(path.join(root, 'packaging/runtime/package-ownership.json'), 'utf8'));
const externalCatalog = JSON.parse(fs.readFileSync(path.join(root, 'packaging/runtime/external-capabilities.json'), 'utf8'));
assert.equal(externalCatalog.schemaVersion, 'pipeline-runtime-external-capabilities.v1');
const externalSources = new Map(externalCatalog.sources.map((entry) => [entry.id, entry]));
assert.equal(externalSources.size, externalCatalog.sources.length, 'duplicate external capability source');
const packages = new Map(ownership.packages.map((entry) => [entry.id, entry]));

function pluginCatalog() {
  const roots = [
    ['shared', 'skills/common/plugins'],
    ['nova', 'skills/nova/plugins'],
    ['buster', 'skills/buster/plugins'],
    ['prism', 'skills/prism/plugins'],
  ];
  const result = new Map();
  for (const [owner, relativeRoot] of roots) {
    const directory = path.join(root, relativeRoot);
    if (!fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(directory, entry.name, 'plugin.json');
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert(!result.has(manifest.id), `duplicate plugin ID: ${manifest.id}`);
      result.set(manifest.id, { owner, root: path.dirname(manifestPath), manifest });
    }
  }
  return result;
}

const plugins = pluginCatalog();
const extensionCatalog = new Map([
  ['kubeclaw-agent-observer', { owner: 'shared', root: 'skills/common/plugins/openclaw-agent-observer' }],
]);
const selectedByRole = new Map();
const packageNames = new Map();
const pluginPackageNames = new Map();
for (const entry of ownership.packages) {
  const manifestPath = path.join(root, entry.source, 'package.json');
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.name) packageNames.set(manifest.name, entry.id);
}
for (const [pluginId, plugin] of plugins) {
  const manifestPath = path.join(plugin.root, 'package.json');
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.name) continue;
  assert(!pluginPackageNames.has(manifest.name), `duplicate plugin package name: ${manifest.name}`);
  pluginPackageNames.set(manifest.name, pluginId);
}

for (const role of ['nova', 'buster', 'prism']) {
  const manifestPath = path.join(root, `packaging/runtime/roles/${role}.json`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schemaVersion, 'pipeline-runtime-role.v1');
  assert.equal(manifest.role, role);
  for (const field of ['packages', 'plugins', 'extensions', 'externalCapabilities']) {
    assert(Array.isArray(manifest[field]), `${role} ${field} must be an array`);
  }
  assert.equal(new Set(manifest.packages).size, manifest.packages.length, `${role} has duplicate packages`);
  assert.equal(new Set(manifest.plugins).size, manifest.plugins.length, `${role} has duplicate plugins`);
  assert.equal(new Set(manifest.extensions).size, manifest.extensions.length, `${role} has duplicate extensions`);
  assert(manifest.packages.includes(manifest.entrypoint.package), `${role} entrypoint package is not selected`);
  const entrypointPackage = packages.get(manifest.entrypoint.package);
  assert(entrypointPackage, `${role} entrypoint package is unknown`);
  const entrypointRoot = path.resolve(root, entrypointPackage.source);
  const entrypoint = path.resolve(entrypointRoot, manifest.entrypoint.path);
  assert(entrypoint.startsWith(`${entrypointRoot}${path.sep}`), `${role} entrypoint escapes its package`);
  assert(fs.existsSync(entrypoint), `${role} entrypoint is missing`);

  for (const packageId of manifest.packages) {
    const entry = packages.get(packageId);
    assert(entry, `${role} selects unknown package: ${packageId}`);
    assert(entry.roles.includes(role), `${role} cannot select package ${packageId}`);
    const packageManifestPath = path.join(root, entry.source, 'package.json');
    if (!fs.existsSync(packageManifestPath)) continue;
    const packageManifest = JSON.parse(fs.readFileSync(packageManifestPath, 'utf8'));
    for (const dependency of Object.keys(packageManifest.dependencies ?? {})) {
      const dependencyId = packageNames.get(dependency);
      const dependencyPluginId = pluginPackageNames.get(dependency);
      if (dependency.startsWith('@kubeclaw/')) assert(dependencyId || dependencyPluginId,
        `${role} package ${packageId} has unregistered internal dependency ${dependency}`);
      if (dependencyId) assert(manifest.packages.includes(dependencyId), `${role} package closure misses ${dependencyId} required by ${packageId}`);
      if (dependencyPluginId) assert(manifest.plugins.includes(dependencyPluginId),
        `${role} plugin closure misses ${dependencyPluginId} required by ${packageId}`);
    }
    for (const assetId of packageManifest.kubeclawRuntimeAssets ?? []) {
      assert(packages.has(assetId), `${role} package ${packageId} has unknown runtime asset ${assetId}`);
      assert(manifest.packages.includes(assetId), `${role} package closure misses asset ${assetId} required by ${packageId}`);
    }
  }

  const requiredCapabilities = new Set();
  const providedCapabilities = new Set();
  for (const pluginId of manifest.plugins) {
    const plugin = plugins.get(pluginId);
    assert(plugin, `${role} selects unknown plugin: ${pluginId}`);
    assert(plugin.owner === 'shared' || plugin.owner === role, `${role} cannot select ${plugin.owner} plugin ${pluginId}`);
    for (const registration of [...(plugin.manifest.stages ?? []), ...(plugin.manifest.observers ?? []), ...(plugin.manifest.adapters ?? [])]) {
      for (const capability of registration.requiredCapabilities ?? []) requiredCapabilities.add(capability);
    }
    for (const adapter of plugin.manifest.adapters ?? []) {
      for (const capability of adapter.providesCapabilities ?? []) providedCapabilities.add(capability);
    }
  }
  for (const extensionId of manifest.extensions) {
    const extension = extensionCatalog.get(extensionId);
    assert(extension, `${role} selects unknown extension: ${extensionId}`);
    assert(extension.owner === 'shared' || extension.owner === role, `${role} cannot select extension ${extensionId}`);
    assert(fs.existsSync(path.join(root, extension.root, 'package.json')), `${role} extension is missing: ${extensionId}`);
  }
  selectedByRole.set(role, new Set([...manifest.plugins, ...manifest.extensions]));
  const externalCapabilities = new Set();
  for (const capability of manifest.externalCapabilities) {
    assert.equal(typeof capability.id, 'string');
    assert.equal(typeof capability.source, 'string');
    assert(capability.reason.length >= 20, `${role} external capability needs a clear reason: ${capability.id}`);
    assert(!externalCapabilities.has(capability.id), `${role} has duplicate external capability: ${capability.id}`);
    externalCapabilities.add(capability.id);
    const source = externalSources.get(capability.source);
    assert(source, `${role} uses unknown external capability source: ${capability.source}`);
    assert(source.roles.includes(role), `${capability.source} is not available to ${role}`);
    assert(source.capabilities.includes(capability.id), `${capability.source} does not provide ${capability.id}`);
  }
  for (const capability of requiredCapabilities) {
    assert(providedCapabilities.has(capability) || externalCapabilities.has(capability), `${role} has no provider for ${capability}`);
  }

  const rolePluginRoot = path.join(root, `skills/${role}/plugins`);
  if (!fs.existsSync(rolePluginRoot)) continue;
  const ownedPluginIds = fs.readdirSync(rolePluginRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(rolePluginRoot, entry.name, 'plugin.json')))
    .flatMap((entry) => {
      const plugin = JSON.parse(fs.readFileSync(path.join(rolePluginRoot, entry.name, 'plugin.json'), 'utf8'));
      const registrationCount = ['stages', 'observers', 'adapters', 'testProviders']
        .reduce((count, field) => count + (Array.isArray(plugin[field]) ? plugin[field].length : 0), 0);
      return registrationCount > 0 ? [plugin.id] : [];
    });
  for (const pluginId of ownedPluginIds) assert(manifest.plugins.includes(pluginId), `${role} omits its plugin: ${pluginId}`);
}

for (const [directory, expectedRoles] of Object.entries(ownership.sharedPlugins)) {
  const pipelinePlugin = [...plugins.entries()].find(([, entry]) => path.basename(entry.root) === directory)?.[0];
  const extension = [...extensionCatalog.entries()].find(([, entry]) => path.basename(entry.root) === directory)?.[0];
  const runtimeId = pipelinePlugin ?? extension;
  if (!runtimeId) {
    assert.deepEqual(expectedRoles, [], `unclassified shared package use: ${directory}`);
    continue;
  }
  const actualRoles = [...selectedByRole].filter(([, selected]) => selected.has(runtimeId)).map(([role]) => role).sort();
  assert.deepEqual([...expectedRoles].sort(), actualRoles, `role manifests disagree with shared package inventory: ${directory}`);
}

console.log(JSON.stringify({ ok: true, phase: '5.6-C', roles: 3, plugins: plugins.size }));
