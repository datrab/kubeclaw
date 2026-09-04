import { compareCodeUnits } from './review-ordering.ts';
import type { ReviewSnapshotFile } from './review-snapshot-inventory.ts';

function lowerBound(files: readonly ReviewSnapshotFile[], path: string): number {
  let low = 0, high = files.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (compareCodeUnits((files[middle] as ReviewSnapshotFile).path, path) < 0) low = middle + 1;
    else high = middle;
  }
  return low;
}
function reversePath(path: string): string { return [...path].reverse().join(''); }
function lowerBoundSuffix(entries: readonly Readonly<{ key: string }>[], key: string): number {
  let low = 0, high = entries.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (compareCodeUnits((entries[middle] as Readonly<{ key: string }>).key, key) < 0) low = middle + 1;
    else high = middle;
  }
  return low;
}

export interface ReviewInventoryLookup {
  resolve(requestedPath: string): readonly ReviewSnapshotFile[];
}

export function buildReviewInventoryLookup(files: readonly ReviewSnapshotFile[]): ReviewInventoryLookup {
  const ordered = Object.freeze([...files].sort((left, right) => compareCodeUnits(left.path, right.path)));
  const exact = new Map(ordered.map((file) => [file.path, file]));
  const bySuffix = Object.freeze(ordered.map((file) => Object.freeze({ key: reversePath(file.path), file }))
    .sort((left, right) => compareCodeUnits(left.key, right.key)));
  return Object.freeze({ resolve(requestedPath: string): readonly ReviewSnapshotFile[] {
    const exactFile = exact.get(requestedPath);
    if (exactFile) return Object.freeze([exactFile]);
    const prefix = `${requestedPath}/`, start = lowerBound(ordered, prefix);
    const directory: ReviewSnapshotFile[] = [];
    for (let index = start; index < ordered.length; index += 1) {
      const file = ordered[index] as ReviewSnapshotFile;
      if (!file.path.startsWith(prefix)) break;
      directory.push(file);
    }
    if (directory.length > 0) return Object.freeze(directory);
    const suffixPrefix = `${reversePath(requestedPath)}/`, suffixStart = lowerBoundSuffix(bySuffix, suffixPrefix);
    const matches: ReviewSnapshotFile[] = [];
    for (let index = suffixStart; index < bySuffix.length; index += 1) {
      const entry = bySuffix[index] as Readonly<{ key: string; file: ReviewSnapshotFile }>;
      if (!entry.key.startsWith(suffixPrefix)) break;
      matches.push(entry.file);
      if (matches.length > 1) return Object.freeze([]);
    }
    return matches.length === 1 ? Object.freeze(matches) : Object.freeze([]);
  } });
}
