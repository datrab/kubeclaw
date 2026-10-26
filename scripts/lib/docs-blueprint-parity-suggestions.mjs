import fs from 'node:fs';
import path from 'node:path';

// Author decisions supply suggestions only. This helper never approves claims,
// reference removal or deletion, and never writes the human-owned decision.
export function authoredParitySuggestion(root, originalPath, canonicalPages, sourceBindings) {
  if (!originalPath.startsWith('docs/') || originalPath.includes('\\')
    || path.posix.normalize(originalPath) !== originalPath) {
    throw new Error('Parity suggestion requires a normalized docs source path');
  }
  const relative = originalPath.slice('docs/'.length);
  const file = path.join(root, 'docs/config/documentation-parity', `${relative}.json`);
  // Inspect components without following links, including dangling symlinks.
  let component = path.resolve(root);
  for (const part of path.relative(component, file).split(path.sep)) {
    component = path.join(component, part);
    let stat;
    try { stat = fs.lstatSync(component); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (stat.isSymbolicLink()) throw new Error('Parity suggestion requires a regular author path; contains a symlink');
  }
  if (!fs.lstatSync(file).isFile()) throw new Error('Parity suggestion requires a regular author decision');
  const decision = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (decision.schemaVersion !== 'kubeclaw-documentation-parity-decision.v1') return null;
  const binding = sourceBindings.get(originalPath);
  const keys = ['originalPath', 'legacyPath', 'baselineRevision', 'gitObject', 'extractionDigest'];
  if (!binding || binding.legacyPath !== `docs/_legacy-source/${relative}`
    || keys.some(key => typeof binding[key] !== 'string' || decision.source?.[key] !== binding[key])
    || decision.source?.classification !== 'legacy-extraction-source' || !Array.isArray(decision.claims)
    || decision.claims.length === 0) {
    throw new Error('Parity suggestion source binding or claims are invalid');
  }
  if (decision.claims.some(claim => !['mapped', 'omitted'].includes(claim.disposition))) return null;
  const targets = new Set();
  for (const claim of decision.claims) {
    if (!Array.isArray(claim.targets)) throw new Error('Parity suggestion targets are invalid');
    if (claim.disposition === 'omitted' && claim.targets.length) {
      throw new Error('An omitted parity claim cannot supply a canonical target');
    }
    if (claim.disposition === 'mapped' && claim.targets.length === 0) {
      throw new Error('A mapped parity claim needs a canonical target');
    }
    for (const target of claim.targets) {
      if (!canonicalPages.has(target.path)) throw new Error('Parity suggestion target is not a canonical page');
      targets.add(target.path);
    }
  }
  return ['author-parity-proposal', [...targets].sort().join('; ') || 'Author proposes no canonical replacement',
    'Use the explicit per-claim author decision; independent content, reference and deletion approval remain required.'];
}
