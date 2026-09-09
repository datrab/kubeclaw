import { runProcessInput } from './process-input.ts';
import { assertHandoffSourceRequest,existingExposureHandoff,exposureHandoffPatch } from './exposure-handoff.ts';
import { EXPOSURE_OWNER_ANNOTATION, EXPOSURE_REQUEST_ANNOTATION, EXPOSURE_PREDECESSORS_ANNOTATION, exposurePredecessors, exposureIdentity, generationObserved, assertExposureRequest, assertRequestedExposure, ownedReleaseAction } from './exposure-generation.ts';
import fs from 'node:fs';
import type { TestProviderCapabilityRequest } from '@kubeclaw/plugin-sdk';
import type { TestProviderCapabilityInvoker } from './runner.ts';

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const MAX_TIMER_MS = 2_147_483_647;
type JsonObject = Record<string, unknown>;
type Execute = (command: string, args: readonly string[], options: Readonly<Record<string, unknown>>)
  => Promise<{ stdout?: string; stderr?: string }>;

async function executeProcess(command: string, args: readonly string[], options: Readonly<Record<string, unknown>>): Promise<{ stdout: string; stderr: string }> {
  const result = await runProcessInput(command, args, {
    ...(options.env ? { env: options.env as NodeJS.ProcessEnv } : {}),
    ...(options.signal ? { signal: options.signal as AbortSignal } : {}),
    input: options.input as string | Buffer | null ?? null,
    timeoutMs: Number(options.timeout ?? 30_000), maximumOutputBytes: Number(options.maxBuffer ?? 1024 * 1024),
    prefix: 'TAILSCALE_EXPOSURE_KUBECTL',
  });
  const stdout = result.stdout.toString('utf8'); const stderr = result.stderr.toString('utf8');
  if (result.code !== 0) throw Object.assign(new Error(`TAILSCALE_EXPOSURE_KUBECTL_FAILED:${String(result.code)}:${String(result.signal)}`), { stdout, stderr });
  return { stdout, stderr };
}

