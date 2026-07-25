type RedisRecord = Record<string, any>;

export interface RedisStreamEntry {
  id: string;
  data: RedisRecord;
}

export interface BlockingRedisStreamReaderOptions {
  createClient: () => RedisRecord;
  stream: string;
  blockMs: number;
  startId: string;
}

function fieldValue(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function decodeEntry(rawEntry: unknown): RedisStreamEntry | null {
  if (!Array.isArray(rawEntry) || typeof rawEntry[0] !== 'string' || !Array.isArray(rawEntry[1])) return null;
  const data: RedisRecord = {};
  for (let index = 0; index < rawEntry[1].length; index += 2) {
    data[String(rawEntry[1][index])] = fieldValue(rawEntry[1][index + 1]);
  }
  return { id: rawEntry[0], data };
}

function decodeXread(result: unknown): RedisStreamEntry[] {
  if (!Array.isArray(result)) return [];
  const decoded: RedisStreamEntry[] = [];
  for (const streamResult of result) {
    const entries = Array.isArray(streamResult?.[1]) ? streamResult[1] : [];
    for (const rawEntry of entries) {
      const entry = decodeEntry(rawEntry);
      if (entry) decoded.push(entry);
    }
  }
  return decoded;
}

export function createBlockingRedisStreamReader(options: BlockingRedisStreamReaderOptions) {
  let lastId = options.startId;
  let client: RedisRecord | null = null;
  let ready = false;

  function redis(): RedisRecord {
    if (client) return client;
    client = options.createClient();
    client.on?.('error', () => {});
    return client;
  }

  async function ensureReady(): Promise<RedisRecord> {
    const current = redis();
    if (ready) return current;
    const status = typeof current.status === 'string' ? current.status : '';
    if (typeof current.connect === 'function' && status !== 'ready') await current.connect();
    if (typeof current.ping === 'function') await current.ping();
    ready = true;
    return current;
  }

  return {
    async read(): Promise<RedisStreamEntry[]> {
      const current = await ensureReady();
      const result = await current.xread(
        'BLOCK', String(options.blockMs), 'COUNT', '10', 'STREAMS', options.stream, lastId,
      );
      const entries = decodeXread(result);
      for (const entry of entries) lastId = entry.id || lastId;
      return entries;
    },
    close(): void {
      if (!client) return;
      const current = client;
      client = null;
      ready = false;
      try {
        if (typeof current.disconnect === 'function') current.disconnect();
        else void current.quit?.().catch?.(() => {});
      } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(fallback_reporting_failed): the authoritative operation must survive failure of this noncritical reporting channel. */
        // Closing an already-closed telemetry reader is intentionally idempotent.
      }
    },
  };
}
