import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { TestProviderCapabilityInvoker } from './runner.ts';
import { kubernetesCredentialEnvironment } from './kubernetes-fixture-runtime.ts';

import { validateBusterRuntimeSecuritySettings, type BusterRuntimeSecuritySettings } from '../../../common/plugin-runtime/foundation/config/buster-cluster-invokers.ts';

type JsonObject = Record<string, unknown>;

export interface KubernetesRuntimeSecurityCapabilityInvokerOptions extends BusterRuntimeSecuritySettings {
  readonly workspaceRoot: string;
  readonly kubectlExecutable: string;
  readonly controllerNamespace: string;
  readonly leaseApiGroup: string;
}

function capturedOptions(options: KubernetesRuntimeSecurityCapabilityInvokerOptions): BusterRuntimeSecuritySettings {
  const { workspaceRoot, kubectlExecutable, controllerNamespace, leaseApiGroup, ...settings } = options;
  const policy = validateBusterRuntimeSecuritySettings(settings);
  if (typeof workspaceRoot !== 'string' || workspaceRoot.length === 0
    || typeof kubectlExecutable !== 'string' || kubectlExecutable.length === 0
    || typeof controllerNamespace !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(controllerNamespace)
    || typeof leaseApiGroup !== 'string' || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(leaseApiGroup)) {
    throw new Error('KUBERNETES_RUNTIME_SECURITY_CONFIG_INVALID');
  }
  return policy;
}

function object(value: unknown, code = 'KUBERNETES_RUNTIME_SECURITY_RESPONSE_INVALID'): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as JsonObject;
}

function text(value: unknown, label: string, maximum = 2048): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) {
    throw new Error(`KUBERNETES_RUNTIME_SECURITY_REQUEST_INVALID:${label}`);
  }
  return value;
}

function canonicalJson(value: unknown): string {
  const normalized = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalized);
    if (entry && typeof entry === 'object') return Object.fromEntries(Object.entries(entry as JsonObject)
      .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalized(item)]));
    return entry;
  };
  return JSON.stringify(normalized(value));
}

