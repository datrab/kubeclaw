import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const descriptorChild = `
  const fs = require('node:fs');
  const assert = require('node:assert/strict');
  const status = fs.readFileSync('/proc/self/status', 'utf8');
  for (const field of ['CapEff', 'CapPrm', 'CapInh', 'CapAmb']) {
    assert.equal(BigInt('0x' + status.match(new RegExp('^' + field + ':\\\\s+([0-9a-f]+)$', 'm'))[1]), 0n);
  }
  assert.match(status, /^NoNewPrivs:\\s+1$/m);
  const byte = Buffer.from([Number(process.argv[1])]);
  fs.writeSync(4, byte, 0, 1, 0);
  fs.fsyncSync(4);
  const stat = fs.readFileSync('/proc/self/stat', 'utf8');
  const startTime = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
  process.stderr.write('BUSTER_NATIVE_TEST_RETAINED_FD:' + JSON.stringify({pid:process.pid,startTime,uid:process.getuid(),gid:process.getgid()}) + '\\n');
  fs.writeSync(3, 'ready\\n'); fs.closeSync(3);
  setInterval(() => { fs.writeSync(4, byte, 0, 1, 0); }, 10);
`;

async function retainDescriptor(fd: number, firstByte: number): Promise<void> {
  const child = spawn(process.execPath, ['-e', descriptorChild, String(firstByte)],
    { stdio: ['ignore', 'ignore', 'inherit', 'pipe', fd] });
  const ready = child.stdio[3];
  assert.ok(ready && 'readable' in ready);
  const exited = once(child, 'exit');
  await Promise.race([
    once(ready, 'data').then(([bytes]) => assert.equal(String(bytes), 'ready\n')),
    exited.then(([code, signal]) => { throw new Error(`descriptor child exited before readiness: ${code}/${signal}`); }),
  ]);
  ready.destroy();
  child.unref();
}

/** Finite test-only I/O boundaries around actual writes; never used by production composition. */
export function armPreparationHostBoundary(fileName: 'request.json' | 'repository.tar.gz',
  mode: 'partial-write' | 'retained-descriptor'): void {
  const root = process.env.BUSTER_PREPARATION_ASSIGNED_SOURCE_ROOT;
  assert.ok(root && path.isAbsolute(root));
  const open = fs.open.bind(fs);
  let intercepted = false;
  fs.open = async (file, flags, permissions) => {
    const handle = await open(file, flags, permissions);
    if (typeof file !== 'string' || path.basename(file) !== fileName || flags !== 'wx') return handle;
    assert.equal(path.dirname(path.dirname(path.dirname(file))), root);
    assert.equal(path.basename(path.dirname(file)), 'data');
    assert.match(path.basename(path.dirname(path.dirname(file))), /^[a-f0-9]{32}$/u);
    assert.equal(intercepted, false);
    intercepted = true;
    const write = handle.writeFile.bind(handle);
    const close = handle.close.bind(handle);
    let firstByte: number | undefined;
    handle.writeFile = async (data, options) => {
      assert.ok(Buffer.isBuffer(data), 'real source writer supplies the original bounded Buffer');
      assert.ok(data.byteLength > 1);
      if (mode === 'partial-write') {
        const part = data.subarray(0, Math.floor(data.byteLength / 2));
        await write(part, options);
        await handle.sync();
        assert.equal((await handle.stat()).size, part.byteLength);
        process.stderr.write(`BUSTER_NATIVE_TEST_PARTIAL_WRITE:${fileName}\n`);
        await new Promise<void>(() => { setInterval(() => {}, 1000); });
        return;
      }
      await write(data, options);
      firstByte = data[0];
    };
    handle.close = async () => {
      if (mode === 'retained-descriptor') {
        assert.notEqual(firstByte, undefined);
        await retainDescriptor(handle.fd, firstByte!);
      }
      await close();
    };
    return handle;
  };
}
