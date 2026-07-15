import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { TOOL_REGISTRY } from '../../../../../../skills/nova/pipeline/tools/lint-report/tool-registry.ts';

test('shellcheck parses json comments output', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shellcheck-report-test-'));
  const binDir = path.join(tempRoot, 'bin');
  fs.mkdirSync(binDir);
  fs.writeFileSync(path.join(tempRoot, 'x.sh'), '#!/usr/bin/env sh\necho "$name"\n');

  const shellcheckPath = path.join(binDir, 'shellcheck');
  fs.writeFileSync(shellcheckPath, `#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  comments: [{
    file: 'x.sh',
    line: 1,
    column: 1,
    level: 'error',
    code: 2086,
    message: 'msg'
  }]
}));
`);
  fs.chmodSync(shellcheckPath, 0o755);

  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`;

  try {
    const shellcheck = TOOL_REGISTRY.find(tool => tool.id === 'shellcheck');
    const result = shellcheck.run({
      repoRoot: tempRoot,
      modulePath: null,
      projectTypes: new Set(['shell']),
      changedFiles: [],
    });

    assert.equal(result.errors, 1);
    assert.equal(result.warnings, 0);
    assert.deepEqual(result.findings, [{
      file: 'x.sh',
      line: 1,
      column: 1,
      severity: 'error',
      code: 'SC2086',
      message: 'msg',
    }]);
  } finally {
    process.env.PATH = originalPath;
  }
});

test('knip skips tiny fixtures without dependency graph authority', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'knip-skip-test-'));
  fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
    name: 'tiny-fixture',
    private: true,
    scripts: {
      verify: 'node verify.mjs',
    },
  }, null, 2));
  fs.writeFileSync(path.join(tempRoot, 'verify.mjs'), 'console.log("ok");\n');

  const knip = TOOL_REGISTRY.find(tool => tool.id === 'knip');
  const result = knip.run({
    repoRoot: tempRoot,
    modulePath: null,
    projectTypes: new Set(['javascript']),
    changedFiles: [],
  });

  assert.equal(result.errors, 0);
  assert.equal(result.warnings, 0);
  assert.equal(result.findings[0].code, 'knip:skipped_no_package_graph');
});