export function runtimeSecurityResultDigest(snapshot: JsonObject): string {
  const payload = { findings: snapshot.findings, omittedFindingCount: snapshot.omittedFindingCount,
    podCount: snapshot.podCount, serviceCount: snapshot.serviceCount,
    totalFindingCount: snapshot.totalFindingCount };
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(payload)).digest('hex')}`;
}

export function runtimeSecurityObservationHasValidAccounting(snapshot: JsonObject): boolean {
  if (!Array.isArray(snapshot.findings) || !Number.isSafeInteger(snapshot.totalFindingCount)
    || Number(snapshot.totalFindingCount) < 0 || !Number.isSafeInteger(snapshot.omittedFindingCount)
    || Number(snapshot.omittedFindingCount) < 0) return false;
  const total = Number(snapshot.totalFindingCount); const omitted = Number(snapshot.omittedFindingCount);
  if (omitted === 0) return total === snapshot.findings.length;
  const overflow = snapshot.findings.at(-1);
  return snapshot.findings.length > 0 && total - omitted === snapshot.findings.length - 1
    && Boolean(overflow && typeof overflow === 'object' && !Array.isArray(overflow)
      && (overflow as JsonObject).id === 'runtime:findings:overflow'
      && (overflow as JsonObject).severity === 'critical');
}

export function containedRuntimeSecurityManifest(root: string, value: unknown): string {
  const requested = text(value, 'manifestPath', 4096);
  const resolved = fs.realpathSync(path.isAbsolute(requested) ? requested : path.resolve(root, requested));
  if (!fs.statSync(resolved).isFile() || (resolved !== root && !resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error('KUBERNETES_RUNTIME_SECURITY_PATH_DENIED');
  }
  return resolved;
}

async function kubectl(executable: string, args: readonly string[], timeoutMs: number, policy: BusterRuntimeSecuritySettings,
  signal: AbortSignal): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal]);
    const child = spawn(executable, [...args], { signal: combined, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: policy.executableSearchPath.join(path.delimiter), ...kubernetesCredentialEnvironment(), LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
    const stdout: Buffer[] = []; const stderr: Buffer[] = []; let bytes = 0; let settled = false;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const finish = (error?: Error, output?: Buffer): void => {
      if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(output!);
    };
    const collect = (target: Buffer[]) => (chunk: Buffer): void => {
      bytes += chunk.byteLength;
      if (bytes > policy.maximumOutputBytes) { finish(new Error('KUBERNETES_RUNTIME_SECURITY_OUTPUT_LIMIT_EXCEEDED')); controller.abort(); }
      else target.push(Buffer.from(chunk));
    };
    child.stdout.on('data', collect(stdout)); child.stderr.on('data', collect(stderr));
    child.on('error', (error) => finish(signal.aborted ? new Error('KUBERNETES_RUNTIME_SECURITY_CANCELLED')
      : controller.signal.aborted ? new Error('KUBERNETES_RUNTIME_SECURITY_TIMEOUT')
        : new Error('KUBERNETES_RUNTIME_SECURITY_EXECUTION_FAILED', { cause: error })));
    child.on('close', (code, childSignal) => {
      if (settled) return;
      if (signal.aborted) return finish(new Error('KUBERNETES_RUNTIME_SECURITY_CANCELLED'));
      if (controller.signal.aborted) return finish(new Error('KUBERNETES_RUNTIME_SECURITY_TIMEOUT'));
      if (code !== 0 || childSignal) return finish(new Error(`KUBERNETES_RUNTIME_SECURITY_EXECUTION_FAILED:${Buffer.concat(stderr).toString('utf8').slice(0, policy.diagnosticCodeUnits)}`));
      finish(undefined, Buffer.concat(stdout));
    });
  });
}

function runtimeSecuritySnapshot(lease: JsonObject, namespace: string): JsonObject | null {
  const status = object(lease.status);
  if (status.namespaceName !== namespace || object(lease.spec).namespaceName !== namespace) {
    throw new Error('KUBERNETES_RUNTIME_SECURITY_LEASE_MISMATCH');
  }
  return status.runtimeSecurity && typeof status.runtimeSecurity === 'object'
    && !Array.isArray(status.runtimeSecurity) ? object(status.runtimeSecurity) : null;
}

function observationMatches(snapshot: JsonObject | null, digest: string, immutableImage: string,
  policy: BusterRuntimeSecuritySettings): snapshot is JsonObject {
  return snapshot?.phase === 'Observed' && snapshot.manifestDigest === digest
    && snapshot.immutableImage === immutableImage && Array.isArray(snapshot.findings)
    && Number.isSafeInteger(snapshot.podCount) && Number(snapshot.podCount) > 0
    && Number.isSafeInteger(snapshot.serviceCount) && Number(snapshot.serviceCount) > 0
    && runtimeSecurityObservationHasValidAccounting(snapshot)
    && runtimeSecurityObservationIsFresh(snapshot.observedAt, Date.now(), policy.maximumObservationAgeMs, policy.maximumFutureSkewMs)
    && typeof snapshot.resultDigest === 'string' && /^sha256:[a-f0-9]{64}$/u.test(snapshot.resultDigest);
}

export class KubernetesRuntimeSecurityCapabilityInvoker implements TestProviderCapabilityInvoker {
  readonly #root: string; readonly #kubectl: string; readonly #controllerNamespace: string;
  readonly #leaseApiGroup: string;
  readonly #policy: BusterRuntimeSecuritySettings;

  constructor(options: KubernetesRuntimeSecurityCapabilityInvokerOptions) {
    this.#policy = capturedOptions(options);
    this.#root = fs.realpathSync(options.workspaceRoot); this.#kubectl = fs.realpathSync(options.kubectlExecutable);
    fs.accessSync(this.#kubectl, fs.constants.X_OK); this.#controllerNamespace = options.controllerNamespace;
    this.#leaseApiGroup = options.leaseApiGroup;
  }

  async invoke(capability: string, request: unknown, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
    if (capability !== 'kubernetes.runtime-security') throw new Error('KUBERNETES_RUNTIME_SECURITY_CAPABILITY_DENIED');
    const value = object(request, 'KUBERNETES_RUNTIME_SECURITY_REQUEST_INVALID');
    if (value.operation !== 'inspect') throw new Error('KUBERNETES_RUNTIME_SECURITY_OPERATION_DENIED');
    const payload = object(value.payload, 'KUBERNETES_RUNTIME_SECURITY_REQUEST_INVALID');
    const leaseName = text(payload.leaseName, 'leaseName', 253); const namespace = text(payload.namespace, 'namespace', 63);
    if (!this.#policy.allowedNamespacePrefixes.some((prefix) => namespace.startsWith(`${prefix}-`))) throw new Error('KUBERNETES_RUNTIME_SECURITY_NAMESPACE_DENIED');
    const immutableImage = text(payload.immutableImage, 'immutableImage');
    const manifestPath = containedRuntimeSecurityManifest(this.#root, payload.manifestPath);
    const digest = text(payload.manifestDigest, 'manifestDigest', 71);
    const actualDigest = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex')}`;
    if (actualDigest !== digest) throw new Error('KUBERNETES_RUNTIME_SECURITY_MANIFEST_DIGEST_MISMATCH');
    const timeoutMs = Math.min(this.#policy.maximumExecutionMs,
      Number.isSafeInteger(payload.timeoutMs) ? Number(payload.timeoutMs) : this.#policy.maximumExecutionMs);
    const leaseResource = `busternamespaceleases.${this.#leaseApiGroup}`;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const lease = object(JSON.parse((await kubectl(this.#kubectl,
        ['get', leaseResource, leaseName, '-n', this.#controllerNamespace, '-o', 'json'],
        Math.max(1, deadline - Date.now()), this.#policy, signal)).toString('utf8')));
      const snapshot = runtimeSecuritySnapshot(lease, namespace);
      if (observationMatches(snapshot, digest, immutableImage, this.#policy)) {
        if (runtimeSecurityResultDigest(snapshot) !== snapshot.resultDigest) {
          throw new Error('KUBERNETES_RUNTIME_SECURITY_RESULT_DIGEST_MISMATCH');
        }
        return Object.freeze({ scanner: 'kubernetes-runtime-security', leaseName, namespace, manifestDigest: digest,
          observedAt: snapshot.observedAt, podCount: snapshot.podCount, serviceCount: snapshot.serviceCount,
          totalFindingCount: snapshot.totalFindingCount, omittedFindingCount: snapshot.omittedFindingCount,
          findings: snapshot.findings, resultDigest: snapshot.resultDigest });
      }
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => { clearTimeout(timer); reject(new Error('KUBERNETES_RUNTIME_SECURITY_CANCELLED')); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); },
          Math.min(this.#policy.pollIntervalMs, Math.max(1, deadline - Date.now())));
        signal.addEventListener('abort', onAbort, { once: true });
      });
    }
    throw new Error('KUBERNETES_RUNTIME_SECURITY_TIMEOUT');
  }
}

export function runtimeSecurityObservationIsFresh(value: unknown, nowMs: number, maximumAgeMs: number, maximumFutureSkewMs: number): boolean {
  if (typeof value !== 'string') return false;
  const observedMs = Date.parse(value);
  if (!Number.isFinite(observedMs)) return false;
  return observedMs <= nowMs + maximumFutureSkewMs && nowMs - observedMs <= maximumAgeMs;
}
