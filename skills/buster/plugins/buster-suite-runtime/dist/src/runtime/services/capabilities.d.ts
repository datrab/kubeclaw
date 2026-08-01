export declare const BUSTER_CAPABILITIES: Readonly<{
    IMAGE_BUILD: "image_build";
    KUBERNETES: "kubernetes";
    BROWSER_AUTOMATION: "browser_automation";
    LIGHTHOUSE: "lighthouse";
    DISCORD_MEDIA: "discord_media";
}>;
export declare const KNOWN_BUSTER_CAPABILITIES: readonly ("image_build" | "kubernetes" | "browser_automation" | "lighthouse" | "discord_media")[];
type AnyRecord = Record<string, any>;
export declare class BusterCapabilityDeniedError extends Error {
    code: string;
    details: Record<string, any>;
    suite?: string;
    action?: string;
    missing_capabilities: string[];
    constructor(message: string, details?: Record<string, any>);
}
export declare function normalizeBusterCapabilities(value?: unknown): string[];
export declare function unsupportedBusterCapabilities(value?: unknown): string[];
export declare function parseCapabilitiesFromEnv(env: Record<string, unknown>, key: string): string[];
export declare function resolveContextCapabilities(context?: AnyRecord): string[];
export declare function requiredCapabilitiesForSuite(suiteName: string, _context?: Record<string, any>): string[];
export declare function appendDurableOperatorAlert(context?: Record<string, any>, alert?: Record<string, any>): Record<string, any>;
export declare function assertBusterCapabilities(context?: Record<string, any>, { suite, action, required }?: Record<string, any>): {
    ok: true;
    capabilities: string[];
};
export {};
