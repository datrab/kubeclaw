export type DiscordRecord = Record<string, any>;
interface DiscordField {
    name?: unknown;
    value?: unknown;
    inline?: boolean;
}
export interface DiscordEmbed extends DiscordRecord {
    fields?: DiscordField[];
}
export interface DiscordPayload {
    content?: unknown;
    embeds?: DiscordEmbed[];
    files?: unknown[];
}
export interface DiscordCorrelation extends DiscordRecord {
    module_id: string | null;
    gate_id: string | null;
    gate_type: string | null;
    project: string | null;
    run_id: string | null;
    attempt: string | number | null;
    dispatch_id: string | null;
    session_key: string | null;
    impact: string | null;
    action: string | null;
    evidence: string | null;
    log_dir: string | null;
    pipeline_log_path: string | null;
    pipeline_run_log_path: string | null;
    telemetry_context: DiscordRecord | null;
    telemetry_enabled: boolean | undefined;
    webhook_url: string | null;
}
export declare function resolveDiscordAuditTargets(correlation?: Partial<DiscordCorrelation>): string[];
export declare function resolveDiscordDeliveryReceiptTargets(correlation?: Partial<DiscordCorrelation>): string[];
interface ArtifactCallbacks {
    auditTargets(correlation: DiscordCorrelation): string[];
    receiptTargets(correlation: DiscordCorrelation): string[];
    degraded(correlation: DiscordCorrelation, surface: string, reason: string, detail: string): void;
    restored(correlation: DiscordCorrelation, surface: string, reason: string, detail: string): void;
    incident(correlation: DiscordCorrelation, classification: string, error: unknown, message: string, options?: DiscordRecord): void;
}
export declare function appendDiscordCorrelation(embed: DiscordEmbed | undefined, correlation: DiscordCorrelation): DiscordEmbed;
export declare function persistDiscordArtifact(payload: DiscordPayload, correlation: DiscordCorrelation, callbacks: ArtifactCallbacks): void;
export declare function persistDiscordDeliveryReceipt(payload: DiscordPayload, correlation: DiscordCorrelation, level: string, result: DiscordRecord, callbacks: ArtifactCallbacks): void;
export declare function persistDiscordAuditReceipt(payload: DiscordPayload, correlation: DiscordCorrelation, level: string, reason: string, callbacks: ArtifactCallbacks): void;
export {};
