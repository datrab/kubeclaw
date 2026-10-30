import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {nativeSupervisorEnvironmentProducer} from '../lib/docs-owned-process-environment.mjs';

test('real owned spawn producer qualifies only its actual receiver, PID expression and override order', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-env-'));
  const source = path.resolve('skills/worker/core/worker/native-worker-ownership.ts');
  const file = path.join(root, 'skills/worker/core/worker/native-worker-ownership.ts');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  try {
    const text = fs.readFileSync(source, 'utf8'); fs.writeFileSync(file, text);
    const actual = nativeSupervisorEnvironmentProducer(root);
    assert.equal(actual.line, 94);
    assert.equal(actual.custody.receiver, 'skills/worker/core/worker/native-worker-launcher.c');
    assert.equal(actual.access, 'owned-process-env');
    fs.writeFileSync(file, text.replace('...command.environment, KUBECLAW_NATIVE_SUPERVISOR_PID: String(process.pid)',
      'KUBECLAW_NATIVE_SUPERVISOR_PID: String(process.pid), ...command.environment'));
    assert.throws(() => nativeSupervisorEnvironmentProducer(root), /PRECEDENCE_CHANGED/u);
    fs.writeFileSync(file, text.replace('String(process.pid)', 'String(command.pid)'));
    assert.throws(() => nativeSupervisorEnvironmentProducer(root), /PRECEDENCE_CHANGED/u);
    fs.writeFileSync(file, text.replace('this.#launchers.spawn(', 'this.#launchers.other('));
    assert.throws(() => nativeSupervisorEnvironmentProducer(root), /CARDINALITY_CHANGED/u);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
