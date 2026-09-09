import { types } from 'node:util';

type CopyTask = { input: unknown; target: object; key: string };
type Task = CopyTask | { finish: object; source: object };

function objectProperties(input: object, output: object, array: boolean): CopyTask[] {
  const properties: CopyTask[] = [];
  for (const key of Reflect.ownKeys(input)) {
    if (array && key === 'length') continue;
    const property = Object.getOwnPropertyDescriptor(input, key)!;
    if (typeof key !== 'string' || !property.enumerable || !('value' in property)) throw new Error('JOURNAL_VALUE_NOT_JSON');
    if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= (input as unknown[]).length)) throw new Error('JOURNAL_VALUE_NOT_JSON');
    if (!array && property.value === undefined) continue;
    properties.push({ input: property.value, target: output, key });
  }
  if (array && properties.length !== (input as unknown[]).length) throw new Error('JOURNAL_VALUE_NOT_JSON');
  return properties;
}

function copyObject(input: unknown, ancestors: Set<object>, pending: Task[]): object {
  if (typeof input !== 'object' || input === null || types.isProxy(input)) throw new Error('JOURNAL_VALUE_NOT_JSON');
  if (ancestors.has(input)) throw new Error('JOURNAL_VALUE_CIRCULAR');
  const array = Array.isArray(input);
  const prototype = Object.getPrototypeOf(input);
  if (!array && prototype !== Object.prototype && prototype !== null) throw new Error('JOURNAL_VALUE_NOT_JSON');
  const output: object = array ? [] : {};
  const properties = objectProperties(input, output, array);
  ancestors.add(input);
  pending.push({ finish: output, source: input });
  // Reverse work order so object key insertion order and journal hashes stay stable.
  for (let index = properties.length - 1; index >= 0; index--) pending.push(properties[index]!);
  return output;
}

/** Own an immutable JSON snapshot, without invoking caller serialization hooks.
 * Undefined object properties are omitted, preserving optional-field behavior.
 */
export function snapshotJson<T>(value: T): T {
  const ancestors = new Set<object>();
  const root: { value?: unknown } = {};
  const pending: Task[] = [{ input: value, target: root, key: 'value' }];
  while (pending.length) {
    const task = pending.pop()!;
    if ('finish' in task) { Object.freeze(task.finish); ancestors.delete(task.source); continue; }
    const { input, target, key } = task;
    let result: unknown;
    if (input === null || typeof input === 'string' || typeof input === 'boolean') result = input;
    else if (typeof input === 'number' && Number.isFinite(input)) result = Object.is(input, -0) ? 0 : input;
    else result = copyObject(input, ancestors, pending);
    Object.defineProperty(target, key, { value: result, enumerable: true, writable: true, configurable: true });
  }
  return root.value as T;
}
