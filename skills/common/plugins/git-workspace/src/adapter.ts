import { spawn, type ChildProcessByStdio } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { AdapterActivationContext, AdapterInstance } from '@kubeclaw/plugin-sdk';

type EffectResult = Readonly<Record<string, unknown>>;
type GitChild = ChildProcessByStdio<null, Readable, Readable>;

interface RunnerOptions {
  readonly executable: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly maxExecutionMs: number;
  readonly maxOutputBytes: number;
  readonly terminationGraceMs: number;
}

function identityValue(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 320
    || value.includes('\0')
    || /[\r\n]/.test(value)
  ) throw new Error(`GIT_CONFIG_INVALID:${label}`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(`GIT_CONFIG_INVALID:${label}`);
  return Number(value);
}

function canonicalExistingDirectory(value: unknown, label: string): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.resolve(value) !== value) {
    throw new Error(`GIT_CONFIG_INVALID:${label}`);
  }
  const stats = fs.lstatSync(value);
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`GIT_CONFIG_INVALID:${label}`);
  const canonical = fs.realpathSync(value);
  if (canonical !== value) throw new Error(`GIT_CONFIG_NONCANONICAL:${label}`);
  return canonical;
}

function canonicalExecutable(value: unknown): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.resolve(value) !== value) {
    throw new Error('GIT_CONFIG_INVALID:gitExecutable');
  }
  const stats = fs.lstatSync(value);
  if (stats.isSymbolicLink() || !stats.isFile()) throw new Error('GIT_CONFIG_INVALID:gitExecutable');
  const canonical = fs.realpathSync(value);
  if (canonical !== value) throw new Error('GIT_CONFIG_NONCANONICAL:gitExecutable');
  return canonical;
}

function canonicalWorkspaceRoot(value: unknown): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.resolve(value) !== value) {
    throw new Error('GIT_CONFIG_INVALID:workspaceRoot');
  }
  fs.mkdirSync(value, { recursive: true });
  return canonicalExistingDirectory(value, 'workspaceRoot');
}

function inside(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function authorizedExistingDirectory(value: unknown, roots: readonly string[], label: string): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.resolve(value) !== value) {
    throw new Error(`GIT_PATH_INVALID:${label}`);
  }
  const canonical = canonicalExistingDirectory(value, label);
  if (!roots.some((root) => inside(canonical, root))) throw new Error(`GIT_PATH_DENIED:${canonical}`);
  return canonical;
}

function validateWorkspaceDestination(value: unknown, workspaceRoot: string): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.resolve(value) !== value) {
    throw new Error('GIT_PATH_INVALID:workspacePath');
  }
  if (!inside(value, workspaceRoot) || value === workspaceRoot) throw new Error(`GIT_PATH_DENIED:${value}`);
  if (fs.existsSync(value)) throw new Error(`GIT_WORKSPACE_EXISTS:${value}`);
  const parent = fs.realpathSync(path.dirname(value));
  if (!inside(parent, workspaceRoot)) throw new Error(`GIT_PATH_DENIED:${value}`);
  return value;
}

function gitToken(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 512
    || value.startsWith('-')
    || value.includes('\0')
    || /[\s~^:?*[\\]/.test(value)
    || value.includes('..')
    || value.includes('@{')
    || value.endsWith('.')
    || value.endsWith('/')
    || value.endsWith('.lock')
    || value.includes('//')
  ) throw new Error(`GIT_VALUE_INVALID:${label}`);
  return value;
}

function gitRef(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) {
    throw new Error(`GIT_VALUE_INVALID:${label}`);
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment.length === 0)) throw new Error(`GIT_VALUE_INVALID:${label}`);
  return segments.map((segment) => gitToken(segment, label)).join('/');
}

function commitMessage(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 4096
    || value.includes('\0')
    || /[\r\n]/.test(value)
    || value.startsWith('-')
  ) throw new Error('GIT_VALUE_INVALID:message');
  return value;
}

