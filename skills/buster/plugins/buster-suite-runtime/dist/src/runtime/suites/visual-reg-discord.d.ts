import type { SuiteStatus } from '../services/verdict-schema.js';
type LogFn = (msg: string) => void;
type AnyRecord = Record<string, any>;
interface DeliveryContextOptions {
    deliveryContext?: AnyRecord | null;
    telemetryContext?: unknown;
}
interface DiscordOptions extends DeliveryContextOptions {
    webhookUrl?: string;
    discordDiffThreshold?: number;
    log?: LogFn;
}
export interface VisualDiscordDeliveryResult {
    status: 'skipped_no_webhook' | 'skipped_capability' | 'sent' | 'failed_noncritical';
    sent: boolean;
    error?: string;
}
interface VisualPageResult {
    name: string;
    status: SuiteStatus;
    diffPercent: number | null;
    diffPath?: string | null;
}
export declare function deliverySkippedCapability(error: unknown): VisualDiscordDeliveryResult;
export declare function discordSummary(moduleId: string, pageResults: VisualPageResult[], overallStatus: SuiteStatus, enforced: boolean, { webhookUrl, discordDiffThreshold, log, deliveryContext, telemetryContext }?: DiscordOptions): Promise<VisualDiscordDeliveryResult>;
export declare function discordSingle(moduleId: string, pageName: string, actualPath: string, diffPath: string | null, diffPercent: number, status: SuiteStatus | 'APP_SCREENSHOT' | 'NEW_BASELINE', { webhookUrl, log, deliveryContext, telemetryContext }?: DiscordOptions): Promise<VisualDiscordDeliveryResult>;
export {};
