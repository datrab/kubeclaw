import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { assertStableDatabases, databasePolicy, inspectTrivyDatabases, type TrivyDatabasePolicy } from './trivy-database.ts';
import type { TestProviderCapabilityInvoker } from './runner.ts';

type JsonObject = Record<string, unknown>;

export interface SecurityScanCapabilityInvokerOptions {
  readonly workspaceRoot: string;
  readonly trivyExecutable: string;
  readonly allowedRegistryPrefixes: readonly string[];
  readonly maximumExecutionMs: number;
  readonly maximumOutputBytes: number;
  readonly cacheDirectory: string;
  readonly databasePolicy?: TrivyDatabasePolicy;
}

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const IMAGE = /^([A-Za-z0-9.-]+(?::[0-9]{1,5})?\/[a-z0-9]+(?:[._/-][a-z0-9]+)*)@(sha256:[a-f0-9]{64})$/u;

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`SECURITY_SCAN_REQUEST_INVALID:${label}`);
  return value as JsonObject;
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) throw new Error(`SECURITY_SCAN_REQUEST_INVALID:${label}`);
  return value;
}

function contained(root: string, value: unknown, label: string): string {
  const requested = text(value, label, 4096);
  const resolved = fs.realpathSync(path.isAbsolute(requested) ? requested : path.resolve(root, requested));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error('SECURITY_SCAN_PATH_DENIED');
  return resolved;
}

function severity(value: unknown): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  const normalized = String(value ?? 'UNKNOWN').toLowerCase();
  return ['critical', 'high', 'medium', 'low'].includes(normalized)
    ? normalized as 'critical' | 'high' | 'medium' | 'low' : 'info';
}

function relative(root: string, value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const resolved = path.resolve(root, value);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? path.relative(root, resolved) || '.' : path.basename(value);
}

async function execute(executable: string, args: readonly string[], cwd: string, cacheDirectory: string,
  timeoutMs: number, maximumBytes: number, signal: AbortSignal): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal]);
    const child = spawn(executable, [...args], {
      cwd, signal: combined, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: cacheDirectory, TRIVY_CACHE_DIR: cacheDirectory,
        NO_COLOR: '1', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const finish = (error?: Error, output?: Buffer): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(output!);
    };
    const collect = (target: Buffer[]) => (chunk: Buffer): void => {
      bytes += chunk.byteLength;
      if (bytes > maximumBytes) {
        controller.abort();
        finish(new Error('SECURITY_SCAN_OUTPUT_LIMIT_EXCEEDED'));
      } else target.push(Buffer.from(chunk));
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.on('error', (error) => {
      if (signal.aborted) finish(new Error('SECURITY_SCAN_CANCELLED'));
      else if (controller.signal.aborted) finish(new Error('SECURITY_SCAN_TIMEOUT'));
      else finish(new Error('SECURITY_SCANNER_EXECUTION_FAILED', { cause: error }));
    });
    child.on('close', (code, childSignal) => {
      if (settled) return;
      if (signal.aborted) return finish(new Error('SECURITY_SCAN_CANCELLED'));
      if (controller.signal.aborted) return finish(new Error('SECURITY_SCAN_TIMEOUT'));
      if (code !== 0 || childSignal) return finish(new Error(`SECURITY_SCANNER_EXECUTION_FAILED:${code ?? childSignal}`));
      finish(undefined, Buffer.concat(stdout));
    });
  });
}

function trivyResults(bytes: Buffer): JsonObject[] {
  let parsed: JsonObject;
  try { parsed = object(JSON.parse(bytes.toString('utf8')), 'trivy-result'); }
  catch (error) { throw new Error('SECURITY_SCANNER_RESULT_INVALID', { cause: error }); }
  if (parsed.SchemaVersion !== 2 || (parsed.Results !== null && parsed.Results !== undefined && !Array.isArray(parsed.Results))) {
    throw new Error('SECURITY_SCANNER_RESULT_INVALID');
  }
  return (Array.isArray(parsed.Results) ? parsed.Results : []).map((item) => object(item, 'trivy-result-item'));
}

