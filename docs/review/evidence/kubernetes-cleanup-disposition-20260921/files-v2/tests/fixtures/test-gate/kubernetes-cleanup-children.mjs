import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

export function ownProviderChildren(t, directory) {
  const originalSpawn = childProcess.spawn;
  const originalKill = process.kill;
  const owned = [];

  let hook;
  let closing = false;
  let ownershipFailure;
  // Registered before setup writes, discovery, or any possible process start.
  t.after(async () => {
    closing = true;
    const failures = [];
    try {
      for (const row of owned) {
        if (row.closed) continue;
        try {
          if (process.platform !== 'win32' && row.child.pid) originalKill(-row.child.pid, 'SIGKILL');
          else row.child.kill('SIGKILL');
        } catch (error) { if (error.code !== 'ESRCH') failures.push(error); }
      }
      let timer;
      try {
        await Promise.race([
          Promise.all(owned.map(row => row.closePromise)),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('REPORT_FIXTURE_CLOSE_TIMEOUT')), 2000);
          }),
        ]);
      } finally { clearTimeout(timer); }
      if (ownershipFailure) failures.push(ownershipFailure);
      if (failures.length) throw new AggregateError(failures, 'REPORT_FIXTURE_CLEANUP_FAILED');
      assert(owned.every(row => row.closed), 'actual close required for every owned child');
      fs.rmSync(directory, { recursive: true, force: true });
    } finally { hook?.mock.restore(); syncBuiltinESMExports(); }
  });
  const providerChild = path.resolve('skills/buster/engine/test-gates/provider-child.mjs');
  const reportChild = path.resolve('skills/buster/engine/test-gates/report-adapter-child.mjs');
  hook = t.mock.method(childProcess, 'spawn', function (...args) {
    const isProvider = Array.isArray(args[1]) && args[1].includes(providerChild);
    const isReport = Array.isArray(args[1]) && args[1].includes(reportChild);
    // Store flock and other genuine tool spawns retain their existing owner and
    // tool mappings. Intercept only these two actual session entrypoint paths.
    if (!isProvider && !isReport) return Reflect.apply(originalSpawn, childProcess, args);
    const options = args[2];
    const cwd = typeof options?.cwd === 'string' ? fs.realpathSync(options.cwd) : null;
    if (closing || !cwd || !cwd.startsWith(`${fs.realpathSync(directory)}${path.sep}`)
      || (process.platform !== 'win32' && options.detached !== true)) {
      ownershipFailure = new Error('REPORT_FIXTURE_UNKNOWN_SPAWN_OWNERSHIP');
      // Reject before spawning anything whose ownership cannot be established.
      throw ownershipFailure;
    }
    const child = Reflect.apply(originalSpawn, childProcess, args);
    let resolveClose;
    const row = { child, messages: [], responses: [], stderr: '', closed: null,
      closePromise: new Promise(resolve => { resolveClose = resolve; }) };
    const write = child.stdin.write;
    child.stdin.write = function (...values) {
      const bytes = values[0];
      for (const line of String(bytes).trim().split('\n')) {
        if (line) row.messages.push(JSON.parse(line));
      }
      return Reflect.apply(write, child.stdin, values);
    };
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      let end;
      while ((end = output.indexOf('\n')) !== -1) {
        const line = output.slice(0, end);
        output = output.slice(end + 1);
        if (line) row.responses.push(JSON.parse(line));
      }
    });
    owned.push(row);
    child.once('close', (code, signal) => { row.closed = { code, signal }; resolveClose(); });
    child.stderr.on('data', chunk => { row.stderr += chunk.toString(); });
    return child;
  });
  syncBuiltinESMExports();
  return { owned };
}


export function failFirstDeployTermination(t, ownership) {
  const realKill = process.kill;
  let injected;
  const hook = t.mock.method(process, 'kill', function (pid, signal) {
    const row = ownership.owned.find(candidate => candidate.child.pid && pid === -candidate.child.pid
      && candidate.messages.some(message => message.kind === 'initialize' && message.invocation.nodeId === 'deploy')
      && candidate.messages.some(message => message.kind === 'execute'));
    if (!injected && row && signal === 'SIGTERM') {
      assert(row.responses.some(message => message.kind === 'result' && message.value.outcome === 'passed'),
        'actual passed provider result IPC must precede injected TERM failure');
      injected = row;
      throw Object.assign(new Error('injected exact owned group TERM failure'), { code: 'EPERM' });
    }
    return Reflect.apply(realKill, process, [pid, signal]);
  });
  t.after(() => hook.mock.restore());
  return () => injected;
}
