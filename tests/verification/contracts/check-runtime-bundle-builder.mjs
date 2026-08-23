import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-bundle-proof-'));
const commit = '0000000000000000000000000000000000000000';
const builtAt = '1970-01-01T00:00:00Z';

try {
  for (const role of ['nova', 'buster']) {
    const output = path.join(temporary, role);
    execFileSync(process.execPath, [path.join(root, 'scripts/build-runtime-role-bundle.mjs'), role, output, commit, 'v2', builtAt]);
    const roleManifest = JSON.parse(fs.readFileSync(path.join(root, `packaging/runtime/roles/${role}.json`), 'utf8'));
    const bundleManifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(bundleManifest.schemaVersion, 'pipeline-runtime-bundle.v1');
    assert.equal(bundleManifest.bundleKind, 'app-skills-package-set');
    assert.equal(bundleManifest.role, role);
    assert.deepEqual(bundleManifest.packages.map((entry) => entry.id), roleManifest.packages);
    assert.deepEqual(bundleManifest.plugins.map((entry) => entry.id), [...roleManifest.plugins, ...roleManifest.extensions]);
    assert.equal(fs.existsSync(path.join(output, 'skills', roleManifest.entrypoint.output)), true);
    for (const entry of bundleManifest.packages.filter((candidate) => candidate.packageName)) {
      const link = path.join(output, 'skills/node_modules', entry.packageName);
      assert.equal(fs.lstatSync(link).isSymbolicLink(), true, `${role} package link is missing: ${entry.id}`);
      assert(fs.realpathSync(link).startsWith(`${path.join(output, 'skills/packages')}${path.sep}`), `${role} package link escapes: ${entry.id}`);
    }
    const forbidden = execFileSync('find', [output, '-type', 'd', '(', '-name', 'test', '-o', '-name', 'tests', '-o', '-name', 'node_modules', ')'], { encoding: 'utf8' })
      .split('\n').filter((entry) => entry && entry !== path.join(output, 'skills/node_modules'));
    assert.deepEqual(forbidden, [], `${role} bundle contains development directories`);
    const entrypoint = pathToFileURL(path.join(output, 'skills', roleManifest.entrypoint.output)).href;
    const expression = role === 'nova'
      ? `import('${entrypoint}').then(m=>{if(typeof m.PipelineRunner!=='function'||'WorkerAttemptExecutor' in m)process.exit(2)})`
      : `import('${entrypoint}').then(m=>{if(typeof m.TestPlanRunner!=='function'||'PipelineRunner' in m)process.exit(2)})`;
    execFileSync(process.execPath, ['-e', expression], {
      cwd: temporary,
      env: { PATH: process.env.PATH ?? '', HOME: temporary, NODE_PATH: '', NODE_NO_WARNINGS: '1' },
    });
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, phase: '5.6-D', roles: 2 }));
