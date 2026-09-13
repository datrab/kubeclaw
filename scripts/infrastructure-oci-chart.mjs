import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const maximumBytes = 32 * 1024 * 1024;
export function parseInfrastructureOciChart(value) {
  const url = new URL(value);
  const match = url.pathname.match(/^\/(bitnamicharts\/[a-z][a-z0-9-]*)@(sha256:[a-f0-9]{64})$/);
  if (url.protocol !== 'oci:' || url.hostname !== 'registry-1.docker.io' || url.port || url.username || url.password
    || url.search || url.hash || !match) throw new Error('INFRASTRUCTURE_OCI_CHART_URL_INVALID');
  return { repository: match[1], digest: match[2] };
}

function request(url, token, output) {
  const config = token ? `header = ${JSON.stringify(`Authorization: Bearer ${token}`)}\n` : '';
  return execFileSync('curl', ['--config', '-', '--fail', '--silent', '--show-error', '--location', '--proto', '=https',
    '--proto-redir', '=https', '--max-time', '180', '--max-filesize', String(output ? maximumBytes : 1048576),
    '--header', 'Accept: application/vnd.oci.image.manifest.v1+json', ...(output ? ['--output', output] : []), url],
  { input: config, maxBuffer: 1048576, stdio: ['pipe', 'pipe', 'pipe'] });
}

/** Fetch the immutable OCI manifest and its one Helm content layer, never a tag. */
export function downloadInfrastructureOciChart(value, output) {
  const { repository, digest } = parseInfrastructureOciChart(value);
  const tokenUrl = new URL('https://auth.docker.io/token');
  tokenUrl.searchParams.set('service', 'registry.docker.io');
  tokenUrl.searchParams.set('scope', `repository:${repository}:pull`);
  const token = JSON.parse(request(tokenUrl.href)).token;
  if (typeof token !== 'string' || !/^[A-Za-z0-9._-]+$/.test(token)) throw new Error('INFRASTRUCTURE_OCI_TOKEN_INVALID');
  const origin = `https://registry-1.docker.io/v2/${repository}`;
  const bytes = request(`${origin}/manifests/${digest}`, token);
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== digest) throw new Error('INFRASTRUCTURE_OCI_MANIFEST_DIGEST_MISMATCH');
  const manifest = JSON.parse(bytes);
  const layers = manifest.layers?.filter(layer => layer.mediaType === 'application/vnd.cncf.helm.chart.content.v1.tar+gzip');
  if (manifest.schemaVersion !== 2 || layers?.length !== 1) throw new Error('INFRASTRUCTURE_OCI_CHART_LAYER_REQUIRED');
  const layer = layers[0];
  if (!/^sha256:[a-f0-9]{64}$/.test(layer.digest) || !Number.isSafeInteger(layer.size) || layer.size < 1 || layer.size > maximumBytes) {
    throw new Error('INFRASTRUCTURE_OCI_CHART_LAYER_INVALID');
  }
  request(`${origin}/blobs/${layer.digest}`, token, output);
  const downloaded = fs.readFileSync(output);
  if (downloaded.length !== layer.size || `sha256:${createHash('sha256').update(downloaded).digest('hex')}` !== layer.digest) {
    throw new Error('INFRASTRUCTURE_OCI_CHART_LAYER_DIGEST_MISMATCH');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw new Error('Usage: infrastructure-oci-chart.mjs IMMUTABLE_OCI_URL OUTPUT');
  downloadInfrastructureOciChart(process.argv[2], process.argv[3]);
}
