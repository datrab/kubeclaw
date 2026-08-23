import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const bundle = path.resolve(process.argv[2] ?? '');
const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'manifest.json'), 'utf8'));

for (const plugin of manifest.plugins) {
  const root = path.join(bundle, plugin.target);
  const pluginManifestPath = path.join(root, 'plugin.json');
  if (fs.existsSync(pluginManifestPath)) {
    const pluginManifest = JSON.parse(fs.readFileSync(pluginManifestPath, 'utf8'));
    for (const registration of [
      ...(pluginManifest.stages ?? []),
      ...(pluginManifest.observers ?? []),
      ...(pluginManifest.adapters ?? []),
      ...(pluginManifest.testProviders ?? []),
      ...(pluginManifest.reportAdapters ?? []),
    ]) {
      const loaded = await import(pathToFileURL(path.join(root, registration.module)).href);
      assert.equal(typeof loaded[registration.export], 'function',
        `${plugin.id}:${registration.id} does not export ${registration.export}`);
    }
    continue;
  }

  const openClawPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const extension of openClawPackage.openclaw?.extensions ?? []) {
    const loaded = await import(pathToFileURL(path.join(root, extension)).href);
    assert.equal(typeof loaded.default?.register, 'function', `${plugin.id} extension has no register function`);
  }
}

console.log(JSON.stringify({ ok: true, plugins: manifest.plugins.length, role: manifest.role }));
