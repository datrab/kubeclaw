export class FrozenMap<K, V> implements ReadonlyMap<K, V> {
  readonly #map: Map<K, V>;

  constructor(entries: Iterable<readonly [K, V]>) {
    this.#map = new Map(entries);
    Object.freeze(this);
  }

  get size(): number { return this.#map.size; }
  get(key: K): V | undefined { return this.#map.get(key); }
  has(key: K): boolean { return this.#map.has(key); }
  entries(): MapIterator<[K, V]> { return this.#map.entries(); }
  keys(): MapIterator<K> { return this.#map.keys(); }
  values(): MapIterator<V> { return this.#map.values(); }
  forEach(callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    for (const [key, value] of this.#map) callback.call(thisArg, value, key, this);
  }
  [Symbol.iterator](): MapIterator<[K, V]> { return this.#map[Symbol.iterator](); }
  get [Symbol.toStringTag](): string { return 'FrozenMap'; }
}
