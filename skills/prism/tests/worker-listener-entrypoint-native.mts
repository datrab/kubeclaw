/** Original retired-PORT subprocess negatives, through genuine installed boot.
 * Run only in the isolated guest; no shared host paths are installed by local checks.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import test from 'node:test';
import {readTestPipeline, writeTestPipeline} from '../../../tests/fixtures/config/pipeline-components.mjs';
import {spawnInstalledPrismProcess} from './fixtures/published-process.mjs';

for (const PORT of ['', '8080']) test(`WL actual entrypoint rejects retired PORT ${JSON.stringify(PORT)}`, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-listener-installed-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const entry = path.join(root, 'pipeline.config.json');
  writeTestPipeline(entry, readTestPipeline());
  const {child} = await spawnInstalledPrismProcess(t, entry, 'prism-worker', {
    PORT, WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://listener/control',
  });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += String(chunk); });
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  const cutoff = setTimeout(() => child.kill('SIGKILL'), 5000);
  let status: number | null;
  try { [status] = await once(child, 'exit') as [number | null, NodeJS.Signals | null]; }
  finally { clearTimeout(cutoff); }
  assert.equal(status, 1, stdout + stderr);
  assert.match(stderr, /SWARM_CONFIG_LEGACY_OVERRIDE:PORT/u);
  assert.doesNotMatch(stderr, /NATIVE_(?:SUPERVISOR|LAUNCHER|POOL)/u);
});
