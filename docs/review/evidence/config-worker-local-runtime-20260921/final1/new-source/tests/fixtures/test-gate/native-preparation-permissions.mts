import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { PreparationExecutionOptions } from '../../../skills/buster/engine/test-gates/preparation-execution.ts';

/** A cap-free attacker, outside the owned host, tests the stronger DAC boundary. */
export function runPreparationAttacker(uid: number, gid: number, script: string, arguments_: string[]): void {
  const bootstrap = `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    process.setgroups([]); process.setgid(${gid}); process.setuid(${uid});
    const status = fs.readFileSync('/proc/self/status', 'utf8');
    assert.equal(process.getuid(), ${uid}); assert.equal(process.getgid(), ${gid});
    assert.match(status, /^Groups:[ \t]*$/m);
    for (const field of ['CapEff', 'CapPrm', 'CapInh', 'CapAmb']) {
      assert.equal(BigInt('0x' + status.match(new RegExp('^' + field + ':\\\\s+([0-9a-f]+)$', 'm'))[1]), 0n);
    }
    ${script}
  `;
  execFileSync(process.execPath, ['-e', bootstrap, ...arguments_], { timeout: 30_000, stdio: 'pipe' });
}

export async function assertPublishedSourcePermissions(root: string, repository: string): Promise<void> {
  const copies = path.join(root, 'service-copies');
  await fs.mkdir(copies, { mode: 0o700 });
  await fs.chown(copies, 1000, 1000);
  runPreparationAttacker(1000, 1000, `
    const [source, copies] = process.argv.slice(1);
    assert.equal(fs.readFileSync(source + '/README.md', 'utf8'), 'owned preparation source\\n');
    assert.throws(() => fs.writeFileSync(source + '/README.md', 'corrupt'), { code: 'EACCES' });
    assert.throws(() => fs.renameSync(source, source + '-replaced'), { code: 'EACCES' });
    fs.cpSync(source, copies + '/repository', { recursive: true });
    fs.writeFileSync(copies + '/repository/README.md', 'provider changed its own copy');
    fs.writeFileSync(copies + '/repository/build-output', 'provider output');
    assert.ok(fs.statSync(copies + '/repository/run.sh').mode & 0o100);
    assert.equal(fs.readFileSync(source + '/README.md', 'utf8'), 'owned preparation source\\n');
  `, [repository, copies]);
  for (const uid of [1003, 1004]) {
    runPreparationAttacker(uid, uid, `
      assert.throws(() => fs.readFileSync(process.argv[1] + '/README.md'), { code: 'EACCES' });
    `, [repository]);
  }
  assert.equal(await fs.readFile(path.join(repository, 'README.md'), 'utf8'), 'owned preparation source\n');
}

export async function assertConcurrentGateIsolation(execution: PreparationExecutionOptions): Promise<void> {
  const rows = await execution.ledger.reservations();
  assert.deepEqual(rows.map(row => row.slot).sort(), [1003, 1004]);
  const gates: Array<{ uid: number; directory: string; pid: number }> = [];
  for (const row of rows) {
    const envelope = row.envelope;
    const record = await execution.owner.record({ workerId: envelope.claim.workerId,
      attemptId: envelope.attemptId, claimId: envelope.claim.claimId, generation: envelope.claim.generation,
      profileDigest: envelope.profile.profileDigest, attemptSpecDigest: envelope.attemptSpecDigest });
    assert.equal(record?.phase, 'running');
    assert.equal(record.topology.kind, 'aggregate.v1');
    assert.ok(record.topology.children.some(child => child.name === 'host' && child.binding));
    const pids = (await fs.readFile(path.join(execution.command.cgroupRoot, record.scopeName, 'host', 'cgroup.procs'), 'utf8'))
      .trim().split(/\s+/u).map(Number);
    const observed: number[] = [];
    for (const pid of pids) {
      const status = await fs.readFile(`/proc/${pid}/status`, 'utf8');
      if (status.match(/^Uid:\s+(\d+)/mu)?.[1] === String(row.slot)) observed.push(pid);
    }
    assert.ok(observed[0], 'live owned host with assigned credential must exist');
    gates.push({ uid: row.slot, directory: path.join(execution.command.sourceRoot, row.admissionId), pid: observed[0] });
  }
  for (const own of gates) {
    const foreign = gates.find(gate => gate.uid !== own.uid)!;
    runPreparationAttacker(own.uid, own.uid, `
      const [own, foreign, foreignPid] = process.argv.slice(1);
      fs.writeFileSync(own + '/permission-probe', 'own');
      assert.equal(fs.readFileSync(own + '/permission-probe', 'utf8'), 'own');
      fs.unlinkSync(own + '/permission-probe');
      assert.throws(() => fs.readdirSync(foreign), { code: 'EACCES' });
      assert.throws(() => fs.writeFileSync(foreign + '/intrusion', 'foreign'), { code: 'EACCES' });
      assert.throws(() => fs.renameSync(foreign, foreign + '-replaced'), { code: 'EACCES' });
      assert.throws(() => fs.chmodSync(foreign, 0o777), { code: 'EPERM' });
      assert.throws(() => process.kill(Number(foreignPid), 0), { code: 'EPERM' });
    `, [own.directory, foreign.directory, String(foreign.pid)]);
  }
}
