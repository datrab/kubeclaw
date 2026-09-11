import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fixture } from './fixtures/review-supervisor.mjs';

for (const [name, content] of [['malformed JSON', '{broken'], ['unknown owner', '{}']]) {
  test(`supervisor preserves ${name} lease and refuses admission`, t => {
    const f = fixture(t); f.writePlatform(); f.terminal('succeeded');
    fs.writeFileSync(f.lease, content);
    const result = f.invoke();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /REVIEW_SUPERVISOR_(?:JSON_READ_FAILED|LEASE_INVALID)/u);
    assert.equal(result.stdout, '');
    assert.equal(fs.readFileSync(f.lease, 'utf8'), content);
    assert.equal(fs.existsSync(path.join(f.root, 'pipeline.log')), false);
  });
}

test('supervisor preserves malformed heartbeat and releases only its newly acquired lease', t => {
  const f = fixture(t); f.writePlatform(); f.terminal('succeeded');
  const heartbeat = path.join(f.root, 'heartbeat.json');
  fs.writeFileSync(heartbeat, '{broken');
  const result = f.invoke();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /REVIEW_SUPERVISOR_JSON_READ_FAILED/u);
  assert.equal(result.stdout, '');
  assert.equal(fs.readFileSync(heartbeat, 'utf8'), '{broken');
  assert.equal(fs.existsSync(f.lease), false);
});

test('supervisor refuses a lease held by an actual live process', t => {
  const f = fixture(t); f.writePlatform(); f.terminal('succeeded');
  const content = JSON.stringify({ schemaVersion: 'repository-review-supervisor-lease.v1',
    instanceId: 'actual-live-owner', runId: 'supervisor-status-regression', supervisorPid: process.pid,
    acquiredAt: new Date().toISOString() });
  fs.writeFileSync(f.lease, content);
  const result = f.invoke();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /REVIEW_SUPERVISOR_ALREADY_ACTIVE/u);
  assert.equal(fs.readFileSync(f.lease, 'utf8'), content);
});

test('supervisor records an actual missing npm launch and releases its own lease', t => {
  const f = fixture(t); f.writePlatform();
  const emptyPath = path.join(f.root, 'empty-path'); fs.mkdirSync(emptyPath);
  // No replacement executable: the absolute original Node status reader works,
  // while the actual operating-system npm lookup must fail with ENOENT.
  const result = f.invoke({ ...process.env, PATH: emptyPath });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /REVIEW_SUPERVISOR_LAUNCH_FAILED/u);
  assert.match(result.stderr, /ENOENT/u);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(f.lease), false);
  const diagnostic = JSON.parse(fs.readFileSync(path.join(f.root, 'diagnostics/attempt-1-exit.json'), 'utf8'));
  assert.equal(diagnostic.exit.code, null);
  assert.equal(diagnostic.exit.signal, null);
  assert.equal(diagnostic.launchError.code, 'ENOENT');
  assert.equal(diagnostic.sample.pipelineAlive, false);
});
