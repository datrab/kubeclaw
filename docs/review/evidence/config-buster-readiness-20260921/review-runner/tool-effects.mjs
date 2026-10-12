import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-real-tools-'));
try {
  const lock = path.join(directory, 'lock');
  const holder = spawn('/usr/bin/flock', ['--exclusive', lock, '/bin/sh', '-c', 'printf "locked\\n"; cat >/dev/null'], { stdio: ['pipe','pipe','pipe'] });
  assert.equal((await once(holder.stdout, 'data'))[0].toString(), 'locked\n');
  const contender = spawn('/usr/bin/flock', ['--exclusive', '--nonblock', lock, '/bin/true']);
  assert.equal((await once(contender, 'exit'))[0], 1, 'real separate process cannot acquire held inode');
  const ended = once(holder, 'exit'); holder.stdin.end(); assert.equal((await ended)[0], 0);
  const successor = spawn('/usr/bin/flock', ['--exclusive', '--nonblock', lock, '/bin/true']);
  assert.equal((await once(successor, 'exit'))[0], 0);
  const source = path.join(directory,'source'), target=path.join(directory,'target');
  fs.mkdirSync(source);fs.mkdirSync(target);fs.writeFileSync(path.join(source,'proof'),'actual GNU tar bytes\n');
  const tar = process.env.KUBECLAW_TEST_TAR;
  assert(tar);
  execFileSync(tar,['-czf',path.join(directory,'archive.tgz'),'-C',source,'proof']);
  execFileSync(tar,['--no-same-owner','--no-same-permissions','-xzf',path.join(directory,'archive.tgz'),'-C',target]);
  assert.equal(fs.readFileSync(path.join(target,'proof'),'utf8'),'actual GNU tar bytes\n');
  console.log(JSON.stringify({ realProcessLockExclusion:true, realArchiveRoundtrip:true }));
} finally { fs.rmSync(directory,{recursive:true,force:true}); }
