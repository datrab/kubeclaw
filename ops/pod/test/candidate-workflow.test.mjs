import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';

const workflow = parse(fs.readFileSync(new URL('../../../.github/workflows/build-ops-mcp.yaml', import.meta.url), 'utf8'));
test('candidate image selection executes fail-closed and consumers do not parse missing skipped metadata', t => {
  const steps = workflow.jobs.validate.steps;
  const selection = steps.find(step => step.id === 'candidate');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-candidate-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const output = path.join(dir, 'output');
  const image = `ghcr.io/example/kubeclaw-ops-mcp:candidate-${'a'.repeat(40)}`;
  const run = metadata => {
    fs.writeFileSync(output, '');
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', selection.run], {
      env: { ...process.env, METADATA_JSON: metadata, GITHUB_OUTPUT: output }, encoding: 'utf8',
    });
    return { ...result, output: fs.readFileSync(output, 'utf8') };
  };
  const valid = run(JSON.stringify({ tags: [image] }));
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.output, `image=${image}\n`);
  for (const metadata of ['', '{}', '{', JSON.stringify({ tags: [] }), JSON.stringify({ tags: [image, image] }), JSON.stringify({ tags: [null] }), JSON.stringify({ tags: [image + '\nforged=output'] }), JSON.stringify({ tags: ['example/image:latest'] })]) {
    const invalid = run(metadata);
    assert.notEqual(invalid.status, 0, metadata);
    assert.equal(invalid.output, '', metadata);
  }
  const consumers = steps.filter(step => Object.hasOwn(step.env ?? {}, 'TEST_IMAGE'));
  assert.equal(consumers.length, 3);
  for (const step of consumers) assert.equal(step.env.TEST_IMAGE, '${{ steps.candidate.outputs.image }}');
  assert.equal(steps.find(step => step.id === 'build').with.tags, '${{ steps.meta.outputs.tags }}');
  assert.ok(steps.indexOf(selection) > steps.findIndex(step => step.id === 'meta'));
  assert.ok(steps.indexOf(selection) < steps.findIndex(step => step.id === 'build'));
});
