type AnyRecord = Record<string, any>;

const RESERVED_REGISTRY_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  ...Object.getOwnPropertyNames(Object.prototype),
]);

export function createRegistryDictionary(): AnyRecord {
  return Object.create(null);
}

export function isReservedRegistryKey(key: string) {
  return RESERVED_REGISTRY_KEYS.has(key);
}
