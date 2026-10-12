import net from 'node:net';
import tls from 'node:tls';
import { command, ReplyDecoder } from './resp.ts';

export interface RedisConnectionOptions { readonly url: URL; readonly timeoutMs: number; }

export async function exchange(options: RedisConnectionOptions, password: string, parts: readonly string[], signal: AbortSignal): Promise<string | number | null> {
  if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
  const socket = options.url.protocol === 'rediss:'
    ? tls.connect({ host: options.url.hostname, port: Number(options.url.port), servername: options.url.hostname })
    : net.connect({ host: options.url.hostname, port: Number(options.url.port) });
  const decoder = new ReplyDecoder();
  let settled = false;
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, value?: string | number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout); signal.removeEventListener('abort', abort); socket.destroy();
      if (error) reject(error); else resolve(value ?? null);
    };
    const abort = (): void => finish(new Error('ADAPTER_CANCELLED', { cause: signal.reason }));
    const timeout = setTimeout(() => finish(new Error('REDIS_TIMEOUT')), options.timeoutMs); timeout.unref();
    signal.addEventListener('abort', abort, { once: true });
    socket.once('error', (cause) => finish(new Error(`REDIS_CONNECTION_FAILED:${cause.message}`, { cause })));
    socket.once('end', () => finish(new Error('REDIS_CONNECTION_ENDED')));
    socket.once('close', () => finish(new Error('REDIS_CONNECTION_CLOSED')));
    socket.on('data', (chunk) => {
      if (settled) return;
      try { const reply = decoder.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); if (reply) finish(undefined, reply.value); }
      catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    });
    socket.once(options.url.protocol === 'rediss:' ? 'secureConnect' : 'connect', () => {
      if (!settled) socket.write(Buffer.concat([command(['AUTH', password]), command(parts)]));
    });
    if (signal.aborted) abort();
  });
}