function scopedPath(value: unknown, workspace: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 4096
    || path.isAbsolute(value)
    || value.includes('\0')
    || /[\r\n]/.test(value)
  ) throw new Error('GIT_PATHS_INVALID');
  const segments = value.split(/[\\/]+/);
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error('GIT_PATHS_INVALID');
  }
  const normalized = segments.join('/');
  const resolved = path.resolve(workspace, normalized);
  if (!inside(resolved, workspace) || resolved === workspace) throw new Error('GIT_PATHS_INVALID');
  let cursor = workspace;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) break;
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error(`GIT_SYMLINK_DENIED:${normalized}`);
  }
  return normalized;
}

function scopedPaths(value: unknown, workspace: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('GIT_PATHS_INVALID');
  return Object.freeze([...new Set(value.map((entry) => scopedPath(entry, workspace)))]);
}

class GitRunner {
  readonly #options: RunnerOptions;
  readonly #children = new Set<GitChild>();
  readonly #settled = new Map<GitChild, Promise<void>>();
  #shuttingDown = false;

  constructor(options: RunnerOptions) {
    this.#options = options;
  }

  async run(cwd: string, args: readonly string[], signal: AbortSignal): Promise<EffectResult> {
    if (this.#shuttingDown) throw new Error('ADAPTER_SHUTTING_DOWN');
    if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
    return new Promise((resolve, reject) => {
      const child = spawn(this.#options.executable, [
        '-c', 'core.hooksPath=/dev/null',
        '-c', 'commit.gpgSign=false',
        '-c', `user.name=${this.#options.authorName}`,
        '-c', `user.email=${this.#options.authorEmail}`,
        ...args,
      ], {
        cwd,
        detached: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {},
      });
      this.#children.add(child);
      let stdout = '';
      let stderr = '';
      let outputBytes = 0;
      let completed = false;
      let requestedError: Error | undefined;
      let terminationTimer: ReturnType<typeof setTimeout> | undefined;
      let resolveSettled!: () => void;
      const settled = new Promise<void>((done) => { resolveSettled = done; });
      this.#settled.set(child, settled);

      const finish = (callback: () => void): void => {
        if (completed) return;
        completed = true;
        clearTimeout(timeout);
        if (terminationTimer) clearTimeout(terminationTimer);
        signal.removeEventListener('abort', cancel);
        this.#children.delete(child);
        this.#settled.delete(child);
        resolveSettled();
        callback();
      };
      const terminate = (): void => {
        if (child.exitCode !== null) return;
        this.#kill(child, 'SIGTERM');
        terminationTimer = setTimeout(() => {
          if (child.exitCode === null) this.#kill(child, 'SIGKILL');
        }, this.#options.terminationGraceMs);
      };
      const fail = (error: Error): void => {
        if (requestedError || completed) return;
        requestedError = error;
        terminate();
      };
      const append = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
        if (completed) return;
        outputBytes += chunk.byteLength;
        if (outputBytes > this.#options.maxOutputBytes) {
          fail(new Error(`GIT_OUTPUT_LIMIT_EXCEEDED:${this.#options.maxOutputBytes}`));
          return;
        }
        if (stream === 'stdout') stdout += chunk.toString('utf8');
        else stderr += chunk.toString('utf8');
      };
      const cancel = (): void => fail(new Error('ADAPTER_CANCELLED'));
      const timeout = setTimeout(
        () => fail(new Error(`GIT_TIMEOUT:${this.#options.maxExecutionMs}`)),
        this.#options.maxExecutionMs,
      );
      signal.addEventListener('abort', cancel, { once: true });
      child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk));
      child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk));
      child.once('error', (error) => finish(() => reject(requestedError ?? error)));
      child.once('close', (code, childSignal) => finish(() => {
        if (requestedError) {
          reject(requestedError);
        } else if (code !== 0) {
          reject(new Error(`GIT_COMMAND_FAILED:${String(code)}:${String(childSignal)}:${stderr.slice(0, 4096)}`));
        } else {
          resolve({ exitCode: code, signal: childSignal, stdout, stderr });
        }
      }));
    });
  }

  async shutdown(): Promise<void> {
    this.#shuttingDown = true;
    const pending = [...this.#settled.values()];
    for (const child of this.#children) {
      if (child.exitCode === null) this.#kill(child, 'SIGTERM');
    }
    const force = setTimeout(() => {
      for (const child of this.#children) {
        if (child.exitCode === null) this.#kill(child, 'SIGKILL');
      }
    }, this.#options.terminationGraceMs);
    await Promise.allSettled(pending);
    clearTimeout(force);
  }

  #kill(child: GitChild, signal: NodeJS.Signals): void {
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    }
    child.kill(signal);
  }
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const configuredRoots = context.config.allowedRepositoryRoots;
  if (!Array.isArray(configuredRoots) || configuredRoots.length === 0) {
    throw new Error('GIT_CONFIG_INVALID:allowedRepositoryRoots');
  }
  const roots = Object.freeze(configuredRoots.map((root, index) => (
    canonicalExistingDirectory(root, `allowedRepositoryRoots[${index}]`)
  )));
  const workspaceRoot = canonicalWorkspaceRoot(context.config.workspaceRoot);
  const runner = new GitRunner({
    executable: canonicalExecutable(context.config.gitExecutable),
    authorName: identityValue(context.config.authorName, 'authorName'),
    authorEmail: identityValue(context.config.authorEmail, 'authorEmail'),
    maxExecutionMs: positiveInteger(context.config.maxExecutionMs, 'maxExecutionMs'),
    maxOutputBytes: positiveInteger(context.config.maxOutputBytes, 'maxOutputBytes'),
    terminationGraceMs: positiveInteger(context.config.terminationGraceMs, 'terminationGraceMs'),
  });
  return {
    async ready() {},
    async invoke({ request, signal }) {
      if (request.capability === 'git.workspace.create' && request.operation === 'create') {
        const repository = authorizedExistingDirectory(
          request.payload.repositoryRoot ?? request.resource.canonicalId,
          roots,
          'repositoryRoot',
        );
        if (request.resource.canonicalId !== repository) throw new Error('GIT_RESOURCE_MISMATCH');
        const workspace = validateWorkspaceDestination(request.payload.workspacePath, workspaceRoot);
        const branch = gitToken(request.payload.branch, 'branch');
        const baseRef = gitToken(request.payload.baseRef, 'baseRef');
        await runner.run(repository, ['worktree', 'add', '-b', branch, '--', workspace, baseRef], signal);
        const canonical = canonicalExistingDirectory(workspace, 'workspacePath');
        if (!inside(canonical, workspaceRoot)) throw new Error(`GIT_PATH_DENIED:${canonical}`);
        return { workspace: canonical };
      }
      const workspace = authorizedExistingDirectory(
        request.resource.canonicalId,
        [workspaceRoot, ...roots],
        'workspace',
      );
      if (request.capability === 'git.commit' && request.operation === 'commit') {
        const paths = scopedPaths(request.payload.paths, workspace);
        await runner.run(workspace, ['add', '--', ...paths], signal);
        return runner.run(workspace, ['commit', '-m', commitMessage(request.payload.message), '--', ...paths], signal);
      }
      if (request.capability === 'git.merge' && request.operation === 'merge') {
        return runner.run(
          workspace,
          ['merge', '--no-edit', '--no-ff', gitToken(request.payload.sourceRef, 'sourceRef')],
          signal,
        );
      }
      if (request.capability === 'git.sync' && request.operation === 'sync_paths') {
        const ref = gitRef(request.payload.ref, 'ref');
        const paths = scopedPaths(request.payload.paths, workspace);
        const synced: Array<{ path: string; action: 'created' | 'updated' }> = [];
        const missing: string[] = [];
        for (const file of paths) {
          let remote: EffectResult;
          try {
            remote = await runner.run(workspace, ['show', `${ref}:${file}`], signal);
          } catch {
            missing.push(file);
            continue;
          }
          const destination = path.join(workspace, file);
          const local = fs.existsSync(destination) ? fs.readFileSync(destination, 'utf8') : undefined;
          if (local !== undefined && local.trim() === String(remote.stdout).trim()) continue;
          await runner.run(workspace, ['checkout', ref, '--', file], signal);
          synced.push({ path: file, action: local === undefined ? 'created' : 'updated' });
        }
        return { synced, missing };
      }
      throw new Error(`GIT_OPERATION_UNSUPPORTED:${request.capability}:${request.operation}`);
    },
    async shutdown() { await runner.shutdown(); },
  };
}
