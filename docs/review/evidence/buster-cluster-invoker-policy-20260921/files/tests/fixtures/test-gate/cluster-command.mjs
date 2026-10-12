import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

export function clusterCommand(t, program) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cluster-command-'));
  const owned = []; const spawn = childProcess.spawn, kill = process.kill;
  let hook;
  t.after(async () => {
    const failures = [];
    try {
      for (const row of owned) if (!row.closed) {
        try { kill(-row.child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') failures.push(error); }
      }
      let timer;
      try { await Promise.race([Promise.all(owned.map(row => row.close)), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('CLUSTER_COMMAND_CLOSE_TIMEOUT')), 2000);
      })]); } finally { clearTimeout(timer); }
      if (failures.length) throw new AggregateError(failures, 'CLUSTER_COMMAND_CLEANUP_FAILED');
      assert(owned.every(row => row.closed)); fs.rmSync(root, { recursive: true, force: true });
    } finally { hook?.mock.restore(); syncBuiltinESMExports(); }
  });
  const binary = path.join(root, 'kubectl'); const marker = path.join(root, 'started.jsonl');
  fs.writeFileSync(binary, `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,args,at:Date.now()})+String.fromCharCode(10));\n${program}\n`, { flag: 'wx', mode: 0o700 });
  hook = t.mock.method(childProcess, 'spawn', function (command, args, options) {
    if (command !== binary) return Reflect.apply(spawn, childProcess, [command, args, options]);
    assert.equal(options.detached, true);
    const child = Reflect.apply(spawn, childProcess, [command, args, options]);
    let close; const row = { child, closed: false, args: [...args], close: new Promise(resolve => { close = resolve; }) };
    owned.push(row); child.once('close', () => { row.closed = true; close(); }); return child;
  });
  syncBuiltinESMExports();
  return { root, binary, owned, calls: () => fs.readFileSync(marker, 'utf8').trim().split('\n').map(line => JSON.parse(line)) };
}
