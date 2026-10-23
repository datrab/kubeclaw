import fs, { type FileHandle } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ensureDirectoryDurable } from '@kubeclaw/plugin-foundation/observability/durable-delivery';

export type NativeWorkerOutputChannel = 'stdout' | 'stderr';
export interface NativeWorkerOutputCapture {
  append(channel: NativeWorkerOutputChannel, bytes: Uint8Array): Promise<void>;
  flush(): Promise<void>;
}

/** Private, bounded, fsynced original host output. Never truncate or silently rotate. */
export class NativeWorkerOutputSpool implements NativeWorkerOutputCapture {
  readonly #handles: Record<NativeWorkerOutputChannel, FileHandle>;
  readonly #maximumBytes: number;
  #acceptedBytes = 0;
  #queue: Promise<void> = Promise.resolve();
  #closed = false;
  #closing: Promise<void> | undefined;

  private constructor(handles: Record<NativeWorkerOutputChannel, FileHandle>, maximumBytes: number) {
    this.#handles = handles;
    this.#maximumBytes = maximumBytes;
  }

  static async create(root: string, maximumBytes: number): Promise<NativeWorkerOutputSpool> {
    if (!path.isAbsolute(root) || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('WORKER_OUTPUT_SPOOL_CONFIG_INVALID');
    await ensureDirectoryDurable(path.dirname(root));
    await fs.mkdir(root, { mode: 0o700 });
    const handles: FileHandle[] = [];
    try {
      for (const channel of ['stdout', 'stderr']) handles.push(await fs.open(path.join(root, channel),
        constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600));
      await Promise.all(handles.map(handle => handle.sync()));
      await syncDirectories([root, path.dirname(root)]);
      return new NativeWorkerOutputSpool({ stdout: handles[0]!, stderr: handles[1]! }, maximumBytes);
    } catch (error) {
      const closed = await Promise.allSettled(handles.map(handle => handle.close()));
      throw new AggregateError([error, ...closed.filter(value => value.status === 'rejected').map(value => value.reason)], 'WORKER_OUTPUT_SPOOL_CREATE_FAILED');
    }
  }

  append(channel: NativeWorkerOutputChannel, input: Uint8Array): Promise<void> {
    if (this.#closed) return Promise.reject(new Error('WORKER_OUTPUT_SPOOL_CLOSED'));
    if (!['stdout', 'stderr'].includes(channel)) return Promise.reject(new Error('WORKER_OUTPUT_CHANNEL_INVALID'));
    if (this.#acceptedBytes + input.byteLength > this.#maximumBytes) return Promise.reject(new Error('WORKER_OUTPUT_SPOOL_LIMIT'));
    const bytes = Buffer.from(input);
    this.#acceptedBytes += bytes.byteLength;
    const operation = this.#queue.then(async () => {
      await this.#handles[channel].writeFile(bytes);
      await this.#handles[channel].sync();
    });
    this.#queue = operation;
    // Preserve the rejected queue for every subsequent flush/append, while the
    // caller handles this operation's failure and terminates its owned process.
    void operation.catch(() => undefined);
    return operation;
  }

  flush(): Promise<void> { return this.#queue; }

  close(): Promise<void> {
    this.#closed = true;
    this.#closing ??= this.#queue.finally(async () => {
      await Promise.all([this.#handles.stdout.close(), this.#handles.stderr.close()]);
    });
    return this.#closing;
  }
}

async function syncDirectories(directories: readonly string[]): Promise<void> {
  for (const directory of directories) {
    const handle = await fs.open(directory, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  }
}

export async function readNativeWorkerOutput(root: string, maximumBytes: number) {
  if (!path.isAbsolute(root) || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('WORKER_OUTPUT_SPOOL_CONFIG_INVALID');
  let total = 0;
  const read = async (channel: NativeWorkerOutputChannel) => {
    const handle = await fs.open(path.join(root, channel), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > maximumBytes - total) throw new Error('WORKER_OUTPUT_SPOOL_FILE_INVALID');
      const bytes = await handle.readFile();
      total += bytes.byteLength;
      if (total > maximumBytes) throw new Error('WORKER_OUTPUT_SPOOL_LIMIT');
      return { bytes, sizeBytes: bytes.byteLength, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` };
    } finally { await handle.close(); }
  };
  const stdout = await read('stdout');
  const stderr = await read('stderr');
  return { stdout, stderr };
}
