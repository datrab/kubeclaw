import crypto from 'node:crypto';
import fs from 'node:fs';

const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
function wait(): void { Atomics.wait(waitBuffer, 0, 0, 10); }
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}
function owner(file: string): { token?: unknown; pid?: unknown } | undefined {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as { token?: unknown; pid?: unknown }; }
  catch {
    // INTENTIONAL_NONCRITICAL(file_mutex_owner_invalid): Invalid metadata is reclaimed as corrupt.
    return undefined;
  }
}
function moveAside(file: string, label: string): boolean {
  const tombstone = `${file}.${label}-${crypto.randomUUID()}`;
  try { fs.renameSync(file, tombstone); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  fs.rmSync(tombstone, { recursive: true, force: true }); return true;
}

export class FileMutex {
  readonly #file: string; readonly #timeoutMs: number; readonly #timeoutCode: string;
  constructor(file: string, timeoutMs: number, timeoutCode: string) { this.#file = file; this.#timeoutMs = timeoutMs; this.#timeoutCode = timeoutCode; }
  withLock<T>(operation: () => T): T {
    const token = this.#acquire();
    try { return operation(); } finally { this.#release(token); }
  }
  #tryClaim(token: string): boolean {
    const temporary = `${this.#file}.${token}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify({ token, pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, { flag: 'wx', mode: 0o600 });
    try { fs.linkSync(temporary, this.#file); fs.unlinkSync(temporary); return true; }
    catch (error) { fs.rmSync(temporary, { force: true }); if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false; throw error; }
  }
  #acquire(): string {
    const deadline = Date.now() + this.#timeoutMs;
    for (;;) {
      const token = crypto.randomUUID(); if (this.#tryClaim(token)) return token;
      const current = owner(this.#file);
      if (!current) { moveAside(this.#file, 'corrupt'); continue; }
      if (typeof current.pid !== 'number' || !alive(current.pid)) { moveAside(this.#file, 'stale'); continue; }
      if (Date.now() >= deadline) throw new Error(this.#timeoutCode);
      wait();
    }
  }
  #release(token: string): void {
    try { if (owner(this.#file)?.token === token) fs.unlinkSync(this.#file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
