import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import perfSuite from '../../../../../skills/buster/pipeline/suites/perf.ts';

test('perfSuite isolates concurrent Lighthouse scratch reports', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-suite-'));
  const binDir = path.join(tempRoot, 'bin');
  const lighthousePath = path.join(binDir, 'lighthouse');
  const originalPath = process.env.PATH;

  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(lighthousePath, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const url = args[0] || '';
const outputPath = args[args.indexOf('--output-path') + 1];
const isSlow = url.includes('/slow');
const score = isSlow ? 0.11 : 0.91;
const writeDelay = isSlow ? 0 : 20;
const exitDelay = isSlow ? 100 : 30;

setTimeout(() => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    categories: {
      performance: { score },
      accessibility: { score },
      'best-practices': { score },
      seo: { score }
    }
  }));
}, writeDelay);

setTimeout(() => process.exit(0), exitDelay);
`);
  fs.chmodSync(lighthousePath, 0o755);
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`;

  try {
    const [slowVerdict, fastVerdict] = await Promise.all([
      perfSuite({
        moduleId: 'same-module',
        attempt: 1,
        testsLogDir: path.join(tempRoot, 'shared-tests'),
        config: { serve: { port: 4321 }, perf: { path: '/slow' } },
        logSink: null,
      }),
      perfSuite({
        moduleId: 'same-module',
        attempt: 1,
        testsLogDir: path.join(tempRoot, 'shared-tests'),
        config: { serve: { port: 4321 }, perf: { path: '/fast' } },
        logSink: null,
      }),
    ]);

    assert.equal(slowVerdict.status, 'PASS');
    assert.equal(fastVerdict.status, 'PASS');
    assert.equal(slowVerdict.metadata.scores.performance, 11);
    assert.equal(fastVerdict.metadata.scores.performance, 91);
    assert.notEqual(slowVerdict.metadata.scratch_report_path, fastVerdict.metadata.scratch_report_path);
    assert.notEqual(slowVerdict.metadata.report_path, fastVerdict.metadata.report_path);

    const slowReport = JSON.parse(fs.readFileSync(slowVerdict.metadata.report_path, 'utf8'));
    const fastReport = JSON.parse(fs.readFileSync(fastVerdict.metadata.report_path, 'utf8'));
    assert.equal(slowReport.categories.performance.score, 0.11);
    assert.equal(fastReport.categories.performance.score, 0.91);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
