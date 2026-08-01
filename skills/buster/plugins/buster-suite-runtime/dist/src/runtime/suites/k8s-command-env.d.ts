export type K8sCommandEnv = Record<string, string | undefined>;
export declare function buildK8sCommandEnv(kubeconfigPath: string | null): K8sCommandEnv;
export declare function execFileWithInput(command: string, args: string[], input: string, options?: Record<string, any>): Promise<{
    stdout: string;
    stderr: string;
}>;
