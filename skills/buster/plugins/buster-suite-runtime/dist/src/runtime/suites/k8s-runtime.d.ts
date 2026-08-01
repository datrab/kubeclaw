import type { K8sCommandEnv } from './k8s-command-env.js';
import type { SuiteLog } from './k8s-base.js';
export declare function applyManifests(manifestPaths: string[], imageName: string, registryTag: string, targetNs: string, timeoutMs: number, log: SuiteLog, env: K8sCommandEnv): Promise<void>;
export declare function waitForPods(ns: string, timeoutSeconds: number, log: SuiteLog, env: K8sCommandEnv): Promise<void>;
export declare function getPodStatus(ns: string, env: K8sCommandEnv): Promise<string>;
export declare function shouldUsePortForwardHealthCheck({ purpose, previewExposureProvider }: {
    purpose: string;
    previewExposureProvider: string;
}): boolean;
export declare function retryHttpHealthCheck(url: string, log: SuiteLog, retries: number, baseDelayMs: number): Promise<number>;
export declare function retryHttpTextCheck(url: string, expectedText: string | null, log: SuiteLog, retries: number, baseDelayMs: number): Promise<{
    body: string;
    statusCode: number;
}>;
