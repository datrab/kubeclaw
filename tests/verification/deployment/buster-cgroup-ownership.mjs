// Execute the real entrypoint's cgroup setup with filesystem fixtures and the
// production supervisor's missing DAC/FOWNER capabilities. Run inside the Buster
// image as root; this test does not access or modify a real cgroup subtree.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

assert.equal(process.getuid(), 0, 'Run in the Buster runtime image as root');
const entrypoint = process.argv[2] ?? '/usr/local/bin/buster-runtime-entrypoint';
const source = fs.readFileSync(entrypoint, 'utf8');
const start = source.indexOf('test -d "$browser_playwright_cgroup_root"');
const end = source.indexOf('# BuildKit creates the socket', start);
assert.ok(start > 0 && end > start, 'cgroup setup boundary must be present');
const root = fs.mkdtempSync('/tmp/buster-cgroup-ownership-');
try {
  for (const initialOwner of [0, 1000]) {
    const directory = path.join(root, `owner-${initialOwner}`);
    fs.mkdirSync(directory, { mode: 0o700 });
    fs.writeFileSync(path.join(directory, 'cgroup.controllers'), 'pids memory cpu\n');
    fs.writeFileSync(path.join(directory, 'cgroup.procs'), '');
    fs.writeFileSync(path.join(directory, 'cgroup.subtree_control'), '');
    // A completed handoff persists both directory AND control-file ownership.
    // Keeping these files root-owned hid the real second-start failure.
    for (const name of ['cgroup.procs', 'cgroup.subtree_control']) {
      fs.chmodSync(path.join(directory, name), 0o644);
      fs.chownSync(path.join(directory, name), initialOwner, 1000);
    }
    fs.chownSync(directory, initialOwner, 1000);
    const script = `set -eu\nbrowser_playwright_cgroup_root='${directory}'\n`
      + source.slice(start, end).replaceAll('/var/run/kubeclaw-browser-cgroup', directory);
    const result = spawnSync('setpriv', ['--bounding-set=-dac_override,-dac_read_search,-fowner', '--', 'sh', '-c', script],
      { encoding: 'utf8' });
    // Reclaim traversal only after the tested setup has completed.
    const directoryOwner = fs.statSync(directory).uid;
    fs.chownSync(directory, 0, 1000);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(directoryOwner, 1000);
    for (const name of ['cgroup.procs', 'cgroup.subtree_control']) {
      assert.equal(fs.statSync(path.join(directory, name)).uid, 1000);
      assert.equal(fs.statSync(path.join(directory, name)).mode & 0o777, 0o644);
    }
    assert.equal(fs.readFileSync(path.join(directory, 'cgroup.subtree_control'), 'utf8'), '+pids +memory +cpu');
  }
  console.log(JSON.stringify({ ok: true, freshDelegation: true, restartDelegation: true, addedCapabilities: false }));
} finally {
  for (const entry of fs.readdirSync(root)) fs.chownSync(path.join(root, entry), 0, 1000);
  fs.rmSync(root, { recursive: true, force: true });
}
