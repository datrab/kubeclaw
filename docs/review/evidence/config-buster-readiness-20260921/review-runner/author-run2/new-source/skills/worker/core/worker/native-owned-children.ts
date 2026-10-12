import fs from 'node:fs';
import path from 'node:path';
import type { WorkerScopeBinding } from './ownership-store.ts';
import { childNameValid, validateChildLimits, type WorkerOwnedChild } from './ownership-children.ts';
import type { NativeWorkerScopeLimits } from './native-resource-scope.ts';
import { observeNativeWorkerResources } from './native-resource-observation.ts';

export function configureNativeLimits(scope: string, limits: NativeWorkerScopeLimits): void {
  validateChildLimits(limits);
  for (const [name, value] of Object.entries({ 'memory.max': limits.memoryBytes,
    'memory.swap.max': 0, 'memory.oom.group': 1, 'pids.max': limits.tasks })) {
    const file = path.join(scope, name);
    fs.writeFileSync(file, String(value));
    if (fs.readFileSync(file, 'utf8').trim() !== String(value)) throw new Error(`WORKER_NATIVE_LIMIT_MISMATCH:${name}`);
  }
}

export function aggregateChildLimits(parentPath: string, requested?: NativeWorkerScopeLimits): NativeWorkerScopeLimits {
  const parent = { memoryBytes: Number(fs.readFileSync(path.join(parentPath, 'memory.max'), 'utf8').trim()),
    tasks: Number(fs.readFileSync(path.join(parentPath, 'pids.max'), 'utf8').trim()) };
  validateChildLimits(parent);
  const limits = requested ? { ...requested } : parent;
  validateChildLimits(limits);
  if (limits.memoryBytes > parent.memoryBytes || limits.tasks > parent.tasks) throw new Error('WORKER_NATIVE_CHILD_LIMIT_EXCEEDS_PARENT');
  return limits;
}

export function createNativeChild(parentPath: string, parent: WorkerScopeBinding,
  child: WorkerOwnedChild): WorkerScopeBinding {
  if (!childNameValid(child.name) || child.binding !== null) throw new Error('WORKER_NATIVE_CHILD_RESERVATION_INVALID');
  const limits = aggregateChildLimits(parentPath, child.limits);
  const target = path.join(parentPath, child.name);
  fs.mkdirSync(target);
  // Keep partial creation for drain-only recovery under its durable reservation.
  configureNativeLimits(target, limits);
  if (observeNativeWorkerResources(target).populated) throw new Error('WORKER_NATIVE_UNBOUND_SCOPE_POPULATED');
  return readChildBinding(target, parent, child.name);
}

function readChildBinding(target: string, parent: WorkerScopeBinding, name: string): WorkerScopeBinding {
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.dev !== parent.device || fs.statfsSync(target).type !== 0x63677270) {
    throw new Error('WORKER_NATIVE_CHILD_BINDING_CHANGED');
  }
  return { scopeName: name, bootId: parent.bootId, device: stat.dev, inode: stat.ino };
}

export function verifyNativeChild(parentPath: string, parent: WorkerScopeBinding, child: WorkerOwnedChild): string {
  if (!childNameValid(child.name)) throw new Error('WORKER_NATIVE_CHILD_NAME_INVALID');
  const target = path.join(parentPath, child.name);
  const actual = readChildBinding(target, parent, child.name);
  if (child.binding && (actual.bootId !== child.binding.bootId || actual.device !== child.binding.device
    || actual.inode !== child.binding.inode || actual.scopeName !== child.binding.scopeName)) {
    throw new Error('WORKER_NATIVE_CHILD_BINDING_CHANGED');
  }
  if (fs.readdirSync(target, { withFileTypes: true }).some(entry => entry.isDirectory() || entry.isSymbolicLink())) {
    throw new Error('WORKER_NATIVE_UNKNOWN_CHILD');
  }
  if (!child.binding && observeNativeWorkerResources(target).populated) throw new Error('WORKER_NATIVE_UNBOUND_SCOPE_POPULATED');
  return target;
}

/** Missing bound children are legal only after the aggregate empty observation is durable. */
export function verifyNativeChildren(parentPath: string, parent: WorkerScopeBinding,
  children: readonly WorkerOwnedChild[], removalStarted: boolean): readonly string[] {
  const present = fs.readdirSync(parentPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory() || entry.isSymbolicLink()).map(entry => entry.name);
  if (present.some(name => !children.some(child => child.name === name))) throw new Error('WORKER_NATIVE_UNKNOWN_CHILD');
  const paths: string[] = [];
  for (const child of children) {
    if (present.includes(child.name)) paths.push(verifyNativeChild(parentPath, parent, child));
    else if (child.binding && !removalStarted) throw new Error('WORKER_NATIVE_OWNED_CHILD_MISSING');
  }
  return paths;
}
