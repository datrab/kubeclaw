export const REVIEW_IMPORT_PATTERN = /(?:import|export)\s*(?:[^'";]*?\bfrom\b\s*)?['"]([^'"\n]+)['"]|require\s*\(\s*['"]([^'"\n]+)['"]\s*\)|import\s*\(\s*['"]([^'"\n]+)['"](?=\s*(?:,|\)))/gu;

export function standaloneImportTokenAt(content: string, index: number): boolean {
  const before = content.slice(0, index), immediate = before.at(-1);
  return !(immediate && /[\p{ID_Continue}$]/u.test(immediate)) && before.trimEnd().at(-1) !== '.';
}

export function importSpecifiersFromScan(scanned: string): readonly string[] {
  return importSpecifierRecordsFromScan(scanned).map(({ specifier }) => specifier);
}

export interface ReviewImportSpecifierRecord { readonly specifier: string; readonly index: number }

export function importSpecifierRecordsFromScan(scanned: string): readonly ReviewImportSpecifierRecord[] {
  const found = new Map<string, ReviewImportSpecifierRecord>();
  for (const match of scanned.matchAll(REVIEW_IMPORT_PATTERN)) {
    let specifier = match[1];
    if (specifier === undefined) specifier = match[2];
    if (specifier === undefined) specifier = match[3];
    if (specifier && standaloneImportTokenAt(scanned, match.index) && !found.has(specifier)) {
      found.set(specifier, Object.freeze({ specifier, index: match.index }));
    }
  }
  return [...found.values()].sort((left, right) => left.specifier < right.specifier ? -1 : left.specifier > right.specifier ? 1 : 0);
}
