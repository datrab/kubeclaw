import { object, type JsonObject } from './kubernetes-fixture-values.ts';
import type { KubernetesFixtureSettings } from './kubernetes-fixture-settings.ts';
export type KubectlRun = (args: readonly string[], input: Buffer | string | null, signal: AbortSignal, timeout?: number) => Promise<string>;
function waitForPoll(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const finish = (): void => {
            signal.removeEventListener('abort', abort);
            resolve();
        };
        const timer = setTimeout(finish, milliseconds);
        const abort = (): void => {
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
            reject(new Error('KUBERNETES_FIXTURE_CANCELLED'));
        };
        if (signal.aborted)
            abort();
        else
            signal.addEventListener('abort', abort, { once: true });
    });
}
export class KubernetesFixtureReadiness {
    readonly #settings: KubernetesFixtureSettings;
    readonly #run: KubectlRun;
    constructor(settings: KubernetesFixtureSettings, run: KubectlRun) {
        this.#settings = settings;
        this.#run = run;
    }
    async waitLease(leaseName: string, signal: AbortSignal, timeoutMs: number): Promise<JsonObject> {
        const deadline = Date.now() + timeoutMs;
        let last = 'Pending';
        while (Date.now() < deadline) {
            const requestTimeoutMs = Math.max(1, Math.min(15_000, deadline - Date.now()));
            const raw = await this.#run(['get', 'busternamespacelease', leaseName, '-n', this.#settings.controllerNamespace, '-o', 'json'], null, signal, requestTimeoutMs);
            const value = object(JSON.parse(raw), 'lease');
            const status = object(value.status ?? {}, 'lease.status');
            const phase = typeof status.phase === 'string' ? status.phase : 'Pending';
            last = typeof status.message === 'string' ? status.message : phase;
            if (phase === 'Ready')
                return status;
            if (phase === 'Rejected')
                throw new Error(`KUBERNETES_FIXTURE_LEASE_REJECTED:${last}`);
            if (phase === 'Failed')
                throw new Error(`KUBERNETES_FIXTURE_LEASE_FAILED:${last}`);
            const pollMs = Math.min(this.#settings.pollIntervalMs, Math.max(0, deadline - Date.now()));
            if (pollMs > 0)
                await waitForPoll(pollMs, signal);
        }
        throw new Error(`KUBERNETES_FIXTURE_LEASE_TIMEOUT:${last}`);
    }
    async waitPods(namespace: string, signal: AbortSignal, timeoutMs: number): Promise<number> {
        const deadline = Date.now() + timeoutMs;
        let last = 'No pods found.';
        while (Date.now() < deadline) {
            const requestTimeoutMs = Math.max(1, Math.min(15_000, deadline - Date.now()));
            const raw = await this.#run(['get', 'pods', '-n', namespace, '-o', 'json'], null, signal, requestTimeoutMs);
            const value = object(JSON.parse(raw), 'pods');
            const items = Array.isArray(value.items) ? value.items : [];
            if (items.length > 0) {
                const pending: string[] = [];
                collectPendingPods(items, pending);
                if (pending.length === 0)
                    return items.length;
                last = `Pods not ready: ${pending.join(', ')}`;
            }
            const pollMs = Math.min(this.#settings.pollIntervalMs, Math.max(0, deadline - Date.now()));
            if (pollMs > 0)
                await waitForPoll(pollMs, signal);
        }
        throw new Error(`KUBERNETES_FIXTURE_READINESS_TIMEOUT:${last}`);
    }
    async waitService(namespace: string, serviceName: string, servicePort: number, signal: AbortSignal, timeoutMs: number): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        let last = 'Service endpoints not ready.';
        while (Date.now() < deadline) {
            const serviceTimeoutMs = Math.max(1, Math.min(15_000, deadline - Date.now()));
            const serviceRaw = await this.#run(['get', 'service', serviceName, '-n', namespace, '-o', 'json'], null, signal, serviceTimeoutMs);
            const service = object(JSON.parse(serviceRaw), 'service');
            const spec = object(service.spec, 'service.spec');
            const ports = Array.isArray(spec.ports) ? spec.ports : [];
            const servicePortEntry = ports.map((entry) => object(entry, 'service.port'))
                .find((entry) => entry.port === servicePort);
            if (!servicePortEntry)
                throw new Error('KUBERNETES_FIXTURE_SERVICE_PORT_MISMATCH');
            const servicePortName = typeof servicePortEntry.name === 'string' ? servicePortEntry.name : null;
            const targetPort = servicePortEntry.targetPort ?? servicePortEntry.port;
            if (Date.now() >= deadline)
                break;
            try {
                const endpointsTimeoutMs = Math.max(1, Math.min(15_000, deadline - Date.now()));
                const endpointsRaw = await this.#run(['get', 'endpoints', serviceName, '-n', namespace, '-o', 'json'], null, signal, endpointsTimeoutMs);
                const endpoints = object(JSON.parse(endpointsRaw), 'endpoints');
                const subsets = Array.isArray(endpoints.subsets) ? endpoints.subsets : [];
                const ready = subsets.some((entry) => {
                    const subset = object(entry, 'endpoints.subset');
                    const endpointPorts = Array.isArray(subset.ports) ? subset.ports.map((port) => object(port, 'endpoints.port')) : [];
                    const hasConfiguredPort = endpointPorts.some((port) => servicePortName
                        ? port.name === servicePortName
                        : (Number.isSafeInteger(targetPort) ? port.port === targetPort : ports.length === 1));
                    return Array.isArray(subset.addresses) && subset.addresses.length > 0
                        && hasConfiguredPort;
                });
                if (ready && Date.now() < deadline)
                    return;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (!/\bNotFound\b|\bnot found\b/iu.test(message))
                    throw error;
            }
            last = `Service ${serviceName} has no ready endpoints.`;
            const pollMs = Math.min(this.#settings.pollIntervalMs, Math.max(0, deadline - Date.now()));
            if (pollMs > 0)
                await waitForPoll(pollMs, signal);
        }
        throw new Error(`KUBERNETES_FIXTURE_SERVICE_READINESS_TIMEOUT:${last}`);
    }
}
function collectPendingPods(items: unknown[], pending: string[]): void {
    for (const rawPod of items) {
        const pod = object(rawPod, 'pod');
        const metadata = object(pod.metadata, 'pod.metadata');
        const status = object(pod.status ?? {}, 'pod.status');
        const conditions = Array.isArray(status.conditions) ? status.conditions : [];
        const ready = conditions.some((condition) => {
            const item = condition && typeof condition === 'object' && !Array.isArray(condition) ? condition as JsonObject : {};
            return item.type === 'Ready' && item.status === 'True';
        });
        if (!ready)
            pending.push(String(metadata.name ?? 'unknown'));
    }
}
