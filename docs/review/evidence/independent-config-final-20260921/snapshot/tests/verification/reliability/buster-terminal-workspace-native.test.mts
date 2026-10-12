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

test('terminal cleanup rejects symlinks in ancestors of the job root', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-cleanup-ancestor-'));
  try {
    const target = path.join(root, 'target');
    fs.mkdirSync(path.join(target, 'job'), { recursive: true });
    fs.writeFileSync(path.join(target, 'job', 'repository.tar.gz'), 'foreign archive');
    fs.symlinkSync(target, path.join(root, 'linked'));
    await assert.rejects(cleanupTerminalWorkspace(path.join(root, 'linked', 'job')), /BUSTER_TERMINAL_WORKSPACE_PARENT_INVALID/);
    assert.equal(fs.readFileSync(path.join(target, 'job', 'repository.tar.gz'), 'utf8'), 'foreign archive');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

for (const replaced of ['job', 'workspace'] as const) {
  test(`terminal cleanup stays on original directory after ${replaced} is replaced during deletion`, async context => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-cleanup-replaced-'));
    const job = path.join(root, 'job'); const foreign = path.join(root, 'foreign');
    const archived = path.join(root, 'original');
    const disposable = ['repository.tar.gz', 'workspace/repository/source.ts', 'workspace/test-provider-snapshots/provider.js'];
    const retained = ['result.json', 'workspace/evidence/proof.json', 'workspace/scratch/task.log'];
    try {
      for (const directory of [job, foreign]) {
        for (const name of [...disposable, ...retained]) {
          const file = path.join(directory, name);
          fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${directory}:${name}`);
        }
      }
      const originalRemove = fs.promises.rm;
      let changed = false;
      // Pause at the real deletion boundary, replace a parent on disk, then use
      // the original fs implementation. No mocked deletion or fake success.
      context.mock.method(fs.promises, 'rm', async (...args: Parameters<typeof fs.promises.rm>) => {
        if (!changed) {
          changed = true;
          const original = replaced === 'job' ? job : path.join(job, 'workspace');
          const replacement = replaced === 'job' ? foreign : path.join(foreign, 'workspace');
          fs.renameSync(original, archived); fs.symlinkSync(replacement, original);
        }
        return originalRemove(...args);
      });
      await cleanupTerminalWorkspace(job);
      context.mock.restoreAll();
      assert.equal(changed, true);
      for (const name of [...disposable, ...retained]) {
        assert.equal(fs.readFileSync(path.join(foreign, name), 'utf8'), `${foreign}:${name}`);
      }
      const originalWorkspace = replaced === 'job' ? path.join(archived, 'workspace') : archived;
      assert.equal(fs.existsSync(path.join(originalWorkspace, 'repository')), false);
      assert.equal(fs.existsSync(path.join(originalWorkspace, 'test-provider-snapshots')), false);
      assert.equal(fs.readFileSync(path.join(originalWorkspace, 'evidence/proof.json'), 'utf8'), `${job}:workspace/evidence/proof.json`);
      assert.equal(fs.readFileSync(path.join(originalWorkspace, 'scratch/task.log'), 'utf8'), `${job}:workspace/scratch/task.log`);
      const originalJob = replaced === 'job' ? archived : job;
      assert.equal(fs.readFileSync(path.join(originalJob, 'result.json'), 'utf8'), `${job}:result.json`);
      assert.equal(fs.existsSync(path.join(originalJob, 'repository.tar.gz')), false);
    } finally { context.mock.restoreAll(); fs.rmSync(root, { recursive: true, force: true }); }
  });
}
