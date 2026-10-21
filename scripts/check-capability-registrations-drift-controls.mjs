#!/usr/bin/env node
// Additional discovery/direction controls, NOT extra preregistered acceptance mutations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-capability-declarations-'));
const page = 'docs/site/reference/capabilities.md';
const authority = 'skills/common/plugins/operator-messaging/plugin.json';
function copyManifests(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) copyManifests(relative);
    else if (entry.isFile() && entry.name === 'plugin.json') {
      fs.mkdirSync(path.dirname(path.join(temporary, relative)), { recursive: true });
      fs.copyFileSync(path.join(root, relative), path.join(temporary, relative));
    }
  }
}
function check(status) {
  const result = spawnSync(process.execPath, ['scripts/check-capability-registrations-drift.mjs'], { cwd: temporary, encoding: 'utf8' });
  assert(!result.error && !result.signal);
  assert.equal(result.status, status, result.stdout + result.stderr);
  if (status === 1) assert(result.stderr.includes(`DOC_DRIFT_CAPABILITY: ${page}:`), result.stderr);
  else assert(!result.stderr.includes('DOC_DRIFT_CAPABILITY'), result.stderr);
}
try {
  copyManifests('skills');
  for (const relative of [page, 'scripts/check-capability-registrations-drift.mjs']) {
    fs.mkdirSync(path.dirname(path.join(temporary, relative)), { recursive: true });
    fs.copyFileSync(path.join(root, relative), path.join(temporary, relative));
  }
  check(0);
  const source = path.join(temporary, authority);
  const original = fs.readFileSync(source);
  const pageBytes = fs.readFileSync(path.join(temporary, page));
  for (const [name, mutate] of [
    ['required-add', item => item.adapters[0].requiredCapabilities.push('state.read')],
    ['required-remove', item => item.adapters[0].requiredCapabilities.pop()],
    ['provided-add', item => item.adapters[0].providesCapabilities.push('state.read')],
    ['provided-remove', item => item.adapters[0].providesCapabilities.pop()],
    ['same-union-direction-swap', item => { const entry = item.adapters[0]; [entry.requiredCapabilities, entry.providesCapabilities] = [entry.providesCapabilities, entry.requiredCapabilities]; }],
    ['registration-add', item => item.adapters.push({ ...item.adapters[0], id: 'fixture-additional' })],
    ['registration-remove', item => item.adapters.pop()],
    ['namespace-change', item => { item.testProviders = item.adapters; item.adapters = []; }],
  ]) {
    const candidate = JSON.parse(original);
    mutate(candidate);
    fs.writeFileSync(source, JSON.stringify(candidate));
    check(1);
    fs.writeFileSync(source, original);
    check(0);
    assert(fs.readFileSync(path.join(temporary, page)).equals(pageBytes));
    console.log(`${name}: semantic drift rejected, restored baseline PASS`);
  }
  const extra = path.join(temporary, 'skills/fixture-new-package/plugin.json');
  fs.mkdirSync(path.dirname(extra));
  fs.writeFileSync(extra, JSON.stringify({ id: 'fixture.new-package', stages: [{ id: 'new', requiredCapabilities: ['state.read'] }] }));
  check(1);
  fs.rmSync(extra);
  check(0);
  console.log('new-package discovery: semantic drift rejected, restored baseline PASS');
  fs.writeFileSync(source, '{ broken');
  check(2);
  fs.writeFileSync(source, original);
  check(0);
  console.log('Registration declaration controls PASS: direction preserved without count/union proxies; new-package discovery; malformed JSON separate. No independent acceptance.');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
