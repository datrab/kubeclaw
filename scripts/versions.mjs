import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateInfrastructureChartLock } from './infrastructure-chart-lock.mjs';
import { checkRuntimeToolLocks } from './runtime-tool-locks.mjs';

function validateVersionEntries(entries) {
    for (const [key, value] of Object.entries(entries)) {
      if (!/^[A-Z][A-Z0-9_]+$/.test(key) || typeof value !== 'string' || !/^[a-zA-Z0-9.:/@_-]+$/.test(value))
        throw new Error(`Invalid version field: ${key}`);
      if (key.includes('SHA256') && !/^[a-f0-9]{64}$/.test(value)) throw new Error(`Invalid checksum: ${key}`);
      if (key.endsWith('_BASE') && !/@sha256:[a-f0-9]{64}$/.test(value)) throw new Error(`Unpinned base image: ${key}`);
    }
}

function versionArguments(manifest) {
  if (manifest.schemaVersion !== 1 || !/^\d{4}\.\d+\.\d+(?:-\d+)?$/.test(manifest.openclaw?.version)
    || !/^sha256:[a-f0-9]{64}$/.test(manifest.openclaw?.digest)) throw new Error('Invalid OpenClaw version manifest');
  for (const key of ['OPENCLAW_BASE', 'OPENCLAW_PLUGIN_VERSION']) {
    if (Object.hasOwn(manifest.buildArgs, key)) throw new Error(`OpenClaw must have one authority: ${key}`);
  }
  const args = { ...manifest.buildArgs,
    OPENCLAW_BASE: `ghcr.io/openclaw/openclaw:${manifest.openclaw.version}@${manifest.openclaw.digest}`,
    OPENCLAW_PLUGIN_VERSION: manifest.openclaw.version };
  validateVersionEntries(args);
  return args;
}

function dockerfileVersions(name, source, args, overrides, used) {
    const usedOverrides = new Set();
    const content = source.replace(/^ARG ([A-Z0-9_]+)=(\S+)$/gm, (line, key) => {
      if (['KUBECLAW_BUILD_REVISION', 'TARGETARCH'].includes(key)) return line;
      if (name === 'docker/Dockerfile.buster-runtime' && key === 'TRIVY_DATABASE_REFRESH') return line;
      if (!Object.hasOwn(args, key)) throw new Error(`${name}: unmanaged version argument ${key}`);
      used.add(key);
      if (Object.hasOwn(overrides, key)) usedOverrides.add(key);
      return `ARG ${key}=${overrides[key] ?? args[key]}`;
    });
    for (const key of Object.keys(overrides)) if (!usedOverrides.has(key)) throw new Error(`${name}: unused override ${key}`);
    for (const match of content.matchAll(/^FROM (\S+)/gm)) {
      if (!/^\$\{[A-Z0-9_]+\}$/.test(match[1])) throw new Error(`${name}: base must reference a managed ARG`);
      if (!Object.hasOwn(args, match[1].slice(2, -1))) throw new Error(`${name}: unknown base argument`);
    }
  return content;
}

function bindDockerVersions(root, manifest, args, read, outputs) {
  const used = new Set();
  const dockerfiles = new Map(fs.readdirSync(path.join(root, 'docker')).filter(file => file.startsWith('Dockerfile.')).sort()
    .map(file => [file.slice('Dockerfile.'.length), `docker/${file}`]));
  dockerfiles.set('ops-pod', 'ops/pod/Dockerfile');
  dockerfiles.set('ops-mcp', 'tools/ops-mcp/Dockerfile');
  for (const [image, overrides] of Object.entries(manifest.imageOverrides ?? {})) {
    if (!dockerfiles.has(image)) throw new Error(`Unknown image override: ${image}`);
    if (Object.keys(overrides).some(key => key.startsWith('OPENCLAW_'))) throw new Error('OpenClaw versions must match across roles');
    validateVersionEntries(overrides);
  }
  for (const [image, name] of dockerfiles) {
    outputs.set(name, dockerfileVersions(name, read(name), args, manifest.imageOverrides?.[image] ?? {}, used));
  }
  for (const key of Object.keys(args)) if (!used.has(key)) throw new Error(`Unused central version: ${key}`);
}

