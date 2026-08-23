declare module 'js-yaml' {
  export function loadAll(input: string, iterator?: (document: unknown) => void): unknown[];
}
