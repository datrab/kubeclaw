import { isDeepStrictEqual } from 'node:util';
import { componentSource } from './runtime-components.mjs';

// Any chart/value change requires the full renderer. Exporter/workflow changes
// themselves are not role configuration and do not require rerendering Prism.
export const isRuntimeRenderConfiguration = file => /^(?:charts\/(?:kubeclaw|prism)\/|my-values\/|gitops\/production\/(?:config\.json$|overlays\/))/u.test(file);

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
  if (!names.filter(name => name !== 'buster-runtime').every(name => unchangedImage(prior, next, name))) return 'export';
  if (!['nova', 'prism'].every(role => unchangedBundle(prior.code, next.code, role))) return 'export';
  return 'export-buster';
}
