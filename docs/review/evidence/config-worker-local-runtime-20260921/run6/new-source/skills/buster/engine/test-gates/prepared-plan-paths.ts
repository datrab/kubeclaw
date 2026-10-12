import path from 'node:path';

/** Production fixes the legacy root; tests may supply an isolated equivalent tree. */
function versionedSibling(legacyRoot: string): string {
  const root = path.resolve(legacyRoot);
  if (root === path.parse(root).root) throw new Error('BUSTER_STATE_ROOT_INVALID');
  return path.join(path.dirname(root), `${path.basename(root)}-v2`);
}

export function preparedPlanStateRoot(legacyRoot: string): string { return versionedSibling(legacyRoot); }
export function preparedPlanRuntimeRoot(legacyRoot: string): string { return versionedSibling(legacyRoot); }
