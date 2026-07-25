type EventListener = (value: unknown) => void;

function listenerSet(value: Set<EventListener> | undefined): Set<EventListener> {
  return value ?? new Set<EventListener>();
}

export class LocalEventEmitter {
  #listeners = new Map<string, Set<EventListener>>();

  setMaxListeners(_maxListeners: number): void {}

  on(channel: string, listener: EventListener): void {
    const listeners = listenerSet(this.#listeners.get(channel));
    listeners.add(listener);
    this.#listeners.set(channel, listeners);
  }

  off(channel: string, listener: EventListener): void {
    this.#listeners.get(channel)?.delete(listener);
  }

  emit(channel: string, value: unknown): void {
    for (const listener of [...listenerSet(this.#listeners.get(channel))]) listener(value);
  }

  listenerCount(channel: string): number {
    return this.#listeners.get(channel)?.size ?? 0;
  }
}
