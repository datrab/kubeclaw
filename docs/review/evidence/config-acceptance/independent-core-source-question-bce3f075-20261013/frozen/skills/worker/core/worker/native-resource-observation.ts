import fs from 'node:fs';
import path from 'node:path';

/** Native task units are deliberately distinct from V1 maximumProcesses. */
export interface NativeWorkerResourceObservation {
  readonly unit: 'linux-tasks';
  readonly cpuTimeMicroseconds: number;
  readonly maximumMemoryBytes: number;
  readonly maximumTasks: number;
  readonly populated: boolean;
  readonly oomKills: number;
  readonly taskLimitHits: number;
}

export function validateNativeWorkerResourceObservation(value: unknown): asserts value is NativeWorkerResourceObservation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('WORKER_NATIVE_OBSERVATION_INVALID');
  const observation = value as Record<string, unknown>;
  const counters = ['cpuTimeMicroseconds', 'maximumMemoryBytes', 'maximumTasks', 'oomKills', 'taskLimitHits'];
  if (Object.keys(observation).length !== 7 || observation.unit !== 'linux-tasks' || typeof observation.populated !== 'boolean'
    || counters.some(key => !Number.isSafeInteger(observation[key]) || Number(observation[key]) < 0)) {
    throw new Error('WORKER_NATIVE_OBSERVATION_INVALID');
  }
}

const CGROUP2_SUPER_MAGIC = 0x63677270;

function unsigned(value: string, field: string): number {
  if (!/^(0|[1-9]\d*)$/u.test(value)) throw new Error(`WORKER_NATIVE_COUNTER_INVALID:${field}`);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`WORKER_NATIVE_COUNTER_OVERFLOW:${field}`);
  return number;
}

function scalar(root: string, file: string): number {
  return unsigned(fs.readFileSync(path.join(root, file), 'utf8').trim(), file);
}

function counter(root: string, file: string, key: string): number {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').trim().split('\n');
  const matches = lines.map(line => line.trim().split(/\s+/u)).filter(parts => parts[0] === key);
  if (matches.length !== 1 || matches[0]?.length !== 2) {
    throw new Error(`WORKER_NATIVE_COUNTER_MISSING:${file}:${key}`);
  }
  return unsigned(matches[0][1]!, `${file}:${key}`);
}

/**
 * Read an actual kernel scope without removing it. The caller owns scope
 * identity, launch fencing and quiescence; this reader grants no such authority.
 * Missing counters fail instead of becoming zero or sampled substitutes.
 */
export function observeNativeWorkerResources(scope: string): NativeWorkerResourceObservation {
  if (!path.isAbsolute(scope) || fs.statfsSync(scope).type !== CGROUP2_SUPER_MAGIC) {
    throw new Error('WORKER_NATIVE_CGROUP_REQUIRED');
  }
  const populated = counter(scope, 'cgroup.events', 'populated');
  if (populated !== 0 && populated !== 1) throw new Error('WORKER_NATIVE_POPULATED_INVALID');
  return {
    unit: 'linux-tasks',
    cpuTimeMicroseconds: counter(scope, 'cpu.stat', 'usage_usec'),
    maximumMemoryBytes: scalar(scope, 'memory.peak'),
    maximumTasks: scalar(scope, 'pids.peak'),
    populated: populated === 1,
    oomKills: counter(scope, 'memory.events', 'oom_kill'),
    taskLimitHits: counter(scope, 'pids.events', 'max'),
  };
}
