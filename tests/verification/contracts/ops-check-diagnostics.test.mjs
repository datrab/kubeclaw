import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

const workflow = YAML.parse(fs.readFileSync('.github/workflows/build-ops-mcp.yaml', 'utf8'));
const script = workflow.jobs.validate.steps.find(step => step.name === 'Test Ops MCP').run;
function exercise(installStatus, testStatus) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-check-diagnostics-'));
  try {
    fs.writeFileSync(path.join(dir, 'npm'), `#!/bin/bash
printf '%s\\n' "$*" >> "$OPS_CALLS"
if [ "$1" = ci ]; then exit "$OPS_INSTALL_STATUS"; fi
printf 'failure %% marker\\r\\nsecond line\\n' >&2
exit "$OPS_TEST_STATUS"
`, { mode: 0o755 });
    const callsFile = path.join(dir, 'calls');
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`,
        OPS_CALLS: callsFile, OPS_INSTALL_STATUS: String(installStatus), OPS_TEST_STATUS: String(testStatus) },
    });
    assert.equal(result.error, undefined);
    return { ...result, calls: fs.readFileSync(callsFile, 'utf8').trim().split('\n') };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('installation failure retains exit and never starts tests', () => {
  const result = exercise(17, 0);
  assert.equal(result.status, 17);
  assert.deepEqual(result.calls, ['ci --ignore-scripts']);
  assert.match(result.stdout, /::error title=Ops MCP install failed \(exit 17\)::/u);
});
test('test failure retains stderr and exit with escaped annotation data', () => {
  const result = exercise(0, 23);
  assert.equal(result.status, 23);
  assert.deepEqual(result.calls, ['ci --ignore-scripts', 'test']);
  assert.match(result.stdout, /failure % marker\r\nsecond line/u);
  assert.match(result.stdout, /::error title=Ops MCP test failed \(exit 23\)::failure %25 marker%0D%0Asecond line/u);
});
test('successful original commands emit no error annotation', () => {
  const result = exercise(0, 0);
  assert.equal(result.status, 0);
  assert.deepEqual(result.calls, ['ci --ignore-scripts', 'test']);
  assert.doesNotMatch(result.stdout, /::error/u);
});


const scanScript = workflow.jobs.validate.steps.find(step => step.name === 'Scan the built candidate before accepting the build').run;
function exerciseScan(setupStatus, scanStatus, report = null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-scan-diagnostics-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.writeFileSync(path.join(dir, 'scripts/scan-runtime-images.sh'), `#!/bin/bash
if [ "$SCAN_SETUP_STATUS" != 0 ]; then printf 'scanner setup %% failed\\r\\n' >&2; exit "$SCAN_SETUP_STATUS"; fi
printf '%s\\n' "$SCAN_EXECUTABLE"
`);
    const executable = path.join(dir, 'scanner');
    fs.writeFileSync(executable, `#!/bin/bash
printf '%s\\n' "$@" > "$SCAN_CALLS"
printf 'original scanner output %% marker\\r\\n' >&2
if [ -n "$SCAN_REPORT" ]; then printf '%s' "$SCAN_REPORT" > dist/trivy/test.json; fi
exit "$SCAN_STATUS"
`, { mode: 0o755 });
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', scanScript], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, IMAGE_NAME: 'test', TEST_IMAGE: 'candidate:exact',
        SCAN_EXECUTABLE: executable, SCAN_CALLS: path.join(dir, 'calls'),
        SCAN_SETUP_STATUS: String(setupStatus), SCAN_STATUS: String(scanStatus),
        SCAN_REPORT: report === null ? '' : report },
    });
    assert.equal(result.error, undefined);
    return { ...result, calls: fs.existsSync(path.join(dir, 'calls')) ? fs.readFileSync(path.join(dir, 'calls'), 'utf8').trim().split('\n') : [],
      report: fs.existsSync(path.join(dir, 'dist/trivy/test.json')) ? fs.readFileSync(path.join(dir, 'dist/trivy/test.json'), 'utf8') : null,
      log: fs.readFileSync(path.join(dir, 'dist/trivy/test.log'), 'utf8') };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('scanner setup failure preserves its exit, escapes diagnostics and never scans', () => {
  const result = exerciseScan(17, 0);
  assert.equal(result.status, 17);
  assert.deepEqual(result.calls, []);
  assert.match(result.stdout, /::error title=Candidate vulnerability scan failed \(exit 17\)::scanner setup %25 failed/u);
});
test('failed candidate scan exposes bounded findings without changing the original gate or report', () => {
  const report = JSON.stringify({ Results: [{ Vulnerabilities: Array.from({ length: 30 }, (_, i) => ({
    VulnerabilityID: `CVE-test-${i}`, Severity: 'HIGH', PkgName: 'example', InstalledVersion: '1', FixedVersion: '2',
  })) }] });
  const result = exerciseScan(0, 1, report);
  assert.equal(result.status, 1);
  assert.equal(result.report, report);
  assert.deepEqual(result.calls, ['image', '--scanners', 'vuln', '--severity', 'HIGH,CRITICAL', '--exit-code', '1', '--format', 'json', '--output', 'dist/trivy/test.json', 'candidate:exact']);
  const annotation = result.stdout.split('\n').find(line => line.startsWith('::error'));
  assert.ok(Buffer.byteLength(annotation) < 4096);
  assert.match(annotation, /HIGH\/CRITICAL findings: 30/u);
  assert.match(annotation, /CVE-test-0/u);
  assert.doesNotMatch(annotation, /CVE-test-10/u);
  assert.match(result.log, /original scanner output % marker/u);
});
test('malformed scan JSON cannot mask the original failing exit', () => {
  const result = exerciseScan(0, 23, '{invalid');
  assert.equal(result.status, 23);
  assert.match(result.stdout, /Candidate vulnerability scan failed \(exit 23\)/u);
  assert.equal(result.report, '{invalid');
});
test('successful candidate scan retains output and emits no failure annotation', () => {
  const result = exerciseScan(0, 0, '{"Results":[]}');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /original scanner output % marker/u);
  assert.doesNotMatch(result.stdout, /::error/u);
});