function dependencyFindings(root: string, results: JsonObject[]): JsonObject[] {
  const findings: JsonObject[] = [];
  for (const result of results) {
    const sourceFile = relative(root, result.Target);
    for (const raw of Array.isArray(result.Vulnerabilities) ? result.Vulnerabilities : []) {
      const item = object(raw, 'trivy-vulnerability');
      findings.push({
        id: text(item.VulnerabilityID, 'vulnerability-id', 256), severity: severity(item.Severity),
        package: text(item.PkgName, 'package', 512), installedVersion: String(item.InstalledVersion ?? ''),
        fixedVersion: String(item.FixedVersion ?? ''), sourceFile, reachability: null,
        title: String(item.Title ?? item.VulnerabilityID).slice(0, 2048), status: String(item.Status ?? 'unknown'),
      });
    }
  }
  return findings;
}

function policyFindings(root: string, results: JsonObject[]): JsonObject[] {
  const findings: JsonObject[] = [];
  for (const result of results) {
    const sourceFile = relative(root, result.Target);
    for (const raw of Array.isArray(result.Misconfigurations) ? result.Misconfigurations : []) {
      const item = object(raw, 'trivy-misconfiguration');
      const cause = item.CauseMetadata && typeof item.CauseMetadata === 'object' && !Array.isArray(item.CauseMetadata)
        ? item.CauseMetadata as JsonObject : {};
      findings.push({ id: text(item.ID, 'misconfiguration-id', 256), severity: severity(item.Severity),
        sourceFile, line: Number.isSafeInteger(cause.StartLine) ? cause.StartLine : null,
        title: String(item.Title ?? item.Message ?? item.ID).slice(0, 2048),
        message: String(item.Message ?? item.Description ?? item.Title ?? item.ID).slice(0, 4096),
        resolution: String(item.Resolution ?? '').slice(0, 4096), status: String(item.Status ?? 'unknown') });
    }
  }
  return findings;
}

function scanTarget(operation: string, root: string, target: string): string {
  return operation === 'image' ? target : path.relative(root, target) || '.';
}

export class SecurityScanCapabilityInvoker implements TestProviderCapabilityInvoker {
  readonly #root: string;
  readonly #trivy: string;
  readonly #registryPrefixes: readonly string[];
  readonly #maximumExecutionMs: number;
  readonly #maximumOutputBytes: number;
  readonly #cache: string;
  readonly #databasePolicy: TrivyDatabasePolicy;

