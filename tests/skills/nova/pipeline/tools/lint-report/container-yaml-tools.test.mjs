import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { registerContainerYamlTools } from '../../../../../../skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts';

test('kubeconform parses invalid resources from json summary output', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeconform-report-test-'));
  const binDir = path.join(tempRoot, 'bin');
  fs.mkdirSync(binDir);
  fs.writeFileSync(path.join(tempRoot, 'bad.yaml'), 'apiVersion: v1\nkind: Pod\n');

  const kubeconformPath = path.join(binDir, 'kubeconform');
  fs.writeFileSync(kubeconformPath, `#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  resources: [{
    filename: 'bad.yaml',
    status: 'statusInvalid',
    msg: 'bad manifest'
  }],
  summary: { invalid: 1 }
}));
`);
  fs.chmodSync(kubeconformPath, 0o755);

  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`;

  try {
    const tools = [];
    registerContainerYamlTools(tool => tools.push(tool));
    const kubeconform = tools.find(tool => tool.id === 'kubeconform');

    const result = kubeconform.run({
      repoRoot: tempRoot,
      modulePath: null,
      projectTypes: new Set(['helm']),
      changedFiles: [],
    });

    assert.equal(result.errors, 1);
    assert.equal(result.warnings, 0);
    assert.deepEqual(result.findings, [{
      file: 'bad.yaml',
      line: null,
      column: null,
      severity: 'error',
      code: 'kubeconform',
      message: 'bad manifest',
    }]);
  } finally {
    process.env.PATH = originalPath;
  }
});
