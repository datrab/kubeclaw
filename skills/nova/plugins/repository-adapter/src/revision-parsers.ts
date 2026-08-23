import path from 'node:path';

export interface RevisionInventoryRecord {
  readonly path: string;
  readonly objectId: string;
  readonly mode: string;
  readonly sizeBytes: number;
}

export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function parseRevisionInventory(
  output: Buffer, safePath: (value: unknown) => string,
): readonly RevisionInventoryRecord[] {
  const fields = new TextDecoder('utf-8', { fatal: true }).decode(output).split('\0');
  if (fields.at(-1) === '') fields.pop();
  return fields.map((field) => {
    const match = /^(\d{6}) (blob|commit) ([0-9a-f]{40}|[0-9a-f]{64}) +(\d+|-)\t([\s\S]+)$/u.exec(field);
    if (!match) throw new Error('REPOSITORY_INVENTORY_INVALID');
    const gitlink = match[1] === '160000' && match[2] === 'commit' && match[4] === '-';
    if (match[2] !== 'blob' && !gitlink) throw new Error('REPOSITORY_INVENTORY_INVALID');
    const sizeBytes = gitlink ? 0 : Number(match[4]);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) throw new Error('REPOSITORY_FILE_SIZE_INVALID');
    return { mode: match[1] as string, objectId: match[3] as string,
      sizeBytes, path: safePath(match[5]) };
  }).sort((left, right) => compareCodeUnits(left.path, right.path));
}

const MODULE_SPECIFIER = /(?:import|export)\s+(?:(?:[^'";\/]|\/(?![*/])|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*?\s+from\s+)?['"](\.[^'"\n]+)['"]|require\(\s*['"](\.[^'"\n]+)['"]\s*\)|import\s*\(\s*['"](\.[^'"\n]+)['"]\s*\)/gu;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'] as const;

export function referenceNeedle(sourcePath: string): string {
  return path.posix.basename(sourcePath).replace(/\.[^.]+$/u, '');
}

function possibleModulePaths(candidatePath: string, specifier: string): ReadonlySet<string> {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(candidatePath), specifier));
  const values = new Set<string>([base]);
  for (const extension of SOURCE_EXTENSIONS) {
    values.add(`${base}${extension}`); values.add(`${base}/index${extension}`);
  }
  const suppliedExtension = path.posix.extname(base);
  if (!SOURCE_EXTENSIONS.includes(suppliedExtension as typeof SOURCE_EXTENSIONS[number])) return values;
  const stem = base.slice(0, -suppliedExtension.length);
  for (const extension of SOURCE_EXTENSIONS) values.add(`${stem}${extension}`);
  return values;
}

export function directlyReferences(candidatePath: string, sourcePath: string, content: string): boolean {
  for (const match of content.matchAll(MODULE_SPECIFIER)) {
    let specifier = match[1];
    if (specifier === undefined) specifier = match[2] ?? match[3];
    if (specifier && possibleModulePaths(candidatePath, specifier).has(sourcePath)) return true;
  }
  return false;
}
