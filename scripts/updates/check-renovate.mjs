import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const renovate = process.env.RENOVATE_PACKAGE_ROOT ?? '/usr/local/renovate';
const { extractPackageFile } = await import(pathToFileURL(`${renovate}/dist/modules/manager/custom/regex/index.js`));
const { doAutoReplace } = await import(pathToFileURL(`${renovate}/dist/workers/repository/update/branch/auto-replace.js`));
const { GlobalConfig } = await import(pathToFileURL(`${renovate}/dist/config/global.js`));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'renovate-replacement-'));
GlobalConfig.set({ localDir: temporary });
const config = JSON.parse(fs.readFileSync('renovate.json'));
const content = fs.readFileSync('versions.json', 'utf8');
const manifest = JSON.parse(content);
const extracted = config.customManagers.map(manager => ({ manager, deps: extractPackageFile(content, 'versions.json', manager)?.deps ?? [] }));
const deps = extracted.flatMap(item => item.deps);
const fields = [...Object.entries(manifest.buildArgs), ...Object.values(manifest.imageOverrides).flatMap(Object.entries)]
  .filter(([key]) => key.endsWith('_VERSION') || key.endsWith('_BASE'));
for (const [key] of fields) assert.ok(deps.some(dep => dep.replaceString?.includes(`"${key}"`)), `Undiscovered pin: ${key}`);
assert.ok(deps.every(dep => !dep.skipReason));
assert.ok(deps.some(dep => dep.depName === 'openclaw/openclaw'));
for (const [key, image] of Object.entries(manifest.automation)) {
  const matches = deps.filter(dep => dep.replaceString?.includes(`"${key}"`));
  assert.equal(matches.length, 1, `Expected exactly one discovered automation pin: ${key}`);
  const dep = matches[0];
  assert.equal(`${dep.depName}:${dep.currentValue}@${dep.currentDigest}`, image,
    `Incorrect image extraction for automation pin: ${key}`);
}
const redisChart = deps.filter(dep => dep.depName === 'registry-1.docker.io/bitnamicharts/redis');
assert.equal(redisChart.length, 1);
assert.equal(redisChart[0].currentValue, manifest.redisProduction.chartVersion);
const redisImages = deps.filter(dep => dep.depName === 'registry-1.docker.io/bitnami/redis');
assert.equal(redisImages.length, 1);
assert.equal(`${redisImages[0].depName}:${redisImages[0].currentValue}@${redisImages[0].currentDigest}`, manifest.redisProduction.image);
// Exercise Renovate's real replacement engine, including native v-prefixed overrides.
// Synthetic versions stay in a disposable directory and are never published or built.
for (const prefix of ['', 'v']) {
  const item = extracted.find(item => item.deps.some(dep => dep.replaceString.startsWith(`"HELM_VERSION": "${prefix}3`)));
  const dep = item.deps.find(dep => dep.replaceString.startsWith(`"HELM_VERSION": "${prefix}3`));
  const updated = await doAutoReplace({ ...item.manager, ...dep, manager: 'regex', depIndex: item.deps.indexOf(dep), packageFile: 'versions.json', newValue: '3.99.99', newVersion: '3.99.99' }, content, false);
  assert.ok(updated?.includes(`"HELM_VERSION": "${prefix}3.99.99"`), 'Renovate must preserve the native version prefix');
  JSON.parse(updated);
}
fs.rmSync(temporary, { recursive: true, force: true });
console.log(`Actual Renovate discovered ${deps.length} central declarations and preserved version prefixes during updates.`);
