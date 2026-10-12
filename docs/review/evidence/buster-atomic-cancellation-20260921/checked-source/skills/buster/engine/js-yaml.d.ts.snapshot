declare module 'js-yaml' {
  interface LoadOptions { listener?: (eventType: 'open' | 'close', state: unknown) => void; }
  export function loadAll(input: string, iterator?: null, options?: LoadOptions): unknown[];
  export function loadAll(input: string, iterator: (document: unknown) => void, options?: LoadOptions): void;
}