function bindInfrastructureVersions(manifest, replaceOne) {
  for (const [name, chart] of Object.entries({ prometheus: 'kube-prometheus-stack', loki: 'loki', alloy: 'alloy', promtail: 'promtail' })) {
    const version = manifest.monitoringCharts?.[name]?.version;
    if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error(`Invalid monitoring chart version: ${name}`);
    replaceOne(`gitops/platform/bootstrap/${name}.yaml`, new RegExp(`chart: ${chart}\\n      targetRevision: [^\\n]+`),
      `chart: ${chart}\n      targetRevision: ${version}`);
  }

  for (const name of ['redis', 'postgresql']) {
    const selected = manifest[`${name}Production`];
    const image = selected?.image?.match(/^(registry-1\.docker\.io)\/(bitnami\/(?:redis|postgresql)):([a-zA-Z0-9._-]+)@(sha256:[a-f0-9]{64})$/);
    if (!image || image[2] !== `bitnami/${name}` || !/^\d+\.\d+\.\d+$/.test(selected?.chartVersion ?? '')) throw new Error(`Invalid production ${name} chart version or image digest`);
    replaceOne(`gitops/platform/values/${name}.yaml`, /^image:\n  registry: [^\n]+\n  repository: [^\n]+\n  tag: [^\n]+\n  digest: [^\n]+/m,
      `image:\n  registry: ${image[1]}\n  repository: ${image[2]}\n  tag: ${image[3]}\n  digest: ${image[4]}`);
    replaceOne(`gitops/platform/bootstrap/${name}.yaml`, new RegExp(`chart: ${name}\\n      targetRevision: [^\\n]+`),
      `chart: ${name}\n      targetRevision: ${selected.chartVersion}`);
  }

  for (const reference of [...Object.values(manifest.infrastructure ?? {}), ...Object.values(manifest.automation ?? {})]) {
    if (typeof reference !== 'string' || !/^[a-z0-9./_-]+:[a-zA-Z0-9._-]+@sha256:[a-f0-9]{64}$/.test(reference))
      throw new Error('Infrastructure and automation images require exact tags and digests');
  }
  for (const name of ['tailscale', 'redis', 'postgresql']) validateInfrastructureChartLock(manifest.infrastructureCharts?.[name]);
  for (const name of ['redis', 'postgresql']) {
    const reference = manifest.infrastructure[name].match(/^([^/]+)\/(.+):([^:@]+)@(sha256:[a-f0-9]{64})$/);
    replaceOne(`my-values/infra/${name}-values.yaml`, /^image:\n  registry: [^\n]+\n  repository: [^\n]+\n  tag: [^\n]+\n  digest: [^\n]+/m,
      `image:\n  registry: ${reference[1]}\n  repository: ${reference[2]}\n  tag: ${reference[3]}\n  digest: ${reference[4]}`);
  }
  for (const [section, key] of [['operatorConfig', 'tailscaleOperator'], ['proxyConfig', 'tailscaleProxy']]) {
    const reference = manifest.infrastructure[key].match(/^(.+):([^:@]+)@(sha256:[a-f0-9]{64})$/);
    replaceOne('my-values/infra/tailscale-operator-values.yaml',
      new RegExp(`^${section}:\\n  image:\\n    repository: [^\\n]+\\n    digest: [^\\n]+`, 'm'),
      `${section}:\n  image:\n    repository: ${reference[1]}\n    digest: ${reference[3]}`);
  }
  replaceOne('my-values/infra/registry-mirror.yaml', /^          image: [^\n]+$/m,
    `          image: ${manifest.infrastructure.registryMirror}`);
  const envoy = manifest.infrastructure.envoy.match(/^(.+):([^:@]+)@(sha256:[a-f0-9]{64})$/);
  for (const file of ['charts/kubeclaw/values.yaml', 'charts/prism/values.yaml']) {
    replaceOne(file, /^      repository: envoyproxy\/envoy$/m, `      repository: ${envoy[1]}`);
    replaceOne(file, /^      tag: v[0-9.]+$/m, `      tag: ${envoy[2]}`);
    replaceOne(file, /^      digest: "[^"]*"$/m, `      digest: "${envoy[3]}"`);
  }
}

