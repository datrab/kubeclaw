import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { provider } from '../src/provider.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-budget-provider-'));
try {
  const file = path.join(root, 'lcov.info');
  const content = Buffer.from('TN:\nSF:src/a.ts\nDA:1,1\nDA:2,0\nend_of_record\n');
  fs.writeFileSync(file, content);
  const artifact = { artifactId: 'coverage', type: 'coverage', mediaType: 'text/lcov',
    contentDigest: `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`,
    sizeBytes: content.byteLength, storageUrl: pathToFileURL(file).href };
  const base: any = { testIdentity: 'test:coverage', configuration: { values: { minimumLinePercent: 50 } },
    inputs: [{ name: 'coverage-1', kind: 'artifact', artifact }] };
  assert.equal((await provider().execute(base)).outcome, 'passed');
  assert.equal((await provider().execute({ ...base, configuration: { values: { minimumLinePercent: 51 } } })).outcome, 'failed');
  await assert.rejects(() => provider().execute({ ...base, inputs: [...base.inputs, ...base.inputs] }), /COVERAGE_INPUT_DUPLICATE/u);
  const fileTwo = path.join(root, 'lcov-two.info');
  const contentTwo = Buffer.from('TN:\nSF:src/b.ts\nDA:1,1\nDA:2,1\nend_of_record\n'); fs.writeFileSync(fileTwo, contentTwo);
  const artifactTwo = { ...artifact, artifactId: 'coverage-two',
    contentDigest: `sha256:${crypto.createHash('sha256').update(contentTwo).digest('hex')}`,
    sizeBytes: contentTwo.byteLength, storageUrl: pathToFileURL(fileTwo).href };
  const combined = await provider().execute({ ...base, configuration: { values: { minimumLinePercent: 75, combine: true } },
    inputs: [...base.inputs, { name: 'coverage-2', kind: 'artifact', artifact: artifactTwo }] });
  assert.equal(combined.outcome, 'passed'); assert.equal(combined.metrics[0].value, 75);
  const malformed = path.join(root, 'malformed.info'); fs.writeFileSync(malformed, 'not-lcov\n');
  const malformedBytes = fs.readFileSync(malformed);
  await assert.rejects(() => provider().execute({ ...base, inputs: [{ name: 'coverage-1', kind: 'artifact', artifact: {
    ...artifact, contentDigest: `sha256:${crypto.createHash('sha256').update(malformedBytes).digest('hex')}`,
    sizeBytes: malformedBytes.byteLength, storageUrl: pathToFileURL(malformed).href } }] }), /COVERAGE_LCOV_INVALID/u);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, provider: 'coverage-budget', format: 'lcov' }));
