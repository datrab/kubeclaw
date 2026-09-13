import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadAll } from 'js-yaml';
import { stageInfrastructureChart } from './infrastructure-chart.mjs';
import { bindInfrastructureImages } from './infrastructure-image-renderer.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

/** Resolve and check both install and upgrade before the caller mutates a cluster. */
export function prepareInfrastructureRelease(name, release, namespace, values, helm = 'helm') {
  for (const [value, maximum] of [[release, 53], [namespace, 63]]) {
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value) || value.length > maximum) throw new Error('INFRASTRUCTURE_RELEASE_IDENTITY_INVALID');
  }
  const archive = stageInfrastructureChart(name);
  for (const mode of [[], ['--is-upgrade']]) {
    const output = execFileSync(helm, ['template', release, archive, '--namespace', namespace, '-f', values,
      '--post-renderer', path.join(root, 'scripts/infrastructure-image-renderer.mjs'), '--post-renderer-args', name, ...mode],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    // Helm post-renderers do not receive hooks. Also inspect the complete result
    // here, so a mutable test/init image cannot escape the deployment preflight.
    bindInfrastructureImages(name, loadAll(output).filter(Boolean));
  }
  return archive;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 6) throw new Error('Usage: infrastructure-release.mjs PROFILE RELEASE NAMESPACE VALUES');
  console.log(prepareInfrastructureRelease(...process.argv.slice(2)));
}
