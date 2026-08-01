export declare const DEFAULT_SWARM_CONFIG_PATH = "/home/node/.openclaw/swarm.config.json";
export declare function isCompactSwarmConfig(config: any): boolean;
export declare function expandSwarmConfig(rawConfig: any): any;
export declare function normalizeSwarmConfigInPlace(config: any): any;
export declare function discoverPlatformSwarmConfigCandidates(): string[];
export declare function discoverSwarmConfigPath(candidates?: string[]): string;
export declare function loadPlatformSwarmConfig(configPath?: string): {
    path: string;
    config: any;
};
