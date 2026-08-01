import type { SuiteStatus, SuiteVerdict } from '../services/verdict-schema.js';
import type { VisualDiscordDeliveryResult } from './visual-reg-discord.js';
import type { MultiPathResult, PageResult } from './visual-reg-multi.js';
type Log = (message: string) => void;
export declare function summarizeDiscordDelivery(results?: VisualDiscordDeliveryResult[]): Record<string, unknown>;
export declare function resolveVisualRegOverallStatus(results: Array<{
    status: SuiteStatus;
}>, enforced?: boolean): SuiteStatus;
export declare function deliverVisualResults(input: {
    moduleId: string;
    pageResults: PageResult[];
    status: SuiteStatus;
    enforced: boolean;
    mode: string;
    webhookUrl: string;
    capabilitySkip: VisualDiscordDeliveryResult | null;
    deliveryContext: Record<string, unknown>;
    log: Log;
}): Promise<{
    deliveries: VisualDiscordDeliveryResult[];
    discordMode: string;
}>;
export declare function finalizeVisualReg(input: {
    startTime: number;
    result: MultiPathResult;
    status: SuiteStatus;
    enforced: boolean;
    mode: string;
    thresholds: Record<string, unknown> | null;
    pathsTotal: number;
    baselineDir: string;
    discordMode: string;
    deliveries: VisualDiscordDeliveryResult[];
    moduleId: string;
    telemetryContext: unknown;
    log: Log;
}): Promise<SuiteVerdict>;
export {};
