import { decodeRedisStreamEntry } from './task-transport-contract.ts';

type AnyRecord = Record<string, any>;

export function adapterErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as AnyRecord).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

export function nullableObjectRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : null;
}

export function decodeRedisXreadEntries(results: unknown): AnyRecord[] {
  const decoded: AnyRecord[] = [];
  if (!Array.isArray(results)) return decoded;
  for (const streamResult of results) {
    const stream = streamResult?.[0];
    const entries = streamResult?.[1];
    if (!Array.isArray(entries)) continue;
    for (const rawEntry of entries) {
      const decodedEntry = decodeRedisStreamEntry(rawEntry);
      if (!decodedEntry) continue;
      decoded.push({ stream, id: decodedEntry.id, data: { _id: decodedEntry.id, ...decodedEntry.data } });
    }
  }
  return decoded;
}

export function attachExternalAbort(
  controller: AbortController,
  externalSignal: AbortSignal | null | undefined,
  stop: (reason: string) => void,
): () => void {
  if (!externalSignal) return () => {};
  const abort = (): void => stop('external_abort');
  if (externalSignal.aborted) controller.abort('external_abort');
  else externalSignal.addEventListener('abort', abort, { once: true });
  return () => externalSignal.removeEventListener('abort', abort);
}

function closeRedisAdapterClient(client: AnyRecord | null): void {
  if (!client) return;
  if (typeof client.disconnect === 'function') client.disconnect();
  else if (typeof client.quit === 'function') void client.quit().catch?.(() => {});
}

export function releaseRedisAdapterClient(
  client: AnyRecord | null,
  externalClient: AnyRecord | null = null,
): null {
  if (!client || client === externalClient) return null;
  try {
    closeRedisAdapterClient(client);
  } catch (_error: any) {
    // Abort cleanup is best-effort; the blocked Redis operation owns its rejection.
    void _error;
  }
  return null;
}
