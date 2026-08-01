import type { K8sCommandEnv } from './k8s-command-env.js';
type SuiteLog = (message: string) => void;
export declare function buildLocalServiceHealthUrl(localPort: number, healthPath: string): string;
export declare function startServicePortForward(ns: string, serviceName: string, servicePort: number, healthPath: string, log: SuiteLog, env: K8sCommandEnv): Promise<{
    localPort: number;
    url: string;
    stop: () => Promise<void>;
}>;
export declare function withServicePortForward<T>(ns: string, serviceName: string, servicePort: number, healthPath: string, log: SuiteLog, env: K8sCommandEnv, action: (url: string) => Promise<T>): Promise<T>;
export {};
