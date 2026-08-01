export function normalizePositiveInteger(value: unknown, field: string): number {
  if (value === undefined || value === null) throw new Error(`gitPushWithRetry ${field} is required`);
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) throw new Error(`gitPushWithRetry ${field} must be a positive integer`);
  return numeric;
}
export function normalizeNonNegativeNumber(value: unknown, field: string): number {
  if (value === undefined || value === null) throw new Error(`gitPushWithRetry ${field} is required`);
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error(`gitPushWithRetry ${field} must be a non-negative number`);
  return numeric;
}
export function normalizeScopedAddPaths(addPaths: unknown): string[] {
  if (!Array.isArray(addPaths) || addPaths.length === 0) throw new Error('gitPushWithRetry commit mode requires non-empty opts.addPaths');
  const normalized = addPaths.map((entry: unknown) => String(entry === undefined || entry === null ? '' : entry).trim()).filter(Boolean);
  if (normalized.length !== addPaths.length) throw new Error('gitPushWithRetry opts.addPaths must not contain empty pathspecs');
  const unsafe = new Set(['.', './', ':/', '-A']);
  for (const pathspec of normalized) if (unsafe.has(pathspec) || pathspec.startsWith('-')) throw new Error(`gitPushWithRetry opts.addPaths contains unsafe broad pathspec: ${pathspec}`);
  return normalized;
}
export function normalizePushBranch(branch: unknown): string {
  if (typeof branch !== 'string') throw new Error('gitPushWithRetry branch must be a valid branch name');
  const invalid = !branch || branch.startsWith('-') || branch.startsWith('/') || branch.endsWith('/') || branch.endsWith('.')
    || branch === '@' || branch.includes('..') || branch.includes('@{') || branch.includes('//')
    || /(?:^|\/)\./.test(branch) || /(?:^|\/)[^/]+\.lock(?:\/|$)/.test(branch) || /[\s\x00-\x1f\x7f~^:?*[\\]/.test(branch);
  if (invalid) throw new Error(`gitPushWithRetry branch must be a valid branch name: ${branch}`);
  return branch;
}
