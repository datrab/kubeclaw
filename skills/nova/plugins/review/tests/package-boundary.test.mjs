import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { echoReviewOutputSchema } from '../src/echo-review-contract.ts';

for (const name of fs.readdirSync(path.resolve('src'), { recursive: true })) {
  const file = path.resolve('src', name);
  if (!fs.statSync(file).isFile() || !/\.[cm]?[jt]s$/u.test(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /skills\/nova\/pipeline|review-gate-/u);
  assert.doesNotMatch(source, /\bas StageResult\b/u);
  assert.doesNotMatch(source, /return\s+response\.result/u);
  assert.doesNotMatch(source, /REVIEW_STATUSES|reviewerOutputSchema/u);
}

const manifest = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
assert.deepEqual(manifest.stages[0].requiredCapabilities, ['runtime.dispatch', 'git.repository.read', 'artifacts.read', 'artifacts.write']);
assert.equal(manifest.stages[0].module, 'src/stage.ts');
assert.equal(manifest.stages[1].id, 'repository-audit');
assert.equal(manifest.stages[1].module, 'src/repository-audit-stage.ts');
assert.equal(manifest.stages[1].configSchema, 'schemas/repository-audit-config.schema.json');
assert.deepEqual(manifest.stages[1].requiredCapabilities,
  ['runtime.dispatch', 'git.repository.read', 'artifacts.read', 'artifacts.write']);
assert.equal(manifest.stages[2].id, 'repository-revalidation');
assert.equal(manifest.stages[2].module, 'src/repository-revalidation-stage.ts');
assert.equal(manifest.stages[2].inputSchema, 'schemas/repository-revalidation-input.schema.json');
assert.deepEqual(manifest.stages[2].requiredCapabilities,
  ['runtime.dispatch', 'git.repository.read', 'artifacts.read', 'artifacts.write']);
assert.equal(echoReviewOutputSchema.additionalProperties, false);
assert.equal(Object.hasOwn(echoReviewOutputSchema.properties, 'status'), false);
assert.equal(fs.existsSync('src/contracts.ts'), false);
assert.equal(fs.existsSync('src/review-output.ts'), false);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'package-boundary' }));
