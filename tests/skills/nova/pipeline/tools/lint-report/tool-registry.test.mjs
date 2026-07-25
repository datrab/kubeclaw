import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { TOOL_REGISTRY, uniqueTypeScriptFindings } from '../../../../../../skills/nova/pipeline/tools/lint-report/tool-registry.ts';

test('TypeScript diagnostics from overlapping projects are deduplicated by exact source location', () => {
  const duplicate = { file: 'src/a.ts', line: 4, column: 2, severity: 'error', code: 'TS1234', message: 'same problem' };
  const findings = uniqueTypeScriptFindings('/repo', [
    duplicate,
    { ...duplicate, file: '/repo/src/a.ts' },
    { ...duplicate, line: 5 },
  ]);
  assert.deepEqual(findings, [duplicate, { ...duplicate, line: 5 }]);
});

test('tsc runs each affected configured TypeScript project exactly once', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tsc-project-target-test-'));
  const binDir = path.join(tempRoot, 'bin');
  const callsPath = path.join(tempRoot, 'calls.txt');
  fs.mkdirSync(binDir);
  for (const project of ['a', 'b']) {
    fs.mkdirSync(path.join(tempRoot, project));
    fs.writeFileSync(path.join(tempRoot, project, 'tsconfig.json'), '{}\n');
    fs.writeFileSync(path.join(tempRoot, project, 'index.ts'), 'export {};\n');
  }
  const tscPath = path.join(binDir, 'tsc');
  fs.writeFileSync(tscPath, `#!/usr/bin/env node
const fs = require('fs');
fs.appendFileSync(${JSON.stringify(callsPath)}, process.argv.slice(2).join(' ') + '\\n');
`);
  fs.chmodSync(tscPath, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`;
  try {
    const tsc = TOOL_REGISTRY.find(tool => tool.id === 'tsc');
    const result = tsc.run({
      repoRoot: tempRoot,
      modulePath: null,
      requestedModulePath: null,
      changedFilesRequested: true,
      changedFiles: ['a/index.ts'],
      policyProject: { root: '.' },
      tool: { timeout_ms: 1000, targets: ['a/tsconfig.json', 'b/tsconfig.json'] },
    });
    assert.equal(result.errors, 0);
    assert.deepEqual(fs.readFileSync(callsPath, 'utf8').trim().split('\n'), [`--noEmit --pretty false --project ${path.join(tempRoot, 'a', 'tsconfig.json')}`]);
  } finally {
    process.env.PATH = originalPath;
  }
});

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
      policyProject: { root: '.' },
      policy: { global_exclusions: [] },
      tool: { timeout_ms: 1000, arguments: [], targets: ['x.sh'], include: ['**/*.sh'], exclude: [] },
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

test('shellcheck operational failure with empty JSON fails closed', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shellcheck-error-test-'));
  const binDir = path.join(tempRoot, 'bin');
  fs.mkdirSync(binDir);
  fs.writeFileSync(path.join(tempRoot, 'x.sh'), '#!/usr/bin/env sh\n');
  const shellcheckPath = path.join(binDir, 'shellcheck');
  fs.writeFileSync(shellcheckPath, '#!/usr/bin/env node\nprocess.stdout.write("[]"); process.stderr.write("cannot read target"); process.exitCode=2;\n');
  fs.chmodSync(shellcheckPath, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`;
  try {
    const shellcheck = TOOL_REGISTRY.find(tool => tool.id === 'shellcheck');
    assert.throws(
      () => shellcheck.run({ repoRoot: tempRoot, changedFilesRequested: false, policy: { global_exclusions: [] }, tool: { timeout_ms: 1000, arguments: [], targets: ['x.sh'], include: ['**/*.sh'], exclude: [] } }),
      error => error?.code === 'shellcheck-parse-failed',
    );
  } finally {
    process.env.PATH = originalPath;
  }
});

test('knip requires its exact canonical config', () => {
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
  assert.throws(
    () => knip.run({ repoRoot: tempRoot, tool: { config_path: null, timeout_ms: 1000 } }),
    error => error?.code === 'knip-config-missing',
  );
});

test('eslint requires the exact configured path', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-config-test-'));
  const eslint = TOOL_REGISTRY.find(tool => tool.id === 'eslint');

  assert.throws(
    () => eslint.run({
      repoRoot: tempRoot,
      modulePath: null,
      projectTypes: new Set(['javascript']),
      changedFiles: [],
      tool: { config_path: null, timeout_ms: 1000 },
    }),
    error => error?.code === 'eslint-config-missing'
  );
});

