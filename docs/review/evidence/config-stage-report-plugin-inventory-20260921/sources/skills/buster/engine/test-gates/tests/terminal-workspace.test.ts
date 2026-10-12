import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupTerminalWorkspace } from '../terminal-workspace.ts';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-terminal-'));
const removed = ['repository.tar.gz', 'workspace/repository/source.ts', 'workspace/test-provider-snapshots/module.js'];
const retained = ['job.json', 'result.json', 'workspace/scratch/attempt.log', 'workspace/evidence/proof.json', 'artifacts/result.xml', 'observability/events.jsonl'];
try {
  for (const name of [...removed, ...retained]) {
    const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, name);
  }
  await cleanupTerminalWorkspace(root); await cleanupTerminalWorkspace(root);
  for (const name of removed) assert.equal(fs.existsSync(path.join(root, name)), false);
  for (const name of retained) assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), name);
  console.log(JSON.stringify({ ok: true, suite: 'terminal-workspace', removed: removed.length, retained: retained.length }));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
