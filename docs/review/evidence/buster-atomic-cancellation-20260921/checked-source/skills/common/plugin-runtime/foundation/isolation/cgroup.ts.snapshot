import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { hostPageSize, pageAlignedMemoryLimit } from './memory-limit.ts';

const CGROUP2_SUPER_MAGIC = 0x63677270;

function writeExact(file: string, value: string): void {
  fs.writeFileSync(file, value);
  if (fs.readFileSync(file, 'utf8').trim() !== value) throw new Error(`ISOLATION_CGROUP_LIMIT_MISMATCH:${path.basename(file)}`);
}

/** Created only by the trusted host; plugin input cannot choose this root. */
export class IsolationCgroup {
  readonly path: string;
  private constructor(group: string) { this.path = group; }

  static create(rootValue: string | undefined, memoryBytes: number): IsolationCgroup {
    if (!rootValue) throw new Error('ISOLATION_CGROUP_REQUIRED');
    if (!Number.isSafeInteger(memoryBytes) || memoryBytes < 16 * 1024 * 1024) throw new Error('ISOLATION_MEMORY_LIMIT_INVALID');
    if (!path.isAbsolute(rootValue)) throw new Error('ISOLATION_CGROUP_ROOT_INVALID');
    const root = fs.realpathSync(rootValue);
    if (root === '/sys/fs/cgroup' || root === '/' || fs.statfsSync(root).type !== CGROUP2_SUPER_MAGIC) throw new Error('ISOLATION_CGROUP_ROOT_INVALID');
    const controllers = fs.readFileSync(path.join(root, 'cgroup.subtree_control'), 'utf8').trim().split(/\s+/u);
    if (!controllers.includes('memory') || fs.readFileSync(path.join(root, 'cgroup.procs'), 'utf8').trim()) throw new Error('ISOLATION_CGROUP_NOT_DELEGATED');
    const effectiveMemoryBytes = pageAlignedMemoryLimit(memoryBytes, hostPageSize());
    const group = fs.mkdtempSync(path.join(root, 'invocation-'));
    try {
      writeExact(path.join(group, 'memory.max'), String(effectiveMemoryBytes));
      writeExact(path.join(group, 'memory.swap.max'), '0');
      writeExact(path.join(group, 'memory.oom.group'), '1');
      fs.accessSync(path.join(group, 'cgroup.kill'), fs.constants.W_OK);
      fs.accessSync(path.join(group, 'cgroup.events'), fs.constants.R_OK);
      fs.accessSync(path.join(group, 'memory.events'), fs.constants.R_OK);
      fs.accessSync(path.join(group, 'memory.peak'), fs.constants.R_OK);
      return new IsolationCgroup(group);
    } catch (cause) {
      try { fs.rmdirSync(group); }
      catch (cleanup) { throw new AggregateError([cause, cleanup], 'ISOLATION_CGROUP_SETUP_CLEANUP_FAILED'); }
      throw new Error('ISOLATION_CGROUP_SETUP_FAILED', { cause });
    }
  }

  kill(): void { fs.writeFileSync(path.join(this.path, 'cgroup.kill'), '1'); }

  async close(): Promise<void> {
    this.kill();
    for (let attempt = 0; attempt < 200; attempt++) {
      if (/^populated 0$/mu.test(fs.readFileSync(path.join(this.path, 'cgroup.events'), 'utf8'))) {
        const events = fs.readFileSync(path.join(this.path, 'memory.events'), 'utf8');
        const peak = fs.readFileSync(path.join(this.path, 'memory.peak'), 'utf8').trim();
        fs.rmdirSync(this.path);
        if (/^oom_kill [1-9]\d*$/mu.test(events)) throw new Error(`ISOLATED_PLUGIN_MEMORY_LIMIT:memory.peak=${peak}`);
        return;
      }
      await delay(10);
    }
    throw new Error(`ISOLATION_CGROUP_CLEANUP_FAILED:${this.path}`);
  }
}
