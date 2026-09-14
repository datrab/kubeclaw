const ACCEPT = ['application/vnd.oci.image.index.v1+json', 'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.docker.distribution.manifest.v2+json'].join(', ');

async function boundedBody(response, limit) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`OCI_REGISTRY_HTTP_${response.status}`);
  }
  if (!response.body || Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new Error('OCI_REGISTRY_RESPONSE_TOO_LARGE');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > limit) throw new Error('OCI_REGISTRY_RESPONSE_TOO_LARGE');
      chunks.push(part.value);
    }
    return Buffer.concat(chunks, size);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

async function blobResponse(response, fetcher, signal) {
  let current = response;
  for (let hops = 0; [301, 302, 303, 307, 308].includes(current.status); hops += 1) {
    const location = current.headers.get('location');
    await current.body?.cancel();
    if (!location || hops >= 2) throw new Error('OCI_BLOB_REDIRECT_INVALID');
    const url = new URL(location);
    if (url.protocol !== 'https:' || url.hostname !== 'pkg-containers.githubusercontent.com'
      || url.port || url.username || url.password) throw new Error('OCI_BLOB_REDIRECT_DENIED');
    // Registry authentication is never forwarded to the signed blob URL.
    current = await fetcher(url, { signal, redirect: 'manual' });
  }
  return current;
}

function validateOptions(token, timeoutMs, maximumBytes) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000
    || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 16 * 1024 * 1024) {
    throw new Error('OCI_READER_LIMIT_INVALID');
  }
  if (token !== undefined && (typeof token !== 'string' || !token || token !== token.trim() || /[\r\n]/u.test(token))) {
    throw new Error('OCI_REGISTRY_TOKEN_INVALID');
  }
}

async function anonymousToken(repository, fetcher, signal) {
  const parameters = new URLSearchParams({ service: 'ghcr.io', scope: `repository:${repository}:pull` });
  const response = await fetcher(`https://ghcr.io/token?${parameters}`, { signal, redirect: 'error' });
  const bytes = await boundedBody(response, 64 * 1024);
  let result;
  try { result = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('OCI_REGISTRY_TOKEN_INVALID'); }
  if (typeof result?.token !== 'string' || !result.token || result.token !== result.token.trim()
    || /[\r\n]/u.test(result.token)) throw new Error('OCI_REGISTRY_TOKEN_INVALID');
  return result.token;
}

/** GHCR only: a challenge cannot redirect credentials to another token service. */
export function ghcrDescriptorReader(image, { token, timeoutMs = 30_000, maximumBytes = 4 * 1024 * 1024, fetch: fetcher = globalThis.fetch } = {}) {
  const match = /^ghcr\.io\/(?<repository>[a-z0-9_-]+\/[a-z0-9][a-z0-9._-]*)@sha256:[a-f0-9]{64}$/u.exec(image);
  if (!match || image !== image.trim()) throw new Error('OCI_SELECTED_GHCR_IMAGE_REQUIRED');
  validateOptions(token, timeoutMs, maximumBytes);
  const signal = AbortSignal.timeout(timeoutMs);
  let bearer = token;
  let anonymousAttempted = false;
  return async (kind, digest) => {
    if (!['manifest', 'blob'].includes(kind) || typeof digest !== 'string' || digest.length !== 71
      || !/^sha256:[a-f0-9]{64}$/u.test(digest)) throw new Error('OCI_DESCRIPTOR_REQUEST_INVALID');
    const url = `https://ghcr.io/v2/${match.groups.repository}/${kind === 'manifest' ? 'manifests' : 'blobs'}/${digest}`;
    const request = () => fetcher(url, { signal, redirect: kind === 'blob' ? 'manual' : 'error', headers: { Accept: ACCEPT,
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) } });
    let response = await request();
    if (response.status === 401 && !bearer && !anonymousAttempted) {
      anonymousAttempted = true;
      await response.body?.cancel();
      bearer = await anonymousToken(match.groups.repository, fetcher, signal);
      response = await request();
    }
    if (kind === 'blob') response = await blobResponse(response, fetcher, signal);
    return boundedBody(response, maximumBytes);
  };
}
