import { spawn } from 'node:child_process';
import { checkGateSignal } from './deadline.ts';
import { SourceProcessLifecycle } from './source-process-lifecycle.ts';

/** Bound output and acknowledge native process/pipes cleanup before settling. */
export async function sourceGit(root: string, args: readonly string[], maximum: number, signal: AbortSignal): Promise<Buffer> {
  checkGateSignal(signal);
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn('git', ['-C', root, ...args], { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = []; let total = 0; let stderr = ''; let failure: Error | undefined;
    let finishing = false; let code: number | null = null; let childSignal: NodeJS.Signals | null = null;
    let resolveClosed!: () => void;
    const closed = new Promise<void>(resolveClose => { resolveClosed = resolveClose; });
    let lifecycle: SourceProcessLifecycle;
    const settle = (cleanup?: unknown): void => {
      signal.removeEventListener('abort', abort);
      if (cleanup) reject(new AggregateError([...(failure ? [failure] : []), cleanup],
        `${failure?.message ?? 'NOVA_SOURCE_GIT_FAILED'}:NOVA_SOURCE_CLEANUP_UNCONFIRMED`, { cause: failure ?? cleanup }));
      else if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`NOVA_SOURCE_GIT_FAILED:${code}:${childSignal}:${stderr}`));
      else resolve(Buffer.concat(chunks, total));
    };
    const finish = (): void => {
      if (finishing) return;
      finishing = true;
      void lifecycle.cleanup().then(() => settle(), error => settle(error));
    };
    const fail = (error: Error): void => { failure ??= error; finish(); };
    const abort = (): void => { try { checkGateSignal(signal); } catch (error) { fail(error as Error); } };
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      if (failure) return;
      if (chunk.length > maximum - total) { fail(new Error('NOVA_SOURCE_ARCHIVE_SIZE_EXCEEDED')); return; }
      chunks.push(chunk); total += chunk.length;
    });
    child.stderr.on('data', (chunk: Buffer) => { if (stderr.length < 4096) stderr += chunk.toString('utf8').slice(0, 4096 - stderr.length); });
    child.stdout.on('error', fail); child.stderr.on('error', fail); child.once('error', fail);
    child.once('exit', (exitCode, exitSignal) => { code = exitCode; childSignal = exitSignal; finish(); });
    child.once('close', (exitCode, exitSignal) => {
      code = exitCode; childSignal = exitSignal; resolveClosed(); finish();
    });
    lifecycle = new SourceProcessLifecycle(child, closed);
    if (signal.aborted) abort();
  });
}
