import crypto from 'node:crypto';
import type { AdapterInstance, CapabilityInvocation, PackageResolution } from '@kubeclaw/plugin-sdk';
import type { AdapterRuntimeOptions } from './adapters.ts';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function requestDigest(request: CapabilityInvocation): string { return crypto.createHash('sha256').update(canonical(request)).digest('hex'); }
export function adapterOwner(runtime: AdapterRuntimeOptions, adapterId: string): PackageResolution {
  const entry = runtime.granted.snapshot.adapters.get(adapterId); if (!entry) throw new Error(`ADAPTER_UNKNOWN:${adapterId}`);
  return { ...entry.package.provenance.package, registrationId: entry.registration.id };
}
export async function withAdapterStartupTimeout<T>(adapterId: string, phase: 'activate' | 'ready', timeoutMs: number, operation: () => T | PromiseLike<T>, onTimeout: (error: Error) => void): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { const error = new Error(`ADAPTER_START_TIMEOUT:${adapterId}:${phase}`); onTimeout(error); reject(error); }, timeoutMs); });
  try { return await Promise.race([Promise.resolve().then(operation), timeout]); } finally { if (timer) clearTimeout(timer); }
}
export async function shutdownLateAdapter(instance: AdapterInstance, timeoutMs: number): Promise<void> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(new Error('ADAPTER_LATE_ACTIVATION_SHUTDOWN_TIMEOUT')), timeoutMs);
  try { await instance.shutdown(controller.signal); }
  catch { /* INTENTIONAL_NONCRITICAL(late_adapter_cleanup): Startup timeout is authoritative; late cleanup is best effort. */ }
  finally { clearTimeout(timer); }
}