function bindApplicationVersions(manifest, args, replaceOne) {
  replaceOne('charts/kubeclaw/Chart.yaml', /^appVersion:.*$/m, `appVersion: "${manifest.openclaw.version}"`);
  for (const plugin of ['acpx', 'discord']) replaceOne('charts/kubeclaw/values.yaml',
    new RegExp(`^    - "npm:@openclaw/${plugin}@[^"\\n]+"$`, 'm'), `    - "npm:@openclaw/${plugin}@${manifest.openclaw.version}"`);
  replaceOne('charts/kubeclaw/files/config/lint-policy.json', /"kubernetes_version": "[^"]+"/,
    `"kubernetes_version": "${args.KUBECTL_VERSION}"`);
  replaceOne('charts/kubeclaw/files/config/lint-policy.json', /"schema_location": "[^"]+"/,
    `"schema_location": "/opt/kubeclaw-kubernetes-schemas/v${args.KUBECTL_VERSION}-standalone-strict/{{.ResourceKind}}{{.KindSuffix}}.json"`);
  replaceOne('skills/common/plugins/openclaw-agent-observer/package.json', /"openclawVersion": "[^"]+"/,
    `"openclawVersion": "${manifest.openclaw.version}"`);
  replaceOne('.github/workflows/build-ops-mcp.yaml', /^          version: v\d+\.\d+\.\d+$/m,
    `          version: ${manifest.imageOverrides['ops-pod'].HELM_VERSION}`, 2);
  replaceOne('.github/workflows/update-checks.yaml', /^          version: v\d+\.\d+\.\d+$/m,
    `          version: v${args.HELM_VERSION}`);
  replaceOne('.github/workflows/pipeline-reliability.yaml', /^          version: v\d+\.\d+\.\d+$/m,
    `          version: v${args.HELM_VERSION}`);
  for (const [shellKey, key] of [['TRIVY_VERSION', 'TRIVY_VERSION'], ['TRIVY_AMD64_SHA256', 'TRIVY_SHA256_AMD64'], ['TRIVY_ARM64_SHA256', 'TRIVY_SHA256_ARM64']])
    replaceOne('scripts/scan-runtime-images.sh', new RegExp(`^readonly ${shellKey}="[^"]+"$`, 'm'), `readonly ${shellKey}="${args[key]}"`);
}

function bindRuntimeToolInputs(manifest, args, outputs) {
  const tools = [['RUFF_VERSION', 'ruff'], ['MYPY_VERSION', 'mypy'], ['PIP_AUDIT_VERSION', 'pip-audit']];
  const requirements = entries => '# Generated from versions.json; use scripts/versions.mjs\n'
    + entries.map(([name, version]) => `${name}==${version}\n`).join('');
  const common = tools.map(([key, name]) => [name, args[key]]);
  outputs.set('docker/python-tools/common.in', requirements(common));
  outputs.set('docker/python-tools/semgrep-nova.in', requirements([['semgrep', args.SEMGREP_VERSION]]));
  outputs.set('docker/python-tools/buster.in', requirements([...common,
    ['semgrep', manifest.imageOverrides['buster-runtime'].SEMGREP_VERSION ?? args.SEMGREP_VERSION]]));
  outputs.set('docker/go-tools/requirements.json', JSON.stringify(Object.fromEntries(
    ['GO_VERSION', 'STATICCHECK_VERSION', 'GOVULNCHECK_VERSION', 'GOCYCLO_VERSION'].map(key => [key, args[key]])), null, 2) + '\n');
}

// Validate all generated version fields before writing any file.
export function versionOutputs(root) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const manifest = JSON.parse(read('versions.json'));
  const args = versionArguments(manifest);
  const outputs = new Map();
  bindDockerVersions(root, manifest, args, read, outputs);
  const replaceOne = (file, regex, replacement, expectedCount = 1) => {
    const source = outputs.get(file) ?? read(file);
    if ([...source.matchAll(new RegExp(regex.source, 'gm'))].length !== expectedCount) throw new Error(`${file}: version field missing or ambiguous`);
    outputs.set(file, source.replace(new RegExp(regex.source, 'gm'), replacement));
  };
  replaceOne('scripts/deploy.sh', /^BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE="[^"\n]+"$/m,
    `BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE="${'${BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE:-'}${manifest.imageOverrides?.['buster-runtime']?.BUILDKIT_BASE ?? args.BUILDKIT_BASE}}"`);
  bindInfrastructureVersions(manifest, replaceOne);
  bindApplicationVersions(manifest, args, replaceOne);
  bindRuntimeToolInputs(manifest, args, outputs);
  return outputs;
}

export function syncVersions(root, check = true) {
  const outputs = versionOutputs(root);
  const changed = [...outputs].filter(([file, content]) => fs.readFileSync(path.join(root, file), 'utf8') !== content);
  if (check && changed.length) throw new Error(`Version drift; run npm run versions:sync:\n${changed.map(([file]) => file).join('\n')}`);
  if (!check) for (const [file, content] of changed) fs.writeFileSync(path.join(root, file), content);
  return { checked: outputs.size, changed: changed.map(([file]) => file) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || !['--check', '--write'].includes(process.argv[2])) throw new Error('Usage: node scripts/versions.mjs --check|--write');
  console.log(JSON.stringify(syncVersions(fileURLToPath(new URL('../', import.meta.url)), process.argv[2] === '--check')));
  if (process.argv[2] === '--check') console.log(JSON.stringify(checkRuntimeToolLocks()));
}
