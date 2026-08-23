import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-package-cutover-'));
const commit = '0000000000000000000000000000000000000000';
const builtAt = '1970-01-01T00:00:00Z';

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

try {
  for (const role of ['nova', 'buster']) {
    const first = path.join(temporary, `${role}-a.tgz`);
    const second = path.join(temporary, `${role}-b.tgz`);
    for (const output of [first, second]) {
      execFileSync('bash', [path.join(root, 'scripts/package-agent-skill-bundle.sh'), role, output, commit, 'v2', builtAt]);
    }
    assert.equal(sha256(first), sha256(second), `${role} archive is not byte reproducible`);

    const extract = path.join(temporary, `${role}-extract`);
    fs.mkdirSync(extract);
    execFileSync('tar', ['-xzf', first, '-C', extract]);
    const bundle = path.join(extract, `${role}-${commit}`);
    const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'manifest.json'), 'utf8'));
    const roleManifest = JSON.parse(fs.readFileSync(path.join(root, `packaging/runtime/roles/${role}.json`), 'utf8'));
    assert.equal(manifest.schemaVersion, 'pipeline-runtime-bundle.v1');
    assert.equal(manifest.bundleKind, 'app-skills-package-set');
    assert.equal(manifest.role, role);
    assert.deepEqual(manifest.packages.map((entry) => entry.id), roleManifest.packages);
    assert.deepEqual(manifest.plugins.map((entry) => entry.id), [...roleManifest.plugins, ...roleManifest.extensions]);
    assert.equal(fs.existsSync(path.join(bundle, 'skills/common')), false, 'legacy Common overlay leaked into archive');
    assert.equal(fs.existsSync(path.join(bundle, 'skills/plugins/prompt-contract')), false, 'unused shared package leaked into archive');

    const entrypoint = pathToFileURL(path.join(bundle, 'skills', roleManifest.entrypoint.output)).href;
    const expression = role === 'nova'
      ? `import('${entrypoint}').then(m=>{if(typeof m.PipelineRunner!=='function'||'WorkerAttemptExecutor' in m)process.exit(2)})`
      : `import('${entrypoint}').then(m=>{if(typeof m.TestPlanRunner!=='function'||'PipelineRunner' in m)process.exit(2)})`;
    execFileSync(process.execPath, ['-e', expression], {
      cwd: temporary,
      env: { PATH: process.env.PATH ?? '', HOME: temporary, NODE_PATH: '', NODE_NO_WARNINGS: '1' },
    });
    execFileSync(process.execPath, [
      path.join(root, 'tests/verification/contracts/load-runtime-bundle-plugins.mjs'),
      bundle,
    ], {
      cwd: temporary,
      env: { PATH: process.env.PATH ?? '', HOME: temporary, NODE_PATH: '', NODE_NO_WARNINGS: '1' },
    });
  }

  const packager = fs.readFileSync(path.join(root, 'scripts/package-agent-skill-bundle.sh'), 'utf8');
  assert.match(packager, /build-runtime-role-bundle\.mjs/u);
  assert.doesNotMatch(packager, /cp\s+-R[\s\S]*skills\/common|app-skills-overlay|overlayOrder/u);
  const chart = fs.readFileSync(path.join(root, 'charts/kubeclaw/templates/deployment.yaml'), 'utf8');
  assert.match(chart, /pipeline-runtime-bundle\.v1/u);
  assert.match(chart, /app-skills-package-set/u);
  assert.match(chart, /packages\|packages\/\*\|node_modules\|node_modules\/\*\|plugins\|plugins\/\*/u);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, phase: '5.6-F', roles: 2, reproducibleArchives: 4 }));
