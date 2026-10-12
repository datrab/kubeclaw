import type { WorkerScopeBinding } from './ownership-store.ts';
import type { NativeWorkerScopeLimits } from './native-resource-scope.ts';

export interface WorkerOwnedChild {
  readonly name: string;
  readonly limits: NativeWorkerScopeLimits;
  readonly binding: WorkerScopeBinding | null;
}

export type WorkerScopeTopology = {
  readonly kind: 'aggregate.v1' | 'legacy-leaf';
  readonly children: readonly WorkerOwnedChild[];
};

export function childNameValid(name: string): boolean {
  return name === 'host' || /^helper-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(name);
}

export function validateChildLimits(value: unknown): asserts value is NativeWorkerScopeLimits {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'memoryBytes,tasks'
    || !('memoryBytes' in value) || !('tasks' in value)
    || !Number.isSafeInteger(value.memoryBytes) || Number(value.memoryBytes) < 1
    || !Number.isSafeInteger(value.tasks) || Number(value.tasks) < 1) {
    throw new Error('WORKER_NATIVE_LIMIT_INVALID');
  }
}

export function validateTopology(value: unknown, parent: WorkerScopeBinding | null): asserts value is WorkerScopeTopology {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'children,kind'
    || !('kind' in value) || !('children' in value) || !Array.isArray(value.children)
    || !['aggregate.v1', 'legacy-leaf'].includes(String(value.kind))) {
    throw new Error('WORKER_OWNERSHIP_TOPOLOGY_INVALID');
  }
  if ((value.kind === 'legacy-leaf' || parent === null) && value.children.length) {
    throw new Error('WORKER_OWNERSHIP_TOPOLOGY_INVALID');
  }
  const names = new Set<string>();
  for (const child of value.children) {
    validateChild(child, parent);
    if (names.has(child.name)) throw new Error('WORKER_OWNERSHIP_CHILD_DUPLICATE');
    names.add(child.name);
  }
}

function validateChild(child: unknown, parent: WorkerScopeBinding | null): asserts child is WorkerOwnedChild {
  if (!child || typeof child !== 'object' || Array.isArray(child)
    || Object.keys(child).sort().join(',') !== 'binding,limits,name'
    || !('name' in child) || typeof child.name !== 'string' || !childNameValid(child.name)
    || !('limits' in child) || !('binding' in child)) throw new Error('WORKER_OWNERSHIP_CHILD_INVALID');
  validateChildLimits(child.limits);
  if (child.binding === null) return;
  validateChildBinding(child.binding, child.name, parent);
}

function validateChildBinding(value: unknown, name: string, parent: WorkerScopeBinding | null): void {
  const binding = value as WorkerScopeBinding;
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)
    || Object.keys(binding).sort().join(',') !== 'bootId,device,inode,scopeName'
    || binding.scopeName !== name || binding.bootId !== parent?.bootId
    || binding.device !== parent.device || !Number.isSafeInteger(binding.inode) || binding.inode < 1
    || binding.inode === parent.inode) throw new Error('WORKER_OWNERSHIP_CHILD_BINDING_INVALID');
}
