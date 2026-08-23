import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { TestProviderCapabilityRequest } from '@kubeclaw/plugin-sdk';
import type { TestProviderCapabilityInvoker } from './runner.ts';

const execFileDefault = promisify(execFile);
const NAME = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const PLATFORM = /^linux\/[a-z0-9_+-]+(?:\/[a-z0-9._+-]+)?$/u;
const ARGUMENT = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const MAX_TIMER_MS = 2_147_483_647;
const ACCEPT = [
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
].join(', ');

type Execute = (command: string, args: readonly string[], options: Readonly<Record<string, unknown>>) => Promise<{ stdout?: string; stderr?: string }>;

export interface ContainerBuildCapabilityInvokerOptions {
  readonly workspaceRoot: string;
  readonly buildctlExecutable: string;
  readonly buildkitHost: string;
  readonly registryBaseUrl: string;
  readonly registryReference: string;
  readonly repositoryPrefix: string;
  readonly allowedPlatforms: readonly string[];
  readonly allowedBuildArguments?: readonly string[];
  readonly maximumLogBytes: number;
  readonly maximumExecutionMs: number;
  readonly maximumManifestBytes: number;
  readonly registryUsername?: string;
  readonly registryPassword?: string;
  readonly execute?: Execute;
  readonly fetch?: typeof globalThis.fetch;
}

function positive(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error('CONTAINER_BUILD_LIMIT_INVALID');
  return Math.min(Number(value), maximum);
}

function contained(root: string, value: unknown, label: string, kind: 'file' | 'directory'): string {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error(`CONTAINER_BUILD_PATH_INVALID:${label}`);
  const canonical = fs.realpathSync(value);
  if (canonical !== root && !canonical.startsWith(`${root}${path.sep}`)) throw new Error(`CONTAINER_BUILD_PATH_DENIED:${label}`);
  const stat = fs.statSync(canonical);
  if ((kind === 'file' && !stat.isFile()) || (kind === 'directory' && !stat.isDirectory())) throw new Error(`CONTAINER_BUILD_PATH_TYPE_INVALID:${label}`);
  return canonical;
}

function within(root: string, value: string): boolean {
  return value === root || value.startsWith(`${root}${path.sep}`);
}

function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('CONTAINER_BUILD_ARGUMENTS_INVALID');
  const entries = Object.entries(value);
  if (entries.length > 32 || entries.some(([key, item]) => !ARGUMENT.test(key) || typeof item !== 'string'
    || item.length > 4096 || item.includes('\0'))) throw new Error('CONTAINER_BUILD_ARGUMENTS_INVALID');
  return Object.fromEntries(entries as [string, string][]);
}

function digestFromMetadata(file: string): string {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  const value = parsed['containerimage.digest'];
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error('CONTAINER_BUILD_DIGEST_MISSING');
  return value;
}

function message(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 4096);
  return String(error).slice(0, 4096);
}

function commandOutput(error: unknown, field: 'stdout' | 'stderr'): string {
  if (!error || typeof error !== 'object') return '';
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : Buffer.isBuffer(value) ? value.toString('utf8') : '';
}

