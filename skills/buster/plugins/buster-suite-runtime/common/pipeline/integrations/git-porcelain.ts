import { gitExec } from '../git-primitives.js';

export type PorcelainEntry = {
  raw: string;
  status: string;
  path: string;
};

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function parsePorcelainEntries(
  repoRoot: string,
  args: string[] = ['status', '--porcelain', '--untracked-files=all'],
): PorcelainEntry[] {
  const output = gitExec(repoRoot, args);
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const trimmedUnstagedStatus = line.length > 2 && line[1] === ' ' && line[2] !== ' ' && /^[MADRCUT]$/.test(line.charAt(0));
      const status = trimmedUnstagedStatus ? ` ${line[0]}` : line.slice(0, 2);
      const payload = line.slice(trimmedUnstagedStatus ? 2 : 3).trim();
      const filePath = payload.includes(' -> ') ? textValue(payload.split(' -> ').pop()).trim() : payload;
      return { raw: line, status, path: filePath };
    });
}
