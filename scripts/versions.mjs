import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateInfrastructureChartLock } from './infrastructure-chart.mjs';

// Native files remain directly buildable. Only their version fields are generated.
// Compute and validate every change before writing any file.
export function versionOutputs(root) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const manifest = JSON.parse(read('versions.json'));
  if (manifest.schemaVersion !== 1 || !/^\d{4}\.\d+\.\d+(?:-\d+)?$/.test(manifest.openclaw?.version)
    || !/^sha256:[a-f0-9]{64}$/.test(manifest.openclaw?.digest)) throw new Error('Invalid OpenClaw version manifest');
  for (const key of ['OPENCLAW_BASE', 'OPENCLAW_PLUGIN_VERSION']) {
    if (Object.hasOwn(manifest.buildArgs, key)) throw new Error(`OpenClaw must have one authority: ${key}`);
  }
  const args = { ...manifest.buildArgs,
    OPENCLAW_BASE: `ghcr.io/openclaw/openclaw:${manifest.openclaw.version}@${manifest.openclaw.digest}`,
    OPENCLAW_PLUGIN_VERSION: manifest.openclaw.version };
  const validate = entries => {
    for (const [key, value] of Object.entries(entries)) {
      if (!/^[A-Z][A-Z0-9_]+$/.test(key) || typeof value !== 'string' || !/^[a-zA-Z0-9.:/@_-]+$/.test(value))
        throw new Error(`Invalid version field: ${key}`);
      if (key.includes('SHA256') && !/^[a-f0-9]{64}$/.test(value)) throw new Error(`Invalid checksum: ${key}`);
      if (key.endsWith('_BASE') && !/@sha256:[a-f0-9]{64}$/.test(value)) throw new Error(`Unpinned base image: ${key}`);
    }
  };
  validate(args);
  const outputs = new Map();
  const used = new Set();
  const dockerfiles = new Map(fs.readdirSync(path.join(root, 'docker')).filter(file => file.startsWith('Dockerfile.')).sort()
    .map(file => [file.slice('Dockerfile.'.length), `docker/${file}`]));
  dockerfiles.set('ops-pod', 'ops/pod/Dockerfile');
  dockerfiles.set('ops-mcp', 'tools/ops-mcp/Dockerfile');
  for (const [image, overrides] of Object.entries(manifest.imageOverrides ?? {})) {
    if (!dockerfiles.has(image)) throw new Error(`Unknown image override: ${image}`);
    if (Object.keys(overrides).some(key => key.startsWith('OPENCLAW_'))) throw new Error('OpenClaw versions must match across roles');
    validate(overrides);
  }
  for (const [image, name] of dockerfiles) {
    const overrides = manifest.imageOverrides?.[image] ?? {};
    const usedOverrides = new Set();
    const content = read(name).replace(/^ARG ([A-Z0-9_]+)=(\S+)$/gm, (line, key) => {
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
    outputs.set(name, content);
  }
  for (const key of Object.keys(args)) if (!used.has(key)) throw new Error(`Unused central version: ${key}`);
  const replaceOne = (file, regex, replacement, expectedCount = 1) => {
    const source = outputs.get(file) ?? read(file);
    if ([...source.matchAll(new RegExp(regex.source, 'gm'))].length !== expectedCount) throw new Error(`${file}: version field missing or ambiguous`);
    outputs.set(file, source.replace(new RegExp(regex.source, 'gm'), replacement));
  };
  replaceOne('scripts/deploy.sh', /^BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE="[^"\n]+"$/m,
    `BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE="${'${BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE:-'}${manifest.imageOverrides?.['buster-runtime']?.BUILDKIT_BASE ?? args.BUILDKIT_BASE}}"`);
  for (const reference of [...Object.values(manifest.infrastructure ?? {}), ...Object.values(manifest.automation ?? {})]) {
    if (typeof reference !== 'string' || !/^[a-z0-9./_-]+:[a-zA-Z0-9._-]+@sha256:[a-f0-9]{64}$/.test(reference))
      throw new Error('Infrastructure and automation images require exact tags and digests');
  }
  for (const name of ['tailscale', 'qdrant']) validateInfrastructureChartLock(manifest.infrastructureCharts?.[name]);
  for (const [section, key] of [['operatorConfig', 'tailscaleOperator'], ['proxyConfig', 'tailscaleProxy']]) {
    const reference = manifest.infrastructure[key].match(/^(.+):([^:@]+)@(sha256:[a-f0-9]{64})$/);
    replaceOne('my-values/infra/tailscale-operator-values.yaml',
      new RegExp(`^${section}:\\n  image:\\n    repository: [^\\n]+\\n    digest: [^\\n]+`, 'm'),
      `${section}:\n  image:\n    repository: ${reference[1]}\n    digest: ${reference[3]}`);
  }
  const qdrant = manifest.infrastructure.qdrant.match(/^(.+):([^:@]+)@(sha256:[a-f0-9]{64})$/);
  replaceOne('my-values/infra/qdrant-values.yaml', /^  repository: [^\n]+$/m, `  repository: ${qdrant[1]}`);
  replaceOne('my-values/infra/qdrant-values.yaml', /^  tag: [^\n]+$/m, `  tag: ${qdrant[2]}`);
  replaceOne('my-values/infra/qdrant-values.yaml', /^    image: [^\n]+$/m, `    image: ${manifest.infrastructure.qdrantTest}`);
  replaceOne('my-values/infra/registry-mirror.yaml', /^          image: [^\n]+$/m,
    `          image: ${manifest.infrastructure.registryMirror}`);
  const envoy = manifest.infrastructure.envoy.match(/^(.+):([^:@]+)@(sha256:[a-f0-9]{64})$/);
  for (const file of ['charts/kubeclaw/values.yaml', 'charts/prism/values.yaml']) {
    replaceOne(file, /^      repository: envoyproxy\/envoy$/m, `      repository: ${envoy[1]}`);
    replaceOne(file, /^      tag: v[0-9.]+$/m, `      tag: ${envoy[2]}`);
    replaceOne(file, /^      digest: "[^"]*"$/m, `      digest: "${envoy[3]}"`);
  }
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
}
