import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { registerContainerYamlTools } from '../../../../../../skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts';
import { registerKubernetesSecurityTools } from '../../../../../../skills/nova/pipeline/tools/lint-report/kubernetes-security-tools.ts';

test('hadolint operational failure with empty JSON fails closed', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hadolint-error-test-'));
  const binDir = path.join(tempRoot, 'bin');
  fs.mkdirSync(binDir);
  fs.writeFileSync(path.join(tempRoot, 'Dockerfile'), 'FROM scratch\n');
  const hadolintPath = path.join(binDir, 'hadolint');
  fs.writeFileSync(hadolintPath, '#!/usr/bin/env node\nprocess.stdout.write("[]"); process.stderr.write("cannot read target"); process.exitCode=2;\n');
  fs.chmodSync(hadolintPath, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`;
  try {
    const tools = [];
    registerContainerYamlTools(tool => tools.push(tool));
    assert.throws(
      () => tools.find(tool => tool.id === 'hadolint').run({ repoRoot: tempRoot, changedFilesRequested: false, policy: { global_exclusions: [] }, tool: { timeout_ms: 1000, targets: ['Dockerfile'], include: ['Dockerfile'], exclude: [] } }),
      error => error?.code === 'hadolint-parse-failed',
    );
  } finally {
    process.env.PATH = originalPath;
  }
});

test('hadolint gives repeated findings distinct source-stable fingerprint seeds', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hadolint-fingerprint-test-'));
  const binDir = path.join(tempRoot, 'bin');
  fs.mkdirSync(binDir);
  fs.writeFileSync(path.join(tempRoot, 'Dockerfile'), 'FROM one\nFROM two\n');
  fs.writeFileSync(path.join(binDir, 'hadolint'), `#!/usr/bin/env node
process.stdout.write(JSON.stringify([
  {line:1,column:1,level:'warning',code:'DL3000',message:'same message'},
  {line:2,column:1,level:'warning',code:'DL3000',message:'same message'}
])); process.exitCode=1;
`);
  fs.chmodSync(path.join(binDir, 'hadolint'), 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`;
  try {
    const tools = [];
    registerContainerYamlTools(tool => tools.push(tool));
    const result = tools.find(tool => tool.id === 'hadolint').run({ repoRoot: tempRoot, changedFilesRequested: false, policy: { global_exclusions: [] }, tool: { timeout_ms: 1000, targets: ['Dockerfile'], include: ['Dockerfile'], exclude: [] } });
    assert.equal(result.warnings, 2);
    assert.notDeepEqual(result.findings[0].fingerprint_seed, result.findings[1].fingerprint_seed);
    assert.equal(result.findings[0].fingerprint_seed.source_line, 'FROM one');
    assert.equal(result.findings[1].fingerprint_seed.source_line, 'FROM two');
  } finally {
    process.env.PATH = originalPath;
  }
});

