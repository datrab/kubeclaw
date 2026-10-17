import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// This executes the real emitted CLI outside checkout module resolution.
// Playwright lib/mcp/test is runtime code despite its directory name.
test('Buster runtime bundle preserves published Playwright dependency closure', () => {
  const repository = path.resolve(import.meta.dirname, '../../..');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-dependency-closure-'));
  try {
    const output = path.join(temporary, 'bundle');
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repository, encoding: 'utf8'}).trim();
    execFileSync(process.execPath, [path.join(repository, 'scripts/build-runtime-role-bundle.mjs'),
      'buster', output, revision, 'v2', '1970-01-01T00:00:00Z'], {cwd: repository, stdio: 'pipe'});
    const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.schemaVersion, 'pipeline-runtime-bundle.v2');
    const dependency = 'skills/node_modules/playwright/lib/mcp/test/testBackend.js';
    assert.ok(manifest.files.some(entry => entry.path === dependency), 'runtime dependency missing from sealed file index');
    assert.equal(fs.readFileSync(path.join(output, dependency), 'utf8'),
      fs.readFileSync(path.join(repository, 'node_modules/playwright/lib/mcp/test/testBackend.js'), 'utf8'));
    const version = execFileSync(process.execPath, [path.join(output, 'skills/node_modules/playwright/cli.js'), '--version'],
      {cwd: temporary, encoding: 'utf8', env: {PATH: process.env.PATH ?? '', NODE_PATH: ''}});
    assert.match(version, /^Version \d+\.\d+\.\d+/u);
  } finally { fs.rmSync(temporary, {recursive: true, force: true}); }
});
