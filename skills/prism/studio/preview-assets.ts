import type { PrismDocument } from '@kubeclaw/prism-contracts-v1';

export type PreviewAssets = Record<string, { src: string; alt?: string }>;
const MAX_BYTES = 6_000_000;
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

async function readBounded(response: Response, remaining: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`PRISM_PREVIEW_ASSET_LOAD_FAILED:${response.status}`);
  }
  if (Number(response.headers.get('content-length')) > remaining) {
    await response.body?.cancel();
    throw new Error('PRISM_PREVIEW_ASSET_SIZE_EXCEEDED');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('PRISM_PREVIEW_ASSET_EMPTY');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > remaining) throw new Error('PRISM_PREVIEW_ASSET_SIZE_EXCEEDED');
      chunks.push(value);
    }
  } finally {
    try { await reader.cancel(); }
    finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
function dataSource(bytes: Uint8Array, mediaType: string): string {
  // Chunking avoids argument/stack limits for the bounded multi-megabyte payload.
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return `data:${mediaType};base64,${btoa(binary)}`;
}
export async function loadPreviewAssets(document: PrismDocument, signal: AbortSignal): Promise<PreviewAssets> {
  const result: PreviewAssets = {}; let total = 0;
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
  for (const [id, raw] of Object.entries(document.assets)) {
    if (!raw || typeof raw !== 'object') throw new Error(`PRISM_PREVIEW_ASSET_METADATA_INVALID:${id}`);
    const asset = raw as { kind?: string; mediaType?: string; artifact?: string; alt?: string };
    if (asset.kind !== 'image' && asset.kind !== 'icon') continue;
    if (typeof asset.mediaType !== 'string' || typeof asset.artifact !== 'string' || !imageTypes.has(asset.mediaType) || !/^artifact:sha256:[a-f0-9]{64}$/u.test(asset.artifact)) {
      throw new Error(`PRISM_PREVIEW_ASSET_METADATA_INVALID:${id}`);
    }
    boundedSignal.throwIfAborted();
    const response = await fetch(new URL(`/v1/artifacts/${asset.artifact.slice('artifact:'.length)}`, location.origin), {
      credentials: 'same-origin', redirect: 'error', signal: boundedSignal,
    });
    const bytes = await readBounded(response, MAX_BYTES - total);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (asset.artifact !== `artifact:sha256:${digest}`) throw new Error(`PRISM_PREVIEW_ASSET_INTEGRITY_FAILED:${id}`);
    total += bytes.byteLength;
    result[id] = { src: dataSource(bytes, asset.mediaType), ...(asset.alt ? { alt: asset.alt } : {}) };
  }
  boundedSignal.throwIfAborted();
  return result;
}
