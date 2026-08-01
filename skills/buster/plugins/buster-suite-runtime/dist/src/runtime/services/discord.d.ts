import type { DiscordPayload } from './discord-artifacts.js';
type AnyRecord = Record<string, any>;
interface DiscordContext extends AnyRecord {
    module_id?: unknown;
    gate_id?: unknown;
    gate_type?: unknown;
    project?: unknown;
    run_id?: unknown;
    attempt?: unknown;
    dispatch_id?: unknown;
    session_key?: unknown;
    log_dir?: unknown;
    pipeline_log_path?: unknown;
    pipeline_run_log_path?: unknown;
    telemetry_context?: AnyRecord | null;
    telemetry_enabled?: boolean;
    impact?: unknown;
    action?: unknown;
    evidence?: unknown;
    actionability?: AnyRecord | null;
    webhook_url?: unknown;
    disableDiscordWebhooks?: boolean;
}
export declare function sendDiscord(message: AnyRecord | null | undefined, context?: DiscordContext): DiscordPayload | null;
export declare function deliverDiscordWebhookRequest(request?: AnyRecord, context?: DiscordContext): Promise<AnyRecord>;
export {};