test('kubeconform parses invalid resources from json summary output', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeconform-report-test-'));
  const binDir = path.join(tempRoot, 'bin');
  fs.mkdirSync(binDir);
  fs.mkdirSync(path.join(tempRoot, 'chart'));
  fs.writeFileSync(path.join(tempRoot, 'chart', 'Chart.yaml'), 'apiVersion: v2\nname: test\nversion: 1.0.0\n');

  const helmPath = path.join(binDir, 'helm');
  fs.writeFileSync(helmPath, `#!/usr/bin/env node
process.stdout.write('apiVersion: v1\\nkind: Pod\\nmetadata:\\n  name: bad\\n');
`);
  fs.chmodSync(helmPath, 0o755);

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
      policyProject: { root: '.' },
      policy: { global_exclusions: [] },
      tool: { timeout_ms: 1000, targets: ['chart'], include: ['**/*.yaml'], exclude: [] },
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

test('kubeconform receives rendered Helm output on stdin, never raw templates', () => {
  const source = fs.readFileSync(new URL('../../../../../../skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts', import.meta.url), 'utf8');
  const renderer = fs.readFileSync(new URL('../../../../../../skills/nova/pipeline/tools/lint-report/helm-render.ts', import.meta.url), 'utf8');
  assert.match(renderer, /safeExec\('helm', \['template'/);
  assert.match(source, /input: renderChart\(ctx, chartDir\)/);
  assert.doesNotMatch(source, /kubeconform[^\n]+\.\.\.yamlFiles/);
});

test('trivy scans rendered Helm output for high-severity Kubernetes misconfigurations', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trivy-kubernetes-test-'));
  const binDir = path.join(tempRoot, 'bin');
  const callPath = path.join(tempRoot, 'trivy-call.json');
  fs.mkdirSync(binDir);
  fs.mkdirSync(path.join(tempRoot, 'chart'));
  fs.writeFileSync(path.join(binDir, 'helm'), '#!/usr/bin/env node\nprocess.stdout.write("apiVersion: v1\\nkind: Pod\\nmetadata:\\n  name: unsafe\\n");\n');
  fs.chmodSync(path.join(binDir, 'helm'), 0o755);
  fs.writeFileSync(path.join(binDir, 'trivy'), `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
const manifest = fs.readFileSync(args.at(-1), 'utf8');
fs.writeFileSync(${JSON.stringify(callPath)}, JSON.stringify({args, manifest}));
process.stdout.write(JSON.stringify({Results:[{Misconfigurations:[
  {ID:'KSV-0001',Severity:'HIGH',Message:"Pod 'unsafe' is privileged",CauseMetadata:{StartLine:4}},
  {ID:'KSV-0001',Severity:'HIGH',Message:"Pod 'unsafe' is privileged",CauseMetadata:{StartLine:8}}
]}]}));
process.exitCode = 1;
`);
  fs.chmodSync(path.join(binDir, 'trivy'), 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`;
  try {
    const tools = [];
    registerKubernetesSecurityTools(tool => tools.push(tool));
    const result = tools.find(tool => tool.id === 'trivy-kubernetes').run({
      repoRoot: tempRoot,
      projectTypes: new Set(['helm']),
      policy: { global_exclusions: [] },
      tool: { timeout_ms: 1000, arguments: [], targets: ['chart'] },
    });
    assert.equal(result.errors, 2);
    assert.equal(result.findings[0].code, 'KSV-0001');
    assert.equal(result.findings[0].file, path.join(tempRoot, 'chart'));
    assert.equal(result.findings[0].fingerprint_seed.resource, 'Pod:default:unsafe');
    assert.notDeepEqual(result.findings[0].fingerprint_seed, result.findings[1].fingerprint_seed);
    const call = JSON.parse(fs.readFileSync(callPath, 'utf8'));
    assert.ok(call.args.includes('kubernetes'));
    assert.ok(call.args.includes('HIGH,CRITICAL'));
    assert.match(call.manifest, /name: unsafe/);
  } finally {
    process.env.PATH = originalPath;
  }
});

test('trivy propagates a structured Helm render failure before writing or scanning', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trivy-kubernetes-render-failure-'));
  const binDir = path.join(tempRoot, 'bin');
  fs.mkdirSync(binDir);
  fs.mkdirSync(path.join(tempRoot, 'chart'));
  fs.writeFileSync(path.join(binDir, 'helm'), '#!/usr/bin/env node\nprocess.stderr.write("render failed"); process.exitCode=1;\n');
  fs.writeFileSync(path.join(binDir, 'trivy'), '#!/usr/bin/env node\nthrow new Error("trivy must not run");\n');
  fs.chmodSync(path.join(binDir, 'helm'), 0o755);
  fs.chmodSync(path.join(binDir, 'trivy'), 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`;
  try {
    const tools = [];
    registerKubernetesSecurityTools(tool => tools.push(tool));
    assert.throws(() => tools.find(tool => tool.id === 'trivy-kubernetes').run({
      repoRoot: tempRoot,
      projectTypes: new Set(['helm']),
      policy: { global_exclusions: [] },
      tool: { timeout_ms: 1000, arguments: [], targets: ['chart'] },
    }), error => error?.code === 'helm-template-parse-failed' && /render failed/.test(error.message));
  } finally {
    process.env.PATH = originalPath;
  }
});

test('trivy exit codes other than zero or one fail even with JSON findings', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trivy-kubernetes-exit-failure-'));
  const binDir = path.join(tempRoot, 'bin');
  fs.mkdirSync(binDir);
  fs.mkdirSync(path.join(tempRoot, 'chart'));
  fs.writeFileSync(path.join(binDir, 'helm'), '#!/usr/bin/env node\nprocess.stdout.write("apiVersion: v1\\nkind: Pod\\nmetadata:\\n  name: unsafe\\n");\n');
  fs.writeFileSync(path.join(binDir, 'trivy'), '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({Results:[{Misconfigurations:[{ID:"KSV-0001",Message:"unsafe"}]}]})); process.exitCode=2;\n');
  fs.chmodSync(path.join(binDir, 'helm'), 0o755);
  fs.chmodSync(path.join(binDir, 'trivy'), 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`;
  try {
    const tools = [];
    registerKubernetesSecurityTools(tool => tools.push(tool));
    assert.throws(() => tools.find(tool => tool.id === 'trivy-kubernetes').run({
      repoRoot: tempRoot,
      projectTypes: new Set(['helm']),
      policy: { global_exclusions: [] },
      tool: { timeout_ms: 1000, arguments: [], targets: ['chart'] },
    }), error => error?.code === 'trivy-kubernetes-parse-failed' && /unexpected exit code 2/.test(error.message));
  } finally {
    process.env.PATH = originalPath;
  }
});

test('a later chart cannot hide its own unrecognized kubeconform failure', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeconform-multi-chart-'));
  const binDir = path.join(tempRoot, 'bin');
  const counter = path.join(tempRoot, 'calls.txt');
  fs.mkdirSync(binDir);
  for (const chart of ['one', 'two']) fs.mkdirSync(path.join(tempRoot, chart));
  fs.writeFileSync(path.join(binDir, 'helm'), '#!/usr/bin/env node\nprocess.stdout.write("apiVersion: v1\\nkind: Pod\\nmetadata:\\n  name: test\\n");\n');
  fs.chmodSync(path.join(binDir, 'helm'), 0o755);
  fs.writeFileSync(path.join(binDir, 'kubeconform'), `#!/usr/bin/env node
const fs=require('fs'); const calls=fs.existsSync(${JSON.stringify(counter)}) ? Number(fs.readFileSync(${JSON.stringify(counter)},'utf8')) : 0; fs.writeFileSync(${JSON.stringify(counter)},String(calls+1)); process.stdout.write(JSON.stringify(calls === 0 ? {resources:[{filename:'one.yaml',status:'statusInvalid',msg:'first'}]} : {resources:[]})); process.exitCode=1;
`);
  fs.chmodSync(path.join(binDir, 'kubeconform'), 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`;
  try {
    const tools = [];
    registerContainerYamlTools(tool => tools.push(tool));
    assert.throws(() => tools.find(tool => tool.id === 'kubeconform').run({
      repoRoot: tempRoot,
      policyProject: { root: '.' },
      tool: { timeout_ms: 1000, targets: ['one', 'two'] },
    }), error => error?.code === 'kubeconform-parse-failed');
  } finally {
    process.env.PATH = originalPath;
  }
});
