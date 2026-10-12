import { RemotePlanTransportError } from './transport-error.ts';
export function retryableStatus(status: number): boolean { return status === 408 || status === 425 || status === 429 || status >= 500; }
async function readBody(response: Response, maximum: number, prefix: string, errorBody: boolean): Promise<Buffer> {
  const reader = response.body?.getReader();
  try {
    if (!response.ok && !errorBody) throw new RemotePlanTransportError(`${prefix}_HTTP_${response.status}`, retryableStatus(response.status));
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maximum) throw new RemotePlanTransportError(`${prefix}_SIZE_EXCEEDED`, false);
    const chunks: Uint8Array[] = []; let total = 0;
    while (reader) {
      const part = await reader.read(); if (part.done) break;
      if (part.value.byteLength > maximum - total) throw new RemotePlanTransportError(`${prefix}_SIZE_EXCEEDED`, false);
      chunks.push(part.value); total += part.value.byteLength;
    }
    return Buffer.concat(chunks, total);
  } finally {
    if (reader) {
      try { await reader.cancel(); }
      catch { /* INTENTIONAL_NONCRITICAL(remote_body_cancel_failed): Keep the original response/abort error after an errored stream. */ }
      reader.releaseLock();
    }
  }
}
export async function remoteBytes(url: string, options: RequestInit, maximum: number, prefix: string, errorBody = false): Promise<{ response: Response; bytes: Buffer }> {
  try {
    const response = await fetch(url, options);
    return { response, bytes: await readBody(response, maximum, prefix, errorBody) };
  } catch (error) {
    if (error instanceof RemotePlanTransportError) throw error;
    const failurePrefix = prefix === 'NOVA_REMOTE_PLAN_RESPONSE' ? 'NOVA_REMOTE_PLAN' : prefix;
    if (options.signal?.aborted) throw new RemotePlanTransportError(`${failurePrefix}_CANCELLED`, false, options.signal.reason);
    throw new RemotePlanTransportError(`${failurePrefix}_NETWORK_ERROR`, true, error);
  }
}