export class ContainerBuildCapabilityInvoker implements TestProviderCapabilityInvoker {
  readonly #root: string;
  readonly #buildctl: string;
  readonly #host: string;
  readonly #baseUrl: URL;
  readonly #registryReference: string;
  readonly #prefix: string;
  readonly #platforms: ReadonlySet<string>;
  readonly #buildArguments: ReadonlySet<string>;
  readonly #options: ContainerBuildCapabilityInvokerOptions;
  readonly #execute: Execute;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: ContainerBuildCapabilityInvokerOptions) {
    this.#root = fs.realpathSync(options.workspaceRoot);
    this.#buildctl = fs.realpathSync(options.buildctlExecutable);
    fs.accessSync(this.#buildctl, fs.constants.X_OK);
    if (!options.buildkitHost || options.buildkitHost.includes('\0')) throw new Error('CONTAINER_BUILD_BUILDKIT_HOST_INVALID');
    this.#host = options.buildkitHost;
    this.#baseUrl = new URL(options.registryBaseUrl);
    if (!['http:', 'https:'].includes(this.#baseUrl.protocol) || this.#baseUrl.username || this.#baseUrl.password
      || (this.#baseUrl.pathname !== '/' && this.#baseUrl.pathname !== '')) throw new Error('CONTAINER_BUILD_REGISTRY_URL_INVALID');
    if (!/^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/u.test(options.registryReference)) throw new Error('CONTAINER_BUILD_REGISTRY_REFERENCE_INVALID');
    if (this.#baseUrl.host !== options.registryReference) throw new Error('CONTAINER_BUILD_REGISTRY_ENDPOINT_MISMATCH');
    this.#registryReference = options.registryReference;
    if (!/^[a-z0-9]+(?:[._/-][a-z0-9]+)*$/u.test(options.repositoryPrefix)) throw new Error('CONTAINER_BUILD_REPOSITORY_PREFIX_INVALID');
    this.#prefix = options.repositoryPrefix.replace(/\/+$/u, '');
    if (options.allowedPlatforms.length < 1 || options.allowedPlatforms.some((item) => !PLATFORM.test(item))) throw new Error('CONTAINER_BUILD_PLATFORMS_INVALID');
    this.#platforms = new Set(options.allowedPlatforms);
    const allowedBuildArguments = options.allowedBuildArguments ?? [];
    if (allowedBuildArguments.length > 32 || allowedBuildArguments.some((item) => !ARGUMENT.test(item))
      || new Set(allowedBuildArguments).size !== allowedBuildArguments.length) throw new Error('CONTAINER_BUILD_ARGUMENT_ALLOWLIST_INVALID');
    this.#buildArguments = new Set(allowedBuildArguments);
    for (const [value, label] of [[options.maximumLogBytes, 'LOG'], [options.maximumExecutionMs, 'TIME'], [options.maximumManifestBytes, 'MANIFEST']] as const) {
      if (!Number.isSafeInteger(value) || value < 1 || value > Number.MAX_SAFE_INTEGER) throw new Error(`CONTAINER_BUILD_${label}_LIMIT_INVALID`);
    }
    if ((options.registryUsername === undefined) !== (options.registryPassword === undefined)) throw new Error('CONTAINER_BUILD_REGISTRY_CREDENTIALS_INCOMPLETE');
    if (options.registryUsername !== undefined && this.#baseUrl.protocol !== 'https:'
      && !['127.0.0.1', 'localhost', '::1'].includes(this.#baseUrl.hostname)) {
      throw new Error('CONTAINER_BUILD_REGISTRY_CREDENTIALS_REQUIRE_TLS');
    }
    this.#options = options;
    this.#execute = options.execute ?? (async (command, args, settings) => execFileDefault(command, [...args], settings) as Promise<{ stdout?: string; stderr?: string }>);
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async #verify(repository: string, digest: string, signal: AbortSignal): Promise<void> {
    const url = new URL(`/v2/${repository.split('/').map(encodeURIComponent).join('/')}/manifests/${digest}`, this.#baseUrl);
    const headers: Record<string, string> = { Accept: ACCEPT };
    if (this.#options.registryUsername !== undefined) {
      headers.Authorization = `Basic ${Buffer.from(`${this.#options.registryUsername}:${this.#options.registryPassword}`).toString('base64')}`;
    }
    const response = await this.#fetch(url, { method: 'GET', headers, signal, redirect: 'error' });
    if (!response.ok) throw new Error(`CONTAINER_BUILD_REGISTRY_READ_FAILED:${response.status}`);
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > this.#options.maximumManifestBytes) throw new Error('CONTAINER_BUILD_REGISTRY_MANIFEST_TOO_LARGE');
    if (!response.body) throw new Error('CONTAINER_BUILD_REGISTRY_MANIFEST_SIZE_INVALID');
    const reader = response.body.getReader();
    const hash = crypto.createHash('sha256');
    let received = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        received += part.value.byteLength;
        if (received > this.#options.maximumManifestBytes) {
          await reader.cancel('CONTAINER_BUILD_REGISTRY_MANIFEST_TOO_LARGE');
          throw new Error('CONTAINER_BUILD_REGISTRY_MANIFEST_TOO_LARGE');
        }
        hash.update(part.value);
      }
    } finally { reader.releaseLock(); }
    if (received < 1) throw new Error('CONTAINER_BUILD_REGISTRY_MANIFEST_SIZE_INVALID');
    const actual = `sha256:${hash.digest('hex')}`;
    const header = response.headers.get('docker-content-digest');
    if (actual !== digest || (header !== null && header !== digest)) throw new Error('CONTAINER_BUILD_REGISTRY_DIGEST_MISMATCH');
  }

  async invoke(capability: string, request: TestProviderCapabilityRequest, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
    if (capability !== 'container.build' || request.operation !== 'build_push_verify'
      || request.resource.type !== 'container.build-definition' || !/^build:[a-z0-9._-]+:attempt:[a-z0-9._:-]+$/u.test(request.resource.canonicalId)) {
      throw new Error('CONTAINER_BUILD_CAPABILITY_REQUEST_INVALID');
    }
    const payload = request.payload;
    const repository = contained(this.#root, payload.repositoryRoot, 'repositoryRoot', 'directory');
    const scratch = contained(this.#root, payload.scratchRoot, 'scratchRoot', 'directory');
    const context = contained(this.#root, payload.buildContext, 'buildContext', 'directory');
    const dockerfile = contained(this.#root, payload.dockerfile, 'dockerfile', 'file');
    if (!within(repository, context)) throw new Error('CONTAINER_BUILD_CONTEXT_OUTSIDE_REPOSITORY');
    if (!within(repository, dockerfile) && !within(scratch, dockerfile)) throw new Error('CONTAINER_BUILD_DOCKERFILE_OUTSIDE_PROVIDER_ROOTS');
    if (typeof payload.outputName !== 'string' || !NAME.test(payload.outputName)) throw new Error('CONTAINER_BUILD_OUTPUT_NAME_INVALID');
    if (typeof payload.definitionIdentity !== 'string' || payload.definitionIdentity.length < 1 || payload.definitionIdentity.length > 1024) {
      throw new Error('CONTAINER_BUILD_DEFINITION_IDENTITY_INVALID');
    }
    if (typeof payload.platform !== 'string' || !this.#platforms.has(payload.platform)) throw new Error('CONTAINER_BUILD_PLATFORM_DENIED');
    const limits = payload.limits as Record<string, unknown> | null;
    if (!limits || typeof limits !== 'object' || Array.isArray(limits)) throw new Error('CONTAINER_BUILD_LIMIT_INVALID');
    const maximumLogBytes = positive(limits.maximumLogBytes, this.#options.maximumLogBytes);
    const maximumExecutionMs = positive(limits.maximumExecutionMs, Math.min(this.#options.maximumExecutionMs, MAX_TIMER_MS));
    const buildArgs = stringMap(payload.buildArgs);
    if (Object.keys(buildArgs).some((name) => !this.#buildArguments.has(name))) throw new Error('CONTAINER_BUILD_ARGUMENT_DENIED');
    const target = payload.target;
    if (target !== undefined && (typeof target !== 'string' || !NAME.test(target))) throw new Error('CONTAINER_BUILD_TARGET_INVALID');
    const suffix = crypto.createHash('sha256').update(request.resource.canonicalId).digest('hex').slice(0, 24);
    const registryRepository = `${this.#prefix}/${payload.outputName}`;
    const registryImage = `${this.#registryReference}/${registryRepository}:run-${suffix}`;
    const temporary = fs.mkdtempSync(path.join(this.#root, '.container-build-'));
    const metadata = path.join(temporary, 'metadata.json');
    const dockerConfig = path.join(temporary, 'docker-config');
    if (this.#options.registryUsername !== undefined) {
      fs.mkdirSync(dockerConfig, { mode: 0o700 });
      fs.writeFileSync(path.join(dockerConfig, 'config.json'), JSON.stringify({ auths: {
        [this.#registryReference]: { auth: Buffer.from(`${this.#options.registryUsername}:${this.#options.registryPassword}`).toString('base64') },
      } }), { mode: 0o600 });
    }
    const args = ['--addr', this.#host, 'build', '--frontend', 'dockerfile.v0', '--local', `context=${context}`,
      '--local', `dockerfile=${path.dirname(dockerfile)}`, '--opt', `filename=${path.basename(dockerfile)}`,
      '--opt', `platform=${payload.platform}`];
    if (target) args.push('--opt', `target=${target}`);
    for (const [name, value] of Object.entries(buildArgs).sort(([left], [right]) => left.localeCompare(right))) args.push('--opt', `build-arg:${name}=${value}`);
    args.push('--output', `type=image,name=${registryImage},push=true${this.#baseUrl.protocol === 'http:' ? ',registry.insecure=true' : ''}`,
      '--metadata-file', metadata);
    const started = Date.now();
    let stdout = ''; let stderr = '';
    try {
      const result = await this.#execute(this.#buildctl, args, { encoding: 'utf8', maxBuffer: maximumLogBytes,
        timeout: maximumExecutionMs, signal, env: { PATH: path.dirname(this.#buildctl), BUILDKIT_HOST: this.#host,
          ...(this.#options.registryUsername === undefined ? {} : { DOCKER_CONFIG: dockerConfig }) } });
      stdout = result.stdout ?? ''; stderr = result.stderr ?? '';
      const digest = digestFromMetadata(metadata);
      await this.#verify(registryRepository, digest, signal);
      return Object.freeze({ ok: true, stdout, stderr, registryImage, digest,
        immutableImage: `${this.#registryReference}/${registryRepository}@${digest}`, durationMs: Date.now() - started,
        definitionIdentity: payload.definitionIdentity, platform: payload.platform });
    } catch (error) {
      if (signal.aborted) throw new Error('CONTAINER_BUILD_CANCELLED', { cause: error });
      stdout ||= commandOutput(error, 'stdout'); stderr ||= commandOutput(error, 'stderr');
      const failureMessage = message(error);
      const classified = /^(CONTAINER_BUILD_[A-Z0-9_]+)/u.exec(failureMessage)?.[1] ?? 'CONTAINER_BUILD_FAILED';
      return Object.freeze({ ok: false, stdout, stderr, errorCode: classified, message: failureMessage, durationMs: Date.now() - started });
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
}
