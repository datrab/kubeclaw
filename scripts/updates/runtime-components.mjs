import { execFileSync } from 'node:child_process';

export const runtimeImages = ['nova', 'prism-agent', 'buster-gateway', 'buster-runtime', 'namespace-controller', 'archviewer', 'prism-control', 'prism-studio', 'prism-worker', 'prism-ingestion'];
export const runtimeRoles = ['nova', 'buster', 'prism'];
const observer = ['tsconfig.base.json', 'contracts/agent-observability/v1/', 'skills/common/plugins/openclaw-agent-observer/'];
const workspace = ['package.json', 'package-lock.json', 'tsconfig.base.json', 'contracts/', 'skills/prism/', 'skills/worker/core/', 'skills/common/plugin-runtime/'];
// Include source used by build/acceptance stages as well as the final image.
// COPY . in Prism stages installs workspaces; all workspace manifests affect npm ci.
const inputs = {
  nova: [...observer, 'docker/nova-tools/', 'docker/python-tools/common.txt', 'docker/python-tools/semgrep-nova.txt', 'docker/go-tools/'],
  'buster-gateway': [...observer, 'docker/openclaw-tools/'],
  'buster-runtime': ['package.json', 'package-lock.json', 'contracts/', 'skills/', 'scripts/build-plugin-sandbox.mjs', 'scripts/registry-client-config.mjs', 'docker/python-tools/buster.txt', 'docker/buster-runtime-entrypoint.sh', 'tests/verification/contracts/check-pipeline-container-build-production.mts', 'tests/verification/contracts/check-pipeline-container-build-recovery.mts'],
  'namespace-controller': ['go.mod', 'go.sum', 'cmd/buster-namespace-controller/'],
  archviewer: ['docker/archviewer.nginx.conf'],
  'prism-agent': [...observer, ...workspace, 'docker/openclaw-tools/'],
  'prism-control': [...workspace, 'tests/verification/live/'],
  'prism-studio': workspace,
  'prism-worker': workspace,
  'prism-ingestion': workspace,
};
const under = (file, source) => source.endsWith('/') ? file.startsWith(source) : file === source;
export function imageInput(name, file) {
  if (!inputs[name]) throw new Error(`UNKNOWN_RUNTIME_IMAGE:${name}`);
  return file === `docker/Dockerfile.${name}` || file === '.dockerignore' || file === 'versions.json'
    || file === 'scripts/versions.mjs'
    || inputs[name].some(source => under(file, source))
    || (name.startsWith('prism-') && /^skills\/.*\/package(?:-lock)?\.json$/u.test(file));
}
export function componentSource(receipt, component, kind) {
  return (kind === 'image' ? receipt.imageSources?.[component] : receipt.bundles?.[component]?.source) ?? {
    commit: receipt.commit, sourceRunId: receipt.sourceRunId, sourceRunAttempt: receipt.sourceRunAttempt,
  };
}
export function validSource(source) {
  return source && /^[a-f0-9]{40}$/u.test(source.commit)
    && Number.isSafeInteger(source.sourceRunId) && source.sourceRunId > 0
    && Number.isSafeInteger(source.sourceRunAttempt) && source.sourceRunAttempt > 0;
}
const cache = new Map();
export function bundleInput(root, revision, role) {
  const key = JSON.stringify([root, revision, role]);
  if (cache.has(key)) return cache.get(key);
  const read = file => JSON.parse(execFileSync('git', ['-C', root, 'show', `${revision}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  const ownership = read('packaging/runtime/package-ownership.json');
  const manifest = read(`packaging/runtime/roles/${role}.json`);
  const sources = manifest.packages.map(id => {
    const entry = ownership.packages.find(item => item.id === id);
    if (!entry) throw new Error(`UNKNOWN_RUNTIME_PACKAGE:${id}`);
    return entry.bundle.kind === 'entrypoint' ? `${entry.source}/${manifest.entrypoint.path}` : `${entry.source}/`;
  });
  const plugins = execFileSync('git', ['-C', root, 'ls-tree', '-r', '--name-only', revision, '--', 'skills'], { encoding: 'utf8' })
    .split('\n').filter(file => /^skills\/(?:common|nova|buster|prism)\/plugins\/[^/]+\/plugin.json$/u.test(file));
  const found = new Set();
  for (const file of plugins) {
    const plugin = read(file);
    if (manifest.plugins.includes(plugin.id)) { sources.push(file.slice(0, -'plugin.json'.length)); found.add(plugin.id); }
  }
  for (const id of manifest.plugins) if (!found.has(id)) throw new Error(`UNKNOWN_RUNTIME_PLUGIN:${id}`);
  for (const extension of manifest.extensions) {
    if (extension !== 'kubeclaw-agent-observer') throw new Error(`UNKNOWN_RUNTIME_EXTENSION:${extension}`);
    sources.push('skills/common/plugins/openclaw-agent-observer/', 'contracts/agent-observability/v1/');
  }
  const predicate = file => sources.some(source => under(file, source))
    || ['package.json', 'package-lock.json', 'tsconfig.base.json', 'packaging/runtime/package-ownership.json', `packaging/runtime/roles/${role}.json`,
      'scripts/package-agent-skill-bundle.sh', 'scripts/build-runtime-role-bundle.mjs', 'scripts/check-runtime-role-manifests.mjs', 'scripts/build-plugin-sandbox.mjs'].includes(file);
  cache.set(key, predicate);
  return predicate;
}
