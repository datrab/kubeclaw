import { execFileSync } from 'node:child_process';
import { inputDigest } from './runtime-inputs.mjs';
import { isDeepStrictEqual } from 'node:util';
import { componentSource } from './runtime-components.mjs';

// Shared chart/value changes require the full renderer; a small explicit set of
// wholly Buster-guarded templates and Buster-only values may be scoped.
export const isRuntimeRenderConfiguration = file => /^(?:charts\/(?:kubeclaw|prism)\/|my-values\/|gitops\/production\/(?:config\.json$|overlays\/))/u.test(file);

const busterTemplates = ['charts/kubeclaw/templates/buster-namespace-controller.yaml',
  'charts/kubeclaw/templates/buster-namespace-lease-crd.yaml'];
const busterInputs = new Set([...busterTemplates, 'my-values/buster-values.yaml', 'gitops/production/overlays/buster-ax41.yaml']);
export const isNonBusterRenderConfiguration = file => isRuntimeRenderConfiguration(file) && !busterInputs.has(file);

export function whollyBusterGuarded(bytes) {
  const text = bytes.trim();
  const guard = '{{- if and .Values.busterNamespaceBroker.enabled (eq .Values.agentRole "buster") -}}';
  if (!text.startsWith(guard)) return false;
  const actions = [...text.matchAll(/\{\{-?\s*([\s\S]*?)\s*-?\}\}/gu)];
  let depth = 0;
  for (const action of actions) {
    const command = action[1].trim().replace(/-$/u, '').trim().split(/\s/u)[0];
    if (['if', 'range', 'with', 'define', 'block'].includes(command)) depth++;
    if (command === 'else' && depth === 1) return false;
    if (command === 'end') depth--;
    if (depth === 0 && action.index + action[0].length !== text.length) return false;
  }
  return depth === 0 && actions.length > 1;
}

// Both revisions must keep the hard role guards. Unknown/shared chart changes
// are never inferred Buster-only merely because image receipts were retained.
export function busterRenderConfigurationCompatible(root, before, after) {
  if (inputDigest(root, before, isNonBusterRenderConfiguration) !== inputDigest(root, after, isNonBusterRenderConfiguration)) return false;
  return [before, after].every(revision => busterTemplates.every(file => {
    const bytes = execFileSync('git', ['-C', root, 'show', revision + ':' + file],
      { encoding: 'utf8', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    return whollyBusterGuarded(bytes);
  }));
}

function unchangedImage(prior, next, name) {
  return prior.images[name] === next.images[name]
    && isDeepStrictEqual(componentSource(prior, name, 'image'), componentSource(next, name, 'image'));
}
function unchangedBundle(prior, next, role) {
  return isDeepStrictEqual({ ...prior.bundles[role], source: componentSource(prior, role, 'bundle') },
    { ...next.bundles[role], source: componentSource(next, role, 'bundle') });
}

// Select only an export command, never bypass the scoped exporter's independent
// active-manifest, inventory and provenance checks before publication.
export function runtimePublicationCommand(prior, next, configurationUnchanged) {
  if (!configurationUnchanged || !prior?.code || !next?.code) return 'export';
  const names = Object.keys(prior.images);
  if (!isDeepStrictEqual(names.sort(), Object.keys(next.images).sort())) return 'export';
  if (!names.filter(name => !['buster-runtime', 'namespace-controller'].includes(name)).every(name => unchangedImage(prior, next, name))) return 'export';
  if (!['nova', 'prism'].every(role => unchangedBundle(prior.code, next.code, role))) return 'export';
  return 'export-buster';
}

// Authorization is independent of build scope: rebuilding shared inputs does
// not authorize rolling out every role that consumes them.
export function assertRuntimePublicationScope(command, authorizedScope) {
  if (!['all', 'buster'].includes(authorizedScope)) throw new Error('RUNTIME_PUBLICATION_SCOPE_REQUIRED');
  if (!['export', 'export-buster'].includes(command)) throw new Error('RUNTIME_PUBLICATION_COMMAND_INVALID');
  if (authorizedScope === 'buster' && command !== 'export-buster') throw new Error('RUNTIME_PUBLICATION_SCOPE_EXCEEDED:buster');
}
