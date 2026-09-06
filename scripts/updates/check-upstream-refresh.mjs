import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { versionOutputs } from '../versions.mjs';
const source = process.cwd();
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-upstream-'));
try {
  for (const file of ['versions.json', ...versionOutputs(source).keys()]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(file, path.join(root, file));
  }
  const expected = JSON.parse(fs.readFileSync('versions.json', 'utf8'));
  const baseline = structuredClone(expected);
  // Only the prior metadata is synthetic. Every requested release and byte is real.
  for (const tool of ['GO', 'SHFMT', 'TERRAFORM', 'TFLINT', 'TRIVY', 'KUBECTL']) baseline.buildArgs[`${tool}_VERSION`] = '0.0.0';
  fs.writeFileSync(path.join(root, 'versions.json'), JSON.stringify(baseline));
  for (const args of [['init', '-q'], ['config', 'user.name', 'Updater regression'], ['config', 'user.email', 'updater@example.invalid'], ['add', '.'], ['commit', '-qm', 'Prior metadata fixture']]) execFileSync('git', args, { cwd: root });
  fs.copyFileSync('versions.json', path.join(root, 'versions.json'));
  execFileSync(process.execPath, [path.join(source, 'scripts/updates/refresh-versions.mjs')], { cwd: root, stdio: 'inherit', timeout: 900000 });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'versions.json'), 'utf8')), expected, 'Downloaded release checksums must match the independently committed pins');
  console.log('Verified actual amd64 and arm64 release bytes for Go, shfmt, Terraform, TFLint, Trivy and kubectl.');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