test('eslint gives repeated findings distinct source-stable fingerprint seeds', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-fingerprint-test-'));
  const binDir = path.join(tempRoot, 'bin');
  const configPath = path.join(tempRoot, 'eslint.config.mjs');
  fs.mkdirSync(binDir);
  fs.writeFileSync(configPath, 'export default [];\n');
  fs.writeFileSync(path.join(tempRoot, 'a.ts'), 'first();\nsecond();\n');
  fs.writeFileSync(path.join(binDir, 'eslint'), `#!/usr/bin/env node
process.stdout.write(JSON.stringify([{filePath:${JSON.stringify(path.join(tempRoot, 'a.ts'))},source:'first();\\nsecond();\\n',messages:[
  {line:1,column:1,severity:2,ruleId:'max-depth',message:'same message'},
  {line:2,column:1,severity:2,ruleId:'max-depth',message:'same message'}
]}]));
`);
  fs.chmodSync(path.join(binDir, 'eslint'), 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`;
  try {
    const eslint = TOOL_REGISTRY.find(tool => tool.id === 'eslint');
    const result = eslint.run({
      repoRoot: tempRoot,
      modulePath: null,
      changedFilesRequested: false,
      changedFiles: [],
      tool: { config_path: configPath, timeout_ms: 1000, targets: ['a.ts'] },
    });
    assert.equal(result.errors, 2);
    assert.notDeepEqual(result.findings[0].fingerprint_seed, result.findings[1].fingerprint_seed);
    assert.equal(result.findings[0].fingerprint_seed.source_line, 'first();');
    assert.equal(result.findings[1].fingerprint_seed.source_line, 'second();');
  } finally {
    process.env.PATH = originalPath;
  }
});

test('semgrep requires the exact configured path', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'semgrep-config-test-'));
  const semgrep = TOOL_REGISTRY.find(tool => tool.id === 'semgrep');

  assert.throws(
    () => semgrep.run({
      repoRoot: tempRoot,
      modulePath: null,
      projectTypes: new Set(),
      changedFiles: [],
      tool: { config_path: path.join(tempRoot, 'missing-semgrep.yml'), timeout_ms: 1000 },
    }),
    error => error?.code === 'semgrep-config-missing'
  );
});

test('semgrep scans only configured roots without network version checks', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'semgrep-scope-test-'));
  const binDir = path.join(tempRoot, 'bin');
  const configPath = path.join(tempRoot, 'semgrep.yml');
  const callsPath = path.join(tempRoot, 'calls.json');
  fs.mkdirSync(binDir);
  fs.mkdirSync(path.join(tempRoot, 'src'));
  fs.writeFileSync(configPath, 'rules: []\n');
  fs.writeFileSync(path.join(binDir, 'semgrep'), `#!/usr/bin/env node
require('fs').writeFileSync(${JSON.stringify(callsPath)}, JSON.stringify({args:process.argv.slice(2),log:process.env.SEMGREP_LOG_FILE}));
process.stdout.write(JSON.stringify({results:[],errors:[]}));
`);
  fs.chmodSync(path.join(binDir, 'semgrep'), 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`;
  try {
    const semgrep = TOOL_REGISTRY.find(tool => tool.id === 'semgrep');
    assert.equal(semgrep.run({ repoRoot: tempRoot, modulePath: null, changedFilesRequested: false, changedFiles: [], tool: { config_path: configPath, timeout_ms: 1000, targets: ['src'], exclude: ['unsupported.mjs'] } }).errors, 0);
    const call = JSON.parse(fs.readFileSync(callsPath, 'utf8'));
    assert.deepEqual(call.args, ['scan', '--json', '--disable-version-check', '--metrics=off', '--config', configPath, '--quiet', '--exclude', 'unsupported.mjs', path.join(tempRoot, 'src')]);
    assert.match(call.log, /^\/tmp\/kubeclaw-semgrep-\d+\.log$/);
  } finally {
    process.env.PATH = originalPath;
  }
});

test('semgrep structured execution errors fail closed', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'semgrep-error-test-'));
  const binDir = path.join(tempRoot, 'bin');
  const configPath = path.join(tempRoot, 'semgrep.yml');
  fs.mkdirSync(binDir);
  fs.writeFileSync(configPath, 'rules: []\n');
  const semgrepPath = path.join(binDir, 'semgrep');
  fs.writeFileSync(semgrepPath, '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({results:[],errors:[{type:"InvalidRuleSchemaError",message:"invalid rule"}]})); process.exitCode=2;\n');
  fs.chmodSync(semgrepPath, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`;
  try {
    const semgrep = TOOL_REGISTRY.find(tool => tool.id === 'semgrep');
    assert.throws(
      () => semgrep.run({ repoRoot: tempRoot, modulePath: null, changedFilesRequested: false, changedFiles: [], tool: { config_path: configPath, timeout_ms: 1000, targets: ['.'] } }),
      error => error?.code === 'semgrep-execution-failed' && /invalid rule/.test(error.message),
    );
  } finally {
    process.env.PATH = originalPath;
  }
});

test('legacy duplicate export and Madge adapters are removed', () => {
  assert.equal(TOOL_REGISTRY.some(tool => tool.id === 'repo-policy'), false);
  assert.equal(TOOL_REGISTRY.some(tool => tool.id === 'madge'), false);
  assert.equal(TOOL_REGISTRY.some(tool => tool.id === 'dependency-cruiser'), true);
  assert.equal(TOOL_REGISTRY.some(tool => tool.id === 'jscpd'), true);
});

test('npm audit operational error payloads fail closed', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-audit-error-test-'));
  const binDir = path.join(tempRoot, 'bin');
  const packageRoot = path.join(tempRoot, 'app');
  fs.mkdirSync(binDir);
  fs.mkdirSync(packageRoot);
  fs.writeFileSync(path.join(packageRoot, 'package.json'), '{"name":"fixture","private":true}\n');
  const npmPath = path.join(binDir, 'npm');
  fs.writeFileSync(npmPath, '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({error:{code:"EAUDIT",summary:"registry unavailable"}})); process.exitCode=1;\n');
  fs.chmodSync(npmPath, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`;
  try {
    const audit = TOOL_REGISTRY.find(tool => tool.id === 'npm-audit');
    assert.throws(
      () => audit.run({ repoRoot: tempRoot, projectTypes: new Set(['javascript']), tool: { timeout_ms: 1000, targets: ['app/package.json'] } }),
      error => error?.code === 'npm-audit-execution-failed' && /registry unavailable/.test(error.message),
    );
  } finally {
    process.env.PATH = originalPath;
  }
});
