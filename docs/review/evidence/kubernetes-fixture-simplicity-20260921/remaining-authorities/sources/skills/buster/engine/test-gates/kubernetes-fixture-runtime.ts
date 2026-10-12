import path from 'node:path';
import { assertGeneratedCredentialLease, generatedDemoCredentials } from './generated-demo-credentials.ts';
import { object, text, DNS_LABEL } from './kubernetes-fixture-values.ts';
import { KubernetesFixtureSettings, type KubernetesFixtureCapabilityInvokerOptions } from './kubernetes-fixture-settings.ts';
import { KubernetesFixtureReadiness } from './kubernetes-fixture-readiness.ts';
import { KubernetesFixturePreparation } from './kubernetes-fixture-preparation.ts';
import type { TestProviderCapabilityRequest } from '@kubeclaw/plugin-sdk';
import type { TestProviderCapabilityInvoker } from './runner.ts';
export type { KubernetesFixtureCapabilityInvokerOptions } from './kubernetes-fixture-settings.ts';
function detail(error: unknown): string {
    if (error && typeof error === 'object') {
        const stderr = (error as Record<string, unknown>).stderr;
        if (typeof stderr === 'string' && stderr.trim())
            return stderr.trim().slice(0, 4096);
    }
    return (error instanceof Error ? error.message : String(error)).slice(0, 4096);
}
export class KubernetesFixtureCapabilityInvoker implements TestProviderCapabilityInvoker {
    readonly #settings: KubernetesFixtureSettings;
    readonly #preparation: KubernetesFixturePreparation;
    constructor(options: KubernetesFixtureCapabilityInvokerOptions) {
        this.#settings = new KubernetesFixtureSettings(options);
        const run = this.#kubectlRun.bind(this);
        const readiness = new KubernetesFixtureReadiness(this.#settings, run);
        this.#preparation = new KubernetesFixturePreparation(this.#settings, {
            run, readiness,
            generatedCredentials: this.#generatedCredentials.bind(this),
            releaseAfterPrepareFailure: this.#releaseAfterPrepareFailure.bind(this),
        });
    }
    async #kubectlRun(args: readonly string[], input: Buffer | string | null, signal: AbortSignal, timeout = this.#settings.maximumExecutionMs): Promise<string> {
        try {
            const result = await this.#settings.execute(this.#settings.kubectl, args, {
                encoding: 'utf8', maxBuffer: this.#settings.maximumManifestBytes * 2, timeout: Math.min(timeout, this.#settings.maximumExecutionMs),
                signal, ...(input === null ? {} : { input }),
                env: { PATH: path.dirname(this.#settings.kubectl), HOME: process.env.HOME, KUBECONFIG: process.env.KUBECONFIG,
                    KUBERNETES_SERVICE_HOST: process.env.KUBERNETES_SERVICE_HOST,
                    KUBERNETES_SERVICE_PORT: process.env.KUBERNETES_SERVICE_PORT },
            });
            return result.stdout ?? '';
        }
        catch (error) {
            if (signal.aborted)
                throw new Error('KUBERNETES_FIXTURE_CANCELLED', { cause: error });
            throw new Error(`KUBERNETES_FIXTURE_KUBECTL_FAILED:${detail(error)}`, { cause: error });
        }
    }
    async #releaseAfterPrepareFailure(leaseName: string): Promise<void> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.#settings.maximumExecutionMs);
        try {
            await this.#release(leaseName, controller.signal);
        }
        finally {
            clearTimeout(timer);
        }
    }
    async #generatedCredentials(expected: Parameters<typeof generatedDemoCredentials>[2], signal: AbortSignal) {
        const resource = `busternamespaceleases.${this.#settings.apiGroup}`;
        const freshLease = JSON.parse(await this.#kubectlRun(['get', resource, expected.leaseName, '-n', this.#settings.controllerNamespace, '-o', 'json'], null, signal, 15_000));
        assertGeneratedCredentialLease(freshLease, expected);
        let secret;
        // Until UID and bytes are verified, subprocess diagnostics must not expose Secret content.
        try {
            secret = JSON.parse(await this.#kubectlRun(['get', 'secret', expected.secretName, '-n', expected.namespace, '-o', 'json'], null, signal, 15_000));
        }
        catch {
            throw new Error('DEMO_CREDENTIAL_SECRET_READ_FAILED');
        }
        return generatedDemoCredentials(freshLease, secret, expected);
    }
    async #release(leaseName: string, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
        if (!DNS_LABEL.test(leaseName))
            throw new Error('KUBERNETES_FIXTURE_LEASE_NAME_INVALID');
        await this.#kubectlRun(['delete', 'busternamespacelease', leaseName, '-n', this.#settings.controllerNamespace,
            '--ignore-not-found=true', '--wait=true', `--timeout=${Math.ceil(this.#settings.maximumExecutionMs / 1_000)}s`], null, signal);
        return Object.freeze({ ok: true, leaseName, released: true });
    }
    async invoke(capability: string, request: TestProviderCapabilityRequest, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
        if (capability !== 'kubernetes.fixture' || request.resource.type !== 'kubernetes.fixture'
            || !/^kubernetes-fixture:attempt:[A-Za-z0-9._:-]+$/u.test(request.resource.canonicalId)) {
            throw new Error('KUBERNETES_FIXTURE_CAPABILITY_REQUEST_INVALID');
        }
        if (request.operation === 'prepare')
            return this.#preparation.prepare(request, signal);
        if (request.operation === 'release') {
            const payload = object(request.payload, 'payload');
            return this.#release(text(payload.leaseName, 'leaseName', 63), signal);
        }
        throw new Error('KUBERNETES_FIXTURE_OPERATION_INVALID');
    }
}
