import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const plugin = path.resolve(import.meta.dirname, '..');
const repository = path.resolve(plugin, '../../../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'observer-clean-source-'));
const relative = 'skills/common/plugins/openclaw-agent-observer';
const copied = path.join(temporary, relative);
const canonical = path.join(temporary, 'contracts/agent-observability/v1/src');
const compiler = path.join(repository, 'node_modules/typescript/bin/tsc');
try {
  fs.cpSync(plugin, copied, { recursive: true, filter: (source) =>
    !['generated', 'dist', 'node_modules'].includes(path.basename(source)) });
  fs.cpSync(path.join(repository, 'contracts/agent-observability/v1'), path.dirname(canonical), { recursive: true });
  fs.copyFileSync(path.join(repository, 'tsconfig.base.json'), path.join(temporary, 'tsconfig.base.json'));
  for (const dependency of ['@types/node', 'undici-types']) {
    fs.cpSync(path.join(repository, 'node_modules', dependency), path.join(temporary, 'node_modules', dependency), { recursive: true });
  }
  const generated = path.join(copied, 'src/generated/agent-observability');
  assert.equal(fs.existsSync(generated), false);
  execFileSync(process.execPath, ['scripts/build.mjs', '--tsc', compiler], { cwd: copied, stdio: 'inherit' });
  for (const name of fs.readdirSync(canonical)) {
    assert.deepEqual(fs.readFileSync(path.join(generated, name)), fs.readFileSync(path.join(canonical, name)));
  }
  assert.equal(fs.existsSync(path.join(copied, 'dist/generated/agent-observability/index.js')), true);
  const config = await import(pathToFileURL(path.join(copied, 'dist/config.js')).href);
  assert.equal(typeof config.resolveAgentObserverConfig, 'function');
  const contract = await import(pathToFileURL(path.join(copied, 'dist/generated/agent-observability/index.js')).href);
  assert.equal(contract.normalizeAgentObservabilityMaxEventBytes(65536), 65536);

  // A detached package still requires an explicit canonical source input.
  const detachedCanonical = path.join(temporary, 'canonical-source');
  fs.renameSync(canonical, detachedCanonical);
  fs.writeFileSync(path.join(generated, 'stale.ts'), 'export const stale = true;\n');
  execFileSync(process.execPath, ['scripts/build.mjs', '--tsc', compiler, '--contract-source', detachedCanonical],
    { cwd: copied, stdio: 'inherit' });
  assert.equal(fs.existsSync(path.join(generated, 'stale.ts')), false);
  assert.equal(fs.existsSync(path.join(copied, 'dist/generated/agent-observability/stale.js')), false);
  assert.deepEqual(fs.readFileSync(path.join(generated, 'index.ts')), fs.readFileSync(path.join(detachedCanonical, 'index.ts')));

  // Existing generated files never substitute for a missing canonical build input.
  const missing = spawnSync(process.execPath, ['scripts/build.mjs', '--tsc', compiler], { cwd: copied, encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Agent observability contract source is missing/u);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, suite: 'observer-clean-source-build', compiler: 'actual-typescript' }));
