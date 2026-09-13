import { randomBytes } from 'node:crypto';
import type { PrismWorkerAttempt } from './worker-results.ts';
import type { loadControlServerConfig } from '../server/control-config.ts';
import { signInternalRequest } from '../server/internal-auth.ts';

type Config = ReturnType<typeof loadControlServerConfig>;

export async function requestWorkerResult(config: Config, attempt: PrismWorkerAttempt): Promise<unknown> {
  const body = Buffer.from(JSON.stringify(attempt)); const timestamp = Date.now(); const nonce = randomBytes(16).toString('hex');
  const response = await fetch(new URL('/v1/attempts', config.workerUrl), {
    method: 'POST', body, signal: AbortSignal.timeout(config.nativeWorkerDispatchTimeoutMs),
    headers: config.spiffeEnabled ? { 'content-type': 'application/json' } : {
      'content-type': 'application/json', 'x-prism-timestamp': String(timestamp), 'x-prism-nonce': nonce,
      'x-prism-signature': `v1=${signInternalRequest(config.workerSecret, body, timestamp, nonce)}`,
    },
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Prism worker failed: ${response.status}`); }
  return boundedResult(response, config.maximumWorkerResponseBytes);
}

async function boundedResult(response: Response, maximumBytes: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('PRISM_NATIVE_RESULT_BODY_REQUIRED');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximumBytes) { await reader.cancel(); throw new Error('PRISM_NATIVE_RESULT_BODY_LIMIT'); }
      chunks.push(chunk.value);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } finally { reader.releaseLock(); }
}
