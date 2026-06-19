declare module 'node:fs' {
  const fs: any;
  export default fs;
}

declare module 'node:path' {
  const path: any;
  export default path;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

declare const process: {
  argv: string[];
  cwd(): string;
  exitCode?: number;
};

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
