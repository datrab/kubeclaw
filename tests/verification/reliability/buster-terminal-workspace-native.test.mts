import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { cleanupTerminalWorkspace } from '../../../skills/buster/engine/test-gates/terminal-workspace.ts';

test('terminal cleanup refuses linked parent directories and preserves another job source', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-cleanup-parent-'));
  try {
    const job = path.join(root, 'job'); const other = path.join(root, 'other');
    fs.mkdirSync(job); fs.mkdirSync(path.join(other, 'repository'), { recursive: true });
    const proof = path.join(other, 'repository', 'original-source.txt');
    fs.writeFileSync(proof, 'other job source and evidence');
    fs.writeFileSync(path.join(job, 'repository.tar.gz'), 'retained until parent validation');
    fs.symlinkSync(other, path.join(job, 'workspace'));
    await assert.rejects(cleanupTerminalWorkspace(job), /BUSTER_TERMINAL_WORKSPACE_PARENT_INVALID/);
    assert.equal(fs.readFileSync(proof, 'utf8'), 'other job source and evidence');
    assert.equal(fs.readFileSync(path.join(job, 'repository.tar.gz'), 'utf8'), 'retained until parent validation');
    fs.symlinkSync(other, path.join(root, 'linked-job'));
    await assert.rejects(cleanupTerminalWorkspace(path.join(root, 'linked-job')), /BUSTER_TERMINAL_WORKSPACE_PARENT_INVALID/);
    assert.equal(fs.readFileSync(proof, 'utf8'), 'other job source and evidence');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('terminal cleanup unlinks a leaf symlink without deleting its target and remains idempotent', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-cleanup-leaf-'));
  try {
    const job = path.join(root, 'job'); const retained = path.join(root, 'retained');
    fs.mkdirSync(path.join(job, 'workspace'), { recursive: true }); fs.mkdirSync(retained);
    fs.writeFileSync(path.join(retained, 'evidence.json'), 'original evidence');
    fs.symlinkSync(retained, path.join(job, 'workspace', 'repository'));
    await cleanupTerminalWorkspace(job); await cleanupTerminalWorkspace(job);
    assert.equal(fs.existsSync(path.join(job, 'workspace', 'repository')), false);
    assert.equal(fs.readFileSync(path.join(retained, 'evidence.json'), 'utf8'), 'original evidence');
    await cleanupTerminalWorkspace(path.join(root, 'already-absent'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
