import { spawn } from 'node:child_process';
import type { BusterPreparationSettings } from '../../../common/plugin-runtime/foundation/config/swarm.ts';

export type ArchivePreparationLimits = Pick<BusterPreparationSettings, 'maximumExtractedBytes' | 'tarTimeoutMs'
  | 'maximumArchiveEntries' | 'maximumListingLineBytes' | 'maximumTarStderrBytes'>;

async function runTar(
  executable: string,
  args: readonly string[],
  signal: AbortSignal,
  limits: ArchivePreparationLimits,
  onLine?: (line: string) => void,
): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let fault: Error | null = null;
    let pending = '';
    let stderr = Buffer.alloc(0);
    const stop = (error: Error): void => {
      fault ??= error;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => stop(new Error('BUSTER_REMOTE_ARCHIVE_TIMEOUT')), limits.tarTimeoutMs);
    const abort = () => stop(new Error('BUSTER_REMOTE_ARCHIVE_CANCELLED'));
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      if (!onLine || fault) return;
      pending += chunk.toString('utf8');
      if (Buffer.byteLength(pending) > limits.maximumListingLineBytes) {
        stop(new Error('BUSTER_REMOTE_ARCHIVE_LISTING_EXCEEDED'));
        return;
      }
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      try { for (const line of lines) if (line) onLine(line); }
      catch (error) { stop(error instanceof Error ? error : new Error(String(error))); }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const available = Math.max(0, limits.maximumTarStderrBytes - stderr.byteLength);
      stderr = Buffer.concat([stderr, chunk.subarray(0, available)]);
    });
    child.once('error', (error) => { fault ??= error; });
    child.once('close', (code, terminationSignal) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (!fault && onLine && pending) {
        try { onLine(pending); } catch (error) { fault = error instanceof Error ? error : new Error(String(error)); }
      }
      if (fault) reject(fault);
      else if (code !== 0) reject(new Error(`BUSTER_REMOTE_TAR_FAILED:${code}:${terminationSignal ?? ''}:${stderr.toString('utf8').slice(-4096)}`));
      else resolve();
    });
  });
}

export async function checkArchiveListingOnly(
  tarExecutable: string,
  archive: string,
  target: string,
  limits: ArchivePreparationLimits,
  signal: AbortSignal,
): Promise<void> {
  let entries = 0;
  let total = 0;
  const unsafeName = (name: string): boolean => {
    if (name.startsWith('/') || name.includes('\0')) return true;
    const normalized = name.endsWith('/') ? name.slice(0, -1) : name;
    const parts = normalized.split('/');
    return parts.some((part, index) => part === '..' || part === '' || (part === '.' && index !== 0));
  };
  await runTar(tarExecutable, ['--numeric-owner', '-tvzf', archive], signal, limits, (entry) => {
    entries += 1;
    if (entries > limits.maximumArchiveEntries) throw new Error('BUSTER_REMOTE_ARCHIVE_ENTRY_LIMIT');
    if (!/^[-d]/u.test(entry)) throw new Error('BUSTER_REMOTE_ARCHIVE_TYPE_DENIED');
    const match = entry.match(/^\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+(.+)$/u);
    if (!match?.[1] || !match[2] || unsafeName(match[2])) throw new Error('BUSTER_REMOTE_ARCHIVE_PATH_INVALID');
    const size = Number(match[1]);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('BUSTER_REMOTE_ARCHIVE_ENTRY_INVALID');
    total += size;
    if (!Number.isSafeInteger(total) || total > limits.maximumExtractedBytes) {
      throw new Error('BUSTER_REMOTE_ARCHIVE_EXPANDED_SIZE_EXCEEDED');
    }
  });
  // C0 evidence slice: stop after actual runTar LISTING phase; extraction deliberately excluded.
}