  constructor(options: SecurityScanCapabilityInvokerOptions) {
    this.#root = fs.realpathSync(options.workspaceRoot);
    this.#trivy = fs.realpathSync(options.trivyExecutable);
    fs.accessSync(this.#trivy, fs.constants.X_OK);
    if (!Number.isSafeInteger(options.maximumExecutionMs) || options.maximumExecutionMs < 1 || options.maximumExecutionMs > 2147483647
      || !Number.isSafeInteger(options.maximumOutputBytes) || options.maximumOutputBytes < 1024) {
      throw new Error('SECURITY_SCAN_LIMIT_INVALID');
    }
    if (options.allowedRegistryPrefixes.length < 1) throw new Error('SECURITY_SCAN_REGISTRY_POLICY_INVALID');
    this.#registryPrefixes = [...options.allowedRegistryPrefixes];
    this.#maximumExecutionMs = options.maximumExecutionMs;
    this.#maximumOutputBytes = options.maximumOutputBytes;
    this.#cache = fs.realpathSync(options.cacheDirectory);
    this.#databasePolicy = databasePolicy(options.databasePolicy);
  }

  async invoke(capability: string, request: unknown, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
    if (capability !== 'security.scan') throw new Error('SECURITY_SCAN_CAPABILITY_DENIED');
    const value = object(request, 'request');
    const payload = object(value.payload, 'payload');
    const operation = text(value.operation, 'operation', 32);
    const timeoutMs = Math.min(this.#maximumExecutionMs,
      Number.isSafeInteger(payload.timeoutMs) && Number(payload.timeoutMs) > 0 ? Number(payload.timeoutMs) : this.#maximumExecutionMs);
    let args: string[];
    let target: string;
    if (operation === 'dependency') {
      target = contained(this.#root, payload.projectDirectory, 'projectDirectory');
      args = ['fs', '--scanners', 'vuln', '--format', 'json', '--quiet', '--skip-db-update', '--skip-java-db-update', '--offline-scan',
        '--skip-version-check', '--disable-telemetry', '--timeout', `${Math.ceil(timeoutMs / 1000)}s`, target];
    } else if (operation === 'image') {
      const image = text(payload.image, 'image', 2048);
      const parsed = IMAGE.exec(image);
      if (!parsed || payload.digest !== parsed[2] || !DIGEST.test(String(payload.digest))
        || !this.#registryPrefixes.some((prefix) => parsed[1] === prefix || parsed[1]!.startsWith(`${prefix}/`))) {
        throw new Error('SECURITY_SCAN_IMAGE_DENIED');
      }
      target = image;
      args = ['image', '--scanners', 'vuln', '--format', 'json', '--quiet', '--skip-db-update', '--skip-java-db-update', '--offline-scan',
        '--skip-version-check', '--disable-telemetry', '--timeout', `${Math.ceil(timeoutMs / 1000)}s`, image];
    } else if (operation === 'kubernetes-policy') {
      target = contained(this.#root, payload.manifestPath, 'manifestPath');
      if (!fs.statSync(target).isFile()) throw new Error('SECURITY_SCAN_PATH_DENIED');
      const expected = text(payload.manifestDigest, 'manifestDigest', 71);
      const actual = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')}`;
      if (!DIGEST.test(expected) || actual !== expected) throw new Error('SECURITY_SCAN_MANIFEST_DIGEST_MISMATCH');
      // Trivy config has no offline-scan flag. Disabling check updates,
      // version checks, and telemetry removes each config-scan network path.
      args = ['config', '--format', 'json', '--quiet', '--skip-check-update', '--skip-version-check', '--disable-telemetry',
        '--misconfig-scanners', 'kubernetes', '--timeout', `${Math.ceil(timeoutMs / 1000)}s`, target];
    } else throw new Error('SECURITY_SCAN_OPERATION_DENIED');
    return this.#scan(operation, target, args, timeoutMs, signal);
  }

  async #scan(operation: string, target: string, args: string[], timeoutMs: number, signal: AbortSignal) {
    const deadline = Date.now() + timeoutMs;
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
    try {
      const before = operation === 'kubernetes-policy' ? undefined
        : await inspectTrivyDatabases(this.#cache, this.#databasePolicy, bounded);
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('SECURITY_SCAN_TIMEOUT');
      const output = trivyResults(await execute(this.#trivy, args, this.#root, this.#cache,
        remaining, this.#maximumOutputBytes, bounded));
      const findings = operation === 'kubernetes-policy' ? policyFindings(this.#root, output) : dependencyFindings(this.#root, output);
      const databaseEvidence = before ? await inspectTrivyDatabases(this.#cache, this.#databasePolicy, bounded) : undefined;
      if (before && databaseEvidence) assertStableDatabases(before, databaseEvidence);
      const reportedTarget = scanTarget(operation, this.#root, target);
      const result = Object.freeze({ scanner: 'trivy', operation, target: reportedTarget,
        resultDigest: `sha256:${crypto.createHash('sha256').update(JSON.stringify(databaseEvidence ? { findings, databaseEvidence } : findings)).digest('hex')}`,
        findings, ...(databaseEvidence ? { databaseEvidence } : {}) });
      bounded.throwIfAborted();
      if (Date.now() >= deadline) throw new Error('SECURITY_SCAN_TIMEOUT');
      return result;
    } catch (error) {
      if (signal.aborted) throw new Error('SECURITY_SCAN_CANCELLED', { cause: error });
      if (bounded.aborted || Date.now() >= deadline) throw new Error('SECURITY_SCAN_TIMEOUT', { cause: error });
      throw error;
    }
  }
}
