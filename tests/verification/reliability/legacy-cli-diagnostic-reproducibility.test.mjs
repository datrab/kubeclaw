import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const diagnostic = fileURLToPath(new URL('../../../docs/review/evidence/run5-adapter-legacy-cli-diagnostic.mjs', import.meta.url));

test('archived legacy CLI diagnostic runs historical source before harness-owned legacy import writes', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [diagnostic, root], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"diagnostic":"historical-source-stage-results"/);
  assert.match(result.stdout, /"source-preflight",\{"stageId":"source-preflight","status":"succeeded"/);
  assert.match(result.stdout, /"scope":"original-project-legacy-cli-recovery"/);
  assert.match(result.stdout, /"scope":"legacy-authoring-import"/);
  assert.doesNotMatch(result.stdout + result.stderr, /REVIEW_SOURCE_DIRTY/);
});
