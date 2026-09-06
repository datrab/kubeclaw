import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { syncVersions } from '../versions.mjs';

// Mounted read-only from the trusted default-branch checkout, never from a bot PR.
const root = process.cwd();
const file = path.join(root, 'versions.json');
const original = fs.readFileSync(file, 'utf8');
const next = JSON.parse(original);
const before = JSON.parse(execFileSync('git', ['show', 'HEAD:versions.json'], { encoding: 'utf8' }));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function get(url, headers = {}) {
  if (new URL(url).hostname === 'api.github.com' && process.env.RENOVATE_TOKEN) headers = { ...headers, Authorization: `Bearer ${process.env.RENOVATE_TOKEN}` };
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response;
}
async function text(url) { return (await get(url)).text(); }
async function checksum(url, name) {
  const lines = (await text(url)).split('\n');
  const matches = lines.filter(line => line.trim().split(/\s+/).at(-1)?.replace(/^\*/, '') === name);
  if (matches.length !== 1 || !/^[a-f0-9]{64}\s/.test(matches[0])) throw new Error(`Missing or ambiguous checksum: ${name}`);
  return matches[0].split(/\s+/)[0];
}
async function verified(url, expected) {
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error(`Invalid checksum: ${url}`);
  const bytes = Buffer.from(await (await get(url)).arrayBuffer());
  if (sha(bytes) !== expected) throw new Error(`Checksum mismatch: ${url}`);
  return expected;
}
async function imageDigest(reference) {
  const tag = reference.split('@')[0];
  const slash = tag.indexOf('/');
  const explicit = slash >= 0 && /[.:]/.test(tag.slice(0, slash));
  let host = explicit ? tag.slice(0, slash) : 'registry-1.docker.io';
  let image = explicit ? tag.slice(slash + 1) : tag;
  if (host === 'docker.io') host = 'registry-1.docker.io';
  if (!image.includes('/')) image = `library/${image}`;
  const colon = image.lastIndexOf(':');
  if (colon < 0) throw new Error('Image tag required');
  const url = `https://${host}/v2/${image.slice(0, colon)}/manifests/${image.slice(colon + 1)}`;
  const headers = { Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' };
  let response = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  if (response.status === 401) {
    const challenge = response.headers.get('www-authenticate') ?? '';
    const fields = Object.fromEntries([...challenge.matchAll(/(realm|service|scope)="([^"]+)"/g)].map(m => [m[1], m[2]]));
    const tokenUrl = new URL(fields.realm);
    if (tokenUrl.protocol !== 'https:') throw new Error('HTTPS registry authentication required');
    for (const key of ['service', 'scope']) if (fields[key]) tokenUrl.searchParams.set(key, fields[key]);
    const token = await (await get(tokenUrl)).json();
    headers.Authorization = `Bearer ${token.token ?? token.access_token}`;
    response = await get(url, headers);
  }
  if (!response.ok) throw new Error(`Cannot resolve image: ${tag}`);
  const digest = `sha256:${sha(Buffer.from(await response.arrayBuffer()))}`;
  if (digest !== response.headers.get('docker-content-digest')) throw new Error(`Registry digest mismatch: ${tag}`);
  return digest;
}
if (next.openclaw.version !== before.openclaw.version) {
  for (const plugin of ['acpx', 'discord']) await get(`https://registry.npmjs.org/@openclaw%2f${plugin}/${next.openclaw.version}`);
  next.openclaw.digest = await imageDigest(`ghcr.io/openclaw/openclaw:${next.openclaw.version}`);
}
for (const section of ['buildArgs', 'infrastructure', 'automation']) {
  for (const [key, value] of Object.entries(next[section] ?? {})) {
    if (typeof value === 'string' && value.includes('@sha256:') && value !== before[section]?.[key]) {
      const digest = await imageDigest(value);
      if (value.split('@')[1] !== digest) throw new Error(`Updater supplied stale digest: ${key}`);
    }
  }
}
const args = next.buildArgs;
for (const tool of ['GO', 'SHFMT', 'TERRAFORM', 'TFLINT', 'TRIVY', 'KUBECTL']) {
  if (args[`${tool}_VERSION`] === before.buildArgs[`${tool}_VERSION`]) continue;
  const version = args[`${tool}_VERSION`].replace(/^v/, '');
  for (const arch of ['amd64', 'arm64']) {
    console.log(`Verifying upstream ${tool} ${version} linux/${arch}`);
    let url, digest;
    if (tool === 'GO') {
      const releases = await (await get('https://go.dev/dl/?mode=json&include=all')).json();
      const artifact = releases.find(r => r.version === `go${version}`)?.files.find(f => f.os === 'linux' && f.arch === arch && f.kind === 'archive');
      if (!artifact) throw new Error(`Go release unavailable: ${version}/${arch}`);
      url = `https://go.dev/dl/${artifact.filename}`; digest = artifact.sha256;
    } else if (tool === 'SHFMT') {
      const release = await (await get(`https://api.github.com/repos/mvdan/sh/releases/tags/v${version}`)).json();
      const asset = release.assets?.find(a => a.name === `shfmt_v${version}_linux_${arch}`);
      if (!/^sha256:[a-f0-9]{64}$/.test(asset?.digest)) throw new Error(`Missing published shfmt digest: ${version}/${arch}`);
      url = asset.browser_download_url; digest = asset.digest.slice(7);
    } else if (tool === 'KUBECTL') {
      url = `https://dl.k8s.io/release/v${version}/bin/linux/${arch}/kubectl`; digest = (await text(`${url}.sha256`)).trim();
    } else {
      const names = { TERRAFORM: `terraform_${version}_linux_${arch}.zip`, TFLINT: `tflint_linux_${arch}.zip`, TRIVY: `trivy_${version}_Linux-${arch === 'amd64' ? '64bit' : 'ARM64'}.tar.gz` };
      const bases = { TERRAFORM: `https://releases.hashicorp.com/terraform/${version}`, TFLINT: `https://github.com/terraform-linters/tflint/releases/download/v${version}`, TRIVY: `https://github.com/aquasecurity/trivy/releases/download/v${version}` };
      const lists = { TERRAFORM: `terraform_${version}_SHA256SUMS`, TFLINT: 'checksums.txt', TRIVY: `trivy_${version}_checksums.txt` };
      url = `${bases[tool]}/${names[tool]}`; digest = await checksum(`${bases[tool]}/${lists[tool]}`, names[tool]);
    }
    args[`${tool}_SHA256_${arch.toUpperCase()}`] = await verified(url, digest);
  }
}
try {
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  console.log(JSON.stringify(syncVersions(root, false)));
} catch (error) { fs.writeFileSync(file, original); throw error; }
