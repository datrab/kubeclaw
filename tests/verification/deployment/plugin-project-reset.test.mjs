import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = path.resolve('charts/kubeclaw/files/reset-managed-plugin-projects.mjs');
const restoreScript = path.resolve('charts/kubeclaw/files/restore-managed-plugin-config.mjs');

test('plugin cache upgrades discard stale managed locks without touching persistent state', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-plugin-reset-'));
  try {
    const projects = path.join(home, 'npm', 'projects');
    const stale = path.join(projects, 'openclaw-acpx-stale');
    const state = path.join(home, 'state', 'openclaw.sqlite');
    const config = path.join(home, 'openclaw.json');
    const outside = path.join(home, 'workspace-data');
    fs.mkdirSync(stale, { recursive: true });
    fs.mkdirSync(path.dirname(state), { recursive: true });
    fs.writeFileSync(path.join(stale, 'package-lock.json'), '{"requires":"uncached-tarball"}\n');
    fs.writeFileSync(state, 'persistent database');
    fs.writeFileSync(config, '{"persistent":true}\n');
    fs.writeFileSync(outside, 'persistent workspace');
    fs.symlinkSync(outside, path.join(projects, 'outside-link'));

    execFileSync(process.execPath, [script, projects]);

    assert.deepEqual(fs.readdirSync(projects), []);
    assert.equal(fs.readFileSync(state, 'utf8'), 'persistent database');
    assert.equal(fs.readFileSync(config, 'utf8'), '{"persistent":true}\n');
    assert.equal(fs.readFileSync(outside, 'utf8'), 'persistent workspace');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('plugin project reset rejects paths outside an npm projects root', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-plugin-reset-'));
  try {
    assert.throws(
      () => execFileSync(process.execPath, [script, home], { stdio: 'pipe' }),
      /Command failed/,
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('managed plugin config restore preserves unrelated persistent settings', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-plugin-restore-'));
  try {
    const config = path.join(home, 'openclaw.json');
    const desiredDir = path.join(home, 'desired');
    const desired = path.join(desiredDir, 'openclaw.json');
    fs.mkdirSync(desiredDir);
    fs.writeFileSync(config, JSON.stringify({
      persistent: { keep: true },
      plugins: { allow: ['old'], entries: { old: { enabled: true } } },
      channels: { discord: { old: true }, retained: { value: 1 } },
    }));
    fs.writeFileSync(desired, JSON.stringify({
      plugins: { allow: ['acpx', 'discord'], entries: { acpx: { enabled: true }, discord: { enabled: true } } },
      channels: { discord: { token: { source: 'env', provider: 'default', id: 'DISCORD_TOKEN' } } },
    }));

    execFileSync(process.execPath, [restoreScript, config, desired]);
    const restored = JSON.parse(fs.readFileSync(config, 'utf8'));
    assert.deepEqual(restored.persistent, { keep: true });
    assert.deepEqual(restored.plugins.allow, ['acpx', 'discord']);
    assert.deepEqual(Object.keys(restored.plugins.entries), ['acpx', 'discord']);
    assert.deepEqual(restored.channels.retained, { value: 1 });
    assert.equal(restored.channels.discord.token.id, 'DISCORD_TOKEN');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