export interface TailscaleExposureCapabilityInvokerOptions {
  readonly kubectlExecutable: string;
  readonly controllerNamespace: string;
  readonly leaseApiGroup: string;
  readonly leaseApiVersion: string;
  readonly allowedNamespacePrefixes: readonly string[];
  readonly allowedHostSuffixes: readonly string[];
  readonly maximumExecutionMs: number;
  readonly pollIntervalMs?: number;
  readonly execute?: Execute;
  readonly now?: () => Date;
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`TAILSCALE_EXPOSURE_REQUEST_INVALID:${label}`);
  return value as JsonObject;
}
function text(value: unknown, label: string, maximum = 1024): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || value.includes('\0')) {
    throw new Error(`TAILSCALE_EXPOSURE_REQUEST_INVALID:${label}`);
  }
  return value;
}
function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`TAILSCALE_EXPOSURE_REQUEST_INVALID:${label}`);
  }
  return Number(value);
}
function suffix(value: string): string {
  const normalized = value.toLowerCase();
  if (!/^\.[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(normalized) || normalized.includes('..')) {
    throw new Error('TAILSCALE_EXPOSURE_HOST_SUFFIX_INVALID');
  }
  return normalized;
}

export class TailscaleExposureCapabilityInvoker implements TestProviderCapabilityInvoker {
  readonly #kubectl: string;
  readonly #controllerNamespace: string;
  readonly #apiGroup: string;
  readonly #apiVersion: string;
  readonly #prefixes: readonly string[];
  readonly #suffixes: readonly string[];
  readonly #maximumExecutionMs: number;
  readonly #pollIntervalMs: number;
  readonly #execute: Execute;
  readonly #now: () => Date;
  readonly #environment: NodeJS.ProcessEnv;

  constructor(options: TailscaleExposureCapabilityInvokerOptions) {
    this.#kubectl = fs.realpathSync(options.kubectlExecutable);
    if (!fs.statSync(this.#kubectl).isFile()) throw new Error('TAILSCALE_EXPOSURE_KUBECTL_INVALID');
    if (!DNS_LABEL.test(options.controllerNamespace)) throw new Error('TAILSCALE_EXPOSURE_CONTROLLER_NAMESPACE_INVALID');
    if (!/^[a-z0-9.-]+$/u.test(options.leaseApiGroup) || !/^v[0-9]+(?:[a-z]+[0-9]+)?$/u.test(options.leaseApiVersion)) {
      throw new Error('TAILSCALE_EXPOSURE_API_INVALID');
    }
    if (!Array.isArray(options.allowedNamespacePrefixes) || options.allowedNamespacePrefixes.length < 1
      || options.allowedNamespacePrefixes.some((item) => !DNS_LABEL.test(item) || item.length > 42)) {
      throw new Error('TAILSCALE_EXPOSURE_NAMESPACE_POLICY_INVALID');
    }
    if (!Array.isArray(options.allowedHostSuffixes) || options.allowedHostSuffixes.length < 1) {
      throw new Error('TAILSCALE_EXPOSURE_HOST_POLICY_INVALID');
    }
    this.#controllerNamespace = options.controllerNamespace; this.#apiGroup = options.leaseApiGroup;
    this.#apiVersion = options.leaseApiVersion; this.#prefixes = [...new Set(options.allowedNamespacePrefixes)];
    this.#suffixes = [...new Set(options.allowedHostSuffixes.map(suffix))];
    this.#maximumExecutionMs = integer(options.maximumExecutionMs, 'maximumExecutionMs', 1, MAX_TIMER_MS);
    this.#pollIntervalMs = integer(options.pollIntervalMs ?? 1000, 'pollIntervalMs', 10, this.#maximumExecutionMs);
    this.#execute = options.execute ?? executeProcess; this.#now = options.now ?? (() => new Date());
    this.#environment = { PATH: process.env.PATH, KUBECONFIG: process.env.KUBECONFIG,
      KUBERNETES_SERVICE_HOST: process.env.KUBERNETES_SERVICE_HOST,
      KUBERNETES_SERVICE_PORT: process.env.KUBERNETES_SERVICE_PORT };
  }

  #namespace(value: unknown): string {
    const namespace = text(value, 'namespace', 63);
    if (!DNS_LABEL.test(namespace) || !this.#prefixes.some((prefix) => namespace === prefix || namespace.startsWith(`${prefix}-`))) {
      throw new Error('TAILSCALE_EXPOSURE_NAMESPACE_DENIED');
    }
    return namespace;
  }
  async #run(args: readonly string[], input: string | null, signal: AbortSignal, timeout = this.#maximumExecutionMs): Promise<string> {
    if (signal.aborted) throw new Error('TAILSCALE_EXPOSURE_CANCELLED');
    try {
      const result = await this.#execute(this.#kubectl, args, { input, signal, timeout: Math.min(timeout, this.#maximumExecutionMs),
        maxBuffer: 1024 * 1024, env: this.#environment });
      return String(result.stdout ?? '');
    } catch (error) {
      if (signal.aborted) throw new Error('TAILSCALE_EXPOSURE_CANCELLED');
      throw error;
    }
  }
  async #lease(name: string, signal: AbortSignal, timeout = this.#maximumExecutionMs): Promise<JsonObject> {
    return object(JSON.parse(await this.#run(['get', 'busternamespacelease', name, '-n', this.#controllerNamespace, '-o', 'json'], null, signal, timeout)), 'lease');
  }
  async #wait(name: string, expected: 'Ready' | 'Off', owner: string, signal: AbortSignal, timeoutMs: number): Promise<JsonObject> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (signal.aborted) throw new Error('TAILSCALE_EXPOSURE_CANCELLED');
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('TAILSCALE_EXPOSURE_READINESS_TIMEOUT');
      const lease = await this.#lease(name, signal, remaining); const status = object(lease.status ?? {}, 'lease.status');
      const annotations = object(object(lease.metadata, 'lease.metadata').annotations ?? {}, 'lease.annotations');
      if (annotations[EXPOSURE_OWNER_ANNOTATION] !== owner) throw new Error('TAILSCALE_EXPOSURE_LEASE_CHANGED');
      if (Date.now() >= deadline) throw new Error('TAILSCALE_EXPOSURE_READINESS_TIMEOUT');
      if (generationObserved(lease, owner, expected)) return lease;
      if (status.phase === 'Failed' || status.exposurePhase === 'Failed') throw new Error(`TAILSCALE_EXPOSURE_CONTROLLER_FAILED:${String(status.message ?? 'unknown')}`);
      if (Date.now() >= deadline) throw new Error('TAILSCALE_EXPOSURE_READINESS_TIMEOUT');
      await new Promise<void>((resolve, reject) => {
        const finish = () => { signal.removeEventListener('abort', cancel); resolve(); };
        const timer = setTimeout(finish, Math.min(this.#pollIntervalMs, Math.max(1, deadline - Date.now())));
        const cancel = () => { clearTimeout(timer); reject(new Error('TAILSCALE_EXPOSURE_CANCELLED')); };
        signal.addEventListener('abort', cancel, { once: true });
      });
    }
  }
  #verifyLease(lease: JsonObject, payload: JsonObject, namespace: string): { serviceName: string; servicePort: number; expiresAt: string } {
    const metadata = object(lease.metadata, 'lease.metadata'); const spec = object(lease.spec, 'lease.spec');
    const status = object(lease.status, 'lease.status');
    if (metadata.name !== payload.leaseName || spec.namespaceName !== namespace || status.namespaceName !== namespace
      || spec.serviceName !== payload.serviceName || Number(spec.servicePort) !== Number(payload.servicePort) || status.phase !== 'Ready') {
      throw new Error('TAILSCALE_EXPOSURE_LEASE_MISMATCH');
    }
    const expiresAt = text(status.expiresAt, 'expiresAt', 64);
    const declaredExpiresAt = text(payload.expiresAt, 'payload.expiresAt', 64);
    if (expiresAt !== declaredExpiresAt) throw new Error('TAILSCALE_EXPOSURE_LEASE_MISMATCH');
    if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= this.#now().getTime()) throw new Error('TAILSCALE_EXPOSURE_LEASE_EXPIRED');
    return { serviceName: text(spec.serviceName, 'serviceName', 63),
      servicePort: integer(spec.servicePort, 'servicePort', 1, 65535), expiresAt };
  }
  async #rollbackFailedPrepare(leaseName: string, owner: string, originalError: unknown): Promise<void> {
    const timeoutMs = Math.min(15_000, this.#maximumExecutionMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const lease = await this.#lease(leaseName, controller.signal);
      const metadata = object(lease.metadata, 'lease.metadata');
      const annotations = object(metadata.annotations ?? {}, 'lease.metadata.annotations');
      if (annotations[EXPOSURE_OWNER_ANNOTATION] !== owner) return;
      const resourceVersion = text(metadata.resourceVersion, 'lease.metadata.resourceVersion', 64);
      const patch = JSON.stringify({
        metadata: { resourceVersion },
        spec: { purpose: 'gate', exposure: { provider: 'off' } },
      });
      await this.#run(['patch', 'busternamespacelease', leaseName, '-n', this.#controllerNamespace,
        '--type=merge', '-p', patch], null, controller.signal, timeoutMs);
    } catch (rollbackError) {
      throw new AggregateError([originalError, rollbackError], 'TAILSCALE_EXPOSURE_ROLLBACK_FAILED');
    } finally {
      clearTimeout(timer);
    }
  }
  #prepareInput(payload:JsonObject) {
    if(payload.retentionMode!==undefined&&payload.retentionMode!=='await-readiness')throw new Error('EXPOSURE_RETENTION_MODE_INVALID');
    const leaseName = text(payload.leaseName, 'leaseName', 63); if (!DNS_LABEL.test(leaseName)) throw new Error('TAILSCALE_EXPOSURE_LEASE_NAME_INVALID');
    const namespace = this.#namespace(payload.namespace); const timeoutMs = integer(payload.readinessTimeoutMs, 'readinessTimeoutMs', 1, this.#maximumExecutionMs);
    const path = text(payload.path, 'path', 1024);
    if (!path.startsWith('/') || path.startsWith('//') || /[\r\n?#]/u.test(path)) throw new Error('TAILSCALE_EXPOSURE_PATH_INVALID');
    const hostname = payload.hostname === undefined ? undefined : text(payload.hostname, 'hostname', 63);
    if (hostname !== undefined && !DNS_LABEL.test(hostname)) throw new Error('TAILSCALE_EXPOSURE_HOSTNAME_INVALID');
    return {leaseName,namespace,timeoutMs,path,hostname};
  }
  async #prepare(payload: JsonObject, resourceId: string, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
    const {leaseName,namespace,timeoutMs,path,hostname}=this.#prepareInput(payload);
    const resource = `busternamespaceleases.${this.#apiGroup}`;
    for (const verb of ['get', 'patch']) {
      const allowed = (await this.#run(['auth', 'can-i', verb, resource, '-n', this.#controllerNamespace], null, signal, 15_000)).trim();
      if (allowed !== 'yes') throw new Error(`TAILSCALE_EXPOSURE_RBAC_DENIED:${verb}`);
    }
    const before = await this.#lease(leaseName, signal); const verified = this.#verifyLease(before, payload, namespace);
    const identity = exposureIdentity(resourceId, payload); const { owner } = identity;
    assertHandoffSourceRequest(before,identity);
    const pending = payload.retentionMode === 'await-readiness' ? existingExposureHandoff(before,identity) : undefined;
    if(pending){
      assertRequestedExposure(before,payload);
      const ready=await this.#wait(leaseName,'Ready',pending.owner,signal,timeoutMs);
      this.#verifyLease(ready,payload,namespace);
      const {urlText,publicHost}=this.#publicURL(object(ready.status,'lease.status'),path,hostname);
      return {ok:true,leaseName,namespace,url:urlText,hostname:publicHost,createdAt:object(ready.status,'lease.status').createdAt,expiresAt:verified.expiresAt,
        releaseAction:ownedReleaseAction(leaseName,this.#controllerNamespace,pending.owner),handoff:pending};
    }
    assertExposureRequest(before, identity);
    const metadata = object(before.metadata, 'lease.metadata');
    const resourceVersion = text(metadata.resourceVersion, 'lease.resourceVersion', 64);
    const alreadyOwned = object(metadata.annotations ?? {}, 'lease.annotations')[EXPOSURE_OWNER_ANNOTATION] === owner;
    if (alreadyOwned) assertRequestedExposure(before, payload);
    const patch = { metadata: { resourceVersion, annotations: { [EXPOSURE_OWNER_ANNOTATION]: owner,
      [EXPOSURE_REQUEST_ANNOTATION]: identity.request, [EXPOSURE_PREDECESSORS_ANNOTATION]: exposurePredecessors(before) } },
      spec: { purpose: 'final-preview', exposure: { provider: 'tailscale-ingress',
        serviceName: verified.serviceName, servicePort: verified.servicePort, path, hostname: hostname ?? null } } };
    try {
      if (!alreadyOwned) await this.#run(['patch', 'busternamespacelease', leaseName, '-n', this.#controllerNamespace,
        '--type=merge', '-p', JSON.stringify(patch)], null, signal, 15_000);
      const ready = await this.#wait(leaseName, 'Ready', owner, signal, timeoutMs);
      assertRequestedExposure(ready, payload);
      this.#verifyLease(ready, payload, namespace);
      const status = object(ready.status, 'lease.status');
      const { urlText, publicHost } = this.#publicURL(status, path, hostname);
      let handoff;
      if(payload.retentionMode==='await-readiness'){
        const transfer=exposureHandoffPatch(ready,identity);
        await this.#run(['patch','busternamespacelease',leaseName,'-n',this.#controllerNamespace,'--type=merge','-p',JSON.stringify(transfer.patch)],null,signal,15_000);
        const transferred=await this.#wait(leaseName,'Ready',transfer.handoff.owner,signal,timeoutMs);
        this.#verifyLease(transferred,payload,namespace);assertRequestedExposure(transferred,payload);
        handoff=existingExposureHandoff(transferred,identity);
      }
      return Object.freeze({ ok: true, leaseName, namespace, url: urlText, hostname: publicHost,
        createdAt: text(status.createdAt, 'createdAt', 64), expiresAt: verified.expiresAt,
        releaseAction: ownedReleaseAction(leaseName, this.#controllerNamespace, handoff?.owner ?? owner),...(handoff?{handoff}:{}) });
    } catch (error) {
      await this.#rollbackFailedPrepare(leaseName, owner, error);
      throw error;
    }
  }
  #publicURL(status: JsonObject, path: string, hostname: string | undefined): { urlText: string; publicHost: string } {
    const urlText = text(status.previewUrl, 'previewUrl', 2048); const url = new URL(urlText);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.origin + url.pathname !== urlText) {
      throw new Error('TAILSCALE_EXPOSURE_URL_INVALID');
    }
    const publicHost = url.hostname.toLowerCase();
    if (!this.#suffixes.some((item) => publicHost.endsWith(item) && publicHost.length > item.length)) throw new Error('TAILSCALE_EXPOSURE_HOST_DENIED');
    if (status.exposureHostname !== publicHost || url.pathname !== path
      || (hostname !== undefined && publicHost !== hostname && !publicHost.startsWith(`${hostname}.`))) throw new Error('TAILSCALE_EXPOSURE_HOST_MISMATCH');
    return { urlText, publicHost };
  }
  async #release(payload: JsonObject, resourceId: string, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
    const leaseName = text(payload.leaseName, 'leaseName', 63); if (!DNS_LABEL.test(leaseName)) throw new Error('TAILSCALE_EXPOSURE_LEASE_NAME_INVALID');
    const namespace = this.#namespace(payload.namespace);
    const before = await this.#lease(leaseName, signal);
    const identity = exposureIdentity(resourceId, payload);
    const metadata = object(before.metadata, 'lease.metadata');
    const annotations = object(metadata.annotations ?? {}, 'lease.annotations');
    if (annotations[EXPOSURE_OWNER_ANNOTATION] !== identity.owner) return Object.freeze({ ok: true, leaseName, released: false, superseded: true });
    assertExposureRequest(before, identity);
    const verified = this.#verifyLease(before, payload, namespace);
    const resourceVersion = text(metadata.resourceVersion, 'lease.resourceVersion', 64);
    const patch = JSON.stringify({ metadata: { resourceVersion }, spec: { purpose: 'gate', exposure: { provider: 'off' } } });
    await this.#run(['patch', 'busternamespacelease', leaseName, '-n', this.#controllerNamespace, '--type=merge', '-p', patch], null, signal, 15_000);
    const released = await this.#wait(leaseName, 'Off', identity.owner, signal, this.#maximumExecutionMs);
    const status = object(released.status, 'lease.status');
    if (status.namespaceName !== namespace || status.expiresAt !== verified.expiresAt) throw new Error('TAILSCALE_EXPOSURE_LEASE_CHANGED');
    return Object.freeze({ ok: true, leaseName, released: true });
  }
  async invoke(capability: string, request: TestProviderCapabilityRequest, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
    if (capability !== 'kubernetes.exposure' || request.resource.type !== 'kubernetes.exposure'
      || !/^kubernetes-exposure:attempt:[A-Za-z0-9._:-]+$/u.test(request.resource.canonicalId)) {
      throw new Error('TAILSCALE_EXPOSURE_CAPABILITY_REQUEST_INVALID');
    }
    const payload = object(request.payload, 'payload');
    if (request.operation === 'prepare') return this.#prepare(payload, request.resource.canonicalId, signal);
    if (request.operation === 'release') return this.#release(payload, request.resource.canonicalId, signal);
    throw new Error('TAILSCALE_EXPOSURE_OPERATION_INVALID');
  }
}
