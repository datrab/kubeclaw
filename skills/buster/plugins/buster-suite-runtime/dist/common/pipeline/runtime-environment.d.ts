export type CommonEnvironmentKey = 'OPENCLAW_GATEWAY_TOKEN' | 'OPENCLAW_GATEWAY_URL' | 'REPO_ROOT' | 'SWARM_CONFIG';
export declare function readCommonEnvironment(key: CommonEnvironmentKey, env?: Record<string, string | undefined>): string | undefined;
export declare function commonEnvironmentSnapshot(): Record<string, string | undefined>;
